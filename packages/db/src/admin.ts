import { isIP } from "node:net"
import type { Db, Queryable } from "./db.ts"
import { normalizeEmail } from "./auth.ts"
import type { ListSpec } from "./admin-list.ts"
import { DEFAULT_SETTINGS, LIMITS } from "./bot-settings.ts"
import { PLANS, type Plan } from "./plans.ts"
import { missingMigrations } from "./schema-version.ts"

// Staff of the platform itself (app.users.platform_role), separate from workspace roles.
export type PlatformRole = "superadmin" | "support"
export const PLATFORM_ROLES: readonly PlatformRole[] = ["superadmin", "support"]
/** Roles the admin UI may hand out. Superadmin comes only from bootstrapSuperadmin. */
export type AssignablePlatformRole = Exclude<PlatformRole, "superadmin">

export class AdminError extends Error {
  constructor(
    readonly code: "not_found" | "forbidden" | "already_bootstrapped" | "invalid_input",
    message: string,
  ) {
    super(message)
    this.name = "AdminError"
  }
}

const toRole = (raw: unknown): PlatformRole | null => (PLATFORM_ROLES.includes(raw as PlatformRole) ? (raw as PlatformRole) : null)

/** The user's platform role; null for customers and for suspended staff. */
export async function getPlatformRole(q: Queryable, userId: string): Promise<PlatformRole | null> {
  const { rows } = await q.query<{ platform_role: string | null }>(
    "select platform_role from app.users where id = $1 and suspended_at is null",
    [userId],
  )
  return toRole(rows[0]?.platform_role)
}

/** Whether the user is platform staff; pass a role to require exactly that one. */
export async function isPlatformAdmin(q: Queryable, userId: string, role?: PlatformRole): Promise<boolean> {
  const actual = await getPlatformRole(q, userId)
  return actual !== null && (role === undefined || actual === role)
}

export interface AuditEntry {
  /** The staff member; null for system actions such as the bootstrap. */
  actorId: string | null
  /** What was done, e.g. "user.suspend" or "bot.disable". */
  action: string
  /** What it was done to, e.g. "user", "organization", "bot", "setting". */
  targetType: string
  targetId?: string | null
  reason?: string | null
  before?: unknown
  after?: unknown
  ip?: string | null
  userAgent?: string | null
}

const cleanIp = (ip?: string | null) => (ip && isIP(ip) ? ip : null)
const json = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v))

/**
 * Appends one entry to app.admin_audit_log. Pass the transaction the change itself runs in. Entries
 * can't be changed or deleted afterwards (a trigger refuses it); the actor's email is kept with them.
 */
export async function writeAudit(q: Queryable, entry: AuditEntry): Promise<string> {
  if (!entry.action || !entry.targetType) throw new AdminError("invalid_input", "An audit entry needs an action and a target type")
  const { rows } = await q.query<{ id: string }>(
    `insert into app.admin_audit_log (actor_id, actor_email, action, target_type, target_id, reason, before, after, ip, user_agent)
     values ($1, (select email from app.users where id = $1::uuid), $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9) returning id::text`,
    [
      entry.actorId,
      entry.action.slice(0, 100),
      entry.targetType.slice(0, 50),
      entry.targetId?.slice(0, 200) ?? null,
      entry.reason?.slice(0, 1000) ?? null,
      json(entry.before),
      json(entry.after),
      cleanIp(entry.ip),
      entry.userAgent ? entry.userAgent.slice(0, 512) : null,
    ],
  )
  return rows[0]!.id
}

/**
 * The checks and the change behind setPlatformRole, without the audit entry, for callers that
 * write their own (withAdminAction). Run it in a transaction. Nothing changes when the role is the same.
 */
