import { cache } from "react"
import { cookies, headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { isIP } from "node:net"
import {
  AuthError,
  getImpersonatedSession,
  getSession,
  hasRecentStepUp,
  hitRateLimit,
  type NewSession,
  type PlatformRole,
  type RateLimit,
  type RequestMeta,
  type Session,
} from "@apex/db"
import { db, schemaMissing } from "@/lib/db"
import { IMPERSONATION_COOKIE } from "@/lib/impersonation"
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

/** The invitation token in a `next` path, if it is one. */
export function inviteTokenFrom(next: unknown): string | null {
  return typeof next === "string" ? (INVITE_PATH.exec(next)?.[1] ?? null) : null
}

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value
}

export async function impersonationToken() {
  return (await cookies()).get(IMPERSONATION_COOKIE)?.value
}

/** "View as user": its own cookie, next to the staff member's session cookie, which stays as it is. */
export async function setImpersonationCookie(token: string, expiresAt: Date) {
  ;(await cookies()).set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // strict: a link from another site never opens the app in someone else's name
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  })
}

export async function clearImpersonationCookie() {
  ;(await cookies()).delete(IMPERSONATION_COOKIE)
}

// One lookup per request, shared by every server component that asks. While a superadmin views the
// app as a user (and that view is still valid), this is the user's session, marked `impersonation`;
// a view that ended or ran out falls back to the staff member's own session.
export const currentSession = cache(async () => {
  const token = await sessionToken()
  if (!token) return null
  const viewAs = await impersonationToken()
  if (viewAs) {
    const viewed = await getImpersonatedSession(db(), viewAs, token)
    if (viewed) return viewed
  }
  return getSession(db(), token)
})

/** A superadmin is viewing the app as this user: show visitors' details masked. */
export async function isImpersonating() {
  return !!(await currentSession())?.impersonation
}

/** Whether this browser still holds an impersonation cookie (valid or not); writes are refused while it does. */
export async function hasImpersonationCookie() {
  return !!(await impersonationToken())
}

// Marketing pages only switch "Log in" for "Dashboard"; a database hiccup must not break them
export async function isSignedIn() {
  if (!(await sessionToken())) return false
  try {
    return !!(await currentSession())
  } catch {
    return false
  }
}

// For pages behind log-in; unverified accounts finish verification first. `outdatedSchema` lets a
// page that copes with a database behind the code (/admin/system, which reports it) render anyway.
export async function requireVerifiedUser({ outdatedSchema = false }: { outdatedSchema?: boolean } = {}) {
  // a database behind the code would fail on every dashboard query; say so instead
  if (!outdatedSchema && (await schemaMissing()).length) redirect("/database-update")
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

// --- Platform admin (/admin and /api/admin) ---

const ROLE_RANK: Record<PlatformRole, number> = { support: 1, superadmin: 2 }
const hasRole = (actual: PlatformRole | null, min: PlatformRole) => actual !== null && ROLE_RANK[actual] >= ROLE_RANK[min]

export type AdminSession = Session & { user: Session["user"] & { platformRole: PlatformRole } }

// Settings shows a "turn on two-step sign-in" warning for this notice
export const ADMIN_TWO_FACTOR_NOTICE = "admin-2fa"

/**
 * For /admin pages. Staff only, with a verified email and two-step sign-in on; everyone else
 * gets a plain 404 so the area doesn't advertise itself. Staff without two-step sign-in are sent
 * to settings to turn it on.
 */
export async function requirePlatformAdmin(minRole: PlatformRole = "support", options: { outdatedSchema?: boolean } = {}): Promise<AdminSession> {
  await requireVerifiedUser(options)
  const session = (await currentSession())!
  const role = session.user.platformRole
  if (!role || session.impersonation) notFound()
  if (!session.user.twoFactor) redirect(`/dashboard/settings?notice=${ADMIN_TWO_FACTOR_NOTICE}`)
  // staff, just not senior enough for this page
  if (!hasRole(role, minRole)) redirect("/admin")
  return session as AdminSession
}

// Per staff member, and per address before the session is even looked up; writes count twice
const ADMIN_LIMITS = {
  ip: { max: 120, windowSeconds: 60 },
  user: { max: 60, windowSeconds: 60 },
  write: { max: 10, windowSeconds: 60 },
} satisfies Record<string, RateLimit>

async function adminRateLimit(key: string, limit: RateLimit) {
  const over = await hitRateLimit(db(), `admin:${key}`, limit)
  if (over) throw new AuthError("too_many_attempts", "Too many requests. Try again later", over.retryAfterSeconds)
}

/**
 * For /api/admin routes: the staff session, or an AuthError the route turns into 401/403/429.
 * Same rules as requirePlatformAdmin, plus a strict rate limit of its own.
 */
// what browsers send for a request from our own pages or a typed address/bookmark; not sent by other clients
const OWN_FETCH_SITES = new Set(["same-origin", "none"])

export async function requireAdminSession(minRole: PlatformRole = "support", options: { write?: boolean } = {}): Promise<AdminSession> {
  // a link on another site opens a GET with the (SameSite=Lax) session cookie: refuse it before it can
  // start an export or a transcript view in the staff member's name and use up their limits
  const site = (await headers()).get("sec-fetch-site")
  if (site && !OWN_FETCH_SITES.has(site)) throw new AuthError("forbidden", "Open this from the admin area")
  const { ip } = await requestMeta()
  if (ip) await adminRateLimit(`ip:${ip}`, ADMIN_LIMITS.ip)
  const session = await requireSession()
  const { user } = session
  // staff can't be viewed as, so this only guards the admin API against a view that is open
  if (session.impersonation) throw new AuthError("forbidden", "You don't have access to this")
  if (!user.emailVerified || !hasRole(user.platformRole, minRole)) throw new AuthError("forbidden", "You don't have access to this")
  if (!user.twoFactor) throw new AuthError("two_factor_required", "Turn on two-step sign-in to use the admin area")
  await adminRateLimit(`user:${user.id}`, ADMIN_LIMITS.user)
  if (options.write) await adminRateLimit(`write:${user.id}`, ADMIN_LIMITS.write)
  return session as AdminSession
}

/** Destructive admin actions need an authenticator code confirmed in the last 10 minutes (POST /api/admin/step-up). */
export function requireStepUp(session: Session) {
  if (!hasRecentStepUp(session)) throw new AuthError("step_up_required", "Confirm this action with a code from your authenticator app")
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
  // Vercel's edge sets this header itself (a client's copy is replaced); elsewhere it would be client-supplied
  const country = process.env.VERCEL ? h.get("x-vercel-ip-country") : null
  return { ip: forwarded && isIP(forwarded) ? forwarded : null, userAgent: h.get("user-agent"), country }
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
  account_suspended: 403,
  two_factor_required: 403,
  step_up_required: 403,
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
