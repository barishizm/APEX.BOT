import { supportGetConversation } from "@apex/db"
import { adminErrorResponse } from "@/lib/admin"
import { errorJson, readJson, requestMeta, requireAdminSession } from "@/lib/auth"
import { conversationJson } from "@/lib/conversations"
import { db } from "@/lib/db"

type Params = { id: string; conversationId: string }

// POST {}: the same transcript with the visitor's details and messages as they are. A separate
// audit event ("bot.conversation.reveal_pii"), counted against the staff write limit. JSON only,
// so another site can't trigger it with a form.
export async function POST(request: Request, { params }: { params: Promise<Params> }) {
  try {
    const admin = await requireAdminSession("support", { write: true })
    await readJson(request)
    const { id, conversationId } = await params
    const found = await supportGetConversation(db(), admin.user.id, id, conversationId, { reveal: true, meta: await requestMeta() })
    if (!found) return errorJson("not_found", "This conversation doesn't exist or was deleted", { status: 404 })
    return Response.json({ ...conversationJson(found.conversation), masked: false })
  } catch (err) {
    return adminErrorResponse(err)
  }
}
