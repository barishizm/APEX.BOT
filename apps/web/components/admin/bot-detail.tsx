"use client"

import type { AdminBotDetail } from "@apex/db"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import { formatDate, formatNumber } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { button, ConfirmDialog, dangerButton, Empty, field, fill, postJson, Section, tag, When, type Jsonify } from "./detail-ui"

// /admin/bots/[id]: one customer site's bot, its stored settings as they are (with what fails
// validation), and what staff can do to it. Every action goes through POST /api/admin/bots/<id>/<action>
// with a reason and a step-up; the page re-renders from the server after each one.

export type BotDetailJson = Jsonify<AdminBotDetail>

type Kind = "repair" | "rotate" | "disable" | "enable" | "budget" | "budgetClear" | "handoff"

const SPEC: Record<Kind, { path: string; danger?: boolean }> = {
  repair: { path: "repair" },
  rotate: { path: "rotate-key", danger: true },
  disable: { path: "disable", danger: true },
  enable: { path: "enable" },
  budget: { path: "budget-override" },
  budgetClear: { path: "budget-clear" },
  handoff: { path: "handoff-reset", danger: true },
}

// settings.security.dailyTokenBudget's ceiling (LIMITS in bot-settings.ts)
const MAX_TOKENS = 20_000_000
const HOURS = ["1", "24", "72", "168", "720"]
const STATUS_TONE = {
  serving: "bg-green-500/15 text-green-800 dark:text-green-300",
  disabled: "bg-red-500/15 text-red-700 dark:text-red-300",
  suspended: "bg-red-500/15 text-red-700 dark:text-red-300",
} as const

