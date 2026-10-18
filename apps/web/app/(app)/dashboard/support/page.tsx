import type { Metadata } from "next"
import { listUserTickets } from "@apex/db"
import { DashboardFrame } from "@/components/dashboard/frame"
import { TicketList, type UserTicketRowJson } from "@/components/support/ticket-list"
import { requireVerifiedUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAppDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).support.title }
}

export default async function SupportPage() {
  const user = await requireVerifiedUser()
  const tickets = await listUserTickets(db(), user.id)
  return (
    <DashboardFrame active="Support">
      {/* a JSON round trip turns the dates into strings, as an API would */}
      <TicketList tickets={JSON.parse(JSON.stringify(tickets)) as UserTicketRowJson[]} />
    </DashboardFrame>
  )
}
