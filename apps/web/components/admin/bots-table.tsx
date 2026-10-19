"use client"

import type { AdminBotRow } from "@apex/db"
import { useAppI18n } from "@/components/i18n/app-provider"
import { formatDate, formatNumber, timeAgo } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { DataTable, type DataTableColumn } from "./data-table"
import type { TableQuery } from "./table-query"

// Dates arrive as ISO strings from /api/admin/bots
type BotJson = Omit<AdminBotRow, "widget_seen_at" | "created_at"> & { widget_seen_at: string | null; created_at: string }

const tag = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
const STATUS_TONE = {
  serving: "bg-green-500/15 text-green-800 dark:text-green-300",
  disabled: "bg-red-500/15 text-red-700 dark:text-red-300",
  suspended: "bg-red-500/15 text-red-700 dark:text-red-300",
} as const

export function BotsTable({ initialQuery }: { initialQuery: TableQuery }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.bots

  const columns: DataTableColumn<BotJson>[] = [
    {
      key: "bot",
      header: t.columns.bot,
      sortKey: "name",
      cell: (b) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{b.name}</span>
          <span className="truncate text-xs text-[var(--color-muted)]">{b.organization_name}</span>
        </span>
      ),
    },
    { key: "key", header: t.columns.key, cell: (b) => <code className="text-xs">…{b.site_key_tail}</code> },
    {
      key: "origins",
      header: t.columns.origins,
      className: "max-w-56",
      cell: (b) =>
        b.allowed_origins.length ? (
          <span className="block truncate text-xs" title={b.allowed_origins.join("\n")}>
            {b.allowed_origins[0]!.replace(/^https?:\/\//, "")}
            {b.allowed_origins.length > 1 && <span className="text-[var(--color-muted)]"> +{b.allowed_origins.length - 1}</span>}
          </span>
        ) : (
          <span className="text-xs text-[var(--color-muted)]">{t.noOrigins}</span>
        ),
    },
    {
      key: "model",
      header: t.columns.model,
      className: "whitespace-nowrap text-xs",
      cell: (b) => (b.model_id ? b.model_id : <span className="text-[var(--color-muted)]">{t.defaultModel}</span>),
    },
    {
      key: "seen",
      header: t.columns.seen,
      sortKey: "seen",
      firstDir: "desc",
      className: "whitespace-nowrap",
      cell: (b) =>
        b.widget_seen_at ? (
          <span className="flex flex-col">
            <time dateTime={b.widget_seen_at} title={formatDate(b.widget_seen_at, locale, { dateStyle: "medium", timeStyle: "short" })}>
              {timeAgo(b.widget_seen_at, locale)}
            </time>
            {b.widget_seen_origin && <span className="max-w-44 truncate text-xs text-[var(--color-muted)]">{b.widget_seen_origin.replace(/^https?:\/\//, "")}</span>}
          </span>
        ) : (
          <span className="text-[var(--color-muted)]">{t.never}</span>
        ),
    },
    {
      key: "tokens",
      header: t.columns.tokens,
      sortKey: "tokens",
      firstDir: "desc",
      className: "text-right tabular-nums whitespace-nowrap",
      cell: (b) => (
        <span className="flex flex-col items-end gap-0.5">
          {formatNumber(b.today_tokens, locale)}
          {b.budget_override && <span className={`${tag} bg-[var(--color-bubble)] text-[var(--color-text)]`}>{t.overrideTag}</span>}
        </span>
      ),
    },
    { key: "knowledge", header: t.columns.knowledge, className: "text-right tabular-nums", cell: (b) => formatNumber(b.knowledge_version, locale) },
    { key: "status", header: t.columns.status, cell: (b) => <span className={cn(tag, "whitespace-nowrap", STATUS_TONE[b.status])}>{t.statuses[b.status]}</span> },
  ]

  return (
    <DataTable<BotJson>
      endpoint="/api/admin/bots"
      label={t.title}
      columns={columns}
      rowKey={(b) => b.id}
      rowHref={(b) => `/admin/bots/${b.id}`}
      defaultSort={{ key: "created", dir: "desc" }}
      initialQuery={initialQuery}
      searchPlaceholder={t.search}
      filters={[
        { key: "status", label: t.filters.status, options: (["serving", "disabled", "suspended"] as const).map((v) => ({ value: v, label: t.statuses[v] })) },
        { key: "seen", label: t.filters.seen, options: (["24h", "7d", "stale", "never"] as const).map((v) => ({ value: v, label: t.seen[v] })) },
        { key: "provider", label: t.filters.provider, options: (["anthropic", "openai", "google"] as const).map((v) => ({ value: v, label: t.providers[v] })) },
        { key: "override", label: t.filters.override, options: (["yes", "no"] as const).map((v) => ({ value: v, label: t.override[v] })) },
      ]}
    />
  )
}
