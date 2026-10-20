"use client"

import { Lock } from "lucide-react"
import type { ReactNode } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"

// A feature the workspace's plan doesn't include: why it is locked, and the way to the plans.
// The server refuses it either way (@apex/db/entitlements); this only explains.
// `inline` for a hint that already sits in a paragraph.
export function UpgradeNote({ children, upgrade, inline }: { children: ReactNode; upgrade: string; inline?: boolean }) {
  const { href } = useAppI18n()
  const Tag = inline ? "span" : "p"
  return (
    <Tag className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-relaxed text-[var(--color-muted)]">
      <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
      <a href={href("/pricing")} className="font-semibold text-[var(--color-text)] underline underline-offset-2">
        {upgrade}
      </a>
    </Tag>
  )
}
