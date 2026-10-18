import { isIP } from "node:net"
import type { Queryable } from "./db.ts"
import { AdminError, type PlatformRole } from "./admin.ts"
import type { ListSpec } from "./admin-list.ts"
import { CODE_FAIL_LIMIT, LOGIN_FAIL_LIMIT, normalizeEmail } from "./auth.ts"

// /admin/security: the auth_events feed, 24-hour panels of failed and unusual sign-ins, temporary
// blocks on an address or an email (app.auth_blocks, enforced in auth.ts), resets of the
// failed-attempt counters for a locked-out user, and the staff accounts themselves.

/** Every event app.auth_events records, in the order the feed's filter lists them. */
export const AUTH_EVENTS = [
  "login",
  "login_failed",
  "logout",
  "register",
  "two_factor_failed",
  "access_blocked",
  "reset_requested",
  "reset_failed",
  "password_reset",
  "password_changed",
  "code_sent",
  "email_verified",
  "verify_failed",
  "sessions_revoked",
  "profile_updated",
  "account_deleted",
  "two_factor_enabled",
  "two_factor_disabled",
  "recovery_codes_created",
  "step_up",
] as const
export type AuthEventName = (typeof AUTH_EVENTS)[number]

/** Events that are a wrong guess or a refusal; the feed's "failures" filter. */
export const FAILURE_EVENTS: readonly AuthEventName[] = ["login_failed", "two_factor_failed", "verify_failed", "reset_failed", "access_blocked"]

const quoted = (events: readonly string[]) => events.map((e) => `'${e}'`).join(", ")

export interface AuthEventRow {
  id: string
  event: AuthEventName
  /** The address the event names, or the account's current one when the event has none. */
  email: string | null
  ip: string | null
  user_agent: string | null
  country: string | null
  user_id: string | null
  created_at: Date
}

/** app.auth_events, newest first, for the feed on /admin/security. */
export const ADMIN_SECURITY_EVENTS_LIST = {
  select: `e.id::text as id, e.event, coalesce(e.email, u.email) as email, host(e.ip) as ip, e.user_agent, e.country,
    e.user_id, e.created_at`,
  from: "app.auth_events e left join app.users u on u.id = e.user_id",
  id: { sql: "e.id", type: "bigint" },
  sorts: { created: { sql: "e.created_at", type: "timestamptz" } },
  defaultSort: { key: "created", dir: "desc" },
  search: ["e.email", "u.email", "host(e.ip)", "e.user_agent", "e.country"],
  filters: {
    event: { failures: `e.event in (${quoted(FAILURE_EVENTS)})`, ...Object.fromEntries(AUTH_EVENTS.map((e) => [e, `e.event = '${e}'`])) },
    created: {
      "1h": "e.created_at >= now() - interval '1 hour'",
      "24h": "e.created_at >= now() - interval '24 hours'",
      "7d": "e.created_at >= now() - interval '7 days'",
      "30d": "e.created_at >= now() - interval '30 days'",
      "90d": "e.created_at >= now() - interval '90 days'",
    },
  },
  valueFilters: {
    ip: { sql: "e.ip = {}", type: "inet" },
    email: { sql: "(e.email = lower({}) or u.email = lower({}))", type: "text" },
    user: { sql: "e.user_id = {}", type: "uuid" },
    // whole UTC days, both ends included
    from: { sql: "e.created_at >= ({}::timestamp at time zone 'utc')", type: "date" },
    to: { sql: "e.created_at < ({}::timestamp at time zone 'utc') + interval '1 day'", type: "date" },
  },
} satisfies ListSpec

// --- Panels ---

/** Rows per panel on /admin/security; `total` still counts them all. */
export const SECURITY_PANEL_LIMIT = 10
/** Password reset requests for one email or from one address in 24 hours that count as a burst. */
export const RESET_BURST_THRESHOLD = 5
/** Sign-ins compared against the account's sign-ins of the 90 days before. */
export const NEW_SIGNIN_LOOKBACK_DAYS = 90

