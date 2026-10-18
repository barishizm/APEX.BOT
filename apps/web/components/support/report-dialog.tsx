"use client"

import { LoaderCircle } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useId, useState, type FormEvent } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { Turnstile, TURNSTILE_SITE_KEY } from "@/components/ui/turnstile"
import { format } from "@/lib/i18n"
import { browserLabel, reportContext, type ReportContext } from "@/lib/support-context"

export const CATEGORIES = ["bug", "widget", "knowledge", "account", "billing", "other"] as const

const field = "rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] px-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-muted)]"
const label = "flex flex-col gap-1.5 text-sm font-medium"
export const primary =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border-0 bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-on-primary)] no-underline disabled:cursor-not-allowed disabled:opacity-50"
export const secondary =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-transparent px-3 text-sm font-semibold text-[var(--color-text)] no-underline transition-colors hover:border-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-50"

/** The "Report a problem" form: topic, subject, what happened, and the technical details it attaches. */
export function ReportDialog({ site, onClose }: { site: { id: string; name: string } | null; onClose: () => void }) {
  const { t: app, locale } = useAppI18n()
  const t = app.support.form
  const router = useRouter()
  const titleId = useId()
  const [context] = useState<ReportContext>(() => reportContext())
  const [category, setCategory] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [attach, setAttach] = useState(true)
  const [human, setHuman] = useState<string | null>(null)
  const [humanReset, setHumanReset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ id: string; number: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onClose])

  const ready = category && subject.trim() && body.trim() && (!TURNSTILE_SITE_KEY || human)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category,
          subject,
          body,
          botId: site?.id ?? null,
          locale,
          context: attach ? { page: context.page, browser: context.browser, lastError: context.lastError } : {},
          turnstileToken: human,
        }),
      })
      const data = (await res.json().catch(() => null)) as { ticket?: { id: string; number: number }; message?: string } | null
      if (!res.ok || !data?.ticket) {
        setError(data?.message || t.failed)
        return
      }
      setSent(data.ticket)
      router.refresh()
    } catch {
      setError(navigator.onLine ? t.failed : t.offline)
    } finally {
      setBusy(false)
      // tokens are single use
      setHumanReset((n) => n + 1)
    }
  }

  const detail = "grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onClose()} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[90dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 text-[var(--color-text)] shadow-2xl"
      >
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="m-0 text-lg font-semibold">
            {t.title}
          </h2>
          {!sent && <p className="m-0 text-sm text-[var(--color-muted)]">{t.lede}</p>}
        </div>

        {sent ? (
          <>
            <p role="status" className="m-0 text-sm">
              {format(t.sent, { ref: `#${sent.number}` })}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={onClose} className={secondary}>
                {t.close}
              </button>
              <Link href={`/dashboard/support/${sent.id}`} onClick={onClose} className={primary}>
                {t.view}
              </Link>
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <label className={label}>
              {t.category}
              <select value={category} onChange={(e) => setCategory(e.target.value)} required className={`${field} h-10 cursor-pointer`}>
                <option value="" disabled>
                  {t.chooseCategory}
                </option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {app.support.categories[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              {t.subject}
              <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required placeholder={t.subjectPlaceholder} className={`${field} h-10`} />
            </label>
            <label className={label}>
              {t.body}
              <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={10_000} rows={5} required placeholder={t.bodyPlaceholder} className={`${field} resize-y py-2`} />
            </label>

            <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-line)] p-3">
              <label className="flex cursor-pointer items-start gap-2 text-sm font-medium">
                <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} className="mt-0.5 h-4 w-4 cursor-pointer" />
                <span className="flex flex-col gap-0.5">
                  {t.include}
                  <span className="text-xs font-normal text-[var(--color-muted)]">{t.includeHint}</span>
                </span>
              </label>
              {attach && (
                <dl className={`${detail} m-0 pl-6 text-[var(--color-muted)]`}>
                  {site && (
                    <>
                      <dt>{t.site}</dt>
                      <dd className="m-0 truncate text-[var(--color-text)]">{site.name}</dd>
                    </>
                  )}
                  <dt>{t.page}</dt>
                  <dd className="m-0 truncate font-mono text-[var(--color-text)]">{context.page}</dd>
                  <dt>{t.browser}</dt>
                  <dd className="m-0 truncate text-[var(--color-text)]">
                    {browserLabel(context.browser.userAgent)} · {context.browser.viewport} · {context.browser.language}
                  </dd>
                  <dt>{t.lastError}</dt>
                  <dd className="m-0 break-words text-[var(--color-text)]">{context.lastError ? context.lastError.message : t.noError}</dd>
                </dl>
              )}
            </div>

            <Turnstile onToken={setHuman} resetKey={humanReset} />

            {error && (
              <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={onClose} disabled={busy} className={secondary}>
                {t.cancel}
              </button>
              <button type="submit" disabled={!ready || busy} className={primary}>
                {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
                {busy ? t.sending : t.send}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
