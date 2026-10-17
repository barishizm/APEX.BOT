import { cookies } from "next/headers"
import type { BotScope } from "@apex/db"

// The website (bot) the dashboard is showing. Kept in a cookie so every page and API route
// of the browser agrees; the database checks the user may see it and falls back to the
// workspace's first website when it's gone.
export const SITE_COOKIE = "apex_site"

/** Scope for a dashboard call: `botId` from the request body when the client named one, else the cookie. */
export async function siteScope(userId: string, botId?: unknown): Promise<BotScope> {
  if (typeof botId === "string" && botId) return { userId, botId }
  return { userId, botId: (await cookies()).get(SITE_COOKIE)?.value ?? null }
}

export async function selectSite(botId: string) {
  ;(await cookies()).set(SITE_COOKIE, botId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  })
}

export async function forgetSite() {
  ;(await cookies()).delete(SITE_COOKIE)
}
