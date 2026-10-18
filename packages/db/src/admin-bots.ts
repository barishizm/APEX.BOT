import type { Queryable } from "./db.ts"
import { AdminError } from "./admin.ts"
import type { ActionChange } from "./admin-users.ts"
import type { ListSpec } from "./admin-list.ts"
import { checkSettings, LIMITS, repairSettings, type SettingsIssue } from "./bot-settings.ts"
import { BOT_SERVING_SQL, newSiteKey } from "./bots.ts"

// One bot (a customer's website) in the admin area (/admin/bots) and what staff can do to it. Like
// the workspace actions (admin-workspaces.ts), each runs in the caller's transaction (withAdminAction)
// and returns the state before and after for the audit entry. Every change touches the bot's row, so
// its updated_at moves and the chat API's sync applies it on its next pass (30 s).

export const BOT_AUDIT_LIMIT = 50
/** Longest a token budget override may last. */
export const BUDGET_OVERRIDE_MAX_HOURS = 30 * 24
export const SITE_KEY_TAIL = 6

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
const tail = (siteKey: string) => siteKey.slice(-SITE_KEY_TAIL)
/** "team@kahve.example" -> "t***@kahve.example": audit entries outlive the bot and erasure requests. */
export const maskEmail = (email: string) => email.replace(/^([^@])[^@]*@/, "$1***@")
const parseJson = (raw: unknown) => (typeof raw === "string" ? JSON.parse(raw) : raw)

// The chat API counts tokens per UTC day (limits.ts)
const TODAY_UTC = "(now() at time zone 'utc')::date"
const OVERRIDE_ACTIVE = "(b.token_budget_override_until > now())"

export type BotStatus = "serving" | "disabled" | "suspended"

// --- List ---

export interface AdminBotRow {
  id: string
  name: string
  organization_id: string
  organization_name: string
  site_key_tail: string
  allowed_origins: string[]
  model_provider: string | null
  model_id: string | null
  widget_seen_at: Date | null
  widget_seen_origin: string | null
  today_tokens: number
  knowledge_version: number
  status: BotStatus
  budget_override: boolean
  created_at: Date
}

/** Every bot on the platform, for /admin/bots. Reads single settings fields, never the whole document. */
export const ADMIN_BOTS_LIST = {
  select: `b.id, b.name, o.id as organization_id, o.name as organization_name, right(b.site_key, ${SITE_KEY_TAIL}) as site_key_tail,
    coalesce(case when jsonb_typeof(b.settings #> '{security,allowedOrigins}') = 'array' then b.settings #> '{security,allowedOrigins}' end, '[]'::jsonb) as allowed_origins,
    b.settings #>> '{model,provider}' as model_provider, b.settings #>> '{model,id}' as model_id,
    a.widget_seen_at, a.widget_seen_origin, coalesce(tu.tokens, 0)::bigint as today_tokens, b.knowledge_version,
    case when b.disabled_at is not null then 'disabled' when o.suspended_at is not null then 'suspended' else 'serving' end as status,
    coalesce(${OVERRIDE_ACTIVE}, false) as budget_override, b.created_at`,
  from: `app.bots b
    join app.organizations o on o.id = b.organization_id
    left join app.bot_activity a on a.bot_id = b.id
    left join app.token_usage tu on tu.bot_id = b.id and tu.day = ${TODAY_UTC}`,
  id: { sql: "b.id", type: "uuid" },
  sorts: {
    created: { sql: "b.created_at", type: "timestamptz" },
    name: { sql: "lower(b.name)", type: "text" },
    workspace: { sql: "lower(o.name)", type: "text" },
    tokens: { sql: "coalesce(tu.tokens, 0)::bigint", type: "bigint" },
    seen: { sql: "coalesce(a.widget_seen_at, '-infinity')", type: "timestamptz" },
  },
  defaultSort: { key: "created", dir: "desc" },
  search: ["b.name", "o.name", "b.id::text", "o.id::text", "b.site_key", "coalesce(b.settings #>> '{security,allowedOrigins}', '')"],
  filters: {
    status: {
      serving: BOT_SERVING_SQL,
      disabled: "b.disabled_at is not null",
      suspended: "b.disabled_at is null and o.suspended_at is not null",
    },
    seen: {
      "24h": "a.widget_seen_at >= now() - interval '24 hours'",
      "7d": "a.widget_seen_at >= now() - interval '7 days'",
      stale: "a.widget_seen_at < now() - interval '30 days'",
      never: "a.widget_seen_at is null",
    },
    provider: { anthropic: "b.settings #>> '{model,provider}' = 'anthropic'", openai: "b.settings #>> '{model,provider}' = 'openai'", google: "b.settings #>> '{model,provider}' = 'google'" },
    override: { yes: OVERRIDE_ACTIVE, no: `not coalesce(${OVERRIDE_ACTIVE}, false)` },
  },
} satisfies ListSpec

