import { cookies } from "next/headers"
import { logout } from "@apex/db"
import { db } from "@/lib/db"
import { SESSION_COOKIE, authErrorResponse, requestMeta, sessionToken } from "@/lib/auth"

export async function POST() {
  try {
    await logout(db(), await sessionToken(), await requestMeta())
    ;(await cookies()).delete(SESSION_COOKIE)
    return new Response(null, { status: 204 })
  } catch (err) {
    return authErrorResponse(err)
  }
}
