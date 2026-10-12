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
import { OutboxMailer } from "./mailer.ts";
import { ClaudeChatModel, EchoChatModel } from "./model.ts";
import { KnowledgeBase, type ChunkInput } from "./retrieval.ts";
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

const store = new ConversationStore();
const retention = new Map(tenants.all().map((t) => [t.id, t.retentionDays]));
setInterval(() => store.sweep((id) => retention.get(id) ?? 30), 3_600_000).unref();

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
  model: config.model === "echo" ? new EchoChatModel() : new ClaudeChatModel(config),
  mailer: new OutboxMailer(),
  limits: config.limits,
  clientIp,
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
