import type { Db, Queryable } from "./db.ts"
import { canEditBot, getBotForUser, scopeUser, type BotScope } from "./bots.ts"
import { replyIdList, resolveReplies } from "./conversations.ts"
import { botPlan, websitePageLimit, type Plan } from "./plans.ts"

export const KNOWLEDGE_LIMITS = {
  sources: 20,
  // pages read from one website depend on the plan: see knowledgeLimits
  /** Linked PDF and Word files read from one website, within its page limit. */
  websiteDocuments: 20,
  textChars: 50_000,
  /** Text extracted from one uploaded file. */
  fileChars: 100_000,
  /** One uploaded file; the hosting platform caps request bodies at 4.5 MB. */
  fileBytes: 4_000_000,
  title: 200,
  /** Across all sources of one bot; keeps the chat API's in-memory index small. */
  chunksPerBot: 5000,
  /** Websites of one bot being read at the same time. */
  concurrentSyncs: 2,
} as const

/** KNOWLEDGE_LIMITS plus the ones the workspace's plan sets. */
export async function knowledgeLimits(db: Db, who: BotScope) {
  const plan = await botPlan(db, (await getBotForUser(db, who)).id)
  return { ...KNOWLEDGE_LIMITS, plan, websitePages: websitePageLimit(plan) }
}
export type KnowledgeLimits = Awaited<ReturnType<typeof knowledgeLimits>>

/** A claimed sync: the source, its bot, where to start and how many pages the plan allows. */
export type ClaimedSync = KnowledgeSource & { botId: string; url: string; plan: Plan; pageLimit: number }

// A sync left in "syncing" this long (the server restarted mid-crawl) can be started again
export const STALE_SYNC_MS = 10 * 60_000

export type SourceKind = "website" | "text" | "file"
export type SourceStatus = "pending" | "syncing" | "ready" | "failed"
/** How often a website is read again on its own. */
export type SourceRefresh = "off" | "daily" | "weekly"
export const SOURCE_REFRESH: readonly SourceRefresh[] = ["off", "daily", "weekly"]

// The daily job runs at about the same time each day; a little slack keeps "daily" from slipping a day
const REFRESH_AFTER: Record<Exclude<SourceRefresh, "off">, string> = { daily: "20 hours", weekly: "6 days 20 hours" }

