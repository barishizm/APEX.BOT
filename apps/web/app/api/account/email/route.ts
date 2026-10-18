import { requestEmailChange } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, readJson, requestMeta, requireSession } from "@/lib/auth"
import { requestLocale } from "@/lib/i18n/server"
import { sendVerificationCode } from "@/lib/mail"
import { assertMayTakeAddress } from "@/lib/signups"

// Body: { email, password? }. Mails a code to the new address; /api/account/email/confirm finishes.
export async function POST(request: Request) {
  try {
    const session = await requireSession()
    const b = await readJson(request)
    await assertMayTakeAddress(session.user, b.email)
    const sent = await requestEmailChange(db(), session.user.id, { email: b.email, password: b.password }, await requestMeta())
    await sendVerificationCode(sent.email, sent.code, await requestLocale())
    return Response.json({ email: sent.email })
  } catch (err) {
    return authErrorResponse(err)
  }
}
