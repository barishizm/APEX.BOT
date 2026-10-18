import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAdminTicket } from "@apex/db"
import { TicketDetail, type AdminTicketJson } from "@/components/admin/ticket-detail"
import { requirePlatformAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAdminDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).tickets.title }
}

export default async function AdminTicketPage({ params }: PageProps<"/admin/support/[id]">) {
  const admin = await requirePlatformAdmin()
  const detail = await getAdminTicket(db(), (await params).id)
  if (!detail) notFound()
  // Dates become ISO strings, as the client would get them from an API
  const json = JSON.parse(JSON.stringify(detail)) as AdminTicketJson
  return <TicketDetail detail={json} adminId={admin.user.id} />
}
