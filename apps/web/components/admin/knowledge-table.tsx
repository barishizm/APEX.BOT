"use client"

import type { AdminKnowledgeRow } from "@apex/db"
import { useAppI18n } from "@/components/i18n/app-provider"
import { formatDate, formatNumber, timeAgo } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { DataTable, type DataTableColumn } from "./data-table"
import type { TableQuery } from "./table-query"

// Dates arrive as ISO strings from /api/admin/knowledge
type SourceJson = Omit<AdminKnowledgeRow, "synced_at" | "updated_at" | "created_at"> & { synced_at: string | null; updated_at: string; created_at: string }

const tag = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
export const SOURCE_STATUS_TONE = {
  pending: "bg-[var(--color-raised)] text-[var(--color-muted)]",
  syncing: "bg-[var(--color-bubble)] text-[var(--color-text)]",
  stuck: "bg-[var(--color-warning)]/15 text-[var(--color-warning)]",
  ready: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
  failed: "bg-[var(--color-danger)]/15 text-[var(--color-danger)]",
} as const

export function KnowledgeTable({ initialQuery }: { initialQuery: TableQuery }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.knowledge

  const columns: DataTableColumn<SourceJson>[] = [
    {
      key: "source",
      header: t.columns.source,
      sortKey: "title",
      className: "max-w-72",
      cell: (s) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{s.title}</span>
          <span className="truncate text-xs text-[var(--color-muted)]">
            {t.kinds[s.kind]}
            {s.url && ` · ${s.url.replace(/^https?:\/\//, "")}`}
          </span>
        </span>
      ),
    },
    {
      key: "bot",
      header: t.columns.bot,
      className: "max-w-48",
      cell: (s) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{s.bot_name}</span>
          <span className="truncate text-xs text-[var(--color-muted)]">{s.organization_name}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: t.columns.status,
      className: "max-w-64",
      cell: (s) => (
        <span className="flex min-w-0 flex-col items-start gap-1">
          <span className={cn(tag, SOURCE_STATUS_TONE[s.stuck ? "stuck" : s.status])}>{s.stuck ? t.statuses.stuck : t.statuses[s.status]}</span>
          {s.error && (
            <span className="max-w-full truncate text-xs text-[var(--color-danger)]" title={s.error}>
              {s.error}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "pages",
      header: t.columns.pages,
      sortKey: "pages",
      firstDir: "desc",
      className: "text-right tabular-nums whitespace-nowrap",
      cell: (s) =>
        s.kind === "website" ? (
          <span className="flex flex-col items-end gap-0.5">
            {formatNumber(s.pages, locale)}
            {s.at_ceiling && (
              <span className={`${tag} bg-[var(--color-warning)]/15 text-[var(--color-warning)]`} title={t.ceilingHint.replace("{plan}", formatNumber(s.plan_pages, locale))}>
                {t.ceilingTag}
              </span>
            )}
          </span>
        ) : (
          <span className="text-[var(--color-muted)]">—</span>
        ),
    },
    { key: "chunks", header: t.columns.chunks, sortKey: "chunks", firstDir: "desc", className: "text-right tabular-nums", cell: (s) => formatNumber(s.chunks, locale) },
    {
      key: "refresh",
      header: t.columns.refresh,
      className: "whitespace-nowrap text-xs",
      cell: (s) => (s.kind === "website" ? t.refresh[s.refresh] : <span className="text-[var(--color-muted)]">—</span>),
    },
    {
      key: "synced",
      header: t.columns.synced,
      sortKey: "synced",
      firstDir: "desc",
      className: "whitespace-nowrap",
      cell: (s) =>
        s.synced_at ? (
          <time dateTime={s.synced_at} title={formatDate(s.synced_at, locale, { dateStyle: "medium", timeStyle: "short" })}>
            {timeAgo(s.synced_at, locale)}
          </time>
        ) : (
          <span className="text-[var(--color-muted)]">{t.never}</span>
        ),
    },
  ]

  return (
    <DataTable<SourceJson>
      endpoint="/api/admin/knowledge"
      label={t.title}
      columns={columns}
      rowKey={(s) => s.id}
      rowHref={(s) => `/admin/knowledge/${s.id}`}
      defaultSort={{ key: "updated", dir: "desc" }}
      initialQuery={initialQuery}
      searchPlaceholder={t.search}
      filters={[
        { key: "status", label: t.filters.status, options: (["pending", "syncing", "stuck", "ready", "failed"] as const).map((v) => ({ value: v, label: t.statuses[v] })) },
        { key: "kind", label: t.filters.kind, options: (["website", "text", "file"] as const).map((v) => ({ value: v, label: t.kinds[v] })) },
        { key: "refresh", label: t.filters.refresh, options: (["off", "daily", "weekly"] as const).map((v) => ({ value: v, label: t.refresh[v] })) },
        { key: "synced", label: t.filters.synced, options: (["24h", "7d", "stale", "never"] as const).map((v) => ({ value: v, label: t.synced[v] })) },
        { key: "error", label: t.filters.error, options: (["yes", "no"] as const).map((v) => ({ value: v, label: t.error[v] })) },
        { key: "ceiling", label: t.filters.ceiling, options: [{ value: "yes", label: t.ceilingTag }] },
      ]}
    />
  )
}
