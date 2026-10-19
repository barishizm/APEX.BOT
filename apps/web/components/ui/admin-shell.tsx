"use client"

import { ArrowLeft, Search, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"
import { ADMIN_NAV, isActiveSection } from "@/components/admin/nav"
import { useAppI18n } from "@/components/i18n/app-provider"
import { CommandPalette } from "./command-palette"
import { ProfileMenu } from "./profile-menu"

// The admin area's frame. Same layout as DashboardShell, kept monochrome; the ADMIN badge is what
// tells it apart from a customer's dashboard.

const pill = "flex h-9 items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-raised)] px-3 text-sm"

function RailLink({ label, active, href, children }: { label: string; active?: boolean; href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg no-underline transition-colors ${
        active
          ? "bg-[var(--color-bubble)] text-[var(--color-text)]"
          : "text-[var(--color-muted)] hover:bg-[var(--color-bubble)] hover:text-[var(--color-text)]"
      }`}
    >
      {active && <span aria-hidden className="absolute -left-3 h-5 w-1 rounded-r-full bg-[var(--color-text)]" />}
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full z-20 ml-3 whitespace-nowrap rounded-lg bg-[var(--color-text)] px-3 py-1.5 text-sm font-medium text-[var(--color-surface)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </Link>
  )
}

export function AdminShell({
  children,
  user,
}: {
  children: ReactNode
  user: { name: string; email: string; platformRole: "superadmin" | "support" }
}) {
  const { t: app } = useAppI18n()
  // the admin layout only renders for staff, whose dictionary always carries these strings
  const t = app.admin!
  const pathname = usePathname()
  const [paletteOpen, setPaletteOpen] = useState(false)

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

  return (
    <div className="admin-mono flex h-dvh flex-col bg-[var(--color-surface)] text-[var(--color-text)]">
      <header className="flex h-14 shrink-0 items-center gap-3 pr-3">
        <Link href="/admin" aria-label={t.home} className="-mr-3 flex h-14 w-16 shrink-0 items-center justify-center">
          <img src="/brand/mini-logo.png" alt="" className="block h-11 w-11 rounded-xl" />
        </Link>

        <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-text)] px-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text)]">
          <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {t.badge}
        </span>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="mx-auto flex h-9 w-full max-w-[28rem] cursor-pointer items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-raised)] px-4 text-sm text-[var(--color-muted)] transition-colors hover:border-[var(--color-muted)]"
        >
          <Search className="h-4 w-4" aria-hidden />
          <span className="truncate">{app.shell.search}</span>
          <kbd className="ml-auto font-sans text-xs max-sm:hidden">⌘ K</kbd>
        </button>

        <Link href="/dashboard" className={`${pill} ml-auto text-[var(--color-text)] no-underline max-md:hidden`}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t.backToDashboard}
        </Link>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label={t.mainNav} className="flex w-16 shrink-0 flex-col items-center gap-1 py-2 [@media(max-height:700px)]:overflow-y-auto">
          {ADMIN_NAV.map(({ key, href, icon: Icon }) => (
            <RailLink key={key} label={t.nav[key]} href={href} active={isActiveSection(href, pathname)}>
              <Icon className="h-5 w-5" aria-hidden />
            </RailLink>
          ))}

          <div className="mt-auto flex flex-col items-center gap-2 pt-2">
            <ProfileMenu name={user.name} email={user.email} platformRole={user.platformRole} />
          </div>
        </nav>

        <main
          id="main"
          className="min-w-0 flex-1 overflow-auto rounded-tl-2xl border-l border-t border-[var(--color-line)] bg-[var(--color-raised)]"
        >
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} platformRole={user.platformRole} />
    </div>
  )
}
