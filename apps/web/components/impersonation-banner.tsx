"use client"

import { Eye, LoaderCircle, LogOut } from "lucide-react"
import { useEffect, useState } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { IMPERSONATION_EXIT_PATH } from "@/lib/impersonation"

// The red bar on every page of the app while a superadmin views it as a user (read-only; see
// lib/impersonation.ts). globals.css moves the page down to make room for it. When the view runs out
// it ends itself, so the cookie goes and the staff member is back on that user's admin page.

/** Where to go next, or null when the exit didn't go through. */
async function exitView(): Promise<string | null> {
  const res = await fetch(IMPERSONATION_EXIT_PATH, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null)
  if (!res?.ok) return null
  const body = (await res.json().catch(() => null)) as { next?: string } | null
  return body?.next ?? "/admin"
}

export function ImpersonationBanner({ name, email, expiresAt }: { name: string; email: string; expiresAt: string }) {
  const { t: app } = useAppI18n()
  const t = app.admin?.impersonation
  const [now, setNow] = useState(() => Date.now())
  const [exiting, setExiting] = useState(false)
  const left = new Date(expiresAt).getTime() - now

  const exit = async () => {
    setExiting(true)
    const next = await exitView()
    // a full load, so every layout reads the staff session again
    if (next) window.location.assign(next)
    else setExiting(false)
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(timer)
  }, [])
  // ends itself the moment it runs out (setTimeout's ceiling is ~24 days; a view lasts 30 minutes)
  useEffect(() => {
    const timer = setTimeout(() => void exit(), Math.max(0, new Date(expiresAt).getTime() - Date.now()))
    return () => clearTimeout(timer)
  }, [expiresAt])

  if (!t) return null
  return (
    <div
      data-impersonation-bar
      role="status"
      className="fixed inset-x-0 top-0 z-[1000] flex h-10 items-center gap-3 bg-red-600 px-4 text-sm text-white shadow-md max-sm:px-3"
    >
      <Eye className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-medium">{t.banner.replace("{name}", name).replace("{email}", email)}</span>
      <span className="shrink-0 tabular-nums text-white/85 max-sm:hidden">{t.remaining.replace("{n}", String(Math.max(1, Math.ceil(left / 60_000))))}</span>
      <button
        type="button"
        onClick={exit}
        disabled={exiting}
        className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-white/60 bg-white px-2.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-70"
      >
        {exiting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <LogOut className="h-3.5 w-3.5" aria-hidden />}
        {exiting ? t.exiting : t.exit}
      </button>
    </div>
  )
}

/**
 * The cookie of a view that already ended (from another tab, or it ran out) keeps the browser
 * read-only until it goes; this drops it and reloads with the staff member's own session.
 */
export function StaleImpersonation() {
  useEffect(() => {
    // only once it went through, or a failing exit would reload forever
    void exitView().then((next) => next && window.location.reload())
  }, [])
  return null
}
