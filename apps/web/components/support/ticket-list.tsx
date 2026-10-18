"use client"

import type { UserTicketRow } from "@apex/db"
import { ChevronRight, LifeBuoy, MessageSquareWarning } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import type { Jsonify } from "@/components/admin/detail-ui"
import { format } from "@/lib/i18n"
import { plural, timeAgo } from "@/lib/i18n/format"
import { openReportForm } from "@/lib/support-context"
import { primary } from "./report-dialog"
import { StatusBadge } from "./status-badge"

export type UserTicketRowJson = Jsonify<UserTicketRow>

/** /dashboard/support: the user's requests, newest activity first. `?new=1` opens the form. */
export function TicketList({ tickets }: { tickets: UserTicketRowJson[] }) {
  const { t: app, locale } = useAppI18n()
  const t = app.support
  const router = useRouter()
  const wantsNew = useSearchParams().get("new") === "1"

  useEffect(() => {
    if (!wantsNew) return
    // after the help menu, which listens for it, has mounted
    const id = setTimeout(openReportForm, 0)
    router.replace("/dashboard/support")
    return () => clearTimeout(id)
  }, [wantsNew, router])

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-raised)]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-lg font-semibold">{t.title}</h1>
          <p className="m-0 text-xs text-[var(--color-muted)]">{t.lede}</p>
        </div>
        <button type="button" onClick={openReportForm} className={primary}>
          <MessageSquareWarning className="h-4 w-4" aria-hidden /> {t.newTicket}
        </button>
      </header>

      <div className="flex w-full max-w-3xl flex-col gap-3 p-4 sm:p-6">
        {tickets.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-line)] px-6 py-14 text-center">
            <LifeBuoy className="h-8 w-8 text-[var(--color-muted)]" aria-hidden />
            <p className="m-0 font-medium">{t.empty}</p>
            <p className="m-0 max-w-sm text-sm text-[var(--color-muted)]">{t.emptyHint}</p>
          </div>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {tickets.map((ticket) => {
              const unread = ticket.lastFromStaff && ticket.status !== "closed"
              return (
                <li key={ticket.id}>
                  <Link
                    href={`/dashboard/support/${ticket.id}`}
                    className="flex items-center gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-[var(--color-text)] no-underline transition-colors hover:border-[var(--color-muted)]/60"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 font-mono text-xs text-[var(--color-muted)]">#{ticket.number}</span>
                        <span className={`truncate ${unread ? "font-semibold" : "font-medium"}`}>{ticket.subject}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
                        <StatusBadge status={ticket.status} />
                        {unread && <span className="font-semibold text-[var(--color-text)]">{t.newReply}</span>}
                        <span>{t.categories[ticket.category]}</span>
                        {ticket.siteName && <span>· {ticket.siteName}</span>}
                        <span>· {plural(ticket.messages, t.messages, locale)}</span>
                        <span>· {format(t.updated, { when: timeAgo(ticket.updatedAt, locale) })}</span>
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-muted)]" aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