export async function changePlatformRole(
  tx: Queryable,
  actorId: string,
  userId: string,
  role: AssignablePlatformRole | null,
): Promise<{ before: PlatformRole | null; after: PlatformRole | null }> {
  if (role !== null && role !== "support") throw new AdminError("forbidden", "That role can't be assigned here")
  if (!(await isPlatformAdmin(tx, actorId, "superadmin"))) throw new AdminError("forbidden", "Only a superadmin can change staff roles")
  const { rows } = await tx.query<{ platform_role: string | null }>("select platform_role from app.users where id = $1 for update", [userId])
  if (!rows.length) throw new AdminError("not_found", "User not found")
  const before = toRole(rows[0]!.platform_role)
  if (before === "superadmin") throw new AdminError("forbidden", "A superadmin's role can't be changed here")
  if (before !== role) await tx.query("update app.users set platform_role = $1 where id = $2", [role, userId])
  return { before, after: role }
}

/**
 * Gives or takes away a support role, from the admin UI. Only a superadmin may do it, and it can
 * neither grant superadmin nor change a superadmin: that role is set once, by bootstrapSuperadmin.
 */
export async function setPlatformRole(
  db: Db,
  actor: { id: string; ip?: string | null; userAgent?: string | null },
  userId: string,
  role: AssignablePlatformRole | null,
  reason?: string,
): Promise<void> {
  if (role !== null && role !== "support") throw new AdminError("forbidden", "That role can't be assigned here")
  await db.transaction(async (tx) => {
    if (!(await isPlatformAdmin(tx, actor.id, "superadmin"))) throw new AdminError("forbidden", "Only a superadmin can change staff roles")
    const { rows } = await tx.query<{ platform_role: string | null }>("select platform_role from app.users where id = $1 for update", [userId])
    if (!rows.length) throw new AdminError("not_found", "User not found")
    const before = rows[0]!.platform_role
    if (before === "superadmin") throw new AdminError("forbidden", "A superadmin's role can't be changed here")
    if (before === role) return
    await tx.query("update app.users set platform_role = $1 where id = $2", [role, userId])
    await writeAudit(tx, {
      actorId: actor.id,
      action: "user.platform_role",
      targetType: "user",
      targetId: userId,
      reason,
      before: { platformRole: before },
      after: { platformRole: role },
      ip: actor.ip,
      userAgent: actor.userAgent,
    })
  })
}

/**
 * Makes the account with this email the first superadmin. Works once: when a superadmin exists it
 * does nothing for that same account and refuses any other. The account must already exist.
 */
export async function bootstrapSuperadmin(db: Db, rawEmail: unknown): Promise<{ userId: string; created: boolean }> {
  const email = normalizeEmail(rawEmail)
  return db.transaction(async (tx) => {
    // serialize concurrent runs so two can't both see "no superadmin yet"
    await tx.query("select pg_advisory_xact_lock(hashtext('apex.admin_bootstrap'))")
    const user = await tx.query<{ id: string; platform_role: string | null; verified: boolean }>(
      "select id, platform_role, email_verified_at is not null as verified from app.users where email = $1",
      [email],
    )
    if (!user.rows.length) throw new AdminError("not_found", `No account with the email ${email}; sign up first`)
    const { id, platform_role, verified } = user.rows[0]!
    const existing = await tx.query<{ id: string }>("select id from app.users where platform_role = 'superadmin' limit 1")
    if (existing.rows.length) {
      if (existing.rows[0]!.id === id) return { userId: id, created: false }
      throw new AdminError("already_bootstrapped", "A superadmin already exists")
    }
    // whoever registered an address first owns the row until the address is proven; promote only a proven one
    if (!verified) throw new AdminError("forbidden", `${email} isn't verified yet; sign in and confirm the emailed code first`)
    await tx.query("update app.users set platform_role = 'superadmin' where id = $1", [id])
    await writeAudit(tx, {
      actorId: null,
      action: "user.platform_role.bootstrap",
      targetType: "user",
      targetId: id,
      before: { platformRole: platform_role },
      after: { platformRole: "superadmin" },
    })
    return { userId: id, created: true }
  })
}

// --- Lists (see admin-list.ts) ---

export interface AdminUserRow {
  id: string
  email: string
  username: string
  display_name: string | null
  account_type: "personal" | "business"
  platform_role: PlatformRole | null
  email_verified: boolean
  two_factor: boolean
  workspaces: number
  suspended_at: Date | null
  last_login_at: Date | null
  created_at: Date
}