/**
 * "Chrome · macOS": the browser family and system a user agent names, coarse enough that a
 * browser update doesn't look like a new device. Null when there's no user agent.
 */
export function deviceLabel(ua: string | null | undefined): string | null {
  if (!ua) return null
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\/|FxiOS/.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS/.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : /curl|wget|python|Go-http|node-fetch|axios|okhttp|java\//i.test(ua)
              ? "Script"
              : "Other"
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "Other"
  return `${browser} · ${os}`
}

export interface SecurityHour {
  /** Start of the hour, ISO. */
  hour: string
  loginFailed: number
  twoFactorFailed: number
  resetRequested: number
  accessBlocked: number
}

export interface FailureByIp {
  ip: string
  failures: number
  /** Different emails tried from it. */
  emails: number
  country: string | null
  lastAt: Date
  /** Log-ins from it are refused right now by the failed-attempt limit. */
  locked: boolean
  blocked: boolean
}

export interface FailureByEmail {
  email: string
  failures: number
  /** Different addresses it was tried from. */
  ips: number
  lastAt: Date
  userId: string | null
  locked: boolean
  blocked: boolean
}

export interface TwoFactorFailure {
  userId: string
  email: string
  failures: number
  ips: number
  lastAt: Date
  /** The account can't try another code right now. */
  locked: boolean
}

export interface ResetBurst {
  kind: "ip" | "email"
  key: string
  requests: number
  lastAt: Date
  userId: string | null
  blocked: boolean
}

export interface NewSignIn {
  id: string
  userId: string
  email: string
  name: string
  platformRole: PlatformRole | null
  ip: string | null
  country: string | null
  device: string | null
  userAgent: string | null
  at: Date
  newCountry: boolean
  newDevice: boolean
  /** Countries the account signed in from before (in the lookback). */
  knownCountries: string[]
}

export interface AuthBlock {
  id: string
  kind: "ip" | "email"
  value: string
  reason: string
  createdBy: string | null
  createdByName: string | null
  createdAt: Date
  expiresAt: Date
}

export interface SecurityPanel<T> {
  total: number
  rows: T[]
}

export interface SecurityOverview {
  /** Events of each kind in the last 24 hours. */
  totals: Record<"login" | "loginFailed" | "twoFactorFailed" | "resetRequested" | "accessBlocked" | "register", number>
  hourly: SecurityHour[]
  failuresByIp: SecurityPanel<FailureByIp>
  failuresByEmail: SecurityPanel<FailureByEmail>
  twoFactorFailures: SecurityPanel<TwoFactorFailure>
  resetBursts: SecurityPanel<ResetBurst>
  newSignIns: SecurityPanel<NewSignIn>
  blocks: AuthBlock[]
}

// The panels below group into a CTE `f` with an `ip` (inet) and/or `email` column. These say whether
// an active block covers that address / email, and when staff last reset its counters (or -infinity).
const F_IP_BLOCKED = `exists (select 1 from app.auth_blocks b where b.kind = 'ip' and b.lifted_at is null and b.expires_at > now() and b.ip >>= f.ip)`
const F_EMAIL_BLOCKED = `exists (select 1 from app.auth_blocks b where b.kind = 'email' and b.lifted_at is null and b.expires_at > now() and b.email = f.email)`
const F_IP_RESET = `coalesce((select max(r.created_at) from app.throttle_resets r where r.kind = 'ip' and r.ip = f.ip), '-infinity')`
const F_EMAIL_RESET = `coalesce((select max(r.created_at) from app.throttle_resets r where r.kind = 'email' and r.email = f.email), '-infinity')`

const panel = <T extends { total: number }>(rows: T[]): SecurityPanel<Omit<T, "total">> => ({
  total: rows[0]?.total ?? 0,
  rows: rows.map(({ total: _, ...rest }) => rest),
})

