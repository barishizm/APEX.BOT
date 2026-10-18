import { inTransaction, type Queryable } from "./db.ts"
import { AdminError, type PlatformRole } from "./admin.ts"
import { deleteAccount, issueEmailCode, requestPasswordReset, type AccountType, type OAuthProvider, type RequestMeta } from "./auth.ts"
import type { Plan } from "./plans.ts"

// One account in the admin area (/admin/users/[id]): everything staff see about it, and the actions
// they can take on it. Each action runs in the caller's transaction (withAdminAction) and returns the
// state before and after for the audit entry; the caller sends any email once that commits.

export const DETAIL_EVENTS_LIMIT = 50
export const DETAIL_AUDIT_LIMIT = 50
export const NOTE_MAX = 5000

export interface AdminUserProfile {
  id: string
  email: string
  username: string
  displayName: string | null
  accountType: AccountType
  /** The stored role, also while the account is suspended. */
  platformRole: PlatformRole | null
  emailVerifiedAt: Date | null
  twoFactorAt: Date | null
  recoveryCodesLeft: number
  hasPassword: boolean
  suspendedAt: Date | null
  suspendedReason: string | null
  lastLoginAt: Date | null
  createdAt: Date
}

export interface AdminUserMembership {
  organizationId: string
  name: string
  plan: Plan
  role: "owner" | "admin" | "member"
  members: number
  /** Owners other than this user. */
  otherOwners: number
  suspendedAt: Date | null
  joinedAt: Date
}

export interface AdminUserSession {
  id: string
  ip: string | null
  userAgent: string | null
  persistent: boolean
  createdAt: Date
  lastSeenAt: Date
  expiresAt: Date
}

export interface AdminUserOAuth {
  provider: OAuthProvider
  email: string | null
  createdAt: Date
}

export interface AdminUserEvent {
  id: string
  event: string
  email: string | null
  ip: string | null
  userAgent: string | null
  createdAt: Date
}

export interface AdminUserNote {
  id: string
  body: string
  authorId: string | null
  authorName: string | null
  createdAt: Date
}

export interface AdminUserAuditEntry {
  id: string
  action: string
  reason: string | null
  actorId: string | null
  actorName: string | null
  before: unknown
  after: unknown
  createdAt: Date
}

/** What deleting the account does to its workspaces (see deleteAccount). */
export interface DeletionImpact {
  /** Workspaces only this user belongs to: deleted with their bots and knowledge. */
  deleted: { organizationId: string; name: string }[]
  /** Workspaces this user owns alone but shares: ownership passes to `newOwner`. */
  transferred: { organizationId: string; name: string; members: number; newOwnerId: string; newOwnerEmail: string }[]
}

export interface AdminUserDetail {
  profile: AdminUserProfile
  memberships: AdminUserMembership[]
  sessions: AdminUserSession[]
  oauth: AdminUserOAuth[]
  events: AdminUserEvent[]
  notes: AdminUserNote[]
  audit: AdminUserAuditEntry[]
  deletion: DeletionImpact
}

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

/** The workspaces deleting this account deletes, and the ones it hands to another member. */
export async function deletionImpact(q: Queryable, userId: string): Promise<DeletionImpact> {
  const [deleted, transferred] = await Promise.all([
    q.query<{ organizationId: string; name: string }>(
      `select o.id as "organizationId", o.name
         from app.organizations o join app.organization_members me on me.organization_id = o.id and me.user_id = $1
        where not exists (select 1 from app.organization_members m where m.organization_id = o.id and m.user_id <> $1)
        order by o.name`,
      [userId],
    ),
    // the same choice deleteAccount makes: the longest-serving admin, else the longest-serving member
    q.query<DeletionImpact["transferred"][number]>(
      `select distinct on (o.id) o.id as "organizationId", o.name,
              (select count(*)::int from app.organization_members c where c.organization_id = o.id) as members,
              m.user_id as "newOwnerId", u.email as "newOwnerEmail"
         from app.organizations o
         join app.organization_members me on me.organization_id = o.id and me.user_id = $1 and me.role = 'owner'
         join app.organization_members m on m.organization_id = o.id and m.user_id <> $1
         join app.users u on u.id = m.user_id
        where not exists (select 1 from app.organization_members x where x.organization_id = o.id and x.user_id <> $1 and x.role = 'owner')
        order by o.id, (m.role = 'admin') desc, m.created_at`,
      [userId],
    ),
  ])
  return { deleted: deleted.rows, transferred: transferred.rows.sort((a, b) => a.name.localeCompare(b.name)) }
}

