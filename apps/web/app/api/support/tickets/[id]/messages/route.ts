import { replyAsUser } from "@apex/db"
import { readJson } from "@/lib/auth"
import { botErrorResponse, requireApiUser } from "@/lib/bot"
import { db } from "@/lib/db"
import { limitTicketReply, notifyCustomerReply } from "@/lib/support"

// Body: { body }. The customer writes on their own ticket; staff get an email.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser()
    const b = await readJson(request)
    await limitTicketReply(user.id)
    const { mail } = await replyAsUser(db(), user.id, (await params).id, b.body)
    await notifyCustomerReply(mail, typeof b.body === "string" ? b.body.trim() : "")
    return new Response(null, { status: 204 })
  } catch (err) {
    return botErrorResponse(err)
  }
}
