import type { Metadata } from "next"
import Link from "next/link"
import { ADMIN_TICKETS_LIST, listSupportStaff, supportQueueCounts } from "@apex/db"
import { readTableQuery, tableQueryString } from "@/components/admin/table-query"
import { TicketsTable } from "@/components/admin/tickets-table"
import { listFilterKeys } from "@/lib/admin-list"
import { requirePlatformAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAdminDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"
import { formatNumber } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).tickets.title }
}

export default async function AdminSupportPage({ searchParams }: PageProps<"/admin/support">) {
  const admin = await requirePlatformAdmin()
  const locale = await requestLocale()
  const t = getAdminDictionary(locale).tickets
  const query = readTableQuery(await searchParams, listFilterKeys(ADMIN_TICKETS_LIST))
  const [counts, staff] = await Promise.all([supportQueueCounts(db()), listSupportStaff(db())])

  // the counts double as shortcuts into the queue
  const shortcuts = [
    { key: "active", n: counts.active, filters: { status: "active" }, alert: false },
    { key: "overdue", n: counts.overdue, filters: { status: "active", sla: "overdue" }, alert: counts.overdue > 0 },
    { key: "unassigned", n: counts.unassigned, filters: { status: "active", assigned: "no" }, alert: false },
  ] as const

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-[var(--color-muted)]">{t.lede}</p>
      </header>
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-3">
        {shortcuts.map((s) => (
          <li key={s.key}>
            <Link
              href={`/admin/support?${tableQueryString({ q: "", sort: null, dir: null, cursor: null, filters: s.filters })}`}
              className={cn(
                "flex flex-col gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-[var(--color-text)] no-underline transition-colors hover:border-[var(--color-muted)]/60",
                s.alert && "border-[var(--color-danger)]/40 bg-[var(--color-danger)]/5",
              )}
            >
              <span className="text-sm text-[var(--color-muted)]">{t.counts[s.key]}</span>
              <span className={cn("text-2xl font-semibold tabular-nums", s.alert && "text-[var(--color-danger)]")}>{formatNumber(s.n, locale)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {/* a shortcut changes the URL; the key starts the table over from it */}
      <TicketsTable key={tableQueryString(query)} initialQuery={query} adminId={admin.user.id} staff={staff.map((s) => ({ id: s.id, name: s.name }))} />
    </div>
  )
}
