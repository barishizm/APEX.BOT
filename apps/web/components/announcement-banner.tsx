"use client"

import { AlertTriangle, Info, OctagonAlert, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useI18n } from "@/components/i18n/provider"
import { cn } from "@/lib/utils"

// Announcement and maintenance banners staff publish in /admin/announcements. The dashboard gets
// them from the server already narrowed to the viewer's workspace and language; the public pages
// are prerendered, so MarketingAnnouncements asks /api/announcements once they load.
//
// Closing one is remembered by this browser (localStorage), per announcement and version: when
// staff change the text, it shows again. The dashboard also shows its own banners this way, such as a
// failed payment (components/dashboard/frame.tsx); those can't be closed and may link somewhere.

export interface AnnouncementJson {
  id: string
  level: "info" | "warn" | "critical"
  text: string
  dismissible: boolean
  /** updatedAt, so an edited announcement comes back after being closed. */
  version: string
  /** A link after the text, for the dashboard's own banners. */
  action?: { label: string; href: string }
}

const STORAGE_KEY = "apex:dismissed-announcements"
const KEEP = 50

const dismissKey = (a: AnnouncementJson) => `${a.id}:${a.version}`

function readDismissed(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown
    return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : []
  } catch {
    return []
  }
}

const TONE = {
  info: { icon: Info, bar: "bg-[var(--color-secondary)] text-[var(--color-surface)]", card: "border-[var(--color-info)]/40 bg-[color-mix(in_srgb,var(--color-info)_8%,var(--color-raised))] text-[var(--color-text)]", mark: "text-[var(--color-info)]" },
  warn: { icon: AlertTriangle, bar: "bg-[var(--color-warning-solid)] text-[#0c0c09]", card: "border-[var(--color-warning)]/50 bg-[color-mix(in_srgb,var(--color-warning)_10%,var(--color-raised))] text-[var(--color-text)]", mark: "text-[var(--color-warning)]" },
  critical: { icon: OctagonAlert, bar: "bg-[var(--color-danger-solid)] text-white", card: "border-[var(--color-danger)]/50 bg-[color-mix(in_srgb,var(--color-danger)_10%,var(--color-raised))] text-[var(--color-text)]", mark: "text-[var(--color-danger)]" },
} as const

export function AnnouncementBanners({ items, variant = "bar" }: { items: AnnouncementJson[]; variant?: "bar" | "floating" }) {
  const { t } = useI18n()
  // null until this browser's closed ones are read; until then only the ones that can't be closed show
  const [dismissed, setDismissed] = useState<Set<string> | null>(null)
  useEffect(() => setDismissed(new Set(readDismissed())), [])

  const shown = items.filter((a) => (a.dismissible ? dismissed !== null && !dismissed.has(dismissKey(a)) : true))
  if (!shown.length) return null

  const dismiss = (a: AnnouncementJson) => {
    const keys = [...readDismissed().filter((k) => k !== dismissKey(a)), dismissKey(a)].slice(-KEEP)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
    } catch {}
    setDismissed(new Set(keys))
  }

  return (
    <div
      role="region"
      aria-label={t.announcement.label}
      className={cn(variant === "floating" ? "fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-3 sm:p-4" : "flex shrink-0 flex-col")}
    >
      {shown.map((a) => {
        const tone = TONE[a.level]
        const Icon = tone.icon
        return (
          <div
            key={a.id}
            role={a.level === "critical" ? "alert" : "status"}
            className={cn(
              "flex items-start gap-3 text-sm",
              variant === "floating" ? cn("w-full max-w-3xl rounded-xl border px-4 py-3 shadow-[var(--shadow-pop)]", tone.card) : cn("px-4 py-2 max-sm:px-3", tone.bar),
            )}
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", variant === "floating" && tone.mark)} aria-hidden />
            <p className="m-0 min-w-0 flex-1 font-medium leading-snug">
              {a.text}
              {a.action && (
                <>
                  {" "}
                  <Link href={a.action.href} className="whitespace-nowrap text-current underline underline-offset-2 hover:no-underline">
                    {a.action.label}
                  </Link>
                </>
              )}
            </p>
            {a.dismissible && (
              <button
                type="button"
                onClick={() => dismiss(a)}
                aria-label={t.announcement.dismiss}
                className="-my-1 -mr-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-current opacity-80 hover:bg-black/10 hover:opacity-100"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** The public site's banners: announcements to everyone that staff marked for the website. */
export function MarketingAnnouncements() {
  const { locale } = useI18n()
  const [items, setItems] = useState<AnnouncementJson[]>([])
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/announcements?locale=${locale}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ announcements: AnnouncementJson[] }>) : null))
      .then((r) => r && setItems(r.announcements))
      .catch(() => {})
    return () => controller.abort()
  }, [locale])
  return <AnnouncementBanners items={items} variant="floating" />
}
