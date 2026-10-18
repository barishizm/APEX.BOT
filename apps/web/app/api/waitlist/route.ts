import { joinWaitlist } from "@apex/db"
import { db } from "@/lib/db"
import { authErrorResponse, readJson, requestMeta } from "@/lib/auth"
import { requestLocale } from "@/lib/i18n/server"
import { requireHuman } from "@/lib/turnstile"

// The auth modal's waitlist form, while sign-ups aren't open to everyone (lib/signups.ts)
export async function POST(request: Request) {
  try {
    const b = await readJson(request)
    const meta = await requestMeta()
    await requireHuman(b.turnstileToken, meta.ip)
    await joinWaitlist(db(), b.email, await requestLocale())
    return Response.json({ ok: true }, { status: 201 })
  } catch (err) {
    return authErrorResponse(err)
  }
}