export interface KnowledgeSource {
  id: string
  kind: SourceKind
  title: string
  url: string | null
  /** Text and file sources only: the beginning of the content. */
  preview: string | null
  /** The text source answers from the analytics page are appended to. */
  managed: boolean
  status: SourceStatus
  error: string | null
  pages: number
  chunks: number
  /** Websites only. */
  refresh: SourceRefresh
  syncedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ChunkRecord {
  url: string
  title: string
  text: string
}

export type KnowledgeErrorCode = "invalid_input" | "limit" | "not_found" | "forbidden" | "busy"

export class KnowledgeError extends Error {
  constructor(
    readonly code: KnowledgeErrorCode,
    message: string,
  ) {
    super(message)
  }
}

interface SourceRow {
  id: string
  kind: SourceKind
  title: string
  url: string | null
  preview: string | null
  managed: boolean
  status: SourceStatus
  error: string | null
  pages: number
  chunks: number
  refresh: SourceRefresh
  synced_at: Date | null
  created_at: Date
  updated_at: Date
}

const COLUMNS = `id, kind, title, url, left(content, 240) as preview, managed, status, error, pages, chunks, refresh, synced_at, created_at, updated_at`

const toSource = (r: SourceRow): KnowledgeSource => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  url: r.url,
  preview: r.preview,
  managed: r.managed,
  // a crawl that died with its server process shows as failed, so it can be retried
  status: r.status === "syncing" && Date.now() - new Date(r.updated_at).getTime() > STALE_SYNC_MS ? "failed" : r.status,
  error: r.status === "syncing" && Date.now() - new Date(r.updated_at).getTime() > STALE_SYNC_MS ? "The sync was interrupted. Try again" : r.error,
  pages: r.pages,
  chunks: r.chunks,
  refresh: r.refresh,
  syncedAt: r.synced_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function editableBot(db: Db, who: BotScope) {
  const bot = await getBotForUser(db, who)
  if (!canEditBot(bot.role)) throw new KnowledgeError("forbidden", "Only workspace owners and admins can change the knowledge base")
  return bot
}

function cleanTitle(raw: unknown): string {
  const title = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : ""
  if (!title) throw new KnowledgeError("invalid_input", "Give it a title")
  if (title.length > KNOWLEDGE_LIMITS.title) throw new KnowledgeError("invalid_input", `Keep the title under ${KNOWLEDGE_LIMITS.title} characters`)
  return title
}

async function checkRoom(q: Queryable, botId: string) {
  const { rows } = await q.query<{ n: number }>("select count(*)::int as n from app.knowledge_sources where bot_id = $1", [botId])
  if (rows[0].n >= KNOWLEDGE_LIMITS.sources) {
    throw new KnowledgeError("limit", `You can have up to ${KNOWLEDGE_LIMITS.sources} sources. Remove one to add another`)
  }
}

const bumpKnowledge = (q: Queryable, botId: string) =>
  q.query("update app.bots set knowledge_version = knowledge_version + 1 where id = $1", [botId])

async function insertChunks(q: Queryable, botId: string, sourceId: string, chunks: ChunkRecord[]) {
  if (!chunks.length) return
  await q.query(
    `insert into app.knowledge_chunks (bot_id, source_id, url, title, text, position)
     select $1, $2, c.url, c.title, c.text, c.position
       from unnest($3::text[], $4::text[], $5::text[], $6::int[]) as c(url, title, text, position)`,
    [botId, sourceId, chunks.map((c) => c.url), chunks.map((c) => c.title.slice(0, 300)), chunks.map((c) => c.text), chunks.map((_, i) => i)],
  )
}

/** Room left for one source's chunks, counting every other source of the bot. */
async function chunkRoom(q: Queryable, botId: string, sourceId: string | null) {
  const { rows } = await q.query<{ n: number }>(
    "select count(*)::int as n from app.knowledge_chunks where bot_id = $1 and source_id is distinct from $2",
    [botId, sourceId],
  )
  return Math.max(0, KNOWLEDGE_LIMITS.chunksPerBot - rows[0].n)
}

export async function listSources(db: Db, who: BotScope): Promise<KnowledgeSource[]> {
  const bot = await getBotForUser(db, who)
  const { rows } = await db.query<SourceRow>(
    `select ${COLUMNS} from app.knowledge_sources where bot_id = $1 order by created_at desc`,
    [bot.id],
  )
  return rows.map(toSource)
}

/** Adds a website to crawl. `url` must already be normalized; the caller starts the sync. */
export async function addWebsiteSource(db: Db, who: BotScope, url: string, title?: string): Promise<KnowledgeSource> {
  const bot = await editableBot(db, who)
  if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 2048) throw new KnowledgeError("invalid_input", "Enter a valid website address")
  return db.transaction(async (tx) => {
    // serializes concurrent adds for this bot, so the source limit holds
    await tx.query("select id from app.bots where id = $1 for update", [bot.id])
    const dup = await tx.query<SourceRow>(`select ${COLUMNS} from app.knowledge_sources where bot_id = $1 and kind = 'website' and url = $2`, [
      bot.id,
      url,
    ])
    if (dup.rows[0]) return toSource(dup.rows[0])
    await checkRoom(tx, bot.id)
    const { rows } = await tx.query<SourceRow>(
      `insert into app.knowledge_sources (bot_id, kind, title, url, created_by) values ($1, 'website', $2, $3, $4) returning ${COLUMNS}`,
      [bot.id, cleanTitle(title || new URL(url).hostname + (new URL(url).pathname === "/" ? "" : new URL(url).pathname)), url, scopeUser(who)],
    )
    return toSource(rows[0])
  })
}

