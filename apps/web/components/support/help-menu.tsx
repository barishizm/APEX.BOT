"use client"

import { Activity, BookOpen, CircleHelp, LifeBuoy, MessageSquareWarning } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { REPORT_EVENT, trackErrors } from "@/lib/support-context"
import { ReportDialog } from "./report-dialog"

const item =
  "flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3 text-left text-sm font-medium text-[var(--color-text)] no-underline transition-colors hover:bg-[var(--color-bubble)]"

/**
 * The rail's help button: docs, "Report a problem", the user's support requests and the status
 * page. It also owns the report form, which other pages open with openReportForm().
 */
export function HelpMenu({ site, active }: { site: { id: string; name: string } | null; active?: boolean }) {
  const { t: app, href } = useAppI18n()
  const t = app.support.menu
  const [open, setOpen] = useState(false)
  const [reporting, setReporting] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    trackErrors()
    const onReport = () => setReporting(true)
    window.addEventListener(REPORT_EVENT, onReport)
    return () => window.removeEventListener(REPORT_EVENT, onReport)
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={t.open}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border-0 transition-colors ${
          active || open ? "bg-[var(--color-bubble)] text-[var(--color-text)]" : "bg-transparent text-[var(--color-muted)] hover:bg-[var(--color-bubble)] hover:text-[var(--color-text)]"
        }`}
      >
        <CircleHelp className="h-5 w-5" aria-hidden />
        {!open && (
          <span
            role="tooltip"
            className="pointer-events-none absolute left-full z-20 ml-3 whitespace-nowrap rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-[var(--color-on-primary)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            {t.open}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t.open}
          className="absolute bottom-0 left-full z-30 ml-4 flex w-64 flex-col gap-0.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-raised)] p-1.5 shadow-2xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setReporting(true)
            }}
            className={item}
          >
            <MessageSquareWarning className="h-4 w-4 text-[var(--color-muted)]" aria-hidden /> {t.report}
          </button>
          <Link role="menuitem" href="/dashboard/support" onClick={() => setOpen(false)} className={item}>
            <LifeBuoy className="h-4 w-4 text-[var(--color-muted)]" aria-hidden /> {t.tickets}
          </Link>
          <div className="my-1 border-t border-[var(--color-line)]" />
          <a role="menuitem" href={href("/docs")} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={item}>
            <BookOpen className="h-4 w-4 text-[var(--color-muted)]" aria-hidden /> {t.docs}
          </a>
          <a role="menuitem" href={href("/status")} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={item}>
            <Activity className="h-4 w-4 text-[var(--color-muted)]" aria-hidden /> {t.status}
          </a>
        </div>
      )}

      {reporting && <ReportDialog site={site} onClose={() => setReporting(false)} />}
    </div>
  )
}
