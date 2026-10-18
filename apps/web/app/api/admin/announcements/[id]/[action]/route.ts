import { clearSettingsCache, deleteAnnouncement, endAnnouncement, updateAnnouncement } from "@apex/db"
import { withAdminAction, type AdminActionContext } from "@/lib/admin"
import { errorJson } from "@/lib/auth"

// POST /api/admin/announcements/<id>/<action>, body { reason, … }. Superadmins only, no step-up
// (an announcement can be written again); the audit entry keeps its text before and after.
//
//   update  the same fields as creating one
//   end     takes a running one down now
//   delete

type Params = { id: string; action: string }
type Ctx = AdminActionContext<Params>

const options = (action: string) => ({ action, targetType: "announcement", minRole: "superadmin" as const, stepUp: false })
const afterCommit = async () => clearSettingsCache()

const ACTIONS: Record<string, ReturnType<typeof withAdminAction<Params>>> = {
  update: withAdminAction<Params>(options("announcement.update"), async ({ tx, params, body }: Ctx) => {
    const c = await updateAnnouncement(tx, params.id, body)
    return { targetId: params.id, before: c.before, after: c.after, result: { announcement: c.extra.announcement }, afterCommit }
  }),
  end: withAdminAction<Params>(options("announcement.end"), async ({ tx, params }: Ctx) => {
    const c = await endAnnouncement(tx, params.id)
    return { targetId: params.id, before: c.before, after: c.after, afterCommit }
  }),
  delete: withAdminAction<Params>(options("announcement.delete"), async ({ tx, params }: Ctx) => {
    const c = await deleteAnnouncement(tx, params.id)
    return { targetId: params.id, before: c.before, after: c.after, afterCommit }
  }),
}

export async function POST(request: Request, route: { params: Promise<Params> }) {
  const handler = ACTIONS[(await route.params).action]
  if (!handler) return errorJson("not_found", "Not found", { status: 404 })
  return handler(request, route)
}
