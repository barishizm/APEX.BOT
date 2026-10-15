"use client"

import {
  CircleAlert,
  CircleCheck,
  FileText,
  Globe,
  LoaderCircle,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { Group, TextArea, TextInput } from "@/components/widget-studio/fields"
import { format } from "@/lib/i18n"
import { formatNumber, plural, timeAgo } from "@/lib/i18n/format"
import type { SourceJson } from "@/lib/knowledge"
import { cn } from "@/lib/utils"

type Limits = { sources: number; websitePages: number; textChars: number; title: number }

async function send(path: string, method: string, offline: string, body?: object) {
  try {
    const res = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { message: offline } }
  }
}

// `send` with the offline message in the current language
function useSend() {
  const offline = useAppI18n().t.knowledge.offline
  return useCallback((path: string, method: string, body?: object) => send(path, method, offline, body), [offline])
}

function StatusLine({ source }: { source: SourceJson }) {
  const { t: app, locale } = useAppI18n()
  const t = app.knowledge.status
  if (source.status === "pending") {
    return <span className="text-[var(--color-muted)]">{t.pending}</span>
  }
  if (source.status === "syncing") {
    return (
      <span className="flex items-center gap-1.5 text-[var(--color-muted)]">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
        {t.reading}
      </span>
    )
  }
  if (source.status === "failed") {
    return (
      <span className="flex items-start gap-1.5 text-red-600 dark:text-red-400">
        <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        {source.error ?? t.failed}
        {source.chunks > 0 && <span className="text-[var(--color-muted)]">{t.previousInUse}</span>}
      </span>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 text-[var(--color-muted)]">
      <CircleCheck className="h-3.5 w-3.5 text-green-600" aria-hidden />
      {source.kind === "website" ? `${plural(source.pages, t.pages, locale)} · ` : ""}
      {plural(source.chunks, t.excerpts, locale)}
      {source.syncedAt && ` · ${format(t.updated, { when: timeAgo(source.syncedAt, locale) })}`}
      {source.error && <span className="text-amber-600 dark:text-amber-400">· {source.error}</span>}
    </span>
  )
}

function SourceRow({
  source,
  canEdit,
  onChange,
  onRemove,
  onError,
}: {
  source: SourceJson
  canEdit: boolean
  onChange: (s: SourceJson) => void
  onRemove: (id: string) => void
  onError: (message: string) => void
}) {
  const t = useAppI18n().t.knowledge.row
  const send = useSend()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const syncing = source.status === "syncing"
  const Icon = source.kind === "website" ? Globe : FileText

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
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:px-5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--color-bubble)]" aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate font-medium">{source.title}</p>
        {source.url ? (
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="truncate font-mono text-xs text-[var(--color-muted)] no-underline hover:underline">
            {source.url}
          </a>
        ) : (
          source.preview && <p className="line-clamp-2 text-xs text-[var(--color-muted)]">{source.preview}</p>
        )}
        <div className="text-xs" role="status" aria-live="polite">
          <StatusLine source={source} />
        </div>
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">
          {confirming ? (
            <>
              <span className="text-xs text-[var(--color-muted)]">{t.confirm}</span>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="h-8 cursor-pointer rounded-md border-0 bg-red-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
              >
                {busy ? t.removing : t.remove}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="h-8 cursor-pointer rounded-md border border-[var(--color-line)] bg-transparent px-3 text-xs font-semibold text-[var(--color-text)]"
              >
                {t.cancel}
              </button>
            </>
          ) : (
            <>
              {source.kind === "website" && (
                <button
                  type="button"
                  onClick={resync}
                  disabled={busy || syncing}
                  title={t.resyncTitle}
                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-transparent px-2.5 text-xs font-semibold text-[var(--color-text)] hover:border-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} aria-hidden />
                  {syncing ? t.syncing : t.sync}
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirming(true)}
                aria-label={format(t.removeLabel, { title: source.title })}
                title={t.remove}
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-[var(--color-line)] bg-transparent text-[var(--color-muted)] hover:border-red-500/60 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </>
          )}
        </div>
      )}
    </li>
  )
}

type SearchResult = { title: string; url: string; text: string; score: number; used: boolean }

