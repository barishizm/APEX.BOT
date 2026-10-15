import { logout } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, clearSessionCookie, requestMeta, sessionToken } from "@/lib/auth"

export async function POST() {
  try {
    await logout(db(), await sessionToken(), await requestMeta())
    await clearSessionCookie()
    return new Response(null, { status: 204 })
  } catch (err) {
    return authErrorResponse(err)
  }
}