/** Everything the detail page shows; null when there is no such account. Staff only: check before calling. */
export async function getAdminUserDetail(q: Queryable, userId: string): Promise<AdminUserDetail | null> {
  if (!isUuid(userId)) return null
  const profile = await q.query<AdminUserProfile>(
    `select u.id, u.email, u.username, u.display_name as "displayName", u.account_type as "accountType", u.platform_role as "platformRole",
            u.email_verified_at as "emailVerifiedAt", u.totp_enabled_at as "twoFactorAt",
            case when u.totp_enabled_at is null then 0
                 else (select count(*)::int from app.recovery_codes r where r.user_id = u.id and r.used_at is null) end as "recoveryCodesLeft",
            u.password_hash is not null as "hasPassword", u.suspended_at as "suspendedAt", u.suspended_reason as "suspendedReason",
            u.last_login_at as "lastLoginAt", u.created_at as "createdAt"
       from app.users u where u.id = $1`,
    [userId],
  )
  if (!profile.rows[0]) return null

  const [memberships, sessions, oauth, events, notes, audit, deletion] = await Promise.all([
    q.query<AdminUserMembership>(
      `select o.id as "organizationId", o.name, o.plan, me.role,
              (select count(*)::int from app.organization_members c where c.organization_id = o.id) as members,
              (select count(*)::int from app.organization_members c where c.organization_id = o.id and c.role = 'owner' and c.user_id <> $1) as "otherOwners",
              o.suspended_at as "suspendedAt", me.created_at as "joinedAt"
         from app.organization_members me join app.organizations o on o.id = me.organization_id
        where me.user_id = $1
        order by me.created_at`,
      [userId],
    ),
    q.query<AdminUserSession>(
      `select s.id, host(s.ip) as ip, s.user_agent as "userAgent", s.persistent, s.created_at as "createdAt",
              s.last_seen_at as "lastSeenAt", s.expires_at as "expiresAt"
         from app.sessions s where s.user_id = $1 and s.expires_at > now()
        order by s.last_seen_at desc`,
      [userId],
    ),
    q.query<AdminUserOAuth>(
      `select o.provider, o.email, o.created_at as "createdAt" from app.oauth_accounts o where o.user_id = $1 order by o.provider`,
      [userId],
    ),
    q.query<AdminUserEvent>(
      `select e.id::text, e.event, e.email, host(e.ip) as ip, e.user_agent as "userAgent", e.created_at as "createdAt"
         from app.auth_events e where e.user_id = $1
        order by e.created_at desc, e.id desc limit $2`,
      [userId, DETAIL_EVENTS_LIMIT],
    ),
    q.query<AdminUserNote>(
      `select n.id, n.body, n.author_id as "authorId", coalesce(a.display_name, a.username) as "authorName", n.created_at as "createdAt"
         from app.admin_user_notes n left join app.users a on a.id = n.author_id
        where n.user_id = $1
        order by n.created_at desc`,
      [userId],
    ),
    q.query<AdminUserAuditEntry>(
      `select l.id::text, l.action, l.reason, l.actor_id as "actorId", coalesce(a.display_name, a.username, l.actor_email) as "actorName",
              l.before, l.after, l.created_at as "createdAt"
         from app.admin_audit_log l left join app.users a on a.id = l.actor_id
        where l.target_type = 'user' and l.target_id = $1
        order by l.id desc limit $2`,
      [userId, DETAIL_AUDIT_LIMIT],
    ),
    deletionImpact(q, userId),
  ])

  return {
    profile: profile.rows[0],
    memberships: memberships.rows,
    sessions: sessions.rows,
    oauth: oauth.rows,
    events: events.rows,
    notes: notes.rows,
    audit: audit.rows,
    deletion,
  }
}

// --- Actions ---

export interface AdminActor {
  id: string
  role: PlatformRole
}

interface TargetRow {
  id: string
  email: string
  platform_role: PlatformRole | null
  email_verified_at: Date | null
  totp_enabled_at: Date | null
  suspended_at: Date | null
  suspended_reason: string | null
}

/**
 * Locks the account and checks the actor may act on it: never on themselves, never on a
 * superadmin, and on other staff only as a superadmin.
 */
