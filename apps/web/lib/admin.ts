import { AdminError, AuthError, type PlatformRole, type Queryable, writeAudit } from "@apex/db"
import { authErrorResponse, errorJson, readJson, requestMeta, requireAdminSession, requireStepUp, type AdminSession } from "@/lib/auth"
import { db } from "@/lib/db"

const STATUS: Record<AdminError["code"], number> = { not_found: 404, forbidden: 403, already_bootstrapped: 409, invalid_input: 400 }

export async function adminErrorResponse(err: unknown) {
  if (err instanceof AdminError) return errorJson(err.code, err.message, { status: STATUS[err.code] })
  return authErrorResponse(err)
}

export interface AdminActionContext<P> {
  /** The transaction the change runs in; the audit entry is written in it too. */
  tx: Queryable
  admin: AdminSession
  body: Record<string, unknown>
  params: P
  reason: string
}

/** What a handler changed; it becomes the audit entry. `result` is the JSON response (default 204). */
export interface AdminActionResult {
  targetId: string | null
  before: unknown
  after: unknown
  result?: unknown
}

export interface AdminActionOptions {
  /** e.g. "user.suspend"; stored as the audit entry's action. */
  action: string
  /** e.g. "user", "organization", "bot". */
  targetType: string
  minRole?: PlatformRole
  /**
   * Needs an authenticator code from the last 10 minutes. On by default; turn it off only for
   * changes that destroy nothing (deleting, suspending, plan changes and impersonating must keep it).
   */
  stepUp?: boolean
}

const MAX_REASON = 1000

/**
 * The only way to write an admin API mutation. It checks the staff session (role, two-step
 * sign-in, step-up, rate limit), requires a JSON body with a `reason`, and runs the handler in a
 * transaction together with its audit entry: when the audit can't be written, the change is undone.
 */
export function withAdminAction<P = Record<string, never>>(
  options: AdminActionOptions,
  handler: (ctx: AdminActionContext<P>) => Promise<AdminActionResult>,
) {
  return async (request: Request, route: { params: Promise<P> }): Promise<Response> => {
    try {
      const admin = await requireAdminSession(options.minRole, { write: true })
      if (options.stepUp !== false) requireStepUp(admin)
      const body = await readJson(request)
      const reason = typeof body.reason === "string" ? body.reason.trim() : ""
      if (!reason) throw new AuthError("invalid_input", "Give a reason for this action")
      if (reason.length > MAX_REASON) throw new AuthError("invalid_input", "The reason can be at most 1000 characters")
      const params = await route.params
      const meta = await requestMeta()

      const result = await db().transaction(async (tx) => {
        const done = await handler({ tx, admin, body, params, reason })
        await writeAudit(tx, {
          actorId: admin.user.id,
          action: options.action,
          targetType: options.targetType,
          targetId: done.targetId,
          reason,
          before: done.before,
          after: done.after,
          ip: meta.ip,
          userAgent: meta.userAgent,
        })
        return done.result
      })
      return result === undefined ? new Response(null, { status: 204 }) : Response.json(result)
    } catch (err) {
      return adminErrorResponse(err)
    }
  }
}
