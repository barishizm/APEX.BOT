"use client"

import type { BillingEventIssue } from "@apex/db"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { formatNumber } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { ConfirmDialog, fill, postJson, Table, tag, td, When, type Jsonify } from "./detail-ui"

// The unprocessed webhooks on /admin/billing, each with "Process again": POST
// /api/admin/billing/webhook-replay with a reason and a step-up, then the page reloads from the server.

type Event = Jsonify<BillingEventIssue>

const linkButton = "cursor-pointer whitespace-nowrap border-0 bg-transparent p-0 text-xs font-medium text-[var(--color-text)] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"

export function BillingWebhooks({ events, canReplay }: { events: Event[]; canReplay: boolean }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.billing.webhooks
  const router = useRouter()
  const [replaying, setReplaying] = useState<Event | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  function done(data: unknown) {
    const r = (data ?? {}) as { outcome?: string; error?: string | null }
    const text = (r.outcome && t.outcomes[r.outcome]) || r.outcome || ""
    setNotice({ ok: r.outcome === "applied" || r.outcome === "stale" || r.outcome === "ignored", text: r.error ? `${text} ${r.error}` : text })
    setReplaying(null)
    router.refresh()
  }

  return (
    <>
      {notice && (
        <p
          role="status"
          className={cn(
            "m-0 break-words rounded-lg px-3 py-2 text-sm",
            notice.ok ? "bg-green-500/10 text-green-800 dark:text-green-300" : "bg-red-500/10 text-red-700 dark:text-red-300",
          )}
        >
          {notice.text}
        </p>
      )}
      <Table head={[t.columns.event, t.columns.received, t.columns.attempts, t.columns.error, t.columns.actions]}>
        {events.map((e) => (
          <tr key={e.id} className="border-t border-[var(--color-line)]">
            <td className={td}>
              <span className="block font-medium">{e.eventType}</span>
              <code className="break-all text-xs text-[var(--color-muted)]">{e.eventId}</code>
            </td>
            <td className={td}>
              <When at={e.receivedAt} locale={locale} />
            </td>
            <td className={cn(td, "tabular-nums")}>{formatNumber(e.attempts, locale)}</td>
            <td className={cn(td, "max-w-sm")}>
              {e.error ? (
                <span className="block break-words text-xs text-red-700 dark:text-red-300">{e.error}</span>
              ) : (
                <span className={cn(tag, "bg-[var(--color-raised)] text-[var(--color-muted)]")}>{t.waiting}</span>
              )}
            </td>
            <td className={td}>
              <button type="button" className={linkButton} disabled={!canReplay} title={canReplay ? undefined : t.off} onClick={() => (setNotice(null), setReplaying(e))}>
                {t.replay}
              </button>
            </td>
          </tr>
        ))}
      </Table>
      {replaying && (
        <ConfirmDialog
          title={t.replay}
          text={fill(t.replayText, { type: replaying.eventType })}
          stepUp
          submit={(reason) => postJson("/api/admin/billing/webhook-replay", { reason, eventId: replaying.id })}
          onClose={() => setReplaying(null)}
          onDone={done}
        />
      )}
    </>
  )
}