/** Checks a text or file source's content; the limit is the kind's. */
function cleanContent(kind: "text" | "file", raw: unknown): string {
  const content = typeof raw === "string" ? raw.trim() : ""
  if (kind === "file") {
    if (content.length < 20) throw new KnowledgeError("invalid_input", "No readable text was found in this file")
    if (content.length > KNOWLEDGE_LIMITS.fileChars) {
      throw new KnowledgeError("invalid_input", `Keep each file under ${KNOWLEDGE_LIMITS.fileChars.toLocaleString("en")} characters of text, or split it in two`)
    }
    return content
  }
  if (content.length < 20) throw new KnowledgeError("invalid_input", "Add at least a sentence or two of text")
  if (content.length > KNOWLEDGE_LIMITS.textChars) {
    throw new KnowledgeError("invalid_input", `Keep each text under ${KNOWLEDGE_LIMITS.textChars.toLocaleString("en")} characters, or split it in two`)
  }
  return content
}

/** Adds pasted text, already chunked by the caller; it is searchable immediately. */
export async function addTextSource(
  db: Db,
  who: BotScope,
  input: { title: unknown; content: unknown },
  chunk: (title: string, content: string) => ChunkRecord[],
): Promise<KnowledgeSource> {
  return addContentSource(db, who, "text", input, chunk)
}

/** Adds an uploaded file as the text extracted from it (by the caller); searchable immediately like pasted text. */
export async function addFileSource(
  db: Db,
  who: BotScope,
  input: { title: unknown; content: unknown },
  chunk: (title: string, content: string) => ChunkRecord[],
): Promise<KnowledgeSource> {
  return addContentSource(db, who, "file", input, chunk)
}

async function addContentSource(
  db: Db,
  who: BotScope,
  kind: "text" | "file",
  input: { title: unknown; content: unknown },
  chunk: (title: string, content: string) => ChunkRecord[],
): Promise<KnowledgeSource> {
  const bot = await editableBot(db, who)
  const title = cleanTitle(input.title)
  const content = cleanContent(kind, input.content)
  return db.transaction(async (tx) => {
    await tx.query("select id from app.bots where id = $1 for update", [bot.id])
    await checkRoom(tx, bot.id)
    const chunks = chunk(title, content)
    const room = await chunkRoom(tx, bot.id, null)
    if (chunks.length > room) throw new KnowledgeError("limit", "Your knowledge base is full. Remove a source to add more")
    const { rows } = await tx.query<SourceRow>(
      `insert into app.knowledge_sources (bot_id, kind, title, content, status, chunks, synced_at, created_by)
       values ($1, $6, $2, $3, 'ready', $4, now(), $5) returning ${COLUMNS}`,
      [bot.id, title, content, chunks.length, scopeUser(who), kind],
    )
    await insertChunks(tx, bot.id, rows[0].id, chunks)
    await bumpKnowledge(tx, bot.id)
    return toSource(rows[0])
  })
}

export const ANSWER_LIMITS = { question: 300, answerMin: 10, answer: 4000 } as const

/**
 * "Add to knowledge base" for an unanswered question: appends the question and its answer to
 * the bot's managed text source (created on first use, titled `title`), re-chunks it and
 * resolves the given replies, in one transaction. Entries are separated by a blank line and
 * never contain one, so `chunk` can keep each question with its answer.
 */
