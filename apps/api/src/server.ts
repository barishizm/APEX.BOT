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
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { log } from "./log.ts";
import { mailerFromEnv } from "./mailer.ts";
import { startBotSync, type BotSync } from "./bot-sync.ts";
import { ChunkIndexer, QueryEmbedder, memoryVectorStore, type VectorStore } from "./embeddings.ts";
import { ClaudeChatModel, EchoChatModel, GeminiChatModel, ModelRouter, OpenAIChatModel, type ChatModel } from "./model.ts";
import { KnowledgeBase, type ChunkInput } from "./retrieval.ts";
import { postgresPersistence } from "./persistence.ts";
import type { TokenUsageStore } from "./limits.ts";
import { ConversationStore } from "./store.ts";
import { TenantRegistry, type Tenant } from "./tenants.ts";
import { ClaudeTopicLabeler, startTopicLabeler } from "./topics.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = loadConfig();

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
let tokenUsage: TokenUsageStore | undefined;
let store = new ConversationStore();
if (process.env.DATABASE_URL) {
  const { addTokenUsage, createDbFromEnv, loadEmbeddings, missingMigrations, pruneEmbeddings, saveEmbeddings, tokensUsedOn, recordWidgetSeen, saveTopics, sweepConversations, topicVocabulary, unlabeledQuestions } =
    await import("@apex/db");
  const db = createDbFromEnv();
  const missing: string[] = await missingMigrations(db).catch((error) => {
    log("error", "database not reachable at startup", { error });
    return [];
  });
  if (missing.length) log("error", "the database needs an update: run npm run db:migrate", { missing });
  // only dashboard bots have a row to count against; the local demo tenant stays in memory
  tokenUsage = {
    load: (id, day) => (tenants.findById(id)?.managed ? tokensUsedOn(db, id, day) : Promise.resolve(0)),
    add: (id, day, tokens) => (tenants.findById(id)?.managed ? addTokenUsage(db, id, day, tokens) : Promise.resolve()),
  };
  const vectors: VectorStore = {
    load: (id, model, hashes) => loadEmbeddings(db, id, model, hashes),
    save: (id, model, rows) => saveEmbeddings(db, id, model, rows),
    prune: (id, model, keep) => pruneEmbeddings(db, id, model, keep),
  };
  botSync = startBotSync(db, tenants, knowledge, undefined, indexerFor?.(vectors));
  log("info", "syncing dashboard bots from the database");

  store = new ConversationStore({
    // before migration 0016 the conversations table has no context column
    persistence: postgresPersistence(db, { context: !missing.includes("0016_conversation_context.sql") }),
    persists: (tenantId) => tenants.findById(tenantId)?.managed === true,
    onError: (error, conversation) => log("error", "couldn't save conversation", { conversation, error }),
  });
  setInterval(() => {
    sweepConversations(db)
      .then((n) => n && log("info", "expired conversations deleted", { count: n }))
      .catch((error) => log("error", "conversation sweep failed", { error }));
  }, 3_600_000).unref();

  // "Top topics" on the analytics page
  if (config.topicModel && !missing.includes("0015_message_topics.sql")) {
    startTopicLabeler(
      { unlabeled: (limit) => unlabeledQuestions(db, limit), vocabulary: (id) => topicVocabulary(db, id), save: (id, labels) => saveTopics(db, id, labels) },
      new ClaudeTopicLabeler(config.topicModel),
    );
    log("info", "topic labeling on", { model: config.topicModel });
  }

  // "Live on your site" in the dashboard; at most one write per bot every few minutes
  const lastWrite = new Map<string, number>();
  onWidgetSeen = (tenant, origin) => {
    if (!tenant.managed || Date.now() - (lastWrite.get(tenant.id) ?? 0) < 5 * 60_000) return;
    lastWrite.set(tenant.id, Date.now());
    recordWidgetSeen(db, tenant.id, origin).catch((error) => log("warn", "couldn't record widget activity", { tenant: tenant.id, error }));
  };
}
setInterval(() => store.sweep((id) => tenants.findById(id)?.retentionDays ?? 30), 3_600_000).unref();

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
  mailer: mailerFromEnv(),
  limits: config.limits,
  clientIp,
  tokenUsage,
  onWidgetSeen,
  health: () => ({ botSync: botSync ? botSync.status() : "off", semanticSearch: queryEmbedder ? queryEmbedder.status() : "off" }),
});

// Development helpers; in production the widget is served from the CDN.
const widgetBundle = join(root, "../widget/dist/widget.js");
app.get("/widget.js", async (c) => {
  if (!existsSync(widgetBundle)) return c.text("Widget not built. Run: npm run build -w @apex/widget", 404);
  return c.body(await readFile(widgetBundle), 200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
  });
});
app.get("/demo", async (c) => c.html(await readFile(join(root, "public/demo.html"), "utf8")));

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  log("info", "apex api listening", { url: `http://localhost:${port}`, demo: `http://localhost:${port}/demo`, model: config.model });
});
