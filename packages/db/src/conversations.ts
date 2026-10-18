import type { Db, Queryable } from "./db.ts"
import { BotError, canEditBot, getBotForUser, type BotScope } from "./bots.ts"
import { maskPII } from "./pii.ts"

// ---------- Written by the chat API (scoped by bot id, which it resolved from the site key) ----------

export interface MessageSource {
  url: string
  title: string
}

export interface ConversationMessage {
  id: string
  role: "user" | "assistant"
  content: string
  sources: MessageSource[]
  unanswered: boolean
  feedback: "up" | "down" | null
  createdAt: Date
}

/** Where a conversation started (set by the chat API; see apps/api/src/visitor-context.ts). */
export interface ConversationContext {
  page?: string
  pageTitle?: string
  locale?: string
  country?: string
  device?: string
  os?: string
  browser?: string
}

const CONTEXT_KEYS = ["page", "pageTitle", "locale", "country", "device", "os", "browser"] as const

/** Only the known string fields, whatever the stored JSON holds. */
function toContext(raw: unknown): ConversationContext {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw
  if (!value || typeof value !== "object") return {}
  const out: ConversationContext = {}
  for (const key of CONTEXT_KEYS) {
    const v = (value as Record<string, unknown>)[key]
    if (typeof v === "string" && v) out[key] = v.slice(0, 300)
  }
  return out
}

export interface StoredConversation {
  id: string
  botId: string
  origin: string | null
  context: ConversationContext
  createdAt: Date
  updatedAt: Date
  visitor: { email: string; name: string | null; phone: string | null } | null
  handoffAt: Date | null
  messages: ConversationMessage[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `context` undefined leaves the column out, for a database still without migration 0016. */
export async function insertConversation(
  db: Queryable,
  c: { id: string; botId: string; origin?: string | null; context?: ConversationContext; createdAt: Date },
): Promise<void> {
  const params = [c.id, c.botId, c.origin?.slice(0, 300) ?? null, c.createdAt]
  if (!c.context) {
    await db.query("insert into app.conversations (id, bot_id, origin, created_at, updated_at) values ($1, $2, $3, $4, $4) on conflict (id) do nothing", params)
    return
  }
  await db.query(
    "insert into app.conversations (id, bot_id, origin, context, created_at, updated_at) values ($1, $2, $3, $5::jsonb, $4, $4) on conflict (id) do nothing",
    [...params, JSON.stringify(toContext(c.context))],
  )
}

export async function insertMessage(
  db: Db,
  m: { id: string; conversationId: string; botId: string; role: "user" | "assistant"; content: string; sources?: MessageSource[]; unanswered?: boolean; createdAt: Date },
): Promise<void> {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query(
      `insert into app.messages (id, conversation_id, bot_id, role, content, sources, unanswered, created_at)
       select $1, c.id, c.bot_id, $4, $5, $6::jsonb, $7, $8 from app.conversations c where c.id = $2 and c.bot_id = $3
       on conflict (id) do nothing returning id`,
      [m.id, m.conversationId, m.botId, m.role, m.content, JSON.stringify(m.sources ?? []), m.unanswered ?? false, m.createdAt],
    )
    if (!rows.length) return
    await tx.query(
      `update app.conversations set
         message_count = message_count + 1,
         unanswered_count = unanswered_count + $3::int,
         preview = case when preview = '' and $4 = 'user' then left($5, 200) else preview end,
         updated_at = greatest(updated_at, $6)
       where id = $1 and bot_id = $2`,
      [m.conversationId, m.botId, m.unanswered ? 1 : 0, m.role, m.content, m.createdAt],
    )
  })
}

export async function setConversationVisitor(db: Queryable, botId: string, id: string, v: { email: string; name?: string; phone?: string }): Promise<void> {
  await db.query("update app.conversations set visitor_email = $3, visitor_name = $4, visitor_phone = $5 where id = $1 and bot_id = $2", [
    id,
    botId,
    v.email,
    v.name ?? null,
    v.phone ?? null,
  ])
}

export async function markConversationHandoff(db: Queryable, botId: string, id: string, at: Date = new Date()): Promise<void> {
  await db.query("update app.conversations set handoff_at = $3 where id = $1 and bot_id = $2", [id, botId, at])
}

