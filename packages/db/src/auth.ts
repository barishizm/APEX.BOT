import { isIP } from "node:net"
import type { Db, Queryable } from "./db.ts"
import {
  burnPasswordCheck,
  hashPassword,
  matchTotp,
  newRecoveryCode,
  newSessionToken,
  newTotpSecret,
  newVerificationCode,
  normalizeRecoveryCode,
  openTotpSecret,
  sealTotpSecret,
  sha256,
  verifyPassword,
} from "./crypto.ts"

const DAY_MS = 24 * 60 * 60 * 1000
export const SESSION_TTL_MS = { persistent: 30 * DAY_MS, browser: DAY_MS }
export const CODE_TTL_MS = 15 * 60 * 1000
export const CODE_MAX_ATTEMPTS = 5
export const CODE_RESEND_SECONDS = 30
// Time to type the authenticator code after the password (or Google/GitHub) check passed
export const CHALLENGE_TTL_MS = 10 * 60 * 1000
export const RECOVERY_CODE_COUNT = 10
// Wrong codes allowed per account across ALL codes in the window. The per-code
// limit alone is reset by every resend, so this caps total guessing.
export const CODE_FAIL_LIMIT = { max: 10, windowMinutes: 60 }
// Failed log-ins counted over the last 15 minutes. The lock is per email AND address, so a stranger
// can't lock the owner out from elsewhere; `email` is a high backstop against spread-out guessing.
const LOGIN_FAIL_LIMIT = { emailAndIp: 10, email: 100, ip: 50 }
// Outbound verification mail caps, so register/resend can't be used to mail arbitrary addresses
const SIGNUP_LIMIT = { perIp: 5, windowMinutes: 60 }
const CODE_SEND_LIMIT = { perUser: 5, perIp: 15, windowMinutes: 60 }
export const TERMS_VERSION = "2026-10"
export const COMPANY_SIZES = ["1-50", "51-200", "201-1000", "1000+"] as const

export type AccountType = "personal" | "business"

export type AuthErrorCode =
  | "invalid_input"
  | "email_taken"
  | "username_taken"
  | "invalid_credentials"
  | "too_many_attempts"
  | "invalid_code"
  | "code_expired"
  | "already_verified"
  | "unauthorized"
  | "signups_closed"
  | "forbidden"
  | "not_found"
  | "conflict"

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message)
  }
}

export interface User {
  id: string
  email: string
  username: string
  // what to call them; null when unknown, so callers fall back to the username
  displayName: string | null
  accountType: AccountType
  emailVerified: boolean
  /** Signing in also needs a code from an authenticator app. */
  twoFactor: boolean
  createdAt: Date
}

export interface NewSession {
  token: string
  expiresAt: Date
  persistent: boolean
}

export interface RequestMeta {
  ip?: string | null
  userAgent?: string | null
}

interface UserRow {
  id: string
  email: string
  username: string
  display_name: string | null
  account_type: AccountType
  email_verified_at: Date | null
  two_factor: boolean
  created_at: Date
}

const USER_COLUMNS =
  "u.id, u.email, u.username, u.display_name, u.account_type, u.email_verified_at, u.totp_enabled_at is not null as two_factor, u.created_at"

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  username: r.username,
  displayName: r.display_name,
  accountType: r.account_type,
  emailVerified: r.email_verified_at !== null,
  twoFactor: r.two_factor,
  createdAt: r.created_at,
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/

/** Trims and collapses whitespace, drops control characters; null when nothing is left. */
export function cleanDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const name = raw.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim()
  return name ? Array.from(name).slice(0, 64).join("").trim() : null
}

export function normalizeEmail(raw: unknown): string {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : ""
  if (!EMAIL_RE.test(email) || email.length > 254) throw new AuthError("invalid_input", "Enter a valid email address")
  return email
}

function checkPassword(raw: unknown): string {
  if (typeof raw !== "string" || raw.length < 8) throw new AuthError("invalid_input", "Password must be at least 8 characters")
  // scrypt cost grows with input; nobody types more than this
  if (raw.length > 200) throw new AuthError("invalid_input", "Password is too long")
  return raw
}

const cleanIp = (ip?: string | null) => (ip && isIP(ip) ? ip : null)
const cleanAgent = (ua?: string | null) => (ua ? ua.slice(0, 512) : null)

type AuthEvent =
  | "register"
  | "login"
  | "login_failed"
  | "logout"
  | "code_sent"
  | "email_verified"
  | "verify_failed"
  | "reset_requested"
  | "reset_failed"
  | "password_reset"
  | "password_changed"
  | "sessions_revoked"
  | "profile_updated"
  | "account_deleted"
  | "two_factor_enabled"
  | "two_factor_disabled"
  | "two_factor_failed"
  | "recovery_codes_created"

async function logEvent(q: Queryable, event: AuthEvent, meta: RequestMeta, userId: string | null, email: string | null) {
  await q.query(
    "insert into app.auth_events (event, user_id, email, ip, user_agent) values ($1, $2, $3, $4, $5)",
    [event, userId, email, cleanIp(meta.ip), cleanAgent(meta.userAgent)],
  )
}

// Throws once an account has had too many wrong codes recently, whichever code they were for.
async function assertCodeGuessesLeft(q: Queryable, userId: string, event: "verify_failed" | "reset_failed" | "two_factor_failed") {
  const { rows } = await q.query<{ n: number }>(
    `select count(*)::int as n from app.auth_events
      where user_id = $1 and event = $2 and created_at > now() - make_interval(mins => $3)`,
    [userId, event, CODE_FAIL_LIMIT.windowMinutes],
  )
  if (rows[0].n >= CODE_FAIL_LIMIT.max) {
    throw new AuthError("too_many_attempts", "Too many incorrect codes. Try again later", CODE_FAIL_LIMIT.windowMinutes * 60)
  }
}

