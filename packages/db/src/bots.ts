import { randomBytes } from "node:crypto"
import type { Db, Queryable } from "./db.ts"
import { CODE_MAX_ATTEMPTS, CODE_RESEND_SECONDS, CODE_TTL_MS } from "./auth.ts"
import { DEFAULT_SETTINGS, LIMITS, BotSettingsError, parseSettings, repairSettings, type BotSettings } from "./bot-settings.ts"
import { newVerificationCode, sha256 } from "./crypto.ts"

export type BotErrorCode = "not_found" | "forbidden" | "conflict" | "invalid_code" | "rate_limited"

/** Confirmation codes the dashboard may send per bot in 24 hours, whatever the address. */
export const HANDOFF_CODES_PER_DAY = 10

export class BotError extends Error {
  constructor(
    readonly code: BotErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export type MemberRole = "owner" | "admin" | "member"

export interface Bot {
  id: string
  organizationId: string
  organizationName: string
  siteKey: string
  settings: BotSettings
  /** Optimistic-locking counter: a save must name the version it was based on. */
  version: number
  updatedAt: Date
  /** The requesting user's role in the bot's workspace. */
  role: MemberRole
  /** Last time the widget loaded on an allowed website, and which one. */
  widgetSeenAt: Date | null
  widgetSeenOrigin: string | null
  /** The hand-off address has been confirmed, so the chat API may mail it. */
  handoffVerified: boolean
}

interface BotRow {
  id: string
  organization_id: string
  organization_name: string
  site_key: string
  settings: unknown
  version: number
  updated_at: Date
  role: MemberRole
  widget_seen_at: Date | null
  widget_seen_origin: string | null
  handoff_verified: boolean
}

const toBot = (r: BotRow): Bot => ({
  id: r.id,
  organizationId: r.organization_id,
  organizationName: r.organization_name,
  siteKey: r.site_key,
  settings: repairSettings(typeof r.settings === "string" ? JSON.parse(r.settings) : r.settings),
  version: r.version,
  updatedAt: r.updated_at,
  role: r.role,
  widgetSeenAt: r.widget_seen_at,
  widgetSeenOrigin: r.widget_seen_origin,
  handoffVerified: r.handoff_verified,
})

export const newSiteKey = () => `apex_pk_${randomBytes(18).toString("hex")}`

export const canEditBot = (role: MemberRole) => role === "owner" || role === "admin"

// The workspace a user works in: the oldest one they own, else the oldest membership.
async function membership(q: Queryable, userId: string) {
  const { rows } = await q.query<{ organization_id: string; name: string; role: MemberRole; email: string }>(
    `select m.organization_id, o.name, m.role, u.email
       from app.organization_members m
       join app.organizations o on o.id = m.organization_id
       join app.users u on u.id = m.user_id
      where m.user_id = $1
      order by (m.role = 'owner') desc, m.created_at
      limit 1`,
    [userId],
  )
  if (!rows[0]) throw new BotError("not_found", "You are not a member of any workspace")
  return rows[0]
}

// A hand-off address is confirmed when it was verified by a code or is the verified account
// address of a workspace owner or admin.
const HANDOFF_VERIFIED = `(coalesce(lower(b.settings -> 'handoff' ->> 'email') = b.handoff_verified_email, false)
                           or exists (select 1
                                        from app.organization_members hm
                                        join app.users hu on hu.id = hm.user_id
                                       where hm.organization_id = b.organization_id
                                         and hm.role in ('owner', 'admin')
                                         and hu.email_verified_at is not null
                                         and lower(hu.email) = lower(b.settings -> 'handoff' ->> 'email')))`

const SELECT_BOT = `select b.id, b.organization_id, o.name as organization_name, b.site_key, b.settings,
                           b.version, b.updated_at, m.role, a.widget_seen_at, a.widget_seen_origin,
                           ${HANDOFF_VERIFIED} as handoff_verified
                      from app.bots b
                      join app.organizations o on o.id = b.organization_id
                      join app.organization_members m on m.organization_id = b.organization_id and m.user_id = $1
                      left join app.bot_activity a on a.bot_id = b.id`

/** The user's workspace bot, created with defaults on first visit. */
export async function getBotForUser(db: Db, userId: string): Promise<Bot> {
  const member = await membership(db, userId)
  const found = await db.query<BotRow>(`${SELECT_BOT} where b.organization_id = $2`, [userId, member.organization_id])
  if (found.rows[0]) return toBot(found.rows[0])

  const settings: BotSettings = structuredClone(DEFAULT_SETTINGS)
  settings.general.companyName = member.name.slice(0, 80)
  settings.handoff.email = member.email
  // "on conflict do nothing": two first visits at once must not both insert
  await db.query(
    `insert into app.bots (organization_id, site_key, settings, updated_by)
     values ($1, $2, $3::jsonb, $4) on conflict (organization_id) do nothing`,
    [member.organization_id, newSiteKey(), JSON.stringify(settings), userId],
  )
  const created = await db.query<BotRow>(`${SELECT_BOT} where b.organization_id = $2`, [userId, member.organization_id])
  return toBot(created.rows[0])
}

/**
 * Validates and stores new settings. `baseVersion` is the version the editor loaded;
 * if someone saved in between, this fails with "conflict" instead of overwriting.
 * Throws BotSettingsError (from bot-settings.ts) when the settings are invalid.
 */
export async function saveBotSettings(db: Db, userId: string, raw: unknown, baseVersion: number): Promise<Bot> {
  const settings = parseSettings(raw)
  const bot = await getBotForUser(db, userId)
  if (!canEditBot(bot.role)) throw new BotError("forbidden", "Only workspace owners and admins can change the bot")
  if (settings.handoff.enabled && settings.handoff.email && !(await isHandoffEmailVerified(db, bot, settings.handoff.email))) {
    throw new BotSettingsError([{ path: "handoff.email", message: "Confirm this address with the code we email you before using it" }])
  }
  const { rows } = await db.query<{ id: string }>(
    `update app.bots set settings = $1::jsonb, version = version + 1, updated_by = $2
      where id = $3 and version = $4 returning id`,
    [JSON.stringify(settings), userId, bot.id, baseVersion],
  )
  if (!rows[0]) throw new BotError("conflict", "These settings were changed somewhere else. Reload to see the latest version")
  return getBotForUser(db, userId)
}

/**
 * Adds a website origin to the allowlist unless it's there already or the list is full.
 * Used when onboarding learns the customer's site, so the widget works there right away.
 */
export async function addAllowedOrigin(db: Db, userId: string, origin: string): Promise<Bot> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const bot = await getBotForUser(db, userId)
    if (!canEditBot(bot.role)) return bot
    const origins = bot.settings.security.allowedOrigins
    if (origins.includes(origin) || origins.length >= LIMITS.origins) return bot
    const next = { ...bot.settings, security: { ...bot.settings.security, allowedOrigins: [...origins, origin] } }
    try {
      return await saveBotSettings(db, userId, next, bot.version)
    } catch (err) {
      // someone saved in between: re-read and try again
      if (!(err instanceof BotError && err.code === "conflict")) throw err
    }
  }
  return getBotForUser(db, userId)
}

