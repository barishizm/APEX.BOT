import { cache } from "react"
import { DEFAULT_SETTINGS, getBotForUser, listSources, type Bot } from "@apex/db"
import { db } from "@/lib/db"

// One lookup per request, shared by the shell and the page
export const currentBot = cache((userId: string) => getBotForUser(db(), userId))
export const currentSources = cache((userId: string) => listSources(db(), userId))

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
