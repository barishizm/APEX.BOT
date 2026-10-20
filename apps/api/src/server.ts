// Node entry point: loads tenants and their knowledge from data/, serves the API,
// and in development also serves the widget bundle and a demo page.
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { isIP } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { createEmbedder } from "@apex/knowledge/embed";
import { FEATURE_FLAGS, type FeatureFlag } from "@apex/db/flags";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { log } from "./log.ts";
import { maskPII } from "./pii.ts";
import { mailerFromEnv, type MailFailure } from "./mailer.ts";
import { startBotSync, type BotSync } from "./bot-sync.ts";
import { ChunkIndexer, QueryEmbedder, memoryVectorStore, type VectorStore } from "./embeddings.ts";
import { ClaudeChatModel, EchoChatModel, GeminiChatModel, ModelRouter, OpenAIChatModel, type ChatModel } from "./model.ts";
import { KnowledgeBase, type ChunkInput } from "./retrieval.ts";
import { postgresPersistence } from "./persistence.ts";
import type { ReplyUsageStore, TokenUsageStore } from "./limits.ts";
import { ConversationStore } from "./store.ts";
import { TenantRegistry, type Tenant } from "./tenants.ts";
import { ClaudeTopicLabeler, startTopicLabeler } from "./topics.ts";
import { WIDGET_CACHE_CONTROL, widgetHandler } from "./widget-bundle.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = loadConfig();
const version = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version?: string }).version ?? null;

// Environment variables the API reads; /health/details reports which are set, never a value
const ENV_KEYS = [
  "DATABASE_URL",
  "DATABASE_SSL",
  "DATABASE_CA_CERT",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_BASE_URL",
  "RESEND_API_KEY",
  "MAIL_FROM",
  "TRUST_PROXY",
  "APEX_MODEL",
  "APEX_EFFORT",
  "APEX_FALLBACKS",
  "APEX_PROVIDER_TIMEOUT_MS",
  "APEX_EMBEDDINGS",
  "APEX_GEMINI_TIER",
  "APEX_TOPIC_MODEL",
  "APEX_DEMO_TENANT",
  "APEX_HEALTH_TOKEN",
] as const;

// data/tenants.json is the local demo tenant (localhost origins, large token budget). In production
// anyone could call it with a forged Origin and spend tokens, so it is only loaded outside production
// (or when APEX_DEMO_TENANT=1 asks for it explicitly).
const loadDemoTenants = process.env.NODE_ENV !== "production" || process.env.APEX_DEMO_TENANT === "1";
const tenants = new TenantRegistry(loadDemoTenants ? (JSON.parse(readFileSync(join(root, "data/tenants.json"), "utf8")) as Tenant[]) : []);
if (!loadDemoTenants) log("info", "demo tenant not loaded (production)");
const knowledge = new KnowledgeBase();

// Hybrid search (docs/adr/0002-hybrid-retrieval.md): with APEX_EMBEDDINGS set, chunks are embedded
// in the background and visitor messages on the chat path. A missing key leaves search lexical
// rather than stopping the API.
let queryEmbedder: QueryEmbedder | undefined;
let indexerFor: ((store: VectorStore) => ChunkIndexer) | undefined;
if (config.embeddings) {
  const keys = { openai: process.env.OPENAI_API_KEY, gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY };
  try {
    // the chat path never retries (a slow answer is worse than a lexical one); indexing waits out rate limits
    queryEmbedder = new QueryEmbedder(createEmbedder(config.embeddings, keys), { timeoutMs: config.embeddingTimeoutMs });
    const bulk = createEmbedder(config.embeddings, keys, { retries: 6, batchSize: 50 });
    indexerFor = (store) => new ChunkIndexer(knowledge, bulk, store);
    log("info", "hybrid search on", { embedder: config.embeddings });
  } catch (error) {
    log("error", "APEX_EMBEDDINGS is set but can't be used; search stays lexical", { error });
  }
}

const demoIndexer = indexerFor?.(memoryVectorStore());
for (const tenant of tenants.all()) {
  const file = join(root, "data/knowledge", `${tenant.id}.json`);
  const chunks = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as ChunkInput[]) : [];
  const generation = knowledge.load(tenant.id, chunks);
  log("info", "knowledge loaded", { tenant: tenant.id, chunks: chunks.length });
  void demoIndexer?.index(tenant.id, generation, chunks);
}

