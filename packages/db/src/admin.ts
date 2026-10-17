import { isIP } from "node:net"
import type { Db, Queryable } from "./db.ts"
import { normalizeEmail } from "./auth.ts"
import type { ListSpec } from "./admin-list.ts"

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

/** Appends one entry to app.admin_audit_log. Pass the transaction the change itself runs in. */
export async function writeAudit(q: Queryable, entry: AuditEntry): Promise<string> {
  if (!entry.action || !entry.targetType) throw new AdminError("invalid_input", "An audit entry needs an action and a target type")
  const { rows } = await q.query<{ id: string }>(
    `insert into app.admin_audit_log (actor_id, action, target_type, target_id, reason, before, after, ip, user_agent)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9) returning id::text`,
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
    const user = await tx.query<{ id: string; platform_role: string | null }>("select id, platform_role from app.users where email = $1", [email])
    if (!user.rows.length) throw new AdminError("not_found", `No account with the email ${email}; sign up first`)
    const { id, platform_role } = user.rows[0]!
    const existing = await tx.query<{ id: string }>("select id from app.users where platform_role = 'superadmin' limit 1")
    if (existing.rows.length) {
      if (existing.rows[0]!.id === id) return { userId: id, created: false }
      throw new AdminError("already_bootstrapped", "A superadmin already exists")
    }
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
  select: `u.id, u.email, u.username, u.display_name, u.platform_role,
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
    twoFactor: { on: "u.totp_enabled_at is not null", off: "u.totp_enabled_at is null" },
  },
} satisfies ListSpec
