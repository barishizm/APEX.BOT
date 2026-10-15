import type { Metadata } from "next"
import { KNOWLEDGE_LIMITS, canEditBot } from "@apex/db"
import { DashboardFrame } from "@/components/dashboard/frame"
import { KnowledgeManager } from "@/components/knowledge/manager"
import { requireVerifiedUser } from "@/lib/auth"
import { currentBot, currentSources } from "@/lib/dashboard"
import { sourceJson } from "@/lib/knowledge"

export const metadata: Metadata = { title: "Knowledge" }

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ title?: string }> }) {
  const { title } = await searchParams
  const user = await requireVerifiedUser()
  const [bot, sources] = await Promise.all([currentBot(user.id), currentSources(user.id)])
  return (
    <DashboardFrame active="Knowledge">
      <KnowledgeManager initial={sources.map(sourceJson)} limits={KNOWLEDGE_LIMITS} canEdit={canEditBot(bot.role)} prefillTitle={title?.slice(0, 200)} />
    </DashboardFrame>
  )
}
