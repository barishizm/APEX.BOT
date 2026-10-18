import type { Queryable } from "./db.ts"
import { AdminError } from "./admin.ts"
import type { ActionChange } from "./admin-users.ts"
import type { ListSpec } from "./admin-list.ts"
import { KnowledgeError, startAdminSync, type ClaimedSync } from "./knowledge.ts"
import { CRAWL_PAGE_CEILING, PLAN_LIMITS, PLANS } from "./plans.ts"

// Every knowledge source on the platform in the admin area (/admin/knowledge), what staff can do to
// one, how much of each bot's knowledge has embeddings, and the runs of the daily refresh job. Like the
// other admin modules, the actions run in the caller's transaction (withAdminAction) and return the
// state before and after for the audit entry.

/** A sync "syncing" longer than this is stuck: its function call died (crawls stop at 5 minutes). */
export const KNOWLEDGE_STUCK_MINUTES = 15
export const KNOWLEDGE_AUDIT_LIMIT = 50
export const COVERAGE_LIMIT = 100
/** The daily refresh (/api/cron/knowledge-refresh), as named in app.job_runs. */
export const KNOWLEDGE_REFRESH_JOB = "knowledge.refresh"

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

const STUCK = `(s.status = 'syncing' and s.updated_at < now() - interval '${KNOWLEDGE_STUCK_MINUTES} minutes')`
// The plan's own page limit, before the crawl ceiling (plan names and limits are this package's constants)
const PLAN_CASES = PLANS.map((p) => `when '${p}' then ${Number(PLAN_LIMITS[p].websitePages)}`).join(" ")
const FREE_PAGES = Number(PLAN_LIMITS.free.websitePages)
const PLAN_PAGES = `(case o.plan ${PLAN_CASES} else ${FREE_PAGES} end)`
// A website read up to CRAWL_PAGE_CEILING whose plan allows more: the ceiling, not the plan, cut it short
const AT_CEILING = `(s.kind = 'website' and s.pages >= ${CRAWL_PAGE_CEILING} and ${PLAN_PAGES} > ${CRAWL_PAGE_CEILING})`

export type AdminSourceStatus = "pending" | "syncing" | "ready" | "failed"

// --- List ---

export interface AdminKnowledgeRow {
  id: string
  kind: "website" | "text" | "file"
  title: string
  url: string | null
  status: AdminSourceStatus
  stuck: boolean
  error: string | null
  pages: number
  chunks: number
  refresh: "off" | "daily" | "weekly"
  at_ceiling: boolean
  plan_pages: number
  synced_at: Date | null
  updated_at: Date
  created_at: Date
  bot_id: string
  bot_name: string
  organization_id: string
  organization_name: string
}

export const ADMIN_KNOWLEDGE_LIST = {
  select: `s.id, s.kind, s.title, s.url, s.status, ${STUCK} as stuck, s.error, s.pages, s.chunks, s.refresh,
    ${AT_CEILING} as at_ceiling, ${PLAN_PAGES} as plan_pages, s.synced_at, s.updated_at, s.created_at,
    b.id as bot_id, b.name as bot_name, o.id as organization_id, o.name as organization_name`,
  from: `app.knowledge_sources s
    join app.bots b on b.id = s.bot_id
    join app.organizations o on o.id = b.organization_id`,
  id: { sql: "s.id", type: "uuid" },
  sorts: {
    created: { sql: "s.created_at", type: "timestamptz" },
    updated: { sql: "s.updated_at", type: "timestamptz" },
    synced: { sql: "coalesce(s.synced_at, '-infinity')", type: "timestamptz" },
    title: { sql: "lower(s.title)", type: "text" },
    pages: { sql: "s.pages", type: "int" },
    chunks: { sql: "s.chunks", type: "int" },
  },
  defaultSort: { key: "updated", dir: "desc" },
  search: ["s.title", "coalesce(s.url, '')", "b.name", "o.name", "s.id::text", "b.id::text", "coalesce(s.error, '')"],
  filters: {
    status: {
      pending: "s.status = 'pending'",
      syncing: `s.status = 'syncing' and not ${STUCK}`,
      stuck: STUCK,
      ready: "s.status = 'ready'",
      failed: "s.status = 'failed'",
    },
    kind: { website: "s.kind = 'website'", text: "s.kind = 'text'", file: "s.kind = 'file'" },
    refresh: {
      off: "s.kind = 'website' and s.refresh = 'off'",
      daily: "s.kind = 'website' and s.refresh = 'daily'",
      weekly: "s.kind = 'website' and s.refresh = 'weekly'",
    },
    synced: {
      "24h": "s.synced_at >= now() - interval '24 hours'",
      "7d": "s.synced_at >= now() - interval '7 days'",
      stale: "s.synced_at < now() - interval '30 days'",
      never: "s.synced_at is null",
    },
    error: { yes: "s.error is not null", no: "s.error is null" },
    ceiling: { yes: AT_CEILING },
  },
} satisfies ListSpec

