import { changePassword } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, readJson, requestMeta, requireSession } from "@/lib/auth"

// Body: { current?, next }. Other devices are signed out.
export async function POST(request: Request) {
  try {
    const session = await requireSession()
    const b = await readJson(request)
    return Response.json(await changePassword(db(), session.user.id, { current: b.current, next: b.next }, session.sessionId, await requestMeta()))
  } catch (err) {
    return authErrorResponse(err)
  }
}
