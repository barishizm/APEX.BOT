"use client"

import {
  BarChart3,
  CircleDollarSign,
  CircleHelp,
  Inbox,
  MessageSquareText,
  PlayCircle,
  Plus,
  Search,
  Settings,
  UserPlus,
} from "lucide-react"
import type { ReactNode } from "react"

const NAV = [
  { label: "Inbox", icon: Inbox, active: true },
  { label: "Conversations", icon: MessageSquareText },
  { label: "Leads", icon: UserPlus },
  { label: "Playbooks", icon: PlayCircle },
  { label: "Analytics", icon: BarChart3 },
]

const pill =
  "flex h-9 items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-raised)] px-3 text-sm"

function RailButton({
  label,
  active,
  badge,
  children,
}: {
  label: string
  active?: boolean
  badge?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`group relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border-0 transition-colors ${
        active
          ? "bg-[var(--color-bubble)] text-[var(--color-text)]"
          : "bg-transparent text-[var(--color-muted)] hover:bg-[var(--color-bubble)] hover:text-[var(--color-text)]"
      }`}
    >
      {children}
      {badge && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500" />}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full z-20 ml-3 whitespace-nowrap rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-[var(--color-on-primary)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </button>
  )
}

export function DashboardShell({ children }: { children?: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-[var(--color-surface)] text-[var(--color-text)]">
      <header className="flex h-14 shrink-0 items-center gap-3 pr-3">
        <div className="-mr-3 flex h-14 w-16 shrink-0 items-center justify-center">
          <img src="/brand/mini-logo.png" alt="Apex Bot" className="block h-11 w-11 rounded-xl" />
        </div>

        <div className={`${pill} max-md:hidden`}>
          <CircleDollarSign className="h-4 w-4 text-[var(--color-muted)]" aria-hidden />
          <span className="font-semibold">$0.00</span>
          <span className="text-[var(--color-muted)]">Sales closed</span>
        </div>
        <button type="button" className={`${pill} cursor-pointer max-sm:hidden`}>
          <span
            aria-hidden
            className="h-4 w-4 rounded-full border-2 border-[var(--color-line)] border-t-green-500"
          />
          <span>Complete setup</span>
          <span className="text-[var(--color-muted)]">(1/5)</span>
        </button>

        <div className="mx-auto flex h-9 w-full max-w-[28rem] items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-raised)] px-4 text-sm text-[var(--color-muted)]">
          <Search className="h-4 w-4" aria-hidden />
          <span className="truncate">Search or go to...</span>
          <kbd className="ml-auto font-sans text-xs max-sm:hidden">⌘ K</kbd>
        </div>

        <div className={`${pill} ml-auto gap-3 pl-1.5 pr-1`}>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-secondary)] text-xs font-semibold text-[var(--color-surface)]">
            B
          </span>
          <button
            type="button"
            aria-label="Invite teammate"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--color-primary)] text-[var(--color-on-primary)]"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Main" className="flex w-16 shrink-0 flex-col items-center gap-2 py-2">
          {NAV.map(({ label, icon: Icon, active }) => (
            <RailButton key={label} label={label} active={active}>
              <Icon className="h-5 w-5" />
            </RailButton>
          ))}

          <div className="mt-auto flex flex-col items-center gap-2">
            <div className="flex h-10 w-10 flex-col items-center justify-center rounded-lg bg-[var(--color-bubble)] leading-none">
              <span className="text-lg font-bold">14</span>
              <span className="text-[0.625rem] text-[var(--color-muted)]">days</span>
            </div>
            <RailButton label="Settings" badge>
              <Settings className="h-5 w-5" />
            </RailButton>
            <RailButton label="Help">
              <CircleHelp className="h-5 w-5" />
            </RailButton>
            <span className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-secondary)] text-sm font-semibold text-[var(--color-surface)]">
              B
            </span>
          </div>
        </nav>

        <main
          id="main"
          className="min-w-0 flex-1 overflow-auto rounded-tl-2xl border-l border-t border-[var(--color-line)] bg-[var(--color-raised)]"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
