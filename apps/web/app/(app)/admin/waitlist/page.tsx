import type { Metadata } from "next"
import Link from "next/link"
import { ADMIN_WAITLIST_LIST, waitlistCounts } from "@apex/db"
import { readTableQuery } from "@/components/admin/table-query"
import { WaitlistTable } from "@/components/admin/waitlist-table"
import { listFilterKeys } from "@/lib/admin-list"
import { requirePlatformAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAdminDictionary } from "@/lib/i18n/app"
import { formatNumber } from "@/lib/i18n/format"
import { requestLocale } from "@/lib/i18n/server"
import { currentSignupsMode } from "@/lib/signups"
import { cn } from "@/lib/utils"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).waitlist.title }
}

export default async function AdminWaitlistPage({ searchParams }: PageProps<"/admin/waitlist">) {
  await requirePlatformAdmin()
  const locale = await requestLocale()
  const t = getAdminDictionary(locale).waitlist
  const query = readTableQuery(await searchParams, listFilterKeys(ADMIN_WAITLIST_LIST))
  const [counts, mode] = await Promise.all([waitlistCounts(db()), currentSignupsMode()])

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-[var(--color-muted)]">{t.lede}</p>
      </header>
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-3">
        {(["total", "invited", "signedUp"] as const).map((key) => (
          <li key={key} className="flex flex-col gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
            <span className="text-sm text-[var(--color-muted)]">{t.counts[key]}</span>
            <span className="text-2xl font-semibold tabular-nums">{formatNumber(counts[key], locale)}</span>
          </li>
        ))}
      </ul>
      <p
        className={cn(
          "m-0 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-sm",
          mode === "closed" ? "bg-[var(--color-warning)]/10 text-[var(--color-warning)]" : "bg-[var(--color-surface)] text-[var(--color-muted)]",
        )}
      >
        <span>{t.mode[mode]}</span>
        <Link href="/admin/settings" className="font-medium text-[var(--color-text)]">
          {t.mode.change}
        </Link>
      </p>
      <WaitlistTable initialQuery={query} canInvite={mode !== "closed"} />
    </div>
  )
}