function TryQuestion({ disabled }: { disabled: boolean }) {
  const t = useAppI18n().t.knowledge.try
  const send = useSend()
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ answered: boolean; confidence: string; threshold: number; results: SearchResult[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    const { ok, data } = await send("/api/knowledge/search", "POST", { query })
    setLoading(false)
    if (ok) setResult(data)
    else setError(data.message ?? t.failed)
  }

  return (
    <Group title={t.title} description={t.description}>
      <form onSubmit={run} className="flex gap-2">
        <label htmlFor="try-question" className="sr-only">
          {t.label}
        </label>
        <input
          id="try-question"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.placeholder}
          disabled={disabled}
          className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] px-3 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]/70 focus:border-[var(--color-secondary)] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled || loading || !query.trim()}
          className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-on-primary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
          {t.search}
        </button>
      </form>
      {disabled && <p className="text-xs text-[var(--color-muted)]">{t.needSource}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <div className="flex flex-col gap-3" aria-live="polite">
          <p
            className={cn(
              "rounded-lg p-3 text-sm",
              result.answered ? "bg-green-600/10 text-green-800 dark:text-green-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-300",
            )}
          >
            {result.answered ? (
              t.answered
            ) : result.results.length === 0 ? (
              t.nothing
            ) : (
              <>
                {format(t.belowThreshold, { score: result.results[0].score, threshold: result.threshold })}{" "}
                {result.confidence !== "lenient" ? (
                  <>
                    {t.lenientPre}{" "}
                    <Link href="/dashboard/widget?section=persona" className="font-semibold underline underline-offset-2">
                      {t.lenientLink}
                    </Link>{" "}
                    {t.lenientPost}
                  </>
                ) : (
                  t.addSource
                )}
              </>
            )}
          </p>
          {result.results.map((r, i) => (
            <article
              key={i}
              className={cn(
                "flex flex-col gap-1 rounded-lg border p-3 text-sm",
                r.used ? "border-[var(--color-secondary)] bg-[var(--color-raised)]" : "border-[var(--color-line)] opacity-70",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-medium">{r.title}</span>
                <span className="shrink-0 font-mono text-[0.6875rem] text-[var(--color-muted)]">
                  {r.used ? t.used : ""}
                  {format(t.score, { score: r.score })}
                </span>
              </div>
              <p className="line-clamp-3 text-xs leading-relaxed text-[var(--color-muted)]">{r.text}</p>
            </article>
          ))}
        </div>
      )}
    </Group>
  )
}

