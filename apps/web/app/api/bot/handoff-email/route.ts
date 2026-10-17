import { requestLocale } from "@/lib/i18n/server"
import { startHandoffVerification } from "@apex/db"
import { db } from "@/lib/db"
import { readJson } from "@/lib/auth"
import { botErrorResponse, requireApiUser } from "@/lib/bot"
import { sendHandoffConfirmationCode } from "@/lib/mail"
import { siteScope } from "@/lib/current-site"

// Body: { email, botId }. Emails a confirmation code to that address; the bot mails no hand-off there until it's confirmed.
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const { email, botId } = await readJson(request)
    const sent = await startHandoffVerification(db(), await siteScope(user.id, botId), email)
    await sendHandoffConfirmationCode(sent.email, sent.code, await requestLocale())
    return Response.json({ email: sent.email })
  } catch (err) {
    return botErrorResponse(err)
  }
}
