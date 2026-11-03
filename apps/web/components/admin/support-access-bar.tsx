"use client"

import { ArrowLeft, ShieldAlert } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { formatDate } from "@/lib/i18n/format"
import { button, fill, postJson } from "./detail-ui"

// Above a bot's inbox under support access (/admin/bots/[id]/conversations): whose conversations,
// until when, and a way to close the window early. When it runs out, the page reloads and the
// server shows that access has ended.
export function SupportAccessBar({ botId, botName, expiresAt, ticketRef }: { botId: string; botName: string; expiresAt: string; ticketRef: string | null }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.support
  const router = useRouter()
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => router.refresh(), Math.max(0, new Date(expiresAt).getTime() - Date.now()) + 1000)
    return () => clearTimeout(timer)
  }, [expiresAt, router])

  async function close() {
    setClosing(true)
    await postJson(`/api/admin/bots/${botId}/support-access-close`, {})
    router.push(`/admin/bots/${botId}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm sm:px-6">
      <Link href={`/admin/bots/${botId}`} aria-label={t.backToBot} title={t.backToBot} className="grid h-8 w-8 place-items-center rounded-md text-[var(--color-text)] hover:bg-amber-500/15">
        <ArrowLeft className="h-4 w-4" aria-hidden />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5 font-medium">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-800 dark:text-amber-200" aria-hidden />
          <span className="truncate">
            {fill(t.banner, { bot: botName, time: formatDate(expiresAt, locale, { timeStyle: "short" }) })}
            {ticketRef && ` · ${fill(t.ticket, { ref: ticketRef })}`}
          </span>
        </span>
        <span className="text-xs text-[var(--color-muted)]">{t.masked}</span>
      </div>
      <button type="button" onClick={close} disabled={closing} className={button}>
        {t.close}
      </button>
    </div>
  )
}
