import { after } from "next/server"
import { adminDeleteSource, adminDisableRefresh, adminResetSync, adminResyncSource } from "@apex/db"
import { withAdminAction, type AdminActionContext } from "@/lib/admin"
import { errorJson } from "@/lib/auth"
import { crawlInto } from "@/lib/knowledge"

// POST /api/admin/knowledge/<id>/<action>, body { reason }. Every action is audited with its reason
// against the source (target "knowledge_source") and needs a recent step-up. Changes to chunks bump
// the bot's knowledge version, so the chat API reloads them on its next sync.

// a resync crawls after the response, as the owner's own sync does (/api/knowledge/[id]/sync)
export const maxDuration = 300

type Params = { id: string; action: string }
type Ctx = AdminActionContext<Params>

const ACTIONS: Record<string, ReturnType<typeof withAdminAction<Params>>> = {
  resync: withAdminAction<Params>({ action: "knowledge.resync", targetType: "knowledge_source" }, async ({ tx, params }: Ctx) => {
    const c = await adminResyncSource(tx, params.id)
    const { claimed } = c.extra
    // the claim must be committed before the crawl can finish it
    return { targetId: params.id, before: c.before, after: c.after, afterCommit: async () => after(() => crawlInto(claimed)) }
  }),

  "reset-sync": withAdminAction<Params>({ action: "knowledge.reset_sync", targetType: "knowledge_source" }, async ({ tx, params }: Ctx) => {
    const c = await adminResetSync(tx, params.id)
    return { targetId: params.id, before: c.before, after: c.after }
  }),

  "refresh-off": withAdminAction<Params>({ action: "knowledge.refresh_off", targetType: "knowledge_source" }, async ({ tx, params }: Ctx) => {
    const c = await adminDisableRefresh(tx, params.id)
    return { targetId: params.id, before: c.before, after: c.after }
  }),

  delete: withAdminAction<Params>({ action: "knowledge.delete", targetType: "knowledge_source" }, async ({ tx, params }: Ctx) => {
    const c = await adminDeleteSource(tx, params.id)
    return { targetId: params.id, before: c.before, after: c.after, result: c.extra }
  }),
}

export async function POST(request: Request, route: { params: Promise<Params> }) {
  const handler = ACTIONS[(await route.params).action]
  if (!handler) return errorJson("not_found", "Not found", { status: 404 })
  return handler(request, route)
}
