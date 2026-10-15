import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getAccount } from "@apex/db"
import { DashboardFrame } from "@/components/dashboard/frame"
import { AccountSettings } from "@/components/settings/account-settings"
import { currentSession } from "@/lib/auth"
import { db } from "@/lib/db"

export const metadata: Metadata = { title: "Account settings" }

export default async function SettingsPage() {
  const session = await currentSession()
  if (!session) redirect("/?login=1")
  const account = await getAccount(db(), session.user.id, session.sessionId)
  return (
    <DashboardFrame active="Settings">
      <AccountSettings
        initial={{
          username: account.user.username,
          email: account.user.email,
          accountType: account.user.accountType,
          createdAt: account.user.createdAt.toISOString(),
          hasPassword: account.hasPassword,
          providers: account.providers,
          otherSessions: account.otherSessions,
          allowTraining: account.allowTraining,
        }}
      />
    </DashboardFrame>
  )
}
