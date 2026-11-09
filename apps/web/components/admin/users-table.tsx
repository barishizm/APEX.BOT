"use client"

import type { AdminUserRow } from "@apex/db"
import { useAppI18n } from "@/components/i18n/app-provider"
import { formatDate, formatNumber, timeAgo } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { DataTable, type DataTableColumn } from "./data-table"
import type { TableQuery } from "./table-query"

// Dates arrive as ISO strings from /api/admin/users
type UserJson = Omit<AdminUserRow, "suspended_at" | "last_login_at" | "created_at"> & {
  suspended_at: string | null
  last_login_at: string | null
  created_at: string
}

const tag = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"

export function UsersTable({ initialQuery }: { initialQuery: TableQuery }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.users

  const columns: DataTableColumn<UserJson>[] = [
    {
      key: "user",
      header: t.columns.user,
      sortKey: "email",
      cell: (u) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{u.display_name ?? u.username}</span>
          <span className="truncate text-xs text-[var(--color-muted)]">{u.email}</span>
        </span>
      ),
    },
    {
      key: "role",
      header: t.columns.role,
      cell: (u) =>
        u.platform_role ? (
          <span className={`${tag} bg-[var(--color-bubble)] text-[var(--color-text)]`}>{t.roles[u.platform_role]}</span>
        ) : (
          <span className="text-[var(--color-muted)]">{t.roles.none}</span>
        ),
    },
    {
      key: "status",
      header: t.columns.status,
      cell: (u) => {
        const status = u.suspended_at ? "suspended" : u.email_verified ? "active" : "unverified"
        return (
          <span
            className={cn(
              tag,
              status === "active" && "bg-[var(--color-success)]/15 text-[var(--color-success)]",
              status === "unverified" && "bg-[var(--color-bubble)] text-[var(--color-muted)]",
              status === "suspended" && "bg-[var(--color-danger)]/15 text-[var(--color-danger)]",
            )}
          >
            {t.statuses[status]}
          </span>
        )
      },
    },
    { key: "twoFactor", header: t.columns.twoFactor, cell: (u) => (u.two_factor ? t.twoFactor.on : <span className="text-[var(--color-muted)]">{t.twoFactor.off}</span>) },
    { key: "workspaces", header: t.columns.workspaces, className: "text-right tabular-nums", cell: (u) => formatNumber(u.workspaces, locale) },
    {
      key: "lastLogin",
      header: t.columns.lastLogin,
      sortKey: "lastLogin",
      firstDir: "desc",
      className: "whitespace-nowrap",
      cell: (u) => (u.last_login_at ? <time dateTime={u.last_login_at} title={formatDate(u.last_login_at, locale, { dateStyle: "medium", timeStyle: "short" })}>{timeAgo(u.last_login_at, locale)}</time> : <span className="text-[var(--color-muted)]">{t.never}</span>),
    },
    {
      key: "created",
      header: t.columns.created,
      sortKey: "created",
      firstDir: "desc",
      className: "whitespace-nowrap",
      cell: (u) => <time dateTime={u.created_at}>{formatDate(u.created_at, locale)}</time>,
    },
  ]

  return (
    <DataTable<UserJson>
      endpoint="/api/admin/users"
      label={t.title}
      columns={columns}
      rowKey={(u) => u.id}
      rowHref={(u) => `/admin/users/${u.id}`}
      defaultSort={{ key: "created", dir: "desc" }}
      initialQuery={initialQuery}
      searchPlaceholder={t.search}
      filters={[
        { key: "role", label: t.filters.role, options: (["staff", "superadmin", "support", "none"] as const).map((v) => ({ value: v, label: t.roles[v] })) },
        { key: "verified", label: t.filters.verified, options: (["yes", "no"] as const).map((v) => ({ value: v, label: t.verified[v] })) },
        { key: "twoFactor", label: t.filters.twoFactor, options: (["on", "off"] as const).map((v) => ({ value: v, label: t.twoFactor[v] })) },
        { key: "suspended", label: t.filters.suspended, options: (["yes", "no"] as const).map((v) => ({ value: v, label: t.suspended[v] })) },
        { key: "provider", label: t.filters.provider, options: (["google", "github", "none"] as const).map((v) => ({ value: v, label: t.providers[v] })) },
        { key: "accountType", label: t.filters.accountType, options: (["personal", "business"] as const).map((v) => ({ value: v, label: t.accountTypes[v] })) },
        { key: "created", label: t.filters.created, options: (["7d", "30d", "90d", "365d", "older"] as const).map((v) => ({ value: v, label: t.created[v] })) },
      ]}
    />
  )
}
