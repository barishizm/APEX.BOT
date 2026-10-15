import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { AuthError, oauthLogin } from "@apex/db"
import { db } from "@/lib/db"
import { requestMeta, setSessionCookie } from "@/lib/auth"
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
  let flow: { provider: string; state: string; verifier: string; type: string } | null = null
  try {
    flow = saved ? JSON.parse(saved) : null
  } catch {}
  // state must match the cookie set when this browser started the flow (CSRF / login-fixation guard)
  if (!code || !state || !flow || flow.provider !== provider || !sameString(flow.state, state)) return fail("oauth_failed")
  const creds = credentials(provider)
  if (!creds) return fail("oauth_not_configured")

  try {
    const profile = await fetchProfile(provider, code, flow.verifier, creds)
    const { session, isNew } = await oauthLogin(
      db(),
      { ...profile, accountType: flow.type === "business" ? "business" : "personal" },
      await requestMeta(),
    )
    await setSessionCookie(session)
    return to(isNew ? "/onboarding" : "/dashboard?welcome=1")
  } catch (err) {
    if (err instanceof AuthError && err.code === "invalid_input") return fail("oauth_email_unverified")
    console.error("[oauth]", provider, err instanceof Error ? err.message : err)
    return fail("oauth_failed")
  }
}
