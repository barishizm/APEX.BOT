import type { Metadata } from "next"
import { settingsOverview } from "@apex/db"
import { SettingsPanel, type SettingsJson } from "@/components/admin/settings-panel"
import { requirePlatformAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAdminDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"
import { DEFAULT_SIGNUPS_MODE } from "@/lib/signups"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).settings.title }
}

// read uncached, so the page shows a change the moment it is made
export default async function AdminSettingsPage() {
  const admin = await requirePlatformAdmin()
  const t = getAdminDictionary(await requestLocale()).settings
  // Dates become ISO strings, as the client would get them from an API
  const settings = JSON.parse(JSON.stringify(await settingsOverview(db()))) as SettingsJson
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-[var(--color-muted)]">{t.lede}</p>
      </header>
      <SettingsPanel settings={settings} defaultMode={DEFAULT_SIGNUPS_MODE} canEdit={admin.user.platformRole === "superadmin"} />
    </div>
  )
}