// Throws when the caller (by IP, and by account for code mail) has triggered too many events recently.
async function assertEventBudget(
  q: Queryable,
  event: "register" | "code_sent",
  ip: string | null,
  userId: string | null,
  limit: { perIp: number; perUser?: number; windowMinutes: number },
) {
  const { rows } = await q.query<{ by_ip: number; by_user: number }>(
    `select count(*) filter (where $2::inet is not null and ip = $2::inet)::int as by_ip,
            count(*) filter (where $3::uuid is not null and user_id = $3::uuid)::int as by_user
       from app.auth_events
      where event = $1 and created_at > now() - make_interval(mins => $4)
        and (ip = $2::inet or user_id = $3::uuid)`,
    [event, ip, userId, limit.windowMinutes],
  )
  if (rows[0].by_ip >= limit.perIp || (limit.perUser !== undefined && rows[0].by_user >= limit.perUser)) {
    const secs = limit.windowMinutes * 60
    throw new AuthError("too_many_attempts", "Too many requests. Try again later", secs)
  }
}

function uniqueViolation(err: unknown): string | null {
  const e = err as { code?: string; constraint?: string }
  return e?.code === "23505" ? (e.constraint ?? "") : null
}

function rethrowTaken(err: unknown): never {
  const constraint = uniqueViolation(err)
  if (constraint === "users_email_key") throw new AuthError("email_taken", "An account with this email already exists")
  if (constraint === "users_username_lower_key") throw new AuthError("username_taken", "This username is taken")
  throw err
}

async function createSession(q: Queryable, userId: string, persistent: boolean, meta: RequestMeta): Promise<NewSession> {
  const token = newSessionToken()
  const expiresAt = new Date(Date.now() + (persistent ? SESSION_TTL_MS.persistent : SESSION_TTL_MS.browser))
  await q.query(
    "insert into app.sessions (user_id, token_hash, persistent, expires_at, ip, user_agent) values ($1, $2, $3, $4, $5, $6)",
    [userId, sha256(token), persistent, expiresAt, cleanIp(meta.ip), cleanAgent(meta.userAgent)],
  )
  return { token, expiresAt, persistent }
}

/**
 * What a correct password or Google/GitHub sign-in gets: a session, or for accounts with
 * two-step sign-in a challenge that an authenticator code must answer first.
 */
export type SignIn = { user: User; session: NewSession; challenge?: undefined } | { user: User; session?: undefined; challenge: NewSession }

async function signIn(tx: Queryable, user: User, persistent: boolean, meta: RequestMeta): Promise<SignIn> {
  if (user.twoFactor) {
    await tx.query("delete from app.login_challenges where user_id = $1 and expires_at <= now()", [user.id])
    const token = newSessionToken()
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS)
    await tx.query("insert into app.login_challenges (user_id, token_hash, persistent, expires_at) values ($1, $2, $3, $4)", [
      user.id,
      sha256(token),
      persistent,
      expiresAt,
    ])
    return { user, challenge: { token, expiresAt, persistent } }
  }
  const session = await createSession(tx, user.id, persistent, meta)
  await logEvent(tx, "login", meta, user.id, user.email)
  return { user, session }
}

type CodePurpose = "email_verify" | "password_reset"

// Replaces any live code for this user and purpose, so only the newest one works.
async function insertCode(q: Queryable, userId: string, email: string, purpose: CodePurpose = "email_verify"): Promise<string> {
  const code = newVerificationCode()
  await q.query(
    "update app.verification_codes set consumed_at = now() where user_id = $1 and purpose = $2 and consumed_at is null",
    [userId, purpose],
  )
  await q.query(
    "insert into app.verification_codes (user_id, purpose, email, code_hash, expires_at) values ($1, $2, $3, $4, $5)",
    [userId, purpose, email, sha256(code), new Date(Date.now() + CODE_TTL_MS)],
  )
  return code
}

export interface RegisterInput {
  email: unknown
  username: unknown
  password: unknown
  accountType: unknown
  company?: unknown
  companySize?: unknown
  acceptTerms: unknown
  allowTraining?: unknown
}

// Creates the account, its workspace and a signed-in session. The caller emails `code`.
export async function register(
  db: Db,
  input: RegisterInput,
  meta: RequestMeta = {},
): Promise<{ user: User; session: NewSession; code: string }> {
  const email = normalizeEmail(input.email)
  const username = typeof input.username === "string" ? input.username.trim() : ""
  if (!USERNAME_RE.test(username)) {
    throw new AuthError("invalid_input", "Username must be 3-32 letters, numbers, dots, dashes or underscores")
  }
  const password = checkPassword(input.password)
  const accountType = input.accountType
  if (accountType !== "personal" && accountType !== "business") throw new AuthError("invalid_input", "Choose an account type")
  if (input.acceptTerms !== true) throw new AuthError("invalid_input", "You must accept the Terms of Service")

  const company = accountType === "business" && typeof input.company === "string" ? input.company.trim().slice(0, 120) : ""
  const size = accountType === "business" ? input.companySize : undefined
  if (size !== undefined && size !== "" && !COMPANY_SIZES.includes(size as never)) {
    throw new AuthError("invalid_input", "Choose a company size")
  }

  await assertEventBudget(db, "register", cleanIp(meta.ip), null, SIGNUP_LIMIT)
  const passwordHash = await hashPassword(password)

  // Checked first so the answer for a taken username never depends on whether the email is taken too
  const nameTaken = await db.query("select 1 from app.users where lower(username) = lower($1)", [username])
  if (nameTaken.rows.length) {
    await logEvent(db, "register", meta, null, email)
    throw new AuthError("username_taken", "This username is taken")
  }

  return db
    .transaction(async (tx) => {
      const { rows } = await tx.query<UserRow>(
        `insert into app.users as u (email, username, password_hash, account_type, terms_accepted_at, terms_version, allow_training)
         values ($1, $2, $3, $4, now(), $5, $6) returning ${USER_COLUMNS}`,
        [email, username, passwordHash, accountType, TERMS_VERSION, input.allowTraining === true],
      )
      const user = toUser(rows[0])
      const org = await tx.query<{ id: string }>(
        "insert into app.organizations (name, size) values ($1, $2) returning id",
        [company || username, size || null],
      )
      await tx.query(
        "insert into app.organization_members (organization_id, user_id, role) values ($1, $2, 'owner')",
        [org.rows[0].id, user.id],
      )
      const code = await insertCode(tx, user.id, email)
      const session = await createSession(tx, user.id, true, meta)
      await logEvent(tx, "register", meta, user.id, email)
      await logEvent(tx, "code_sent", meta, user.id, email)
      return { user, session, code }
    })
    .catch(async (err) => {
      // a taken email or username still counts against the signup limit, or it could be probed freely
      if (uniqueViolation(err)) await logEvent(db, "register", meta, null, email).catch(() => {})
      return rethrowTaken(err)
    })
}

