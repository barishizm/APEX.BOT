import { verifyEmail } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, readJson, requestMeta, requireSession } from "@/lib/auth"
import { requestLocale } from "@/lib/i18n/server"
import { sendEmailChangedNotice } from "@/lib/mail"

// Body: { code } from the email sent to the new address
export async function POST(request: Request) {
  try {
    const session = await requireSession()
    const { code } = await readJson(request)
    const previous = session.user.email
    const user = await verifyEmail(db(), session.user.id, code, await requestMeta())
    // the old inbox hears about it, so a takeover doesn't go unnoticed
    if (user.email !== previous) await sendEmailChangedNotice(previous, user.email, await requestLocale())
    return Response.json({ user })
  } catch (err) {
    return authErrorResponse(err)
  }
}
