"use client"

import { ExternalLink, LoaderCircle, RefreshCw, Search, X } from "lucide-react"
import Link from "next/link"
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { TextArea, TextInput } from "@/components/widget-studio/fields"
import { format } from "@/lib/i18n"
import { formatDate, plural, timeAgo } from "@/lib/i18n/format"
import type { SourceJson } from "@/lib/knowledge"
import { cn } from "@/lib/utils"
import { Badge, CitedLine, SourceIcon, StatusLine, outlineButton, primaryButton, segment, segmented, useSend, type Limits } from "./shared"

type Chunk = { url: string; title: string; text: string; position: number }
type Detail = { content: string | null; pages: { url: string; title: string; chunks: number }[]; chunks: Chunk[] }
type Tab = "content" | "pages" | "excerpts"

const PAGE = 30
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** The text with every case-insensitive match of `query` marked. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const parts = text.split(new RegExp(`(${escape(query)})`, "gi"))
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <mark key={i} className="rounded-sm bg-amber-300/60 px-px text-inherit dark:bg-amber-400/40">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  )
}

function Excerpts({ detail, isWebsite, page, onClearPage }: { detail: Detail; isWebsite: boolean; page: string | null; onClearPage: () => void }) {
  const { t: app, locale } = useAppI18n()
  const t = app.knowledge.detail
  const [query, setQuery] = useState("")
  const [limit, setLimit] = useState(PAGE)
  const q = query.trim()
  const shown = useMemo(() => {
    const needle = q.toLocaleLowerCase(locale)
    return detail.chunks.filter((c) => (!page || c.url === page) && (!needle || c.text.toLocaleLowerCase(locale).includes(needle)))
  }, [detail.chunks, q, page, locale])
  useEffect(() => setLimit(PAGE), [q, page])

  if (!detail.chunks.length) return <p className="py-8 text-center text-sm text-[var(--color-muted)]">{t.noExcerpts}</p>
  const pageTitle = page && detail.pages.find((p) => p.url === page)?.title

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted)]" aria-hidden />
        <label htmlFor="excerpt-filter" className="sr-only">
          {t.filter}
        </label>
        <input
          id="excerpt-filter"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.filterPlaceholder}
          className="h-9 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] pr-3 pl-8 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]/70 focus:border-[var(--color-secondary)]"
        />
      </div>
      {page && (
        <span className="flex w-fit max-w-full items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-bubble)] py-0.5 pr-1 pl-2.5 text-xs">
          <span className="truncate">{pageTitle || page}</span>
          <button
            type="button"
            onClick={onClearPage}
            aria-label={app.knowledge.list.clear}
            className="grid h-5 w-5 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      )}
      <p className="text-xs text-[var(--color-muted)]" aria-live="polite">
        {format(app.knowledge.list.shown, { n: shown.length, total: detail.chunks.length })}
      </p>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--color-muted)]">{t.noMatch}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {shown.slice(0, limit).map((c) => (
            <li key={c.position} className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] p-3">
              <div className="flex items-center justify-between gap-3 text-[0.6875rem] text-[var(--color-muted)]">
                <span className="font-mono">{format(t.excerpt, { n: c.position + 1 })}</span>
                {isWebsite && c.url && (
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate no-underline hover:underline" title={c.url}>
                    {c.title || c.url}
                  </a>
                )}
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                <Highlight text={c.text} query={q} />
              </p>
            </li>
          ))}
        </ol>
      )}
      {shown.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + PAGE)} className={cn(outlineButton, "self-center")}>
          {format(t.showMore, { n: Math.min(PAGE, shown.length - limit) })}
        </button>
      )}
    </div>
  )
}

