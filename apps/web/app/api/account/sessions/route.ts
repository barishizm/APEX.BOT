import { revokeOtherSessions } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, requestMeta, requireSession } from "@/lib/auth"

// Signs out every other device
export async function DELETE() {
  try {
    const session = await requireSession()
    return Response.json({ signedOut: await revokeOtherSessions(db(), session.user.id, session.sessionId, await requestMeta()) })
  } catch (err) {
    return authErrorResponse(err)
  }
}
