import { AuthError, verifyEmail } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, currentSession, readJson, requestMeta } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const session = await currentSession()
    if (!session) throw new AuthError("unauthorized", "Your session has ended. Log in again")
    const { code } = await readJson(request)
    const user = await verifyEmail(db(), session.user.id, code, await requestMeta())
    return Response.json({ user })
  } catch (err) {
    return authErrorResponse(err)
  }
}