/** Every account on the platform, for /admin/users. */
export const ADMIN_USERS_LIST = {
  select: `u.id, u.email, u.username, u.display_name, u.account_type, u.platform_role,
    u.email_verified_at is not null as email_verified, u.totp_enabled_at is not null as two_factor,
    (select count(*)::int from app.organization_members m where m.user_id = u.id) as workspaces,
    u.suspended_at, u.last_login_at, u.created_at`,
  from: "app.users u",
  id: { sql: "u.id", type: "uuid" },
  sorts: {
    created: { sql: "u.created_at", type: "timestamptz" },
    email: { sql: "u.email", type: "text" },
    lastLogin: { sql: "coalesce(u.last_login_at, '-infinity')", type: "timestamptz" },
  },
  defaultSort: { key: "created", dir: "desc" },
  search: ["u.email", "u.username", "u.display_name", "u.id::text"],
  filters: {
    role: { staff: "u.platform_role is not null", superadmin: "u.platform_role = 'superadmin'", support: "u.platform_role = 'support'", none: "u.platform_role is null" },
    status: { active: "u.suspended_at is null and u.email_verified_at is not null", unverified: "u.email_verified_at is null", suspended: "u.suspended_at is not null" },
    verified: { yes: "u.email_verified_at is not null", no: "u.email_verified_at is null" },
    suspended: { yes: "u.suspended_at is not null", no: "u.suspended_at is null" },
    twoFactor: { on: "u.totp_enabled_at is not null", off: "u.totp_enabled_at is null" },
    // "none": signs in with a password only
    provider: {
      google: "exists (select 1 from app.oauth_accounts o where o.user_id = u.id and o.provider = 'google')",
      github: "exists (select 1 from app.oauth_accounts o where o.user_id = u.id and o.provider = 'github')",
      none: "not exists (select 1 from app.oauth_accounts o where o.user_id = u.id)",
    },
    accountType: { personal: "u.account_type = 'personal'", business: "u.account_type = 'business'" },
    created: {
      "7d": "u.created_at >= now() - interval '7 days'",
      "30d": "u.created_at >= now() - interval '30 days'",
      "90d": "u.created_at >= now() - interval '90 days'",
      "365d": "u.created_at >= now() - interval '365 days'",
      older: "u.created_at < now() - interval '365 days'",
    },
  },
} satisfies ListSpec

// --- Overview (/admin) ---

export const OVERVIEW_RANGES = [7, 30, 90] as const
export type OverviewRange = (typeof OVERVIEW_RANGES)[number]
export const parseOverviewRange = (raw: unknown): OverviewRange => {
  const n = Number(raw)
  return (OVERVIEW_RANGES as readonly number[]).includes(n) ? (n as OverviewRange) : 30
}

/** Failed log-ins from one IP or for one email in 24 hours that put it on the attention list. */
export const LOGIN_FAILURE_THRESHOLD = 20
/** Share of its daily token budget a bot has spent today that puts it on the attention list. */
export const BUDGET_WARNING_RATIO = 0.9
/** Rows listed per attention group; `total` still counts them all. */
export const ATTENTION_LIMIT = 10

export interface OverviewTotals {
  users: number
  /** Accounts created in the range. */
  newUsers: number
  /** Accounts that never confirmed their email. */
  unverifiedUsers: number
  workspaces: number
  /** Workspaces with at least one conversation started in the range. */
  activeWorkspaces: number
  bots: number
  /** Bots whose widget loaded somewhere in the last 7 days, whatever the range. */
  botsSeen7d: number
  conversations: number
  /** Visitor messages and assistant replies. */
  messages: number
  /** Assistant replies, the base of the unanswered rate. */
  answers: number
  unanswered: number
  negativeFeedback: number
  tokens: number
  failedSources: number
  waitlist: number
  openTickets: number
}

export interface OverviewDay {
  /** YYYY-MM-DD, UTC (the day token_usage counts in). */
  day: string
  newUsers: number
  conversations: number
  messages: number
  tokens: number
}

export interface AttentionGroup<T> {
  total: number
  rows: T[]
}

export interface FailedSync {
  id: string
  title: string
  error: string | null
  botId: string
  botName: string
  failedAt: Date
}