// --- Overview ---

export interface KnowledgeSummary {
  sources: number
  websites: number
  chunks: number
  pending: number
  syncing: number
  stuck: number
  failed: number
  atCeiling: number
}

/** The counts at the top of /admin/knowledge. */
export async function adminKnowledgeSummary(q: Queryable): Promise<KnowledgeSummary> {
  const { rows } = await q.query<KnowledgeSummary>(
    `select count(*)::int as sources,
            count(*) filter (where s.kind = 'website')::int as websites,
            coalesce(sum(s.chunks), 0)::int as chunks,
            count(*) filter (where s.status = 'pending')::int as pending,
            count(*) filter (where s.status = 'syncing' and not ${STUCK})::int as syncing,
            count(*) filter (where ${STUCK})::int as stuck,
            count(*) filter (where s.status = 'failed')::int as failed,
            count(*) filter (where ${AT_CEILING})::int as "atCeiling"
       from app.knowledge_sources s
       join app.bots b on b.id = s.bot_id
       join app.organizations o on o.id = b.organization_id`,
  )
  return rows[0]!
}

export interface EmbeddingCoverageRow {
  botId: string
  botName: string
  organizationId: string
  organizationName: string
  chunks: number
  /** Chunks with a vector from `model`. */
  embedded: number
  /** Vectors stored under other models (left over from an earlier APEX_EMBEDDINGS; the chat API prunes them). */
  otherModels: number
}

/**
 * Per bot: its chunks and how many of them have a vector from `model` ("provider:model@dims", the
 * chat API's APEX_EMBEDDINGS). A vector is keyed by sha256 of the chunk's title and text
 * (chunkHash in @apex/knowledge), which Postgres computes here. Least covered first, then biggest.
 */
export async function embeddingCoverage(q: Queryable, model: string, limit = COVERAGE_LIMIT): Promise<EmbeddingCoverageRow[]> {
  const { rows } = await q.query<EmbeddingCoverageRow>(
    `with per_bot as (
       select c.bot_id, count(*)::int as chunks,
              count(*) filter (where exists (
                select 1 from app.knowledge_embeddings e
                 where e.bot_id = c.bot_id and e.model = $1 and e.hash = sha256(convert_to(c.title || E'\\n' || c.text, 'UTF8'))))::int as embedded
         from app.knowledge_chunks c
        group by c.bot_id
     )
     select b.id as "botId", b.name as "botName", o.id as "organizationId", o.name as "organizationName", p.chunks, p.embedded,
            (select count(*)::int from app.knowledge_embeddings e where e.bot_id = b.id and e.model <> $1) as "otherModels"
       from per_bot p
       join app.bots b on b.id = p.bot_id
       join app.organizations o on o.id = b.organization_id
      order by p.embedded::float / p.chunks, p.chunks desc, b.id
      limit $2`,
    [model, limit],
  )
  return rows
}

// --- Job runs ---

export interface JobRun {
  id: string
  job: string
  startedAt: Date
  finishedAt: Date | null
  ok: boolean | null
  result: unknown
  error: string | null
}