async function lockTarget(tx: Queryable, actor: AdminActor, userId: string): Promise<TargetRow> {
  if (!isUuid(userId)) throw new AdminError("not_found", "User not found")
  const { rows } = await tx.query<TargetRow>(
    `select id, email, platform_role, email_verified_at, totp_enabled_at, suspended_at, suspended_reason
       from app.users where id = $1 for update`,
    [userId],
  )
  const target = rows[0]
  if (!target) throw new AdminError("not_found", "User not found")
  if (target.id === actor.id) throw new AdminError("forbidden", "You can't do this to your own account here")
  if (target.platform_role === "superadmin") throw new AdminError("forbidden", "A superadmin's account can't be changed here")
  if (target.platform_role && actor.role !== "superadmin") throw new AdminError("forbidden", "Only a superadmin can change another staff account")
  return target
}

// app.auth_events, so the account's own security log shows what staff did to it
async function logEvent(tx: Queryable, event: string, userId: string | null, email: string | null, meta: RequestMeta) {
  await tx.query("insert into app.auth_events (event, user_id, email, ip, user_agent) values ($1, $2, $3, $4::inet, $5)", [
    event,
    userId,
    email,
    meta.ip ?? null,
    meta.userAgent ? meta.userAgent.slice(0, 512) : null,
  ])
}

/** What an action changed, for the audit entry. */
export interface ActionChange<Extra = object> {
  before: unknown
  after: unknown
  /** Extra output for the caller (never secrets that end up in the audit log). */
  extra: Extra
}

/** Marks the email verified without a code, and voids any code still out. */
export async function adminVerifyEmail(tx: Queryable, actor: AdminActor, userId: string, meta: RequestMeta = {}): Promise<ActionChange> {
  const target = await lockTarget(tx, actor, userId)
  if (target.email_verified_at) throw new AdminError("invalid_input", "This email is already verified")
  await tx.query("update app.users set email_verified_at = now() where id = $1", [userId])
  await tx.query("update app.verification_codes set consumed_at = now() where user_id = $1 and purpose = 'email_verify' and consumed_at is null", [userId])
  await logEvent(tx, "email_verified", userId, target.email, meta)
  return { before: { emailVerified: false }, after: { emailVerified: true, email: target.email }, extra: {} }
}

/** A new verification code for the account's (unverified) address. The caller emails `code`; staff never see it. */
export async function adminResendVerification(
  tx: Queryable,
  actor: AdminActor,
  userId: string,
  meta: RequestMeta = {},
): Promise<ActionChange<{ email: string; code: string }>> {
  const target = await lockTarget(tx, actor, userId)
  if (target.email_verified_at) throw new AdminError("invalid_input", "This email is already verified")
  const sent = await issueEmailCode(inTransaction(tx), userId, {}, meta)
  return { before: null, after: { email: sent.email }, extra: sent }
}

/**
 * A password reset code, mailed to the account like "Forgot password" does. Staff never see or set
 * the password: the user picks it with the code. The caller emails `code`.
 */
export async function adminSendPasswordReset(
  tx: Queryable,
  actor: AdminActor,
  userId: string,
  meta: RequestMeta = {},
): Promise<ActionChange<{ email: string; code: string }>> {
  const target = await lockTarget(tx, actor, userId)
  const sent = await requestPasswordReset(inTransaction(tx), target.email, meta)
  if (!sent) throw new AdminError("not_found", "User not found")
  return { before: null, after: { email: sent.email }, extra: sent }
}

/** Turns two-step sign-in off: the authenticator secret and recovery codes are gone, open sign-ins too. */
export async function adminResetTwoFactor(tx: Queryable, actor: AdminActor, userId: string, meta: RequestMeta = {}): Promise<ActionChange<{ email: string }>> {
  const target = await lockTarget(tx, actor, userId)
  if (!target.totp_enabled_at) throw new AdminError("invalid_input", "Two-step sign-in is already off")
  const { rows } = await tx.query<{ n: number }>("select count(*)::int as n from app.recovery_codes where user_id = $1 and used_at is null", [userId])
  await tx.query("update app.users set totp_secret = null, totp_enabled_at = null, totp_last_step = null where id = $1", [userId])
  await tx.query("delete from app.recovery_codes where user_id = $1", [userId])
  await tx.query("delete from app.login_challenges where user_id = $1", [userId])
  await logEvent(tx, "two_factor_disabled", userId, null, meta)
  return {
    before: { twoFactor: true, twoFactorAt: target.totp_enabled_at, recoveryCodesLeft: rows[0]!.n },
    after: { twoFactor: false },
    extra: { email: target.email },
  }
}

async function endSessions(tx: Queryable, userId: string): Promise<number> {
  const { rows } = await tx.query("delete from app.sessions where user_id = $1 returning id", [userId])
  await tx.query("delete from app.login_challenges where user_id = $1", [userId])
  return rows.length
}