export function BotDetail({ detail }: { detail: BotDetailJson }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.bots.detail
  const bots = app.admin!.bots
  const router = useRouter()
  const { bot: b, tokens, handoff } = detail
  const [dialog, setDialog] = useState<Kind | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const settings = detail.settings as { model?: { provider?: unknown; id?: unknown }; security?: { allowedOrigins?: unknown } } | null
  const origins = Array.isArray(settings?.security?.allowedOrigins) ? (settings.security.allowedOrigins as unknown[]).filter((o): o is string => typeof o === "string") : []
  const model = [settings?.model?.provider, settings?.model?.id].filter((v): v is string => typeof v === "string").join(" / ")
  const applies = tokens.override ? tokens.override.tokens : tokens.budget
  const when = (at: string) => formatDate(at, locale, { dateStyle: "medium", timeStyle: "short" })

  const open = (kind: Kind) => {
    setNotice(null)
    setDialog(kind)
  }
  function done(kind: Kind) {
    setDialog(null)
    setNotice(t.done[kind])
    router.refresh()
  }

  const actions: Kind[] = [
    ...(detail.issues.length ? (["repair"] as const) : []),
    b.disabledAt ? "enable" : "disable",
    "budget",
    ...(tokens.override ? (["budgetClear"] as const) : []),
    ...(handoff.verifiedEmail ? (["handoff"] as const) : []),
    "rotate",
  ]

  const rows: [string, ReactNode][] = [
    [t.fields.id, <code key="id" className="break-all text-xs">{b.id}</code>],
    [t.fields.workspace, <Link key="ws" href={`/admin/workspaces/${b.organizationId}`} className="font-medium">{b.organizationName}</Link>],
    [t.fields.key, <span key="key"><code className="text-xs">…{b.siteKeyTail}</code> <span className="text-xs text-[var(--color-muted)]">{fill(t.fields.keyHint, { n: b.siteKeyTail.length })}</span></span>],
    [
      t.fields.origins,
      origins.length ? (
        <ul key="o" className="m-0 list-none p-0">
          {origins.map((o) => (
            <li key={o} className="break-all">{o}</li>
          ))}
        </ul>
      ) : (
        bots.noOrigins
      ),
    ],
    [t.fields.model, model || bots.defaultModel],
    [
      t.fields.seen,
      b.widgetSeenAt ? (
        <span key="s">
          <When at={b.widgetSeenAt} locale={locale} />
          {b.widgetSeenOrigin && <span className="block break-all text-xs text-[var(--color-muted)]">{b.widgetSeenOrigin}</span>}
        </span>
      ) : (
        bots.never
      ),
    ],
    [
      t.fields.knowledge,
      fill(t.fields.knowledgeValue, {
        version: formatNumber(b.knowledgeVersion, locale),
        sources: formatNumber(detail.knowledge.sources, locale),
        chunks: formatNumber(detail.knowledge.chunks, locale),
      }),
    ],
    [t.fields.conversations, formatNumber(detail.conversations, locale)],
    [t.fields.version, formatNumber(b.version, locale)],
    [t.fields.created, when(b.createdAt)],
    [t.fields.updated, when(b.updatedAt)],
    [t.fields.disabled, b.disabledAt ? when(b.disabledAt) : t.fields.no],
    ...(b.disabledReason ? ([[t.fields.disabledReason, <span key="r" className="whitespace-pre-wrap">{b.disabledReason}</span>]] as [string, ReactNode][]) : []),
  ]

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <header className="flex flex-col gap-2">
        <Link href="/admin/bots" className="inline-flex w-fit items-center gap-1 text-sm text-[var(--color-muted)] no-underline hover:text-[var(--color-text)]">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t.back}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 break-words text-2xl font-semibold tracking-tight">{b.name}</h1>
          <span className={cn(tag, STATUS_TONE[b.status])}>{bots.statuses[b.status]}</span>
          {tokens.override && <span className={`${tag} bg-amber-500/15 text-amber-800 dark:text-amber-200`}>{bots.overrideTag}</span>}
        </div>
      </header>

      {b.status !== "serving" && (
        <p className="m-0 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {b.status === "disabled" ? t.disabledBanner : t.suspendedBanner}
        </p>
      )}
      {notice && (
        <p role="status" className="m-0 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-800 dark:text-green-300">
          {notice}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title={t.sections.overview}>
            <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-[var(--color-muted)]">{label}</dt>
                  <dd className="m-0 min-w-0">{value}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title={t.sections.settings}>
            {detail.issues.length ? (
              <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                <p className="m-0 font-medium">{fill(t.issuesTitle, { n: detail.issues.length })}</p>
                <ul className="m-0 flex flex-col gap-1 pl-5">
                  {detail.issues.map((i) => (
                    <li key={`${i.path}:${i.message}`} className="break-words">
                      <code className="text-xs">{i.path || "(root)"}</code> {i.message}
                    </li>
                  ))}
                </ul>
                <p className="m-0 text-xs text-[var(--color-muted)]">{t.issuesHint}</p>
              </div>
            ) : (
              <p className="m-0 text-sm text-green-700 dark:text-green-300">{t.issuesNone}</p>
            )}
            <p className="m-0 text-xs text-[var(--color-muted)]">{t.settingsHint}</p>
            <pre className="m-0 max-h-[32rem] overflow-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-raised)] p-3 text-xs leading-relaxed">
              {JSON.stringify(detail.settings, null, 2)}
            </pre>
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Section title={t.sections.actions}>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {actions.map((kind) => (
                <li key={kind}>
                  <button type="button" onClick={() => open(kind)} className={cn(button, "w-full justify-start", SPEC[kind].danger && dangerButton)}>
                    {t.actions[kind].label}
                  </button>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={t.sections.tokens}>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-[var(--color-muted)]">{t.tokens.today}</dt>
              <dd className="m-0 tabular-nums">{formatNumber(tokens.today, locale)}</dd>
              <dt className="text-[var(--color-muted)]">{t.tokens.budget}</dt>
              <dd className="m-0 tabular-nums">{formatNumber(tokens.budget, locale)}</dd>
              <dt className="text-[var(--color-muted)]">{t.tokens.override}</dt>
              <dd className="m-0">
                {tokens.override ? fill(t.tokens.overrideValue, { tokens: formatNumber(tokens.override.tokens, locale), until: when(tokens.override.until) }) : t.tokens.none}
              </dd>
              <dt className="text-[var(--color-muted)]">{t.tokens.applies}</dt>
              <dd className={cn("m-0 tabular-nums font-medium", tokens.today >= applies && "text-red-700 dark:text-red-300")}>{formatNumber(applies, locale)}</dd>
            </dl>
          </Section>

          <Section title={t.sections.handoff}>
            <dl className="m-0 grid grid-cols-1 gap-y-1 text-sm">
              <dt className="text-[var(--color-muted)]">{t.handoff.email}</dt>
              <dd className="m-0 break-all">{handoff.email || t.handoff.none}</dd>
              <dt className="mt-2 text-[var(--color-muted)]">{t.handoff.verified}</dt>
              <dd className="m-0 break-all">{handoff.verifiedEmail ?? t.handoff.notConfirmed}</dd>
            </dl>
            <p className="m-0 text-xs text-[var(--color-muted)]">{t.handoff.hint}</p>
          </Section>

          <Section title={t.sections.audit} count={detail.audit.length}>
            {detail.audit.length ? (
              <ol className="m-0 flex list-none flex-col gap-3 p-0 text-sm">
                {detail.audit.map((a) => (
                  <li key={a.id} className="flex flex-col gap-0.5 border-l-2 border-amber-500/40 pl-3">
                    <span className="font-medium">{t.auditActions[a.action] ?? a.action}</span>
                    <span className="text-xs text-[var(--color-muted)]">
                      {fill(t.by, { name: a.actorName ?? t.deletedStaff })} · <When at={a.createdAt} locale={locale} />
                    </span>
                    {a.reason && (
                      <span className="whitespace-pre-wrap break-words text-xs">
                        <span className="text-[var(--color-muted)]">{t.reasonPrefix}</span> {a.reason}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>{t.noAudit}</Empty>
            )}
          </Section>
        </aside>
      </div>

      {dialog && <ActionDialog kind={dialog} detail={detail} onClose={() => setDialog(null)} onDone={() => done(dialog)} />}
    </div>
  )
}

function ActionDialog({ kind, detail, onClose, onDone }: { kind: Kind; detail: BotDetailJson; onClose: () => void; onDone: () => void }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.bots.detail
  const [tokens, setTokens] = useState(String(detail.tokens.override?.tokens ?? detail.tokens.budget))
  const [hours, setHours] = useState("24")
  const spec = SPEC[kind]
  const amount = Number(tokens)
  const ready = kind !== "budget" || (tokens.trim() !== "" && Number.isInteger(amount) && amount >= 0 && amount <= MAX_TOKENS)
  const label = "flex flex-col gap-1.5 text-sm font-medium"

  function body(): Record<string, unknown> {
    if (kind === "repair") return { version: detail.bot.version }
    if (kind === "budget") return { tokens: amount, hours: Number(hours) }
    return {}
  }

  return (
    <ConfirmDialog
      title={t.actions[kind].label}
      text={fill(t.actions[kind].text, { email: detail.handoff.verifiedEmail ?? "" })}
      danger={spec.danger}
      stepUp
      ready={ready}
      submit={(reason) => postJson(`/api/admin/bots/${detail.bot.id}/${spec.path}`, { reason, ...body() })}
      onClose={onClose}
      onDone={onDone}
    >
      {kind === "budget" && (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className={label}>
            {t.dialog.tokens}
            <input
              value={tokens}
              onChange={(e) => setTokens(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              autoComplete="off"
              className={`${field} h-10 tabular-nums`}
            />
            <span className="text-xs font-normal text-[var(--color-muted)]">{fill(t.dialog.tokensHint, { max: formatNumber(MAX_TOKENS, locale) })}</span>
          </label>
          <label className={label}>
            {t.dialog.hours}
            <select value={hours} onChange={(e) => setHours(e.target.value)} className={`${field} h-10 cursor-pointer`}>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {t.dialog.hoursOptions[h]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </ConfirmDialog>
  )
}
