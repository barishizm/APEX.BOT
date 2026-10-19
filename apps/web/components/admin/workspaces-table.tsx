"use client"

import type { AdminWorkspaceRow } from "@apex/db"
import { useAppI18n } from "@/components/i18n/app-provider"
import { formatDate, formatNumber, timeAgo } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { DataTable, type DataTableColumn } from "./data-table"
import type { TableQuery } from "./table-query"

// Dates arrive as ISO strings from /api/admin/workspaces
type WorkspaceJson = Omit<AdminWorkspaceRow, "last_activity_at" | "suspended_at" | "created_at"> & {
  last_activity_at: string | null
  suspended_at: string | null
  created_at: string
}

const tag = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
const PLANS = ["free", "starter", "pro", "business"] as const
const SIZES = ["1-50", "51-200", "201-1000", "1000+", "none"] as const

export function WorkspacesTable({ initialQuery }: { initialQuery: TableQuery }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.workspaces

  const columns: DataTableColumn<WorkspaceJson>[] = [
    {
      key: "workspace",
      header: t.columns.workspace,
      sortKey: "name",
      cell: (w) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{w.name}</span>
          {w.owner_email && <span className="truncate text-xs text-[var(--color-muted)]">{w.owner_email}</span>}
        </span>
      ),
    },
    {
      key: "plan",
      header: t.columns.plan,
      cell: (w) => <span className={cn(tag, w.plan === "free" ? "bg-[var(--color-bubble)] text-[var(--color-muted)]" : "bg-[var(--color-text)] text-[var(--color-surface)]")}>{t.plans[w.plan]}</span>,
    },
    { key: "size", header: t.columns.size, className: "whitespace-nowrap", cell: (w) => (w.size ? t.sizes[w.size] : <span className="text-[var(--color-muted)]">—</span>) },
    { key: "members", header: t.columns.members, sortKey: "members", firstDir: "desc", className: "text-right tabular-nums", cell: (w) => formatNumber(w.members, locale) },
    { key: "bots", header: t.columns.bots, sortKey: "bots", firstDir: "desc", className: "text-right tabular-nums", cell: (w) => formatNumber(w.bots, locale) },
    {
      key: "lastActivity",
      header: t.columns.lastActivity,
      sortKey: "lastActivity",
      firstDir: "desc",
      className: "whitespace-nowrap",
      cell: (w) =>
        w.last_activity_at ? (
          <time dateTime={w.last_activity_at} title={formatDate(w.last_activity_at, locale, { dateStyle: "medium", timeStyle: "short" })}>
            {timeAgo(w.last_activity_at, locale)}
          </time>
        ) : (
          <span className="text-[var(--color-muted)]">{t.never}</span>
        ),
    },
    {
      key: "status",
      header: t.columns.status,
      cell: (w) => (
        <span className={cn(tag, w.suspended_at ? "bg-red-500/15 text-red-700 dark:text-red-300" : "bg-green-500/15 text-green-800 dark:text-green-300")}>
          {t.statuses[w.suspended_at ? "suspended" : "active"]}
        </span>
      ),
    },
    {
      key: "created",
      header: t.columns.created,
      sortKey: "created",
      firstDir: "desc",
      className: "whitespace-nowrap",
      cell: (w) => <time dateTime={w.created_at}>{formatDate(w.created_at, locale)}</time>,
    },
  ]

  return (
    <DataTable<WorkspaceJson>
      endpoint="/api/admin/workspaces"
      label={t.title}
      columns={columns}
      rowKey={(w) => w.id}
      rowHref={(w) => `/admin/workspaces/${w.id}`}
      defaultSort={{ key: "created", dir: "desc" }}
      initialQuery={initialQuery}
      searchPlaceholder={t.search}
      filters={[
        { key: "plan", label: t.filters.plan, options: PLANS.map((v) => ({ value: v, label: t.plans[v] })) },
        { key: "suspended", label: t.filters.suspended, options: (["yes", "no"] as const).map((v) => ({ value: v, label: t.suspended[v] })) },
        { key: "size", label: t.filters.size, options: SIZES.map((v) => ({ value: v, label: t.sizes[v] })) },
        { key: "created", label: t.filters.created, options: (["7d", "30d", "90d", "365d", "older"] as const).map((v) => ({ value: v, label: t.created[v] })) },
      ]}
    />
  )
}
