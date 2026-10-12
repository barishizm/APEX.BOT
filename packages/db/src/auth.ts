import { isIP } from "node:net"
import type { Db, Queryable } from "./db.ts"
import {
  burnPasswordCheck,
  hashPassword,
  newSessionToken,
  newVerificationCode,
  sha256,
  verifyPassword,
} from "./crypto.ts"

const DAY_MS = 24 * 60 * 60 * 1000
export const SESSION_TTL_MS = { persistent: 30 * DAY_MS, browser: DAY_MS }
export const CODE_TTL_MS = 15 * 60 * 1000
export const CODE_MAX_ATTEMPTS = 5
export const CODE_RESEND_SECONDS = 30
// Failed log-ins counted over the last 15 minutes
const LOGIN_FAIL_LIMIT = { email: 10, ip: 50 }
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
  accountType: AccountType
  emailVerified: boolean
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
  account_type: AccountType
  email_verified_at: Date | null
  created_at: Date
}

const USER_COLUMNS = "u.id, u.email, u.username, u.account_type, u.email_verified_at, u.created_at"

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  username: r.username,
  accountType: r.account_type,
  emailVerified: r.email_verified_at !== null,
  createdAt: r.created_at,
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/

function normalizeEmail(raw: unknown): string {
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

type AuthEvent = "register" | "login" | "login_failed" | "logout" | "code_sent" | "email_verified" | "verify_failed"

async function logEvent(q: Queryable, event: AuthEvent, meta: RequestMeta, userId: string | null, email: string | null) {
  await q.query(
    "insert into app.auth_events (event, user_id, email, ip, user_agent) values ($1, $2, $3, $4, $5)",
    [event, userId, email, cleanIp(meta.ip), cleanAgent(meta.userAgent)],
  )
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

// Replaces any live code for this user, so only the newest one works.
async function insertCode(q: Queryable, userId: string, email: string): Promise<string> {
  const code = newVerificationCode()
  await q.query(
    "update app.verification_codes set consumed_at = now() where user_id = $1 and purpose = 'email_verify' and consumed_at is null",
    [userId],
  )
  await q.query(
    "insert into app.verification_codes (user_id, purpose, email, code_hash, expires_at) values ($1, 'email_verify', $2, $3, $4)",
    [userId, email, sha256(code), new Date(Date.now() + CODE_TTL_MS)],
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

  const passwordHash = await hashPassword(password)

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
    .catch(rethrowTaken)
}

export async function login(
  db: Db,
  input: { email: unknown; password: unknown; remember?: unknown },
  meta: RequestMeta = {},
): Promise<{ user: User; session: NewSession }> {
  const email = normalizeEmail(input.email)
  const password = typeof input.password === "string" ? input.password.slice(0, 200) : ""
  const ip = cleanIp(meta.ip)

  const { rows: fails } = await db.query<{ by_email: number; by_ip: number }>(
    `select count(*) filter (where email = $1)::int as by_email,
            count(*) filter (where ip = $2::inet)::int as by_ip
       from app.auth_events
      where event = 'login_failed' and created_at > now() - interval '15 minutes'
        and (email = $1 or ip = $2::inet)`,
    [email, ip],
  )
  if (fails[0].by_email >= LOGIN_FAIL_LIMIT.email || fails[0].by_ip >= LOGIN_FAIL_LIMIT.ip) {
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
    const session = await createSession(tx, row.id, input.remember === true, meta)
    await tx.query("update app.users set last_login_at = now() where id = $1", [row.id])
    await logEvent(tx, "login", meta, row.id, email)
    return { user: toUser(row), session }
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
  accountType?: AccountType
}

function suggestUsername(raw: string | undefined, email: string): string {
  const base = (raw || email.split("@")[0]).replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 24)
  return base.length >= 3 ? base : `${base}user`.slice(0, 24)
}

// Sign in (or sign up) with a Google/GitHub identity. Returns the existing
// account for a known identity, links the identity to the account that owns
// the verified email, or creates a new, already-verified account.
export async function oauthLogin(
  db: Db,
  profile: OAuthProfile,
  meta: RequestMeta = {},
): Promise<{ user: User; session: NewSession; isNew: boolean }> {
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
        const user = toUser(linked.rows[0])
        const session = await createSession(tx, user.id, true, meta)
        await tx.query("update app.users set last_login_at = now() where id = $1", [user.id])
        await logEvent(tx, "login", meta, user.id, user.email)
        return { user, session, isNew: false }
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
        }
        await tx.query(
          "insert into app.oauth_accounts (provider, provider_account_id, user_id, email) values ($1, $2, $3, $4)",
          [profile.provider, profile.providerAccountId, row.id, email],
        )
        const session = await createSession(tx, row.id, true, meta)
        await tx.query("update app.users set last_login_at = now() where id = $1", [row.id])
        await logEvent(tx, "login", meta, row.id, email)
        return { user: toUser(row), session, isNew: false }
      }

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
        `insert into app.users as u (email, username, password_hash, account_type, email_verified_at, terms_accepted_at, terms_version, allow_training)
         values ($1, $2, null, $3, now(), now(), $4, false) returning ${USER_COLUMNS}`,
        [email, username, profile.accountType === "business" ? "business" : "personal", TERMS_VERSION],
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
