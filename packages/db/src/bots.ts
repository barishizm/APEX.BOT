import { randomBytes } from "node:crypto"
import type { Db, Queryable } from "./db.ts"
import { DEFAULT_SETTINGS, LIMITS, parseSettings, repairSettings, type BotSettings } from "./bot-settings.ts"

export type BotErrorCode = "not_found" | "forbidden" | "conflict"

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

const SELECT_BOT = `select b.id, b.organization_id, o.name as organization_name, b.site_key, b.settings,
                           b.version, b.updated_at, m.role, a.widget_seen_at, a.widget_seen_origin
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
  /** Changes whenever the bot's knowledge chunks change. */
  knowledgeVersion: number
  updatedAt: Date
}

/** Every bot changed after `since` (all of them when null), for the chat API's sync. */
export async function listBotsChangedSince(db: Queryable, since: Date | null): Promise<BotRecord[]> {
  const { rows } = await db.query<Omit<BotRow, "role"> & { knowledge_version: number }>(
    `select b.id, b.organization_id, o.name as organization_name, b.site_key, b.settings, b.version, b.knowledge_version, b.updated_at
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