export function KnowledgeManager({
  initial,
  limits,
  canEdit,
  prefillTitle,
}: {
  initial: SourceJson[]
  limits: Limits
  canEdit: boolean
  /** From a conversation's "Add an answer": the question to answer. */
  prefillTitle?: string
}) {
  const { t: app, locale } = useAppI18n()
  const t = app.knowledge
  const send = useSend()
  const [sources, setSources] = useState(initial)
  const [url, setUrl] = useState("")
  const [urlError, setUrlError] = useState<string | undefined>()
  const [addingSite, setAddingSite] = useState(false)
  const [title, setTitle] = useState(prefillTitle ?? "")
  const [content, setContent] = useState("")
  const [textError, setTextError] = useState<string | undefined>()
  const [addingText, setAddingText] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const syncing = sources.some((s) => s.status === "syncing")
  const full = sources.length >= limits.sources

  const refresh = useCallback(async () => {
    const { ok, data } = await send("/api/knowledge", "GET")
    if (ok) setSources(data.sources)
  }, [send])

  // While a website is being read, check back every few seconds
  useEffect(() => {
    if (!syncing) return
    pollRef.current = setTimeout(refresh, 2500)
    return () => clearTimeout(pollRef.current)
  }, [syncing, sources, refresh])

  const upsert = (s: SourceJson) => setSources((list) => (list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [s, ...list]))

  const addSite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return setUrlError(t.website.missing)
    setAddingSite(true)
    setUrlError(undefined)
    const { ok, data } = await send("/api/knowledge", "POST", { kind: "website", url })
    setAddingSite(false)
    if (!ok) return setUrlError(data.message ?? t.website.failed)
    upsert(data.source)
    setUrl("")
    if (data.notice) setNotice(data.notice)
  }

  const addText = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddingText(true)
    setTextError(undefined)
    const { ok, data } = await send("/api/knowledge", "POST", { kind: "text", title, content })
    setAddingText(false)
    if (!ok) return setTextError(data.message ?? t.text.failed)
    upsert(data.source)
    setTitle("")
    setContent("")
  }

  const pages = sources.reduce((n, s) => n + s.pages, 0)
  const chunks = sources.reduce((n, s) => n + s.chunks, 0)

  // "Teach it your content" in the header's setup progress is server-rendered
  const router = useRouter()
  const hasKnowledge = chunks > 0
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    router.refresh()
  }, [hasKnowledge, router])

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--color-line)] bg-[var(--color-raised)]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-lg font-semibold">{t.title}</h1>
          <p className="truncate text-xs text-[var(--color-muted)]">{canEdit ? t.lede : t.viewOnly}</p>
        </div>
        <dl className="flex gap-5 text-xs">
          {[
            [t.stats.sources, `${sources.length}/${limits.sources}`],
            [t.stats.pages, formatNumber(pages, locale)],
            [t.stats.excerpts, formatNumber(chunks, locale)],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <dt className="text-[var(--color-muted)]">{k}</dt>
              <dd className="m-0 font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
        <div className="flex min-w-0 flex-col gap-6">
          {notice && (
            <p role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
              {notice}
              <button type="button" onClick={() => setNotice(null)} className="cursor-pointer border-0 bg-transparent text-xs font-semibold text-inherit underline">
                {t.dismiss}
              </button>
            </p>
          )}

          <section className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3 sm:px-5">
              <h2 className="text-base font-semibold">{t.sources}</h2>
              {syncing && (
                <span className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  {t.syncing}
                </span>
              )}
            </div>
            {sources.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-bubble)]" aria-hidden>
                  <Globe className="h-5 w-5" />
                </span>
                <p className="font-medium">{t.emptyTitle}</p>
                <p className="max-w-sm text-sm text-[var(--color-muted)]">{t.emptyText}</p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {sources.map((s) => (
                  <SourceRow
                    key={s.id}
                    source={s}
                    canEdit={canEdit}
                    onChange={upsert}
                    onRemove={(id) => setSources((list) => list.filter((x) => x.id !== id))}
                    onError={setNotice}
                  />
                ))}
              </ul>
            )}
          </section>

          <TryQuestion disabled={chunks === 0} />
        </div>

        {canEdit && (
          <div className="flex min-w-0 flex-col gap-6">
            <Group title={t.website.title} description={format(t.website.description, { n: limits.websitePages })}>
              <form onSubmit={addSite} className="flex flex-col gap-3" noValidate>
                <TextInput
                  label={t.website.label}
                  type="url"
                  value={url}
                  onChange={(v) => {
                    setUrl(v)
                    setUrlError(undefined)
                  }}
                  placeholder={t.website.placeholder}
                  error={urlError}
                  disabled={full}
                  mono
                />
                <button
                  type="submit"
                  disabled={addingSite || full}
                  className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border-0 bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-on-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addingSite && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
                  {addingSite ? t.website.adding : t.website.add}
                </button>
              </form>
            </Group>

            <Group title={t.text.title} description={t.text.description}>
              <form onSubmit={addText} className="flex flex-col gap-3">
                <TextInput label={t.text.titleLabel} value={title} onChange={setTitle} max={limits.title} placeholder={t.text.titlePlaceholder} disabled={full} />
                <TextArea
                  label={t.text.content}
                  rows={7}
                  value={content}
                  onChange={setContent}
                  max={limits.textChars}
                  placeholder={t.text.contentPlaceholder}
                  error={textError}
                  disabled={full}
                />
                <button
                  type="submit"
                  disabled={addingText || full || !title.trim() || !content.trim()}
                  className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--color-line)] bg-transparent px-4 text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addingText && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
                  {addingText ? t.text.adding : t.text.add}
                </button>
              </form>
            </Group>
            {full && <p className="text-xs text-[var(--color-muted)]">{format(t.full, { n: limits.sources })}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
