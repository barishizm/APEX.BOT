import { cache } from "react"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { isIP } from "node:net"
import { AuthError, getSession, type NewSession, type RequestMeta } from "@apex/db"
import { db, schemaMissing } from "@/lib/db"

export const SESSION_COOKIE = "apex_session"

export async function setSessionCookie(session: NewSession) {
  ;(await cookies()).set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // without "keep me signed in" it is a browser-session cookie
    ...(session.persistent ? { expires: session.expiresAt } : {}),
  })
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
  if (!session) redirect("/?login=1")
  if (!session.user.emailVerified) redirect("/verify-email")
  return session.user
}

// API routes: the signed-in session, or a 401 the client can act on
export async function requireSession() {
  const session = await currentSession()
  if (!session) throw new AuthError("unauthorized", "Your session has ended. Log in again")
  return session
}

export async function clearSessionCookie() {
  ;(await cookies()).delete(SESSION_COOKIE)
}

export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers()
  // Client-supplied X-Forwarded-For is only trustworthy behind our own proxy
  const forwarded = process.env.TRUST_PROXY === "1" ? h.get("x-forwarded-for")?.split(",")[0]?.trim() : undefined
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
}

export function authErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return Response.json(
      { error: err.code, message: err.message },
      { status: STATUS[err.code], headers: err.retryAfterSeconds ? { "retry-after": String(err.retryAfterSeconds) } : {} },
    )
  }
  console.error("[auth]", err)
  return Response.json({ error: "server_error", message: "Something went wrong. Try again" }, { status: 500 })
}
