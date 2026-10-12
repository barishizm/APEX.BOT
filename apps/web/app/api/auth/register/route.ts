import { register } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, readJson, requestMeta, setSessionCookie } from "@/lib/auth"
import { sendVerificationCode } from "@/lib/mail"

export async function POST(request: Request) {
  try {
    const b = await readJson(request)
    const { user, session, code } = await register(
      db(),
      {
        email: b.email,
        username: b.username,
        password: b.password,
        accountType: b.accountType,
        company: b.company,
        companySize: b.companySize,
        acceptTerms: b.acceptTerms,
        allowTraining: b.allowTraining,
      },
      await requestMeta(),
    )
    await setSessionCookie(session)
    await sendVerificationCode(user.email, code)
    return Response.json({ user }, { status: 201 })
  } catch (err) {
    return authErrorResponse(err)
  }
}
