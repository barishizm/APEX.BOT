"use client"

import { CircleAlert, CircleCheck, FileText, Globe, LoaderCircle, MessageSquareQuote, Paperclip } from "lucide-react"
import { useCallback } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { format } from "@/lib/i18n"
import { plural, timeAgo } from "@/lib/i18n/format"
import type { SourceJson } from "@/lib/knowledge"
import { cn } from "@/lib/utils"

export type Limits = {
  plan: "free" | "starter" | "pro" | "business"
  sources: number
  websitePages: number
  websiteDocuments: number
  textChars: number
  fileChars: number
  fileBytes: number
  title: number
  chunksPerBot: number
  /** Off while staff have file uploads turned off for this workspace. */
  fileUploads: boolean
}
/** Replies in the last 30 days that cited each source, by source id. */
export type Usage = Record<string, number>

async function send(path: string, method: string, offline: string, body?: object) {
  try {
    const res = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { message: offline } }
  }
}

// `send` with the offline message in the current language
export function useSend() {
  const offline = useAppI18n().t.knowledge.offline
  return useCallback((path: string, method: string, body?: object) => send(path, method, offline, body), [offline])
}

export const needsAttention = (s: SourceJson) => s.status === "failed" || s.status === "pending"

export function SourceIcon({ source, size = "md" }: { source: SourceJson; size?: "md" | "lg" }) {
  const Icon = source.managed ? MessageSquareQuote : source.kind === "website" ? Globe : source.kind === "file" ? Paperclip : FileText
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-lg bg-[var(--color-bubble)]", size === "lg" ? "h-11 w-11 rounded-xl" : "h-9 w-9")}
      aria-hidden
    >
      <Icon className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
    </span>
  )
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[0.6875rem] font-semibold",
        tone === "accent"
          ? "border-[var(--color-secondary)]/40 bg-[var(--color-secondary)]/10 text-[var(--color-text)]"
          : "border-[var(--color-line)] bg-[var(--color-bubble)] text-[var(--color-muted)]",
      )}
    >
      {children}
    </span>
  )
}

export function StatusLine({ source }: { source: SourceJson }) {
  const { t: app, locale } = useAppI18n()
  const t = app.knowledge.status
  if (source.status === "pending") {
    return <span className="text-amber-700 dark:text-amber-400">{t.pending}</span>
  }
  if (source.status === "syncing") {
    return (
      <span className="flex items-center gap-1.5 text-[var(--color-muted)]">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
        {t.reading}
      </span>
    )
  }
  if (source.status === "failed") {
    return (
      <span className="flex items-start gap-1.5 text-red-600 dark:text-red-400">
        <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          {source.error ?? t.failed}
          {source.chunks > 0 && <span className="text-[var(--color-muted)]">{t.previousInUse}</span>}
        </span>
      </span>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 text-[var(--color-muted)]">
      <CircleCheck className="h-3.5 w-3.5 text-green-600" aria-hidden />
      {source.kind === "website" ? `${plural(source.pages, t.pages, locale)} · ` : ""}
      {plural(source.chunks, t.excerpts, locale)}
      {source.syncedAt && ` · ${format(t.updated, { when: timeAgo(source.syncedAt, locale) })}`}
      {source.error && <span className="text-amber-600 dark:text-amber-400">· {source.error}</span>}
    </span>
  )
}

/** How often recent replies quoted this source; only meaningful once it has excerpts. */
export function CitedLine({ source, replies }: { source: SourceJson; replies: number | undefined }) {
  const { t: app, locale } = useAppI18n()
  const t = app.knowledge.usage
  if (source.chunks === 0) return null
  return replies ? (
    <span className="text-[var(--color-text)]">{plural(replies, t.cited, locale)}</span>
  ) : (
    <span className="text-[var(--color-muted)]">{t.never}</span>
  )
}

export const segmented = "flex rounded-lg bg-[var(--color-bubble)] p-0.5 text-sm"
export const segment = (active: boolean) =>
  cn(
    "inline-flex cursor-pointer items-center gap-1.5 rounded-md border-0 px-2.5 py-1 font-medium whitespace-nowrap transition-colors",
    active ? "bg-[var(--color-raised)] text-[var(--color-text)] shadow-sm" : "bg-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]",
  )
export const outlineButton =
  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-transparent px-2.5 text-xs font-semibold text-[var(--color-text)] hover:border-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-50"
export const primaryButton =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border-0 bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-on-primary)] disabled:cursor-not-allowed disabled:opacity-50"
