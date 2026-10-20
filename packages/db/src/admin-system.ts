import type { Queryable } from "./db.ts"
import { MIGRATION_NAMES } from "./schema-version.ts"
import { maskPII } from "./pii.ts"
import { TOPIC_LOOKBACK_DAYS } from "./topics.ts"
import { RETENTION_DAYS_SQL } from "./conversations.ts"

// /admin/system: which migrations the database has, the background queues (topic labels, embeddings,
// the retention sweep) and the mail the provider refused. Platform-wide reads, staff only.

/** The chat API's hourly retention sweep, as named in app.job_runs. */
export const RETENTION_SWEEP_JOB = "retention.sweep"
/** Mail failures shown on /admin/system. */
export const EMAIL_FAILURE_LIMIT = 20
/** How long a mail failure is kept. */
export const EMAIL_FAILURE_DAYS = 30

// ---------- Migrations ----------

export interface MigrationStatus {
  /** Applied migrations this code knows, in order. */
  applied: { name: string; appliedAt: Date }[]
  /** Migrations this code expects that the database hasn't applied (run `npm run db:migrate`). */
  pending: string[]
  /** Applied migrations this code doesn't know: the database is ahead of this deployment. */
  unknown: { name: string; appliedAt: Date }[]
}

export async function migrationStatus(q: Queryable): Promise<MigrationStatus> {
  const { rows: exists } = await q.query<{ exists: boolean }>("select to_regclass('app.schema_migrations') is not null as exists")
  if (!exists[0]?.exists) return { applied: [], pending: [...MIGRATION_NAMES], unknown: [] }
  const { rows } = await q.query<{ name: string; appliedAt: Date }>(`select name, applied_at as "appliedAt" from app.schema_migrations order by name`)
  const byName = new Map(rows.map((r) => [r.name, r]))
  const known = new Set<string>(MIGRATION_NAMES)
  return {
    applied: MIGRATION_NAMES.filter((n) => byName.has(n)).map((n) => byName.get(n)!),
    pending: MIGRATION_NAMES.filter((n) => !byName.has(n)),
    unknown: rows.filter((r) => !known.has(r.name)),
  }
}

// ---------- Background queues ----------

export interface SystemQueues {
  /** Visitor questions from the labeler's lookback window still without a topic. */
  unlabeledTopics: number
  oldestUnlabeledAt: Date | null
  /** Conversations past their bot's retention that the next sweep will delete. */
  overdueConversations: number
  /** Chunks and how many have a vector from the API's embedding model; null when search is keyword-only. */
  embeddings: { model: string; bots: number; chunks: number; embedded: number } | null
}

export async function systemQueues(q: Queryable, embeddingModel: string | null): Promise<SystemQueues> {
  // the same predicates as unlabeledQuestions and sweepConversations; the first uses messages_unlabeled_idx
  const [topics, retention, embeddings] = await Promise.all([
    q.query<{ n: number; oldest: Date | null }>(
      `select count(*)::int as n, min(created_at) as oldest from app.messages
        where role = 'user' and topic is null and created_at > now() - make_interval(days => ${TOPIC_LOOKBACK_DAYS})`,
    ),
    q.query<{ n: number }>(
      `select count(*)::int as n from app.conversations c join app.bots b on b.id = c.bot_id
        where c.updated_at < now() - make_interval(days => ${RETENTION_DAYS_SQL})`,
    ),
    embeddingModel
      ? q.query<{ bots: number; chunks: number; embedded: number }>(
          `select count(distinct c.bot_id)::int as bots, count(*)::int as chunks,
                  count(*) filter (where exists (
                    select 1 from app.knowledge_embeddings e
                     where e.bot_id = c.bot_id and e.model = $1 and e.hash = sha256(convert_to(c.title || E'\\n' || c.text, 'UTF8'))))::int as embedded
             from app.knowledge_chunks c`,
          [embeddingModel],
        )
      : null,
  ])
  return {
    unlabeledTopics: topics.rows[0]?.n ?? 0,
    oldestUnlabeledAt: topics.rows[0]?.oldest ?? null,
    overdueConversations: retention.rows[0]?.n ?? 0,
    embeddings: embeddingModel && embeddings ? { model: embeddingModel, ...embeddings.rows[0]! } : null,
  }
}

// ---------- Mail failures ----------

/** "jane.doe@example.com" → "j***@e***.com": enough to tell addresses apart, not to read one. */
export function maskEmailAddress(address: string): string {
  const at = address.lastIndexOf("@")
  if (at < 1) return maskPII(address).slice(0, 200)
  const domain = address.slice(at + 1)
  const dot = domain.lastIndexOf(".")
  const host = dot > 0 ? domain.slice(0, dot) : domain
  const tld = dot > 0 ? domain.slice(dot) : ""
  return `${address[0]}***@${host[0] ?? ""}***${tld}`.slice(0, 200)
}

export interface EmailFailureInput {
  source: "web" | "api"
  kind: string
  to: string
  status?: number | null
  error?: string | null
}

export interface EmailFailure {
  id: string
  source: "web" | "api"
  kind: string
  recipient: string
  status: number | null
  error: string | null
  createdAt: Date
}

/** Records a mail that didn't go out; the address and the error are masked before they are stored. */
export async function recordEmailFailure(q: Queryable, f: EmailFailureInput): Promise<void> {
  const kind = /^[a-z0-9_.-]{1,60}$/.test(f.kind) ? f.kind : "other"
  const error = f.error ? maskPII(f.error).replace(/\s+/g, " ").trim().slice(0, 500) : null
  await q.query(`delete from app.email_failures where created_at < now() - make_interval(days => ${EMAIL_FAILURE_DAYS})`)
  await q.query("insert into app.email_failures (source, kind, recipient, status, error) values ($1, $2, $3, $4, $5)", [
    f.source,
    kind,
    maskEmailAddress(f.to),
    Number.isInteger(f.status) ? f.status : null,
    error || null,
  ])
}

export interface EmailFailures {
  recent: EmailFailure[]
  last24h: number
  last7d: number
}

export async function recentEmailFailures(q: Queryable, limit = EMAIL_FAILURE_LIMIT): Promise<EmailFailures> {
  const [{ rows }, { rows: counts }] = await Promise.all([
    q.query<EmailFailure>(
      `select id::text, source, kind, recipient, status, error, created_at as "createdAt"
         from app.email_failures order by created_at desc, id desc limit $1`,
      [limit],
    ),
    q.query<{ day: number; week: number }>(
      `select count(*) filter (where created_at > now() - interval '1 day')::int as day,
              count(*) filter (where created_at > now() - interval '7 days')::int as week
         from app.email_failures`,
    ),
  ])
  return { recent: rows, last24h: counts[0]?.day ?? 0, last7d: counts[0]?.week ?? 0 }
}
