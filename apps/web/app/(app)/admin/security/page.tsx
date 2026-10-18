import type { Metadata } from "next"
import {
  ADMIN_SECURITY_EVENTS_LIST,
  AUTH_EVENTS,
  listStaffAccounts,
  NEW_SIGNIN_LOOKBACK_DAYS,
  RESET_BURST_THRESHOLD,
  securityOverview,
} from "@apex/db"
import { SecurityEventsTable } from "@/components/admin/security-events-table"
import { SecurityOverviewPanels, type SecurityOverviewJson, type StaffAccountJson } from "@/components/admin/security-overview"
import { readTableQuery } from "@/components/admin/table-query"
import { listFilterKeys } from "@/lib/admin-list"
import { requirePlatformAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAdminDictionary } from "@/lib/i18n/app"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).security.title }
}

export default async function AdminSecurityPage({ searchParams }: PageProps<"/admin/security">) {
  await requirePlatformAdmin()
  const t = getAdminDictionary(await requestLocale()).security
  const [overview, staff] = await Promise.all([securityOverview(db()), listStaffAccounts(db())])
  const search = await searchParams
  // Dates become ISO strings, as the client would get them from an API
  const data = JSON.parse(JSON.stringify(overview)) as SecurityOverviewJson
  const staffJson = JSON.parse(JSON.stringify(staff)) as StaffAccountJson[]
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-[var(--color-muted)]">{t.lede}</p>
      </header>
      <SecurityOverviewPanels
        data={data}
        staff={staffJson}
        utcHours={overview.hourly.map((h) => h.hour.slice(11, 16))}
        limits={{ resetBurst: RESET_BURST_THRESHOLD, lookbackDays: NEW_SIGNIN_LOOKBACK_DAYS }}
      />
      <section id="events" className="flex scroll-mt-20 flex-col gap-3" aria-labelledby="security-events-title">
        <h2 id="security-events-title" className="m-0 text-lg font-semibold">
          {t.feed.title}
        </h2>
        {/* the panels link to filtered views of the feed; a new query starts the table afresh */}
        <SecurityEventsTable
          key={JSON.stringify(search)}
          initialQuery={readTableQuery(search, listFilterKeys(ADMIN_SECURITY_EVENTS_LIST))}
          events={AUTH_EVENTS}
        />
      </section>
    </div>
  )
}
