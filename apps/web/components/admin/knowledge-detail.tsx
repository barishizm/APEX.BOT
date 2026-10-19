"use client"

import type { AdminKnowledgeDetail } from "@apex/db"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { formatDate, formatNumber } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { button, ConfirmDialog, dangerButton, Empty, fill, postJson, Section, tag, When, type Jsonify } from "./detail-ui"
import { SOURCE_STATUS_TONE } from "./knowledge-table"

// /admin/knowledge/[id]: one knowledge source, its bot and plan, and what staff can do to it. Every
// action goes through POST /api/admin/knowledge/<id>/<action> with a reason and a step-up; the page
// re-renders from the server after each one (a deleted source goes back to the list).

export type KnowledgeDetailJson = Jsonify<AdminKnowledgeDetail>

type Kind = "resync" | "resetSync" | "refreshOff" | "delete"

const SPEC: Record<Kind, { path: string; danger?: boolean }> = {
  resync: { path: "resync" },
  resetSync: { path: "reset-sync" },
  refreshOff: { path: "refresh-off" },
  delete: { path: "delete", danger: true },
}

export function KnowledgeDetail({ detail }: { detail: KnowledgeDetailJson }) {
  const { t: app, locale } = useAppI18n()
  const k = app.admin!.knowledge
  const t = k.detail
  const router = useRouter()
  const s = detail.source
  const [dialog, setDialog] = useState<Kind | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const when = (at: string) => formatDate(at, locale, { dateStyle: "medium", timeStyle: "short" })
  const website = s.kind === "website"
  const running = s.status === "syncing" && !s.stuck

  const open = (kind: Kind) => {
    setNotice(null)
    setDialog(kind)
  }
  function done(kind: Kind) {
    setDialog(null)
    if (kind === "delete") return router.replace("/admin/knowledge")
    setNotice(t.done[kind])
    router.refresh()
  }

  const actions: Kind[] = [
    ...(website && !running ? (["resync"] as const) : []),
    ...(s.status === "syncing" ? (["resetSync"] as const) : []),
    ...(website && s.refresh !== "off" ? (["refreshOff"] as const) : []),
    "delete",
  ]

  const rows: [string, ReactNode][] = [
    [t.fields.id, <code key="id" className="break-all text-xs">{s.id}</code>],
    [t.fields.kind, s.managed ? `${k.kinds[s.kind]} · ${t.fields.managed}` : k.kinds[s.kind]],
    ...(s.url ? ([[t.fields.url, <a key="u" href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all">{s.url}</a>]] as [string, ReactNode][]) : []),
    [t.fields.bot, <Link key="b" href={`/admin/bots/${s.botId}`} className="font-medium">{s.botName}</Link>],
    [t.fields.workspace, <Link key="w" href={`/admin/workspaces/${s.organizationId}`}>{s.organizationName}</Link>],
    ...(website
      ? ([
          [t.fields.pages, fill(t.fields.pagesValue, { pages: formatNumber(s.pages, locale), limit: formatNumber(s.pageLimit, locale), plan: s.plan })],
          [t.fields.refresh, k.refresh[s.refresh]],
        ] as [string, ReactNode][])
      : []),
    [t.fields.chunks, s.storedChunks === s.chunks ? formatNumber(s.chunks, locale) : fill(t.fields.chunksMismatch, { chunks: formatNumber(s.chunks, locale), stored: formatNumber(s.storedChunks, locale) })],
    [t.fields.synced, s.syncedAt ? when(s.syncedAt) : k.never],
    [t.fields.updated, when(s.updatedAt)],
    [t.fields.created, `${when(s.createdAt)}${s.createdByName ? ` · ${s.createdByName}` : ""}`],
  ]

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <header className="flex flex-col gap-2">
        <Link href="/admin/knowledge" className="inline-flex w-fit items-center gap-1 text-sm text-[var(--color-muted)] no-underline hover:text-[var(--color-text)]">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t.back}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 break-words text-2xl font-semibold tracking-tight">{s.title}</h1>
          <span className={cn(tag, SOURCE_STATUS_TONE[s.stuck ? "stuck" : s.status])}>{s.stuck ? k.statuses.stuck : k.statuses[s.status]}</span>
          {s.atCeiling && <span className={`${tag} bg-amber-500/15 text-amber-800 dark:text-amber-200`}>{k.ceilingTag}</span>}
        </div>
      </header>

      {s.stuck && <p className="m-0 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">{fill(t.stuckBanner, { when: when(s.updatedAt) })}</p>}
      {s.error && (
        <p className="m-0 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <span className="font-medium">{t.errorPrefix}</span> {s.error}
        </p>
      )}
      {s.atCeiling && (
        <p className="m-0 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
          {fill(t.ceilingBanner, { pages: formatNumber(s.pages, locale), plan: formatNumber(s.planPages, locale) })}
        </p>
      )}
      {notice && (
        <p role="status" className="m-0 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-800 dark:text-green-300">
          {notice}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title={t.sections.overview}>
            <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-[var(--color-muted)]">{label}</dt>
                  <dd className="m-0 min-w-0">{value}</dd>
                </div>
              ))}
            </dl>
          </Section>
          {s.preview && (
            <Section title={t.sections.preview}>
              <p className="m-0 whitespace-pre-wrap break-words text-sm text-[var(--color-muted)]">{s.preview}…</p>
            </Section>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Section title={t.sections.actions}>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {actions.map((kind) => (
                <li key={kind}>
                  <button type="button" onClick={() => open(kind)} className={cn(button, "w-full justify-start", SPEC[kind].danger && dangerButton)}>
                    {t.actions[kind].label}
                  </button>
                </li>
              ))}
            </ul>
            {running && <p className="m-0 text-xs text-[var(--color-muted)]">{t.runningHint}</p>}
          </Section>

          <Section title={t.sections.audit} count={detail.audit.length}>
            {detail.audit.length ? (
              <ol className="m-0 flex list-none flex-col gap-3 p-0 text-sm">
                {detail.audit.map((a) => (
                  <li key={a.id} className="flex flex-col gap-0.5 border-l-2 border-[var(--color-line)] pl-3">
                    <span className="font-medium">{t.auditActions[a.action] ?? a.action}</span>
                    <span className="text-xs text-[var(--color-muted)]">
                      {fill(t.by, { name: a.actorName ?? t.deletedStaff })} · <When at={a.createdAt} locale={locale} />
                    </span>
                    {a.reason && (
                      <span className="whitespace-pre-wrap break-words text-xs">
                        <span className="text-[var(--color-muted)]">{t.reasonPrefix}</span> {a.reason}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>{t.noAudit}</Empty>
            )}
          </Section>
        </aside>
      </div>

      {dialog && (
        <ConfirmDialog
          title={t.actions[dialog].label}
          text={t.actions[dialog].text}
          danger={SPEC[dialog].danger}
          stepUp
          submit={(reason) => postJson(`/api/admin/knowledge/${s.id}/${SPEC[dialog].path}`, { reason })}
          onClose={() => setDialog(null)}
          onDone={() => done(dialog)}
        />
      )}
    </div>
  )
}
