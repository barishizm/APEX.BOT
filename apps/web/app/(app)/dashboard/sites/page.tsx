import type { Metadata } from "next"
import { DashboardFrame } from "@/components/dashboard/frame"
import { SitesManager } from "@/components/sites/manager"
import { requireVerifiedUser } from "@/lib/auth"
import { sitesJson } from "@/lib/bot"
import { currentBot, currentSites } from "@/lib/dashboard"
import { getAppDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).sites.title }
}

export default async function SitesPage() {
  const user = await requireVerifiedUser()
  const bot = await currentBot(user.id)
  const sites = await currentSites(user.id)
  return (
    <DashboardFrame active="Sites">
      <SitesManager initial={sitesJson(sites, bot.id)} />
    </DashboardFrame>
  )
}
