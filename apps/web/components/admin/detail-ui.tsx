"use client"

import { LoaderCircle } from "lucide-react"
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import type { Locale } from "@/lib/i18n/config"
import { formatDate, timeAgo } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"

// Building blocks of the admin detail pages (/admin/users/[id], /admin/workspaces/[id]): cards, small
// tables, and the confirm dialog every audited action goes through (reason, then a step-up code
// from the authenticator app when the action needs one).

export type Jsonify<T> = T extends Date ? string : T extends (infer U)[] ? Jsonify<U>[] : T extends object ? { [K in keyof T]: Jsonify<T[K]> } : T

export const card = "flex flex-col gap-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 sm:p-5"
export const field =
  "rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] px-3 text-sm font-normal text-[var(--color-text)] outline-none focus:border-amber-500"
export const button =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] px-3 text-sm font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-muted)]/60 disabled:cursor-not-allowed disabled:opacity-50"
export const dangerButton = "border-red-500/40 text-red-700 hover:border-red-500 hover:bg-red-500/5 dark:text-red-300"
export const primaryButton = "border-amber-600 bg-amber-500 text-black hover:bg-amber-400"
export const tag = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
export const th = "whitespace-nowrap px-3 py-2 font-semibold"
export const td = "px-3 py-2.5 align-top"

export type PostResult = { ok: true; data: unknown } | { ok: false; code: string; message: string }

export async function postJson(url: string, body: object): Promise<PostResult> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" })
  if (res.ok) return { ok: true, data: res.status === 204 ? null : await res.json().catch(() => null) }
  const err = (await res.json().catch(() => null)) as { error?: string; message?: string } | null
  return { ok: false, code: err?.error ?? "server_error", message: err?.message ?? "" }
}

export const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m))

export function Section({ title, children, count }: { title: string; children: ReactNode; count?: number }) {
  return (
    <section className={card}>
      <h2 className="m-0 flex items-center gap-2 text-base font-semibold">
        {title}
        {count !== undefined && <span className="text-sm font-normal text-[var(--color-muted)]">({count})</span>}
      </h2>
      {children}
    </section>
  )
}

export function When({ at, locale }: { at: string; locale: Locale }) {
  return (
    <time dateTime={at} title={formatDate(at, locale, { dateStyle: "medium", timeStyle: "short" })} className="whitespace-nowrap">
      {timeAgo(at, locale)}
    </time>
  )
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-line)]">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-[var(--color-raised)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
          <tr>
            {head.map((h, i) => (
              <th key={`${i}-${h}`} scope="col" className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="m-0 text-sm text-[var(--color-muted)]">{children}</p>

/**
 * A modal for one audited action: asks for the reason, and for an authenticator code first when
 * `stepUp` is set and the last one is older than the server accepts. `children` holds the action's own
 * fields; `ready` says they are filled in. `submit` gets the reason and posts the action.
 */
export function ConfirmDialog({
  title,
  text,
  danger,
  stepUp,
  ready = true,
  submit,
  onClose,
  onDone,
  children,
}: {
  title: string
  text: string
  danger?: boolean
  stepUp: boolean
  ready?: boolean
  submit: (reason: string) => Promise<PostResult>
  onClose: () => void
  onDone: (data: unknown) => void
  children?: ReactNode
}) {
  const { t: app } = useAppI18n()
  const t = app.admin!.users.detail.dialog
  const titleId = useId()
  const [reason, setReason] = useState("")
  const [code, setCode] = useState("")
  // null until the step-up check answers; true when a code must be typed first
  const [needCode, setNeedCode] = useState<boolean | null>(stepUp ? null : false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!stepUp) return
    let live = true
    fetch("/api/admin/step-up", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ stepUpUntil: string | null }>) : { stepUpUntil: null }))
      .then((r) => live && setNeedCode(!r.stepUpUntil || new Date(r.stepUpUntil).getTime() - Date.now() < 15_000))
      .catch(() => live && setNeedCode(true))
    return () => {
      live = false
    }
  }, [stepUp])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onClose])

  const canSubmit = ready && reason.trim() && needCode !== null && (!needCode || /^\d{6}$/.test(code.replace(/\s/g, "")))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit || busy) return
    setBusy(true)
    setError(null)
    try {
      if (needCode) {
        const step = await postJson("/api/admin/step-up", { code })
        if (!step.ok) return setError(step.message || t.failed)
        setNeedCode(false)
        setCode("")
      }
      const res = await submit(reason)
      if (res.ok) return onDone(res.data)
      // the confirmation ran out between opening the dialog and confirming
      if (res.code === "step_up_required") setNeedCode(true)
      setError(res.message || t.failed)
    } finally {
      setBusy(false)
    }
  }

  const label = "flex flex-col gap-1.5 text-sm font-medium"
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => !busy && onClose()} aria-hidden />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={onSubmit}
        className="relative flex max-h-[90dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 text-[var(--color-text)] shadow-2xl"
        style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="m-0 text-lg font-semibold">
            {title}
          </h2>
          <p className="m-0 text-sm text-[var(--color-muted)]">{text}</p>
        </div>

        {children}

        <label className={label}>
          {t.reason}
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={3} required className={`${field} resize-y py-2`} />
          <span className="text-xs font-normal text-[var(--color-muted)]">{t.reasonHint}</span>
        </label>

        {needCode && (
          <label className={label}>
            {t.stepUp}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              pattern="\d{3}\s?\d{3}"
              className={`${field} h-10 font-mono tracking-widest`}
            />
            <span className="text-xs font-normal text-[var(--color-muted)]">{t.stepUpHint}</span>
          </label>
        )}

        {error && (
          <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={button}>
            {t.cancel}
          </button>
          <button type="submit" disabled={!canSubmit || busy} className={cn(button, danger ? "border-red-600 bg-red-600 text-white hover:bg-red-500" : primaryButton)}>
            {(busy || needCode === null) && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
            {busy ? t.working : t.confirm}
          </button>
        </div>
      </form>
    </div>
  )
}
