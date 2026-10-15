"use client"

import {
  Activity,
  BookOpen,
  Code2,
  Cpu,
  CornerDownLeft,
  Languages,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  LogOut,
  MessageSquareText,
  MousePointerClick,
  Palette,
  Search,
  Settings,
  Settings2,
  Sparkles,
  SunMoon,
  type LucideIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { useSetLocale } from "@/components/i18n/use-set-locale"
import { LOCALE_META, LOCALES, localizePath, type Locale } from "@/lib/i18n"
import type { AppDictionary } from "@/lib/i18n/app"
import { cn } from "@/lib/utils"

type Command = { label: string; group: string; icon: LucideIcon; keywords?: string; run: (go: (href: string) => void) => void }

const nav = (href: string) => (go: (href: string) => void) => go(href)

function toggleTheme() {
  const root = document.documentElement
  const dark = !root.classList.contains("dark")
  root.dataset.theme = dark ? "dark" : "light"
  root.classList.toggle("dark", dark)
  try {
    localStorage.setItem("theme", dark ? "dark" : "light")
  } catch {}
}

type Strings = AppDictionary["shell"]["palette"]

function buildCommands(t: Strings, locale: Locale, setLocale: (l: Locale) => void): Command[] {
  const c = t.commands
  const g = t.groups
  return [
    { group: g.goTo, label: c.overview, icon: LayoutDashboard, keywords: "home dashboard panel", run: nav("/dashboard") },
    { group: g.goTo, label: c.knowledge, icon: BookOpen, keywords: "sources website text faq crawl kaynak site metin", run: nav("/dashboard/knowledge") },
    { group: g.goTo, label: c.conversations, icon: MessageSquareText, keywords: "inbox chats messages leads sohbet mesaj", run: nav("/dashboard/conversations") },
    { group: g.goTo, label: c.setup, icon: ListChecks, keywords: "onboarding progress kurulum", run: nav("/dashboard/onboarding/list") },
    { group: g.goTo, label: c.settings, icon: Settings, keywords: "password username profile şifre kullanıcı", run: nav("/dashboard/settings") },
    { group: g.widget, label: c.general, icon: Settings2, keywords: "name company language isim şirket dil", run: nav("/dashboard/widget?section=general") },
    { group: g.widget, label: c.appearance, icon: Palette, keywords: "color launcher theme font renk tema", run: nav("/dashboard/widget?section=appearance") },
    { group: g.widget, label: c.messages, icon: MessageSquareText, keywords: "greeting suggestions disclaimer karşılama öneri", run: nav("/dashboard/widget?section=messages") },
    { group: g.widget, label: c.behavior, icon: MousePointerClick, keywords: "auto open teaser sources otomatik", run: nav("/dashboard/widget?section=behavior") },
    { group: g.widget, label: c.model, icon: Cpu, keywords: "claude openai gemini temperature model", run: nav("/dashboard/widget?section=model") },
    { group: g.widget, label: c.persona, icon: Sparkles, keywords: "tone instructions topics confidence üslup talimat", run: nav("/dashboard/widget?section=persona") },
    { group: g.widget, label: c.handoff, icon: LifeBuoy, keywords: "human email lead capture insan e-posta", run: nav("/dashboard/widget?section=handoff") },
    { group: g.widget, label: c.install, icon: Code2, keywords: "embed snippet allowed websites site key limits kod anahtar", run: nav("/dashboard/widget?section=install") },
    { group: g.help, label: c.docs, icon: BookOpen, keywords: "help guide yardım rehber", run: () => window.open(localizePath("/docs", locale), "_blank", "noopener") },
    { group: g.help, label: c.status, icon: Activity, run: () => window.open(localizePath("/status", locale), "_blank", "noopener") },
    ...LOCALES.filter((l) => l !== locale).map((l) => ({
      group: g.language,
      label: LOCALE_META[l].name,
      icon: Languages,
      keywords: "language dil",
      run: () => setLocale(l),
    })),
    { group: g.actions, label: c.theme, icon: SunMoon, keywords: "theme light dark tema", run: () => toggleTheme() },
    {
      group: g.actions,
      label: c.logOut,
      icon: LogOut,
      keywords: "sign out çıkış",
      run: async () => {
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {})
        window.location.replace(localizePath("/", locale))
      },
    },
  ]
}

// Case- and accent-insensitive, so "turkce" finds "Türkçe" and "i" finds "İ"
const norm = (s: string) => s.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i")

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t: app, locale } = useAppI18n()
  const t = app.shell.palette
  const setLocale = useSetLocale()
  const commands = useMemo(() => buildCommands(t, locale, setLocale), [t, locale, setLocale])
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  const results = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return commands
    return commands.filter((c) => norm(`${c.label} ${c.group} ${c.keywords ?? ""}`).includes(q))
  }, [query, commands])

  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement as HTMLElement | null
    setQuery("")
    setIndex(0)
    requestAnimationFrame(() => inputRef.current?.focus())
    return () => returnFocus.current?.focus?.()
  }, [open])

  useEffect(() => setIndex(0), [query])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" })
  }, [index])

  if (!open) return null

  const run = (c: Command | undefined) => {
    if (!c) return
    onClose()
    c.run((href) => router.push(href))
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setIndex((i) => (results.length ? (i + 1) % results.length : 0))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      run(results[index])
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    } else if (e.key === "Tab") {
      // the input is the only stop; arrows move through results
      e.preventDefault()
    }
  }

  let lastGroup = ""
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.dialog}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-raised)] text-[var(--color-text)] shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-[var(--color-line)] px-4">
          <Search className="h-4 w-4 shrink-0 text-[var(--color-muted)]" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t.placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={results[index] ? `command-${index}` : undefined}
            className="h-12 min-w-0 flex-1 border-0 bg-transparent text-[0.9375rem] text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]"
          />
          <kbd className="rounded border border-[var(--color-line)] px-1.5 font-sans text-[0.6875rem] text-[var(--color-muted)]">Esc</kbd>
        </div>
        <ul ref={listRef} id="command-results" role="listbox" className="overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-[var(--color-muted)]">{t.noMatches.replace("{query}", query)}</li>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null
            lastGroup = c.group
            return (
              <li key={`${c.group}-${c.label}`} role="presentation">
                {header && <p className="px-3 pb-1 pt-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--color-muted)]">{header}</p>}
                <div
                  id={`command-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === index}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => run(c)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                    i === index ? "bg-[var(--color-bubble)] text-[var(--color-text)]" : "text-[var(--color-text)]",
                  )}
                >
                  <c.icon className="h-4 w-4 shrink-0 text-[var(--color-muted)]" aria-hidden />
                  <span className="flex-1">{c.label}</span>
                  {i === index && <CornerDownLeft className="h-3.5 w-3.5 text-[var(--color-muted)]" aria-hidden />}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