export async function setMessageFeedback(db: Db, botId: string, conversationId: string, messageId: string, rating: "up" | "down"): Promise<void> {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ feedback: string | null }>(
      "select feedback from app.messages where id = $1 and conversation_id = $2 and bot_id = $3 and role = 'assistant' for update",
      [messageId, conversationId, botId],
    )
    if (!rows.length) return
    await tx.query("update app.messages set feedback = $2 where id = $1", [messageId, rating])
    // keeps the per-conversation count of thumbs-down in step when a rating changes
    const delta = (rating === "down" ? 1 : 0) - (rows[0].feedback === "down" ? 1 : 0)
    if (delta) await tx.query("update app.conversations set negative_count = negative_count + $3 where id = $1 and bot_id = $2", [conversationId, botId, delta])
  })
}

export async function deleteConversation(db: Queryable, botId: string, id: string): Promise<boolean> {
  if (!UUID.test(id) || !UUID.test(botId)) return false
  const { rows } = await db.query("delete from app.conversations where id = $1 and bot_id = $2 returning id", [id, botId])
  return rows.length > 0
}

interface ConversationRow {
  id: string
  bot_id: string
  origin: string | null
  context: unknown
  created_at: Date
  updated_at: Date
  visitor_email: string | null
  visitor_name: string | null
  visitor_phone: string | null
  handoff_at: Date | null
}

interface MessageRow {
  id: string
  role: "user" | "assistant"
  content: string
  sources: MessageSource[] | string
  unanswered: boolean
  feedback: "up" | "down" | null
  created_at: Date
}

const toMessage = (r: MessageRow): ConversationMessage => ({
  id: r.id,
  role: r.role,
  content: r.content,
  sources: typeof r.sources === "string" ? JSON.parse(r.sources) : r.sources,
  unanswered: r.unanswered,
  feedback: r.feedback,
  createdAt: r.created_at,
})

/** One conversation with its messages, only if it belongs to this bot. One round trip: the inbox waits on it. */
export async function loadConversation(db: Queryable, botId: string, id: string): Promise<StoredConversation | null> {
  if (!UUID.test(id) || !UUID.test(botId)) return null
  // to_jsonb(c) -> 'context' reads as null instead of failing on a database without migration 0016
  const { rows } = await db.query<ConversationRow & { messages: MessageRow[] | string }>(
    `select c.id, c.bot_id, c.origin, to_jsonb(c) -> 'context' as context, c.created_at, c.updated_at,
            c.visitor_email, c.visitor_name, c.visitor_phone, c.handoff_at,
            coalesce((select json_agg(m order by m.created_at, m.id)
                        from (select id, role, content, sources, unanswered, feedback, created_at
                                from app.messages where conversation_id = c.id and bot_id = c.bot_id) m), '[]') as messages
       from app.conversations c where c.id = $1 and c.bot_id = $2`,
    [id, botId],
  )
  const c = rows[0]
  if (!c) return null
  const messages: MessageRow[] = typeof c.messages === "string" ? JSON.parse(c.messages) : c.messages
  return {
    id: c.id,
    botId: c.bot_id,
    origin: c.origin,
    context: toContext(c.context),
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    visitor: c.visitor_email ? { email: c.visitor_email, name: c.visitor_name, phone: c.visitor_phone } : null,
    handoffAt: c.handoff_at,
    // json_agg returns timestamps as text
    messages: messages.map((m) => toMessage({ ...m, created_at: new Date(m.created_at) })),
  }
}

/** Deletes conversations idle for longer than their bot's retention period. */
export async function sweepConversations(db: Queryable): Promise<number> {
  const { rows } = await db.query(
    `delete from app.conversations c using app.bots b
      where c.bot_id = b.id
        and c.updated_at < now() - make_interval(days => coalesce((b.settings #>> '{security,retentionDays}')::int, 30))
      returning c.id`,
  )
  return rows.length
}

// ---------- Read by the dashboard (scoped through the user's workspace) ----------

export type ConversationFilter = "all" | "unanswered" | "handoff" | "leads" | "negative"

