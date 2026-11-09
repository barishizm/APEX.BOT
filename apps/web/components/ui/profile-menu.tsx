"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, BookOpen, Contrast, Moon, Power, Settings, ShieldCheck, Sun } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { useSetLocale } from "@/components/i18n/use-set-locale"
import { LOCALE_META, LOCALES, localizePath } from "@/lib/i18n"

type Theme = "light" | "dark" | "system"

const THEMES = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Contrast },
] as const

function savedTheme(): Theme {
  const set = document.documentElement.dataset.theme
  return set === "light" || set === "dark" ? set : "system"
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  if (theme === "system") delete root.dataset.theme
  else root.dataset.theme = theme
  root.classList.toggle("dark", dark)
  try {
    if (theme === "system") localStorage.removeItem("theme")
    else localStorage.setItem("theme", theme)
  } catch {}
}

const group = "overflow-hidden rounded-xl bg-[var(--color-bubble)]"
const row =
  "flex min-h-12 w-full items-center justify-between gap-3 border-0 bg-transparent px-4 text-left text-[0.95rem] font-medium text-[var(--color-text)]"
const rowButton = `${row} cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]`
const divider = "border-t border-[var(--color-surface)]"

export function ProfileMenu({
  name,
  email,
  platformRole = null,
}: {
  name: string
  email: string
  /** Platform staff get a badge on the avatar and in the menu. */
  platformRole?: "superadmin" | "support" | null
}) {
  const { t: app, locale, href } = useAppI18n()
  const t = app.shell.profile
  // staff only (the dictionary carries it only for them): the admin panel, or back out of it
  const admin = platformRole ? app.admin : undefined
  const inAdmin = usePathname().startsWith("/admin")
  const setLocale = useSetLocale()
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>("system")
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setTheme(savedTheme()), [])

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

  function chooseTheme(next: Theme) {
    applyTheme(next)
    setTheme(next)
  }

  async function logOut() {
    // the session cookie is httpOnly, so only the server can clear it
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {})
    // replace, so Back doesn't return to the dashboard
    window.location.replace(localizePath("/", locale))
  }

  const initial = name.charAt(0).toUpperCase()

  return (
    <div ref={rootRef} className="relative mb-1">
      <button
        ref={triggerRef}
        type="button"
        aria-label={t.open}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--color-secondary)] text-sm font-semibold text-[var(--color-surface)] transition-transform active:scale-95"
      >
        {initial}
        {platformRole && (
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-warning-solid)] text-white"
          >
            <ShieldCheck className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={t.dialog}
            initial={{ opacity: 0, scale: 0.96, x: -8, y: 8 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, x: -8, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.8 }}
            style={{ transformOrigin: "bottom left" }}
            className="absolute bottom-0 left-full z-30 ml-4 w-80 rounded-2xl border border-[var(--color-line)] bg-[var(--color-raised)] p-4 shadow-[var(--shadow-pop)] max-sm:w-[calc(100vw-5.5rem)]"
          >
            <div className="flex items-center gap-4 px-2 pb-4 pt-2">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary)] text-lg font-semibold text-[var(--color-surface)]">
                {initial}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{name}</p>
                <p className="truncate text-sm text-[var(--color-muted)]">{email}</p>
                {platformRole && (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--color-warning)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--color-warning)]">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {t[platformRole]}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className={group}>
                <div className={row}>
                  <span>{t.theme}</span>
                  <div
                    role="radiogroup"
                    aria-label={t.themeGroup}
                    className="-mr-2 flex rounded-lg bg-[var(--color-surface)] p-0.5"
                  >
                    {THEMES.map(({ value, icon: Icon }) => {
                      const label = t[value]
                      return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={theme === value}
                        aria-label={label}
                        title={label}
                        onClick={() => chooseTheme(value)}
                        className={`relative flex h-8 w-9 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent transition-colors ${
                          theme === value
                            ? "text-[var(--color-text)]"
                            : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                        }`}
                      >
                        {theme === value && (
                          <motion.span
                            layoutId="profile-theme-pill"
                            className="absolute inset-0 rounded-md bg-[var(--color-raised)] shadow-sm"
                            transition={{ type: "spring", stiffness: 500, damping: 38 }}
                          />
                        )}
                        <Icon className="relative h-4 w-4" />
                      </button>
                      )
                    })}
                  </div>
                </div>
                <div className={`${row} ${divider}`}>
                  <span>{t.language}</span>
                  <div role="radiogroup" aria-label={t.language} className="-mr-2 flex rounded-lg bg-[var(--color-surface)] p-0.5">
                    {LOCALES.map((l) => (
                      <button
                        key={l}
                        type="button"
                        role="radio"
                        aria-checked={locale === l}
                        lang={LOCALE_META[l].hreflang}
                        aria-label={LOCALE_META[l].name}
                        title={LOCALE_META[l].name}
                        onClick={() => setLocale(l)}
                        className={`h-8 cursor-pointer rounded-md border-0 px-2.5 text-xs font-semibold transition-colors ${
                          locale === l
                            ? "bg-[var(--color-raised)] text-[var(--color-text)] shadow-sm"
                            : "bg-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
                        }`}
                      >
                        {l.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {admin && (
                <Link
                  href={inAdmin ? "/dashboard" : "/admin"}
                  onClick={() => setOpen(false)}
                  className={`${rowButton} rounded-xl bg-[var(--color-warning)]/15 text-[var(--color-warning)] no-underline hover:bg-[var(--color-warning)]/25`}
                >
                  {inAdmin ? admin.backToDashboard : admin.entry}
                  {inAdmin ? <ArrowLeft className="h-4 w-4" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
                </Link>
              )}

              <div className={group}>
                <Link href="/dashboard/settings" onClick={() => setOpen(false)} className={`${rowButton} no-underline`}>
                  {t.settings}
                  <Settings className="h-4 w-4 text-[var(--color-muted)]" aria-hidden />
                </Link>
                <a href={href("/docs")} target="_blank" rel="noopener noreferrer" className={`${rowButton} ${divider} no-underline`}>
                  {t.help}
                  <BookOpen className="h-4 w-4 text-[var(--color-muted)]" aria-hidden />
                </a>
              </div>

              <button type="button" onClick={logOut} className={`${rowButton} rounded-xl`}>
                {t.logOut}
                <Power className="h-4 w-4 text-[var(--color-muted)]" aria-hidden />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