export function SourceDetail({
  source,
  replies,
  canEdit,
  limits,
  onClose,
  onChange,
}: {
  source: SourceJson
  replies: number | undefined
  canEdit: boolean
  limits: Limits
  onClose: () => void
  onChange: (s: SourceJson) => void
}) {
  const { t: app, locale } = useAppI18n()
  const k = app.knowledge
  const t = k.detail
  const send = useSend()
  const isWebsite = source.kind === "website"
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("content")
  const [page, setPage] = useState<string | null>(null)
  const [title, setTitle] = useState(source.title)
  const [content, setContent] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | undefined>()
  const [saved, setSaved] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    const { ok, data } = await send(`/api/knowledge/${source.id}`, "GET")
    if (!ok) return setLoadError(data.message ?? t.failed)
    setDetail(data)
    setContent(data.content ?? "")
  }, [send, source.id, t.failed])

  // again whenever a sync finishes, so the excerpts match what the assistant searches
  useEffect(() => {
    load()
  }, [load, source.syncedAt])

  const dirty = canEdit && detail !== null && (title.trim() !== source.title || (!isWebsite && content.trim() !== (detail.content ?? "").trim()))

  const close = useCallback(() => (dirty ? setConfirmClose(true) : onClose()), [dirty, onClose])

  // a modal: Escape closes, the page behind doesn't scroll, focus returns where it was
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = overflow
      before?.focus?.()
    }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [close])

  // the save button lives in the footer, so it works from any tab
  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!dirty || !detail) return
    setSaving(true)
    setSaveError(undefined)
    setSaved(false)
    const body: { title?: string; content?: string } = {}
    if (title.trim() !== source.title) body.title = title
    if (!isWebsite && content.trim() !== (detail.content ?? "").trim()) body.content = content
    const { ok, data } = await send(`/api/knowledge/${source.id}`, "PATCH", body)
    setSaving(false)
    if (!ok) return setSaveError(data.message ?? t.saveFailed)
    onChange(data.source)
    setTitle(data.source.title)
    setSaved(true)
    setConfirmClose(false)
    await load()
  }

  const undo = () => {
    setTitle(source.title)
    setContent(detail?.content ?? "")
    setSaveError(undefined)
    setConfirmClose(false)
  }

  const tabs: [Tab, string, number | null][] = [
    ["content", t.tabs.content, null],
    ...(isWebsite ? [["pages", t.tabs.pages, detail?.pages.length ?? null] as [Tab, string, number | null]] : []),
    ["excerpts", t.tabs.excerpts, detail?.chunks.length ?? null],
  ]

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={close} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-detail-title"
        className="relative flex h-full w-full max-w-2xl flex-col border-l border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-2xl"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <header className="flex flex-col gap-3 border-b border-[var(--color-line)] px-4 pt-4 pb-3 sm:px-6">
          <div className="flex items-start gap-3">
            <SourceIcon source={source} size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="source-detail-title" className="min-w-0 truncate text-lg font-semibold">
                  {source.title}
                </h2>
                <Badge>{isWebsite ? k.badge.website : k.badge.text}</Badge>
                {source.managed && <Badge tone="accent">{k.badge.managed}</Badge>}
              </div>
              {source.url && (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-fit max-w-full items-center gap-1 truncate font-mono text-xs text-[var(--color-muted)] no-underline hover:underline"
                >
                  <span className="truncate">{source.url}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                </a>
              )}
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label={t.close}
              className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md border border-[var(--color-line)] bg-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="flex flex-col gap-0.5 text-xs" role="status" aria-live="polite">
            <StatusLine source={source} />
            <span className="flex flex-wrap gap-x-1.5 text-[var(--color-muted)]">
              <span title={formatDate(source.createdAt, locale, { dateStyle: "long", timeStyle: "short" })}>
                {format(t.added, { when: timeAgo(source.createdAt, locale) })}
              </span>
              {source.status === "ready" && source.chunks > 0 && (
                <>
                  ·
                  <CitedLine source={source} replies={replies} />
                </>
              )}
            </span>
          </div>
          <div role="tablist" aria-label={source.title} className={cn(segmented, "w-fit max-w-full overflow-x-auto")}>
            {tabs.map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`detail-tab-${key}`}
                aria-selected={tab === key}
                aria-controls="detail-panel"
                onClick={() => setTab(key)}
                className={segment(tab === key)}
              >
                {label}
                {n !== null && <span className="text-xs tabular-nums text-[var(--color-muted)]">{n}</span>}
              </button>
            ))}
          </div>
        </header>

        <div id="detail-panel" role="tabpanel" aria-labelledby={`detail-tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {loadError ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-sm">
              <p className="text-red-600 dark:text-red-400">{loadError}</p>
              <button type="button" onClick={load} className={outlineButton}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                {t.retry}
              </button>
            </div>
          ) : !detail ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--color-muted)]">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              {t.loading}
            </p>
          ) : tab === "excerpts" ? (
            <Excerpts detail={detail} isWebsite={isWebsite} page={page} onClearPage={() => setPage(null)} />
          ) : tab === "pages" ? (
            detail.pages.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--color-muted)]">{t.noPages}</p>
            ) : (
              <ol className="divide-y divide-[var(--color-line)] overflow-hidden rounded-lg border border-[var(--color-line)]">
                {detail.pages.map((p) => (
                  <li key={p.url} className="flex items-center gap-3 bg-[var(--color-raised)] px-3 py-2.5">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{p.title || p.url}</span>
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="truncate font-mono text-xs text-[var(--color-muted)] no-underline hover:underline">
                        {p.url}
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPage(p.url)
                        setTab("excerpts")
                      }}
                      className={cn(outlineButton, "shrink-0")}
                    >
                      {plural(p.chunks, k.status.excerpts, locale)}
                    </button>
                  </li>
                ))}
              </ol>
            )
          ) : (
            <form onSubmit={save} className="flex flex-col gap-4">
              {source.managed && (
                <p className="rounded-lg bg-[var(--color-bubble)] p-3 text-sm">
                  {t.managedNote}{" "}
                  <Link href="/dashboard/analytics" className="font-semibold underline underline-offset-2">
                    {t.managedLink}
                  </Link>
                </p>
              )}
              {isWebsite && <p className="rounded-lg bg-[var(--color-bubble)] p-3 text-sm text-[var(--color-muted)]">{t.websiteNote}</p>}
              {canEdit ? (
                <>
                  <TextInput
                    label={t.name}
                    value={title}
                    onChange={(v) => {
                      setTitle(v)
                      setSaved(false)
                    }}
                    max={limits.title}
                    error={isWebsite ? saveError : undefined}
                  />
                  {!isWebsite && (
                    <TextArea
                      label={t.content}
                      rows={16}
                      value={content}
                      onChange={(v) => {
                        setContent(v)
                        setSaved(false)
                      }}
                      max={limits.textChars}
                      error={saveError}
                    />
                  )}
                </>
              ) : (
                !isWebsite && <p className="rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] p-3 text-sm leading-relaxed whitespace-pre-wrap">{detail.content}</p>
              )}
            </form>
          )}
        </div>

        {canEdit && detail && (dirty || saved || confirmClose) && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-line)] bg-[var(--color-raised)] px-4 py-3 sm:px-6" aria-live="polite">
            {confirmClose ? (
              <>
                <span className="mr-auto text-sm text-amber-700 dark:text-amber-400">{t.unsaved}</span>
                <button type="button" onClick={() => setConfirmClose(false)} className={outlineButton}>
                  {t.keepEditing}
                </button>
                <button type="button" onClick={onClose} className="h-8 cursor-pointer rounded-md border-0 bg-red-600 px-3 text-xs font-semibold text-white">
                  {t.discard}
                </button>
              </>
            ) : dirty ? (
              <>
                <button type="button" onClick={undo} className={cn(outlineButton, "mr-auto")}>
                  {t.undo}
                </button>
                <button type="button" onClick={() => save()} disabled={saving} className={cn(primaryButton, "h-9")}>
                  {saving && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
                  {saving ? t.saving : t.save}
                </button>
              </>
            ) : (
              <span className="mr-auto text-sm text-green-700 dark:text-green-400">{t.saved}</span>
            )}
          </footer>
        )}
      </div>
    </div>
  )
}
