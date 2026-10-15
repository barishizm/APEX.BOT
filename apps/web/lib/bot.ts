import { BotError, BotSettingsError, type Bot } from "@apex/db"
import { authErrorResponse, currentSession } from "@/lib/auth"
import { schemaMissing } from "@/lib/db"

// What the dashboard receives: the bot minus server-only fields
export function botJson(bot: Bot) {
  return {
    siteKey: bot.siteKey,
    settings: bot.settings,
    version: bot.version,
    updatedAt: bot.updatedAt.toISOString(),
    canEdit: bot.role === "owner" || bot.role === "admin",
    handoffVerified: bot.handoffVerified,
  }
}
export type BotJson = ReturnType<typeof botJson>

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

export function botErrorResponse(err: unknown) {
  if (err instanceof BotApiError) return Response.json({ error: err.code, message: err.message }, { status: err.status })
  if (err instanceof BotSettingsError) {
    return Response.json({ error: "invalid_settings", message: "Some settings need fixing", issues: err.issues }, { status: 400 })
  }
  if (err instanceof BotError) return Response.json({ error: err.code, message: err.message }, { status: STATUS[err.code] })
  return authErrorResponse(err)
}
