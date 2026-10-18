"use client"

import type { AdminTicketDetail, TicketStatus } from "@apex/db"
import { ArrowLeft, Bot, Building2, ExternalLink, LifeBuoy, LoaderCircle, Lock, User } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type FormEvent, type ReactNode } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { STATUS_TONE } from "@/components/support/status-badge"
import { LOCALE_META } from "@/lib/i18n/config"
import { formatDate } from "@/lib/i18n/format"
import { TEMPLATE_KEYS, templateText, type TemplateKey } from "@/lib/support-templates"
import { cn } from "@/lib/utils"
import { button, Empty, field, fill, postJson, primaryButton, Section, tag, When, type Jsonify } from "./detail-ui"
import { PRIORITY_TONE, TICKET_PRIORITIES, TICKET_STATUSES } from "./tickets-table"

// /admin/support/[id]: one ticket with its whole conversation, internal notes included, and what
// staff do with it. Replies, notes, assignment, status and priority go through
// POST /api/admin/support/<id>/<action>; the page re-renders from the server after each one.

export type AdminTicketJson = Jsonify<AdminTicketDetail>

type Mode = "reply" | "note"

export function TicketDetail({ detail, adminId }: { detail: AdminTicketJson; adminId: string }) {
  const { t: app, locale } = useAppI18n()
  const tickets = app.admin!.tickets
  const t = tickets.detail
  const router = useRouter()
  const { ticket, messages, staff, others } = detail
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const when = (at: string) => formatDate(at, locale, { dateStyle: "medium", timeStyle: "short" })
  const overdue = !!ticket.slaDueAt && new Date(ticket.slaDueAt).getTime() < Date.now()

  async function act(action: string, body: object, done: string) {
    setSaving(action)
    setNotice(null)
    try {
      const res = await postJson(`/api/admin/support/${ticket.id}/${action}`, body)
      setNotice(res.ok ? { ok: true, text: done } : { ok: false, text: res.message || t.failed })
      if (res.ok) router.refresh()
      return res.ok
    } finally {
      setSaving(null)
    }
  }

  const select = `${field} h-9 w-full cursor-pointer`
  const supportAccessHref = ticket.botId ? `/admin/bots/${ticket.botId}?${new URLSearchParams({ supportTicket: `#${ticket.number}` })}` : null

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <header className="flex flex-col gap-2">
        <Link href="/admin/support" className="inline-flex w-fit items-center gap-1 text-sm text-[var(--color-muted)] no-underline hover:text-[var(--color-text)]">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t.back}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 break-words text-2xl font-semibold tracking-tight">
            <span className="mr-2 font-mono text-base font-normal text-[var(--color-muted)]">#{ticket.number}</span>
            {ticket.subject}
          </h1>
          <span className={cn(tag, STATUS_TONE[ticket.status])}>{tickets.statuses[ticket.status]}</span>
          <span className={cn(tag, PRIORITY_TONE[ticket.priority])}>{tickets.priorities[ticket.priority]}</span>
        </div>
        <p className="m-0 text-sm text-[var(--color-muted)]">
          {tickets.categories[ticket.category]} · {fill(t.opened, { date: when(ticket.createdAt) })} · {ticket.organizationName}
          {ticket.siteName && ` · ${ticket.siteName}`}
        </p>
      </header>

      {notice && (
        <p
          role={notice.ok ? "status" : "alert"}
          className={cn(
            "m-0 rounded-lg px-3 py-2 text-sm",
            notice.ok ? "bg-green-500/10 text-green-800 dark:text-green-300" : "bg-red-500/10 text-red-700 dark:text-red-300",
          )}
        >
          {notice.text}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title={t.conversation} count={messages.length}>
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={cn(
                    "flex flex-col gap-1 rounded-xl border px-4 py-3",
                    m.internal
                      ? "border-dashed border-amber-500/50 bg-amber-500/5"
                      : m.fromStaff
                        ? "border-[var(--color-line)] bg-[var(--color-raised)] sm:ml-8"
                        : "border-transparent bg-[var(--color-bubble)] sm:mr-8",
                  )}
                >
                  <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--color-muted)]">
                    <span className="font-semibold text-[var(--color-text)]">{m.authorName ?? t.deleted}</span>
                    {!m.fromStaff && <span>{t.customer}</span>}
                    {m.internal && (
                      <span className="inline-flex items-center gap-1 font-medium text-amber-800 dark:text-amber-200">
                        <Lock className="h-3 w-3" aria-hidden /> {t.internal}
                      </span>
                    )}
                    <When at={m.createdAt} locale={locale} />
                  </span>
                  <p className="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>
                </li>
              ))}
            </ol>
          </Section>

          <Composer
            ticketId={ticket.id}
            status={ticket.status}
            locale={ticket.locale}
            customerName={ticket.customer?.name ?? ""}
            onDone={(text) => {
              setNotice({ ok: true, text })
              router.refresh()
            }}
          />
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Section title={t.ticket}>
            <div className="flex flex-col gap-3 text-sm">
              <label className="flex flex-col gap-1.5 font-medium">
                {t.status}
                <select
                  value={ticket.status}
                  disabled={saving !== null}
                  onChange={(e) => act("status", { status: e.target.value }, t.saved)}
                  className={select}
                >
                  {TICKET_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {tickets.statuses[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 font-medium">
                {t.priority}
                <select
                  value={ticket.priority}
                  disabled={saving !== null}
                  onChange={(e) => act("priority", { priority: e.target.value }, t.saved)}
                  className={select}
                >
                  {TICKET_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {tickets.priorities[p]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ticket-assignee" className="font-medium">
                  {t.assignee}
                </label>
                <div className="flex gap-2">
                  <select
                    id="ticket-assignee"
                    value={ticket.assigneeId ?? ""}
                    disabled={saving !== null}
                    onChange={(e) => act("assign", { assigneeId: e.target.value || null }, t.saved)}
                    className={select}
                  >
                    <option value="">{tickets.unassigned}</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id === adminId ? `${s.name} (${tickets.me})` : s.name}
                      </option>
                    ))}
                  </select>
                  {ticket.assigneeId !== adminId && (
                    <button type="button" disabled={saving !== null} onClick={() => act("assign", { assigneeId: adminId }, t.saved)} className={cn(button, "shrink-0")}>
                      {saving === "assign" && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
                      {t.assignMe}
                    </button>
                  )}
                </div>
              </div>
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <dt className="text-[var(--color-muted)]">{t.sla}</dt>
                <dd className="m-0">
                  {ticket.slaDueAt ? (
                    <span className={cn(overdue && "font-semibold text-red-700 dark:text-red-300")}>
                      {when(ticket.slaDueAt)}
                      {overdue && ` · ${t.overdue}`}
                    </span>
                  ) : (
                    <span className="text-[var(--color-muted)]">{t.slaNone}</span>
                  )}
                </dd>
                <dt className="text-[var(--color-muted)]">{t.category}</dt>
                <dd className="m-0">{tickets.categories[ticket.category]}</dd>
                <dt className="text-[var(--color-muted)]">{t.language}</dt>
                <dd className="m-0">{LOCALE_META[ticket.locale].name}</dd>
              </dl>
            </div>
          </Section>

          <Section title={t.links}>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
              <GoTo href={ticket.customer ? `/admin/users/${ticket.customer.id}` : null} icon={<User className="h-4 w-4" aria-hidden />} label={t.user}>
                {ticket.customer ? (
                  <>
                    {ticket.customer.email}
                    {ticket.customer.suspended && <span className="ml-1 text-xs text-red-700 dark:text-red-300">●</span>}
                  </>
                ) : (
                  t.deleted
                )}
              </GoTo>
              <GoTo href={`/admin/workspaces/${ticket.organizationId}`} icon={<Building2 className="h-4 w-4" aria-hidden />} label={t.workspace}>
                {ticket.organizationName}
              </GoTo>
              <GoTo href={ticket.botId ? `/admin/bots/${ticket.botId}` : null} icon={<Bot className="h-4 w-4" aria-hidden />} label={t.site}>
                {ticket.siteName ?? t.noSite}
              </GoTo>
            </ul>
            {supportAccessHref && (
              <div className="flex flex-col gap-1">
                <Link href={supportAccessHref} className={cn(button, "w-full justify-start no-underline")}>
                  <LifeBuoy className="h-4 w-4" aria-hidden /> {t.supportAccess}
                </Link>
                <span className="text-xs text-[var(--color-muted)]">{t.supportAccessHint}</span>
              </div>
            )}
          </Section>

          <Section title={t.context}>
            <ContextList context={ticket.context} />
          </Section>

          {others.length > 0 && (
            <Section title={t.others} count={others.length}>
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
                {others.map((o) => (
                  <li key={o.id} className="flex min-w-0 items-center gap-2">
                    <Link href={`/admin/support/${o.id}`} className="min-w-0 flex-1 truncate">
                      <span className="mr-1.5 font-mono text-xs text-[var(--color-muted)]">#{o.number}</span>
                      {o.subject}
                    </Link>
                    <span className={cn(tag, "shrink-0", STATUS_TONE[o.status])}>{tickets.statuses[o.status]}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </aside>
      </div>
    </div>
  )
}

function GoTo({ href, icon, label, children }: { href: string | null; icon: ReactNode; label: string; children: ReactNode }) {
  const inner = (
    <>
      <span className="mt-0.5 shrink-0 text-[var(--color-muted)]">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-[var(--color-muted)]">{label}</span>
        <span className="truncate">{children}</span>
      </span>
      {href && <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-muted)]" aria-hidden />}
    </>
  )
  return (
    <li>
      {href ? (
        <Link href={href} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-[var(--color-text)] no-underline hover:bg-[var(--color-raised)]">
          {inner}
        </Link>
      ) : (
        <span className="flex items-start gap-2 px-2 py-1.5 text-[var(--color-muted)]">{inner}</span>
      )}
    </li>
  )
}

/** What the customer's browser attached; shown as reported, never trusted. */
function ContextList({ context }: { context: AdminTicketJson["ticket"]["context"] }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.tickets.detail
  const b = context.browser
  const rows: [string, ReactNode][] = [
    ...(context.page ? ([[t.page, <code key="p" className="break-all text-xs">{context.page}</code>]] as [string, ReactNode][]) : []),
    ...(b?.userAgent ? ([[t.browser, <span key="ua" className="break-words text-xs">{b.userAgent}</span>]] as [string, ReactNode][]) : []),
    ...(b?.viewport ? ([[t.viewport, b.viewport]] as [string, ReactNode][]) : []),
    ...(b?.language ? ([[t.locale, b.language]] as [string, ReactNode][]) : []),
    ...(b?.timeZone ? ([[t.timeZone, b.timeZone]] as [string, ReactNode][]) : []),
  ]
  const error = context.lastError
  if (!rows.length && !error) return <Empty>{t.noContext}</Empty>
  return (
    <>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-[var(--color-muted)]">{label}</dt>
            <dd className="m-0 min-w-0">{value}</dd>
          </div>
        ))}
      </dl>
      {error && (
        <div className="flex flex-col gap-1 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm">
          <span className="text-xs font-medium text-red-700 dark:text-red-300">
            {t.lastError}
            {error.at && ` · ${formatDate(error.at, locale, { dateStyle: "medium", timeStyle: "short" })}`}
          </span>
          <code className="whitespace-pre-wrap break-words text-xs">{error.message}</code>
          {error.source && <code className="break-all text-xs text-[var(--color-muted)]">{error.source}</code>}
        </div>
      )}
      <p className="m-0 text-xs text-[var(--color-muted)]">{t.contextHint}</p>
    </>
  )
}

function Composer({
  ticketId,
  status,
  locale: customerLocale,
  customerName,
  onDone,
}: {
  ticketId: string
  status: TicketStatus
  locale: AdminTicketJson["ticket"]["locale"]
  customerName: string
  onDone: (notice: string) => void
}) {
  const { t: app } = useAppI18n()
  const tickets = app.admin!.tickets
  const t = tickets.detail
  const [mode, setMode] = useState<Mode>("reply")
  const [body, setBody] = useState("")
  // "" keeps the server's default: a reply waits on the customer, a note leaves the status alone
  const [then, setThen] = useState<"" | TicketStatus>("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function insertTemplate(key: TemplateKey) {
    const text = templateText(key, customerLocale, customerName)
    setBody((b) => (b.trim() ? `${b.trimEnd()}\n\n${text}` : text))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await postJson(`/api/admin/support/${ticketId}/${mode}`, { body, ...(then && { status: then }) })
      if (!res.ok) return setError(res.message || t.failed)
      setBody("")
      setThen("")
      onDone(mode === "reply" ? t.sent : t.noted)
    } finally {
      setBusy(false)
    }
  }

  const note = mode === "note"
  return (
    <form
      onSubmit={submit}
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-[var(--color-surface)] p-4 sm:p-5",
        note ? "border-dashed border-amber-500/60" : "border-[var(--color-line)]",
      )}
    >
      <div role="tablist" className="flex gap-1 self-start rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] p-1 text-sm">
        {(["reply", "note"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 font-medium",
              mode === m ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm" : "text-[var(--color-muted)]",
            )}
          >
            {m === "note" && <Lock className="h-3.5 w-3.5" aria-hidden />}
            {m === "reply" ? t.reply : t.note}
          </button>
        ))}
      </div>

      {!note && (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t.template}
          <select
            value=""
            onChange={(e) => e.target.value && insertTemplate(e.target.value as TemplateKey)}
            className={`${field} h-9 cursor-pointer`}
          >
            <option value="">{t.templateNone}</option>
            {TEMPLATE_KEYS.map((k) => (
              <option key={k} value={k}>
                {t.templates[k]}
              </option>
            ))}
          </select>
        </label>
      )}

      <textarea
        aria-label={note ? t.note : t.reply}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={10_000}
        rows={6}
        placeholder={note ? t.notePlaceholder : t.replyPlaceholder}
        className={`${field} resize-y py-2 leading-relaxed`}
      />
      <p className="m-0 text-xs text-[var(--color-muted)]">{note ? t.noteHint : fill(t.replyHint, { language: LOCALE_META[customerLocale].name })}</p>

      {error && (
        <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-[var(--color-muted)]">{t.then}</span>
          <select value={then} onChange={(e) => setThen(e.target.value as "" | TicketStatus)} className={`${field} h-9 cursor-pointer`}>
            <option value="">{note ? `${t.keep} (${tickets.statuses[status]})` : tickets.statuses.pending_user}</option>
            {TICKET_STATUSES.filter((s) => (note ? s !== status : s !== "pending_user")).map((s) => (
              <option key={s} value={s}>
                {tickets.statuses[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy || !body.trim()} className={cn(button, primaryButton)}>
          {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
          {note ? t.addNote : t.sendReply}
        </button>
      </div>
    </form>
  )
}