// --- Detail ---

export interface AdminBot {
  id: string
  name: string
  organizationId: string
  organizationName: string
  workspaceSuspendedAt: Date | null
  siteKeyTail: string
  status: BotStatus
  disabledAt: Date | null
  disabledReason: string | null
  /** Optimistic-locking counter of the settings; "Repair" names the version it was shown. */
  version: number
  knowledgeVersion: number
  widgetSeenAt: Date | null
  widgetSeenOrigin: string | null
  createdAt: Date
  updatedAt: Date
}

export interface AdminBotAuditEntry {
  id: string
  action: string
  reason: string | null
  actorId: string | null
  actorName: string | null
  createdAt: Date
}

export interface AdminBotDetail {
  bot: AdminBot
  /** The stored settings as they are, long image data shortened so the page stays light. */
  settings: unknown
  /** What fails validation in the stored settings; empty when they are sound. */
  issues: SettingsIssue[]
  tokens: {
    today: number
    /** The owner's own budget (settings.security.dailyTokenBudget, after repair). */
    budget: number
    /** Staff's temporary budget while it lasts. */
    override: { tokens: number; until: Date } | null
  }
  handoff: {
    /** The address in the settings. */
    email: string
    /** The address confirmed by code, if any. */
    verifiedEmail: string | null
  }
  knowledge: { sources: number; chunks: number }
  conversations: number
  audit: AdminBotAuditEntry[]
}

/** Shortens data: URLs (an uploaded launcher image is up to 120 KB) for display and audit entries. */
export function elideSettings(raw: unknown): unknown {
  if (typeof raw === "string") return raw.startsWith("data:") && raw.length > 120 ? `${raw.slice(0, 40)}… (${raw.length} characters)` : raw
  if (Array.isArray(raw)) return raw.map(elideSettings)
  if (raw && typeof raw === "object") return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, elideSettings(v)]))
  return raw
}

/** Everything the detail page shows; null when there is no such bot. Staff only: check before calling. */
export async function getAdminBotDetail(q: Queryable, botId: string): Promise<AdminBotDetail | null> {
  if (!isUuid(botId)) return null
  const { rows } = await q.query<
    Omit<AdminBot, "siteKeyTail"> & {
      siteKey: string
      settings: unknown
      verifiedEmail: string | null
      overrideTokens: string | number | null
      overrideUntil: Date | null
      today: string | number
    }
  >(
    `select b.id, b.name, o.id as "organizationId", o.name as "organizationName", o.suspended_at as "workspaceSuspendedAt",
            b.site_key as "siteKey",
            case when b.disabled_at is not null then 'disabled' when o.suspended_at is not null then 'suspended' else 'serving' end as status,
            b.disabled_at as "disabledAt", b.disabled_reason as "disabledReason", b.version, b.knowledge_version as "knowledgeVersion",
            a.widget_seen_at as "widgetSeenAt", a.widget_seen_origin as "widgetSeenOrigin", b.created_at as "createdAt", b.updated_at as "updatedAt",
            b.settings, b.handoff_verified_email as "verifiedEmail",
            case when ${OVERRIDE_ACTIVE} then b.token_budget_override end as "overrideTokens",
            case when ${OVERRIDE_ACTIVE} then b.token_budget_override_until end as "overrideUntil",
            coalesce((select tokens from app.token_usage tu where tu.bot_id = b.id and tu.day = ${TODAY_UTC}), 0) as today
       from app.bots b
       join app.organizations o on o.id = b.organization_id
       left join app.bot_activity a on a.bot_id = b.id
      where b.id = $1`,
    [botId],
  )
  const r = rows[0]
  if (!r) return null

  const [counts, audit] = await Promise.all([
    q.query<{ sources: number; chunks: number; conversations: number }>(
      `select (select count(*)::int from app.knowledge_sources s where s.bot_id = $1) as sources,
              (select count(*)::int from app.knowledge_chunks c where c.bot_id = $1) as chunks,
              (select count(*)::int from app.conversations c where c.bot_id = $1) as conversations`,
      [botId],
    ),
    q.query<AdminBotAuditEntry>(
      `select l.id::text, l.action, l.reason, l.actor_id as "actorId", coalesce(a.display_name, a.username) as "actorName", l.created_at as "createdAt"
         from app.admin_audit_log l left join app.users a on a.id = l.actor_id
        where l.target_type = 'bot' and l.target_id = $1
        order by l.id desc limit $2`,
      [botId, BOT_AUDIT_LIMIT],
    ),
  ])

  const raw = parseJson(r.settings)
  const repaired = repairSettings(raw)
  const { siteKey, settings: _settings, verifiedEmail, overrideTokens, overrideUntil, today, ...bot } = r
  const c = counts.rows[0]!
  return {
    bot: { ...bot, siteKeyTail: tail(siteKey) },
    settings: elideSettings(raw),
    issues: checkSettings(raw),
    tokens: {
      today: Number(today),
      budget: repaired.security.dailyTokenBudget,
      override: overrideTokens !== null && overrideUntil ? { tokens: Number(overrideTokens), until: overrideUntil } : null,
    },
    handoff: { email: repaired.handoff.email, verifiedEmail },
    knowledge: { sources: c.sources, chunks: c.chunks },
    conversations: c.conversations,
    audit: audit.rows,
  }
}

