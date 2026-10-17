import {
  addUserNote,
  adminDeleteUser,
  adminResendVerification,
  adminResetTwoFactor,
  adminRevokeSessions,
  adminSendPasswordReset,
  adminSuspendUser,
  adminUnsuspendUser,
  adminVerifyEmail,
  AuthError,
  changePlatformRole,
  type AdminActor,
} from "@apex/db"
import { withAdminAction, type AdminActionContext } from "@/lib/admin"
import { errorJson, type AdminSession } from "@/lib/auth"
import { isLocale, type Locale } from "@/lib/i18n/config"
import { requestLocale } from "@/lib/i18n/server"
import { sendStaffNotice, sendStaffPasswordReset, sendVerificationCode } from "@/lib/mail"

// POST /api/admin/users/<id>/<action>, body { reason, locale?, … }. Every action is audited with its
// reason (see lib/admin.ts); the destructive ones also need a recent step-up. `locale` is the
// language of the email the user gets, when the action sends one.

type Params = { id: string; action: string }
type Ctx = AdminActionContext<Params>

const actor = (admin: AdminSession): AdminActor => ({ id: admin.user.id, role: admin.user.platformRole })

async function mailLocale(body: Record<string, unknown>): Promise<Locale> {
  return isLocale(body.locale) ? body.locale : requestLocale()
}

const ACTIONS: Record<string, ReturnType<typeof withAdminAction<Params>>> = {
  // a trust decision without proof of the inbox, so it needs a step-up too
  "verify-email": withAdminAction<Params>({ action: "user.verify_email", targetType: "user" }, async ({ tx, admin, params, meta }: Ctx) => {
    const c = await adminVerifyEmail(tx, actor(admin), params.id, meta)
    return { targetId: params.id, before: c.before, after: c.after }
  }),

  "resend-verification": withAdminAction<Params>(
    { action: "user.resend_verification", targetType: "user", stepUp: false },
    async ({ tx, admin, params, body, meta }: Ctx) => {
      const c = await adminResendVerification(tx, actor(admin), params.id, meta)
      const locale = await mailLocale(body)
      return { targetId: params.id, before: c.before, after: { ...(c.after as object), locale }, afterCommit: () => sendVerificationCode(c.extra.email, c.extra.code, locale) }
    },
  ),

  "password-reset": withAdminAction<Params>(
    { action: "user.password_reset_email", targetType: "user", stepUp: false },
    async ({ tx, admin, params, body, meta }: Ctx) => {
      const c = await adminSendPasswordReset(tx, actor(admin), params.id, meta)
      const locale = await mailLocale(body)
      return { targetId: params.id, before: c.before, after: { ...(c.after as object), locale }, afterCommit: () => sendStaffPasswordReset(c.extra.email, c.extra.code, locale) }
    },
  ),

  "reset-two-factor": withAdminAction<Params>({ action: "user.reset_two_factor", targetType: "user" }, async ({ tx, admin, params, body, meta }: Ctx) => {
    const c = await adminResetTwoFactor(tx, actor(admin), params.id, meta)
    const locale = await mailLocale(body)
    return { targetId: params.id, before: c.before, after: c.after, afterCommit: () => sendStaffNotice(c.extra.email, "twoFactorReset", locale) }
  }),

  "revoke-sessions": withAdminAction<Params>({ action: "user.revoke_sessions", targetType: "user" }, async ({ tx, admin, params, meta }: Ctx) => {
    const c = await adminRevokeSessions(tx, actor(admin), params.id, meta)
    return { targetId: params.id, before: c.before, after: c.after, result: { signedOut: c.extra.signedOut } }
  }),

  suspend: withAdminAction<Params>({ action: "user.suspend", targetType: "user" }, async ({ tx, admin, params, body, reason, meta }: Ctx) => {
    const c = await adminSuspendUser(tx, actor(admin), params.id, reason, meta)
    const locale = await mailLocale(body)
    const notify = body.notify !== false
    return {
      targetId: params.id,
      before: c.before,
      after: { ...(c.after as object), notified: notify },
      result: { signedOut: c.extra.signedOut },
      afterCommit: notify ? () => sendStaffNotice(c.extra.email, "accountSuspended", locale) : undefined,
    }
  }),

  unsuspend: withAdminAction<Params>({ action: "user.unsuspend", targetType: "user" }, async ({ tx, admin, params, body }: Ctx) => {
    const c = await adminUnsuspendUser(tx, actor(admin), params.id)
    const locale = await mailLocale(body)
    const notify = body.notify !== false
    return {
      targetId: params.id,
      before: c.before,
      after: { ...(c.after as object), notified: notify },
      afterCommit: notify ? () => sendStaffNotice(c.extra.email, "accountReinstated", locale) : undefined,
    }
  }),

  delete: withAdminAction<Params>({ action: "user.delete", targetType: "user" }, async ({ tx, admin, params, body, meta }: Ctx) => {
    const c = await adminDeleteUser(tx, actor(admin), params.id, body.confirmEmail, meta)
    const locale = await mailLocale(body)
    return { targetId: params.id, before: c.before, after: c.after, afterCommit: () => sendStaffNotice(c.extra.email, "accountDeleted", locale) }
  }),

  // body.role: "support" or null. changePlatformRole checks the actor is a superadmin again, inside the transaction.
  role: withAdminAction<Params>({ action: "user.platform_role", targetType: "user", minRole: "superadmin" }, async ({ tx, admin, params, body }: Ctx) => {
    if (body.role !== null && body.role !== "support") throw new AuthError("invalid_input", "Choose a role")
    const c = await changePlatformRole(tx, admin.user.id, params.id, body.role)
    return { targetId: params.id, before: { platformRole: c.before }, after: { platformRole: c.after } }
  }),

  // an internal note: the body is the reason, so none is asked for and no step-up either
  note: withAdminAction<Params>({ action: "user.note", targetType: "user", stepUp: false, reason: false }, async ({ tx, admin, params, body }: Ctx) => {
    const note = await addUserNote(tx, admin.user.id, params.id, body.body)
    return { targetId: params.id, before: null, after: { noteId: note.id }, result: { note } }
  }),
}

export async function POST(request: Request, route: { params: Promise<Params> }) {
  const handler = ACTIONS[(await route.params).action]
  if (!handler) return errorJson("not_found", "Not found", { status: 404 })
  return handler(request, route)
}
