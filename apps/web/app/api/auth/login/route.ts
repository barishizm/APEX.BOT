import { login } from "@apex/db"
import { db } from "@/lib/db"
import { requireHuman } from "@/lib/turnstile"
import { authErrorResponse, readJson, requestMeta, setSessionCookie } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { email, password, remember, turnstileToken } = await readJson(request)
    const meta = await requestMeta()
    await requireHuman(turnstileToken, meta.ip)
    const { user, session } = await login(db(), { email, password, remember }, meta)
    await setSessionCookie(session)
    return Response.json({ user })
  } catch (err) {
    return authErrorResponse(err)
  }
}