/** Issues a new public key; embeds using the old one stop working immediately. */
export async function rotateSiteKey(db: Db, userId: string): Promise<Bot> {
  const bot = await getBotForUser(db, userId)
  if (!canEditBot(bot.role)) throw new BotError("forbidden", "Only workspace owners and admins can change the bot")
  await db.query("update app.bots set site_key = $1, version = version + 1, updated_by = $2 where id = $3", [newSiteKey(), userId, bot.id])
  return getBotForUser(db, userId)
}

export interface BotRecord {
  id: string
  organizationName: string
  siteKey: string
  settings: BotSettings
  /** Whether settings.handoff.email is confirmed; the chat API mails no other address. */
  handoffVerified: boolean
  /** Changes whenever the bot's knowledge chunks change. */
  knowledgeVersion: number
  updatedAt: Date
}

/** Every bot changed after `since` (all of them when null), for the chat API's sync. */
export async function listBotsChangedSince(db: Queryable, since: Date | null): Promise<BotRecord[]> {
  const { rows } = await db.query<Omit<BotRow, "role"> & { knowledge_version: number }>(
    `select b.id, b.organization_id, o.name as organization_name, b.site_key, b.settings, b.version, b.knowledge_version, b.updated_at,
            ${HANDOFF_VERIFIED} as handoff_verified
       from app.bots b join app.organizations o on o.id = b.organization_id
      -- JS dates carry milliseconds, Postgres microseconds: compare at JS precision so the
      -- newest bot isn't returned again on every poll
      where $1::timestamptz is null or date_trunc('milliseconds', b.updated_at) > $1::timestamptz
      order by b.updated_at`,
    [since],
  )
  return rows.map((r) => ({
    id: r.id,
    organizationName: r.organization_name,
    siteKey: r.site_key,
    settings: repairSettings(typeof r.settings === "string" ? JSON.parse(r.settings) : r.settings),
    handoffVerified: r.handoff_verified,
    knowledgeVersion: r.knowledge_version,
    updatedAt: r.updated_at,
  }))
}

/** Called by the chat API when the widget loads on an allowed site (throttled there). */
export async function recordWidgetSeen(db: Queryable, botId: string, origin: string, at: Date = new Date()): Promise<void> {
  await db.query(
    `insert into app.bot_activity (bot_id, widget_seen_at, widget_seen_origin) values ($1, $2, $3)
     on conflict (bot_id) do update set widget_seen_at = excluded.widget_seen_at, widget_seen_origin = excluded.widget_seen_origin`,
    [botId, at, origin.slice(0, 300)],
  )
}

// ---------- Hand-off address confirmation ----------

const normalizeEmail = (raw: unknown) => (typeof raw === "string" ? raw.trim().toLowerCase() : "")
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/

