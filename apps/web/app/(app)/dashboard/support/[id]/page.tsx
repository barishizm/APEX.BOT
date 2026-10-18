import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getUserTicket } from "@apex/db"
import { DashboardFrame } from "@/components/dashboard/frame"
import { TicketThread, type UserTicketJson } from "@/components/support/ticket-thread"
import { requireVerifiedUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAppDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).support.title }
}

export default async function SupportTicketPage({ params }: PageProps<"/dashboard/support/[id]">) {
  const user = await requireVerifiedUser()
  // only the person who filed it; anyone else gets the same 404 as a ticket that doesn't exist
  const ticket = await getUserTicket(db(), user.id, (await params).id)
  if (!ticket) notFound()
  return (
    <DashboardFrame active="Support">
      <TicketThread data={JSON.parse(JSON.stringify(ticket)) as UserTicketJson} />
    </DashboardFrame>
  )
}
