"use client"

import { BookPlus, CircleCheck, CircleHelp, EyeOff, LoaderCircle, MessageSquareText } from "lucide-react"
import Link from "next/link"
import { useEffect, useId, useRef, useState } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import type { UnansweredGroup } from "@/lib/analytics"
import { format } from "@/lib/i18n"
import { formatNumber, plural, timeAgo } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { BetaBadge, card } from "./charts"

export interface AnswerLimits {
  question: number
  answerMin: number
  answer: number
}

type Notice = { tone: "ok"; text: string; sourceLink?: boolean } | { tone: "error"; text: string }

const button =
  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold no-underline transition-colors disabled:cursor-default disabled:opacity-50"
const quiet = `${button} border-0 bg-transparent text-[var(--color-muted)] hover:bg-[var(--color-bubble)] hover:text-[var(--color-text)]`
const field =
  "w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] px-3 py-2 font-[inherit] text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-muted)]"

async function post(body: Record<string, unknown>, fallback: string) {
  const res = await fetch("/api/analytics/unanswered", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null)
  const json = res ? await res.json().catch(() => ({})) : {}
  if (!res?.ok) throw new Error(typeof json.message === "string" ? json.message : fallback)
  return json as { resolved: number; source?: { title: string } }
}

function AnswerForm({
  group,
  limits,
  onDone,
  onCancel,
}: {
  group: UnansweredGroup
  limits: AnswerLimits
  onDone: (sourceTitle: string) => void
  onCancel: () => void
}) {
  const { t: app, locale } = useAppI18n()
  const t = app.analytics.unanswered
  const id = useId()
  const [question, setQuestion] = useState(group.question.slice(0, limits.question))
  const [answer, setAnswer] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const answerRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => answerRef.current?.focus(), [])

  const valid = question.trim().length > 0 && answer.trim().length >= limits.answerMin
  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await post({ action: "answer", question, answer, replyIds: group.replyIds }, t.failed)
      onDone(res.source?.title ?? app.analytics.answersSource)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failed)
      setSaving(false)
    }
  }

  return (
    <form
      className="mt-3 flex flex-col gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-raised)] p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel()
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save()
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-q`} className="text-xs font-semibold">
          {t.question}
        </label>
        <input id={`${id}-q`} value={question} maxLength={limits.question} onChange={(e) => setQuestion(e.target.value)} className={field} aria-describedby={`${id}-qh`} />
        <p id={`${id}-qh`} className="text-xs text-[var(--color-muted)]">
          {t.questionHelp}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`${id}-a`} className="text-xs font-semibold">
            {t.answer}
          </label>
          <span className="text-xs text-[var(--color-muted)] tabular-nums" aria-live="polite">
            {format(t.count, { n: formatNumber(answer.length, locale), max: formatNumber(limits.answer, locale) })}
          </span>
        </div>
        <textarea
          id={`${id}-a`}
          ref={answerRef}
          value={answer}
          maxLength={limits.answer}
          rows={4}
          placeholder={t.answerPlaceholder}
          onChange={(e) => setAnswer(e.target.value)}
          className={cn(field, "min-h-24 resize-y")}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className={quiet}>
          {t.cancel}
        </button>
        <button
          type="submit"
          disabled={!valid || saving}
          className={`${button} border-0 bg-[var(--color-primary)] px-3`}
          style={{ color: "var(--color-on-primary)" }}
        >
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <BookPlus className="h-4 w-4" aria-hidden />}
          {saving ? t.saving : t.save}
        </button>
      </div>
    </form>
  )
}

export function UnansweredQuestions({
  groups: initial,
  open: initialOpen,
  canEdit,
  limits,
}: {
  groups: UnansweredGroup[]
  open: number
  canEdit: boolean
  limits: AnswerLimits
}) {
  const { t: app, locale } = useAppI18n()
  const t = app.analytics.unanswered
  const [groups, setGroups] = useState(initial)
  const [open, setOpen] = useState(initialOpen)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const listRef = useRef<HTMLOListElement>(null)

  // a new period or a refresh arrives as new props
  useEffect(() => {
    setGroups(initial)
    setOpen(initialOpen)
    setEditing(null)
  }, [initial, initialOpen])

  const remove = (g: UnansweredGroup) => {
    setGroups((gs) => gs.filter((x) => x.key !== g.key))
    setOpen((n) => Math.max(0, n - g.replyIds.length))
    setEditing(null)
    // keep keyboard focus in the list instead of losing it with the removed row
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>("button, a")?.focus())
  }

  const dismiss = async (g: UnansweredGroup) => {
    setBusy(g.key)
    setNotice(null)
    try {
      await post({ action: "dismiss", replyIds: g.replyIds }, t.failed)
      remove(g)
      setNotice({ tone: "ok", text: t.dismissed })
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : t.failed })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={card} aria-labelledby="unanswered-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="unanswered-title" className="flex items-center gap-2 font-semibold">
            <CircleHelp className="h-4 w-4 text-[var(--color-muted)]" aria-hidden />
            {t.title}
            <BetaBadge />
            {open > 0 && (
              <span className="rounded-full bg-[var(--color-warning)]/15 px-2 py-px text-xs font-semibold text-[var(--color-warning)]">{plural(open, t.open, locale)}</span>
            )}
          </h2>
          <p className="text-sm text-[var(--color-muted)]">{t.description}</p>
        </div>
      </div>

      <div aria-live="polite" className="empty:hidden">
        {notice && (
          <p
            role={notice.tone === "error" ? "alert" : undefined}
            className={cn(
              "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-2 text-sm",
              notice.tone === "ok" ? "bg-[var(--color-success)]/10 text-[var(--color-success)]" : "bg-[var(--color-danger)]/10 text-[var(--color-danger)]",
            )}
          >
            {notice.tone === "ok" && <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />}
            {notice.text}
            {notice.tone === "ok" && notice.sourceLink && (
              <Link href="/dashboard/knowledge" className="font-semibold">
                {t.viewSource}
              </Link>
            )}
          </p>
        )}
      </div>

      {!canEdit && groups.length > 0 && <p className="text-sm text-[var(--color-muted)]">{t.readOnly}</p>}

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-xl bg-[var(--color-raised)] px-4 py-8 text-center">
          <CircleCheck className="h-6 w-6 text-[var(--color-success)]" aria-hidden />
          <p className="font-semibold">{t.emptyTitle}</p>
          <p className="max-w-sm text-sm text-[var(--color-muted)]">{t.empty}</p>
        </div>
      ) : (
        <ol ref={listRef} className="m-0 flex list-none flex-col divide-y divide-[var(--color-line)] rounded-xl bg-[var(--color-raised)] p-0">
          {groups.map((g) => (
            <li key={g.key} className="px-4 py-3">
              <div className="flex flex-col gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="m-0 break-words font-medium">{g.question}</p>
                  <p className="m-0 flex flex-wrap items-center gap-x-2 text-xs text-[var(--color-muted)]">
                    <span className={cn(g.count > 1 && "font-semibold text-[var(--color-warning)]")}>{plural(g.count, t.asked, locale)}</span>
                    <span aria-hidden>·</span>
                    <span>{format(t.lastAsked, { when: timeAgo(g.lastAskedAt, locale) })}</span>
                  </p>
                </div>
                {editing !== g.key && (
                  <div className="flex flex-wrap items-center gap-1">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setNotice(null)
                          setEditing(g.key)
                        }}
                        className={`${button} border border-[var(--color-line)] bg-transparent text-[var(--color-text)] hover:border-[var(--color-muted)]`}
                      >
                        <BookPlus className="h-4 w-4" aria-hidden />
                        {t.add}
                      </button>
                    )}
                    <Link href={`/dashboard/conversations?open=${g.conversationId}`} className={quiet} aria-label={`${t.view}: ${g.question}`}>
                      <MessageSquareText className="h-4 w-4" aria-hidden />
                      <span className="max-md:sr-only">{t.view}</span>
                    </Link>
                    {canEdit && (
                      <button type="button" onClick={() => void dismiss(g)} disabled={busy === g.key} className={quiet} title={t.dismissHint} aria-label={`${t.dismiss}: ${g.question}`}>
                        {busy === g.key ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
                        <span className="max-md:sr-only">{t.dismiss}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              {editing === g.key && (
                <AnswerForm
                  group={g}
                  limits={limits}
                  onCancel={() => setEditing(null)}
                  onDone={(source) => {
                    remove(g)
                    setNotice({ tone: "ok", text: format(t.added, { source }), sourceLink: true })
                  }}
                />
              )}
            </li>
          ))}
        </ol>
      )}
      {open > groups.reduce((n, g) => n + g.replyIds.length, 0) && groups.length > 0 && (
        <p className="text-xs text-[var(--color-muted)]">{format(t.more, { shown: formatNumber(groups.length, locale) })}</p>
      )}
    </section>
  )
}
