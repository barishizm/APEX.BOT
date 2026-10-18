import type { Metadata } from "next"
import { ADMIN_WORKSPACES_LIST } from "@apex/db"
import { readTableQuery } from "@/components/admin/table-query"
import { WorkspacesTable } from "@/components/admin/workspaces-table"
import { requirePlatformAdmin } from "@/lib/auth"
import { getAdminDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).workspaces.title }
}

export default async function AdminWorkspacesPage({ searchParams }: PageProps<"/admin/workspaces">) {
  await requirePlatformAdmin()
  const t = getAdminDictionary(await requestLocale()).workspaces
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-[var(--color-muted)]">{t.lede}</p>
      </header>
      <WorkspacesTable initialQuery={readTableQuery(await searchParams, Object.keys(ADMIN_WORKSPACES_LIST.filters))} />
    </div>
  )
}
