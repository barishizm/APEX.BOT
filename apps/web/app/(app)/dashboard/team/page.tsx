import type { Metadata } from "next"
import { getTeam } from "@apex/db"
import { DashboardFrame } from "@/components/dashboard/frame"
import { TeamManager } from "@/components/team/manager"
import { requireVerifiedUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAppDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).team.title }
}

export default async function TeamPage() {
  const user = await requireVerifiedUser()
  const team = await getTeam(db(), user.id)
  return (
    <DashboardFrame active="Team">
      {/* a JSON round trip turns the dates into the strings the client gets from /api/team */}
      <TeamManager initial={JSON.parse(JSON.stringify(team))} me={user.id} />
    </DashboardFrame>
  )
}
