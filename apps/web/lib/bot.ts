import { BOT_NAME_MAX, BotError, BotSettingsError, type Bot, type BotSummary } from "@apex/db"
import { authErrorResponse, currentSession, errorJson } from "@/lib/auth"
import { translateIssues } from "@/lib/i18n/messages"
import { requestLocale } from "@/lib/i18n/server"
import { schemaMissing } from "@/lib/db"

// What the dashboard receives: the bot minus server-only fields
export function botJson(bot: Bot) {
  return {
    id: bot.id,
    name: bot.name,
    siteKey: bot.siteKey,
    settings: bot.settings,
    version: bot.version,
    updatedAt: bot.updatedAt.toISOString(),
    canEdit: bot.role === "owner" || bot.role === "admin",
    handoffVerified: bot.handoffVerified,
  }
}
export type BotJson = ReturnType<typeof botJson>

// The site switcher's list: no settings, just enough to tell the websites apart
export function sitesJson(sites: { bots: BotSummary[]; canEdit: boolean; limit: number }, currentId: string) {
  return {
    currentId,
    canEdit: sites.canEdit,
    limit: sites.limit,
    nameMax: BOT_NAME_MAX,
    sites: sites.bots.map((b) => ({
      id: b.id,
      name: b.name,
      origins: b.allowedOrigins,
      live: !!b.widgetSeenAt,
    })),
  }
}
export type SitesJson = ReturnType<typeof sitesJson>

// Same session rules as the pages: signed in and email verified
export async function requireApiUser() {
  if ((await schemaMissing()).length) throw new BotApiError(503, "database_outdated", "The database needs an update. Run npm run db:migrate")
  const session = await currentSession()
  if (!session) throw new BotApiError(401, "unauthorized", "Not logged in")
  if (!session.user.emailVerified) throw new BotApiError(403, "unverified", "Verify your email first")
  return session.user
}

class BotApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

const STATUS = { not_found: 404, forbidden: 403, conflict: 409, invalid_code: 400, rate_limited: 429 } as const

export async function botErrorResponse(err: unknown) {
  if (err instanceof BotApiError) return errorJson(err.code, err.message, { status: err.status })
  if (err instanceof BotSettingsError) {
    const issues = translateIssues(err.issues, await requestLocale())
    return errorJson("invalid_settings", "Some settings need fixing", { status: 400, extra: { issues } })
  }
  if (err instanceof BotError) return errorJson(err.code, err.message, { status: STATUS[err.code] })
  return authErrorResponse(err)
}
