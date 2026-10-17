import type { ReactNode } from "react"
import { DashboardShell, type NavLabel } from "@/components/ui/dashboard-shell"
import { requireVerifiedUser } from "@/lib/auth"
import { sitesJson } from "@/lib/bot"
import { currentBot, currentSites, getSetup } from "@/lib/dashboard"

// Server wrapper: every dashboard page gets the signed-in user, their websites and real setup progress
export async function DashboardFrame({ active, intro, children }: { active?: NavLabel; intro?: boolean; children: ReactNode }) {
  const user = await requireVerifiedUser()
  // the bot first: a first visit creates it, and the site list must include it
  const bot = await currentBot(user.id)
  const [steps, sites] = await Promise.all([getSetup(user.id), currentSites(user.id)])
  const setup = Object.values(steps)
  return (
    <DashboardShell
      user={{ name: user.displayName ?? user.username, email: user.email, platformRole: user.platformRole }}
      sites={sitesJson(sites, bot.id)}
      active={active}
      intro={intro}
      setup={{ done: setup.filter(Boolean).length, total: setup.length }}
    >
      {children}
    </DashboardShell>
  )
}