export async function login(
  db: Db,
  input: { email: unknown; password: unknown; remember?: unknown },
  meta: RequestMeta = {},
): Promise<SignIn> {
  const email = normalizeEmail(input.email)
  const password = typeof input.password === "string" ? input.password.slice(0, 200) : ""
  const ip = cleanIp(meta.ip)

  const { rows: fails } = await db.query<{ by_email: number; by_email_ip: number; by_ip: number }>(
    `select count(*) filter (where email = $1)::int as by_email,
            count(*) filter (where email = $1 and $2::inet is not null and ip = $2::inet)::int as by_email_ip,
            count(*) filter (where $2::inet is not null and ip = $2::inet)::int as by_ip
       from app.auth_events
      where event = 'login_failed' and created_at > now() - interval '15 minutes'
        and (email = $1 or ip = $2::inet)`,
    [email, ip],
  )
  // Without a known address only the email counts, so unknown callers share the stricter limit
  const emailLimit = ip ? LOGIN_FAIL_LIMIT.email : LOGIN_FAIL_LIMIT.emailAndIp
  if (fails[0].by_email_ip >= LOGIN_FAIL_LIMIT.emailAndIp || fails[0].by_email >= emailLimit || fails[0].by_ip >= LOGIN_FAIL_LIMIT.ip) {
    throw new AuthError("too_many_attempts", "Too many failed attempts. Try again in 15 minutes", 15 * 60)
  }

  const { rows } = await db.query<UserRow & { password_hash: string | null }>(
    `select ${USER_COLUMNS}, u.password_hash from app.users u where u.email = $1`,
    [email],
  )
  const row = rows[0]
  const ok = row?.password_hash ? await verifyPassword(password, row.password_hash) : (await burnPasswordCheck(password), false)
  if (!ok) {
    await logEvent(db, "login_failed", meta, row?.id ?? null, email)
    throw new AuthError("invalid_credentials", "Incorrect email or password")
  }

  return db.transaction(async (tx) => {
    const result = await signIn(tx, toUser(row), input.remember === true, meta)
    if (result.session) await tx.query("update app.users set last_login_at = now() where id = $1", [row.id])
    return result
  })
}

