import type { Metadata } from "next"
import { Lock } from "lucide-react"
import { ADMIN_AUDIT_LIST, auditFacets } from "@apex/db"
import { AuditTable } from "@/components/admin/audit-table"
import { readTableQuery } from "@/components/admin/table-query"
import { listFilterKeys } from "@/lib/admin-list"
import { requirePlatformAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAdminDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).audit.title }
}

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requirePlatformAdmin()
  const t = getAdminDictionary(await requestLocale()).audit
  const [facets, search] = await Promise.all([auditFacets(db()), searchParams])
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-[var(--color-muted)]">{t.lede}</p>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-[var(--color-muted)]">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          {t.immutable}
        </p>
      </header>
      <AuditTable key={JSON.stringify(search)} initialQuery={readTableQuery(search, listFilterKeys(ADMIN_AUDIT_LIST))} facets={facets} />
    </div>
  )
}
