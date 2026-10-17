import { completeTwoFactorLogin } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, challengeToken, clearChallengeCookie, readJson, requestMeta, setSessionCookie } from "@/lib/auth"

// Body: { code }, an authenticator code or a recovery code. Finishes the sign-in /api/auth/login started.
export async function POST(request: Request) {
  try {
    const { code } = await readJson(request)
    const done = await completeTwoFactorLogin(db(), await challengeToken(), code, await requestMeta())
    await clearChallengeCookie()
    await setSessionCookie(done.session)
    return Response.json({ user: done.user, usedRecoveryCode: done.usedRecoveryCode, recoveryCodesLeft: done.recoveryCodesLeft })
  } catch (err) {
    return authErrorResponse(err)
  }
}
