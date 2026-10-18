import type { Metadata } from "next"
import { canEditBot, listConversations, maskConversationSummary } from "@apex/db"
import { ConversationInbox } from "@/components/conversations/inbox"
import { DashboardFrame } from "@/components/dashboard/frame"
import { isImpersonating, requireVerifiedUser } from "@/lib/auth"
import { parseDays, parseFilter, parseSearch, summaryJson } from "@/lib/conversations"
import { currentBot, shownSite } from "@/lib/dashboard"
import { db } from "@/lib/db"
import { getAppDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).inbox.title }
}

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ filter?: string; days?: string; q?: string; open?: string }> }) {
  const user = await requireVerifiedUser()
  const params = await searchParams
  const filter = parseFilter(params.filter)
  const days = parseDays(params.days)
  const search = parseSearch(params.q)
  // only a well-formed id; the transcript loads through the API, which checks it belongs to this bot
  const open = params.open && /^[0-9a-f-]{36}$/i.test(params.open) ? params.open : null
  const [bot, page, masked] = await Promise.all([currentBot(user.id), listConversations(db(), await shownSite(user.id), { filter, days, search }), isImpersonating()])
  const rows = masked ? page.conversations.map(maskConversationSummary) : page.conversations
  return (
    <DashboardFrame active="Conversations">
      <ConversationInbox
        initial={rows.map(summaryJson)}
        hasMore={page.hasMore}
        filter={filter}
        days={days}
        search={search}
        canEdit={canEditBot(bot.role)}
        open={open}
        readOnly={masked}
      />
    </DashboardFrame>
  )
}
