import { cache } from "react"
import { DEFAULT_SETTINGS, getBotForUser, listBotsForUser, listSources, type Bot } from "@apex/db"
import { siteScope } from "@/lib/current-site"
import { db } from "@/lib/db"

// One lookup per request, shared by the shell and the page
export const currentScope = cache((userId: string) => siteScope(userId))
export const currentBot = cache(async (userId: string) => getBotForUser(db(), await currentScope(userId)))
// by the resolved bot, so a stale cookie doesn't show one site's sources next to another's settings
export const currentSources = cache(async (userId: string) => listSources(db(), { userId, botId: (await currentBot(userId)).id }))
export const currentSites = cache((userId: string) => listBotsForUser(db(), userId))
/** Scope of the website the page shows, for the other per-site queries. */
export const shownSite = async (userId: string) => ({ userId, botId: (await currentBot(userId)).id })

export type SetupStepId = "account" | "knowledge" | "widget" | "install" | "test"
export type SetupState = Record<SetupStepId, boolean>

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Customized = anything visitors see differs from the defaults. */
export function isCustomized(bot: Bot) {
  const s = bot.settings
  return (
    s.general.botName !== DEFAULT_SETTINGS.general.botName ||
    !same(s.appearance, DEFAULT_SETTINGS.appearance) ||
    !same(s.messages, DEFAULT_SETTINGS.messages) ||
    !same(s.persona, DEFAULT_SETTINGS.persona)
  )
}

/** The "Go live" checklist, from what's actually stored. */
export const getSetup = cache(async (userId: string): Promise<SetupState> => {
  const [bot, sources] = await Promise.all([currentBot(userId), currentSources(userId)])
  return {
    account: true,
    knowledge: sources.some((s) => s.chunks > 0),
    widget: isCustomized(bot),
    install: bot.settings.security.allowedOrigins.length > 0,
    test: !!bot.widgetSeenAt,
  }
})
