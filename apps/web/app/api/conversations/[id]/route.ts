import { deleteConversationForUser, getConversationForUser } from "@apex/db"
import { errorJson } from "@/lib/auth"
import { botErrorResponse, requireApiUser } from "@/lib/bot"
import { conversationJson } from "@/lib/conversations"
import { db } from "@/lib/db"
import { siteScope } from "@/lib/current-site"

const notFound = () => errorJson("not_found", "This conversation doesn't exist or was deleted", { status: 404 })

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser()
    const conversation = await getConversationForUser(db(), await siteScope(user.id), (await params).id)
    return conversation ? Response.json(conversationJson(conversation)) : notFound()
  } catch (err) {
    return botErrorResponse(err)
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser()
    return (await deleteConversationForUser(db(), await siteScope(user.id), (await params).id)) ? new Response(null, { status: 204 }) : notFound()
  } catch (err) {
    return botErrorResponse(err)
  }
}
