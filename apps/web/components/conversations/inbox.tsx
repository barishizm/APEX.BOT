"use client"

import { ArrowLeft, BookPlus, CircleHelp, FileText, Languages, LifeBuoy, LoaderCircle, Mail, MessageSquareText, Monitor, Search, Smartphone, Tablet, ThumbsDown, ThumbsUp, Trash2, UserRound, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { FILTERS, conversationsHref, type ConversationJson, type SummaryJson } from "@/lib/conversations"
import { format } from "@/lib/i18n"
import { LOCALE_META, type Locale } from "@/lib/i18n/config"
import { formatDate, plural, timeAgo } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import type { ConversationContext, ConversationFilter } from "@apex/db"

const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }

/** Name or email when the visitor left them, else a short stable label from the id. */
function visitorLabel(c: { id: string; visitorName?: string | null; visitorEmail?: string | null }, template: string) {
  return c.visitorName || c.visitorEmail || format(template, { id: c.id.slice(0, 4).toUpperCase() })
}

const flag = (cc: string) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((ch) => 0x1f1a5 + ch.charCodeAt(0))) : "")

function displayName(type: "region" | "language", code: string, locale: Locale) {
  try {
    return new Intl.DisplayNames(LOCALE_META[locale].intl, { type }).of(code) ?? code
  } catch {
    return code
  }
}

const DEVICE_ICONS = { mobile: Smartphone, tablet: Tablet, desktop: Monitor } as const

/** Country, device, language and start page; `full` spells them out for the transcript header. */
function ContextLine({ context, full = false }: { context: ConversationContext; full?: boolean }) {
  const { t: app, locale } = useAppI18n()
  const t = app.inbox
  const device = context.device && context.device in DEVICE_ICONS ? (context.device as keyof typeof DEVICE_ICONS) : null
  const DeviceIcon = device ? DEVICE_ICONS[device] : null
  const language = context.locale?.split("-")[0]
  const deviceText = device ? [t.devices[device], ...(full ? [context.os, context.browser] : [])].filter(Boolean).join(" · ") : ""
  const parts = [
    context.country && (
      <span key="country" title={t.country} className="shrink-0">
        {flag(context.country)} {displayName("region", context.country, locale)}
      </span>
    ),
    DeviceIcon && (
      <span key="device" title={full ? t.device : deviceText} className="inline-flex shrink-0 items-center gap-1">
        <DeviceIcon className="h-3 w-3" aria-label={full ? undefined : deviceText} />
        {full && deviceText}
      </span>
    ),
    language && (
      <span key="language" title={t.language} className="inline-flex shrink-0 items-center gap-1">
        {full && <Languages className="h-3 w-3" aria-hidden />}
        {full ? displayName("language", language, locale) : language.toUpperCase()}
      </span>
    ),
    context.page && (
      <span key="page" title={`${t.startedOn}: ${context.pageTitle ? `${context.pageTitle} (${context.page})` : context.page}`} className="inline-flex min-w-0 items-center gap-1">
        <FileText className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">{full && context.pageTitle ? context.pageTitle : context.page}</span>
      </span>
    ),
  ].filter(Boolean)
  if (!parts.length) return null
  return <span className="flex min-w-0 items-center gap-x-2 gap-y-0.5 text-[0.6875rem] text-[var(--color-muted)] max-sm:flex-wrap">{parts}</span>
}

// Transcripts fetched on hover or open, so switching between conversations doesn't wait on
// the network. A cached one is shown at once and refreshed when it's older than STALE_MS.
const STALE_MS = 15_000
type Cached = { at: number; promise: Promise<ConversationJson> }

function fetchTranscript(cache: Map<string, Cached>, id: string, fallback: string, force = false): Promise<ConversationJson> {
  const hit = cache.get(id)
  if (hit && !force && Date.now() - hit.at < STALE_MS) return hit.promise
  const promise = fetch(`/api/conversations/${id}`).then(async (res) => {
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.message ?? fallback)
    return body as ConversationJson
  })
  cache.set(id, { at: Date.now(), promise })
  // a failed load isn't kept; the next attempt tries again
  promise.catch(() => cache.get(id)?.promise === promise && cache.delete(id))
  return promise
}