// Dashboard bots, their knowledge and their conversations live in the database (same
// DATABASE_URL as the web app); without one, only data/tenants.json (outside production) is served, from memory.
let botSync: BotSync | null = null;
let onWidgetSeen: ((tenant: Tenant, origin: string) => void) | undefined;
let featureEnabled: ((flag: FeatureFlag, tenant: Tenant) => Promise<boolean>) | undefined;
let tokenUsage: TokenUsageStore | undefined;
let replyUsage: ReplyUsageStore | undefined;
let indexer: ChunkIndexer | undefined;
let topicLabeler: ReturnType<typeof startTopicLabeler> | undefined;
let onMailFailure: ((failure: MailFailure) => void) | undefined;
// the hourly retention sweep, for /health/details (its runs are also kept in app.job_runs)
let lastSweep: { at: string; ok: boolean; deleted: number; error: string | null } | null = null;
let store = new ConversationStore();
if (process.env.DATABASE_URL) {
  const {
    addReplyUsage,
    addTokenUsage,
    createDbFromEnv,
    featureEnabled: flagOn,
    loadEmbeddings,
    missingMigrations,
    finishJobRun,
    pruneEmbeddings,
    recordEmailFailure,
    reportApiRuntime,
    RETENTION_SWEEP_JOB,
    startJobRun,
    saveEmbeddings,
    tokensUsedOn,
    recordWidgetSeen,
    replyUsageFifths,
    saveTopics,
    sweepConversations,
    topicVocabulary,
    unlabeledQuestions,
  } = await import("@apex/db");
  const db = createDbFromEnv();
  const missing: string[] = await missingMigrations(db).catch((error) => {
    log("error", "database not reachable at startup", { error });
    return [];
  });
  if (missing.length) log("error", "the database needs an update: run npm run db:migrate", { missing });
  // only dashboard bots have a row to count against; the local demo tenant stays in memory.
  // Input and output are stored apart from migration 0028 on, for the admin cost estimate.
  const split = !missing.includes("0028_token_usage_split.sql");
  tokenUsage = {
    load: (id, day) => (tenants.findById(id)?.managed ? tokensUsedOn(db, id, day) : Promise.resolve(0)),
    add: (id, day, usage) => (tenants.findById(id)?.managed ? addTokenUsage(db, id, day, split ? usage : usage.input + usage.output) : Promise.resolve()),
  };
  // Monthly AI replies per workspace (ADR 0003), from migration 0035 on; one upsert per answer
  if (!missing.includes("0035_billing.sql")) {
    replyUsage = {
      load: (organizationId, periodStart) => replyUsageFifths(db, organizationId, periodStart),
      add: (organizationId, periodStart, fifths, overage) => addReplyUsage(db, organizationId, periodStart, fifths, overage),
    };
  }
  // What this API runs with, for /admin/usage: whether each key is set (never its value) and the token ceiling
  reportApiRuntime(db, {
    keys: {
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      GEMINI_API_KEY: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    },
    embeddings: queryEmbedder ? config.embeddings : null,
    geminiTier: config.geminiTier,
    maxDailyTokensPerTenant: config.limits.maxDailyTokensPerTenant,
    defaultModel: config.model,
    topicModel: config.topicModel,
  }).catch((error) => log("warn", "couldn't report the API's runtime settings", { error }));
  const vectors: VectorStore = {
    load: (id, model, hashes) => loadEmbeddings(db, id, model, hashes),
    save: (id, model, rows) => saveEmbeddings(db, id, model, rows),
    prune: (id, model, keep) => pruneEmbeddings(db, id, model, keep),
  };
  indexer = indexerFor?.(vectors);
  // from migration 0036 on, websites past a plan's number are paused (ADR 0003 (e))
  const planLimits = !missing.includes("0036_plan_limits.sql");
  botSync = startBotSync(db, tenants, knowledge, undefined, indexer, { siteRanks: planLimits });
  log("info", "syncing dashboard bots from the database");

  store = new ConversationStore({
    // before migration 0016 the conversations table has no context column
    persistence: postgresPersistence(db, {
      context: !missing.includes("0016_conversation_context.sql"),
      // each new conversation keeps its plan's longest retention, so a downgrade never shortens older ones
      ...(planLimits ? { retentionCap: (id: string) => tenants.findById(id)?.retentionCapDays ?? null } : {}),
    }),
    // paused sites too: a visitor may still erase their conversation there
    persists: (tenantId) => tenants.findSite(tenantId)?.managed === true,
    onError: (error, conversation) => log("error", "couldn't save conversation", { conversation, error }),
  });
  // Each sweep is recorded in app.job_runs (from migration 0026 on) for /admin/system
  const recordRuns = !missing.includes("0026_job_runs.sql");
  const sweep = async () => {
    const runId = recordRuns ? await startJobRun(db, RETENTION_SWEEP_JOB).catch(() => null) : null;
    try {
      const n = await sweepConversations(db, { retentionCaps: planLimits });
      if (n) log("info", "expired conversations deleted", { count: n });
      lastSweep = { at: new Date().toISOString(), ok: true, deleted: n, error: null };
      if (runId) await finishJobRun(db, runId, { ok: true, result: { deleted: n } }).catch(() => {});
    } catch (error) {
      log("error", "conversation sweep failed", { error });
      const message = maskPII(error instanceof Error ? error.message : String(error)).slice(0, 300);
      lastSweep = { at: new Date().toISOString(), ok: false, deleted: 0, error: message };
      if (runId) await finishJobRun(db, runId, { ok: false, error: message }).catch(() => {});
    }
  };
  setInterval(() => void sweep(), 3_600_000).unref();

  // Mail the provider refused, for /admin/system (masked on the way in); from migration 0032 on
  if (!missing.includes("0032_email_failures.sql")) {
    onMailFailure = (f) =>
      void recordEmailFailure(db, { source: "api", kind: f.kind, to: f.to, status: f.status, error: f.error }).catch((error) =>
        log("warn", "couldn't record an email failure", { error }),
      );
  }

  // "Top topics" on the analytics page
  if (config.topicModel && !missing.includes("0015_message_topics.sql")) {
    topicLabeler = startTopicLabeler(
      { unlabeled: (limit) => unlabeledQuestions(db, limit), vocabulary: (id) => topicVocabulary(db, id), save: (id, labels) => saveTopics(db, id, labels) },
      new ClaudeTopicLabeler(config.topicModel),
    );
    log("info", "topic labeling on", { model: config.topicModel });
  }

  // Feature flags staff set in /admin/settings, read through a 30-second cache. Should the database
  // be unreachable, a flag keeps its default rather than failing the chat.
  featureEnabled = (flag, tenant) =>
    tenant.managed
      ? flagOn(db, flag, tenant.organizationId).catch((error) => {
          log("warn", "couldn't read feature flags; using the default", { flag, error });
          return FEATURE_FLAGS[flag].default;
        })
      : Promise.resolve(FEATURE_FLAGS[flag].default);

  // "Live on your site" in the dashboard; at most one write per bot every few minutes
  const lastWrite = new Map<string, number>();
  onWidgetSeen = (tenant, origin) => {
    if (!tenant.managed || Date.now() - (lastWrite.get(tenant.id) ?? 0) < 5 * 60_000) return;
    lastWrite.set(tenant.id, Date.now());
    recordWidgetSeen(db, tenant.id, origin).catch((error) => log("warn", "couldn't record widget activity", { tenant: tenant.id, error }));
  };
}
setInterval(() => store.sweep((id) => tenants.findSite(id)?.retentionDays ?? 30), 3_600_000).unref();