/** Opens a run of `job` and returns its id, for finishJobRun. Prunes the runs older than 90 days. */
export async function startJobRun(q: Queryable, job: string): Promise<string> {
  await q.query("delete from app.job_runs where started_at < now() - interval '90 days'")
  const { rows } = await q.query<{ id: string }>("insert into app.job_runs (job) values ($1) returning id::text", [job])
  return rows[0]!.id
}

export async function finishJobRun(q: Queryable, id: string, outcome: { ok: boolean; result?: unknown; error?: string | null }): Promise<void> {
  await q.query("update app.job_runs set finished_at = now(), ok = $2, result = $3::jsonb, error = $4 where id = $1::bigint", [
    id,
    outcome.ok,
    outcome.result === undefined ? null : JSON.stringify(outcome.result),
    outcome.error ? outcome.error.slice(0, 1000) : null,
  ])
}

/** The latest runs of `job`, newest first. */
export async function recentJobRuns(q: Queryable, job: string, limit = 10): Promise<JobRun[]> {
  const { rows } = await q.query<JobRun>(
    `select id::text, job, started_at as "startedAt", finished_at as "finishedAt", ok, result, error
       from app.job_runs where job = $1 order by started_at desc, id desc limit $2`,
    [job, limit],
  )
  return rows.map((r) => ({ ...r, result: typeof r.result === "string" ? JSON.parse(r.result) : r.result }))
}

// --- Detail ---

export interface AdminKnowledgeSource {
  id: string
  kind: "website" | "text" | "file"
  title: string
  url: string | null
  /** Text and file sources: the beginning of the content. */
  preview: string | null
  managed: boolean
  status: AdminSourceStatus
  stuck: boolean
  error: string | null
  pages: number
  chunks: number
  /** Chunks actually stored; differs from `chunks` only while something is wrong. */
  storedChunks: number
  refresh: "off" | "daily" | "weekly"
  syncedAt: Date | null
  createdAt: Date
  updatedAt: Date
  createdByName: string | null
  botId: string
  botName: string
  organizationId: string
  organizationName: string
  plan: string
  /** The plan's own website page limit and what a crawl actually reads (CRAWL_PAGE_CEILING). */
  planPages: number
  pageLimit: number
  atCeiling: boolean
}

export interface AdminKnowledgeAuditEntry {
  id: string
  action: string
  reason: string | null
  actorName: string | null
  createdAt: Date
}

export interface AdminKnowledgeDetail {
  source: AdminKnowledgeSource
  audit: AdminKnowledgeAuditEntry[]
}

/** Everything the detail page shows; null when there is no such source. Staff only: check before calling. */
export async function getAdminKnowledgeDetail(q: Queryable, sourceId: string): Promise<AdminKnowledgeDetail | null> {
  if (!isUuid(sourceId)) return null
  const { rows } = await q.query<Omit<AdminKnowledgeSource, "pageLimit">>(
    `select s.id, s.kind, s.title, s.url, left(s.content, 240) as preview, s.managed, s.status, ${STUCK} as stuck, s.error, s.pages, s.chunks,
            (select count(*)::int from app.knowledge_chunks c where c.source_id = s.id) as "storedChunks",
            s.refresh, s.synced_at as "syncedAt", s.created_at as "createdAt", s.updated_at as "updatedAt",
            coalesce(u.display_name, u.username) as "createdByName",
            b.id as "botId", b.name as "botName", o.id as "organizationId", o.name as "organizationName", o.plan,
            ${PLAN_PAGES} as "planPages", ${AT_CEILING} as "atCeiling"
       from app.knowledge_sources s
       join app.bots b on b.id = s.bot_id
       join app.organizations o on o.id = b.organization_id
       left join app.users u on u.id = s.created_by
      where s.id = $1`,
    [sourceId],
  )
  const r = rows[0]
  if (!r) return null
  const audit = await q.query<AdminKnowledgeAuditEntry>(
    `select l.id::text, l.action, l.reason, coalesce(a.display_name, a.username) as "actorName", l.created_at as "createdAt"
       from app.admin_audit_log l left join app.users a on a.id = l.actor_id
      where l.target_type = 'knowledge_source' and l.target_id = $1
      order by l.id desc limit $2`,
    [sourceId, KNOWLEDGE_AUDIT_LIMIT],
  )
  return { source: { ...r, pageLimit: Math.min(r.planPages, CRAWL_PAGE_CEILING) }, audit: audit.rows }
}