// Resolves a cookie token to its user; null when unknown or expired.
export async function getSession(
  db: Db,
  token: string | undefined | null,
): Promise<{ user: User; sessionId: string; expiresAt: Date; persistent: boolean } | null> {
  if (!token) return null
  const { rows } = await db.query<UserRow & { session_id: string; expires_at: Date; persistent: boolean; stale: boolean }>(
    `select ${USER_COLUMNS}, s.id as session_id, s.expires_at, s.persistent,
            s.last_seen_at < now() - interval '5 minutes' as stale
       from app.sessions s join app.users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [sha256(token)],
  )
  const row = rows[0]
  if (!row) return null
  if (row.stale) await db.query("update app.sessions set last_seen_at = now() where id = $1", [row.session_id])
  return { user: toUser(row), sessionId: row.session_id, expiresAt: row.expires_at, persistent: row.persistent }
}

export async function logout(db: Db, token: string | undefined | null, meta: RequestMeta = {}): Promise<void> {
  if (!token) return
  const { rows } = await db.query<{ user_id: string }>(
    "delete from app.sessions where token_hash = $1 returning user_id",
    [sha256(token)],
  )
  if (rows[0]) await logEvent(db, "logout", meta, rows[0].user_id, null)
}

// Sends a fresh code (resend), optionally to a corrected address. Before
// verification the address is simply replaced; afterwards it only changes
// once the new address is verified.
export async function issueEmailCode(
  db: Db,
  userId: string,
  input: { email?: unknown } = {},
  meta: RequestMeta = {},
): Promise<{ code: string; email: string }> {
  const { rows } = await db.query<UserRow & { last_code_at: Date | null }>(
    `select ${USER_COLUMNS},
            (select max(created_at) from app.verification_codes c where c.user_id = u.id and c.purpose = 'email_verify') as last_code_at
       from app.users u where u.id = $1`,
    [userId],
  )
  const row = rows[0]
  if (!row) throw new AuthError("unauthorized", "Log in again")
  const target = input.email === undefined || input.email === "" ? row.email : normalizeEmail(input.email)
  const verified = row.email_verified_at !== null
  if (verified && target === row.email) throw new AuthError("already_verified", "This email is already verified")

  if (row.last_code_at) {
    const wait = Math.ceil(CODE_RESEND_SECONDS - (Date.now() - row.last_code_at.getTime()) / 1000)
    if (wait > 0) throw new AuthError("too_many_attempts", `Wait ${wait}s before requesting another code`, wait)
  }

  await assertEventBudget(db, "code_sent", cleanIp(meta.ip), userId, CODE_SEND_LIMIT)

  return db
    .transaction(async (tx) => {
      if (target !== row.email) {
        if (verified) {
          const taken = await tx.query("select 1 from app.users where email = $1", [target])
          if (taken.rows.length) throw new AuthError("email_taken", "An account with this email already exists")
        } else {
          await tx.query("update app.users set email = $2 where id = $1", [userId, target])
        }
      }
      const code = await insertCode(tx, userId, target)
      await logEvent(tx, "code_sent", meta, userId, target)
      return { code, email: target }
    })
    .catch(rethrowTaken)
}

export async function verifyEmail(db: Db, userId: string, rawCode: unknown, meta: RequestMeta = {}): Promise<User> {
  const code = typeof rawCode === "string" ? rawCode.trim() : ""
  if (!/^\d{6}$/.test(code)) throw new AuthError("invalid_input", "Enter the 6-digit code we sent you")

  // A wrong guess must still count, so failures are returned (committing the
  // attempt) and thrown only after the transaction.
  const outcome = await db
    .transaction(async (tx) => {
      const { rows } = await tx.query<{ id: string; email: string; code_hash: Buffer; attempts: number; expired: boolean }>(
        `select id, email, code_hash, attempts, expires_at <= now() as expired
           from app.verification_codes
          where user_id = $1 and purpose = 'email_verify' and consumed_at is null
          for update`,
        [userId],
      )
      const live = rows[0]
      if (!live) return { error: new AuthError("invalid_code", "This code is no longer valid. Request a new one") }
      if (live.expired) return { error: new AuthError("code_expired", "This code has expired. Request a new one") }
      if (live.attempts >= CODE_MAX_ATTEMPTS) {
        return { error: new AuthError("too_many_attempts", "Too many incorrect codes. Request a new one") }
      }
      try {
        await assertCodeGuessesLeft(tx, userId, "verify_failed")
      } catch (error) {
        return { error: error as AuthError }
      }
      if (!sha256(code).equals(Buffer.from(live.code_hash))) {
        await tx.query("update app.verification_codes set attempts = attempts + 1 where id = $1", [live.id])
        await logEvent(tx, "verify_failed", meta, userId, live.email)
        return { error: new AuthError("invalid_code", "Incorrect code. Check your email and try again") }
      }
      await tx.query("update app.verification_codes set consumed_at = now() where id = $1", [live.id])
      const updated = await tx.query<UserRow>(
        `update app.users u set email = $2, email_verified_at = now() where u.id = $1 returning ${USER_COLUMNS}`,
        [userId, live.email],
      )
      await logEvent(tx, "email_verified", meta, userId, live.email)
      return { user: toUser(updated.rows[0]) }
    })
    .catch(rethrowTaken)

  if ("error" in outcome) throw outcome.error
  return outcome.user
}

export type OAuthProvider = "google" | "github"

export interface OAuthProfile {
  provider: OAuthProvider
  providerAccountId: string
  email: unknown
  // only an address the provider itself has verified may sign anyone in
  emailVerified: boolean
  // login/display name, used to suggest a username for new accounts
  username?: string
  // the person's real name, if the provider has one
  displayName?: string
  accountType?: AccountType
}

function suggestUsername(raw: string | undefined, email: string): string {
  const base = (raw || email.split("@")[0]).replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 24)
  return base.length >= 3 ? base : `${base}user`.slice(0, 24)
}

// Records the login and, for accounts that have no display name yet, takes the provider's.
// A name the user chose is never overwritten.
async function touchOAuthLogin(tx: Queryable, userId: string, profile: OAuthProfile): Promise<UserRow> {
  const { rows } = await tx.query<UserRow>(
    `update app.users u set last_login_at = now(), display_name = coalesce(u.display_name, $2)
      where u.id = $1 returning ${USER_COLUMNS}`,
    [userId, cleanDisplayName(profile.displayName)],
  )
  return rows[0]
}

// Sign in (or sign up) with a Google/GitHub identity. Returns the existing
// account for a known identity, links the identity to the account that owns
// the verified email, or creates a new, already-verified account.
export async function oauthLogin(
  db: Db,
  profile: OAuthProfile,
  meta: RequestMeta = {},
  options: { allowSignup?: boolean } = {},
): Promise<SignIn & { isNew: boolean }> {
  if (!profile.emailVerified) {
    throw new AuthError("invalid_input", "Your provider has no verified email for this account. Verify it there and try again")
  }
  const email = normalizeEmail(profile.email)

  return db
    .transaction(async (tx) => {
      const linked = await tx.query<UserRow>(
        `select ${USER_COLUMNS} from app.oauth_accounts o join app.users u on u.id = o.user_id
          where o.provider = $1 and o.provider_account_id = $2`,
        [profile.provider, profile.providerAccountId],
      )
      if (linked.rows[0]) {
        const user = toUser(await touchOAuthLogin(tx, linked.rows[0].id, profile))
        return { ...(await signIn(tx, user, true, meta)), isNew: false }
      }

      const existing = await tx.query<UserRow>(`select ${USER_COLUMNS} from app.users u where u.email = $1 for update`, [email])
      if (existing.rows[0]) {
        let row = existing.rows[0]
        if (row.email_verified_at === null) {
          // Someone may have registered this address with a password they chose, without
          // proving they own it. The verified owner takes over: drop that password and its sessions.
          const taken = await tx.query<UserRow>(
            `update app.users u set email_verified_at = now(), password_hash = null where u.id = $1 returning ${USER_COLUMNS}`,
            [row.id],
          )
          row = taken.rows[0]
          await tx.query("delete from app.sessions where user_id = $1", [row.id])
          await tx.query(
            "update app.verification_codes set consumed_at = now() where user_id = $1 and consumed_at is null",
            [row.id],
          )
          // nor may an authenticator they set up lock the owner out
          await tx.query("update app.users set totp_secret = null, totp_enabled_at = null, totp_last_step = null where id = $1", [row.id])
          await tx.query("delete from app.recovery_codes where user_id = $1", [row.id])
          await tx.query("delete from app.login_challenges where user_id = $1", [row.id])
          row = { ...row, two_factor: false }
        }
        await tx.query(
          "insert into app.oauth_accounts (provider, provider_account_id, user_id, email) values ($1, $2, $3, $4)",
          [profile.provider, profile.providerAccountId, row.id, email],
        )
        row = await touchOAuthLogin(tx, row.id, profile)
        return { ...(await signIn(tx, toUser(row), true, meta)), isNew: false }
      }

      if (options.allowSignup === false) throw new AuthError("signups_closed", "Sign-ups are closed for now. Join the waitlist")

      // New account: find a free username (checked first, since a failed insert would abort the transaction)
      const base = suggestUsername(profile.username, email)
      let username = base
      for (let i = 0; i < 6; i++) {
        const free = await tx.query("select 1 from app.users where lower(username) = lower($1)", [username])
        if (!free.rows.length) break
        username = `${base.slice(0, 27)}${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`
        if (i === 5) throw new AuthError("username_taken", "Couldn't pick a username. Try signing up with email instead")
      }
      const created = await tx.query<UserRow>(
        `insert into app.users as u (email, username, display_name, password_hash, account_type, email_verified_at, terms_accepted_at, terms_version, allow_training)
         values ($1, $2, $3, null, $4, now(), now(), $5, false) returning ${USER_COLUMNS}`,
        [email, username, cleanDisplayName(profile.displayName), profile.accountType === "business" ? "business" : "personal", TERMS_VERSION],
      )
      const user = toUser(created.rows[0])
      const org = await tx.query<{ id: string }>("insert into app.organizations (name) values ($1) returning id", [username])
      await tx.query("insert into app.organization_members (organization_id, user_id, role) values ($1, $2, 'owner')", [
        org.rows[0].id,
        user.id,
      ])
      await tx.query(
        "insert into app.oauth_accounts (provider, provider_account_id, user_id, email) values ($1, $2, $3, $4)",
        [profile.provider, profile.providerAccountId, user.id, email],
      )
      const session = await createSession(tx, user.id, true, meta)
      await logEvent(tx, "register", meta, user.id, email)
      return { user, session, isNew: true }
    })
    .catch(rethrowTaken)
}

// ---------- Password reset ----------

/**
 * Issues a reset code for the account with this email. Returns null when there is no such
 * account; the caller must answer the same way in both cases so addresses can't be probed.
 */
export async function requestPasswordReset(db: Db, rawEmail: unknown, meta: RequestMeta = {}): Promise<{ email: string; code: string } | null> {
  const email = normalizeEmail(rawEmail)
  const { rows } = await db.query<{ id: string; last_code_at: Date | null }>(
    `select u.id,
            (select max(created_at) from app.verification_codes c where c.user_id = u.id and c.purpose = 'password_reset') as last_code_at
       from app.users u where u.email = $1`,
    [email],
  )
  const row = rows[0]
  if (!row) return null
  if (row.last_code_at) {
    const wait = Math.ceil(CODE_RESEND_SECONDS - (Date.now() - row.last_code_at.getTime()) / 1000)
    if (wait > 0) throw new AuthError("too_many_attempts", `Wait ${wait}s before requesting another code`, wait)
  }
  return db.transaction(async (tx) => {
    const code = await insertCode(tx, row.id, email, "password_reset")
    await logEvent(tx, "reset_requested", meta, row.id, email)
    return { email, code }
  })
}

/**
 * Sets a new password with an emailed code, signs out every device and starts a new session
 * (or, with two-step sign-in on, a challenge: the inbox alone doesn't skip the authenticator).
 */
export async function resetPassword(
  db: Db,
  input: { email: unknown; code: unknown; password: unknown },
  meta: RequestMeta = {},
): Promise<SignIn> {
  const email = normalizeEmail(input.email)
  const code = typeof input.code === "string" ? input.code.trim() : ""
  if (!/^\d{6}$/.test(code)) throw new AuthError("invalid_input", "Enter the 6-digit code we sent you")
  const password = checkPassword(input.password)
  const passwordHash = await hashPassword(password)

  const outcome = await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string; user_id: string; code_hash: Buffer; attempts: number; expired: boolean }>(
      `select c.id, c.user_id, c.code_hash, c.attempts, c.expires_at <= now() as expired
         from app.verification_codes c join app.users u on u.id = c.user_id
        where u.email = $1 and c.purpose = 'password_reset' and c.consumed_at is null
        for update of c`,
      [email],
    )
    const live = rows[0]
    if (!live) return { error: new AuthError("invalid_code", "This code is no longer valid. Request a new one") }
    if (live.expired) return { error: new AuthError("code_expired", "This code has expired. Request a new one") }
    if (live.attempts >= CODE_MAX_ATTEMPTS) return { error: new AuthError("too_many_attempts", "Too many incorrect codes. Request a new one") }
    try {
      await assertCodeGuessesLeft(tx, live.user_id, "reset_failed")
    } catch (error) {
      return { error: error as AuthError }
    }
    if (!sha256(code).equals(Buffer.from(live.code_hash))) {
      await tx.query("update app.verification_codes set attempts = attempts + 1 where id = $1", [live.id])
      await logEvent(tx, "reset_failed", meta, live.user_id, email)
      return { error: new AuthError("invalid_code", "Incorrect code. Check your email and try again") }
    }
    await tx.query("update app.verification_codes set consumed_at = now() where id = $1", [live.id])
    // receiving the code proves the inbox, so the address counts as verified too
    const updated = await tx.query<UserRow>(
      `update app.users u set password_hash = $2, email_verified_at = coalesce(email_verified_at, now()), last_login_at = now()
        where u.id = $1 returning ${USER_COLUMNS}`,
      [live.user_id, passwordHash],
    )
    await tx.query("delete from app.sessions where user_id = $1", [live.user_id])
    await logEvent(tx, "password_reset", meta, live.user_id, email)
    return signIn(tx, toUser(updated.rows[0]), false, meta)
  })
  if ("error" in outcome) throw outcome.error
  return outcome
}

// ---------- Account settings ----------

export interface Account {
  user: User
  /** False for accounts that only sign in with Google/GitHub. */
  hasPassword: boolean
  providers: OAuthProvider[]
  /** Signed-in devices other than this one. */
  otherSessions: number
  allowTraining: boolean
  /** Unused recovery codes; 0 when two-step sign-in is off. */
  recoveryCodesLeft: number
}

export async function getAccount(db: Db, userId: string, currentSessionId: string): Promise<Account> {
  const { rows } = await db.query<
    UserRow & { has_password: boolean; allow_training: boolean; providers: OAuthProvider[] | null; other_sessions: number; recovery_left: number }
  >(
    `select ${USER_COLUMNS}, u.password_hash is not null as has_password, u.allow_training,
            (select array_agg(provider order by provider) from app.oauth_accounts o where o.user_id = u.id) as providers,
            (select count(*)::int from app.sessions s where s.user_id = u.id and s.id <> $2 and s.expires_at > now()) as other_sessions,
            (select count(*)::int from app.recovery_codes r where r.user_id = u.id and r.used_at is null) as recovery_left
       from app.users u where u.id = $1`,
    [userId, currentSessionId],
  )
  const row = rows[0]
  if (!row) throw new AuthError("unauthorized", "Log in again")
  return {
    user: toUser(row),
    hasPassword: row.has_password,
    providers: row.providers ?? [],
    otherSessions: row.other_sessions,
    allowTraining: row.allow_training,
    recoveryCodesLeft: row.two_factor ? row.recovery_left : 0,
  }
}

export async function updateProfile(
  db: Db,
  userId: string,
  input: { username?: unknown; displayName?: unknown; allowTraining?: unknown },
  meta: RequestMeta = {},
): Promise<User> {
  const sets: string[] = []
  const params: unknown[] = [userId]
  if (input.username !== undefined) {
    const username = typeof input.username === "string" ? input.username.trim() : ""
    if (!USERNAME_RE.test(username)) throw new AuthError("invalid_input", "Username must be 3-32 letters, numbers, dots, dashes or underscores")
    params.push(username)
    sets.push(`username = $${params.length}`)
  }
  if (input.displayName !== undefined) {
    if (input.displayName !== null && typeof input.displayName !== "string") throw new AuthError("invalid_input", "Enter a name")
    // an empty name clears it, and the greeting falls back to the username
    params.push(cleanDisplayName(input.displayName))
    sets.push(`display_name = $${params.length}`)
  }
  if (input.allowTraining !== undefined) {
    if (typeof input.allowTraining !== "boolean") throw new AuthError("invalid_input", "Choose yes or no")
    params.push(input.allowTraining)
    sets.push(`allow_training = $${params.length}`)
  }
  if (!sets.length) throw new AuthError("invalid_input", "Nothing to update")
  return db
    .transaction(async (tx) => {
      const { rows } = await tx.query<UserRow>(`update app.users u set ${sets.join(", ")} where u.id = $1 returning ${USER_COLUMNS}`, params)
      if (!rows[0]) throw new AuthError("unauthorized", "Log in again")
      await logEvent(tx, "profile_updated", meta, userId, null)
      return toUser(rows[0])
    })
    .catch(rethrowTaken)
}

/**
 * Changes (or, for Google/GitHub-only accounts, sets) the password and signs out every
 * other device. The current password is required whenever one exists.
 */
export async function changePassword(
  db: Db,
  userId: string,
  input: { current?: unknown; next: unknown },
  currentSessionId: string,
  meta: RequestMeta = {},
): Promise<{ signedOut: number }> {
  const next = checkPassword(input.next)
  const { rows } = await db.query<{ email: string; password_hash: string | null }>("select email, password_hash from app.users where id = $1", [userId])
  const row = rows[0]
  if (!row) throw new AuthError("unauthorized", "Log in again")
  if (row.password_hash) {
    const current = typeof input.current === "string" ? input.current.slice(0, 200) : ""
    if (!(await verifyPassword(current, row.password_hash))) {
      await logEvent(db, "login_failed", meta, userId, row.email)
      throw new AuthError("invalid_credentials", "Your current password is incorrect")
    }
    if (current === next) throw new AuthError("invalid_input", "Choose a password different from your current one")
  }
  const passwordHash = await hashPassword(next)
  return db.transaction(async (tx) => {
    await tx.query("update app.users set password_hash = $2 where id = $1", [userId, passwordHash])
    const { rows: gone } = await tx.query("delete from app.sessions where user_id = $1 and id <> $2 returning id", [userId, currentSessionId])
    await logEvent(tx, "password_changed", meta, userId, row.email)
    return { signedOut: gone.length }
  })
}

/** Signs out every device except the current one. */
export async function revokeOtherSessions(db: Db, userId: string, currentSessionId: string, meta: RequestMeta = {}): Promise<number> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query("delete from app.sessions where user_id = $1 and id <> $2 returning id", [userId, currentSessionId])
    await logEvent(tx, "sessions_revoked", meta, userId, null)
    return rows.length
  })
}

/**
 * Deletes the account (KVKK / GDPR erasure). Workspaces where this user is the only member go
 * with it, including their bots, knowledge and settings. `confirmEmail` must match the account.
 */
export async function deleteAccount(db: Db, userId: string, confirmEmail: unknown, meta: RequestMeta = {}): Promise<void> {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ email: string }>("select email from app.users where id = $1 for update", [userId])
    if (!rows[0]) throw new AuthError("unauthorized", "Log in again")
    if (typeof confirmEmail !== "string" || confirmEmail.trim().toLowerCase() !== rows[0].email) {
      throw new AuthError("invalid_input", "Type your email address exactly to confirm")
    }
    // a workspace this user owns alone but shares with others passes to its longest-serving admin, else member
    await tx.query(
      `update app.organization_members set role = 'owner'
        where (organization_id, user_id) in (
          select distinct on (m.organization_id) m.organization_id, m.user_id
            from app.organization_members m
           where m.user_id <> $1
             and exists (select 1 from app.organization_members me where me.organization_id = m.organization_id and me.user_id = $1 and me.role = 'owner')
             and not exists (select 1 from app.organization_members o where o.organization_id = m.organization_id and o.user_id <> $1 and o.role = 'owner')
           order by m.organization_id, (m.role = 'admin') desc, m.created_at)`,
      [userId],
    )
    await tx.query(
      `delete from app.organizations o
        where exists (select 1 from app.organization_members m where m.organization_id = o.id and m.user_id = $1)
          and not exists (select 1 from app.organization_members m where m.organization_id = o.id and m.user_id <> $1)`,
      [userId],
    )
    await tx.query("delete from app.users where id = $1", [userId])
    // kept without the user id so the log still shows the erasure happened
    await logEvent(tx, "account_deleted", meta, null, null)
  })
}

// ---------- Changing the account email ----------

/**
 * Sends a code to a new address; the account email changes once `verifyEmail` accepts it.
 * The current password is required whenever the account has one.
 */
export async function requestEmailChange(
  db: Db,
  userId: string,
  input: { email: unknown; password?: unknown },
  meta: RequestMeta = {},
): Promise<{ code: string; email: string }> {
  const email = normalizeEmail(input.email)
  const { rows } = await db.query<{ email: string; password_hash: string | null }>("select email, password_hash from app.users where id = $1", [userId])
  const row = rows[0]
  if (!row) throw new AuthError("unauthorized", "Log in again")
  if (email === row.email) throw new AuthError("invalid_input", "This is already your email address")
  if (row.password_hash) {
    const password = typeof input.password === "string" ? input.password.slice(0, 200) : ""
    if (!(await verifyPassword(password, row.password_hash))) {
      await logEvent(db, "login_failed", meta, userId, row.email)
      throw new AuthError("invalid_credentials", "Your current password is incorrect")
    }
  }
  return issueEmailCode(db, userId, { email }, meta)
}

// ---------- Two-step sign-in ----------

const TOTP_ISSUER = "Apex Bot"

/**
 * Checks a second-factor code for an account with two-step sign-in on: a 6-digit authenticator
 * code (each one works once) or an unused recovery code, which is then spent.
 */
async function checkSecondFactor(q: Queryable, userId: string, raw: unknown): Promise<"totp" | "recovery" | null> {
  const input = typeof raw === "string" ? raw.trim().slice(0, 40) : ""
  const { rows } = await q.query<{ totp_secret: string | null; totp_last_step: string | number | null }>(
    "select totp_secret, totp_last_step from app.users where id = $1 and totp_enabled_at is not null for update",
    [userId],
  )
  const row = rows[0]
  if (!row?.totp_secret) return null
  const digits = input.replace(/\s/g, "")
  if (/^\d{6}$/.test(digits)) {
    const { secret, legacy } = openTotpSecret(row.totp_secret, userId)
    const step = matchTotp(secret, digits, row.totp_last_step === null ? null : Number(row.totp_last_step))
    if (step === null) return null
    // a secret saved before encryption existed is sealed on its first use; a missing key must
    // not turn that into a lock-out, so it then waits for a later sign-in
    let sealed: string | null = null
    if (legacy) {
      try {
        sealed = sealTotpSecret(secret, userId)
      } catch (err) {
        console.error("[auth]", err instanceof Error ? err.message : err)
      }
    }
    await q.query("update app.users set totp_last_step = $2, totp_secret = coalesce($3, totp_secret) where id = $1", [userId, step, sealed])
    return "totp"
  }
  const recovery = normalizeRecoveryCode(input)
  if (recovery.length !== 10) return null
  const { rows: spent } = await q.query(
    "update app.recovery_codes set used_at = now() where user_id = $1 and code_hash = $2 and used_at is null returning id",
    [userId, sha256(recovery)],
  )
  return spent.length ? "recovery" : null
}

/**
 * Runs `check` with the account's wrong-code budget: a wrong code is logged (and committed) before
 * the error is thrown, so guesses always count.
 */
async function withSecondFactor<T>(
  db: Db,
  userId: string,
  code: unknown,
  meta: RequestMeta,
  then: (tx: Queryable, factor: "totp" | "recovery") => Promise<T>,
): Promise<T> {
  const outcome = await db.transaction(async (tx): Promise<{ error: AuthError } | { value: T }> => {
    try {
      await assertCodeGuessesLeft(tx, userId, "two_factor_failed")
    } catch (error) {
      return { error: error as AuthError }
    }
    const factor = await checkSecondFactor(tx, userId, code)
    if (!factor) {
      await logEvent(tx, "two_factor_failed", meta, userId, null)
      return { error: new AuthError("invalid_code", "Incorrect code. Try again") }
    }
    return { value: await then(tx, factor) }
  })
  if ("error" in outcome) throw outcome.error
  return outcome.value
}

async function replaceRecoveryCodes(q: Queryable, userId: string, meta: RequestMeta): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode)
  await q.query("delete from app.recovery_codes where user_id = $1", [userId])
  for (const code of codes) {
    await q.query("insert into app.recovery_codes (user_id, code_hash) values ($1, $2)", [userId, sha256(normalizeRecoveryCode(code))])
  }
  await logEvent(q, "recovery_codes_created", meta, userId, null)
  return codes
}

/** Second step of signing in: the challenge from `login`/`oauthLogin` and a code. Creates the session. */
export async function completeTwoFactorLogin(
  db: Db,
  token: string | undefined | null,
  code: unknown,
  meta: RequestMeta = {},
): Promise<{ user: User; session: NewSession; usedRecoveryCode: boolean; recoveryCodesLeft: number }> {
  const expired = () => new AuthError("unauthorized", "Your sign-in timed out. Log in again")
  if (!token) throw expired()
  const outcome = await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string; user_id: string; persistent: boolean; attempts: number; expired: boolean }>(
      `select id, user_id, persistent, attempts, expires_at <= now() as expired
         from app.login_challenges where token_hash = $1 for update`,
      [sha256(token)],
    )
    const challenge = rows[0]
    if (!challenge || challenge.expired) return { error: expired() }
    if (challenge.attempts >= CODE_MAX_ATTEMPTS) {
      await tx.query("delete from app.login_challenges where id = $1", [challenge.id])
      return { error: new AuthError("too_many_attempts", "Too many incorrect codes. Log in again") }
    }
    try {
      await assertCodeGuessesLeft(tx, challenge.user_id, "two_factor_failed")
    } catch (error) {
      return { error: error as AuthError }
    }
    const factor = await checkSecondFactor(tx, challenge.user_id, code)
    if (!factor) {
      await tx.query("update app.login_challenges set attempts = attempts + 1 where id = $1", [challenge.id])
      await logEvent(tx, "two_factor_failed", meta, challenge.user_id, null)
      return { error: new AuthError("invalid_code", "Incorrect code. Try again") }
    }
    await tx.query("delete from app.login_challenges where id = $1", [challenge.id])
    const session = await createSession(tx, challenge.user_id, challenge.persistent, meta)
    const updated = await tx.query<UserRow>(`update app.users u set last_login_at = now() where u.id = $1 returning ${USER_COLUMNS}`, [
      challenge.user_id,
    ])
    const left = await tx.query<{ n: number }>("select count(*)::int as n from app.recovery_codes where user_id = $1 and used_at is null", [
      challenge.user_id,
    ])
    const user = toUser(updated.rows[0])
    await logEvent(tx, "login", meta, user.id, user.email)
    return { user, session, usedRecoveryCode: factor === "recovery", recoveryCodesLeft: left.rows[0].n }
  })
  if ("error" in outcome) throw outcome.error
  return outcome
}

/** Whether a challenge token from `login`/`oauthLogin` is still waiting for its code. */
export async function hasLoginChallenge(db: Db, token: string | undefined | null): Promise<boolean> {
  if (!token) return false
  const { rows } = await db.query("select 1 from app.login_challenges where token_hash = $1 and expires_at > now()", [sha256(token)])
  return rows.length > 0
}

/**
 * Starts setting up an authenticator app: a fresh secret, not in force until `enableTwoFactor`
 * confirms a code from it. `uri` is what the QR code holds.
 */
export async function beginTwoFactorSetup(db: Db, userId: string): Promise<{ secret: string; uri: string }> {
  const secret = newTotpSecret()
  const sealed = sealTotpSecret(secret, userId)
  const { rows } = await db.query<{ email: string }>(
    `update app.users set totp_secret = $2, totp_last_step = null
      where id = $1 and totp_enabled_at is null and email_verified_at is not null returning email`,
    [userId, sealed],
  )
  if (!rows[0]) {
    const { rows: found } = await db.query<{ enabled: boolean }>("select totp_enabled_at is not null as enabled from app.users where id = $1", [userId])
    if (!found[0]) throw new AuthError("unauthorized", "Log in again")
    if (!found[0].enabled) throw new AuthError("forbidden", "Verify your email first")
    throw new AuthError("conflict", "Two-step sign-in is already on")
  }
  const label = encodeURIComponent(`${TOTP_ISSUER}:${rows[0].email}`)
  const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(TOTP_ISSUER)}&algorithm=SHA1&digits=6&period=30`
  return { secret, uri }
}

/** Turns two-step sign-in on with a code from the app just set up. Returns the recovery codes, shown once. */
export async function enableTwoFactor(db: Db, userId: string, rawCode: unknown, meta: RequestMeta = {}): Promise<{ recoveryCodes: string[] }> {
  const code = typeof rawCode === "string" ? rawCode.replace(/\s/g, "") : ""
  if (!/^\d{6}$/.test(code)) throw new AuthError("invalid_input", "Enter the 6-digit code from your authenticator app")
  const outcome = await db.transaction(async (tx): Promise<{ error: AuthError } | { recoveryCodes: string[] }> => {
    const { rows } = await tx.query<{ totp_secret: string | null; enabled: boolean }>(
      "select totp_secret, totp_enabled_at is not null as enabled from app.users where id = $1 for update",
      [userId],
    )
    const row = rows[0]
    if (!row) return { error: new AuthError("unauthorized", "Log in again") }
    if (row.enabled) return { error: new AuthError("conflict", "Two-step sign-in is already on") }
    if (!row.totp_secret) return { error: new AuthError("invalid_input", "Start the setup again") }
    try {
      await assertCodeGuessesLeft(tx, userId, "two_factor_failed")
    } catch (error) {
      return { error: error as AuthError }
    }
    const step = matchTotp(openTotpSecret(row.totp_secret, userId).secret, code, null)
    if (step === null) {
      await logEvent(tx, "two_factor_failed", meta, userId, null)
      return { error: new AuthError("invalid_code", "That code didn't match. Check the time on your phone and try the newest code") }
    }
    await tx.query("update app.users set totp_enabled_at = now(), totp_last_step = $2 where id = $1", [userId, step])
    const recoveryCodes = await replaceRecoveryCodes(tx, userId, meta)
    await logEvent(tx, "two_factor_enabled", meta, userId, null)
    return { recoveryCodes }
  })
  if ("error" in outcome) throw outcome.error
  return outcome
}

/** Turns two-step sign-in off. Needs an authenticator or recovery code. */
export async function disableTwoFactor(db: Db, userId: string, code: unknown, meta: RequestMeta = {}): Promise<void> {
  await withSecondFactor(db, userId, code, meta, async (tx) => {
    await tx.query("update app.users set totp_secret = null, totp_enabled_at = null, totp_last_step = null where id = $1", [userId])
    await tx.query("delete from app.recovery_codes where user_id = $1", [userId])
    await tx.query("delete from app.login_challenges where user_id = $1", [userId])
    await logEvent(tx, "two_factor_disabled", meta, userId, null)
  })
}

/** Replaces the recovery codes (the old ones stop working). Needs an authenticator or recovery code. */
export async function regenerateRecoveryCodes(db: Db, userId: string, code: unknown, meta: RequestMeta = {}): Promise<{ recoveryCodes: string[] }> {
  return withSecondFactor(db, userId, code, meta, async (tx) => ({ recoveryCodes: await replaceRecoveryCodes(tx, userId, meta) }))
}
