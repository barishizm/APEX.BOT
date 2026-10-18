import { supportGetConversation } from "@apex/db"
import { adminErrorResponse } from "@/lib/admin"
import { errorJson, requestMeta, requireAdminSession } from "@/lib/auth"
import { conversationJson } from "@/lib/conversations"
import { db } from "@/lib/db"

type Params = { id: string; conversationId: string }

// GET: one transcript, masked, for a staff member with open support access. Every read is audited
// ("bot.conversation.view"), so the inbox doesn't prefetch in this mode.
export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  try {
    const admin = await requireAdminSession()
    const { id, conversationId } = await params
    const found = await supportGetConversation(db(), admin.user.id, id, conversationId, { meta: await requestMeta() })
    if (!found) return errorJson("not_found", "This conversation doesn't exist or was deleted", { status: 404 })
    return Response.json({ ...conversationJson(found.conversation), masked: true })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
