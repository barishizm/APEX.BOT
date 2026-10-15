// Node entry point: loads tenants and their knowledge from data/, serves the API,
// and in development also serves the widget bundle and a demo page.
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { log } from "./log.ts";
import { mailerFromEnv } from "./mailer.ts";
import { startBotSync, type BotSync } from "./bot-sync.ts";
import { ClaudeChatModel, EchoChatModel, GeminiChatModel, ModelRouter, OpenAIChatModel, type ChatModel } from "./model.ts";
import { KnowledgeBase, type ChunkInput } from "./retrieval.ts";
import { postgresPersistence } from "./persistence.ts";
import { ConversationStore } from "./store.ts";
import { TenantRegistry, type Tenant } from "./tenants.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = loadConfig();

const tenants = new TenantRegistry(JSON.parse(readFileSync(join(root, "data/tenants.json"), "utf8")) as Tenant[]);
const knowledge = new KnowledgeBase();
for (const tenant of tenants.all()) {
  const file = join(root, "data/knowledge", `${tenant.id}.json`);
  const chunks = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as ChunkInput[]) : [];
  knowledge.load(tenant.id, chunks);
  log("info", "knowledge loaded", { tenant: tenant.id, chunks: chunks.length });
}

// Dashboard bots, their knowledge and their conversations live in the database (same
// DATABASE_URL as the web app); without one, only data/tenants.json is served, from memory.
let botSync: BotSync | null = null;
let onWidgetSeen: ((tenant: Tenant, origin: string) => void) | undefined;
let store = new ConversationStore();
if (process.env.DATABASE_URL) {
  const { createDbFromEnv, missingMigrations, recordWidgetSeen, sweepConversations } = await import("@apex/db");
  const db = createDbFromEnv();
  const missing = await missingMigrations(db).catch((error) => {
    log("error", "database not reachable at startup", { error });
    return [];
  });
  if (missing.length) log("error", "the database needs an update: run npm run db:migrate", { missing });
  botSync = startBotSync(db, tenants, knowledge);
  log("info", "syncing dashboard bots from the database");

  store = new ConversationStore({
    persistence: postgresPersistence(db),
    persists: (tenantId) => tenants.findById(tenantId)?.managed === true,
    onError: (error, conversation) => log("error", "couldn't save conversation", { conversation, error }),
  });
  setInterval(() => {
    sweepConversations(db)
      .then((n) => n && log("info", "expired conversations deleted", { count: n }))
      .catch((error) => log("error", "conversation sweep failed", { error }));
  }, 3_600_000).unref();

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
  if (config.trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
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
  store,
  model: chatModel(),
  mailer: mailerFromEnv(),
  limits: config.limits,
  clientIp,
  onWidgetSeen,
  health: () => ({ botSync: botSync ? botSync.status() : "off" }),
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
