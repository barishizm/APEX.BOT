"use client"

import type { AuditRow } from "@apex/db"
import Link from "next/link"
import { useAppI18n } from "@/components/i18n/app-provider"
import { formatDate, timeAgo } from "@/lib/i18n/format"
import { DataTable, type DataTableColumn } from "./data-table"
import { targetHref } from "./audit-target"
import { fill } from "./detail-ui"
import { useAuditLabels } from "./security-overview"
import type { TableQuery } from "./table-query"

// /admin/audit's list; /api/admin/audit serves it with `changes` (the changed fields) in place of before/after
export type AuditRowJson = Omit<AuditRow, "created_at" | "before" | "after"> & { created_at: string; changes: string[] }

export interface AuditFacetsJson {
  actors: { id: string; label: string }[]
  actions: string[]
  targetTypes: string[]
}

const SHOWN_CHANGES = 3

export function AuditTable({ initialQuery, facets }: { initialQuery: TableQuery; facets: AuditFacetsJson }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.audit
  const action = useAuditLabels()
  const type = (v: string) => t.targetTypes[v] ?? v

  const columns: DataTableColumn<AuditRowJson>[] = [
    {
      key: "when",
      header: t.columns.when,
      sortKey: "created",
      firstDir: "desc",
      className: "whitespace-nowrap",
      cell: (l) => (
        <time dateTime={l.created_at} title={timeAgo(l.created_at, locale)}>
          {formatDate(l.created_at, locale, { dateStyle: "medium", timeStyle: "medium" })}
        </time>
      ),
    },
    {
      key: "actor",
      header: t.columns.actor,
      className: "max-w-52",
      cell: (l) =>
        l.actor_id ? (
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{l.actor_name ?? l.actor_email}</span>
            {l.actor_name && <span className="truncate text-xs text-[var(--color-muted)]">{l.actor_email}</span>}
          </span>
        ) : (
          <span className="text-[var(--color-muted)]">{t.system}</span>
        ),
    },
    {
      key: "action",
      header: t.columns.action,
      className: "max-w-64",
      cell: (l) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{action(l.action)}</span>
          <code className="truncate text-xs text-[var(--color-muted)]">{l.action}</code>
        </span>
      ),
    },
    {
      key: "target",
      header: t.columns.target,
      className: "max-w-60",
      cell: (l) => {
        const href = targetHref(l.target_type, l.target_id)
        const name = l.target_label ?? l.target_id
        return (
          <span className="flex min-w-0 flex-col">
            <span className="text-xs text-[var(--color-muted)]">{type(l.target_type)}</span>
            {name &&
              (href ? (
                <Link href={href} className="truncate text-[var(--color-text)] hover:underline">
                  {name}
                </Link>
              ) : (
                <span className="truncate font-mono text-xs">{name}</span>
              ))}
          </span>
        )
      },
    },
    {
      key: "reason",
      header: t.columns.reason,
      className: "max-w-72",
      cell: (l) => (
        <span className="line-clamp-2 text-sm" title={l.reason ?? undefined}>
          {l.reason ?? <span className="text-[var(--color-muted)]">—</span>}
        </span>
      ),
    },
    {
      key: "changes",
      header: t.columns.changes,
      className: "max-w-56",
      cell: (l) =>
        l.changes.length ? (
          <span className="flex flex-wrap gap-1">
            {l.changes.slice(0, SHOWN_CHANGES).map((c) => (
              <code key={c} className="rounded bg-[var(--color-raised)] px-1.5 py-0.5 text-xs">
                {c}
              </code>
            ))}
            {l.changes.length > SHOWN_CHANGES && <span className="text-xs text-[var(--color-muted)]">{fill(t.more, { n: l.changes.length - SHOWN_CHANGES })}</span>}
          </span>
        ) : (
          <span className="text-[var(--color-muted)]">—</span>
        ),
    },
  ]

  return (
    <DataTable<AuditRowJson>
      endpoint="/api/admin/audit"
      label={t.title}
      columns={columns}
      rowKey={(l) => l.id}
      rowHref={(l) => `/admin/audit/${l.id}`}
      defaultSort={{ key: "created", dir: "desc" }}
      initialQuery={initialQuery}
      searchPlaceholder={t.search}
      filters={[
        { key: "actor", label: t.filters.actor, options: facets.actors.map((a) => ({ value: a.id, label: a.label })) },
        { key: "action", label: t.filters.action, options: facets.actions.map((a) => ({ value: a, label: action(a) })) },
        { key: "targetType", label: t.filters.targetType, options: facets.targetTypes.map((v) => ({ value: v, label: type(v) })) },
        { key: "created", label: t.filters.created, options: (["24h", "7d", "30d", "90d", "365d"] as const).map((v) => ({ value: v, label: t.created[v] })) },
        { key: "actorKind", label: t.filters.actorKind, options: (["staff", "system"] as const).map((v) => ({ value: v, label: t.actorKinds[v] })) },
      ]}
      inputs={[
        { key: "target", label: t.filters.target, type: "text" },
        { key: "from", label: t.filters.from, type: "date" },
        { key: "to", label: t.filters.to, type: "date" },
      ]}
    />
  )
}
