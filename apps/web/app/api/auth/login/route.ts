import { login } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, readJson, requestMeta, setSessionCookie } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { email, password, remember } = await readJson(request)
    const { user, session } = await login(db(), { email, password, remember }, await requestMeta())
    await setSessionCookie(session)
    return Response.json({ user })
  } catch (err) {
    return authErrorResponse(err)
  }
}
