import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { activeSupportAccess, getAdminBotDetail } from "@apex/db"
import { BotDetail, type BotDetailJson } from "@/components/admin/bot-detail"
import { requirePlatformAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAdminDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).bots.detail.title }
}

export default async function AdminBotPage({ params, searchParams }: PageProps<"/admin/bots/[id]">) {
  const admin = await requirePlatformAdmin()
  const { id } = await params
  const [detail, grant] = await Promise.all([getAdminBotDetail(db(), id), activeSupportAccess(db(), admin.user.id, id)])
  if (!detail) notFound()
  // from a support ticket's "Open support access": the dialog opens with its number filled in
  const ticket = (await searchParams).supportTicket
  const supportTicket = typeof ticket === "string" ? ticket.slice(0, 100) : null
  // Dates become ISO strings, as the client would get them from an API
  const json = JSON.parse(JSON.stringify(detail)) as BotDetailJson
  return <BotDetail detail={json} support={grant && { expiresAt: grant.expiresAt.toISOString(), ticketRef: grant.ticketRef }} supportTicket={supportTicket} />
}
