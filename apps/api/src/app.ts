// HTTP surface used by the widget. Every /v1 route resolves the tenant from the public
// site key and rejects requests whose Origin is not on that tenant's allowlist.
import { randomInt } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { CHAT_BODY_LIMIT, attachmentNote, parseAttachments } from "./attachments.ts";
import type { Limits } from "./config.ts";
import { RateLimiter, TokenBudget, type TokenUsageStore } from "./limits.ts";
import { log } from "./log.ts";
import type { Mailer } from "./mailer.ts";
import type { ChatModel } from "./model.ts";
import type { QueryEmbedder } from "./embeddings.ts";
import { ReplyMarkerFilter, buildMessages, buildSystem } from "./prompt.ts";
import { DEFAULT_RETRIEVAL, retrieve, semanticQueryTexts, type Hit, type KnowledgeBase } from "./retrieval.ts";
import type { Conversation, ConversationStore, Source } from "./store.ts";
import { normalizeOrigin, publicSettings, type Tenant, type TenantRegistry } from "./tenants.ts";
import type { Lang } from "./text.ts";

export interface AppDeps {
  tenants: TenantRegistry;
  knowledge: KnowledgeBase;
  /** Embeds visitor messages for semantic search; without it (APEX_EMBEDDINGS=off) search is lexical. */
  embedder?: QueryEmbedder;
  store: ConversationStore;
  model: ChatModel;
  mailer: Mailer;
  limits: Limits;
  clientIp: (c: Context) => string;
  now?: () => number;
  /** Persists daily token counts so the budget survives restarts. */
  tokenUsage?: TokenUsageStore;
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
  | "refused"
  | "attachment_too_large"
  | "unsupported_file";

// No whitespace or RFC 5322 "specials" (<>()[]\,;:"), so an address can't smuggle in a display
// name, a second recipient or a header when a mail provider parses it.
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const PHONE = /^\+?[\d\s().-]{7,40}$/;
// Conversation and message ids are server-made v4 UUIDs; anything else is rejected before any lookup.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// C0 controls (except tab and newline), DEL and C1 controls (NEL is a line break to some mail
// software): Postgres rejects NUL in text, and none belong in a message or a mail.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
// Ticket references skip look-alike characters (0/O, 1/I) so they can be read out loud.
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A client-supplied string field: trimmed, capped, free of control characters. */
function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(CONTROL, "").trim().slice(0, max) : "";
}

/** A conversation or message id from a body or path, or undefined when it can't be one of ours. */
export function idOf(value: unknown): string | undefined {
  return typeof value === "string" && UUID.test(value) ? value : undefined;
}

/** A short reference for a hand-off request, e.g. "K7Q2-M9XA". */
export function ticketRef(): string {
  let ref = "";
  for (let i = 0; i < 8; i++) ref += (i === 4 ? "-" : "") + REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return ref;
}

/** An email address a visitor typed: plain characters only, so it can never break a mail header. */
function email(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const address = value.trim();
  CONTROL.lastIndex = 0;
  return address.length <= 254 && EMAIL.test(address) && !CONTROL.test(address) ? address : null;
}