/** Everything /admin/security shows above the feed. Staff only: check before calling. */
export async function securityOverview(q: Queryable): Promise<SecurityOverview> {
  const [totals, hourly, byIp, byEmail, twoFactor, resets, signIns, blocks] = await Promise.all([
    q.query<SecurityOverview["totals"]>(
      `select count(*) filter (where event = 'login')::int as login,
              count(*) filter (where event = 'login_failed')::int as "loginFailed",
              count(*) filter (where event = 'two_factor_failed')::int as "twoFactorFailed",
              count(*) filter (where event = 'reset_requested')::int as "resetRequested",
              count(*) filter (where event = 'access_blocked')::int as "accessBlocked",
              count(*) filter (where event = 'register')::int as register
         from app.auth_events where created_at >= now() - interval '24 hours'`,
    ),
    q.query<SecurityHour>(
      `with h as (select generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') as hour),
       e as (
         select date_trunc('hour', created_at) as hour,
                count(*) filter (where event = 'login_failed')::int as "loginFailed",
                count(*) filter (where event = 'two_factor_failed')::int as "twoFactorFailed",
                count(*) filter (where event = 'reset_requested')::int as "resetRequested",
                count(*) filter (where event = 'access_blocked')::int as "accessBlocked"
           from app.auth_events
          where created_at >= date_trunc('hour', now()) - interval '23 hours'
            and event in ('login_failed', 'two_factor_failed', 'reset_requested', 'access_blocked')
          group by 1
       )
       select to_char(h.hour at time zone 'utc', 'YYYY-MM-DD"T"HH24:00:00"Z"') as hour,
              coalesce(e."loginFailed", 0) as "loginFailed", coalesce(e."twoFactorFailed", 0) as "twoFactorFailed",
              coalesce(e."resetRequested", 0) as "resetRequested", coalesce(e."accessBlocked", 0) as "accessBlocked"
         from h left join e using (hour) order by h.hour`,
    ),
    q.query<FailureByIp & { total: number }>(
      `with f as (
         select e.ip, count(*)::int as failures, count(distinct e.email)::int as emails, max(e.created_at) as "lastAt",
                (array_agg(e.country order by e.created_at desc) filter (where e.country is not null))[1] as country
           from app.auth_events e
          where e.event = 'login_failed' and e.created_at >= now() - interval '24 hours' and e.ip is not null
          group by e.ip
       )
       select host(f.ip) as ip, f.failures, f.emails, f.country, f."lastAt",
              (select count(*) from app.auth_events x
                where x.event = 'login_failed' and x.ip = f.ip and x.created_at > now() - interval '15 minutes'
                  and x.created_at > ${F_IP_RESET}) >= $2 as locked,
              ${F_IP_BLOCKED} as blocked,
              count(*) over ()::int as total
         from f order by f.failures desc, f."lastAt" desc limit $1`,
      [SECURITY_PANEL_LIMIT, LOGIN_FAIL_LIMIT.ip],
    ),
    q.query<FailureByEmail & { total: number }>(
      `with f as (
         select e.email, count(*)::int as failures, count(distinct e.ip)::int as ips, max(e.created_at) as "lastAt"
           from app.auth_events e
          where e.event = 'login_failed' and e.created_at >= now() - interval '24 hours' and e.email is not null
          group by e.email
       )
       select f.email, f.failures, f.ips, f."lastAt", u.id as "userId",
              -- locked for everyone (the email's own limit) or from at least one address (email and address)
              coalesce((select sum(n) >= $2 or max(n) >= $3
                          from (select count(*) as n from app.auth_events x
                                 where x.event = 'login_failed' and x.email = f.email and x.created_at > now() - interval '15 minutes'
                                   and x.created_at > ${F_EMAIL_RESET}
                                 group by x.ip) per_ip), false) as locked,
              ${F_EMAIL_BLOCKED} as blocked,
              count(*) over ()::int as total
         from f left join app.users u on u.email = f.email
        order by f.failures desc, f."lastAt" desc limit $1`,
      [SECURITY_PANEL_LIMIT, LOGIN_FAIL_LIMIT.email, LOGIN_FAIL_LIMIT.emailAndIp],
    ),
    q.query<TwoFactorFailure & { total: number }>(
      `with f as (
         select e.user_id, u.email, count(*)::int as failures, count(distinct e.ip)::int as ips, max(e.created_at) as "lastAt"
           from app.auth_events e join app.users u on u.id = e.user_id
          where e.event = 'two_factor_failed' and e.created_at >= now() - interval '24 hours'
          group by e.user_id, u.email
       )
       select f.user_id as "userId", f.email, f.failures, f.ips, f."lastAt",
              (select count(*) from app.auth_events x
                where x.event = 'two_factor_failed' and x.user_id = f.user_id
                  and x.created_at > now() - make_interval(mins => $3) and x.created_at > ${F_EMAIL_RESET}) >= $2 as locked,
              count(*) over ()::int as total
         from f
        order by f.failures desc, f."lastAt" desc limit $1`,
      [SECURITY_PANEL_LIMIT, CODE_FAIL_LIMIT.max, CODE_FAIL_LIMIT.windowMinutes],
    ),
    q.query<ResetBurst & { total: number }>(
      `with f as (
         select 'email' as kind, e.email, null::inet as ip, count(*)::int as requests, max(e.created_at) as "lastAt"
           from app.auth_events e
          where e.event = 'reset_requested' and e.created_at >= now() - interval '24 hours' and e.email is not null
          group by e.email having count(*) >= $2
         union all
         select 'ip', null, e.ip, count(*)::int, max(e.created_at)
           from app.auth_events e
          where e.event = 'reset_requested' and e.created_at >= now() - interval '24 hours' and e.ip is not null
          group by e.ip having count(*) >= $2
       )
       select f.kind, coalesce(f.email, host(f.ip)) as key, f.requests, f."lastAt", u.id as "userId",
              case when f.kind = 'ip' then ${F_IP_BLOCKED} else ${F_EMAIL_BLOCKED} end as blocked,
              count(*) over ()::int as total
         from f left join app.users u on u.email = f.email
        order by f.requests desc, f."lastAt" desc limit $1`,
      [SECURITY_PANEL_LIMIT, RESET_BURST_THRESHOLD],
    ),
    // each sign-in of the last 24 hours with what the account used in the lookback before it
    q.query<{
      id: string
      user_id: string
      email: string
      name: string
      platform_role: PlatformRole | null
      ip: string | null
      country: string | null
      user_agent: string | null
      created_at: Date
      prior: number
      countries: string[] | null
      agents: string[] | null
    }>(
      `select e.id::text as id, e.user_id, u.email, coalesce(u.display_name, u.username) as name, u.platform_role,
              host(e.ip) as ip, e.country, e.user_agent, e.created_at, p.prior, p.countries, p.agents
         from app.auth_events e
         join app.users u on u.id = e.user_id
         cross join lateral (
           select count(*)::int as prior,
                  array_agg(distinct x.country) filter (where x.country is not null) as countries,
                  array_agg(distinct x.user_agent) filter (where x.user_agent is not null) as agents
             from app.auth_events x
            where x.user_id = e.user_id and x.event = 'login'
              and x.created_at < e.created_at and x.created_at >= e.created_at - make_interval(days => $1)
         ) p
        where e.event = 'login' and e.created_at >= now() - interval '24 hours'
        order by e.created_at desc limit 500`,
      [NEW_SIGNIN_LOOKBACK_DAYS],
    ),
    q.query<AuthBlock>(
      `select b.id, b.kind, coalesce(b.email, case when masklen(b.ip) in (32, 128) then host(b.ip) else text(b.ip) end) as value,
              b.reason, b.created_by as "createdBy", coalesce(a.display_name, a.username) as "createdByName",
              b.created_at as "createdAt", b.expires_at as "expiresAt"
         from app.auth_blocks b left join app.users a on a.id = b.created_by
        where b.lifted_at is null and b.expires_at > now()
        order by b.created_at desc limit 200`,
    ),
  ])

  // An account's first sign-in has nothing to compare with. Countries are only compared when an
  // earlier sign-in recorded one (sign-ins from before the country was stored have none).
  const unusual: NewSignIn[] = []
  for (const r of signIns.rows) {
    if (r.prior === 0) continue
    const countries = r.countries ?? []
    const device = deviceLabel(r.user_agent)
    const knownDevices = new Set((r.agents ?? []).map(deviceLabel))
    const newCountry = !!r.country && countries.length > 0 && !countries.includes(r.country)
    const newDevice = !!device && knownDevices.size > 0 && !knownDevices.has(device)
    if (!newCountry && !newDevice) continue
    unusual.push({
      id: r.id,
      userId: r.user_id,
      email: r.email,
      name: r.name,
      platformRole: r.platform_role,
      ip: r.ip,
      country: r.country,
      device,
      userAgent: r.user_agent,
      at: r.created_at,
      newCountry,
      newDevice,
      knownCountries: countries.sort(),
    })
  }

  return {
    totals: totals.rows[0]!,
    hourly: hourly.rows,
    failuresByIp: panel(byIp.rows),
    failuresByEmail: panel(byEmail.rows),
    twoFactorFailures: panel(twoFactor.rows),
    resetBursts: panel(resets.rows),
    newSignIns: { total: unusual.length, rows: unusual.slice(0, SECURITY_PANEL_LIMIT * 2) },
    blocks: blocks.rows,
  }
}

