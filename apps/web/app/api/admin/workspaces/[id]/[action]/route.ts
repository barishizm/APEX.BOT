import {
  adminChangeMemberRole,
  adminDeleteWorkspace,
  adminRemoveMember,
  adminResendInvite,
  adminRevokeInvite,
  adminSetPlan,
  adminSetWorkspaceNote,
  adminSuspendWorkspace,
  adminTransferOwnership,
  adminUnsuspendWorkspace,
  assertMayChangeWorkspace,
  PLAN_AUDIT_ACTION,
} from "@apex/db"
import { withAdminAction, type AdminActionContext } from "@/lib/admin"
import { errorJson, type AdminSession } from "@/lib/auth"
import { isLocale } from "@/lib/i18n/config"
import { requestLocale } from "@/lib/i18n/server"
import { sendInvitation } from "@/lib/mail"
import { siteOrigin } from "@/lib/oauth"

// POST /api/admin/workspaces/<id>/<action>, body { reason, … }. Every action is audited with its reason
// against the workspace (target "organization"), and all but the staff note need a recent step-up.
// Member and invitation actions name their target in the body (userId, inviteId); team.ts does the
// work, so a workspace keeps an owner whatever staff do. A workspace with staff in it is a superadmin's
// to change (assertMayChangeWorkspace), all but its note.

type Params = { id: string; action: string }
type Ctx = AdminActionContext<Params>

const str = (v: unknown) => (typeof v === "string" ? v : "")
const mayChange = (tx: Ctx["tx"], admin: AdminSession, id: string) =>
  assertMayChangeWorkspace(tx, { id: admin.user.id, role: admin.user.platformRole }, id)

const ACTIONS: Record<string, ReturnType<typeof withAdminAction<Params>>> = {
  // the plan timeline on the detail page reads these entries back
  plan: withAdminAction<Params>({ action: PLAN_AUDIT_ACTION, targetType: "organization" }, async ({ tx, params, body, admin }: Ctx) => {
    await mayChange(tx, admin, params.id)
    const c = await adminSetPlan(tx, params.id, body.plan)
    return { targetId: params.id, before: c.before, after: c.after, result: { limits: c.extra.limits } }
  }),

  suspend: withAdminAction<Params>({ action: "organization.suspend", targetType: "organization" }, async ({ tx, params, reason, admin }: Ctx) => {
    await mayChange(tx, admin, params.id)
    const c = await adminSuspendWorkspace(tx, params.id, reason)
    return { targetId: params.id, before: c.before, after: c.after, result: c.extra }
  }),

  unsuspend: withAdminAction<Params>({ action: "organization.unsuspend", targetType: "organization" }, async ({ tx, params, admin }: Ctx) => {
    await mayChange(tx, admin, params.id)
    const c = await adminUnsuspendWorkspace(tx, params.id)
    return { targetId: params.id, before: c.before, after: c.after, result: c.extra }
  }),

  delete: withAdminAction<Params>({ action: "organization.delete", targetType: "organization" }, async ({ tx, params, body, admin }: Ctx) => {
    await mayChange(tx, admin, params.id)
    const c = await adminDeleteWorkspace(tx, params.id, body.confirmName)
    return { targetId: params.id, before: c.before, after: c.after, result: c.extra }
  }),

  // the staff note: the note itself says why, so no reason and no step-up
  note: withAdminAction<Params>({ action: "organization.note", targetType: "organization", stepUp: false, reason: false }, async ({ tx, params, body }: Ctx) => {
    const c = await adminSetWorkspaceNote(tx, params.id, body.note)
    return { targetId: params.id, before: c.before, after: c.after }
  }),

  "member-role": withAdminAction<Params>({ action: "organization.member_role", targetType: "organization" }, async ({ tx, params, body, admin }: Ctx) => {
    await mayChange(tx, admin, params.id)
    const c = await adminChangeMemberRole(tx, params.id, str(body.userId), body.role)
    return { targetId: params.id, before: c.before, after: c.after }
  }),

  "member-remove": withAdminAction<Params>({ action: "organization.member_remove", targetType: "organization" }, async ({ tx, params, body, admin }: Ctx) => {
    await mayChange(tx, admin, params.id)
    const c = await adminRemoveMember(tx, params.id, str(body.userId))
    return { targetId: params.id, before: c.before, after: c.after }
  }),

  "transfer-ownership": withAdminAction<Params>({ action: "organization.transfer_ownership", targetType: "organization" }, async ({ tx, params, body, admin }: Ctx) => {
    await mayChange(tx, admin, params.id)
    const c = await adminTransferOwnership(tx, params.id, str(body.userId))
    return { targetId: params.id, before: c.before, after: c.after }
  }),

  "invite-revoke": withAdminAction<Params>({ action: "organization.invite_revoke", targetType: "organization" }, async ({ tx, params, body, admin }: Ctx) => {
    await mayChange(tx, admin, params.id)
    const c = await adminRevokeInvite(tx, params.id, str(body.inviteId))
    return { targetId: params.id, before: c.before, after: c.after }
  }),

  // mails a new link, like "Send again" in the team settings; `locale` is the email's language
  "invite-resend": withAdminAction<Params>(
    { action: "organization.invite_resend", targetType: "organization", stepUp: false },
    async ({ tx, params, body, admin }: Ctx) => {
      await mayChange(tx, admin, params.id)
      const c = await adminResendInvite(tx, params.id, str(body.inviteId))
      const locale = isLocale(body.locale) ? body.locale : await requestLocale()
      const { email, token, workspaceName, inviter } = c.extra
      return {
        targetId: params.id,
        before: c.before,
        after: { ...(c.after as object), locale },
        afterCommit: () => sendInvitation(email, { workspace: workspaceName, inviter: inviter ?? "Apex Bot", link: `${siteOrigin()}/invite/${token}`, locale }),
      }
    },
  ),
}

export async function POST(request: Request, route: { params: Promise<Params> }) {
  const handler = ACTIONS[(await route.params).action]
  if (!handler) return errorJson("not_found", "Not found", { status: 404 })
  return handler(request, route)
}