export interface BudgetBot {
  id: string
  name: string
  organizationId: string
  organizationName: string
  tokens: number
  budget: number
}

export interface LoginFailureRow {
  kind: "ip" | "email"
  key: string
  failures: number
  lastAt: Date
  /** The account with this email, when there is one. */
  userId: string | null
}

export interface OverdueTicket {
  id: string
  subject: string
  status: "open" | "pending_user" | "in_progress"
  slaDueAt: Date
  organizationId: string | null
  organizationName: string | null
}

export interface PlatformOverview {
  days: OverviewRange
  totals: OverviewTotals
  plans: { plan: Plan; workspaces: number }[]
  daily: OverviewDay[]
  attention: {
    failedSyncs: AttentionGroup<FailedSync>
    budgetBots: AttentionGroup<BudgetBot>
    loginFailures: AttentionGroup<LoginFailureRow>
    missingMigrations: string[]
    overdueTickets: AttentionGroup<OverdueTicket>
  }
}

// $1 days. d0 is the first UTC day of the range ("7 days" is today plus the six before it).
const RANGE = `r as (
  select (now() at time zone 'utc')::date - ($1::int - 1) as d0,
         ((now() at time zone 'utc')::date - ($1::int - 1))::timestamp at time zone 'utc' as since
)`

const group = <R extends { total: number }, T>(rows: R[], map: (r: R) => T): AttentionGroup<T> => ({ total: rows[0]?.total ?? 0, rows: rows.map(map) })