// --- Staff accounts ---

export interface StaffAccount {
  id: string
  email: string
  name: string
  role: PlatformRole
  twoFactor: boolean
  twoFactorSince: Date | null
  suspended: boolean
  lastLoginAt: Date | null
  lastLoginIp: string | null
  lastLoginCountry: string | null
  /** Sessions that haven't expired. */
  sessions: number
  lastActionAt: Date | null
  lastAction: string | null
}

/** Every platform admin, superadmins first, with what matters for the area's own security. */
export async function listStaffAccounts(q: Queryable): Promise<StaffAccount[]> {
  const { rows } = await q.query<StaffAccount>(
    `select u.id, u.email, coalesce(u.display_name, u.username) as name, u.platform_role as role,
            u.totp_enabled_at is not null as "twoFactor", u.totp_enabled_at as "twoFactorSince",
            u.suspended_at is not null as suspended, coalesce(u.last_login_at, ll.created_at) as "lastLoginAt",
            host(ll.ip) as "lastLoginIp", ll.country as "lastLoginCountry",
            (select count(*)::int from app.sessions s where s.user_id = u.id and s.expires_at > now()) as sessions,
            la.created_at as "lastActionAt", la.action as "lastAction"
       from app.users u
       left join lateral (select e.ip, e.country, e.created_at from app.auth_events e where e.user_id = u.id and e.event = 'login'
                           order by e.created_at desc limit 1) ll on true
       left join lateral (select l.created_at, l.action from app.admin_audit_log l where l.actor_id = u.id
                           order by l.created_at desc limit 1) la on true
      where u.platform_role is not null
      order by u.platform_role = 'superadmin' desc, u.email`,
  )
  return rows
}

