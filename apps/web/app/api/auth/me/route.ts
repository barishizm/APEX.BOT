import { authErrorResponse, currentSession } from "@/lib/auth"

export async function GET() {
  try {
    const session = await currentSession()
    if (!session) return Response.json({ error: "unauthorized", message: "Not logged in" }, { status: 401 })
    return Response.json({ user: session.user })
  } catch (err) {
    return authErrorResponse(err)
  }
}