async function isHandoffEmailVerified(db: Queryable, bot: Bot, email: string): Promise<boolean> {
  const { rows } = await db.query<{ handoff_verified_email: string | null }>("select handoff_verified_email from app.bots where id = $1", [bot.id])
  const address = email.toLowerCase()
  if (rows[0]?.handoff_verified_email === address) return true
  // the verified account address of an owner/admin needs no code
  const { rows: members } = await db.query(
    `select 1 from app.organization_members m join app.users u on u.id = m.user_id
      where m.organization_id = $1 and m.role in ('owner', 'admin') and u.email_verified_at is not null and lower(u.email) = $2`,
    [bot.organizationId, address],
  )
  return members.length > 0
}

/**
 * Starts confirming a hand-off address: stores a code for it and returns the code for the caller
 * to email to that address. Limited to one code per CODE_RESEND_SECONDS and
 * HANDOFF_CODES_PER_DAY per bot, so this can't be used to mail strangers in bulk.
 */
export async function startHandoffVerification(db: Db, userId: string, rawEmail: unknown): Promise<{ email: string; code: string }> {
  const email = normalizeEmail(rawEmail)
  if (email.length > 254 || !EMAIL.test(email)) {
    throw new BotSettingsError([{ path: "handoff.email", message: "Enter a valid email address" }])
  }
  const bot = await getBotForUser(db, userId)
  if (!canEditBot(bot.role)) throw new BotError("forbidden", "Only workspace owners and admins can change the bot")
  const code = newVerificationCode()
  const day = 24 * 60 * 60 * 1000
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ created_at: Date; window_start: Date; sends: number }>(
      "select created_at, window_start, sends from app.handoff_verifications where bot_id = $1 for update",
      [bot.id],
    )
    const prev = rows[0]
    const at = Date.now()
    if (prev) {
      const wait = Math.ceil(CODE_RESEND_SECONDS - (at - prev.created_at.getTime()) / 1000)
      if (wait > 0) throw new BotError("rate_limited", `Wait ${wait}s before requesting another code`)
      if (at - prev.window_start.getTime() < day && prev.sends >= HANDOFF_CODES_PER_DAY) {
        throw new BotError("rate_limited", "Too many codes requested today. Try again tomorrow")
      }
    }
    const fresh = !prev || at - prev.window_start.getTime() >= day
    await tx.query(
      `insert into app.handoff_verifications (bot_id, email, code_hash, expires_at)
       values ($1, $2, $3, $4)
       on conflict (bot_id) do update set email = excluded.email, code_hash = excluded.code_hash, attempts = 0,
         expires_at = excluded.expires_at, created_at = now(),
         window_start = case when $5 then now() else app.handoff_verifications.window_start end,
         sends = case when $5 then 1 else app.handoff_verifications.sends + 1 end`,
      [bot.id, email, sha256(code), new Date(at + CODE_TTL_MS), fresh],
    )
    return { email, code }
  })
}

/** Checks the emailed code and, if right, marks that address as confirmed for the bot's hand-offs. */
export async function confirmHandoffEmail(db: Db, userId: string, rawCode: unknown): Promise<Bot> {
  const code = typeof rawCode === "string" ? rawCode.trim() : ""
  if (!/^\d{6}$/.test(code)) throw new BotError("invalid_code", "Enter the 6-digit code we sent you")
  const bot = await getBotForUser(db, userId)
  if (!canEditBot(bot.role)) throw new BotError("forbidden", "Only workspace owners and admins can change the bot")

  // A wrong guess must still count, so failures are returned (committing the attempt) and thrown after
  const outcome = await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ email: string; code_hash: Buffer; attempts: number; expired: boolean }>(
      "select email, code_hash, attempts, expires_at <= now() as expired from app.handoff_verifications where bot_id = $1 for update",
      [bot.id],
    )
    const live = rows[0]
    if (!live) return new BotError("invalid_code", "This code is no longer valid. Request a new one")
    if (live.expired) return new BotError("invalid_code", "This code has expired. Request a new one")
    if (live.attempts >= CODE_MAX_ATTEMPTS) return new BotError("rate_limited", "Too many incorrect codes. Request a new one")
    if (!sha256(code).equals(Buffer.from(live.code_hash))) {
      await tx.query("update app.handoff_verifications set attempts = attempts + 1 where bot_id = $1", [bot.id])
      return new BotError("invalid_code", "Incorrect code. Check the inbox of that address and try again")
    }
    // expiring the row keeps the send counters but kills the code
    await tx.query("update app.handoff_verifications set expires_at = now(), attempts = $2 where bot_id = $1", [bot.id, CODE_MAX_ATTEMPTS])
    await tx.query("update app.bots set handoff_verified_email = $2, version = version + 1, updated_by = $3 where id = $1", [bot.id, live.email, userId])
    return null
  })
  if (outcome) throw outcome
  return getBotForUser(db, userId)
}
