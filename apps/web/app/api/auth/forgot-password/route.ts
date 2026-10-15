import { requestLocale } from "@/lib/i18n/server"
import { AuthError, requestPasswordReset } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, readJson, requestMeta } from "@/lib/auth"
import { sendPasswordResetCode } from "@/lib/mail"

// Always the same answer whether or not the account exists, so emails can't be probed
export async function POST(request: Request) {
  try {
    const { email } = await readJson(request)
    try {
      const sent = await requestPasswordReset(db(), email, await requestMeta())
      if (sent) await sendPasswordResetCode(sent.email, sent.code, await requestLocale())
    } catch (err) {
      // only existing accounts are rate limited, so saying so would reveal the account
      if (!(err instanceof AuthError && err.code === "too_many_attempts")) throw err
    }
    return Response.json({ ok: true })
  } catch (err) {
    return authErrorResponse(err)
  }
}
