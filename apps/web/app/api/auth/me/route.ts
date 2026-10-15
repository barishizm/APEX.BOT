import { authErrorResponse, currentSession, errorJson } from "@/lib/auth"

export async function GET() {
  try {
    const session = await currentSession()
    if (!session) return errorJson("unauthorized", "Not logged in", { status: 401 })
    return Response.json({ user: session.user })
  } catch (err) {
    return authErrorResponse(err)
  }
}