// --- Actions (the caller writes the audit entry, see withAdminAction) ---

/** How long a block can last, in minutes: an hour, a day, a week, 30 days. */
export const BLOCK_DURATIONS = [60, 24 * 60, 7 * 24 * 60, 30 * 24 * 60] as const
// A network wider than this would lock out whole providers
const MIN_PREFIX = { 4: 16, 6: 32 } as const

export interface BlockSubject {
  kind: "ip" | "email"
  /** The address, network (CIDR) or email, as given. */
  value: string
}

/** Checks and normalizes what staff typed: an address, a network no wider than /16 (IPv6 /32), or an email. */
export function parseBlockSubject(kind: unknown, raw: unknown): BlockSubject {
  const value = typeof raw === "string" ? raw.trim() : ""
  if (kind === "email") {
    try {
      return { kind, value: normalizeEmail(value) }
    } catch {
      throw new AdminError("invalid_input", "Enter a valid email address")
    }
  }
  if (kind !== "ip") throw new AdminError("invalid_input", "Choose what to block")
  const [address, prefix, extra] = value.split("/")
  const family = isIP(address ?? "")
  if (!family || extra !== undefined) throw new AdminError("invalid_input", "Enter an IP address or a network like 203.0.113.0/24")
  if (prefix !== undefined) {
    const bits = Number(prefix)
    const max = family === 4 ? 32 : 128
    if (!/^\d{1,3}$/.test(prefix) || bits > max) throw new AdminError("invalid_input", "Enter an IP address or a network like 203.0.113.0/24")
    if (bits < MIN_PREFIX[family as 4 | 6]) throw new AdminError("invalid_input", "That network is too wide to block")
  }
  return { kind, value }
}

