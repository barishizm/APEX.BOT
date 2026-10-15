import { requestLocale } from "@/lib/i18n/server"
import { AuthError, issueEmailCode } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, currentSession, readJson, requestMeta } from "@/lib/auth"
import { sendVerificationCode } from "@/lib/mail"

// Body: {} to resend, or { email } to send to a corrected address
export async function POST(request: Request) {
  try {
    const session = await currentSession()
    if (!session) throw new AuthError("unauthorized", "Your session has ended. Log in again")
    const { email } = await readJson(request)
    const sent = await issueEmailCode(db(), session.user.id, { email }, await requestMeta())
    await sendVerificationCode(sent.email, sent.code, await requestLocale())
    return Response.json({ email: sent.email })
  } catch (err) {
    return authErrorResponse(err)
  }
}