// --- Actions ---

interface SourceLockRow {
  id: string
  bot_id: string
  kind: string
  title: string
  url: string | null
  status: AdminSourceStatus
  error: string | null
  refresh: string
  pages: number
  chunks: number
  synced_at: Date | null
  updated_at: Date
}

async function lockSource(tx: Queryable, sourceId: string): Promise<SourceLockRow> {
  if (!isUuid(sourceId)) throw new AdminError("not_found", "Source not found")
  const { rows } = await tx.query<SourceLockRow>(
    "select id, bot_id, kind, title, url, status, error, refresh, pages, chunks, synced_at, updated_at from app.knowledge_sources where id = $1 for update",
    [sourceId],
  )
  if (!rows[0]) throw new AdminError("not_found", "Source not found")
  return rows[0]
}

const state = (s: SourceLockRow) => ({ status: s.status, error: s.error, refresh: s.refresh, pages: s.pages, chunks: s.chunks, syncedAt: s.synced_at })

/**
 * Claims a website source for a new crawl, as the owner's "Sync" does; the caller crawls it once
 * this transaction commits (crawlInto). A stuck sync counts as over, so this restarts it too.
 */
export async function adminResyncSource(tx: Queryable, sourceId: string): Promise<ActionChange<{ claimed: ClaimedSync }>> {
  const before = await lockSource(tx, sourceId)
  if (before.kind !== "website") throw new AdminError("invalid_input", "Only websites can be synced again")
  try {
    const claimed = await startAdminSync(tx, sourceId)
    return { before: state(before), after: { status: "syncing" }, extra: { claimed } }
  } catch (err) {
    if (err instanceof KnowledgeError) throw new AdminError(err.code === "not_found" ? "not_found" : "invalid_input", err.message)
    throw err
  }
}

/**
 * Ends a sync left "syncing": a source that was read before goes back to "ready" with its old
 * content (a crawl replaces the chunks only when it finishes), one that never was is "failed",
 * so the owner can try again.
 */
export async function adminResetSync(tx: Queryable, sourceId: string): Promise<ActionChange> {
  const s = await lockSource(tx, sourceId)
  if (s.status !== "syncing") throw new AdminError("invalid_input", "This source isn't syncing")
  const { rows } = await tx.query<{ status: AdminSourceStatus; error: string | null }>(
    `update app.knowledge_sources
        set status = case when synced_at is not null then 'ready' else 'failed' end,
            error = case when synced_at is not null then null else 'The sync was interrupted. Try again' end
      where id = $1 returning status, error`,
    [sourceId],
  )
  return { before: state(s), after: rows[0], extra: {} }
}

/** Stops the scheduled refresh of a website; the owner can turn it back on in the dashboard. */
export async function adminDisableRefresh(tx: Queryable, sourceId: string): Promise<ActionChange> {
  const s = await lockSource(tx, sourceId)
  if (s.kind !== "website") throw new AdminError("invalid_input", "Only websites are refreshed")
  if (s.refresh === "off") throw new AdminError("invalid_input", "Refresh is already off for this website")
  await tx.query("update app.knowledge_sources set refresh = 'off' where id = $1", [sourceId])
  return { before: { refresh: s.refresh }, after: { refresh: "off" }, extra: {} }
}

/** Deletes the source and its chunks; the chat API drops them on its next sync. */
export async function adminDeleteSource(tx: Queryable, sourceId: string): Promise<ActionChange<{ botId: string }>> {
  const s = await lockSource(tx, sourceId)
  await tx.query("delete from app.knowledge_sources where id = $1", [sourceId])
  await tx.query("update app.bots set knowledge_version = knowledge_version + 1 where id = $1", [s.bot_id])
  // the content itself isn't kept: it's the customer's, and deleting it is the point
  return { before: { botId: s.bot_id, kind: s.kind, title: s.title, url: s.url, ...state(s) }, after: null, extra: { botId: s.bot_id } }
}
