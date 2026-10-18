"use client"

import type { UserTicket } from "@apex/db"
import { ArrowLeft, CheckCircle2, LoaderCircle } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import type { Jsonify } from "@/components/admin/detail-ui"
import { format } from "@/lib/i18n"
import { formatDate } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { primary, secondary } from "./report-dialog"
import { StatusBadge } from "./status-badge"

export type UserTicketJson = Jsonify<UserTicket>

async function post(url: string, body: object): Promise<string | null> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  if (res.ok) return null
  const err = (await res.json().catch(() => null)) as { message?: string } | null
  return err?.message ?? ""
}

/** /dashboard/support/[id]: one request, the public replies on it, and the reply box. */
export function TicketThread({ data }: { data: UserTicketJson }) {
  const { t: app, locale } = useAppI18n()
  const t = app.support.thread
  const router = useRouter()
  const { ticket, messages } = data
  const [reply, setReply] = useState("")
  const [busy, setBusy] = useState<"reply" | "resolve" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const closed = ticket.status === "closed"
  const done = ticket.status === "resolved" || closed

  async function run(kind: "reply" | "resolve", url: string, body: object) {
    setBusy(kind)
    setError(null)
    setNotice(null)
    try {
      const failed = await post(url, body)
      if (failed !== null) return setError(failed || t.failed)
      if (kind === "reply") setReply("")
      else setNotice(t.resolvedDone)
      router.refresh()
    } catch {
      setError(navigator.onLine ? t.failed : app.support.form.offline)
    } finally {
      setBusy(null)
    }
  }

  function send(e: FormEvent) {
    e.preventDefault()
    if (reply.trim()) void run("reply", `/api/support/tickets/${ticket.id}/messages`, { body: reply })
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-1 border-b border-[var(--color-line)] bg-[var(--color-raised)]/95 px-4 py-3 backdrop-blur sm:px-6">
        <Link href="/dashboard/support" className="inline-flex w-fit items-center gap-1 text-xs text-[var(--color-muted)] no-underline hover:text-[var(--color-text)]">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {t.back}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 min-w-0 text-lg font-semibold">
            <span className="mr-2 font-mono text-sm font-normal text-[var(--color-muted)]">#{ticket.number}</span>
            {ticket.subject}
          </h1>
          <StatusBadge status={ticket.status} />
        </div>
        <p className="m-0 text-xs text-[var(--color-muted)]">
          {app.support.categories[ticket.category]} · {format(t.opened, { date: formatDate(ticket.createdAt, locale, { dateStyle: "medium", timeStyle: "short" }) })}
          {ticket.siteName && ` · ${format(t.site, { name: ticket.siteName })}`}
        </p>
      </header>

      <div className="flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                "flex max-w-[92%] flex-col gap-1 rounded-2xl border px-4 py-3",
                m.fromStaff ? "self-start border-[var(--color-line)] bg-[var(--color-surface)]" : "self-end border-transparent bg-[var(--color-bubble)]",
              )}
            >
              <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--color-muted)]">
                <span className="font-semibold text-[var(--color-text)]">{m.fromStaff ? t.team : t.you}</span>
                <time dateTime={m.createdAt}>{formatDate(m.createdAt, locale, { dateStyle: "medium", timeStyle: "short" })}</time>
              </span>
              <p className="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>
            </li>
          ))}
        </ol>

        {notice && (
          <p role="status" className="m-0 flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> {notice}
          </p>
        )}

        {closed ? (
          <p className="m-0 rounded-xl border border-dashed border-[var(--color-line)] px-4 py-3 text-sm text-[var(--color-muted)]">{t.closedNote}</p>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
            <label htmlFor="ticket-reply" className="text-sm font-medium">
              {t.reply}
            </label>
            {done && <p className="m-0 text-xs text-[var(--color-muted)]">{t.resolvedNote}</p>}
            <textarea
              id="ticket-reply"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={10_000}
              rows={4}
              placeholder={t.replyPlaceholder}
              className="resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-muted)]"
            />
            {error && (
              <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {!done && (
                <button type="button" onClick={() => run("resolve", `/api/support/tickets/${ticket.id}/resolve`, {})} disabled={busy !== null} className={secondary}>
                  {busy === "resolve" && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
                  {t.resolve}
                </button>
              )}
              <button type="submit" disabled={busy !== null || !reply.trim()} className={primary}>
                {busy === "reply" && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
                {t.send}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
