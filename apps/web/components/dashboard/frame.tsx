import type { ReactNode } from "react"
import { BETA_ENDING_DAYS, announcementsFor, botPlan, getSubscription, liveAnnouncements, rememberUserLocale, runningBetaPlacement, subscriptionGrants } from "@apex/db"
import type { AnnouncementJson } from "@/components/announcement-banner"
import { DashboardShell, type NavLabel } from "@/components/ui/dashboard-shell"
import { announcementJson } from "@/lib/announcements"
import { isImpersonating, requireVerifiedUser } from "@/lib/auth"
import { sitesJson } from "@/lib/bot"
import { currentBot, currentSites, getSetup } from "@/lib/dashboard"
import { db } from "@/lib/db"
import { format } from "@/lib/i18n"
import { getAppDictionary } from "@/lib/i18n/app"
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

// A failed payment (ADR 0003 (f)), shown to every member of the workspace on every dashboard page until
// the subscription leaves past_due: it can't be closed, and links to the billing page to fix it. And
// the end of a beta placement (ADR 0003 (g)) from 30 days before it: closable, back again at 7 days.
async function billingBanners(organizationId: string): Promise<AnnouncementJson[]> {
  try {
    const now = new Date()
    const [sub, beta, locale] = await Promise.all([getSubscription(db(), organizationId), runningBetaPlacement(db(), organizationId, now), requestLocale()])
    const t = getAppDictionary(locale).billing
    const formatDate = (d: Date) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d)
    if (beta && !(sub && subscriptionGrants(sub, now))) {
      const daysLeft = (beta.endsAt.getTime() - now.getTime()) / 86_400_000
      if (daysLeft <= BETA_ENDING_DAYS.first) {
        const last = daysLeft <= BETA_ENDING_DAYS.last
        return [
          {
            id: "billing-beta-ending",
            level: last ? "critical" : "warn",
            text: format(t.betaEnding, { date: formatDate(beta.endsAt), plan: t.plans[beta.plan] }),
            dismissible: true,
            version: `${beta.id}:${last ? BETA_ENDING_DAYS.last : BETA_ENDING_DAYS.first}`,
            action: { label: t.choose, href: "/dashboard/settings/billing" },
          },
        ]
      }
    }
    if (sub?.status !== "past_due" || !sub.graceUntil) return []
    const plan = t.plans[sub.plan]
    const inGrace = now < sub.graceUntil
    const date = formatDate(sub.graceUntil)
    return [
      {
        id: "billing-past-due",
        level: inGrace ? "warn" : "critical",
        text: inGrace ? format(t.pastDue, { date, plan }) : format(t.pastDueEnded, { plan }),
        dismissible: false,
        version: sub.graceUntil.toISOString(),
        action: { label: t.manage.updatePayment, href: "/dashboard/settings/billing" },
      },
    ]
  } catch (err) {
    console.error("[billing] banner:", err instanceof Error ? err.message : err)
    return []
  }
}

// The language billing emails from the cron go out in; never while staff view the app as this user
async function rememberLocale(userId: string) {
  try {
    if (!(await isImpersonating())) await rememberUserLocale(db(), userId, await requestLocale())
  } catch (err) {
    console.error("[locale]", err instanceof Error ? err.message : err)
  }
}

// Server wrapper: every dashboard page gets the signed-in user, their websites and real setup progress
export async function DashboardFrame({ active, intro, children }: { active?: NavLabel; intro?: boolean; children: ReactNode }) {
  const user = await requireVerifiedUser()
  // the bot first: a first visit creates it, and the site list must include it
  const bot = await currentBot(user.id)
  const [steps, sites, billing, banners] = await Promise.all([
    getSetup(user.id),
    currentSites(user.id),
    billingBanners(bot.organizationId),
    announcements(bot),
    rememberLocale(user.id),
  ])
  const setup = Object.values(steps)
  return (
    <DashboardShell
      user={{ name: user.displayName ?? user.username, email: user.email, platformRole: user.platformRole }}
      sites={sitesJson(sites, bot.id)}
      active={active}
      intro={intro}
      setup={{ done: setup.filter(Boolean).length, total: setup.length }}
      announcements={[...billing, ...banners]}
    >
      {children}
    </DashboardShell>
  )
}
