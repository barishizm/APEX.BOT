"use client"

import { ArrowLeft, BookPlus, CircleHelp, LifeBuoy, LoaderCircle, Mail, MessageSquareText, ThumbsDown, ThumbsUp, Trash2, UserRound } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Fragment, useEffect, useState, type ReactNode } from "react"
import { FILTERS, type ConversationJson, type SummaryJson } from "@/lib/conversations"
import { cn } from "@/lib/utils"
import type { ConversationFilter } from "@apex/db"

function when(iso: string) {
  const d = new Date(iso)
  const s = (Date.now() - d.getTime()) / 1000
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`
  return d.toLocaleDateString("en", { day: "numeric", month: "short" })
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
  return (
    <>
      {!!c.unansweredCount && (
        <Badge tone="amber">
          <CircleHelp className="h-3 w-3" aria-hidden /> {c.unansweredCount} unanswered
        </Badge>
      )}
      {c.handoffAt && (
        <Badge tone="blue">
          <LifeBuoy className="h-3 w-3" aria-hidden /> Hand-off
        </Badge>
      )}
      {c.visitorEmail && (
        <Badge tone="green">
          <UserRound className="h-3 w-3" aria-hidden /> Lead
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

function Transcript({ id, canEdit, onDeleted, onBack }: { id: string; canEdit: boolean; onDeleted: (id: string) => void; onBack: () => void }) {
  const [data, setData] = useState<ConversationJson | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let live = true
    setData(null)
    setError(null)
    setConfirming(false)
    fetch(`/api/conversations/${id}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!live) return
        if (res.ok) setData(body)
        else setError(body.message ?? "Couldn't load this conversation")
      })
      .catch(() => live && setError("You're offline. Check your connection and try again"))
    return () => {
      live = false
    }
  }, [id])

  const remove = async () => {
    setDeleting(true)
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => null)
    setDeleting(false)
    if (res && (res.ok || res.status === 404)) onDeleted(id)
    else setError("Couldn't delete this conversation")
  }

  const firstQuestion = data?.messages.find((m) => m.role === "user")?.content ?? ""

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to the list"
          className="grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-[var(--color-line)] bg-transparent text-[var(--color-text)] lg:hidden"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate font-semibold">{data?.visitor?.name || data?.visitor?.email || "Anonymous visitor"}</p>
          <p className="truncate text-xs text-[var(--color-muted)]">
            {data ? `${data.origin?.replace(/^https?:\/\//, "") ?? "Unknown site"} · started ${new Date(data.createdAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}` : " "}
          </p>
        </div>
        {data?.visitor?.email && (
          <a
            href={`mailto:${data.visitor.email}?subject=${encodeURIComponent("Your question on our website")}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-line)] px-2.5 text-xs font-semibold text-[var(--color-text)] no-underline hover:border-[var(--color-muted)]"
          >
            <Mail className="h-3.5 w-3.5" aria-hidden /> Reply by email
          </a>
        )}
        {canEdit &&
          data &&
          (confirming ? (
            <span className="flex items-center gap-2">
              <button type="button" onClick={remove} disabled={deleting} className="h-8 cursor-pointer rounded-md border-0 bg-red-600 px-3 text-xs font-semibold text-white disabled:opacity-50">
                {deleting ? "Deleting…" : "Delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="h-8 cursor-pointer rounded-md border border-[var(--color-line)] bg-transparent px-3 text-xs font-semibold text-[var(--color-text)]"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label="Delete conversation"
              title="Delete conversation"
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
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </p>
        )}
        {data && (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {data.visitor && (
              <p className="rounded-lg bg-[var(--color-surface)] p-3 text-sm">
                <span className="font-semibold">Contact details: </span>
                {[data.visitor.name, data.visitor.email, data.visitor.phone].filter(Boolean).join(" · ")}
              </p>
            )}
            {data.messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex flex-col items-end gap-1">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--color-primary)] px-4 py-2.5 text-sm text-[var(--color-on-primary)]">{m.content}</p>
                  <span className="text-[0.6875rem] text-[var(--color-muted)]">{new Date(m.createdAt).toLocaleTimeString("en", { timeStyle: "short" })}</span>
                </div>
              ) : (
                <div key={m.id} className="flex flex-col items-start gap-1.5">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-[var(--color-bubble)] px-4 py-2.5 text-sm">
                    <RichText text={m.content} />
                  </p>
                  <div className="flex max-w-[85%] flex-wrap items-center gap-1.5 text-[0.6875rem] text-[var(--color-muted)]">
                    {m.unanswered && (
                      <Badge tone="amber">
                        <CircleHelp className="h-3 w-3" aria-hidden /> No matching content
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
                    {m.feedback === "up" && <ThumbsUp className="h-3.5 w-3.5 text-green-600" aria-label="Visitor found this helpful" />}
                    {m.feedback === "down" && <ThumbsDown className="h-3.5 w-3.5 text-red-600" aria-label="Visitor found this unhelpful" />}
                  </div>
                </div>
              ),
            )}
            {data.handoffAt && (
              <p className="flex items-center gap-2 self-center rounded-full bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-muted)]">
                <LifeBuoy className="h-3.5 w-3.5" aria-hidden />
                Sent to your team by email · {new Date(data.handoffAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}
              </p>
            )}
            {data.messages.some((m) => m.unanswered) && (
              <div className="mt-2 flex flex-col items-start gap-2 rounded-xl border border-dashed border-[var(--color-line)] p-4 text-sm">
                <p>The assistant couldn&apos;t answer part of this conversation. Add the missing information so it can next time.</p>
                <Link
                  href={`/dashboard/knowledge?title=${encodeURIComponent(firstQuestion.slice(0, 120))}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 text-xs font-semibold no-underline"
                  style={{ color: "var(--color-on-primary)" }}
                >
                  <BookPlus className="h-3.5 w-3.5" aria-hidden /> Add an answer
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
  canEdit,
}: {
  initial: SummaryJson[]
  hasMore: boolean
  filter: ConversationFilter
  canEdit: boolean
}) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  // a new filter arrives as new server props
  useEffect(() => {
    setItems(initial)
    setHasMore(initialHasMore)
    setSelected(null)
  }, [initial, initialHasMore])

  const loadMore = async () => {
    const last = items.at(-1)
    if (!last) return
    setLoadingMore(true)
    const res = await fetch(`/api/conversations?filter=${filter}&before=${encodeURIComponent(last.updatedAt)}`).catch(() => null)
    setLoadingMore(false)
    if (!res?.ok) return
    const data = await res.json()
    setItems((list) => [...list, ...data.conversations.filter((c: SummaryJson) => !list.some((x) => x.id === c.id))])
    setHasMore(data.hasMore)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--color-line)] px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-lg font-semibold">Conversations</h1>
          <p className="truncate text-xs text-[var(--color-muted)]">What visitors asked your assistant. Deleted automatically after your retention period.</p>
        </div>
        <nav aria-label="Filter conversations" className="flex gap-1 overflow-x-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-0.5">
          {FILTERS.map((f) => (
            <Link
              key={f.id}
              href={f.id === "all" ? "/dashboard/conversations" : `/dashboard/conversations?filter=${f.id}`}
              aria-current={filter === f.id ? "page" : undefined}
              className={cn(
                "flex h-8 shrink-0 items-center rounded-md px-2.5 text-xs font-semibold no-underline transition-colors",
                filter === f.id ? "bg-[var(--color-bubble)] text-[var(--color-text)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-bubble)]" aria-hidden>
            <MessageSquareText className="h-5 w-5" />
          </span>
          <p className="font-medium">{filter === "all" ? "No conversations yet" : "Nothing here"}</p>
          <p className="max-w-sm text-sm text-[var(--color-muted)]">
            {filter === "all" ? "Conversations appear here as soon as visitors chat with the widget on your website." : "No conversations match this filter."}
          </p>
          {filter === "all" ? (
            <Link href="/dashboard/widget?section=install" className="mt-2 text-sm font-semibold">
              Install the widget
            </Link>
          ) : (
            <button type="button" onClick={() => router.push("/dashboard/conversations")} className="mt-2 cursor-pointer border-0 bg-transparent text-sm font-semibold text-[var(--color-text)] underline">
              Show all conversations
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
                    aria-current={selected === c.id ? "true" : undefined}
                    className={cn(
                      "flex w-full cursor-pointer flex-col gap-1.5 border-0 px-4 py-3 text-left text-[var(--color-text)] transition-colors",
                      selected === c.id ? "bg-[var(--color-bubble)]" : "bg-transparent hover:bg-[var(--color-surface)]",
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium">{c.visitorName || c.visitorEmail || "Anonymous visitor"}</span>
                      <span className="shrink-0 text-[0.6875rem] text-[var(--color-muted)]">{when(c.updatedAt)}</span>
                    </span>
                    <span className="line-clamp-2 text-sm text-[var(--color-muted)]">{c.preview || "(no question yet)"}</span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[0.6875rem] text-[var(--color-muted)]">{c.messageCount} messages</span>
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
                    Load more
                  </button>
                </li>
              )}
            </ul>
          </div>
          <div className={cn("min-h-0 min-w-0 flex-1 flex-col", selected ? "flex" : "hidden lg:flex")}>
            {selected ? (
              <Transcript
                id={selected}
                canEdit={canEdit}
                onBack={() => setSelected(null)}
                onDeleted={(id) => {
                  setItems((list) => list.filter((x) => x.id !== id))
                  setSelected(null)
                }}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-sm text-[var(--color-muted)]">Select a conversation to read it.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
