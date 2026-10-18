import type { Metadata } from "next"
import { announcementWorkspaces, listAnnouncements } from "@apex/db"
import { AnnouncementsManager, type AnnouncementJson } from "@/components/admin/announcements-manager"
import { requirePlatformAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAdminDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).announcements.title }
}

export default async function AdminAnnouncementsPage() {
  const admin = await requirePlatformAdmin()
  const t = getAdminDictionary(await requestLocale()).announcements
  const list = await listAnnouncements(db())
  const workspaces = await announcementWorkspaces(db(), list)
  // Dates become ISO strings, as the client would get them from an API
  const announcements = JSON.parse(JSON.stringify(list)) as AnnouncementJson[]
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-[var(--color-muted)]">{t.lede}</p>
      </header>
      <AnnouncementsManager announcements={announcements} workspaces={workspaces} canEdit={admin.user.platformRole === "superadmin"} />
    </div>
  )
}
