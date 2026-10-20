import { createApp, type AppDeps } from "../src/app.ts";
import { defaultLimits, type Limits } from "../src/config.ts";
import { OutboxMailer } from "../src/mailer.ts";
import type { AnsweredBy, ChatModel, ChatRequest, ModelEvent } from "../src/model.ts";
import { KnowledgeBase } from "../src/retrieval.ts";
import { ConversationStore } from "../src/store.ts";
import { TenantRegistry, type Tenant } from "../src/tenants.ts";

process.env.APEX_SILENT = "1";

export function tenant(id: string, siteKey: string, origin: string): Tenant {
  return {
    id,
    siteKey,
    name: `Site ${id}`,
    allowedOrigins: [origin],
    handoffEmail: `owner@${id}.example`,
    dailyTokenBudget: 1_000_000,
    retentionDays: 30,
    settings: {
      botName: "Apex",
      tone: "friendly",
      defaultLang: "tr",
      primaryColor: "#000000",
      position: "bottom-right",
      greeting: { tr: "Merhaba", en: "Hi", lt: "Sveiki", lv: "Sveiki", et: "Tere" },
      suggestions: { tr: [], en: [], lt: [], lv: [], et: [] },
      blockedTopics: [],
    },
  };
}

export class FakeModel implements ChatModel {
  requests: ChatRequest[] = [];
  reply: string[] = ["Merhaba", ", ", "yardımcı olabilirim."];
  refuse = false;
  fail = false;
  tokens = 100;
  /** The model the end event says answered; absent, the app falls back to the tenant's choice. */
  answeredBy?: AnsweredBy;

  async *stream(request: ChatRequest): AsyncIterable<ModelEvent> {
    this.requests.push(request);
    if (this.fail) throw new Error("upstream down");
    for (const text of this.reply) yield { type: "text", text };
    yield { type: "end", refused: this.refuse, truncated: false, inputTokens: this.tokens, outputTokens: 0, ...(this.answeredBy ? { model: this.answeredBy } : {}) };
  }
}

export const A = { key: "apex_pk_alpha", origin: "https://alpha.example" };
export const B = { key: "apex_pk_beta", origin: "https://beta.example" };

export function setup(overrides: Partial<Limits> = {}, deps: Partial<AppDeps> = {}) {
  // BM25 scores are lower on a two-chunk corpus than on a real site, so the floor is lowered here.
  const limits = { ...defaultLimits, minRetrievalScore: 0.3, ...overrides };
  const tenants = new TenantRegistry([tenant("tn_a", A.key, A.origin), tenant("tn_b", B.key, B.origin)]);
  const knowledge = new KnowledgeBase();
  knowledge.load("tn_a", [
    { url: "https://alpha.example/iade", title: "İade politikası", text: "Açılmamış ürünleri 14 gün içinde iade edebilirsiniz." },
    { url: "https://alpha.example/kargo", title: "Kargo", text: "Kargo 1-3 iş günü sürer, 750 TL üzeri ücretsizdir." },
  ]);
  knowledge.load("tn_b", [{ url: "https://beta.example/secret", title: "Gizli fiyat listesi", text: "Toptan iade fiyatları gizlidir." }]);
  const store = new ConversationStore();
  const model = new FakeModel();
  const mailer = new OutboxMailer();
  const app = createApp({
    tenants,
    knowledge,
    store,
    model,
    mailer,
    limits,
    clientIp: (c) => c.req.header("x-test-ip") ?? "1.1.1.1",
    ...deps,
  });
  return { app, store, model, mailer, knowledge, tenants };
}

export function headers(site: { key: string; origin: string }, extra: Record<string, string> = {}) {
  return { "content-type": "application/json", "x-apex-site-key": site.key, origin: site.origin, ...extra };
}

export interface SSEEvent {
  event: string;
  data: any;
}

export async function readSSE(res: Response): Promise<SSEEvent[]> {
  const text = await res.text();
  const events: SSEEvent[] = [];
  for (const block of text.split("\n\n")) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (data.length) events.push({ event, data: JSON.parse(data.join("\n")) });
  }
  return events;
}