// --- Actions ---

interface BotLockRow {
  id: string
  site_key: string
  settings: unknown
  version: number
  disabled_at: Date | null
  disabled_reason: string | null
  handoff_verified_email: string | null
  token_budget_override: string | number | null
  token_budget_override_until: Date | null
}

async function lockBot(tx: Queryable, botId: string): Promise<BotLockRow> {
  if (!isUuid(botId)) throw new AdminError("not_found", "Bot not found")
  const { rows } = await tx.query<BotLockRow>(
    `select id, site_key, settings, version, disabled_at, disabled_reason, handoff_verified_email, token_budget_override, token_budget_override_until
       from app.bots where id = $1 for update`,
    [botId],
  )
  if (!rows[0]) throw new AdminError("not_found", "Bot not found")
  return rows[0]
}

/**
 * Stores the settings as repairSettings reads them: each field that fails validation falls back to
 * its default. `baseVersion` is the version whose problems staff saw; a save since then is refused.
 */
export async function adminRepairBotSettings(tx: Queryable, botId: string, baseVersion: unknown): Promise<ActionChange<{ version: number }>> {
  const bot = await lockBot(tx, botId)
  if (bot.version !== baseVersion) throw new AdminError("invalid_input", "The settings changed since this page loaded. Reload to see the latest version")
  const raw = parseJson(bot.settings)
  const issues = checkSettings(raw)
  if (!issues.length) throw new AdminError("invalid_input", "These settings have no problems to repair")
  const repaired = repairSettings(raw)
  const { rows } = await tx.query<{ version: number }>("update app.bots set settings = $2::jsonb, version = version + 1 where id = $1 returning version", [
    botId,
    JSON.stringify(repaired),
  ])
  const version = rows[0]!.version
  // the old document (its hand-off address masked) stays in the audit log, so a repair can be undone by hand
  const snapshot = elideSettings(raw) as { handoff?: { email?: unknown } }
  if (typeof snapshot?.handoff?.email === "string") snapshot.handoff.email = maskEmail(snapshot.handoff.email)
  return { before: { version: bot.version, issues, settings: snapshot }, after: { version }, extra: { version } }
}

/** Issues a new site key: the owner must update their embed code, the old key stops working on the next sync. */
export async function adminRotateBotSiteKey(tx: Queryable, botId: string): Promise<ActionChange<{ siteKeyTail: string }>> {
  const bot = await lockBot(tx, botId)
  const key = newSiteKey()
  await tx.query("update app.bots set site_key = $2, version = version + 1 where id = $1", [botId, key])
  // only the tails go to the audit log: a key in a log is a key anyone reading it can embed
  return { before: { siteKeyTail: tail(bot.site_key) }, after: { siteKeyTail: tail(key) }, extra: { siteKeyTail: tail(key) } }
}