export async function addAnswerToKnowledge(
  db: Db,
  who: BotScope,
  input: { question: unknown; answer: unknown; replyIds: unknown; title: string },
  chunk: (title: string, content: string) => ChunkRecord[],
): Promise<{ source: KnowledgeSource; resolved: number }> {
  const bot = await editableBot(db, who)
  const question = typeof input.question === "string" ? input.question.replace(/\s+/g, " ").trim() : ""
  const answer = typeof input.answer === "string" ? input.answer.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").trim() : ""
  if (!question) throw new KnowledgeError("invalid_input", "Write the question")
  if (question.length > ANSWER_LIMITS.question) throw new KnowledgeError("invalid_input", `Keep the question under ${ANSWER_LIMITS.question} characters`)
  if (answer.length < ANSWER_LIMITS.answerMin) throw new KnowledgeError("invalid_input", "Write an answer of at least a few words")
  if (answer.length > ANSWER_LIMITS.answer) {
    throw new KnowledgeError("invalid_input", `Keep the answer under ${ANSWER_LIMITS.answer.toLocaleString("en")} characters`)
  }
  const ids = replyIdList(input.replyIds)
  const entry = `${question}\n${answer}`

  return db.transaction(async (tx) => {
    await tx.query("select id from app.bots where id = $1 for update", [bot.id])
    const found = await tx.query<SourceRow & { content: string }>(
      `select ${COLUMNS}, content from app.knowledge_sources where bot_id = $1 and managed for update`,
      [bot.id],
    )
    const existing = found.rows[0]
    const content = existing ? `${existing.content}\n\n${entry}` : entry
    if (content.length > KNOWLEDGE_LIMITS.textChars) {
      throw new KnowledgeError("limit", "Your answered questions are full. Remove that source from your knowledge base to start a new one")
    }
    if (!existing) await checkRoom(tx, bot.id)
    const title = existing?.title ?? cleanTitle(input.title)
    const chunks = chunk(title, content)
    if (chunks.length > (await chunkRoom(tx, bot.id, existing?.id ?? null))) {
      throw new KnowledgeError("limit", "Your knowledge base is full. Remove a source to add more")
    }

    let row: SourceRow
    if (existing) {
      await tx.query("delete from app.knowledge_chunks where source_id = $1", [existing.id])
      const { rows } = await tx.query<SourceRow>(
        `update app.knowledge_sources set content = $2, chunks = $3, status = 'ready', error = null, synced_at = now()
          where id = $1 returning ${COLUMNS}`,
        [existing.id, content, chunks.length],
      )
      row = rows[0]
    } else {
      const { rows } = await tx.query<SourceRow>(
        `insert into app.knowledge_sources (bot_id, kind, title, content, status, chunks, synced_at, created_by, managed)
         values ($1, 'text', $2, $3, 'ready', $4, now(), $5, true) returning ${COLUMNS}`,
        [bot.id, title, content, chunks.length, scopeUser(who)],
      )
      row = rows[0]
    }
    await insertChunks(tx, bot.id, row.id, chunks)
    await bumpKnowledge(tx, bot.id)
    return { source: toSource(row), resolved: await resolveReplies(tx, bot.id, ids) }
  })
}

/**
 * Marks a website source as syncing and returns it; "busy" if a sync is already running.
 * The caller crawls, then calls finishSync or failSync with the returned id.
 */
export async function startSync(db: Db, who: BotScope, sourceId: string): Promise<ClaimedSync> {
  const bot = await editableBot(db, who)
  if (!UUID.test(sourceId)) throw new KnowledgeError("not_found", "That source doesn't exist")
  return claimSync(db, bot.id, sourceId)
}

/**
 * startSync for the scheduled refresh, which acts for no user: the source must still be a website
 * set to refresh. Same "busy" and "not_found" errors.
 */
export async function startScheduledSync(db: Db, sourceId: string): Promise<ClaimedSync> {
  if (!UUID.test(sourceId)) throw new KnowledgeError("not_found", "That source doesn't exist")
  const { rows } = await db.query<{ bot_id: string }>(
    "select bot_id from app.knowledge_sources where id = $1 and kind = 'website' and refresh <> 'off'",
    [sourceId],
  )
  if (!rows[0]) throw new KnowledgeError("not_found", "That source doesn't exist")
  return claimSync(db, rows[0].bot_id, sourceId)
}

/**
 * Websites due to be read again, oldest first: still waiting for their first read, or last read
 * longer ago than their setting. A failed one waits a full interval before it is tried again, so a site that is down
 * isn't hit every day.
 */
