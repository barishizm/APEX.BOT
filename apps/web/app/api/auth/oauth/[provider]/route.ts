import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { OAUTH_COOKIE, authorizeUrl, credentials, isProvider, newState, siteOrigin } from "@/lib/oauth"

const back = (error: string) => NextResponse.redirect(`${siteOrigin()}/?login=1&error=${error}`)

// Starts the flow: remember a one-time state (+ PKCE verifier) and send the browser to the provider
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  if (!isProvider(provider)) return new Response("Not found", { status: 404 })
  const creds = credentials(provider)
  if (!creds) return back("oauth_not_configured")

  const { state, verifier } = newState()
  const type = new URL(request.url).searchParams.get("type") === "business" ? "business" : "personal"
  ;(await cookies()).set(OAUTH_COOKIE, JSON.stringify({ provider, state, verifier, type }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/oauth",
    maxAge: 600,
  })
  return NextResponse.redirect(authorizeUrl(provider, creds.id, state, verifier))
}
