import type { Metadata } from "next"
import { workspacePlan } from "@apex/db"
import { DashboardFrame } from "@/components/dashboard/frame"
import { WidgetStudio } from "@/components/widget-studio/studio"
import { requireVerifiedUser } from "@/lib/auth"
import { botJson } from "@/lib/bot"
import { currentBot } from "@/lib/dashboard"
import { db } from "@/lib/db"
import { getAppDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"
import { apiUrl } from "@/lib/site"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).studio.title }
}

export default async function WidgetPage({ searchParams }: { searchParams: Promise<{ section?: string; guide?: string }> }) {
  const { section, guide } = await searchParams
  const user = await requireVerifiedUser()
  const bot = await currentBot(user.id)
  const plan = await workspacePlan(db(), bot.organizationId)
  return (
    <DashboardFrame active="Widget">
      <WidgetStudio
        initial={botJson(bot, plan)}
        // customers load the widget from the chat API
        widgetUrl={`${apiUrl()}/widget.js`}
        initialSection={section}
        // "Place widget" in onboarding walks the user through installing
        guide={guide === "1" && section === "install"}
      />
    </DashboardFrame>
  )
}
