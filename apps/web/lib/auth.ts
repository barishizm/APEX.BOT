import { cache } from "react"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { isIP } from "node:net"
import { AuthError, getSession, type NewSession, type RequestMeta } from "@apex/db"
import { db, schemaMissing } from "@/lib/db"
import { translateMessage } from "@/lib/i18n/messages"
import { requestLocale } from "@/lib/i18n/server"

export const SESSION_COOKIE = "apex_session"
// Mirrors lib/signed-in.ts, which is client-only
export const SIGNED_IN_COOKIE = "apex_signed_in"
// Between a correct password (or Google/GitHub) and the authenticator code; see /two-factor
export const CHALLENGE_COOKIE = "apex_2fa"

export async function setSessionCookie(session: NewSession) {
  const jar = await cookies()
  const options = {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    // without "keep me signed in" it is a browser-session cookie
    ...(session.persistent ? { expires: session.expiresAt } : {}),
  }
  jar.set(SESSION_COOKIE, session.token, { ...options, httpOnly: true })
  // readable hint for the static marketing pages; see lib/signed-in.ts
  jar.set(SIGNED_IN_COOKIE, "1", options)
}

export async function setChallengeCookie(challenge: NewSession) {
  ;(await cookies()).set(CHALLENGE_COOKIE, challenge.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: challenge.expiresAt,
  })
}

export async function challengeToken() {
  return (await cookies()).get(CHALLENGE_COOKIE)?.value
}

export async function clearChallengeCookie() {
  ;(await cookies()).delete(CHALLENGE_COOKIE)
}

const INVITE_PATH = /^\/invite\/([A-Za-z0-9_-]{20,100})$/

/** Where to go after signing in: only an invitation link, so `?next=` can't send anyone off-site. */
export function safeNext(raw: unknown): string | null {
  return typeof raw === "string" && INVITE_PATH.test(raw) ? raw : null
}

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value
}

// One lookup per request, shared by every server component that asks
export const currentSession = cache(async () => {
  const token = await sessionToken()
  return token ? getSession(db(), token) : null
})

// Marketing pages only switch "Log in" for "Dashboard"; a database hiccup must not break them
export async function isSignedIn() {
  if (!(await sessionToken())) return false
  try {
    return !!(await currentSession())
  } catch {
    return false
  }
}

// For pages behind log-in; unverified accounts finish verification first
export async function requireVerifiedUser() {
  // a database behind the code would fail on every dashboard query; say so instead
  if ((await schemaMissing()).length) redirect("/database-update")
  const session = await currentSession()
  if (!session) return redirectLoggedOut()
  if (!session.user.emailVerified) redirect("/verify-email")
  return session.user
}

// To log-in, clearing a leftover session cookie on the way (see app/api/auth/expired)
export async function redirectLoggedOut(): Promise<never> {
  redirect((await sessionToken()) ? "/api/auth/expired" : "/login")
}

// API routes: the signed-in session, or a 401 the client can act on
export async function requireSession() {
  const session = await currentSession()
  if (!session) throw new AuthError("unauthorized", "Your session has ended. Log in again")
  return session
}

export async function clearSessionCookie() {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  jar.delete(SIGNED_IN_COOKIE)
}

export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers()
  // Only the rightmost X-Forwarded-For entries (added by our proxies) are trustworthy; the rest
  // is client-supplied. TRUST_PROXY is the number of proxy hops in front of the app.
  const trusted = Number(process.env.TRUST_PROXY === "true" ? 1 : process.env.TRUST_PROXY ?? 0)
  const hops = (h.get("x-forwarded-for") ?? "").split(",").map((v) => v.trim()).filter(Boolean)
  const forwarded = Number.isInteger(trusted) && trusted > 0 ? hops[hops.length - trusted] : undefined
  return { ip: forwarded && isIP(forwarded) ? forwarded : null, userAgent: h.get("user-agent") }
}

// JSON only: a cross-site <form> can't send application/json without a CORS preflight
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new AuthError("invalid_input", "Expected a JSON body")
  }
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AuthError("invalid_input", "Expected a JSON object")
  return body as Record<string, unknown>
}

const STATUS: Record<AuthError["code"], number> = {
  invalid_input: 400,
  email_taken: 409,
  username_taken: 409,
  invalid_credentials: 401,
  unauthorized: 401,
  too_many_attempts: 429,
  invalid_code: 400,
  code_expired: 400,
  already_verified: 409,
  signups_closed: 403,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
}

// A JSON error in the requester's language; `error` stays a stable code for the client
export async function errorJson(code: string, message: string, init: ResponseInit & { extra?: Record<string, unknown> } = {}) {
  const { extra, ...rest } = init
  return Response.json({ error: code, message: translateMessage(message, await requestLocale()), ...extra }, rest)
}

export async function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return errorJson(
      err.code,
      err.message,
      { status: STATUS[err.code], headers: err.retryAfterSeconds ? { "retry-after": String(err.retryAfterSeconds) } : {} },
    )
  }
  console.error("[auth]", err)
  return errorJson("server_error", "Something went wrong. Try again", { status: 500 })
}