/**
 * Blocks an address, network or email until `minutes` from now. Refuses to block the staff
 * member's own address, one any staff account used in the last 30 days, and the email of a staff
 * account (take the role away instead).
 */
export async function createAuthBlock(
  tx: Queryable,
  actor: { id: string; ip?: string | null },
  input: { kind: unknown; value: unknown; minutes: unknown; reason: string },
): Promise<{ block: AuthBlock }> {
  const subject = parseBlockSubject(input.kind, input.value)
  const minutes = Number(input.minutes)
  if (!(BLOCK_DURATIONS as readonly number[]).includes(minutes)) throw new AdminError("invalid_input", "Choose how long to block")
  if (!input.reason.trim()) throw new AdminError("invalid_input", "Give a reason for this action")

  if (subject.kind === "ip") {
    if (actor.ip && isIP(actor.ip)) {
      const { rows } = await tx.query<{ own: boolean }>("select $1::inet >>= $2::inet as own", [subject.value, actor.ip])
      if (rows[0]?.own) throw new AdminError("forbidden", "That would block your own address")
    }
    // nor a network staff sign in from: a block refuses log-in and two-step codes, so it could lock a superadmin out
    const staff = await tx.query(
      `select 1 from app.auth_events e join app.users u on u.id = e.user_id
        where $1::inet >>= e.ip and u.platform_role is not null and e.created_at > now() - interval '30 days' limit 1`,
      [subject.value],
    )
    if (staff.rows.length) throw new AdminError("forbidden", "Staff signed in from that address in the last 30 days, so it can't be blocked")
  } else {
    const { rows } = await tx.query<{ staff: boolean }>("select platform_role is not null as staff from app.users where email = $1", [subject.value])
    if (rows[0]?.staff) throw new AdminError("forbidden", "A staff account can't be blocked. Take its role away first")
  }

  const { rows } = await tx.query<AuthBlock>(
    `with b as (
       insert into app.auth_blocks (kind, ip, email, reason, created_by, expires_at)
       values ($1, case when masklen($2::inet) = case family($2::inet) when 4 then 32 else 128 end then $2::inet
                        else network($2::inet)::inet end,
               $6, $3, $4, now() + make_interval(mins => $5))
       returning *
     )
     select b.id, b.kind, coalesce(b.email, case when masklen(b.ip) in (32, 128) then host(b.ip) else text(b.ip) end) as value,
            b.reason, b.created_by as "createdBy", coalesce(a.display_name, a.username) as "createdByName",
            b.created_at as "createdAt", b.expires_at as "expiresAt"
       from b left join app.users a on a.id = b.created_by`,
    [
      subject.kind,
      subject.kind === "ip" ? subject.value : null,
      input.reason.trim().slice(0, 1000),
      actor.id,
      minutes,
      subject.kind === "email" ? subject.value : null,
    ],
  )
  return { block: rows[0]! }
}

