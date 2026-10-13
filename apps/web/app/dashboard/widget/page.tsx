import type { Metadata } from "next"
import { getBotForUser } from "@apex/db"
import { DashboardShell } from "@/components/ui/dashboard-shell"
import { WidgetStudio } from "@/components/widget-studio/studio"
import { requireVerifiedUser } from "@/lib/auth"
import { botJson } from "@/lib/bot"
import { db } from "@/lib/db"

export const metadata: Metadata = { title: "Customize widget — Apex Bot" }

export default async function WidgetPage({ searchParams }: { searchParams: Promise<{ section?: string; guide?: string }> }) {
  const { section, guide } = await searchParams
  const user = await requireVerifiedUser()
  const bot = await getBotForUser(db(), user.id)
  // Where customers load the widget from: the chat API serves /widget.js
  const apiUrl = (process.env.NEXT_PUBLIC_APEX_API_URL || "http://localhost:8787").replace(/\/+$/, "")
  return (
    <DashboardShell user={{ username: user.username, email: user.email }} active="Widget">
      <WidgetStudio
        initial={botJson(bot)}
        widgetUrl={`${apiUrl}/widget.js`}
        initialSection={section}
        // "Place widget" in onboarding walks the user through installing
        guide={guide === "1" && section === "install"}
      />
    </DashboardShell>
  )
}
