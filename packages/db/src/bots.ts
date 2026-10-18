import { randomBytes } from "node:crypto"
import type { Db, Queryable } from "./db.ts"
import { CODE_MAX_ATTEMPTS, CODE_RESEND_SECONDS, CODE_TTL_MS } from "./auth.ts"
import { DEFAULT_SETTINGS, LIMITS, BotSettingsError, parseSettings, repairSettings, type BotSettings } from "./bot-settings.ts"
import { newVerificationCode, sha256 } from "./crypto.ts"

export type BotErrorCode = "not_found" | "forbidden" | "conflict" | "invalid_code" | "rate_limited"

/** Confirmation codes the dashboard may send per bot in 24 hours, whatever the address. */
export const HANDOFF_CODES_PER_DAY = 10

/** Websites (bots) one workspace may have. */
export const BOTS_PER_WORKSPACE = 10
export const BOT_NAME_MAX = 80

/**
 * Which bot a dashboard call acts on: a bare user id means the workspace's first bot, and
 * `botId` picks another one the user is a member of. An unknown `botId` falls back to the
 * first bot for reads; writes that name a bot fail instead of changing a different one.
 */
export type BotScope = string | { userId: string; botId?: string | null }

export const scopeUser = (who: BotScope) => (typeof who === "string" ? who : who.userId)
const scopeBot = (who: BotScope) => (typeof who === "string" ? null : who.botId || null)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  /** The dashboard's label for the website; visitors never see it. */
  name: string
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
  name: string
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
  name: r.name,
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

