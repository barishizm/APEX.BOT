import type { Metadata } from "next"
import { cookies } from "next/headers"
import { ANSWER_LIMITS, analyticsData, canEditBot } from "@apex/db"
import { AnalyticsDashboard } from "@/components/analytics/dashboard"
import { DashboardFrame } from "@/components/dashboard/frame"
import { isImpersonating, requireVerifiedUser } from "@/lib/auth"
import { analyticsJson } from "@/lib/analytics"
import { currentBot, shownSite } from "@/lib/dashboard"
import { db } from "@/lib/db"
import { getAppDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"
import { TZ_COOKIE } from "@/lib/time-zone"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).analytics.title }
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await requireVerifiedUser()
  const [{ days }, jar] = await Promise.all([searchParams, cookies()])
  // the zone the browser reported last time; the page corrects it on the client if it changed
  const timeZone = jar.get(TZ_COOKIE)?.value
  const [bot, data] = await Promise.all([currentBot(user.id), analyticsData(db(), await shownSite(user.id), { days, timeZone: timeZone && decodeURIComponent(timeZone) })])
  return (
    <DashboardFrame active="Analytics">
      <AnalyticsDashboard initial={analyticsJson(data, { masked: await isImpersonating() })} canEdit={canEditBot(bot.role)} limits={ANSWER_LIMITS} />
    </DashboardFrame>
  )
}