export function createApp(deps: AppDeps) {
  const { tenants, knowledge, store, model, mailer, limits } = deps;
  const now = deps.now ?? Date.now;
  const ipLimiter = new RateLimiter(limits.ipMessagesPerMinute, 60_000, now);
  const tenantLimiter = new RateLimiter(limits.tenantMessagesPerMinute, 60_000, now);
  const handoffLimiter = new RateLimiter(limits.handoffsPerHour, 3_600_000, now);
  const lookupLimiter = new RateLimiter(limits.lookupsPerMinute, 60_000, now);
  const tenantMailHourly = new RateLimiter(limits.mailsPerTenantPerHour, 3_600_000, now);
  const tenantMailDaily = new RateLimiter(limits.mailsPerTenantPerDay, 86_400_000, now);
  const recipientMail = new RateLimiter(limits.mailsPerRecipientPerHour, 3_600_000, now);
  const budget = new TokenBudget(now, deps.tokenUsage, (error) => log("warn", "token usage store failed", { error }));

  /** Caps the mail one tenant, and one recipient, can cause: the IP limit alone is easy to dodge. */
  const mailAllowed = (tenant: Tenant) => {
    for (const check of [
      tenantMailHourly.hit(`mail:${tenant.id}`),
      tenantMailDaily.hit(`mail:${tenant.id}`),
      recipientMail.hit(`rcpt:${tenant.handoffEmail.toLowerCase()}`),
    ]) {
      if (!check.ok) return check;
    }
    return { ok: true as const };
  };

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

  // Chat messages may carry images; every other body is a few fields
  const smallBody = bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: "bad_request" }, 413) });
  const chatBody = bodyLimit({ maxSize: CHAT_BODY_LIMIT, onError: (c) => c.json({ error: "attachment_too_large" }, 413) });
  app.use("/v1/*", (c, next) => (c.req.path === "/v1/chat" ? chatBody(c, next) : smallBody(c, next)));

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

  /** Rate limit for routes addressed by a conversation id. */
  const lookup = (c: Context<Env>) => {
    const check = lookupLimiter.hit(`lookup:${deps.clientIp(c)}`);
    return check.ok ? null : fail(c, "rate_limited", 429, check.retryAfter);
  };

  app.get("/v1/widget/config", (c) => {
    deps.onWidgetSeen?.(c.get("tenant"), c.get("origin"));
    return c.json(publicSettings(c.get("tenant")));
  });

  app.post("/v1/chat", async (c) => {
    const tenant = c.get("tenant");
    const body = await readJson(c);
    const message = typeof body.message === "string" ? body.message.replace(CONTROL, "").trim() : "";
    const attachments = parseAttachments(body.attachments);
    if ("error" in attachments) return fail(c, attachments.error, attachments.error === "attachment_too_large" ? 413 : 400);
    // the dashboard's "Visitors can send files" switch is enforced here, not just in the widget
    if (attachments.length && tenant.settings.ui?.behavior.attachments === false) return fail(c, "unsupported_file", 400);
    if (!message && !attachments.length) return fail(c, "bad_request", 400);
    if (message.length > (tenant.limits?.maxMessageChars ?? limits.maxMessageChars)) return fail(c, "message_too_long", 413);

    const ip = deps.clientIp(c);
    // a tenant's own per-visitor limit is counted under its own key
    const ipCheck = tenant.limits?.ipMessagesPerMinute
      ? ipLimiter.hit(`ip:${tenant.id}:${ip}`, tenant.limits.ipMessagesPerMinute)
      : ipLimiter.hit(`ip:${ip}`);
    for (const check of [ipCheck, tenantLimiter.hit(`tenant:${tenant.id}`)]) {
      if (!check.ok) return fail(c, "rate_limited", 429, check.retryAfter);
    }
    await budget.load(tenant.id);
    if (budget.usedToday(tenant.id) >= Math.min(tenant.dailyTokenBudget, limits.maxDailyTokensPerTenant)) {
      log("warn", "daily token budget exhausted", { tenant: tenant.id });
      return fail(c, "budget_exhausted", 429);
    }

    const conversationId = idOf(body.conversationId);
    let conversation = conversationId ? await store.getOrLoad(tenant.id, conversationId) : undefined;
    conversation ??= store.create(tenant.id, c.get("origin"));
    if (conversation.messages.length >= limits.maxConversationMessages) return fail(c, "conversation_full", 409);

    const historyCount = tenant.limits?.historyMessages ?? limits.historyMessages;
    const history = historyCount > 0 ? conversation.messages.slice(-historyCount) : [];
    const previousQuestion = [...conversation.messages].reverse().find((m) => m.role === "user")?.content;
    const queryText = message || attachments.map((a) => a.name).join(" ");
    // only tenants whose chunks are embedded pay for a query embedding
    const semantic =
      deps.embedder && knowledge.coverage(tenant.id).embedder === deps.embedder.id
        ? await deps.embedder.embed(tenant.id, semanticQueryTexts(queryText, previousQuestion))
        : null;
    const { hits } = retrieve(
      knowledge,
      tenant.id,
      { message: queryText, previous: previousQuestion, semantic },
      { ...DEFAULT_RETRIEVAL, topK: limits.retrievalTopK, minScore: limits.minRetrievalScore, confidence: tenant.settings.confidence ?? "balanced" },
    );

    const request = { system: buildSystem(tenant), messages: buildMessages(history, message, hits, attachments), model: tenant.settings.model };
    // the transcript keeps which files were sent, not the files
    const userMessage = store.append(conversation, { role: "user", content: [message, attachmentNote(attachments)].filter(Boolean).join("\n\n") });
    const conv = conversation;

    return streamSSE(c, async (stream) => {
      const abort = new AbortController();
      stream.onAbort(() => abort.abort());
      await stream.writeSSE({ event: "meta", data: JSON.stringify({ conversationId: conv.id, messageId: userMessage.id }) });

      let answer = "";
      const markers = new ReplyMarkerFilter();
      const emit = async (text: string) => {
        if (!text) return;
        answer += text;
        await stream.writeSSE({ event: "delta", data: JSON.stringify({ text }) });
      };
      try {
        for await (const event of model.stream({ ...request, signal: abort.signal })) {
          if (event.type === "text") {
            await emit(markers.push(event.text));
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

      await emit(markers.flush());
      // Retrieval passes whatever is close to the message; only the model knows whether it answered,
      // and from which excerpts. So the gap is reported by its marker, and the sources are the pages
      // it cited (none for a greeting, even though excerpts were retrieved).
      const unanswered = markers.noAnswer;
      const sources = unanswered ? [] : uniqueSources(markers.used.flatMap((n) => (hits[n - 1] ? [hits[n - 1]] : [])));
      const reply = store.append(conv, { role: "assistant", content: answer.trimEnd(), sources, unanswered });
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
    const { rating } = body;
    const conversationId = idOf(body.conversationId);
    const messageId = idOf(body.messageId);
    if (!conversationId || !messageId || (rating !== "up" && rating !== "down")) return fail(c, "bad_request", 400);
    const limited = lookup(c);
    if (limited) return limited;
    const conversation = await store.getOrLoad(c.get("tenant").id, conversationId);
    if (!conversation || !store.setFeedback(conversation, messageId, rating)) return fail(c, "not_found", 404);
    return c.json({ ok: true });
  });

  app.post("/v1/handoff", async (c) => {
    const tenant = c.get("tenant");
    if (tenant.settings.handoffEnabled === false || !tenant.handoffEmail) return fail(c, "not_found", 404);
    const body = await readJson(c);
    const address = email(body.email);
    const name = text(body.name, 100);
    const note = text(body.message, 2000);
    if (!address) return fail(c, "bad_request", 400);

    const limit = handoffLimiter.hit(`handoff:${deps.clientIp(c)}`);
    if (!limit.ok) return fail(c, "rate_limited", 429, limit.retryAfter);
    const mailLimit = mailAllowed(tenant);
    if (!mailLimit.ok) {
      log("warn", "handoff mail cap reached", { tenant: tenant.id });
      return fail(c, "rate_limited", 429, mailLimit.retryAfter);
    }

    const conversationId = idOf(body.conversationId);
    const conversation = conversationId ? await store.getOrLoad(tenant.id, conversationId) : undefined;
    const lang = tenant.settings.defaultLang;
    // The visitor sees the same reference in the widget, so either side can quote it
    const ref = ticketRef();
    await mailer.send({
      to: tenant.handoffEmail,
      replyTo: address,
      subject: `${HANDOFF_SUBJECT[lang](tenant.name)} [#${ref}]`,
      text: handoffBody(lang, { ref, email: address, name, note, phone: conversation?.visitor?.phone ?? "", conversation }),
    });
    if (conversation) store.markHandoff(conversation);
    return c.json({ ok: true, ticket: { id: ref, createdAt: new Date(now()).toISOString() } });
  });

  // Lead form shown before the chat. Attaches the contact to a (new) conversation and
  // tells the team, so a visitor who leaves without asking anything is still a lead.
  app.post("/v1/lead", async (c) => {
    const tenant = c.get("tenant");
    const body = await readJson(c);
    const address = email(body.email);
    const name = text(body.name, 100);
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!address) return fail(c, "bad_request", 400);
    if (phone && !PHONE.test(phone)) return fail(c, "bad_request", 400);

    const limit = handoffLimiter.hit(`lead:${deps.clientIp(c)}`);
    if (!limit.ok) return fail(c, "rate_limited", 429, limit.retryAfter);

    const conversationId = idOf(body.conversationId);
    let conversation = conversationId ? await store.getOrLoad(tenant.id, conversationId) : undefined;
    conversation ??= store.create(tenant.id, c.get("origin"));
    store.setVisitor(conversation, { email: address, ...(name ? { name } : {}), ...(phone ? { phone } : {}) });

    // The lead is kept in the inbox either way; over the cap only the notification email is skipped
    const mailLimit = tenant.handoffEmail ? mailAllowed(tenant) : { ok: false as const, retryAfter: 0 };
    if (tenant.handoffEmail && !mailLimit.ok) log("warn", "lead mail cap reached", { tenant: tenant.id });
    if (tenant.handoffEmail && mailLimit.ok) {
      const lang = tenant.settings.defaultLang;
      await mailer.send({
        to: tenant.handoffEmail,
        replyTo: address,
        subject: LEAD_SUBJECT[lang](tenant.name),
        text: leadBody(lang, { email: address, name, phone }),
      });
    }
    return c.json({ conversationId: conversation.id });
  });

  app.get("/v1/conversations/:id", async (c) => {
    const limited = lookup(c);
    if (limited) return limited;
    const id = idOf(c.req.param("id"));
    const conversation = id && (await store.getOrLoad(c.get("tenant").id, id));
    if (!conversation) return fail(c, "not_found", 404);
    return c.json({
      id: conversation.id,
      messages: conversation.messages.map(({ id, role, content, sources, feedback }) => ({ id, role, content, sources, feedback })),
    });
  });

  // KVKK/GDPR: visitors can erase their conversation.
  app.delete("/v1/conversations/:id", async (c) => {
    const limited = lookup(c);
    if (limited) return limited;
    const id = idOf(c.req.param("id"));
    if (!id || !(await store.delete(c.get("tenant").id, id))) return fail(c, "not_found", 404);
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
    // arrays and primitives are not a request body; fields are read as own data only
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
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
  lt: (site) => `[Apex Bot] ${site}: lankytojas nori pasikalbėti su žmogumi`,
  lv: (site) => `[Apex Bot] ${site}: apmeklētājs vēlas runāt ar cilvēku`,
  et: (site) => `[Apex Bot] ${site}: külastaja soovib rääkida inimesega`,
};

const LEAD_SUBJECT: Record<Lang, (site: string) => string> = {
  tr: (site) => `[Apex Bot] ${site}: yeni potansiyel müşteri`,
  en: (site) => `[Apex Bot] ${site}: new lead from the chat`,
  lt: (site) => `[Apex Bot] ${site}: naujas kontaktas iš pokalbio`,
  lv: (site) => `[Apex Bot] ${site}: jauns kontakts no tērzēšanas`,
  et: (site) => `[Apex Bot] ${site}: uus kontakt vestlusest`,
};

// Labels for the hand-off and lead emails, in the site's default language
const MAIL: Record<Lang, Record<"leadIntro" | "handoffIntro" | "ticket" | "name" | "email" | "phone" | "note" | "transcript" | "visitor" | "bot" | "none" | "reply", string>> = {
  tr: {
    leadIntro: "Bir ziyaretçi sohbete başlamadan önce iletişim bilgilerini bıraktı.",
    handoffIntro: "Sohbet widget'ından bir ziyaretçi iletişim talebi gönderdi.",
    ticket: "Talep no",
    name: "Ad",
    email: "E-posta",
    phone: "Telefon",
    note: "Mesaj",
    transcript: "Konuşma",
    visitor: "Ziyaretçi",
    bot: "Asistan",
    none: "(Konuşma kaydı yok)",
    reply: "Bu e-postayı yanıtladığınızda ziyaretçiye ulaşır.",
  },
  en: {
    leadIntro: "A visitor left their contact details before starting a chat.",
    handoffIntro: "A visitor sent a contact request from the chat widget.",
    ticket: "Ticket",
    name: "Name",
    email: "Email",
    phone: "Phone",
    note: "Message",
    transcript: "Conversation",
    visitor: "Visitor",
    bot: "Assistant",
    none: "(No conversation)",
    reply: "Replying to this email reaches the visitor.",
  },
  lt: {
    leadIntro: "Lankytojas prieš pradėdamas pokalbį paliko savo kontaktinius duomenis.",
    handoffIntro: "Lankytojas per pokalbių valdiklį išsiuntė prašymą susisiekti.",
    ticket: "Užklausos nr.",
    name: "Vardas",
    email: "El. paštas",
    phone: "Telefonas",
    note: "Žinutė",
    transcript: "Pokalbis",
    visitor: "Lankytojas",
    bot: "Asistentas",
    none: "(Pokalbio nėra)",
    reply: "Atsakę į šį laišką, susisieksite tiesiogiai su lankytoju.",
  },
  lv: {
    leadIntro: "Apmeklētājs pirms sarunas sākuma atstāja savu kontaktinformāciju.",
    handoffIntro: "Apmeklētājs tērzēšanas logrīkā nosūtīja saziņas pieprasījumu.",
    ticket: "Pieteikuma nr.",
    name: "Vārds",
    email: "E-pasts",
    phone: "Tālrunis",
    note: "Ziņa",
    transcript: "Saruna",
    visitor: "Apmeklētājs",
    bot: "Asistents",
    none: "(Sarunas nav)",
    reply: "Atbildot uz šo e-pastu, jūs sazināsieties tieši ar apmeklētāju.",
  },
  et: {
    leadIntro: "Külastaja jättis enne vestluse alustamist oma kontaktandmed.",
    handoffIntro: "Külastaja saatis vestlusvidina kaudu ühendusevõtmise soovi.",
    ticket: "Pöördumise nr",
    name: "Nimi",
    email: "E-post",
    phone: "Telefon",
    note: "Sõnum",
    transcript: "Vestlus",
    visitor: "Külastaja",
    bot: "Assistent",
    none: "(Vestlust pole)",
    reply: "Sellele e-kirjale vastates jõuate otse külastajani.",
  },
};

function leadBody(lang: Lang, { email, name, phone }: { email: string; name: string; phone: string }): string {
  const t = MAIL[lang];
  return [t.leadIntro, "", `${t.name}: ${name || "-"}`, `${t.email}: ${email}`, `${t.phone}: ${phone || "-"}`, "", t.reply].join("\n");
}

function handoffBody(
  lang: Lang,
  { ref, email, name, note, phone, conversation }: { ref: string; email: string; name: string; note: string; phone: string; conversation?: Conversation },
): string {
  const t = MAIL[lang];
  const lines = [t.handoffIntro, "", `${t.ticket}: #${ref}`, `${t.name}: ${name || "-"}`, `${t.email}: ${email}`];
  if (phone) lines.push(`${t.phone}: ${phone}`);
  lines.push(`${t.note}: ${note || "-"}`, "", `${t.transcript}:`);
  const messages = conversation?.messages.slice(-30) ?? [];
  if (messages.length === 0) lines.push(t.none);
  for (const m of messages) lines.push(`${m.role === "user" ? t.visitor : t.bot}: ${m.content}`, "");
  lines.push("", t.reply);
  return lines.join("\n");
}
