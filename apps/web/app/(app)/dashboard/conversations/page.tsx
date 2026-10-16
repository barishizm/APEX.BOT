import type { Metadata } from "next"
import { canEditBot, listConversations } from "@apex/db"
import { ConversationInbox } from "@/components/conversations/inbox"
import { DashboardFrame } from "@/components/dashboard/frame"
import { requireVerifiedUser } from "@/lib/auth"
import { parseFilter, summaryJson } from "@/lib/conversations"
import { currentBot } from "@/lib/dashboard"
import { db } from "@/lib/db"
import { getAppDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).inbox.title }
}

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ filter?: string; open?: string }> }) {
  const user = await requireVerifiedUser()
  const params = await searchParams
  const filter = parseFilter(params.filter)
  // only a well-formed id; the transcript loads through the API, which checks it belongs to this bot
  const open = params.open && /^[0-9a-f-]{36}$/i.test(params.open) ? params.open : null
  const [bot, page] = await Promise.all([currentBot(user.id), listConversations(db(), user.id, { filter })])
  return (
    <DashboardFrame active="Conversations">
      <ConversationInbox initial={page.conversations.map(summaryJson)} hasMore={page.hasMore} filter={filter} canEdit={canEditBot(bot.role)} open={open} />
    </DashboardFrame>
  )
}
