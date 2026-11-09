"use client"

import type { TicketStatus } from "@apex/db"
import { useAppI18n } from "@/components/i18n/app-provider"
import { cn } from "@/lib/utils"

export const STATUS_TONE: Record<TicketStatus, string> = {
  open: "bg-[var(--color-info)]/15 text-[var(--color-info)]",
  pending_user: "bg-[var(--color-warning)]/15 text-[var(--color-warning)]",
  in_progress: "bg-[var(--color-text)]/10 text-[var(--color-text)]",
  resolved: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
  closed: "bg-[var(--color-bubble)] text-[var(--color-muted)]",
}

/** A ticket's status as the customer reads it. */
export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  const { t } = useAppI18n()
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[status], className)}>{t.support.statuses[status]}</span>
}
