import { resetPassword } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, readJson, requestMeta, setSessionCookie } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const b = await readJson(request)
    const { user, session } = await resetPassword(db(), { email: b.email, code: b.code, password: b.password }, await requestMeta())
    await setSessionCookie(session)
    return Response.json({ user })
  } catch (err) {
    return authErrorResponse(err)
  }
}