/** The widget answers "out of service" on its site from the next sync on. `reason` is for staff only. */
export async function adminDisableBot(tx: Queryable, botId: string, reason: string): Promise<ActionChange> {
  const bot = await lockBot(tx, botId)
  if (bot.disabled_at) throw new AdminError("invalid_input", "This bot is already disabled")
  const { rows } = await tx.query<{ disabled_at: Date }>(
    "update app.bots set disabled_at = now(), disabled_reason = $2 where id = $1 returning disabled_at",
    [botId, reason.slice(0, 1000)],
  )
  return { before: { disabledAt: null }, after: { disabledAt: rows[0]!.disabled_at }, extra: {} }
}

export async function adminEnableBot(tx: Queryable, botId: string): Promise<ActionChange> {
  const bot = await lockBot(tx, botId)
  if (!bot.disabled_at) throw new AdminError("invalid_input", "This bot isn't disabled")
  await tx.query("update app.bots set disabled_at = null, disabled_reason = null where id = $1", [botId])
  return { before: { disabledAt: bot.disabled_at, disabledReason: bot.disabled_reason }, after: { disabledAt: null }, extra: {} }
}

const overrideOf = (bot: BotLockRow) =>
  bot.token_budget_override !== null && bot.token_budget_override_until && bot.token_budget_override_until.getTime() > Date.now()
    ? { tokens: Number(bot.token_budget_override), until: bot.token_budget_override_until }
    : null

/**
 * Sets a daily token budget that replaces the owner's for `hours` (up to BUDGET_OVERRIDE_MAX_HOURS).
 * It may raise or lower the budget; the deployment's own ceiling (APEX_MAX_DAILY_TOKENS) still applies.
 */
export async function adminSetTokenBudgetOverride(tx: Queryable, botId: string, rawTokens: unknown, rawHours: unknown): Promise<ActionChange<{ until: Date }>> {
  const tokens = Number(rawTokens)
  const hours = Number(rawHours)
  const max = LIMITS.dailyTokenBudget.max
  if (!Number.isInteger(tokens) || tokens < 0 || tokens > max) throw new AdminError("invalid_input", `Give a whole number of tokens between 0 and ${max}`)
  if (!Number.isInteger(hours) || hours < 1 || hours > BUDGET_OVERRIDE_MAX_HOURS) {
    throw new AdminError("invalid_input", `An override lasts between 1 and ${BUDGET_OVERRIDE_MAX_HOURS} hours`)
  }
  const bot = await lockBot(tx, botId)
  const { rows } = await tx.query<{ until: Date }>(
    `update app.bots set token_budget_override = $2, token_budget_override_until = now() + make_interval(hours => $3)
      where id = $1 returning token_budget_override_until as until`,
    [botId, tokens, hours],
  )
  const until = rows[0]!.until
  return { before: { override: overrideOf(bot) }, after: { override: { tokens, until } }, extra: { until } }
}

export async function adminClearTokenBudgetOverride(tx: Queryable, botId: string): Promise<ActionChange> {
  const bot = await lockBot(tx, botId)
  const current = overrideOf(bot)
  if (!current) throw new AdminError("invalid_input", "This bot has no token budget override")
  await tx.query("update app.bots set token_budget_override = null, token_budget_override_until = null where id = $1", [botId])
  return { before: { override: current }, after: { override: null }, extra: {} }
}

/**
 * Forgets the hand-off address confirmed by code, so hand-off mail stops until it is confirmed again.
 * The verified account address of a workspace owner or admin needs no code and keeps working.
 */
export async function adminResetHandoffEmail(tx: Queryable, botId: string): Promise<ActionChange> {
  const bot = await lockBot(tx, botId)
  if (!bot.handoff_verified_email) throw new AdminError("invalid_input", "No hand-off address is confirmed for this bot")
  await tx.query("update app.bots set handoff_verified_email = null, version = version + 1 where id = $1", [botId])
  // a code sent before the reset must not confirm the address again
  await tx.query("update app.handoff_verifications set expires_at = now() where bot_id = $1", [botId])
  return { before: { verifiedEmail: maskEmail(bot.handoff_verified_email) }, after: { verifiedEmail: null }, extra: {} }
}