export interface ConversationSummary {
  id: string
  preview: string
  origin: string | null
  context: ConversationContext
  messageCount: number
  unansweredCount: number
  negativeCount: number
  visitorEmail: string | null
  visitorName: string | null
  handoffAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const FILTERS: Record<ConversationFilter, string> = {
  all: "true",
  unanswered: "unanswered_count > 0",
  handoff: "handoff_at is not null",
  leads: "visitor_email is not null",
  negative: "negative_count > 0",
}

export interface ListConversationsOptions {
  filter?: ConversationFilter
  before?: Date | null
  /** Only conversations active in the last N days, the window the overview counts over. */
  days?: number | null
  /** Words that must all appear in the visitor's details, the start page or any message. */
  search?: string | null
  limit?: number
}

export async function listConversations(
  db: Db,
  who: BotScope,
  options: ListConversationsOptions = {},
): Promise<{ conversations: ConversationSummary[]; hasMore: boolean }> {
  const bot = await getBotForUser(db, who)
  return listBotConversations(db, bot.id, options)
}

/** One bot's inbox page. The caller has checked the bot is theirs to read (or staff's, see support-access.ts). */
export async function listBotConversations(
  db: Queryable,
  botId: string,
  options: ListConversationsOptions = {},
): Promise<{ conversations: ConversationSummary[]; hasMore: boolean }> {
  if (!UUID.test(botId)) return { conversations: [], hasMore: false }
  // own keys only: an inherited one ("constructor") would put a function's source into the SQL
  const filter = options.filter && Object.hasOwn(FILTERS, options.filter) ? FILTERS[options.filter] : FILTERS.all
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100)
  const terms = searchTerms(options.search)
  const { rows } = await db.query<{
    id: string
    preview: string
    origin: string | null
    context: unknown
    message_count: number
    unanswered_count: number
    negative_count: number
    visitor_email: string | null
    visitor_name: string | null
    handoff_at: Date | null
    created_at: Date
    updated_at: Date
  }>(
    `select id, preview, origin, context, message_count, unanswered_count, negative_count, visitor_email, visitor_name, handoff_at, created_at, updated_at
       from app.conversations c
      where bot_id = $1 and message_count > 0 and ${filter} and ($2::timestamptz is null or updated_at < $2::timestamptz)
        and ($4::int is null or updated_at > now() - make_interval(days => $4::int))
        and not exists (
          select 1 from unnest($5::text[]) as t(pattern)
           where not (concat_ws(' ', c.visitor_name, c.visitor_email, c.visitor_phone, c.context ->> 'page', c.context ->> 'pageTitle') ilike t.pattern
                      or exists (select 1 from app.messages m where m.conversation_id = c.id and m.bot_id = c.bot_id and m.content ilike t.pattern)))
      order by updated_at desc
      limit $3`,
    [botId, options.before ?? null, limit + 1, options.days ?? null, terms],
  )
  return {
    hasMore: rows.length > limit,
    conversations: rows.slice(0, limit).map((r) => ({
      id: r.id,
      preview: r.preview,
      origin: r.origin,
      context: toContext(r.context),
      messageCount: r.message_count,
      unansweredCount: r.unanswered_count,
      negativeCount: r.negative_count,
      visitorEmail: r.visitor_email,
      visitorName: r.visitor_name,
      handoffAt: r.handoff_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  }
}

/** ILIKE patterns for each word of a search (at most 5), with % and _ taken literally. */
export function searchTerms(raw: string | null | undefined): string[] {
  if (!raw) return []
  const words = raw.trim().slice(0, 200).split(/\s+/).filter(Boolean).slice(0, 5)
  return [...new Set(words)].map((w) => `%${w.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`)
}

export async function getConversationForUser(db: Db, who: BotScope, id: string): Promise<StoredConversation | null> {
  const bot = await getBotForUser(db, who)
  return loadConversation(db, bot.id, id)
}

export async function deleteConversationForUser(db: Db, who: BotScope, id: string): Promise<boolean> {
  const bot = await getBotForUser(db, who)
  if (!canEditBot(bot.role)) return false
  return deleteConversation(db, bot.id, id)
}

export interface ConversationStats {
  conversations: number
  messages: number
  unanswered: number
  handoffs: number
  leads: number
  helpful: number
  notHelpful: number
}

/** Totals over the last `days` days, for the overview. */
export async function conversationStats(db: Db, who: BotScope, days = 7): Promise<ConversationStats> {
  const bot = await getBotForUser(db, who)
  const { rows } = await db.query<ConversationStats>(
    `select count(*) filter (where c.message_count > 0)::int as conversations,
            coalesce(sum(c.message_count), 0)::int as messages,
            coalesce(sum(c.unanswered_count), 0)::int as unanswered,
            count(c.handoff_at)::int as handoffs,
            count(c.visitor_email)::int as leads,
            (select count(*)::int from app.messages m where m.bot_id = $1 and m.feedback = 'up' and m.created_at > now() - make_interval(days => $2)) as "helpful",
            (select count(*)::int from app.messages m where m.bot_id = $1 and m.feedback = 'down' and m.created_at > now() - make_interval(days => $2)) as "notHelpful"
       from app.conversations c
      where c.bot_id = $1 and c.updated_at > now() - make_interval(days => $2)`,
    [bot.id, days],
  )
  return rows[0]
}

// ---------- Unanswered questions, closed out from the analytics page ----------

/** Most replies one request may resolve; the analytics page groups repeats of a question. */
export const MAX_RESOLVE = 200

/** Valid, distinct reply ids, or an error for anything else. */
export function replyIdList(raw: unknown): string[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_RESOLVE || !raw.every((id) => typeof id === "string" && UUID.test(id))) {
    throw new BotError("not_found", "Those questions are no longer open")
  }
  return [...new Set(raw as string[])]
}

/** Marks this bot's open unanswered replies resolved; ids of other bots are ignored. */
export async function resolveReplies(db: Queryable, botId: string, ids: string[]): Promise<number> {
  const { rows } = await db.query(
    `update app.messages set resolved_at = now()
      where bot_id = $1 and id = any($2::uuid[]) and role = 'assistant' and unanswered and resolved_at is null
      returning id`,
    [botId, ids],
  )
  return rows.length
}

/** "Dismiss": the question needs no answer in the knowledge base. */
export async function dismissUnansweredForUser(db: Db, who: BotScope, rawIds: unknown): Promise<number> {
  const bot = await getBotForUser(db, who)
  if (!canEditBot(bot.role)) throw new BotError("forbidden", "Only workspace owners and admins can change the knowledge base")
  return resolveReplies(db, bot.id, replyIdList(rawIds))
}

// ---------- Daily token usage (chat API) ----------

/** Tokens a bot has spent on the given UTC day (YYYY-MM-DD). */
export async function tokensUsedOn(db: Queryable, botId: string, day: string): Promise<number> {
  const { rows } = await db.query<{ tokens: string }>("select tokens from app.token_usage where bot_id = $1 and day = $2::date", [botId, day])
  return rows[0] ? Number(rows[0].tokens) : 0
}

/**
 * Adds a model call's tokens to the bot's day. Pass input and output apart where known (needs
 * migration 0028); a bare number counts toward the budget only, and is priced as an estimate.
 */
export async function addTokenUsage(db: Queryable, botId: string, day: string, usage: number | { input: number; output: number }): Promise<void> {
  const clean = (n: number) => Math.max(0, Math.round(n))
  if (typeof usage === "number") {
    await db.query(
      `insert into app.token_usage (bot_id, day, tokens) values ($1, $2::date, $3)
       on conflict (bot_id, day) do update set tokens = app.token_usage.tokens + excluded.tokens`,
      [botId, day, clean(usage)],
    )
    return
  }
  const input = clean(usage.input)
  const output = clean(usage.output)
  await db.query(
    `insert into app.token_usage (bot_id, day, tokens, input_tokens, output_tokens) values ($1, $2::date, $3, $4, $5)
     on conflict (bot_id, day) do update set tokens = app.token_usage.tokens + excluded.tokens,
       input_tokens = app.token_usage.input_tokens + excluded.input_tokens,
       output_tokens = app.token_usage.output_tokens + excluded.output_tokens`,
    [botId, day, input + output, input, output],
  )
}

// ---------- Masked copies, for staff (support access) and impersonation ----------

/** What a masked visitor field reads as; the value itself never leaves the server. */
export const MASKED = { email: "[email]", phone: "[phone]", name: "[name]" } as const

const maskField = (value: string | null, token: string) => (value ? token : null)

/** The list row with the visitor's details hidden and personal data in the preview masked. */
export function maskConversationSummary(c: ConversationSummary): ConversationSummary {
  return { ...c, preview: maskPII(c.preview), visitorEmail: maskField(c.visitorEmail, MASKED.email), visitorName: maskField(c.visitorName, MASKED.name) }
}

/** The transcript with the visitor's details hidden and personal data in every message masked. */
export function maskConversation(c: StoredConversation): StoredConversation {
  return {
    ...c,
    visitor: c.visitor && { email: MASKED.email, name: maskField(c.visitor.name, MASKED.name), phone: maskField(c.visitor.phone, MASKED.phone) },
    messages: c.messages.map((m) => ({ ...m, content: maskPII(m.content) })),
  }
}
