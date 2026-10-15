// HTTP surface used by the widget. Every /v1 route resolves the tenant from the public
// site key and rejects requests whose Origin is not on that tenant's allowlist.
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import type { Limits } from "./config.ts";
import { RateLimiter, TokenBudget } from "./limits.ts";
import { log } from "./log.ts";
import type { Mailer } from "./mailer.ts";
import type { ChatModel } from "./model.ts";
import { buildMessages, buildSystem } from "./prompt.ts";
import { relevantHits, type Hit, type KnowledgeBase } from "./retrieval.ts";
import type { Conversation, ConversationStore, Source } from "./store.ts";
import { normalizeOrigin, publicSettings, type Tenant, type TenantRegistry } from "./tenants.ts";
import type { Lang } from "./text.ts";

export interface AppDeps {
  tenants: TenantRegistry;
  knowledge: KnowledgeBase;
  store: ConversationStore;
  model: ChatModel;
  mailer: Mailer;
  limits: Limits;
  clientIp: (c: Context) => string;
  now?: () => number;
  /** Called when the widget loads its config on an allowed site. */
  onWidgetSeen?: (tenant: Tenant, origin: string) => void;
  /** Extra fields for /health (no secrets: the status page shows them publicly). */
  health?: () => Record<string, unknown>;
}

type Env = { Variables: { tenant: Tenant; origin: string } };

/** Error codes the widget maps to localized text. */
type ErrorCode =
  | "bad_request"
  | "unknown_site"
  | "origin_not_allowed"
  | "rate_limited"
  | "budget_exhausted"
  | "message_too_long"
  | "conversation_full"
  | "not_found"
  | "upstream"
  | "refused";

const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[\d\s().-]{7,40}$/;

