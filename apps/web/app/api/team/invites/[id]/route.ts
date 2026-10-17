import { revokeInvite } from "@apex/db"
import { db } from "@/lib/db"
import { botErrorResponse, requireApiUser } from "@/lib/bot"

// Withdraws an open invitation
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser()
    await revokeInvite(db(), user.id, (await params).id)
    return new Response(null, { status: 204 })
  } catch (err) {
    return botErrorResponse(err)
  }
}
