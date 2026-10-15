import type { Metadata } from "next"
import { canEditBot, listConversations } from "@apex/db"
import { ConversationInbox } from "@/components/conversations/inbox"
import { DashboardFrame } from "@/components/dashboard/frame"
import { requireVerifiedUser } from "@/lib/auth"
import { parseFilter, summaryJson } from "@/lib/conversations"
import { currentBot } from "@/lib/dashboard"
import { db } from "@/lib/db"

export const metadata: Metadata = { title: "Conversations" }

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requireVerifiedUser()
  const filter = parseFilter((await searchParams).filter)
  const [bot, page] = await Promise.all([currentBot(user.id), listConversations(db(), user.id, { filter })])
  return (
    <DashboardFrame active="Conversations">
      <ConversationInbox initial={page.conversations.map(summaryJson)} hasMore={page.hasMore} filter={filter} canEdit={canEditBot(bot.role)} />
    </DashboardFrame>
  )
}