/** Platform-wide numbers for the admin overview, over the last `range` UTC days. Staff only: check before calling. */
export async function platformOverview(db: Queryable, range?: unknown): Promise<PlatformOverview> {
  const days = parseOverviewRange(range)
  const budget = LIMITS.dailyTokenBudget
  const [totals, plans, daily, failed, budgets, logins, missing, tickets] = await Promise.all([
    db.query<OverviewTotals>(
      `with ${RANGE},
       m as (
         select count(*)::int as messages,
                count(*) filter (where m.role = 'assistant')::int as answers,
                count(*) filter (where m.role = 'assistant' and m.unanswered)::int as unanswered,
                count(*) filter (where m.feedback = 'down')::int as negative
           from app.messages m, r where m.created_at >= r.since
       )
       select (select count(*)::int from app.users) as users,
              (select count(*)::int from app.users u where u.created_at >= r.since) as "newUsers",
              (select count(*)::int from app.users u where u.email_verified_at is null) as "unverifiedUsers",
              (select count(*)::int from app.organizations) as workspaces,
              (select count(distinct b.organization_id)::int from app.conversations c join app.bots b on b.id = c.bot_id
                where c.created_at >= r.since and c.message_count > 0) as "activeWorkspaces",
              (select count(*)::int from app.bots) as bots,
              (select count(*)::int from app.bot_activity a where a.widget_seen_at >= now() - interval '7 days') as "botsSeen7d",
              (select count(*)::int from app.conversations c where c.created_at >= r.since and c.message_count > 0) as conversations,
              m.messages, m.answers, m.unanswered, m.negative as "negativeFeedback",
              (select coalesce(sum(t.tokens), 0)::float8 from app.token_usage t where t.day >= r.d0) as tokens,
              (select count(*)::int from app.knowledge_sources s where s.status = 'failed') as "failedSources",
              (select count(*)::int from app.waitlist) as waitlist,
              (select count(*)::int from app.support_tickets t where t.status not in ('resolved', 'closed')) as "openTickets"
         from r, m`,
      [days],
    ),
    db.query<{ plan: Plan; n: number }>("select plan, count(*)::int as n from app.organizations group by plan"),
    db.query<OverviewDay>(
      `with ${RANGE},
       d as (select generate_series(r.d0::timestamp, (now() at time zone 'utc')::date::timestamp, interval '1 day')::date as day from r),
       u as (select (u.created_at at time zone 'utc')::date as day, count(*)::int as n from app.users u, r where u.created_at >= r.since group by 1),
       c as (select (c.created_at at time zone 'utc')::date as day, count(*)::int as n from app.conversations c, r
              where c.created_at >= r.since and c.message_count > 0 group by 1),
       m as (select (m.created_at at time zone 'utc')::date as day, count(*)::int as n from app.messages m, r where m.created_at >= r.since group by 1),
       t as (select t.day, sum(t.tokens)::float8 as n from app.token_usage t, r where t.day >= r.d0 group by 1)
       select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(u.n, 0) as "newUsers", coalesce(c.n, 0) as conversations,
              coalesce(m.n, 0) as messages, coalesce(t.n, 0) as tokens
         from d left join u using (day) left join c using (day) left join m using (day) left join t using (day)
        order by d.day`,
      [days],
    ),
    db.query<FailedSync & { total: number }>(
      `select s.id, s.title, s.error, s.bot_id as "botId", b.name as "botName", s.updated_at as "failedAt", count(*) over ()::int as total
         from app.knowledge_sources s join app.bots b on b.id = s.bot_id
        where s.status = 'failed'
        order by s.updated_at desc limit $1`,
      [ATTENTION_LIMIT],
    ),
    // the budget as the chat API reads it: the bot's setting, its default when unset, within the allowed range
    db.query<BudgetBot & { total: number }>(
      `select b.id, b.name, o.id as "organizationId", o.name as "organizationName", t.tokens::float8 as tokens, x.budget,
              count(*) over ()::int as total
         from app.token_usage t
         join app.bots b on b.id = t.bot_id
         join app.organizations o on o.id = b.organization_id
         cross join lateral (
           select least(greatest(case when jsonb_typeof(b.settings #> '{security,dailyTokenBudget}') = 'number'
                                      then (b.settings #>> '{security,dailyTokenBudget}')::numeric else $1 end, $2), $3)::float8 as budget
         ) x
        where t.day = (now() at time zone 'utc')::date and t.tokens >= $4 * x.budget
        order by t.tokens / x.budget desc limit $5`,
      [DEFAULT_SETTINGS.security.dailyTokenBudget, budget.min, budget.max, BUDGET_WARNING_RATIO, ATTENTION_LIMIT],
    ),
    db.query<LoginFailureRow & { total: number }>(
      `with f as (
         select 'ip' as kind, host(e.ip) as key, count(*)::int as failures, max(e.created_at) as "lastAt"
           from app.auth_events e
          where e.event = 'login_failed' and e.created_at >= now() - interval '24 hours' and e.ip is not null
          group by e.ip having count(*) >= $1
         union all
         select 'email', e.email, count(*)::int, max(e.created_at)
           from app.auth_events e
          where e.event = 'login_failed' and e.created_at >= now() - interval '24 hours' and e.email is not null
          group by e.email having count(*) >= $1
       )
       select f.kind, f.key, f.failures, f."lastAt", u.id as "userId", count(*) over ()::int as total
         from f left join app.users u on f.kind = 'email' and u.email = f.key
        order by f.failures desc, f."lastAt" desc, f.kind, f.key limit $2`,
      [LOGIN_FAILURE_THRESHOLD, ATTENTION_LIMIT],
    ),
    missingMigrations(db),
    db.query<OverdueTicket & { total: number }>(
      `select t.id, t.subject, t.status, t.sla_due_at as "slaDueAt", t.organization_id as "organizationId", o.name as "organizationName",
              count(*) over ()::int as total
         from app.support_tickets t left join app.organizations o on o.id = t.organization_id
        where t.status not in ('resolved', 'closed') and t.sla_due_at < now()
        order by t.sla_due_at limit $1`,
      [ATTENTION_LIMIT],
    ),
  ])

  const byPlan = new Map(plans.rows.map((r) => [r.plan, r.n]))
  const strip = <T extends { total: number }>({ total: _, ...rest }: T) => rest
  return {
    days,
    totals: totals.rows[0]!,
    plans: PLANS.map((plan) => ({ plan, workspaces: byPlan.get(plan) ?? 0 })),
    daily: daily.rows,
    attention: {
      failedSyncs: group(failed.rows, strip),
      budgetBots: group(budgets.rows, strip),
      loginFailures: group(logins.rows, strip),
      missingMigrations: missing,
      overdueTickets: group(tickets.rows, strip),
    },
  }
}
