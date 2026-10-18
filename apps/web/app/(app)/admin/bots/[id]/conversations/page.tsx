import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { activeSupportAccess, getAdminBotDetail, supportListConversations } from "@apex/db"
import { SupportAccessBar } from "@/components/admin/support-access-bar"
import { ConversationInbox } from "@/components/conversations/inbox"
import { requirePlatformAdmin } from "@/lib/auth"
import { parseDays, parseFilter, summaryJson } from "@/lib/conversations"
import { db } from "@/lib/db"
import { getAdminDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).support.title }
}

// A bot's inbox for staff, only while they hold open support access to it (support-access.ts): the
// dashboard's inbox in read-only mode, the visitor's details masked until shown (each audited).
export default async function AdminBotConversationsPage({ params, searchParams }: PageProps<"/admin/bots/[id]/conversations">) {
  const admin = await requirePlatformAdmin()
  const { id } = await params
  const query = await searchParams
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined)
  const [detail, grant] = await Promise.all([getAdminBotDetail(db(), id), activeSupportAccess(db(), admin.user.id, id)])
  if (!detail) notFound()
  const t = getAdminDictionary(await requestLocale()).support

  if (!grant) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-start gap-3 px-6 py-16 max-sm:px-4">
        <h1 className="m-0 text-xl font-semibold">{t.title}</h1>
        <p className="m-0 text-sm text-[var(--color-muted)]">{t.noAccess}</p>
        <Link href={`/admin/bots/${id}`} className="text-sm font-semibold">
          {t.backToBot}
        </Link>
      </div>
    )
  }

  const filter = parseFilter(one(query.filter))
  const days = parseDays(one(query.days))
  const page = await supportListConversations(db(), admin.user.id, id, { filter, days })
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SupportAccessBar botId={id} botName={detail.bot.name} expiresAt={grant.expiresAt.toISOString()} ticketRef={grant.ticketRef} />
      <div className="min-h-0 flex-1">
        <ConversationInbox initial={page.conversations.map(summaryJson)} hasMore={page.hasMore} filter={filter} days={days} canEdit={false} support={{ botId: id }} />
      </div>
    </div>
  )
}
