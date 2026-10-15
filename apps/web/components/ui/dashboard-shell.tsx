"use client"

import { BookOpen, CircleHelp, LayoutDashboard, ListChecks, MessageSquareText, Palette, Search, Settings, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"
import { CommandPalette } from "./command-palette"
import { PrismFluxLoader } from "./prism-flux-loader"
import { ProfileMenu } from "./profile-menu"

export type NavLabel = "Overview" | "Knowledge" | "Conversations" | "Widget" | "Setup" | "Settings"

const NAV: { label: NavLabel; icon: LucideIcon; href: string }[] = [
  { label: "Overview", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Knowledge", icon: BookOpen, href: "/dashboard/knowledge" },
  { label: "Conversations", icon: MessageSquareText, href: "/dashboard/conversations" },
  { label: "Widget", icon: Palette, href: "/dashboard/widget" },
  { label: "Setup", icon: ListChecks, href: "/dashboard/onboarding/list" },
]

const pill = "flex h-9 items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-raised)] px-3 text-sm"

function RailLink({ label, active, href, external, children }: { label: string; active?: boolean; href: string; external?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      {...(external && { target: "_blank", rel: "noopener noreferrer" })}
      className={`group relative flex h-10 w-10 items-center justify-center rounded-lg no-underline transition-colors ${
        active
          ? "bg-[var(--color-bubble)] text-[var(--color-text)]"
          : "text-[var(--color-muted)] hover:bg-[var(--color-bubble)] hover:text-[var(--color-text)]"
      }`}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full z-20 ml-3 whitespace-nowrap rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-[var(--color-on-primary)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </Link>
  )
}

/** Ring that fills as setup steps are completed. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 7
  const c = 2 * Math.PI * r
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="-rotate-90">
      <circle cx="9" cy="9" r={r} fill="none" stroke="var(--color-line)" strokeWidth="2.5" />
      <circle cx="9" cy="9" r={r} fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${(done / total) * c} ${c}`} />
    </svg>
  )
}

export function DashboardShell({
  children,
  intro,
  user,
  setup,
  active = "Overview",
}: {
  children?: ReactNode
  intro?: boolean
  user: { username: string; email: string }
  setup: { done: number; total: number }
  /** Label of the rail item to highlight. */
  active?: NavLabel
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(intro)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Fresh login/register: a short welcome while the dashboard settles, then drop
  // ?welcome so a refresh doesn't replay it
  useEffect(() => {
    if (!intro) return
    const t = setTimeout(() => {
      setLoading(false)
      router.replace("/dashboard")
    }, 1600)
    return () => clearTimeout(t)
  }, [intro, router])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const complete = setup.done >= setup.total

  return (
    <div className="flex h-dvh flex-col bg-[var(--color-surface)] text-[var(--color-text)]">
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-surface)]">
          <PrismFluxLoader />
        </div>
      )}
      <header className="flex h-14 shrink-0 items-center gap-3 pr-3">
        <Link href="/dashboard" aria-label="Apex Bot dashboard" className="-mr-3 flex h-14 w-16 shrink-0 items-center justify-center">
          <img src="/brand/mini-logo.png" alt="" className="block h-11 w-11 rounded-xl" />
        </Link>

        {!complete && (
          <Link href="/dashboard/onboarding/list" className={`${pill} text-[var(--color-text)] no-underline max-sm:hidden`}>
            <ProgressRing done={setup.done} total={setup.total} />
            <span>Complete setup</span>
            <span className="text-[var(--color-muted)]">
              ({setup.done}/{setup.total})
            </span>
          </Link>
        )}

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="mx-auto flex h-9 w-full max-w-[28rem] cursor-pointer items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-raised)] px-4 text-sm text-[var(--color-muted)] transition-colors hover:border-[var(--color-muted)]/60"
        >
          <Search className="h-4 w-4" aria-hidden />
          <span className="truncate">Search or go to…</span>
          <kbd className="ml-auto font-sans text-xs max-sm:hidden">⌘ K</kbd>
        </button>

        <a href="/docs" target="_blank" rel="noopener noreferrer" className={`${pill} ml-auto text-[var(--color-text)] no-underline max-md:hidden`}>
          Docs
        </a>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Main" className="flex w-16 shrink-0 flex-col items-center gap-2 py-2">
          {NAV.map(({ label, icon: Icon, href }) => (
            <RailLink key={label} label={label} href={href} active={label === active}>
              <Icon className="h-5 w-5" aria-hidden />
            </RailLink>
          ))}

          <div className="mt-auto flex flex-col items-center gap-2">
            <RailLink label="Account settings" href="/dashboard/settings" active={active === "Settings"}>
              <Settings className="h-5 w-5" aria-hidden />
            </RailLink>
            <RailLink label="Help & docs" href="/docs" external>
              <CircleHelp className="h-5 w-5" aria-hidden />
            </RailLink>
            <ProfileMenu name={user.username} email={user.email} />
          </div>
        </nav>

        <main
          id="main"
          className="min-w-0 flex-1 overflow-auto rounded-tl-2xl border-l border-t border-[var(--color-line)] bg-[var(--color-raised)]"
        >
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
