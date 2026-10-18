import type { Db, Queryable } from "./db.ts"
import { AuthError, IMPERSONATION_MAX_MINUTES, type RequestMeta } from "./auth.ts"
import { writeAudit } from "./admin.ts"
import { newSessionToken, sha256 } from "./crypto.ts"

// "View as user": a superadmin sees the app as a customer does, read-only, for at most
// IMPERSONATION_MAX_MINUTES. It is a session type of its own (app.impersonation_sessions, its own
// cookie) next to the staff member's real session, which stays as it is; getImpersonatedSession in
// auth.ts resolves it. The web app refuses every write while one is open (lib/impersonation.ts).

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

export interface StartedImpersonation {
  id: string
  /** For the impersonation cookie; only its hash is stored. */
  token: string
  expiresAt: Date
  target: { id: string; email: string }
}

/**
 * Starts a view of the app as `targetUserId`, for `minutes` (1 to 30). Only a superadmin may, never
 * as themselves, as other staff or as a suspended account. A view the same staff session still had
 * open ends first, audited as an exit. Run it in the transaction that writes the audit entry (withAdminAction).
 */
export async function startImpersonation(
  tx: Queryable,
  admin: { id: string; sessionId: string },
  targetUserId: string,
  reason: string,
  minutes: unknown = IMPERSONATION_MAX_MINUTES,
  meta: RequestMeta = {},
): Promise<StartedImpersonation> {
  const n = minutes === undefined || minutes === null ? IMPERSONATION_MAX_MINUTES : Number(minutes)
  if (!Number.isInteger(n) || n < 1 || n > IMPERSONATION_MAX_MINUTES) throw new AuthError("invalid_input", "Choose up to 30 minutes")
  if (!reason.trim()) throw new AuthError("invalid_input", "Give a reason for this action")
  const actor = await tx.query("select 1 from app.users where id = $1 and platform_role = 'superadmin' and suspended_at is null", [admin.id])
  if (!actor.rows.length) throw new AuthError("forbidden", "Only a superadmin can view the app as a user")
  if (!isUuid(targetUserId)) throw new AuthError("not_found", "User not found")
  const { rows } = await tx.query<{ id: string; email: string; platform_role: string | null; suspended: boolean }>(
    "select id, email, platform_role, suspended_at is not null as suspended from app.users where id = $1",
    [targetUserId],
  )
  const target = rows[0]
  if (!target) throw new AuthError("not_found", "User not found")
  if (target.id === admin.id) throw new AuthError("forbidden", "You can't view the app as yourself")
  if (target.platform_role) throw new AuthError("forbidden", "Staff accounts can't be viewed as")
  if (target.suspended) throw new AuthError("forbidden", "Suspended accounts can't be viewed as")

  const replaced = await tx.query<EndedRow>(
    `update app.impersonation_sessions set ended_at = least(now(), expires_at)
      where admin_session_id = $1 and ended_at is null
      returning ${ENDED_COLUMNS}`,
    [admin.sessionId],
  )
  const token = newSessionToken()
  const inserted = await tx.query<{ id: string; expires_at: Date }>(
    `insert into app.impersonation_sessions (token_hash, admin_id, admin_session_id, target_user_id, reason, expires_at)
     values ($1, $2, $3, $4, $5, now() + make_interval(mins => $6)) returning id, expires_at`,
    [sha256(token), admin.id, admin.sessionId, target.id, reason.slice(0, 1000), n],
  )
  const id = inserted.rows[0]!.id
  for (const r of replaced.rows) await auditEnd(tx, r, meta, { replacedBy: id })
  return { id, token, expiresAt: inserted.rows[0]!.expires_at, target: { id: target.id, email: target.email } }
}

interface EndedRow {
  id: string
  admin_id: string
  target_user_id: string
  created_at: Date
  expires_at: Date
  expired: boolean
}

// `expired`: it had run out before it was ended
const ENDED_COLUMNS = "id, admin_id, target_user_id, created_at, expires_at, expires_at <= now() as expired"

/** "user.impersonate.end", by the staff member who started the view, against the customer. */
function auditEnd(tx: Queryable, r: EndedRow, meta: RequestMeta, after: Record<string, unknown> = {}) {
  return writeAudit(tx, {
    actorId: r.admin_id,
    action: "user.impersonate.end",
    targetType: "user",
    targetId: r.target_user_id,
    before: { impersonationId: r.id, startedAt: r.created_at, expiresAt: r.expires_at },
    after: { expired: r.expired, ...after },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })
}

export interface EndedImpersonation {
  id: string
  adminId: string
  targetUserId: string
  /** It had run out before it was ended. */
  expired: boolean
}

/**
 * Ends the view this token belongs to, expired or not, and audits it ("user.impersonate.end",
 * by the staff member, against the customer). Null for an unknown token or one already ended.
 */
export async function endImpersonation(db: Db, token: string | undefined | null, meta: RequestMeta = {}): Promise<EndedImpersonation | null> {
  if (!token) return null
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<EndedRow>(
      `update app.impersonation_sessions set ended_at = least(now(), expires_at)
        where token_hash = $1 and ended_at is null
        returning ${ENDED_COLUMNS}`,
      [sha256(token)],
    )
    const r = rows[0]
    if (!r) return null
    await auditEnd(tx, r, meta)
    return { id: r.id, adminId: r.admin_id, targetUserId: r.target_user_id, expired: r.expired }
  })
}
