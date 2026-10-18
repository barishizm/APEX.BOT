import type { ReactNode } from "react"
import { announcementsFor, botPlan, liveAnnouncements } from "@apex/db"
import type { AnnouncementJson } from "@/components/announcement-banner"
import { DashboardShell, type NavLabel } from "@/components/ui/dashboard-shell"
import { announcementJson } from "@/lib/announcements"
import { requireVerifiedUser } from "@/lib/auth"
import { sitesJson } from "@/lib/bot"
import { currentBot, currentSites, getSetup } from "@/lib/dashboard"
import { db } from "@/lib/db"
import { requestLocale } from "@/lib/i18n/server"

// The banners staff published for this workspace (its plan, or it by name); none if they can't be read
async function announcements(bot: { id: string; organizationId: string }): Promise<AnnouncementJson[]> {
  try {
    const [list, plan, locale] = await Promise.all([liveAnnouncements(db()), botPlan(db(), bot.id), requestLocale()])
    return announcementsFor(list, { organizationId: bot.organizationId, plan }).map((a) => announcementJson(a, locale))
  } catch (err) {
    console.error("[announcements]", err instanceof Error ? err.message : err)
    return []
  }
}

// Server wrapper: every dashboard page gets the signed-in user, their websites and real setup progress
export async function DashboardFrame({ active, intro, children }: { active?: NavLabel; intro?: boolean; children: ReactNode }) {
  const user = await requireVerifiedUser()
  // the bot first: a first visit creates it, and the site list must include it
  const bot = await currentBot(user.id)
  const [steps, sites, banners] = await Promise.all([getSetup(user.id), currentSites(user.id), announcements(bot)])
  const setup = Object.values(steps)
  return (
    <DashboardShell
      user={{ name: user.displayName ?? user.username, email: user.email, platformRole: user.platformRole }}
      sites={sitesJson(sites, bot.id)}
      active={active}
      intro={intro}
      setup={{ done: setup.filter(Boolean).length, total: setup.length }}
      announcements={banners}
    >
      {children}
    </DashboardShell>
  )
}
