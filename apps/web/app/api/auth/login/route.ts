import { login } from "@apex/db"
import { db } from "@/lib/db"
import { requireHuman } from "@/lib/turnstile"
import { authErrorResponse, readJson, requestMeta, setChallengeCookie, setSessionCookie } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { email, password, remember, turnstileToken } = await readJson(request)
    const meta = await requestMeta()
    await requireHuman(turnstileToken, meta.ip)
    const result = await login(db(), { email, password, remember }, meta)
    // two-step sign-in: the session comes from /api/auth/two-factor once the code is right
    if (result.challenge) {
      await setChallengeCookie(result.challenge)
      return Response.json({ twoFactor: true })
    }
    await setSessionCookie(result.session)
    return Response.json({ user: result.user })
  } catch (err) {
    return authErrorResponse(err)
  }
}
