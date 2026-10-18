"use client"

import type { TicketStatus } from "@apex/db"
import { useAppI18n } from "@/components/i18n/app-provider"
import { cn } from "@/lib/utils"

export const STATUS_TONE: Record<TicketStatus, string> = {
  open: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
  pending_user: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  in_progress: "bg-violet-500/15 text-violet-800 dark:text-violet-200",
  resolved: "bg-green-500/15 text-green-800 dark:text-green-300",
  closed: "bg-[var(--color-bubble)] text-[var(--color-muted)]",
}

/** A ticket's status as the customer reads it. */
export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  const { t } = useAppI18n()
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[status], className)}>{t.support.statuses[status]}</span>
}
