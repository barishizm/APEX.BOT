import { requestLocale } from "@/lib/i18n/server"
import { randomBytes } from "node:crypto"
import { AuthError, invitationAllowsSignup, register } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, readJson, requestMeta, setSessionCookie } from "@/lib/auth"
import { requireHuman } from "@/lib/turnstile"
import { SIGNUPS_OPEN } from "@/lib/signups"
import { sendAccountExistsNotice, sendVerificationCode } from "@/lib/mail"

export async function POST(request: Request) {
  try {
    const b = await readJson(request)
    // while sign-ups are closed, an invitation to a workspace still lets the invited address in
    if (!SIGNUPS_OPEN && !(await invitationAllowsSignup(db(), b.inviteToken, b.email))) {
      throw new AuthError("signups_closed", "Sign-ups are closed for now. Join the waitlist")
    }
    const meta = await requestMeta()
    await requireHuman(b.turnstileToken, meta.ip)
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