/** Answers use **bold** and line breaks; everything else is shown as text. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  )
}

function Badge({ tone, children }: { tone: "amber" | "blue" | "red" | "green"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-px text-[0.6875rem] font-semibold",
        tone === "amber" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        tone === "blue" && "bg-[color-mix(in_srgb,var(--color-secondary)_16%,transparent)] text-[var(--color-secondary)]",
        tone === "red" && "bg-red-500/12 text-red-700 dark:text-red-300",
        tone === "green" && "bg-green-600/12 text-green-700 dark:text-green-300",
      )}
    >
      {children}
    </span>
  )
}

function Badges({ c }: { c: { unansweredCount?: number; handoffAt: string | null; visitorEmail?: string | null; negativeCount?: number } }) {
  const t = useAppI18n().t.inbox.badges
  return (
    <>
      {!!c.unansweredCount && (
        <Badge tone="amber">
          <CircleHelp className="h-3 w-3" aria-hidden /> {format(t.unanswered, { n: c.unansweredCount })}
        </Badge>
      )}
      {c.handoffAt && (
        <Badge tone="blue">
          <LifeBuoy className="h-3 w-3" aria-hidden /> {t.handoff}
        </Badge>
      )}
      {c.visitorEmail && (
        <Badge tone="green">
          <UserRound className="h-3 w-3" aria-hidden /> {t.lead}
        </Badge>
      )}
      {!!c.negativeCount && (
        <Badge tone="red">
          <ThumbsDown className="h-3 w-3" aria-hidden /> {c.negativeCount}
        </Badge>
      )}
    </>
  )
}

function Transcript({
  id,
  summary,
  cache,
  canEdit,
  onDeleted,
  onBack,
}: {
  id: string
  /** The list row, so the header shows before the messages arrive. */
  summary?: SummaryJson
  cache: Map<string, Cached>
  canEdit: boolean
  onDeleted: (id: string) => void
  onBack: () => void
}) {
  const { t: app, locale } = useAppI18n()
  const t = app.inbox
  const [data, setData] = useState<ConversationJson | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let live = true
    setData(null)
    setError(null)
    setConfirming(false)
    const show = (promise: Promise<ConversationJson>) =>
      promise.then(
        (body) => live && setData(body),
        (err: unknown) => live && setError(err instanceof TypeError ? t.offline : err instanceof Error ? err.message : t.loadFailed),
      )
    const hit = cache.get(id)
    void show(fetchTranscript(cache, id, t.loadFailed))
    // a stale copy is shown while a fresh one loads
    if (hit && Date.now() - hit.at >= STALE_MS) void hit.promise.then((body) => live && setData((d) => d ?? body), () => {})
    return () => {
      live = false
    }
  }, [id, t, cache])

  const remove = async () => {
    setDeleting(true)
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => null)
    setDeleting(false)
    if (res && (res.ok || res.status === 404)) onDeleted(id)
    else setError(t.deleteFailed)
  }

  const firstQuestion = data?.messages.find((m) => m.role === "user")?.content ?? ""

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={t.back}
          className="grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-[var(--color-line)] bg-transparent text-[var(--color-text)] lg:hidden"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate font-semibold">
            {visitorLabel({ id, visitorName: data ? data.visitor?.name : summary?.visitorName, visitorEmail: data ? data.visitor?.email : summary?.visitorEmail }, t.visitor)}
          </p>
          <p className="truncate text-xs text-[var(--color-muted)]">
            {(() => {
              const head = data ?? summary
              return head ? format(t.started, { site: head.origin?.replace(/^https?:\/\//, "") ?? t.unknownSite, date: formatDate(head.createdAt, locale, DATE_TIME) }) : " "
            })()}
          </p>
          {(data ?? summary) && <ContextLine context={(data ?? summary)!.context} full />}
        </div>
        {data?.visitor?.email && (
          <a
            href={`mailto:${data.visitor.email}?subject=${encodeURIComponent(t.replySubject)}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-line)] px-2.5 text-xs font-semibold text-[var(--color-text)] no-underline hover:border-[var(--color-muted)]"
          >
            <Mail className="h-3.5 w-3.5" aria-hidden /> {t.reply}
          </a>
        )}
        {canEdit &&
          data &&
          (confirming ? (
            <span className="flex items-center gap-2">
              <button type="button" onClick={remove} disabled={deleting} className="h-8 cursor-pointer rounded-md border-0 bg-red-600 px-3 text-xs font-semibold text-white disabled:opacity-50">
                {deleting ? t.deleting : t.delete}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="h-8 cursor-pointer rounded-md border border-[var(--color-line)] bg-transparent px-3 text-xs font-semibold text-[var(--color-text)]"
              >
                {t.cancel}
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={t.deleteConversation}
              title={t.deleteConversation}
              className="grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-[var(--color-line)] bg-transparent text-[var(--color-muted)] hover:border-red-500/60 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!data && !error && (
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> {t.loading}
          </p>
        )}
        {data && (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {data.visitor && (
              <p className="rounded-lg bg-[var(--color-surface)] p-3 text-sm">
                <span className="font-semibold">{t.contact}</span>
                {[data.visitor.name, data.visitor.email, data.visitor.phone].filter(Boolean).join(" · ")}
              </p>
            )}
            {data.messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex flex-col items-end gap-1">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--color-primary)] px-4 py-2.5 text-sm text-[var(--color-on-primary)]">{m.content}</p>
                  <span className="text-[0.6875rem] text-[var(--color-muted)]">{formatDate(m.createdAt, locale, { timeStyle: "short" })}</span>
                </div>
              ) : (
                <div key={m.id} className="flex flex-col items-start gap-1.5">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-[var(--color-bubble)] px-4 py-2.5 text-sm">
                    <RichText text={m.content} />
                  </p>
                  <div className="flex max-w-[85%] flex-wrap items-center gap-1.5 text-[0.6875rem] text-[var(--color-muted)]">
                    {m.unanswered && (
                      <Badge tone="amber">
                        <CircleHelp className="h-3 w-3" aria-hidden /> {t.noMatch}
                      </Badge>
                    )}
                    {m.sources.map((s) => (
                      <a
                        key={s.url}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="max-w-[16rem] truncate rounded-full border border-[var(--color-line)] px-2 py-px text-[var(--color-text)] no-underline hover:border-[var(--color-muted)]"
                      >
                        {s.title}
                      </a>
                    ))}
                    {m.feedback === "up" && <ThumbsUp className="h-3.5 w-3.5 text-green-600" aria-label={t.helpful} />}
                    {m.feedback === "down" && <ThumbsDown className="h-3.5 w-3.5 text-red-600" aria-label={t.unhelpful} />}
                  </div>
                </div>
              ),
            )}
            {data.handoffAt && (
              <p className="flex items-center gap-2 self-center rounded-full bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-muted)]">
                <LifeBuoy className="h-3.5 w-3.5" aria-hidden />
                {format(t.sentToTeam, { date: formatDate(data.handoffAt, locale, DATE_TIME) })}
              </p>
            )}
            {data.messages.some((m) => m.unanswered) && (
              <div className="mt-2 flex flex-col items-start gap-2 rounded-xl border border-dashed border-[var(--color-line)] p-4 text-sm">
                <p>{t.unansweredNote}</p>
                <Link
                  href={`/dashboard/knowledge?title=${encodeURIComponent(firstQuestion.slice(0, 120))}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 text-xs font-semibold no-underline"
                  style={{ color: "var(--color-on-primary)" }}
                >
                  <BookPlus className="h-3.5 w-3.5" aria-hidden /> {t.addAnswer}
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function ConversationInbox({
  initial,
  hasMore: initialHasMore,
  filter,
  days = null,
  search = null,
  canEdit,
  open,
}: {
  initial: SummaryJson[]
  hasMore: boolean
  filter: ConversationFilter
  /** Only the last N days, set when arriving from a stats card that counts over that window. */
  days?: number | null
  search?: string | null
  canEdit: boolean
  /** Conversation to show first (linked from the analytics page), even if it isn't on the first page. */
  open?: string | null
}) {
  const { t: app, locale } = useAppI18n()
  const t = app.inbox
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selected, setSelected] = useState<string | null>(open ?? null)
  const [query, setQuery] = useState(search ?? "")
  const cache = useRef(new Map<string, Cached>()).current
  const prefetch = (id: string) => void fetchTranscript(cache, id, t.loadFailed).catch(() => {})

  // the search runs on the server: typing updates the address after a short pause
  useEffect(() => setQuery(search ?? ""), [search])
  useEffect(() => {
    const q = query.trim()
    if (q === (search ?? "")) return
    const timer = setTimeout(() => router.replace(conversationsHref(filter, days, q)), 300)
    return () => clearTimeout(timer)
  }, [query, search, filter, days, router])

  // a new filter arrives as new server props
  useEffect(() => {
    setItems(initial)
    setHasMore(initialHasMore)
    setSelected(open ?? null)
  }, [initial, initialHasMore, open])

  const loadMore = async () => {
    const last = items.at(-1)
    if (!last) return
    setLoadingMore(true)
    const params = new URLSearchParams({ filter, before: last.updatedAt })
    if (days) params.set("days", String(days))
    if (search) params.set("q", search)
    const res = await fetch(`/api/conversations?${params}`).catch(() => null)
    setLoadingMore(false)
    if (!res?.ok) return
    const data = await res.json()
    setItems((list) => [...list, ...data.conversations.filter((c: SummaryJson) => !list.some((x) => x.id === c.id))])
    setHasMore(data.hasMore)
  }

  const unfiltered = filter === "all" && !days && !search

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--color-line)] px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-lg font-semibold">{t.title}</h1>
          <p className="truncate text-xs text-[var(--color-muted)]">{t.lede}</p>
        </div>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            router.replace(conversationsHref(filter, days, query.trim()))
          }}
          className="relative w-full sm:w-64"
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted)]" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchLabel}
            maxLength={200}
            className="h-8 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] pr-8 pl-8 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-muted)] [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("")
                router.replace(conversationsHref(filter, days))
              }}
              aria-label={t.clearSearch}
              title={t.clearSearch}
              className="absolute top-1/2 right-1.5 grid h-5 w-5 -translate-y-1/2 cursor-pointer place-items-center rounded border-0 bg-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </form>
        <nav aria-label={t.filterLabel} className="flex gap-1 overflow-x-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-0.5">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={conversationsHref(f, days, search)}
              aria-current={filter === f ? "page" : undefined}
              className={cn(
                "flex h-8 shrink-0 items-center rounded-md px-2.5 text-xs font-semibold no-underline transition-colors",
                filter === f ? "bg-[var(--color-bubble)] text-[var(--color-text)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]",
              )}
            >
              {t.filters[f]}
            </Link>
          ))}
        </nav>
        {days && (
          <Link
            href={conversationsHref(filter, null, search)}
            title={t.allTime}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] pr-2 pl-3 text-xs font-semibold text-[var(--color-text)] no-underline transition-colors hover:border-[var(--color-muted)]"
          >
            {plural(days, t.lastDays, locale)}
            <X className="h-3.5 w-3.5 text-[var(--color-muted)]" aria-hidden />
            <span className="sr-only">{t.allTime}</span>
          </Link>
        )}
      </header>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-bubble)]" aria-hidden>
            <MessageSquareText className="h-5 w-5" />
          </span>
          <p className="font-medium">{unfiltered ? t.emptyAll : t.emptyFiltered}</p>
          <p className="max-w-sm text-sm text-[var(--color-muted)]">
            {unfiltered ? t.emptyAllText : search ? format(t.emptySearchText, { q: search }) : t.emptyFilteredText}
          </p>
          {unfiltered ? (
            <Link href="/dashboard/widget?section=install" className="mt-2 text-sm font-semibold">
              {t.install}
            </Link>
          ) : (
            <button type="button" onClick={() => router.push("/dashboard/conversations")} className="mt-2 cursor-pointer border-0 bg-transparent text-sm font-semibold text-[var(--color-text)] underline">
              {t.showAll}
            </button>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className={cn("flex min-h-0 w-full flex-col border-[var(--color-line)] lg:w-[22rem] lg:shrink-0 lg:border-r", selected && "max-lg:hidden")}>
            <ul className="min-h-0 flex-1 divide-y divide-[var(--color-line)] overflow-y-auto">
              {items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(c.id)}
                    onPointerEnter={() => prefetch(c.id)}
                    onFocus={() => prefetch(c.id)}
                    aria-current={selected === c.id ? "true" : undefined}
                    className={cn(
                      "flex w-full cursor-pointer flex-col gap-1.5 border-0 px-4 py-3 text-left text-[var(--color-text)] transition-colors",
                      selected === c.id ? "bg-[var(--color-bubble)]" : "bg-transparent hover:bg-[var(--color-surface)]",
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium">{visitorLabel(c, t.visitor)}</span>
                      <span className="shrink-0 text-[0.6875rem] text-[var(--color-muted)]">{timeAgo(c.updatedAt, locale)}</span>
                    </span>
                    <span className="line-clamp-2 text-sm text-[var(--color-muted)]">{c.preview || t.noQuestion}</span>
                    <ContextLine context={c.context} />
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[0.6875rem] text-[var(--color-muted)]">{plural(c.messageCount, t.messages, locale)}</span>
                      <Badges c={c} />
                    </span>
                  </button>
                </li>
              ))}
              {hasMore && (
                <li className="p-3">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--color-line)] bg-transparent text-sm font-semibold text-[var(--color-text)] disabled:opacity-50"
                  >
                    {loadingMore && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
                    {t.loadMore}
                  </button>
                </li>
              )}
            </ul>
          </div>
          <div className={cn("min-h-0 min-w-0 flex-1 flex-col", selected ? "flex" : "hidden lg:flex")}>
            {selected ? (
              <Transcript
                id={selected}
                summary={items.find((x) => x.id === selected)}
                cache={cache}
                canEdit={canEdit}
                onBack={() => setSelected(null)}
                onDeleted={(id) => {
                  cache.delete(id)
                  setItems((list) => list.filter((x) => x.id !== id))
                  setSelected(null)
                }}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-sm text-[var(--color-muted)]">{t.select}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