// APEX_MODEL=echo answers every tenant locally; otherwise each tenant's own model choice is
// routed to its provider, and tenants without one use APEX_MODEL on Claude.
function chatModel(): ChatModel {
  if (config.model === "echo") return new EchoChatModel();
  const claude = new ClaudeChatModel(config);
  return new ModelRouter({ anthropic: claude, openai: new OpenAIChatModel(), google: new GeminiChatModel() }, claude);
}

function clientIp(c: Context): string {
  if (config.trustProxy > 0) {
    // Proxies append the peer they saw, so only the rightmost entries are ours; anything left of
    // them is client-supplied and spoofable. Count trusted hops from the right.
    const hops = (c.req.header("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
    const forwarded = hops[hops.length - config.trustProxy];
    if (forwarded && isIP(forwarded)) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

const app = createApp({
  tenants,
  knowledge,
  embedder: queryEmbedder,
  store,
  model: chatModel(),
  mailer: mailerFromEnv(process.env, (failure) => onMailFailure?.(failure)),
  limits: config.limits,
  clientIp,
  tokenUsage,
  replyUsage,
  onWidgetSeen,
  featureEnabled,
  health: () => ({ botSync: botSync ? botSync.status() : "off", semanticSearch: queryEmbedder ? queryEmbedder.status() : "off" }),
  // /admin/system; the token is shared with the web app (APEX_HEALTH_TOKEN on both)
  healthToken: process.env.APEX_HEALTH_TOKEN || undefined,
  healthDetails: () => ({
    sync: botSync?.details() ?? null,
    indexer: indexer?.stats() ?? null,
    topics: topicLabeler?.status() ?? null,
    retention: lastSweep,
    runtime: {
      nodeEnv: process.env.NODE_ENV ?? null,
      version,
      // Render sets this on every deploy
      commit: process.env.RENDER_GIT_COMMIT ?? null,
      model: config.model,
      embeddings: queryEmbedder ? config.embeddings : null,
      topicModel: config.topicModel,
      env: Object.fromEntries(ENV_KEYS.map((k) => [k, !!process.env[k]])),
    },
  }),
});

// The embed snippet loads the widget from here, behind Cloudflare in production.
const widgetBundle = join(root, "../widget/dist/widget.js");
app.get("/widget.js", widgetHandler(widgetBundle, process.env.NODE_ENV === "production" ? WIDGET_CACHE_CONTROL : "no-cache"));
app.get("/demo", async (c) => c.html(await readFile(join(root, "public/demo.html"), "utf8")));

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  log("info", "apex api listening", { url: `http://localhost:${port}`, demo: `http://localhost:${port}/demo`, model: config.model });
});
