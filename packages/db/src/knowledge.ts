import type { Db, Queryable } from "./db.ts"
import { canEditBot, getBotForUser } from "./bots.ts"
import { replyIdList, resolveReplies } from "./conversations.ts"

export const KNOWLEDGE_LIMITS = {
  sources: 20,
  websitePages: 50,
  textChars: 50_000,
  title: 200,
  /** Across all sources of one bot; keeps the chat API's in-memory index small. */
  chunksPerBot: 5000,
  /** Websites of one bot being read at the same time. */
  concurrentSyncs: 2,
} as const

// A sync left in "syncing" this long (the server restarted mid-crawl) can be started again
export const STALE_SYNC_MS = 10 * 60_000

export type SourceKind = "website" | "text"
export type SourceStatus = "pending" | "syncing" | "ready" | "failed"

export interface KnowledgeSource {
  id: string
  kind: SourceKind
  title: string
  url: string | null
  /** Text sources only: the beginning of the content. */
  preview: string | null
  /** The text source answers from the analytics page are appended to. */
  managed: boolean
  status: SourceStatus
  error: string | null
  pages: number
  chunks: number
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
  synced_at: Date | null
  created_at: Date
  updated_at: Date
}

const COLUMNS = `id, kind, title, url, left(content, 240) as preview, managed, status, error, pages, chunks, synced_at, created_at, updated_at`

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
  syncedAt: r.synced_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function editableBot(db: Db, userId: string) {
  const bot = await getBotForUser(db, userId)
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

export async function listSources(db: Db, userId: string): Promise<KnowledgeSource[]> {
  const bot = await getBotForUser(db, userId)
  const { rows } = await db.query<SourceRow>(
    `select ${COLUMNS} from app.knowledge_sources where bot_id = $1 order by created_at desc`,
    [bot.id],
  )
  return rows.map(toSource)
}

/** Adds a website to crawl. `url` must already be normalized; the caller starts the sync. */
export async function addWebsiteSource(db: Db, userId: string, url: string, title?: string): Promise<KnowledgeSource> {
  const bot = await editableBot(db, userId)
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
      [bot.id, cleanTitle(title || new URL(url).hostname + (new URL(url).pathname === "/" ? "" : new URL(url).pathname)), url, userId],
    )
    return toSource(rows[0])
  })
}

/** Adds pasted text, already chunked by the caller; it is searchable immediately. */
export async function addTextSource(
  db: Db,
  userId: string,
  input: { title: unknown; content: unknown },
  chunk: (title: string, content: string) => ChunkRecord[],
): Promise<KnowledgeSource> {
  const bot = await editableBot(db, userId)
  const title = cleanTitle(input.title)
  const content = typeof input.content === "string" ? input.content.trim() : ""
  if (content.length < 20) throw new KnowledgeError("invalid_input", "Add at least a sentence or two of text")
  if (content.length > KNOWLEDGE_LIMITS.textChars) {
    throw new KnowledgeError("invalid_input", `Keep each text under ${KNOWLEDGE_LIMITS.textChars.toLocaleString("en")} characters, or split it in two`)
  }
  return db.transaction(async (tx) => {
    await tx.query("select id from app.bots where id = $1 for update", [bot.id])
    await checkRoom(tx, bot.id)
    const chunks = chunk(title, content)
    const room = await chunkRoom(tx, bot.id, null)
    if (chunks.length > room) throw new KnowledgeError("limit", "Your knowledge base is full. Remove a source to add more")
    const { rows } = await tx.query<SourceRow>(
      `insert into app.knowledge_sources (bot_id, kind, title, content, status, chunks, synced_at, created_by)
       values ($1, 'text', $2, $3, 'ready', $4, now(), $5) returning ${COLUMNS}`,
      [bot.id, title, content, chunks.length, userId],
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
  userId: string,
  input: { question: unknown; answer: unknown; replyIds: unknown; title: string },
  chunk: (title: string, content: string) => ChunkRecord[],
): Promise<{ source: KnowledgeSource; resolved: number }> {
  const bot = await editableBot(db, userId)
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
        [bot.id, title, content, chunks.length, userId],
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
export async function startSync(db: Db, userId: string, sourceId: string): Promise<KnowledgeSource & { botId: string; url: string }> {
  const bot = await editableBot(db, userId)
  if (!UUID.test(sourceId)) throw new KnowledgeError("not_found", "That source doesn't exist")
  const running = await db.query<{ n: number }>(
    `select count(*)::int as n from app.knowledge_sources
      where bot_id = $1 and id <> $2 and status = 'syncing' and updated_at >= now() - make_interval(secs => $3)`,
    [bot.id, sourceId, STALE_SYNC_MS / 1000],
  )
  if (running.rows[0].n >= KNOWLEDGE_LIMITS.concurrentSyncs) {
    throw new KnowledgeError("busy", "Other websites are still being read. Try again when they're done")
  }
  const { rows } = await db.query<SourceRow>(
    `update app.knowledge_sources set status = 'syncing', error = null
      where id = $1 and bot_id = $2 and kind = 'website'
        and (status <> 'syncing' or updated_at < now() - make_interval(secs => $3))
      returning ${COLUMNS}`,
    [sourceId, bot.id, STALE_SYNC_MS / 1000],
  )
  if (!rows[0]) {
    const exists = await db.query("select 1 from app.knowledge_sources where id = $1 and bot_id = $2 and kind = 'website'", [sourceId, bot.id])
    throw exists.rows.length
      ? new KnowledgeError("busy", "This website is already being read")
      : new KnowledgeError("not_found", "That source doesn't exist")
  }
  return { ...toSource(rows[0]), botId: bot.id, url: rows[0].url! }
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

export async function deleteSource(db: Db, userId: string, sourceId: string): Promise<void> {
  const bot = await editableBot(db, userId)
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