// The workspace a user works in: the one they picked, else the oldest one they own, else the oldest membership.
export async function membership(q: Queryable, userId: string) {
  const { rows } = await q.query<{ organization_id: string; name: string; role: MemberRole; email: string }>(
    `select m.organization_id, o.name, m.role, u.email
       from app.organization_members m
       join app.organizations o on o.id = m.organization_id
       join app.users u on u.id = m.user_id
      where m.user_id = $1
      order by coalesce(m.organization_id = u.active_organization_id, false) desc, (m.role = 'owner') desc, m.created_at
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

const SELECT_BOT = `select b.id, b.name, b.organization_id, o.name as organization_name, b.site_key, b.settings,
                           b.version, b.updated_at, m.role, a.widget_seen_at, a.widget_seen_origin,
                           ${HANDOFF_VERIFIED} as handoff_verified
                      from app.bots b
                      join app.organizations o on o.id = b.organization_id
                      join app.organization_members m on m.organization_id = b.organization_id and m.user_id = $1
                      left join app.bot_activity a on a.bot_id = b.id`

/** The bot `who` names, else the workspace's first bot, created with defaults on first visit. */
export async function getBotForUser(db: Db, who: BotScope): Promise<Bot> {
  const userId = scopeUser(who)
  const botId = scopeBot(who)
  // the membership join in SELECT_BOT keeps other workspaces' bots out
  if (botId && UUID.test(botId)) {
    const { rows } = await db.query<BotRow>(`${SELECT_BOT} where b.id = $2`, [userId, botId])
    if (rows[0]) return toBot(rows[0])
  }
  const member = await membership(db, userId)
  const first = () => db.query<BotRow>(`${SELECT_BOT} where b.organization_id = $2 order by b.created_at, b.id limit 1`, [userId, member.organization_id])
  const found = await first()
  if (found.rows[0]) return toBot(found.rows[0])

  // the row lock makes two first visits at once create one bot, not two
  await db.transaction(async (tx) => {
    await tx.query("select 1 from app.organizations where id = $1 for update", [member.organization_id])
    const { rows } = await tx.query("select 1 from app.bots where organization_id = $1 limit 1", [member.organization_id])
    if (!rows.length) await insertBot(tx, member, userId, member.name)
  })
  return toBot((await first()).rows[0])
}

async function insertBot(q: Queryable, member: { organization_id: string; name: string; email: string }, userId: string, name: string) {
  const settings: BotSettings = structuredClone(DEFAULT_SETTINGS)
  settings.general.companyName = member.name.slice(0, 80)
  settings.handoff.email = member.email
  const { rows } = await q.query<{ id: string }>(
    `insert into app.bots (organization_id, name, site_key, settings, updated_by) values ($1, $2, $3, $4::jsonb, $5) returning id`,
    [member.organization_id, name, newSiteKey(), JSON.stringify(settings), userId],
  )
  return rows[0].id
}

/** The bot a write acts on: it must be the one `who` names, and the user must be allowed to change it. */
async function botForWrite(db: Db, who: BotScope): Promise<Bot> {
  const bot = await getBotForUser(db, who)
  const botId = scopeBot(who)
  if (botId && bot.id !== botId) throw new BotError("not_found", "This website was removed. Reload to see your websites")
  if (!canEditBot(bot.role)) throw new BotError("forbidden", "Only workspace owners and admins can change the bot")
  return bot
}

// ---------- Websites of a workspace ----------

export interface BotSummary {
  id: string
  name: string
  siteKey: string
  allowedOrigins: string[]
  widgetSeenAt: Date | null
  createdAt: Date
}

/** Every website of the user's workspace, oldest first (the first one is the default). */
export async function listBotsForUser(db: Db, userId: string): Promise<{ bots: BotSummary[]; canEdit: boolean; limit: number }> {
  const member = await membership(db, userId)
  const { rows } = await db.query<{ id: string; name: string; site_key: string; settings: unknown; widget_seen_at: Date | null; created_at: Date }>(
    `select b.id, b.name, b.site_key, b.settings, a.widget_seen_at, b.created_at
       from app.bots b left join app.bot_activity a on a.bot_id = b.id
      where b.organization_id = $1
      order by b.created_at, b.id`,
    [member.organization_id],
  )
  return {
    bots: rows.map((r) => ({
      id: r.id,
      name: r.name,
      siteKey: r.site_key,
      allowedOrigins: repairSettings(typeof r.settings === "string" ? JSON.parse(r.settings) : r.settings).security.allowedOrigins,
      widgetSeenAt: r.widget_seen_at,
      createdAt: r.created_at,
    })),
    canEdit: canEditBot(member.role),
    limit: BOTS_PER_WORKSPACE,
  }
}

function cleanBotName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : ""
  if (!name) throw new BotSettingsError([{ path: "name", message: "Give the website a name" }])
  if (name.length > BOT_NAME_MAX) throw new BotSettingsError([{ path: "name", message: `Keep the name under ${BOT_NAME_MAX} characters` }])
  return name
}

/** Adds a website to the user's workspace: a new bot with default settings and its own site key. */
export async function createBot(db: Db, userId: string, rawName: unknown): Promise<Bot> {
  const name = cleanBotName(rawName)
  const member = await membership(db, userId)
  if (!canEditBot(member.role)) throw new BotError("forbidden", "Only workspace owners and admins can add websites")
  const id = await db.transaction(async (tx) => {
    // serializes concurrent adds so the limit holds
    await tx.query("select 1 from app.organizations where id = $1 for update", [member.organization_id])
    const { rows } = await tx.query<{ n: number }>("select count(*)::int as n from app.bots where organization_id = $1", [member.organization_id])
    if (rows[0].n >= BOTS_PER_WORKSPACE) {
      throw new BotError("conflict", `A workspace can have up to ${BOTS_PER_WORKSPACE} websites. Remove one to add another`)
    }
    return insertBot(tx, member, userId, name)
  })
  return getBotForUser(db, { userId, botId: id })
}

export async function renameBot(db: Db, who: BotScope, rawName: unknown): Promise<Bot> {
  const name = cleanBotName(rawName)
  const bot = await botForWrite(db, who)
  // a label only: the version stays, so an open editor doesn't hit a conflict
  await db.query("update app.bots set name = $1 where id = $2", [name, bot.id])
  return getBotForUser(db, { userId: scopeUser(who), botId: bot.id })
}

/**
 * Removes a website with its knowledge and conversations. Its embed stops working at once.
 * The workspace's last website can't be removed: the dashboard always has a bot to show.
 */
export async function deleteBot(db: Db, who: BotScope): Promise<void> {
  const bot = await botForWrite(db, who)
  await db.transaction(async (tx) => {
    await tx.query("select 1 from app.organizations where id = $1 for update", [bot.organizationId])
    const { rows } = await tx.query<{ n: number }>("select count(*)::int as n from app.bots where organization_id = $1", [bot.organizationId])
    if (rows[0].n <= 1) throw new BotError("conflict", "This is your only website. Add another before removing it")
    await tx.query("delete from app.bots where id = $1", [bot.id])
  })
}

/**
 * Validates and stores new settings. `baseVersion` is the version the editor loaded;
 * if someone saved in between, this fails with "conflict" instead of overwriting.
 * Throws BotSettingsError (from bot-settings.ts) when the settings are invalid.
 */
export async function saveBotSettings(db: Db, who: BotScope, raw: unknown, baseVersion: number): Promise<Bot> {
  const settings = parseSettings(raw)
  const bot = await botForWrite(db, who)
  const userId = scopeUser(who)
  if (settings.handoff.enabled && settings.handoff.email && !(await isHandoffEmailVerified(db, bot, settings.handoff.email))) {
    throw new BotSettingsError([{ path: "handoff.email", message: "Confirm this address with the code we email you before using it" }])
  }
  const { rows } = await db.query<{ id: string }>(
    `update app.bots set settings = $1::jsonb, version = version + 1, updated_by = $2
      where id = $3 and version = $4 returning id`,
    [JSON.stringify(settings), userId, bot.id, baseVersion],
  )
  if (!rows[0]) throw new BotError("conflict", "These settings were changed somewhere else. Reload to see the latest version")
  return getBotForUser(db, { userId, botId: bot.id })
}

/**
 * Adds a website origin to the allowlist unless it's there already or the list is full.
 * Used when onboarding learns the customer's site, so the widget works there right away.
 */
export async function addAllowedOrigin(db: Db, who: BotScope, origin: string): Promise<Bot> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const bot = await getBotForUser(db, who)
    if (!canEditBot(bot.role)) return bot
    const origins = bot.settings.security.allowedOrigins
    if (origins.includes(origin) || origins.length >= LIMITS.origins) return bot
    const next = { ...bot.settings, security: { ...bot.settings.security, allowedOrigins: [...origins, origin] } }
    try {
      return await saveBotSettings(db, { userId: scopeUser(who), botId: bot.id }, next, bot.version)
    } catch (err) {
      // someone saved in between: re-read and try again
      if (!(err instanceof BotError && err.code === "conflict")) throw err
    }
  }
  return getBotForUser(db, who)
}

/** Issues a new public key; embeds using the old one stop working immediately. */
export async function rotateSiteKey(db: Db, who: BotScope): Promise<Bot> {
  const bot = await botForWrite(db, who)
  const userId = scopeUser(who)
  await db.query("update app.bots set site_key = $1, version = version + 1, updated_by = $2 where id = $3", [newSiteKey(), userId, bot.id])
  return getBotForUser(db, { userId, botId: bot.id })
}

// Bots the widget serves: not disabled by staff, in a workspace that isn't suspended (b, o aliases)
export const BOT_SERVING_SQL = "(b.disabled_at is null and o.suspended_at is null)"

export interface BotRecord {
  id: string
  organizationId: string
  organizationName: string
  siteKey: string
  settings: BotSettings
  /** Whether settings.handoff.email is confirmed; the chat API mails no other address. */
  handoffVerified: boolean
  /** Changes whenever the bot's knowledge chunks change. */
  knowledgeVersion: number
  /**
   * False when staff disabled the bot or suspended its workspace: the chat API then keeps only its
   * site key and origins, to tell the widget politely that it is out of service.
   */
  serving: boolean
  /** A daily token budget staff set for a while, in place of settings.security.dailyTokenBudget. */
  budgetOverride: { tokens: number; until: Date } | null
  updatedAt: Date
}

/** Every bot changed after `since` (all of them when null), for the chat API's sync. */
export async function listBotsChangedSince(db: Queryable, since: Date | null): Promise<BotRecord[]> {
  const { rows } = await db.query<
    Omit<BotRow, "role"> & { knowledge_version: number; serving: boolean; token_budget_override: string | number | null; token_budget_override_until: Date | null }
  >(
    `select b.id, b.organization_id, o.name as organization_name, b.site_key, b.settings, b.version, b.knowledge_version, b.updated_at,
            ${HANDOFF_VERIFIED} as handoff_verified, ${BOT_SERVING_SQL} as serving, b.token_budget_override, b.token_budget_override_until
       from app.bots b join app.organizations o on o.id = b.organization_id
      -- JS dates carry milliseconds, Postgres microseconds: compare at JS precision so the
      -- newest bot isn't returned again on every poll
      where $1::timestamptz is null or date_trunc('milliseconds', b.updated_at) > $1::timestamptz
      order by b.updated_at`,
    [since],
  )
  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    siteKey: r.site_key,
    settings: repairSettings(typeof r.settings === "string" ? JSON.parse(r.settings) : r.settings),
    handoffVerified: r.handoff_verified,
    knowledgeVersion: r.knowledge_version,
    serving: r.serving,
    budgetOverride:
      r.token_budget_override !== null && r.token_budget_override_until ? { tokens: Number(r.token_budget_override), until: r.token_budget_override_until } : null,
    updatedAt: r.updated_at,
  }))
}

/** Ids of every bot that should answer: not disabled, in a workspace that isn't suspended. */
export async function listBotIds(db: Queryable): Promise<string[]> {
  return (await listBotStates(db)).filter((b) => b.serving).map((b) => b.id)
}

/**
 * Every bot and whether it should answer, so the chat API's sync can drop deleted ones and pause
 * disabled or suspended ones even when nothing touched their row.
 */
export async function listBotStates(db: Queryable): Promise<{ id: string; serving: boolean }[]> {
  const { rows } = await db.query<{ id: string; serving: boolean }>(
    `select b.id, ${BOT_SERVING_SQL} as serving from app.bots b join app.organizations o on o.id = b.organization_id`,
  )
  return rows
}

/**
 * Marks every bot of a workspace changed, so the chat API's sync pauses or reloads them (after a
 * suspension or its lifting) on its next pass.
 */
export async function touchWorkspaceBots(q: Queryable, organizationId: string): Promise<number> {
  const { rows } = await q.query("update app.bots set updated_at = now() where organization_id = $1 returning id", [organizationId])
  return rows.length
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
export async function startHandoffVerification(db: Db, who: BotScope, rawEmail: unknown): Promise<{ email: string; code: string }> {
  const email = normalizeEmail(rawEmail)
  if (email.length > 254 || !EMAIL.test(email)) {
    throw new BotSettingsError([{ path: "handoff.email", message: "Enter a valid email address" }])
  }
  const bot = await botForWrite(db, who)
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
export async function confirmHandoffEmail(db: Db, who: BotScope, rawCode: unknown): Promise<Bot> {
  const code = typeof rawCode === "string" ? rawCode.trim() : ""
  if (!/^\d{6}$/.test(code)) throw new BotError("invalid_code", "Enter the 6-digit code we sent you")
  const bot = await botForWrite(db, who)
  const userId = scopeUser(who)

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
  return getBotForUser(db, { userId, botId: bot.id })
}
