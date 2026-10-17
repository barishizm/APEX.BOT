import { resetPassword } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, readJson, requestMeta, setChallengeCookie, setSessionCookie } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const b = await readJson(request)
    const result = await resetPassword(db(), { email: b.email, code: b.code, password: b.password }, await requestMeta())
    // with two-step sign-in on, the authenticator code still comes first
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
