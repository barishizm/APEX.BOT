"use client"

import type { AuthEventName, AuthEventRow } from "@apex/db"
import Link from "next/link"
import { useAppI18n } from "@/components/i18n/app-provider"
import { formatDate, timeAgo } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { DataTable, type DataTableColumn } from "./data-table"
import type { TableQuery } from "./table-query"

// The auth_events feed on /admin/security; /api/admin/security/events serves it, with the device
// (browser and system) read from the user agent
type EventJson = Omit<AuthEventRow, "created_at"> & { created_at: string; device: string | null }

const tag = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
const FAILED = new Set<string>(["login_failed", "two_factor_failed", "verify_failed", "reset_failed"])

export function SecurityEventsTable({ initialQuery, events }: { initialQuery: TableQuery; events: readonly AuthEventName[] }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.security.feed
  const labels = app.admin!.users.detail.events

  const columns: DataTableColumn<EventJson>[] = [
    {
      key: "event",
      header: t.columns.event,
      cell: (e) => (
        <span
          className={cn(
            tag,
            e.event === "access_blocked"
              ? "bg-red-500/15 text-red-700 dark:text-red-300"
              : FAILED.has(e.event)
                ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                : "bg-[var(--color-raised)] text-[var(--color-muted)]",
          )}
        >
          {labels[e.event] ?? e.event}
        </span>
      ),
    },
    {
      key: "account",
      header: t.columns.account,
      className: "max-w-64",
      cell: (e) =>
        e.email ? (
          <span className="flex min-w-0 flex-col">
            <Link href={`?${new URLSearchParams({ email: e.email })}#events`} className="truncate text-[var(--color-text)] no-underline hover:underline">
              {e.email}
            </Link>
            {e.user_id && (
              <Link href={`/admin/users/${e.user_id}`} className="text-xs text-[var(--color-muted)] hover:underline">
                {app.admin!.security.actions.account}
              </Link>
            )}
          </span>
        ) : (
          <span className="text-[var(--color-muted)]">—</span>
        ),
    },
    {
      key: "ip",
      header: t.columns.ip,
      className: "whitespace-nowrap",
      cell: (e) =>
        e.ip ? (
          <span className="flex flex-col">
            <Link href={`?${new URLSearchParams({ ip: e.ip })}#events`} className="font-mono text-xs text-[var(--color-text)] no-underline hover:underline">
              {e.ip}
            </Link>
            {e.country && <span className="text-xs text-[var(--color-muted)]">{e.country}</span>}
          </span>
        ) : (
          <span className="text-[var(--color-muted)]">—</span>
        ),
    },
    {
      key: "device",
      header: t.columns.device,
      className: "max-w-48",
      cell: (e) => (
        <span className="block truncate text-xs" title={e.user_agent ?? undefined}>
          {e.device ?? "—"}
        </span>
      ),
    },
    {
      key: "when",
      header: t.columns.when,
      sortKey: "created",
      firstDir: "desc",
      className: "whitespace-nowrap",
      cell: (e) => (
        <time dateTime={e.created_at} title={timeAgo(e.created_at, locale)}>
          {formatDate(e.created_at, locale, { dateStyle: "medium", timeStyle: "medium" })}
        </time>
      ),
    },
  ]

  return (
    <DataTable<EventJson>
      endpoint="/api/admin/security/events"
      label={t.title}
      columns={columns}
      rowKey={(e) => e.id}
      defaultSort={{ key: "created", dir: "desc" }}
      initialQuery={initialQuery}
      searchPlaceholder={t.search}
      filters={[
        {
          key: "event",
          label: t.filters.event,
          options: [{ value: "failures", label: t.failures }, ...events.map((e) => ({ value: e, label: labels[e] ?? e }))],
        },
        { key: "created", label: t.filters.created, options: (["1h", "24h", "7d", "30d", "90d"] as const).map((v) => ({ value: v, label: t.created[v] })) },
      ]}
      inputs={[
        { key: "ip", label: t.filters.ip, type: "text", placeholder: t.ipPlaceholder },
        { key: "email", label: t.filters.email, type: "text", placeholder: t.emailPlaceholder },
        { key: "from", label: t.filters.from, type: "date" },
        { key: "to", label: t.filters.to, type: "date" },
      ]}
    />
  )
}
