import { startHandoffVerification } from "@apex/db"
import { db } from "@/lib/db"
import { readJson } from "@/lib/auth"
import { botErrorResponse, requireApiUser } from "@/lib/bot"
import { sendHandoffConfirmationCode } from "@/lib/mail"

// Body: { email }. Emails a confirmation code to that address; the bot mails no hand-off there until it's confirmed.
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const { email } = await readJson(request)
    const sent = await startHandoffVerification(db(), user.id, email)
    await sendHandoffConfirmationCode(sent.email, sent.code)
    return Response.json({ email: sent.email })
  } catch (err) {
    return botErrorResponse(err)
  }
}
