"use client"

import { MailPlus, Trash2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import type { AdminWaitlistRow } from "@apex/db"
import { useAppI18n } from "@/components/i18n/app-provider"
import { plural } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { DataTable, type DataTableColumn } from "./data-table"
import { ConfirmDialog, button, dangerButton, fill, postJson, tag, When, type Jsonify } from "./detail-ui"
import type { TableQuery } from "./table-query"

// Dates arrive as ISO strings from /api/admin/waitlist
type WaitlistJson = Jsonify<AdminWaitlistRow>

const LOCALES = ["en", "tr", "lt", "lv", "et"] as const

export function WaitlistTable({ initialQuery, canInvite }: { initialQuery: TableQuery; canInvite: boolean }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.waitlist
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<"invite" | "delete" | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const router = useRouter()

  const columns: DataTableColumn<WaitlistJson>[] = [
    { key: "email", header: t.columns.email, sortKey: "email", cell: (r) => <span className="font-medium">{r.email}</span> },
    { key: "locale", header: t.columns.locale, cell: (r) => t.locales[r.locale as (typeof LOCALES)[number]] ?? r.locale },
    { key: "joined", header: t.columns.joined, sortKey: "created", firstDir: "desc", cell: (r) => <When at={r.created_at} locale={locale} /> },
    {
      key: "invited",
      header: t.columns.invited,
      sortKey: "invited",
      firstDir: "desc",
      className: "whitespace-nowrap",
      cell: (r) =>
        r.invited_at ? (
          <span className="flex flex-col">
            <When at={r.invited_at} locale={locale} />
            <span className="text-xs text-[var(--color-muted)]">{plural(r.invite_count, t.timesInvited, locale)}</span>
          </span>
        ) : (
          <span className="text-[var(--color-muted)]">{t.notInvited}</span>
        ),
    },
    {
      key: "status",
      header: t.columns.status,
      cell: (r) =>
        r.signed_up ? (
          <span className={cn(tag, "bg-green-500/15 text-green-800 dark:text-green-200")}>{t.signedUp}</span>
        ) : (
          <span className={cn(tag, "bg-[var(--color-bubble)] text-[var(--color-muted)]")}>{t.waiting}</span>
        ),
    },
  ]

  const n = selected.size
  const ids = [...selected]
  const actions = n ? (
    <>
      <span className="text-sm text-[var(--color-muted)]">{plural(n, t.selected, locale)}</span>
      <button type="button" onClick={() => setSelected(new Set())} className={button}>
        <X className="h-4 w-4" aria-hidden />
        {t.clear}
      </button>
      <button type="button" onClick={() => setOpen("invite")} disabled={!canInvite} className={button}>
        <MailPlus className="h-4 w-4" aria-hidden />
        {t.invite}
      </button>
      <button type="button" onClick={() => setOpen("delete")} className={cn(button, dangerButton)}>
        <Trash2 className="h-4 w-4" aria-hidden />
        {t.delete}
      </button>
    </>
  ) : undefined

  const done = (message: string) => {
    setOpen(null)
    setSelected(new Set())
    setNotice(message)
    setReloadKey((k) => k + 1)
    // the counts above the list come from the server
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      {notice && (
        <p role="status" className="m-0 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-800 dark:text-green-200">
          {notice}
        </p>
      )}
      <DataTable<WaitlistJson>
        endpoint="/api/admin/waitlist"
        label={t.title}
        columns={columns}
        rowKey={(r) => r.id}
        defaultSort={{ key: "created", dir: "desc" }}
        initialQuery={initialQuery}
        searchPlaceholder={t.search}
        selection={{ selected, onChange: setSelected }}
        actions={actions}
        reloadKey={reloadKey}
        filters={[
          { key: "invited", label: t.filters.invited, options: (["yes", "no"] as const).map((v) => ({ value: v, label: t.invitedValues[v] })) },
          { key: "signed_up", label: t.filters.signedUp, options: (["yes", "no"] as const).map((v) => ({ value: v, label: t.signedUpValues[v] })) },
          { key: "locale", label: t.filters.locale, options: LOCALES.map((v) => ({ value: v, label: t.locales[v] })) },
        ]}
        inputs={[{ key: "since", label: t.filters.since, type: "date" }]}
      />

      {open === "invite" && (
        <ConfirmDialog
          title={plural(n, t.inviteTitle, locale)}
          text={t.inviteText}
          stepUp={false}
          submit={(reason) => postJson("/api/admin/waitlist/invite", { ids, reason })}
          onClose={() => setOpen(null)}
          onDone={(data) => {
            const r = data as { invited: number; skipped: number }
            done(fill(t.invitedDone, { invited: r.invited, skipped: r.skipped }))
          }}
        />
      )}
      {open === "delete" && (
        <ConfirmDialog
          title={plural(n, t.deleteTitle, locale)}
          text={t.deleteText}
          danger
          stepUp
          submit={(reason) => postJson("/api/admin/waitlist/delete", { ids, reason })}
          onClose={() => setOpen(null)}
          onDone={(data) => done(plural((data as { deleted: number }).deleted, t.deletedDone, locale))}
        />
      )}
    </div>
  )
}
