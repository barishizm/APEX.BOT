import type { Queryable } from "./db.ts"
import type { ListSpec } from "./admin-list.ts"

// /admin/audit: every staff action from app.admin_audit_log, which a trigger keeps append-only
// (migration 0029). Nothing here writes to it; writeAudit in admin.ts is the only writer.

export interface AuditRow {
  id: string
  actor_id: string | null
  /** The actor's name now, or null once their account is gone. */
  actor_name: string | null
  /** The actor's email now, or the one recorded with the entry once the account is gone. */
  actor_email: string | null
  action: string
  target_type: string
  target_id: string | null
  /** What the target is called now (an account's email, a workspace's or bot's name), when it still exists. */
  target_label: string | null
  reason: string | null
  before: unknown
  after: unknown
  ip: string | null
  created_at: Date
}

// What a target id names, for the target types that have a name
const TARGET_LABEL = `case l.target_type
    when 'user' then (select u.email from app.users u where u.id::text = l.target_id)
    when 'organization' then (select o.name from app.organizations o where o.id::text = l.target_id)
    when 'bot' then (select b.name from app.bots b where b.id::text = l.target_id)
    when 'knowledge_source' then (select s.title from app.knowledge_sources s where s.id::text = l.target_id)
  end`

const AUDIT_SELECT = `l.id::text as id, l.actor_id, coalesce(a.display_name, a.username) as actor_name,
    coalesce(a.email, l.actor_email) as actor_email, l.action, l.target_type, l.target_id, ${TARGET_LABEL} as target_label,
    l.reason, l.before, l.after, host(l.ip) as ip, l.created_at`
const AUDIT_FROM = "app.admin_audit_log l left join app.users a on a.id = l.actor_id"

/** app.admin_audit_log, newest first. */
export const ADMIN_AUDIT_LIST = {
  select: AUDIT_SELECT,
  from: AUDIT_FROM,
  id: { sql: "l.id", type: "bigint" },
  sorts: { created: { sql: "l.created_at", type: "timestamptz" } },
  defaultSort: { key: "created", dir: "desc" },
  search: ["l.action", "l.target_id", "l.reason", "l.actor_email", "a.email", "a.username", "host(l.ip)"],
  filters: {
    created: {
      "24h": "l.created_at >= now() - interval '24 hours'",
      "7d": "l.created_at >= now() - interval '7 days'",
      "30d": "l.created_at >= now() - interval '30 days'",
      "90d": "l.created_at >= now() - interval '90 days'",
      "365d": "l.created_at >= now() - interval '365 days'",
    },
    // "system": the bootstrap and other entries without a staff member behind them
    actorKind: { staff: "l.actor_id is not null", system: "l.actor_id is null" },
  },
  valueFilters: {
    actor: { sql: "l.actor_id = {}", type: "uuid" },
    action: { sql: "l.action = {}", type: "text" },
    targetType: { sql: "l.target_type = {}", type: "text" },
    target: { sql: "l.target_id = {}", type: "text" },
    // whole UTC days, both ends included
    from: { sql: "l.created_at >= ({}::timestamp at time zone 'utc')", type: "date" },
    to: { sql: "l.created_at < ({}::timestamp at time zone 'utc') + interval '1 day'", type: "date" },
  },
} satisfies ListSpec

export interface AuditFacets {
  actors: { id: string; label: string }[]
  actions: string[]
  targetTypes: string[]
}

/** The values the audit filters can take: everyone who acted, every action and target type logged. */
export async function auditFacets(q: Queryable): Promise<AuditFacets> {
  const [actors, actions, types] = await Promise.all([
    q.query<{ id: string; label: string }>(
      `select l.actor_id as id, coalesce(max(a.email), max(l.actor_email), l.actor_id::text) as label
         from app.admin_audit_log l left join app.users a on a.id = l.actor_id
        where l.actor_id is not null group by l.actor_id order by 2`,
    ),
    q.query<{ action: string }>("select distinct action from app.admin_audit_log order by 1"),
    q.query<{ target_type: string }>("select distinct target_type from app.admin_audit_log order by 1"),
  ])
  return { actors: actors.rows, actions: actions.rows.map((r) => r.action), targetTypes: types.rows.map((r) => r.target_type) }
}

export interface AuditEntryDetail extends AuditRow {
  user_agent: string | null
}

/** One entry with everything recorded about it, or null. */
export async function getAuditEntry(q: Queryable, id: string): Promise<AuditEntryDetail | null> {
  if (!/^\d{1,18}$/.test(id)) return null
  const { rows } = await q.query<AuditEntryDetail>(
    `select ${AUDIT_SELECT}, l.user_agent from ${AUDIT_FROM} where l.id = $1::bigint`,
    [id],
  )
  return rows[0] ?? null
}

export type DiffKind = "added" | "removed" | "changed" | "same"

export interface DiffLine {
  /** Dotted path, e.g. "settings.security.dailyTokenBudget"; "" for a value that isn't an object. */
  path: string
  kind: DiffKind
  before?: unknown
  after?: unknown
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

/**
 * The difference between an entry's before and after, one line per leaf. Objects are compared key
 * by key (nested ones flattened into dotted paths); arrays and other values as a whole.
 */
export function auditDiff(before: unknown, after: unknown, path = ""): DiffLine[] {
  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    return keys.flatMap((k) => {
      const p = path ? `${path}.${k}` : k
      if (!(k in before)) return leaves(after[k], p, "added")
      if (!(k in after)) return leaves(before[k], p, "removed")
      return auditDiff(before[k], after[k], p)
    })
  }
  if (before === undefined || before === null) {
    if (after === undefined || after === null) return []
    return isObject(after) ? leaves(after, path, "added") : [{ path, kind: "added", after }]
  }
  if (after === undefined || after === null) return isObject(before) ? leaves(before, path, "removed") : [{ path, kind: "removed", before }]
  const same = JSON.stringify(before) === JSON.stringify(after)
  return [{ path, kind: same ? "same" : "changed", before, after }]
}

function leaves(value: unknown, path: string, kind: "added" | "removed"): DiffLine[] {
  if (isObject(value) && Object.keys(value).length) {
    return Object.keys(value)
      .sort()
      .flatMap((k) => leaves(value[k], path ? `${path}.${k}` : k, kind))
  }
  return [kind === "added" ? { path, kind, after: value } : { path, kind, before: value }]
}
