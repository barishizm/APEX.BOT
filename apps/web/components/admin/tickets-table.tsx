"use client"

import type { AdminTicketRow, TicketCategory, TicketPriority, TicketStatus } from "@apex/db"
import { useAppI18n } from "@/components/i18n/app-provider"
import { STATUS_TONE } from "@/components/support/status-badge"
import { formatDate, timeAgo } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { DataTable, type DataTableColumn } from "./data-table"
import type { Jsonify } from "./detail-ui"
import type { TableQuery } from "./table-query"

// Dates arrive as ISO strings from /api/admin/support
type TicketJson = Jsonify<AdminTicketRow>

// support-tickets.ts's lists; @apex/db itself stays out of the browser bundle
export const TICKET_STATUSES: TicketStatus[] = ["open", "pending_user", "in_progress", "resolved", "closed"]
export const TICKET_PRIORITIES: TicketPriority[] = ["low", "normal", "high", "urgent"]
const TICKET_CATEGORIES: TicketCategory[] = ["bug", "billing", "knowledge", "widget", "account", "other"]

const tag = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"

export const PRIORITY_TONE: Record<TicketPriority, string> = {
  low: "bg-[var(--color-bubble)] text-[var(--color-muted)]",
  normal: "bg-[var(--color-bubble)] text-[var(--color-text)]",
  high: "bg-[var(--color-warning)]/15 text-[var(--color-warning)]",
  urgent: "bg-[var(--color-danger)]/15 text-[var(--color-danger)]",
}

export function TicketsTable({ initialQuery, adminId, staff }: { initialQuery: TableQuery; adminId: string; staff: { id: string; name: string }[] }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.tickets
  const now = Date.now()

  const columns: DataTableColumn<TicketJson>[] = [
    {
      key: "ticket",
      header: t.columns.ticket,
      sortKey: "number",
      firstDir: "desc",
      cell: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">
            <span className="mr-1.5 font-mono text-xs font-normal text-[var(--color-muted)]">#{r.number}</span>
            {r.subject}
          </span>
          <span className="truncate text-xs text-[var(--color-muted)]">{t.categories[r.category]}</span>
        </span>
      ),
    },
    {
      key: "customer",
      header: t.columns.customer,
      cell: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{r.user_email ?? <span className="text-[var(--color-muted)]">{t.deletedAccount}</span>}</span>
          <span className="truncate text-xs text-[var(--color-muted)]">
            {r.organization_name}
            {r.bot_name && ` · ${r.bot_name}`}
          </span>
        </span>
      ),
    },
    { key: "status", header: t.columns.status, cell: (r) => <span className={cn(tag, "whitespace-nowrap", STATUS_TONE[r.status])}>{t.statuses[r.status]}</span> },
    { key: "priority", header: t.columns.priority, sortKey: "priority", firstDir: "desc", cell: (r) => <span className={cn(tag, PRIORITY_TONE[r.priority])}>{t.priorities[r.priority]}</span> },
    {
      key: "assignee",
      header: t.columns.assignee,
      className: "whitespace-nowrap",
      cell: (r) =>
        r.assignee_id ? (r.assignee_id === adminId ? <span className="font-medium">{t.me}</span> : r.assignee_name) : <span className="text-[var(--color-muted)]">{t.unassigned}</span>,
    },
    {
      key: "sla",
      header: t.columns.sla,
      sortKey: "sla",
      className: "whitespace-nowrap",
      cell: (r) =>
        r.sla_due_at ? (
          <time
            dateTime={r.sla_due_at}
            title={formatDate(r.sla_due_at, locale, { dateStyle: "medium", timeStyle: "short" })}
            className={cn(new Date(r.sla_due_at).getTime() < now && "font-semibold text-[var(--color-danger)]")}
          >
            {timeAgo(r.sla_due_at, locale, now)}
          </time>
        ) : (
          <span className="text-[var(--color-muted)]">—</span>
        ),
    },
    {
      key: "updated",
      header: t.columns.updated,
      sortKey: "updated",
      firstDir: "desc",
      className: "whitespace-nowrap",
      cell: (r) => (
        <time dateTime={r.updated_at} title={formatDate(r.updated_at, locale, { dateStyle: "medium", timeStyle: "short" })}>
          {timeAgo(r.updated_at, locale, now)}
        </time>
      ),
    },
  ]

  return (
    <DataTable<TicketJson>
      endpoint="/api/admin/support"
      label={t.title}
      columns={columns}
      rowKey={(r) => r.id}
      rowHref={(r) => `/admin/support/${r.id}`}
      defaultSort={{ key: "updated", dir: "desc" }}
      initialQuery={initialQuery}
      searchPlaceholder={t.search}
      filters={[
        { key: "status", label: t.filters.status, options: (["active", ...TICKET_STATUSES] as (TicketStatus | "active")[]).map((v) => ({ value: v, label: t.statuses[v] })) },
        { key: "priority", label: t.filters.priority, options: TICKET_PRIORITIES.map((v) => ({ value: v, label: t.priorities[v] })) },
        { key: "category", label: t.filters.category, options: TICKET_CATEGORIES.map((v) => ({ value: v, label: t.categories[v] })) },
        {
          key: "assignee",
          label: t.filters.assignee,
          options: [{ value: adminId, label: t.me }, ...staff.filter((s) => s.id !== adminId).map((s) => ({ value: s.id, label: s.name }))],
        },
        { key: "assigned", label: t.filters.assigned, options: (["yes", "no"] as const).map((v) => ({ value: v, label: t.assigned[v] })) },
        { key: "sla", label: t.filters.sla, options: (["overdue", "soon"] as const).map((v) => ({ value: v, label: t.sla[v] })) },
      ]}
    />
  )
}