export async function dueRefreshes(db: Queryable, limit: number): Promise<{ id: string; botId: string }[]> {
  const { rows } = await db.query<{ id: string; bot_id: string }>(
    `select id, bot_id from app.knowledge_sources
      where kind = 'website' and refresh <> 'off'
        and (status <> 'syncing' or updated_at < now() - make_interval(secs => $2))
        and (
          -- left waiting because other websites were being read when it was added
          (status = 'pending' and created_at < now() - interval '15 minutes')
          or (coalesce(synced_at, created_at) < now() - case refresh when 'daily' then $3::interval else $4::interval end
              and (status <> 'failed' or updated_at < now() - case refresh when 'daily' then $3::interval else $4::interval end)))
      order by synced_at nulls first, created_at
      limit $1`,
    [limit, STALE_SYNC_MS / 1000, REFRESH_AFTER.daily, REFRESH_AFTER.weekly],
  )
  return rows.map((r) => ({ id: r.id, botId: r.bot_id }))
}

async function claimSync(db: Db, botId: string, sourceId: string): Promise<ClaimedSync> {
  const running = await db.query<{ n: number }>(
    `select count(*)::int as n from app.knowledge_sources
      where bot_id = $1 and id <> $2 and status = 'syncing' and updated_at >= now() - make_interval(secs => $3)`,
    [botId, sourceId, STALE_SYNC_MS / 1000],
  )
  if (running.rows[0].n >= KNOWLEDGE_LIMITS.concurrentSyncs) {
    throw new KnowledgeError("busy", "Other websites are still being read. Try again when they're done")
  }
  const { rows } = await db.query<SourceRow>(
    `update app.knowledge_sources set status = 'syncing', error = null
      where id = $1 and bot_id = $2 and kind = 'website'
        and (status <> 'syncing' or updated_at < now() - make_interval(secs => $3))
      returning ${COLUMNS}`,
    [sourceId, botId, STALE_SYNC_MS / 1000],
  )
  if (!rows[0]) {
    const exists = await db.query("select 1 from app.knowledge_sources where id = $1 and bot_id = $2 and kind = 'website'", [sourceId, botId])
    throw exists.rows.length
      ? new KnowledgeError("busy", "This website is already being read")
      : new KnowledgeError("not_found", "That source doesn't exist")
  }
  const plan = await botPlan(db, botId)
  return { ...toSource(rows[0]), botId, url: rows[0].url!, plan, pageLimit: websitePageLimit(plan) }
}

/** Replaces a website source's chunks with a fresh crawl. No-op if the source was deleted meanwhile. */
export async function finishSync(db: Db, sourceId: string, result: { pages: number; chunks: ChunkRecord[] }): Promise<void> {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ bot_id: string }>(
      "select bot_id from app.knowledge_sources where id = $1 and status = 'syncing' for update",
      [sourceId],
    )
    if (!rows[0]) return
    const botId = rows[0].bot_id
    await tx.query("delete from app.knowledge_chunks where source_id = $1", [sourceId])
    const room = await chunkRoom(tx, botId, sourceId)
    const kept = result.chunks.slice(0, room)
    await insertChunks(tx, botId, sourceId, kept)
    await tx.query(
      `update app.knowledge_sources set status = 'ready', pages = $2, chunks = $3, synced_at = now(), error = $4 where id = $1`,
      [sourceId, result.pages, kept.length, kept.length < result.chunks.length ? "Your knowledge base is full, so only part of this website was kept" : null],
    )
    await bumpKnowledge(tx, botId)
  })
}

export async function failSync(db: Db, sourceId: string, message: string): Promise<void> {
  await db.query("update app.knowledge_sources set status = 'failed', error = $2 where id = $1 and status = 'syncing'", [
    sourceId,
    message.slice(0, 300),
  ])
}

export async function deleteSource(db: Db, who: BotScope, sourceId: string): Promise<void> {
  const bot = await editableBot(db, who)
  if (!UUID.test(sourceId)) throw new KnowledgeError("not_found", "That source doesn't exist")
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ chunks: number }>("delete from app.knowledge_sources where id = $1 and bot_id = $2 returning chunks", [
      sourceId,
      bot.id,
    ])
    if (!rows[0]) throw new KnowledgeError("not_found", "That source doesn't exist")
    await bumpKnowledge(tx, bot.id)
  })
}

export interface SourceDetail {
  source: KnowledgeSource
  /** Text sources only: the full content, for editing. */
  content: string | null
  /** Website sources only: each page that was read, with its excerpt count, in crawl order. */
  pages: { url: string; title: string; chunks: number }[]
  chunks: (ChunkRecord & { position: number })[]
}

