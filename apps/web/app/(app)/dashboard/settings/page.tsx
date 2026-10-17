import type { Metadata } from "next"
import { getAccount } from "@apex/db"
import { DashboardFrame } from "@/components/dashboard/frame"
import { AccountSettings } from "@/components/settings/account-settings"
import { currentSession, redirectLoggedOut } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAppDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).settings.title }
}

export default async function SettingsPage() {
  const session = await currentSession()
  if (!session) return redirectLoggedOut()
  const account = await getAccount(db(), session.user.id, session.sessionId)
  return (
    <DashboardFrame active="Settings">
      <AccountSettings
        initial={{
          username: account.user.username,
          displayName: account.user.displayName ?? "",
          email: account.user.email,
          accountType: account.user.accountType,
          createdAt: account.user.createdAt.toISOString(),
          hasPassword: account.hasPassword,
          providers: account.providers,
          otherSessions: account.otherSessions,
          allowTraining: account.allowTraining,
          twoFactor: account.user.twoFactor,
          recoveryCodesLeft: account.recoveryCodesLeft,
        }}
      />
    </DashboardFrame>
  )
}
