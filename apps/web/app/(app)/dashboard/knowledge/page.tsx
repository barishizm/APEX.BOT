import type { Metadata } from "next"
import { KNOWLEDGE_LIMITS, canEditBot, sourceUsage } from "@apex/db"
import { DashboardFrame } from "@/components/dashboard/frame"
import { KnowledgeManager } from "@/components/knowledge/manager"
import { requireVerifiedUser } from "@/lib/auth"
import { currentBot, currentSources } from "@/lib/dashboard"
import { db } from "@/lib/db"
import { getAppDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"
import { sourceJson } from "@/lib/knowledge"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).knowledge.title }
}

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ title?: string; source?: string }> }) {
  const { title, source } = await searchParams
  const user = await requireVerifiedUser()
  const [bot, sources, usage, locale] = await Promise.all([
    currentBot(user.id),
    currentSources(user.id),
    // a nice-to-have: the page still works if counting citations fails
    sourceUsage(db(), user.id).catch((err) => {
      console.error("[knowledge] couldn't count citations", err)
      return {}
    }),
    requestLocale(),
  ])
  return (
    <DashboardFrame active="Knowledge">
      <KnowledgeManager
        initial={sources.map((s) => sourceJson(s, locale))}
        usage={usage}
        limits={KNOWLEDGE_LIMITS}
        canEdit={canEditBot(bot.role)}
        prefillTitle={title?.slice(0, 200)}
        openSource={source}
      />
    </DashboardFrame>
  )
}
