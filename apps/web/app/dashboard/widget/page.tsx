import type { Metadata } from "next"
import { DashboardFrame } from "@/components/dashboard/frame"
import { WidgetStudio } from "@/components/widget-studio/studio"
import { requireVerifiedUser } from "@/lib/auth"
import { botJson } from "@/lib/bot"
import { currentBot } from "@/lib/dashboard"
import { apiUrl } from "@/lib/site"

export const metadata: Metadata = { title: "Customize widget" }

export default async function WidgetPage({ searchParams }: { searchParams: Promise<{ section?: string; guide?: string }> }) {
  const { section, guide } = await searchParams
  const user = await requireVerifiedUser()
  const bot = await currentBot(user.id)
  return (
    <DashboardFrame active="Widget">
      <WidgetStudio
        initial={botJson(bot)}
        // customers load the widget from the chat API
        widgetUrl={`${apiUrl()}/widget.js`}
        initialSection={section}
        // "Place widget" in onboarding walks the user through installing
        guide={guide === "1" && section === "install"}
      />
    </DashboardFrame>
  )
}