export function createApp(deps: AppDeps) {
  const { tenants, knowledge, store, model, mailer, limits } = deps;
  const now = deps.now ?? Date.now;
  const ipLimiter = new RateLimiter(limits.ipMessagesPerMinute, 60_000, now);
  const tenantLimiter = new RateLimiter(limits.tenantMessagesPerMinute, 60_000, now);
  const handoffLimiter = new RateLimiter(limits.handoffsPerHour, 3_600_000, now);
  const budget = new TokenBudget(now);

  const app = new Hono<Env>();

  const startedAt = now();
  app.get("/health", (c) =>
    c.json({ ok: true, uptimeSeconds: Math.round((now() - startedAt) / 1000), ...deps.health?.() }, 200, { "Cache-Control": "no-store" }),
  );

  // Preflights carry no site key, so they pass for any origin some tenant allows;
  // the real request is then checked against its own tenant.
  app.options("/v1/*", (c) => {
    const origin = c.req.header("origin");
    if (!origin || !tenants.isKnownOrigin(origin)) return c.body(null, 403);
    return c.body(null, 204, {
      "Access-Control-Allow-Origin": normalizeOrigin(origin)!,
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, x-apex-site-key",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    });
  });

  app.use("/v1/*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: "bad_request" }, 413) }));

  app.use("/v1/*", async (c, next) => {
    const tenant = tenants.findBySiteKey(c.req.header("x-apex-site-key") ?? c.req.query("site_key"));
    if (!tenant) return c.json({ error: "unknown_site" satisfies ErrorCode }, 401);
    const origin = requestOrigin(c);
    if (!origin || !tenant.allowedOrigins.includes(origin)) {
      log("warn", "origin rejected", { tenant: tenant.id, origin });
      return c.json({ error: "origin_not_allowed" satisfies ErrorCode }, 403);
    }
    c.set("tenant", tenant);
    c.set("origin", origin);
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Expose-Headers", "Retry-After");
    c.header("Vary", "Origin");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Cache-Control", "no-store");
    await next();
  });

  const fail = (c: Context<Env>, code: ErrorCode, status: 400 | 404 | 409 | 413 | 429, retryAfter?: number) => {
    if (retryAfter) c.header("Retry-After", String(retryAfter));
    return c.json({ error: code }, status);
  };

  app.get("/v1/widget/config", (c) => {
    deps.onWidgetSeen?.(c.get("tenant"), c.get("origin"));
    return c.json(publicSettings(c.get("tenant")));
  });

  app.post("/v1/chat", async (c) => {
    const tenant = c.get("tenant");
    const body = await readJson(c);
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) return fail(c, "bad_request", 400);
    if (message.length > (tenant.limits?.maxMessageChars ?? limits.maxMessageChars)) return fail(c, "message_too_long", 413);

    const ip = deps.clientIp(c);
    // a tenant's own per-visitor limit is counted under its own key
    const ipCheck = tenant.limits?.ipMessagesPerMinute
      ? ipLimiter.hit(`ip:${tenant.id}:${ip}`, tenant.limits.ipMessagesPerMinute)
      : ipLimiter.hit(`ip:${ip}`);
    for (const check of [ipCheck, tenantLimiter.hit(`tenant:${tenant.id}`)]) {
      if (!check.ok) return fail(c, "rate_limited", 429, check.retryAfter);
    }
    if (budget.usedToday(tenant.id) >= tenant.dailyTokenBudget) {
      log("warn", "daily token budget exhausted", { tenant: tenant.id });
      return fail(c, "budget_exhausted", 429);
    }

    let conversation: Conversation | undefined;
    if (typeof body.conversationId === "string") conversation = await store.getOrLoad(tenant.id, body.conversationId);
    conversation ??= store.create(tenant.id, c.get("origin"));
    if (conversation.messages.length >= limits.maxConversationMessages) return fail(c, "conversation_full", 409);

    const historyCount = tenant.limits?.historyMessages ?? limits.historyMessages;
    const history = historyCount > 0 ? conversation.messages.slice(-historyCount) : [];
    const previousQuestion = [...conversation.messages].reverse().find((m) => m.role === "user")?.content;
    const query = [{ text: message, weight: 1 }];
    if (previousQuestion) query.push({ text: previousQuestion, weight: 0.5 });
    const ranked = knowledge.search(tenant.id, query, limits.retrievalTopK);
    const hits = relevantHits(ranked, limits.minRetrievalScore, tenant.settings.confidence);

    const request = { system: buildSystem(tenant), messages: buildMessages(history, message, hits), model: tenant.settings.model };
    const userMessage = store.append(conversation, { role: "user", content: message });
    const conv = conversation;

    return streamSSE(c, async (stream) => {
      const abort = new AbortController();
      stream.onAbort(() => abort.abort());
      await stream.writeSSE({ event: "meta", data: JSON.stringify({ conversationId: conv.id, messageId: userMessage.id }) });

      let answer = "";
      try {
        for await (const event of model.stream({ ...request, signal: abort.signal })) {
          if (event.type === "text") {
            answer += event.text;
            await stream.writeSSE({ event: "delta", data: JSON.stringify({ text: event.text }) });
            continue;
          }
          budget.record(tenant.id, event.inputTokens + event.outputTokens);
          if (event.refused) {
            log("warn", "model refused", { tenant: tenant.id, conversation: conv.id });
            await stream.writeSSE({ event: "error", data: JSON.stringify({ code: "refused" satisfies ErrorCode }) });
            return;
          }
          if (event.truncated) log("warn", "answer truncated at max_tokens", { tenant: tenant.id });
        }
      } catch (error) {
        if (abort.signal.aborted) return;
        log("error", "model stream failed", { tenant: tenant.id, conversation: conv.id, error });
        await stream.writeSSE({ event: "error", data: JSON.stringify({ code: "upstream" satisfies ErrorCode }) });
        return;
      }

      const unanswered = hits.length === 0;
      const sources = uniqueSources(hits);
      const reply = store.append(conv, { role: "assistant", content: answer, sources, unanswered });
      if (unanswered) log("info", "unanswered question", { tenant: tenant.id, question: message });
      const offerHandoff = unanswered && tenant.settings.handoffEnabled !== false && tenant.settings.offerHandoffWhenUnsure !== false;
      await stream.writeSSE({
        event: "done",
        data: JSON.stringify({ messageId: reply.id, sources, handoff: offerHandoff }),
      });
    });
  });

  app.post("/v1/feedback", async (c) => {
    const body = await readJson(c);
    const { conversationId, messageId, rating } = body ?? {};
    if (typeof conversationId !== "string" || typeof messageId !== "string" || (rating !== "up" && rating !== "down")) {
      return fail(c, "bad_request", 400);
    }
    const conversation = await store.getOrLoad(c.get("tenant").id, conversationId);
    if (!conversation || !store.setFeedback(conversation, messageId, rating)) return fail(c, "not_found", 404);
    return c.json({ ok: true });
  });

  app.post("/v1/handoff", async (c) => {
    const tenant = c.get("tenant");
    if (tenant.settings.handoffEnabled === false || !tenant.handoffEmail) return fail(c, "not_found", 404);
    const body = await readJson(c);
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
    const note = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) : "";
    if (email.length > 254 || !EMAIL.test(email)) return fail(c, "bad_request", 400);

    const limit = handoffLimiter.hit(`handoff:${deps.clientIp(c)}`);
    if (!limit.ok) return fail(c, "rate_limited", 429, limit.retryAfter);

    const conversation = typeof body.conversationId === "string" ? await store.getOrLoad(tenant.id, body.conversationId) : undefined;
    const lang = tenant.settings.defaultLang;
    await mailer.send({
      to: tenant.handoffEmail,
      replyTo: email,
      subject: HANDOFF_SUBJECT[lang](tenant.name),
      text: handoffBody(lang, { email, name, note, phone: conversation?.visitor?.phone ?? "", conversation }),
    });
    if (conversation) store.markHandoff(conversation);
    return c.json({ ok: true });
  });

  // Lead form shown before the chat. Attaches the contact to a (new) conversation and
  // tells the team, so a visitor who leaves without asking anything is still a lead.
  app.post("/v1/lead", async (c) => {
    const tenant = c.get("tenant");
    const body = await readJson(c);
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim().slice(0, 40) : "";
    if (email.length > 254 || !EMAIL.test(email)) return fail(c, "bad_request", 400);
    if (phone && !PHONE.test(phone)) return fail(c, "bad_request", 400);

    const limit = handoffLimiter.hit(`lead:${deps.clientIp(c)}`);
    if (!limit.ok) return fail(c, "rate_limited", 429, limit.retryAfter);

    let conversation: Conversation | undefined;
    if (typeof body.conversationId === "string") conversation = await store.getOrLoad(tenant.id, body.conversationId);
    conversation ??= store.create(tenant.id, c.get("origin"));
    store.setVisitor(conversation, { email, ...(name ? { name } : {}), ...(phone ? { phone } : {}) });

    if (tenant.handoffEmail) {
      const lang = tenant.settings.defaultLang;
      await mailer.send({
        to: tenant.handoffEmail,
        replyTo: email,
        subject: LEAD_SUBJECT[lang](tenant.name),
        text: leadBody(lang, { email, name, phone }),
      });
    }
    return c.json({ conversationId: conversation.id });
  });

  app.get("/v1/conversations/:id", async (c) => {
    const conversation = await store.getOrLoad(c.get("tenant").id, c.req.param("id"));
    if (!conversation) return fail(c, "not_found", 404);
    return c.json({
      id: conversation.id,
      messages: conversation.messages.map(({ id, role, content, sources, feedback }) => ({ id, role, content, sources, feedback })),
    });
  });

  // KVKK/GDPR: visitors can erase their conversation.
  app.delete("/v1/conversations/:id", async (c) => {
    if (!(await store.delete(c.get("tenant").id, c.req.param("id")))) return fail(c, "not_found", 404);
    return c.body(null, 204);
  });

  return app;
}

function requestOrigin(c: Context): string | null {
  const origin = c.req.header("origin");
  if (origin && origin !== "null") return normalizeOrigin(origin);
  // Same-origin GETs omit Origin; fall back to the Referer's origin.
  const referer = c.req.header("referer");
  return referer ? normalizeOrigin(referer) : null;
}

async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function uniqueSources(hits: Hit[]): Source[] {
  const seen = new Map<string, Source>();
  // pasted text sources have no page to link to
  for (const { chunk } of hits) if (chunk.url && !seen.has(chunk.url)) seen.set(chunk.url, { url: chunk.url, title: chunk.title });
  return [...seen.values()].slice(0, 3);
}

const HANDOFF_SUBJECT: Record<Lang, (site: string) => string> = {
  tr: (site) => `[Apex Bot] ${site}: ziyaretçi bir insanla görüşmek istiyor`,
  en: (site) => `[Apex Bot] ${site}: a visitor asked to talk to a human`,
};

const LEAD_SUBJECT: Record<Lang, (site: string) => string> = {
  tr: (site) => `[Apex Bot] ${site}: yeni potansiyel müşteri`,
  en: (site) => `[Apex Bot] ${site}: new lead from the chat`,
};

function leadBody(lang: Lang, { email, name, phone }: { email: string; name: string; phone: string }): string {
  const t =
    lang === "tr"
      ? { intro: "Bir ziyaretçi sohbete başlamadan önce iletişim bilgilerini bıraktı.", name: "Ad", email: "E-posta", phone: "Telefon", reply: "Bu e-postayı yanıtladığınızda ziyaretçiye ulaşır." }
      : { intro: "A visitor left their contact details before starting a chat.", name: "Name", email: "Email", phone: "Phone", reply: "Replying to this email reaches the visitor." };
  return [t.intro, "", `${t.name}: ${name || "-"}`, `${t.email}: ${email}`, `${t.phone}: ${phone || "-"}`, "", t.reply].join("\n");
}

function handoffBody(
  lang: Lang,
  { email, name, note, phone, conversation }: { email: string; name: string; note: string; phone: string; conversation?: Conversation },
): string {
  const t =
    lang === "tr"
      ? { intro: "Sohbet widget'ından bir ziyaretçi iletişim talebi gönderdi.", name: "Ad", email: "E-posta", phone: "Telefon", note: "Mesaj", transcript: "Konuşma", visitor: "Ziyaretçi", bot: "Asistan", none: "(Konuşma kaydı yok)", reply: "Bu e-postayı yanıtladığınızda ziyaretçiye ulaşır." }
      : { intro: "A visitor sent a contact request from the chat widget.", name: "Name", email: "Email", phone: "Phone", note: "Message", transcript: "Conversation", visitor: "Visitor", bot: "Assistant", none: "(No conversation)", reply: "Replying to this email reaches the visitor." };
  const lines = [t.intro, "", `${t.name}: ${name || "-"}`, `${t.email}: ${email}`];
  if (phone) lines.push(`${t.phone}: ${phone}`);
  lines.push(`${t.note}: ${note || "-"}`, "", `${t.transcript}:`);
  const messages = conversation?.messages.slice(-30) ?? [];
  if (messages.length === 0) lines.push(t.none);
  for (const m of messages) lines.push(`${m.role === "user" ? t.visitor : t.bot}: ${m.content}`, "");
  lines.push("", t.reply);
  return lines.join("\n");
}

