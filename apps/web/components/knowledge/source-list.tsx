"use client"

import { ChevronRight, LoaderCircle, RefreshCw, BookOpen, Search, Trash2, X } from "lucide-react"
import { useMemo, useState } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { format } from "@/lib/i18n"
import type { SourceJson } from "@/lib/knowledge"
import { cn } from "@/lib/utils"
import { Badge, CitedLine, SourceIcon, StatusLine, needsAttention, outlineButton, segment, segmented, useSend, type Usage } from "./shared"

export type Kind = "all" | "website" | "text" | "file" | "attention"
type Sort = "newest" | "name" | "cited" | "excerpts"

function SourceRow({
  source,
  replies,
  canEdit,
  onOpen,
  onChange,
  onRemove,
  onError,
}: {
  source: SourceJson
  replies: number | undefined
  canEdit: boolean
  onOpen: () => void
  onChange: (s: SourceJson) => void
  onRemove: (id: string) => void
  onError: (message: string) => void
}) {
  const { t: app } = useAppI18n()
  const k = app.knowledge
  const t = k.row
  const send = useSend()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const syncing = source.status === "syncing"

  const resync = async () => {
    setBusy(true)
    const { ok, data } = await send(`/api/knowledge/${source.id}/sync`, "POST")
    setBusy(false)
    if (ok) onChange(data.source)
    else onError(data.message ?? t.syncFailed)
  }
  const remove = async () => {
    setBusy(true)
    const { ok, status, data } = await send(`/api/knowledge/${source.id}`, "DELETE")
    setBusy(false)
    if (ok || status === 404) onRemove(source.id)
    else onError(data.message ?? t.removeFailed)
  }

  return (
    <li className="group flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-[var(--color-bubble)]/40 sm:flex-row sm:items-start sm:px-5">
      <SourceIcon source={source} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            aria-label={format(k.openLabel, { title: source.title })}
            className="min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left font-medium text-[var(--color-text)] hover:underline"
          >
            {source.title}
          </button>
          {source.managed && <Badge tone="accent">{k.badge.managed}</Badge>}
        </div>
        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit max-w-full truncate font-mono text-xs text-[var(--color-muted)] no-underline hover:underline"
          >
            {source.url}
          </a>
        ) : (
          source.preview && <p className="line-clamp-2 text-xs text-[var(--color-muted)]">{source.preview}</p>
        )}
        <div className="flex flex-col gap-0.5 text-xs" role="status" aria-live="polite">
          <StatusLine source={source} />
          {source.status === "ready" && <CitedLine source={source} replies={replies} />}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">
        {confirming ? (
          <>
            <span className="text-xs text-[var(--color-muted)]">{t.confirm}</span>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="h-8 cursor-pointer rounded-md border-0 bg-[var(--color-danger-solid)] px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? t.removing : t.remove}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={outlineButton}>
              {t.cancel}
            </button>
          </>
        ) : (
          <>
            {canEdit && source.kind === "website" && (
              <button type="button" onClick={resync} disabled={busy || syncing} title={t.resyncTitle} className={outlineButton}>
                <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} aria-hidden />
                {syncing ? t.syncing : t.sync}
              </button>
            )}
            <button type="button" onClick={onOpen} className={outlineButton}>
              {k.open}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                aria-label={format(t.removeLabel, { title: source.title })}
                title={t.remove}
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-[var(--color-line)] bg-transparent text-[var(--color-muted)] hover:border-[var(--color-danger)]/60 hover:text-[var(--color-danger)]"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </>
        )}
      </div>
    </li>
  )
}