/** Ends a block before it runs out. */
export async function liftAuthBlock(tx: Queryable, actorId: string, id: unknown): Promise<{ block: { kind: string; value: string; expiresAt: Date } }> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new AdminError("not_found", "That block has already ended")
  const { rows } = await tx.query<{ kind: string; value: string; expiresAt: Date }>(
    `update app.auth_blocks b set lifted_at = now(), lifted_by = $2
      where b.id = $1 and b.lifted_at is null and b.expires_at > now()
      returning b.kind, coalesce(b.email, case when masklen(b.ip) in (32, 128) then host(b.ip) else text(b.ip) end) as value, b.expires_at as "expiresAt"`,
    [id, actorId],
  )
  if (!rows[0]) throw new AdminError("not_found", "That block has already ended")
  return { block: rows[0] }
}

/**
 * Clears the failed-attempt counters of an email or an address, for a real user who locked
 * themselves out: earlier failures stop counting towards the log-in lock, and for an email also
 * towards the account's wrong-code and code-mail limits. Blocks are not touched, and nothing is
 * deleted from the security log. Returns the failures that stopped counting.
 */
export async function resetThrottle(tx: Queryable, actorId: string, kind: unknown, raw: unknown): Promise<{ kind: "ip" | "email"; value: string; cleared: number }> {
  const subject = parseBlockSubject(kind, raw)
  if (subject.kind === "ip" && subject.value.includes("/")) throw new AdminError("invalid_input", "Enter a single IP address")
  // a reset lifts the limits on password and code guesses, so never for staff: it would let an insider,
  // or a stolen staff cookie, guess a superadmin's password or this account's own step-up codes
  const staff =
    subject.kind === "email"
      ? await tx.query("select 1 from app.users where email = $1 and platform_role is not null", [subject.value])
      : await tx.query(
          `select 1 from app.auth_events e join app.users u on u.id = e.user_id
            where e.ip = $1::inet and u.platform_role is not null and e.created_at > now() - interval '30 days' limit 1`,
          [subject.value],
        )
  if (staff.rows.length) throw new AdminError("forbidden", "Staff accounts' limits can't be reset. They run out on their own")
  const { rows } =
    subject.kind === "ip"
      ? await tx.query<{ cleared: number }>(
          `select count(*)::int as cleared from app.auth_events e
            where e.event = 'login_failed' and e.ip = $1::inet and e.created_at > now() - interval '15 minutes'
              and e.created_at > coalesce((select max(r.created_at) from app.throttle_resets r where r.kind = 'ip' and r.ip = $1::inet), '-infinity')`,
          [subject.value],
        )
      : await tx.query<{ cleared: number }>(
          `select count(*)::int as cleared from app.auth_events e
            where e.event in ('login_failed', 'two_factor_failed', 'verify_failed', 'reset_failed')
              and (e.email = $1 or e.user_id = (select id from app.users where email = $1))
              and e.created_at > now() - interval '60 minutes'
              and e.created_at > coalesce((select max(r.created_at) from app.throttle_resets r where r.kind = 'email' and r.email = $1), '-infinity')`,
          [subject.value],
        )
  await tx.query(
    "insert into app.throttle_resets (kind, ip, email, created_by) values ($1, $2, $3, $4)",
    [subject.kind, subject.kind === "ip" ? subject.value : null, subject.kind === "email" ? subject.value : null, actorId],
  )
  return { ...subject, cleared: rows[0]!.cleared }
}