/** Signs the account out everywhere, including sign-ins waiting for an authenticator code. */
export async function adminRevokeSessions(tx: Queryable, actor: AdminActor, userId: string, meta: RequestMeta = {}): Promise<ActionChange<{ signedOut: number }>> {
  await lockTarget(tx, actor, userId)
  const signedOut = await endSessions(tx, userId)
  await logEvent(tx, "sessions_revoked", userId, null, meta)
  return { before: { sessions: signedOut }, after: { sessions: 0 }, extra: { signedOut } }
}

/** Suspends the account: it can't sign in, and every session ends now. `reason` is for staff only. */
export async function adminSuspendUser(
  tx: Queryable,
  actor: AdminActor,
  userId: string,
  reason: string,
  meta: RequestMeta = {},
): Promise<ActionChange<{ email: string; signedOut: number }>> {
  const target = await lockTarget(tx, actor, userId)
  if (target.suspended_at) throw new AdminError("invalid_input", "This account is already suspended")
  const { rows } = await tx.query<{ suspended_at: Date }>(
    "update app.users set suspended_at = now(), suspended_reason = $2 where id = $1 returning suspended_at",
    [userId, reason.slice(0, 1000)],
  )
  const signedOut = await endSessions(tx, userId)
  await logEvent(tx, "sessions_revoked", userId, null, meta)
  return {
    before: { suspendedAt: null },
    after: { suspendedAt: rows[0]!.suspended_at, signedOut },
    extra: { email: target.email, signedOut },
  }
}

/** Lifts a suspension; the account can sign in again. */
export async function adminUnsuspendUser(tx: Queryable, actor: AdminActor, userId: string): Promise<ActionChange<{ email: string }>> {
  const target = await lockTarget(tx, actor, userId)
  if (!target.suspended_at) throw new AdminError("invalid_input", "This account isn't suspended")
  await tx.query("update app.users set suspended_at = null, suspended_reason = null where id = $1", [userId])
  return {
    before: { suspendedAt: target.suspended_at, suspendedReason: target.suspended_reason },
    after: { suspendedAt: null },
    extra: { email: target.email },
  }
}

/**
 * Deletes the account the way the user would (deleteAccount): workspaces only it belongs to go
 * with it, shared ones it owns alone pass to another member. `confirmEmail` must be the account's email.
 */
export async function adminDeleteUser(
  tx: Queryable,
  actor: AdminActor,
  userId: string,
  confirmEmail: unknown,
  meta: RequestMeta = {},
): Promise<ActionChange<{ email: string }>> {
  const target = await lockTarget(tx, actor, userId)
  if (typeof confirmEmail !== "string" || confirmEmail.trim().toLowerCase() !== target.email) {
    throw new AdminError("invalid_input", "Type the account's email address exactly to confirm")
  }
  const impact = await deletionImpact(tx, userId)
  await deleteAccount(inTransaction(tx), userId, target.email, meta)
  return {
    before: {
      email: target.email,
      platformRole: target.platform_role,
      deletedWorkspaces: impact.deleted.map((w) => w.organizationId),
      transferredWorkspaces: impact.transferred.map((w) => ({ organizationId: w.organizationId, newOwnerId: w.newOwnerId })),
    },
    after: null,
    extra: { email: target.email },
  }
}

/** Adds an internal note to the account. Any staff member may, on any account. */
export async function addUserNote(tx: Queryable, actorId: string, userId: string, rawBody: unknown): Promise<AdminUserNote> {
  const body = typeof rawBody === "string" ? rawBody.trim() : ""
  if (!body) throw new AdminError("invalid_input", "Write a note")
  if (body.length > NOTE_MAX) throw new AdminError("invalid_input", "A note can be at most 5000 characters")
  if (!isUuid(userId)) throw new AdminError("not_found", "User not found")
  const exists = await tx.query("select 1 from app.users where id = $1", [userId])
  if (!exists.rows.length) throw new AdminError("not_found", "User not found")
  const { rows } = await tx.query<AdminUserNote>(
    `with n as (insert into app.admin_user_notes (user_id, author_id, body) values ($1, $2, $3) returning *)
     select n.id, n.body, n.author_id as "authorId", coalesce(a.display_name, a.username) as "authorName", n.created_at as "createdAt"
       from n left join app.users a on a.id = n.author_id`,
    [userId, actorId, body],
  )
  return rows[0]!
}
