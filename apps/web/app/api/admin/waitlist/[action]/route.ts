import { AdminError, deleteFromWaitlist, inviteFromWaitlist } from "@apex/db"
import { withAdminAction, type AdminActionContext } from "@/lib/admin"
import { errorJson } from "@/lib/auth"
import { localizePath } from "@/lib/i18n"
import { sendWaitlistInvite } from "@/lib/mail"
import { siteUrl } from "@/lib/site"
import { signupsModeIn } from "@/lib/signups"

// POST /api/admin/waitlist/<action>, body { ids, reason }. Audited like every admin action (lib/admin.ts).
//
//   invite   emails each chosen person a sign-up link in their language; an invited address may
//            sign up while sign-ups are invite-only. Sends mail but destroys nothing: no step-up.
//   delete   removes the chosen emails for good, so it needs a step-up

type Params = { action: string }
type Ctx = AdminActionContext<Params>

const ACTIONS: Record<string, ReturnType<typeof withAdminAction<Params>>> = {
  invite: withAdminAction<Params>({ action: "waitlist.invite", targetType: "waitlist", stepUp: false }, async ({ tx, admin, body }: Ctx) => {
    // while sign-ups are closed an invitation wouldn't let anyone in
    if ((await signupsModeIn(tx)) === "closed") {
      throw new AdminError("invalid_input", "Sign-ups are closed. Make them invite-only or open in Settings before inviting people")
    }
    const c = await inviteFromWaitlist(tx, admin.user.id, body.ids)
    const { invites, skipped } = c.extra
    return {
      targetId: null,
      before: c.before,
      after: c.after,
      result: { invited: invites.length, skipped },
      afterCommit: async () => {
        for (const i of invites) await sendWaitlistInvite(i.email, `${siteUrl()}${localizePath("/signup", i.locale)}`, i.locale)
      },
    }
  }),

  delete: withAdminAction<Params>({ action: "waitlist.delete", targetType: "waitlist" }, async ({ tx, body }: Ctx) => {
    const c = await deleteFromWaitlist(tx, body.ids)
    return { targetId: null, before: c.before, after: c.after, result: { deleted: c.extra.deleted } }
  }),
}

export async function POST(request: Request, route: { params: Promise<Params> }) {
  const handler = ACTIONS[(await route.params).action]
  if (!handler) return errorJson("not_found", "Not found", { status: 404 })
  return handler(request, route)
}