/** One source with what it was turned into; every workspace member can look. */
export async function getSourceDetail(db: Db, who: BotScope, sourceId: string): Promise<SourceDetail> {
  const bot = await getBotForUser(db, who)
  if (!UUID.test(sourceId)) throw new KnowledgeError("not_found", "That source doesn't exist")
  const found = await db.query<SourceRow & { content: string | null }>(
    `select ${COLUMNS}, content from app.knowledge_sources where id = $1 and bot_id = $2`,
    [sourceId, bot.id],
  )
  const row = found.rows[0]
  if (!row) throw new KnowledgeError("not_found", "That source doesn't exist")
  const { rows: chunks } = await db.query<ChunkRecord & { position: number }>(
    "select url, title, text, position from app.knowledge_chunks where source_id = $1 order by position",
    [sourceId],
  )
  const pages = new Map<string, { url: string; title: string; chunks: number }>()
  if (row.kind === "website") {
    for (const c of chunks) {
      const page = pages.get(c.url) ?? pages.set(c.url, { url: c.url, title: c.title, chunks: 0 }).get(c.url)!
      page.chunks++
    }
  }
  return { source: toSource(row), content: row.kind === "text" ? row.content : null, pages: [...pages.values()], chunks }
}

/**
 * Renames a source, and for text sources replaces the content too (re-chunked in the same
 * transaction, so search never sees half of it). A website's content comes from the site.
 */
export async function updateSource(
  db: Db,
  who: BotScope,
  sourceId: string,
  input: { title?: unknown; content?: unknown; refresh?: unknown },
  chunk: (title: string, content: string) => ChunkRecord[],
): Promise<KnowledgeSource> {
  const bot = await editableBot(db, who)
  if (!UUID.test(sourceId)) throw new KnowledgeError("not_found", "That source doesn't exist")
  if (input.title === undefined && input.content === undefined && input.refresh === undefined) throw new KnowledgeError("invalid_input", "Nothing to update")
  if (input.refresh !== undefined && !SOURCE_REFRESH.includes(input.refresh as SourceRefresh)) {
    throw new KnowledgeError("invalid_input", "Choose how often to read the website again")
  }
  return db.transaction(async (tx) => {
    const found = await tx.query<SourceRow & { content: string | null }>(
      `select ${COLUMNS}, content from app.knowledge_sources where id = $1 and bot_id = $2 for update`,
      [sourceId, bot.id],
    )
    const existing = found.rows[0]
    if (!existing) throw new KnowledgeError("not_found", "That source doesn't exist")
    const title = input.title === undefined ? existing.title : cleanTitle(input.title)

    if (existing.kind === "website") {
      if (input.content !== undefined) throw new KnowledgeError("invalid_input", "A website's content comes from the site. Sync it to update")
      const { rows } = await tx.query<SourceRow>(`update app.knowledge_sources set title = $2, refresh = $3 where id = $1 returning ${COLUMNS}`, [
        sourceId,
        title,
        input.refresh ?? existing.refresh,
      ])
      return toSource(rows[0])
    }
    if (input.refresh !== undefined) throw new KnowledgeError("invalid_input", "Only websites are read again on their own")

    const content = cleanContent(existing.kind, input.content === undefined ? (existing.content ?? "") : input.content)
    const chunks = chunk(title, content)
    if (chunks.length > (await chunkRoom(tx, bot.id, sourceId))) throw new KnowledgeError("limit", "Your knowledge base is full. Remove a source to add more")
    await tx.query("delete from app.knowledge_chunks where source_id = $1", [sourceId])
    const { rows } = await tx.query<SourceRow>(
      `update app.knowledge_sources set title = $2, content = $3, chunks = $4, status = 'ready', error = null, synced_at = now()
        where id = $1 returning ${COLUMNS}`,
      [sourceId, title, content, chunks.length],
    )
    await insertChunks(tx, bot.id, sourceId, chunks)
    await bumpKnowledge(tx, bot.id)
    return toSource(rows[0])
  })
}

