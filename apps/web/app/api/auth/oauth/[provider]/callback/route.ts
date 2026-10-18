import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { AuthError, oauthLogin } from "@apex/db"
import { db } from "@/lib/db"
import { inviteTokenFrom, requestMeta, safeNext, setChallengeCookie, setSessionCookie } from "@/lib/auth"
import { mayCreateAccount } from "@/lib/signups"
import { OAUTH_COOKIE, credentials, fetchProfile, isProvider, siteOrigin } from "@/lib/oauth"

const to = (path: string) => NextResponse.redirect(`${siteOrigin()}${path}`)
const fail = (error: string) => to(`/login?error=${error}`)

const sameString = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  if (!isProvider(provider)) return new Response("Not found", { status: 404 })
  const jar = await cookies()
  const saved = jar.get(OAUTH_COOKIE)?.value
  jar.delete(OAUTH_COOKIE) // single use

  const url = new URL(request.url)
  if (url.searchParams.get("error")) return fail("oauth_denied")
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  let flow: { provider: string; state: string; verifier: string; type: string; next?: string | null } | null = null
  try {
    flow = saved ? JSON.parse(saved) : null
  } catch {}
  // state must match the cookie set when this browser started the flow (CSRF / login-fixation guard)
  if (!code || !state || !flow || flow.provider !== provider || !sameString(flow.state, state)) return fail("oauth_failed")
  const creds = credentials(provider)
  if (!creds) return fail("oauth_not_configured")

  try {
    const profile = await fetchProfile(provider, code, flow.verifier, creds)
    const next = safeNext(flow.next)
    // decided up front; it only matters when no account has this email yet (existing ones always log in)
    const allowSignup = await mayCreateAccount({ email: profile.email, inviteToken: inviteTokenFrom(next) })
    const result = await oauthLogin(
      db(),
      { ...profile, accountType: flow.type === "business" ? "business" : "personal" },
      await requestMeta(),
      { allowSignup },
    )
    if (result.challenge) {
      await setChallengeCookie(result.challenge)
      return to(`/two-factor${next ? `?next=${encodeURIComponent(next)}` : ""}`)
    }
    await setSessionCookie(result.session)
    return to(next ?? (result.isNew ? "/onboarding" : "/dashboard?welcome=1"))
  } catch (err) {
    if (err instanceof AuthError && err.code === "signups_closed") return fail("oauth_signups_closed")
    if (err instanceof AuthError && err.code === "invalid_input") return fail("oauth_email_unverified")
    if (err instanceof AuthError && err.code === "account_suspended") return fail("account_suspended")
    console.error("[oauth]", provider, err instanceof Error ? err.message : err)
    return fail("oauth_failed")
  }
}
