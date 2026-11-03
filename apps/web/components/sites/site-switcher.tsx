"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Check, ChevronsUpDown, Globe, Plus, Settings2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import type { SitesJson } from "@/lib/bot"
import { format } from "@/lib/i18n"
import { createSite, selectSite } from "./api"

const row =
  "flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3 text-left text-sm text-[var(--color-text)] no-underline transition-colors hover:bg-[var(--color-bubble)] disabled:cursor-not-allowed disabled:opacity-50"

// Header pill: which website the dashboard shows, and the way to another one
export function SiteSwitcher({ sites }: { sites: SitesJson }) {
  const { t: app } = useAppI18n()
  const t = app.sites
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const current = sites.sites.find((s) => s.id === sites.currentId)
  const full = sites.sites.length >= sites.limit

  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  useEffect(() => {
    if (open) return
    setAdding(false)
    setName("")
    setMessage(null)
  }, [open])

  async function choose(id: string) {
    if (id === sites.currentId) return setOpen(false)
    setBusy(true)
    const res = await selectSite(id, t)
    // every page holds the shown site's data in client state: load it fresh
    if (res.ok) return window.location.reload()
    setBusy(false)
    setMessage(res.message)
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const res = await createSite(name, t)
    // a new website starts at the overview, which shows its first setup step
    if (res.ok) return window.location.assign("/dashboard")
    setBusy(false)
    setMessage(res.message)
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={t.switcher.open}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 min-w-0 max-w-[14rem] cursor-pointer items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-raised)] px-3 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-muted)]/60 max-sm:max-w-[9rem]"
      >
        <Globe className="h-4 w-4 shrink-0 text-[var(--color-muted)]" aria-hidden />
        <span className="truncate font-medium">{current?.name ?? t.title}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted)]" aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={t.switcher.list}
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.8 }}
            style={{ transformOrigin: "top left" }}
            className="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-[var(--color-line)] bg-[var(--color-raised)] p-2 shadow-[var(--shadow-pop)] max-sm:w-[calc(100vw-2rem)]"
          >
            <p className="m-0 px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">{t.switcher.list}</p>
            <ul className="m-0 flex max-h-72 list-none flex-col overflow-auto p-0">
              {sites.sites.map((s) => (
                <li key={s.id}>
                  <button type="button" disabled={busy} onClick={() => choose(s.id)} className={row} aria-current={s.id === sites.currentId ? "true" : undefined}>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${s.live ? "bg-[#16a34a]" : "bg-[var(--color-line)]"}`} aria-hidden />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{s.name}</span>
                      <span className="truncate text-xs text-[var(--color-muted)]">{s.origins[0]?.replace(/^https?:\/\//, "") ?? t.item.noOrigins}</span>
                    </span>
                    {s.id === sites.currentId && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-1 border-t border-[var(--color-line)] pt-1">
              {sites.canEdit &&
                (adding ? (
                  <form onSubmit={add} className="flex flex-col gap-2 p-2">
                    <label htmlFor="new-site-name" className="text-sm font-medium">
                      {t.add.label}
                    </label>
                    <input
                      id="new-site-name"
                      autoFocus
                      value={name}
                      maxLength={sites.nameMax}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t.add.placeholder}
                      className="h-9 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)]"
                    />
                    <p className="m-0 text-xs text-[var(--color-muted)]">{t.add.hint}</p>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={busy || !name.trim()}
                        className="h-9 flex-1 cursor-pointer rounded-lg border-0 bg-[var(--color-primary)] px-3 text-sm font-semibold text-[var(--color-on-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t.add.submit}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdding(false)}
                        className="h-9 cursor-pointer rounded-lg border border-[var(--color-line)] bg-transparent px-3 text-sm font-semibold text-[var(--color-text)]"
                      >
                        {t.add.cancel}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button type="button" disabled={full} onClick={() => setAdding(true)} className={row} title={full ? format(t.add.limit, { limit: sites.limit }) : undefined}>
                    <Plus className="h-4 w-4 shrink-0" aria-hidden />
                    {t.switcher.add}
                  </button>
                ))}
              <Link href="/dashboard/sites" onClick={() => setOpen(false)} className={row}>
                <Settings2 className="h-4 w-4 shrink-0" aria-hidden />
                {t.switcher.manage}
              </Link>
            </div>
            {message && (
              <p role="alert" className="m-0 px-3 pb-2 text-sm text-red-700 dark:text-red-300">
                {message}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
