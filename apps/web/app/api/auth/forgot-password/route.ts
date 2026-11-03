import { after } from "next/server"
import { requestLocale } from "@/lib/i18n/server"
import { AuthError, requestPasswordReset } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, readJson, requestMeta } from "@/lib/auth"
import { requireHuman } from "@/lib/turnstile"
import { sendPasswordResetCode } from "@/lib/mail"

// Always the same answer whether or not the account exists, so emails can't be probed
export async function POST(request: Request) {
  try {
    const { email, turnstileToken } = await readJson(request)
    const meta = await requestMeta()
    await requireHuman(turnstileToken, meta.ip)
    try {
      const sent = await requestPasswordReset(db(), email, meta)
      // mailed after the response, so how long it takes doesn't tell an existing account from an unknown one
      if (sent) {
        const locale = await requestLocale()
        after(() => sendPasswordResetCode(sent.email, sent.code, locale))
      }
    } catch (err) {
      // only existing accounts are rate limited, so saying so would reveal the account
      if (!(err instanceof AuthError && err.code === "too_many_attempts")) throw err
    }
    return Response.json({ ok: true })
  } catch (err) {
    return authErrorResponse(err)
  }
}