export function SourceList({
  sources,
  usage,
  canEdit,
  kind,
  onKind,
  onOpen,
  onChange,
  onRemove,
  onError,
}: {
  sources: SourceJson[]
  usage: Usage
  canEdit: boolean
  kind: Kind
  onKind: (k: Kind) => void
  onOpen: (id: string) => void
  onChange: (s: SourceJson) => void
  onRemove: (id: string) => void
  onError: (message: string) => void
}) {
  const { t: app, locale } = useAppI18n()
  const k = app.knowledge
  const t = k.list
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<Sort>("newest")
  const syncing = sources.some((s) => s.status === "syncing")

  const counts = useMemo(
    () => ({
      all: sources.length,
      website: sources.filter((s) => s.kind === "website").length,
      text: sources.filter((s) => s.kind === "text").length,
      file: sources.filter((s) => s.kind === "file").length,
      attention: sources.filter(needsAttention).length,
    }),
    [sources],
  )

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(locale)
    const list = sources.filter(
      (s) =>
        (kind === "all" || (kind === "attention" ? needsAttention(s) : s.kind === kind)) &&
        (!q || [s.title, s.url, s.preview].some((v) => v?.toLocaleLowerCase(locale).includes(q))),
    )
    const by: Record<Sort, (a: SourceJson, b: SourceJson) => number> = {
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      name: (a, b) => a.title.localeCompare(b.title, locale),
      cited: (a, b) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0),
      excerpts: (a, b) => b.chunks - a.chunks,
    }
    return list.sort((a, b) => by[sort](a, b) || b.createdAt.localeCompare(a.createdAt))
  }, [sources, kind, query, sort, usage, locale])

  const filtered = kind !== "all" || query.trim() !== ""
  const kinds: [Kind, string][] = [
    ["all", t.all],
    ["website", t.websites],
    ["text", t.texts],
    ...(counts.file ? [["file", t.files] as [Kind, string]] : []),
    ...(counts.attention ? [["attention", t.attention] as [Kind, string]] : []),
  ]

  return (
    <section aria-labelledby="sources-heading" className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="flex flex-col gap-3 border-b border-[var(--color-line)] px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="sources-heading" className="flex items-baseline gap-2 text-base font-semibold">
            {k.sources}
            {filtered && sources.length > 0 && (
              <span className="text-xs font-normal tabular-nums text-[var(--color-muted)]">{format(t.shown, { n: shown.length, total: sources.length })}</span>
            )}
          </h2>
          {syncing && (
            <span className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {k.syncing}
            </span>
          )}
        </div>
        {sources.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-56">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted)]" aria-hidden />
              <label htmlFor="source-search" className="sr-only">
                {t.search}
              </label>
              <input
                id="source-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="h-9 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] pr-3 pl-8 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]/70 focus:border-[var(--color-secondary)]"
              />
            </div>
            <div role="group" aria-label={t.kind} className={cn(segmented, "max-w-full overflow-x-auto")}>
              {kinds.map(([key, label]) => (
                <button key={key} type="button" aria-pressed={kind === key} onClick={() => onKind(key)} className={segment(kind === key)}>
                  {label}
                  <span className={cn("text-xs tabular-nums", key === "attention" ? "text-[var(--color-warning)]" : "text-[var(--color-muted)]")}>
                    {counts[key]}
                  </span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
              {t.sort}
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="h-9 cursor-pointer rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] px-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-secondary)]"
              >
                <option value="newest">{t.newest}</option>
                <option value="name">{t.name}</option>
                <option value="cited">{t.cited}</option>
                <option value="excerpts">{t.excerpts}</option>
              </select>
            </label>
          </div>
        )}
      </div>

      {sources.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-bubble)]" aria-hidden>
            <BookOpen className="h-5 w-5" />
          </span>
          <p className="font-medium">{k.emptyTitle}</p>
          <p className="max-w-sm text-sm text-[var(--color-muted)]">{k.emptyText}</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-sm text-[var(--color-muted)]">
          {t.noMatch}
          <button
            type="button"
            onClick={() => {
              setQuery("")
              onKind("all")
            }}
            className={outlineButton}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            {t.clear}
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {shown.map((s) => (
            <SourceRow
              key={s.id}
              source={s}
              replies={usage[s.id]}
              canEdit={canEdit}
              onOpen={() => onOpen(s.id)}
              onChange={onChange}
              onRemove={onRemove}
              onError={onError}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