/**
 * Replies in the last `days` that cited each source, by source id. Replies store the cited
 * excerpt's url and title, not its source: a website page matches by url, pasted text (no url)
 * by title. Sources nobody cited are left out.
 */
export async function sourceUsage(db: Db, who: BotScope, days = 30): Promise<Record<string, number>> {
  const bot = await getBotForUser(db, who)
  const { rows } = await db.query<{ source_id: string; replies: number }>(
    `with cited as (
       select distinct m.id, coalesce(s ->> 'url', '') as url, coalesce(s ->> 'title', '') as title
         from app.messages m cross join lateral jsonb_array_elements(case when jsonb_typeof(m.sources) = 'array' then m.sources else '[]'::jsonb end) s
        where m.bot_id = $1 and m.role = 'assistant' and m.created_at >= now() - make_interval(days => $2)
     ), pages as (
       select distinct source_id, url, title from app.knowledge_chunks where bot_id = $1
     )
     select p.source_id, count(distinct c.id)::int as replies
       from cited c
       join pages p on case when c.url <> '' then p.url = c.url else p.url = '' and p.title = c.title end
      group by 1`,
    [bot.id, days],
  )
  return Object.fromEntries(rows.map((r) => [r.source_id, r.replies]))
}

/** Every chunk of one bot, for the chat API's index. */
export async function listKnowledgeChunks(db: Queryable, botId: string): Promise<ChunkRecord[]> {
  if (!UUID.test(botId)) return []
  const { rows } = await db.query<ChunkRecord>(
    `select c.url, c.title, c.text from app.knowledge_chunks c
       join app.knowledge_sources s on s.id = c.source_id
      where c.bot_id = $1
      order by s.created_at, c.position`,
    [botId],
  )
  return rows
}

/** A chunk's stored embedding: `hash` is the sha256 of the embedded text, `vector` float32 LE bytes. */
export interface StoredEmbedding {
  hash: Uint8Array
  vector: Uint8Array
}

/** Stored vectors of one bot and model, for the given text hashes (the ones not stored are left out). */
export async function loadEmbeddings(db: Queryable, botId: string, model: string, hashes: Uint8Array[]): Promise<StoredEmbedding[]> {
  if (!UUID.test(botId) || !hashes.length) return []
  const { rows } = await db.query<StoredEmbedding>(
    "select hash, vector from app.knowledge_embeddings where bot_id = $1 and model = $2 and hash = any($3::bytea[])",
    [botId, model, hashes.map(toBuffer)],
  )
  return rows
}

/** Stores vectors; a hash already stored (a concurrent writer) keeps its vector. */
export async function saveEmbeddings(db: Queryable, botId: string, model: string, embeddings: StoredEmbedding[]): Promise<void> {
  if (!UUID.test(botId)) return
  // a few hundred rows per statement keeps each request small (a 768-dim vector is 3 KB)
  for (let i = 0; i < embeddings.length; i += 200) {
    const batch = embeddings.slice(i, i + 200)
    await db.query(
      `insert into app.knowledge_embeddings (bot_id, model, hash, vector)
       select $1, $2, e.hash, e.vector from unnest($3::bytea[], $4::bytea[]) as e(hash, vector)
       on conflict do nothing`,
      [botId, model, batch.map((e) => toBuffer(e.hash)), batch.map((e) => toBuffer(e.vector))],
    )
  }
}

/** Deletes a bot's vectors that no current chunk uses, and every vector of other models. */
export async function pruneEmbeddings(db: Queryable, botId: string, model: string, keep: Uint8Array[]): Promise<number> {
  if (!UUID.test(botId)) return 0
  const { rows } = await db.query<{ n: number }>(
    `with gone as (
       delete from app.knowledge_embeddings where bot_id = $1 and not (model = $2 and hash = any($3::bytea[])) returning 1
     ) select count(*)::int as n from gone`,
    [botId, model, keep.map(toBuffer)],
  )
  return rows[0].n
}

const toBuffer = (bytes: Uint8Array) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
