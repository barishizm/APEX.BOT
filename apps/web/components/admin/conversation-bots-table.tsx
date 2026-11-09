"use client"

import type { AdminConversationBotRow } from "@apex/db"
import { useAppI18n } from "@/components/i18n/app-provider"
import { formatDate, formatNumber, formatPercent, timeAgo } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { DataTable, type DataTableColumn } from "./data-table"
import { fill, tag } from "./detail-ui"
import type { TableQuery } from "./table-query"

// The per-bot table on /admin/conversations: every bot's conversation numbers over the page's
// time range, from /api/admin/conversations. Counts only; a row opens the bot's admin page.

type BotJson = Omit<AdminConversationBotRow, "last_at"> & { last_at: string | null }

const STATUS_TONE = {
  disabled: "bg-[var(--color-danger)]/15 text-[var(--color-danger)]",
  suspended: "bg-[var(--color-warning)]/15 text-[var(--color-warning)]",
} as const

export function ConversationBotsTable({ days, initialQuery }: { days: number; initialQuery: TableQuery }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.conversations.bots
  const num = (n: number) => formatNumber(n, locale)
  const muted = (text: string) => <span className="text-[var(--color-muted)]">{text}</span>

  const columns: DataTableColumn<BotJson>[] = [
    {
      key: "bot",
      header: t.columns.bot,
      sortKey: "name",
      className: "max-w-64",
      cell: (b) => (
        <span className="flex min-w-0 flex-col items-start">
          <span className="max-w-full truncate font-medium">{b.name}</span>
          <span className="max-w-full truncate text-xs text-[var(--color-muted)]">{b.organization_name}</span>
          {b.status !== "serving" && <span className={cn(tag, "mt-1", STATUS_TONE[b.status])}>{t.statuses[b.status]}</span>}
        </span>
      ),
    },
    {
      key: "conversations",
      header: t.columns.conversations,
      sortKey: "conversations",
      firstDir: "desc",
      className: "text-right tabular-nums",
      cell: (b) => (b.conversations ? num(b.conversations) : muted("0")),
    },
    { key: "messages", header: t.columns.messages, sortKey: "messages", firstDir: "desc", className: "text-right tabular-nums", cell: (b) => num(b.messages) },
    {
      key: "unanswered",
      header: t.columns.unanswered,
      sortKey: "unanswered",
      firstDir: "desc",
      className: "text-right tabular-nums whitespace-nowrap",
      cell: (b) =>
        b.answers === 0 ? (
          muted(t.noReplies)
        ) : (
          <span className="flex flex-col items-end gap-0.5">
            <span className={cn("font-medium", b.needs_knowledge && "text-[var(--color-warning)]")}>{formatPercent(b.unanswered / b.answers, locale)}</span>
            <span className="text-xs text-[var(--color-muted)]">
              {fill(t.unansweredDetail, { n: num(b.unanswered), answers: num(b.answers) })}
              {b.open_questions > 0 && ` · ${fill(t.openDetail, { n: num(b.open_questions) })}`}
            </span>
            {b.needs_knowledge && <span className={cn(tag, "bg-[var(--color-warning)]/15 text-[var(--color-warning)]")}>{t.needsKnowledge}</span>}
          </span>
        ),
    },
    {
      key: "feedback",
      header: t.columns.feedback,
      sortKey: "negative",
      firstDir: "desc",
      className: "text-right tabular-nums whitespace-nowrap",
      cell: (b) =>
        b.negative + b.positive === 0 ? (
          muted(t.none)
        ) : (
          <span className="flex flex-col items-end gap-0.5">
            <span className="font-medium">{formatPercent(b.negative / (b.negative + b.positive), locale)}</span>
            <span className="text-xs text-[var(--color-muted)]">{fill(t.feedbackDetail, { down: num(b.negative), rated: num(b.negative + b.positive) })}</span>
          </span>
        ),
    },
    { key: "handoffs", header: t.columns.handoffs, sortKey: "handoffs", firstDir: "desc", className: "text-right tabular-nums", cell: (b) => num(b.handoffs) },
    { key: "leads", header: t.columns.leads, className: "text-right tabular-nums", cell: (b) => num(b.leads) },
    {
      key: "last",
      header: t.columns.last,
      sortKey: "last",
      firstDir: "desc",
      className: "whitespace-nowrap",
      cell: (b) =>
        b.last_at ? (
          <time dateTime={b.last_at} title={formatDate(b.last_at, locale, { dateStyle: "medium", timeStyle: "short" })}>
            {timeAgo(b.last_at, locale)}
          </time>
        ) : (
          muted("—")
        ),
    },
  ]

  return (
    <DataTable<BotJson>
      endpoint="/api/admin/conversations"
      params={days === 30 ? undefined : { days: String(days) }}
      label={t.title}
      columns={columns}
      rowKey={(b) => b.id}
      rowHref={(b) => `/admin/bots/${b.id}`}
      defaultSort={{ key: "conversations", dir: "desc" }}
      initialQuery={initialQuery}
      searchPlaceholder={t.search}
      filters={[
        { key: "status", label: t.filters.status, options: (["serving", "disabled", "suspended"] as const).map((v) => ({ value: v, label: t.statuses[v] })) },
        { key: "activity", label: t.filters.activity, options: (["active", "quiet"] as const).map((v) => ({ value: v, label: t.activity[v] })) },
        { key: "unanswered", label: t.filters.unanswered, options: (["high", "any"] as const).map((v) => ({ value: v, label: t.unanswered[v] })) },
        { key: "open", label: t.filters.open, options: [{ value: "yes", label: t.yes }] },
        { key: "negative", label: t.filters.negative, options: [{ value: "yes", label: t.yes }] },
        { key: "handoff", label: t.filters.handoff, options: [{ value: "yes", label: t.yes }] },
      ]}
    />
  )
}
