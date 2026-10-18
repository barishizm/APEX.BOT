import { staffAssignTicket, staffReply, staffSetTicketPriority, staffSetTicketStatus } from "@apex/db"
import { withAdminAction, type AdminActionContext } from "@/lib/admin"
import { errorJson } from "@/lib/auth"
import { notifyAssigned, notifyStaffReply } from "@/lib/support"

// POST /api/admin/support/<id>/<action>. Working the queue is routine and destroys nothing, so none
// of these need a step-up or a reason (one is recorded when given): a reply or note says why by
// itself, and the before/after in the audit entry shows what an assignment or status change did.
//
//   reply     { body, status? }   public answer; the customer gets an email
//   note      { body, status? }   staff-only, never emailed
//   assign    { assigneeId }      a staff member's id, or null to unassign
//   status    { status }
//   priority  { priority }

type Params = { id: string; action: string }
type Ctx = AdminActionContext<Params>

const options = (action: string) => ({ action, targetType: "support_ticket", stepUp: false, reason: false })

const ACTIONS: Record<string, ReturnType<typeof withAdminAction<Params>>> = {
  reply: withAdminAction<Params>(options("support.reply"), async ({ tx, admin, params, body }: Ctx) => {
    const c = await staffReply(tx, admin.user.id, params.id, { body: body.body, status: body.status })
    const mail = c.extra.mail
    const text = typeof body.body === "string" ? body.body.trim() : ""
    return {
      targetId: params.id,
      before: c.before,
      after: c.after,
      result: { messageId: c.extra.messageId },
      afterCommit: mail ? () => notifyStaffReply(mail, text) : undefined,
    }
  }),

  note: withAdminAction<Params>(options("support.note"), async ({ tx, admin, params, body }: Ctx) => {
    const c = await staffReply(tx, admin.user.id, params.id, { body: body.body, internal: true, status: body.status })
    return { targetId: params.id, before: c.before, after: c.after, result: { messageId: c.extra.messageId } }
  }),

  // the new assignee hears about it, unless they took it themselves
  assign: withAdminAction<Params>(options("support.assign"), async ({ tx, admin, params, body }: Ctx) => {
    const c = await staffAssignTicket(tx, params.id, body.assigneeId ?? null)
    const mail = c.extra.mail
    const self = body.assigneeId === admin.user.id
    return { targetId: params.id, before: c.before, after: c.after, afterCommit: mail && !self ? () => notifyAssigned(mail) : undefined }
  }),

  status: withAdminAction<Params>(options("support.status"), async ({ tx, params, body }: Ctx) => {
    const c = await staffSetTicketStatus(tx, params.id, body.status)
    return { targetId: params.id, before: c.before, after: c.after }
  }),

  priority: withAdminAction<Params>(options("support.priority"), async ({ tx, params, body }: Ctx) => {
    const c = await staffSetTicketPriority(tx, params.id, body.priority)
    return { targetId: params.id, before: c.before, after: c.after }
  }),
}

export async function POST(request: Request, route: { params: Promise<Params> }) {
  const handler = ACTIONS[(await route.params).action]
  if (!handler) return errorJson("not_found", "Not found", { status: 404 })
  return handler(request, route)
}
