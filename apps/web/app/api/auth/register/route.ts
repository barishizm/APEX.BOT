import { requestLocale } from "@/lib/i18n/server"
import { randomBytes } from "node:crypto"
import { AuthError, register } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, readJson, requestMeta, setSessionCookie } from "@/lib/auth"
import { requireHuman } from "@/lib/turnstile"
import { sendAccountExistsNotice, sendVerificationCode } from "@/lib/mail"
import { assertMayCreateAccount } from "@/lib/signups"

export async function POST(request: Request) {
  try {
    const b = await readJson(request)
    const meta = await requestMeta()
    await requireHuman(b.turnstileToken, meta.ip)
    // while sign-ups aren't open, only invited addresses get in (a workspace invitation, or the waitlist when invite-only)
    await assertMayCreateAccount({ email: b.email, inviteToken: b.inviteToken })
    const input = {
      email: b.email,
      username: b.username,
      password: b.password,
      accountType: b.accountType,
      company: b.company,
      companySize: b.companySize,
      acceptTerms: b.acceptTerms,
      allowTraining: b.allowTraining,
    }
    try {
      const { user, session, code } = await register(db(), input, meta)
      await setSessionCookie(session)
      await sendVerificationCode(user.email, code, await requestLocale())
      return Response.json({ user }, { status: 201 })
    } catch (err) {
      if (!(err instanceof AuthError && err.code === "email_taken")) throw err
      // Answer exactly like a success so the form can't be used to probe which emails have accounts.
      // The owner is told by email; the cookie is a decoy that no session matches.
      const email = String(b.email ?? "").trim().toLowerCase()
      await sendAccountExistsNotice(email, await requestLocale())
      await setSessionCookie({ token: randomBytes(32).toString("base64url"), expiresAt: new Date(Date.now() + 86_400_000), persistent: true })
      const username = String(b.username ?? "")
      return Response.json(
        {
          user: {
            id: crypto.randomUUID(),
            email,
            username,
            accountType: b.accountType === "business" ? "business" : "personal",
            emailVerified: false,
            createdAt: new Date().toISOString(),
          },
        },
        { status: 201 },
      )
    }
  } catch (err) {
    return authErrorResponse(err)
  }
}
