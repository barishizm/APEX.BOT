import type { Metadata } from "next"
import { KNOWLEDGE_LIMITS, canEditBot } from "@apex/db"
import { DashboardFrame } from "@/components/dashboard/frame"
import { KnowledgeManager } from "@/components/knowledge/manager"
import { requireVerifiedUser } from "@/lib/auth"
import { currentBot, currentSources } from "@/lib/dashboard"
import { getAppDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"
import { sourceJson } from "@/lib/knowledge"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).knowledge.title }
}

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ title?: string }> }) {
  const { title } = await searchParams
  const user = await requireVerifiedUser()
  const [bot, sources, locale] = await Promise.all([currentBot(user.id), currentSources(user.id), requestLocale()])
  return (
    <DashboardFrame active="Knowledge">
      <KnowledgeManager initial={sources.map((s) => sourceJson(s, locale))} limits={KNOWLEDGE_LIMITS} canEdit={canEditBot(bot.role)} prefillTitle={title?.slice(0, 200)} />
    </DashboardFrame>
  )
}
