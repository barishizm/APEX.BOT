"use client"

import { AlertTriangle, Check, CreditCard, FileDown, LoaderCircle } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import type { ScheduledChange } from "@apex/db"
import { OVERAGE_BLOCK, OVERAGE_CAP_MAX_CENTS, PLAN_PRICES, type Plan } from "@apex/db/plans"
import { useAppI18n } from "@/components/i18n/app-provider"
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Group, NumberInput, Toggle } from "@/components/widget-studio/fields"
import { BILLING_PATH, billingPath, type PlanChoice } from "@/lib/billing/intent"
import type { ChangePreviewJson, InvoiceJson } from "@/lib/billing/manage"
import { closeCheckout, openCheckout } from "@/lib/billing/paddle-js"
import type { CheckoutConfig } from "@/lib/billing/types"
import { format, LOCALE_META, type Locale } from "@/lib/i18n"
import { formatDate, formatNumber } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"

type Interval = PlanChoice["interval"]
type PaidPlan = PlanChoice["plan"]

export interface SubscriptionJson {
  plan: PaidPlan
  interval: Interval
  status: "trialing" | "active" | "past_due" | "paused" | "canceled"
  periodEnd: string
  endsAtPeriodEnd: boolean
  graceUntil: string | null
  scheduledChange: ScheduledChange | null
}

/** The current reply window (workspaceReplyUsage), in fifths of a reply as stored. */
export interface UsageJson {
  usedFifths: number
  allowanceFifths: number
  resetsAt: string
  enforced: boolean
  overage: { allowed: boolean; enabled: boolean; capCents: number | null; usedFifths: number; billable: boolean }
}

const PAID: PaidPlan[] = ["starter", "pro", "business"]
// how often, and for how long, the page asks whether the webhook has landed
const POLL_MS = 3000
const PATIENCE_MS = 90_000
// after a change, when to look again for the webhook's state
const SETTLE_MS = [2000, 5000, 10_000]
const DEFAULT_CAP_CENTS = 5000

const primary =
  "inline-flex h-9 w-fit cursor-pointer items-center gap-2 rounded-lg border-0 bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-on-primary)] no-underline transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
const ghost =
  "inline-flex h-9 w-fit cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-line)] bg-transparent px-4 text-sm font-semibold text-[var(--color-text)] no-underline transition-colors hover:border-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-50"
const danger =
  "inline-flex h-9 w-fit cursor-pointer items-center gap-2 rounded-lg border-0 bg-red-600 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"

const usd = (cents: number, locale: Locale) =>
  new Intl.NumberFormat(LOCALE_META[locale].intl, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)

/** An amount in the currency's smallest unit, as Paddle gives it (cents, or whole yen). */
function money(minor: number, currency: string, locale: Locale) {
  const f = new Intl.NumberFormat(LOCALE_META[locale].intl, { style: "currency", currency, currencyDisplay: "narrowSymbol" })
  return f.format(minor / 10 ** (f.resolvedOptions().maximumFractionDigits ?? 2))
}

/** Fifths of a reply as replies, one decimal at most. */
const replies = (fifths: number, locale: Locale) => formatNumber(Math.round(fifths * 2) / 10, locale)

type T = ReturnType<typeof useAppI18n>["t"]["billing"]

function priceLine(t: T, plan: PaidPlan, interval: Interval, locale: Locale) {
  const p = PLAN_PRICES[plan]
  return interval === "year"
    ? format(t.billedYearly, { price: usd(Math.round(p.annual / 12), locale), total: usd(p.annual, locale) })
    : format(t.billedMonthly, { price: usd(p.monthly, locale) })
}

type Sent<D> = { ok: true; data: D } | { ok: false; message: string }

/** A JSON request to the billing API; errors come back in the dashboard's language by their code. */
async function send<D = null>(t: T, url: string, body: unknown = {}, method = "POST"): Promise<Sent<D>> {
  try {
    const res = await fetch(url, method === "GET" ? { cache: "no-store" } : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    if (res.status === 204) return { ok: true, data: null as D }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const code = data.error as keyof T["errors"] | undefined
      return { ok: false, message: (code && t.errors[code]) || data.message || t.errors.generic }
    }
    return { ok: true, data: data as D }
  } catch {
    return { ok: false, message: t.errors.offline }
  }
}

/** Refreshes the page now and a few times after, until the provider's webhook has stored the change. */
function useSettle() {
  const router = useRouter()
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  return useCallback(() => {
    router.refresh()
    timers.current.push(...SETTLE_MS.map((ms) => setTimeout(() => router.refresh(), ms)))
  }, [router])
}

function Notice({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  return tone === "error" ? (
    <p role="alert" className="text-sm text-red-700 dark:text-red-300">
      {children}
    </p>
  ) : (
    <p role="status" className="flex items-center gap-1.5 text-sm text-[var(--color-muted)]">
      <Check className="h-4 w-4 shrink-0" aria-hidden />
      {children}
    </p>
  )
}

/**
 * The workspace's plan, reply usage, overage and invoices, and while plans are on sale the way to buy
 * or manage one: Paddle's overlay opens on a transaction the server made (POST /api/billing/checkout);
 * afterwards ?checkout=<id> follows it. Members see everything; owners and admins (canPay) act.
 */
export function BillingPanel({
  live,
  canPay,
  plan,
  subscription,
  usage,
  hasCustomer,
  choice,
  checkoutId,
}: {
  live: boolean
  canPay: boolean
  plan: Plan
  subscription: SubscriptionJson | null
  usage: UsageJson | null
  /** Whether the workspace has a Paddle customer: it has paid, so there are invoices and a portal. */
  hasCustomer: boolean
  choice: PlanChoice | null
  checkoutId: string | null
}) {
  const { t: app, locale } = useAppI18n()
  const t = app.billing
  const canManage = live && canPay
  const running = !!subscription && (subscription.status === "active" || subscription.status === "trialing")

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--color-line)] bg-[var(--color-raised)]/95 px-4 py-3 backdrop-blur sm:px-6">
        <h1 className="text-lg font-semibold">{t.title}</h1>
        <p className="text-xs text-[var(--color-muted)]">{t.lede}</p>
      </header>

      <div className="flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
        {checkoutId ? (
          <CheckoutProgress t={t} id={checkoutId} retryHref={billingPath(choice)} />
        ) : (
          <>
            {live && !canPay && <p className="text-sm text-[var(--color-muted)]">{t.membersOnly}</p>}
            <CurrentPlan t={t} locale={locale} plan={plan} subscription={subscription} canManage={canManage} running={running} hasCustomer={hasCustomer} />
            {usage && <Usage t={t} locale={locale} usage={usage} />}
            {!live ? (
              <Group title={t.betaTitle}>
                <p className="text-sm text-[var(--color-muted)]">{t.betaText}</p>
              </Group>
            ) : (
              <>
                {!subscription && canPay && <PlanPicker t={t} locale={locale} initial={choice} />}
                {usage && (
                  // remounted when the stored setting changes, so the form starts from it
                  <Overage key={`${usage.overage.enabled}:${usage.overage.capCents}`} t={t} locale={locale} overage={usage.overage} canManage={canManage} running={running} />
                )}
                {hasCustomer && <Invoices t={t} locale={locale} canDownload={canPay} />}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CurrentPlan({
  t,
  locale,
  plan,
  subscription,
  canManage,
  running,
  hasCustomer,
}: {
  t: T
  locale: Locale
  plan: Plan
  subscription: SubscriptionJson | null
  canManage: boolean
  running: boolean
  hasCustomer: boolean
}) {
  const settle = useSettle()
  const [dialog, setDialog] = useState<"change" | "cancel" | null>(null)
  const [busy, setBusy] = useState<"resume" | "portal" | null>(null)
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const date = (iso: string) => formatDate(iso, locale)
  const sc = subscription?.scheduledChange

  const done = () => {
    setDialog(null)
    setNotice({ tone: "ok", text: t.manage.saved })
    settle()
  }
  const resume = async () => {
    setBusy("resume")
    setNotice(null)
    const r = await send(t, "/api/billing/subscription/resume")
    setBusy(null)
    if (r.ok) done()
    else setNotice({ tone: "error", text: r.message })
  }
  const portal = async () => {
    setBusy("portal")
    setNotice(null)
    const r = await send<{ url: string }>(t, "/api/billing/portal")
    if (r.ok) return window.location.assign(r.data.url)
    setBusy(null)
    setNotice({ tone: "error", text: r.message })
  }

  const pastDue = subscription?.status === "past_due"
  // the grace ran out (expireGrace): the subscription is still past_due, but the workspace is on another plan now
  const graceEnded = pastDue && plan !== subscription!.plan
  return (
    <Group title={t.currentPlan}>
      <div className="flex flex-col gap-1.5 text-sm">
        <p className="text-base font-semibold">{t.plans[plan]}</p>
        {subscription && (
          <>
            {!graceEnded && (
              <p>
                {format(t.subscribed, { plan: t.plans[subscription.plan], interval: t.intervals[subscription.interval].toLowerCase() })}{" "}
                {priceLine(t, subscription.plan, subscription.interval, locale)}
              </p>
            )}
            {graceEnded ? (
              <p role="alert" className="flex items-start gap-2 text-red-700 dark:text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {format(t.pastDueEnded, { plan: t.plans[subscription.plan] })}
              </p>
            ) : pastDue ? (
              <p role="alert" className="flex items-start gap-2 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {format(t.pastDue, { date: date(subscription.graceUntil ?? subscription.periodEnd), plan: t.plans[subscription.plan] })}
              </p>
            ) : (
              <p className="text-[var(--color-muted)]">{format(subscription.endsAtPeriodEnd ? t.ends : t.renews, { date: date(subscription.periodEnd) })}</p>
            )}
            {sc?.action === "change" && sc.plan && (
              <p className="text-[var(--color-muted)]">
                {format(t.manage.scheduled, {
                  plan: t.plans[sc.plan],
                  interval: t.intervals[sc.interval ?? subscription.interval].toLowerCase(),
                  date: date(sc.effectiveAt),
                })}
              </p>
            )}
          </>
        )}
      </div>

      {canManage && (subscription || hasCustomer) && (
        <div className="flex flex-wrap gap-2">
          {running && !subscription!.endsAtPeriodEnd && !sc && (
            <>
              <button type="button" className={primary} onClick={() => setDialog("change")}>
                {t.manage.changePlan}
              </button>
              <button type="button" className={ghost} onClick={() => setDialog("cancel")}>
                {t.manage.cancel}
              </button>
            </>
          )}
          {running && subscription!.endsAtPeriodEnd && (
            <button type="button" className={primary} disabled={busy !== null} onClick={resume}>
              {busy === "resume" && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
              {t.manage.resume}
            </button>
          )}
          {hasCustomer && (
            <button type="button" className={pastDue ? primary : ghost} disabled={busy !== null} onClick={portal}>
              {busy === "portal" ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <CreditCard className="h-4 w-4" aria-hidden />}
              {busy === "portal" ? t.manage.openingPortal : t.manage.updatePayment}
            </button>
          )}
        </div>
      )}
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      {subscription && running && (
        <>
          <ChangePlanDialog t={t} locale={locale} open={dialog === "change"} onClose={() => setDialog(null)} current={subscription} onDone={done} />
          <CancelDialog t={t} locale={locale} open={dialog === "cancel"} onClose={() => setDialog(null)} subscription={subscription} onDone={done} />
        </>
      )}
    </Group>
  )
}

type PreviewState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; data: ChangePreviewJson } | { kind: "error"; message: string }

function ChangePlanDialog({
  t,
  locale,
  open,
  onClose,
  current,
  onDone,
}: {
  t: T
  locale: Locale
  open: boolean
  onClose: () => void
  current: SubscriptionJson
  onDone: () => void
}) {
  const [plan, setPlan] = useState<PaidPlan>(current.plan)
  const [interval, setBillingInterval] = useState<Interval>(current.interval)
  const [preview, setPreview] = useState<PreviewState>({ kind: "idle" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const same = plan === current.plan && interval === current.interval

  useEffect(() => {
    if (!open) return
    setPlan(current.plan)
    setBillingInterval(current.interval)
    setError(null)
  }, [open, current.plan, current.interval])

  // each pick asks Paddle what it would cost; a quick second pick replaces the first
  useEffect(() => {
    if (!open || same) return setPreview({ kind: "idle" })
    let stale = false
    setPreview({ kind: "loading" })
    const timer = setTimeout(async () => {
      const r = await send<ChangePreviewJson>(t, "/api/billing/subscription/preview", { plan, interval })
      if (!stale) setPreview(r.ok ? { kind: "ready", data: r.data } : { kind: "error", message: r.message })
    }, 300)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [open, same, plan, interval, t])

  const confirm = async () => {
    setBusy(true)
    setError(null)
    const r = await send(t, "/api/billing/subscription/change", { plan, interval })
    setBusy(false)
    if (r.ok) onDone()
    else setError(r.message)
  }

  const c = t.change
  const p = preview.kind === "ready" ? preview.data : null
  const amount = (minor: number) => money(minor, p!.currency, locale)
  return (
    <Dialog open={open} onClose={onClose} busy={busy}>
      <DialogHeader>
        <DialogTitle>{c.title}</DialogTitle>
        <DialogDescription>{c.text}</DialogDescription>
      </DialogHeader>

      <div role="radiogroup" aria-label={t.choose} className="flex w-full gap-1 rounded-lg border border-[var(--color-line)] p-1 text-sm sm:w-fit">
        {(["month", "year"] as const).map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={interval === i}
            onClick={() => setBillingInterval(i)}
            className={cn(
              "h-8 flex-1 cursor-pointer rounded-md border-0 px-3 font-medium",
              interval === i ? "bg-[var(--color-text)] text-[var(--color-surface)]" : "bg-transparent text-[var(--color-muted)]",
            )}
          >
            {t.intervals[i]}
          </button>
        ))}
      </div>

      <div role="radiogroup" aria-label={t.choose} className="grid gap-2 sm:grid-cols-3">
        {PAID.map((x) => (
          <button
            key={x}
            type="button"
            role="radio"
            aria-checked={plan === x}
            onClick={() => setPlan(x)}
            className={cn(
              "flex cursor-pointer flex-col items-start gap-1 rounded-xl border bg-[var(--color-raised)] p-3 text-left",
              plan === x ? "border-[var(--color-text)]" : "border-[var(--color-line)] hover:border-[var(--color-muted)]",
            )}
          >
            <span className="flex w-full items-center justify-between gap-2 text-sm font-semibold">
              {t.plans[x]}
              {plan === x && <Check className="h-4 w-4" aria-hidden />}
            </span>
            <span className="text-xs text-[var(--color-muted)]">{priceLine(t, x, interval, locale)}</span>
            {x === current.plan && interval === current.interval && (
              <span className="rounded-full border border-[var(--color-line)] px-2 text-[0.6875rem] font-medium text-[var(--color-muted)]">{c.current}</span>
            )}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="min-h-[4.5rem] rounded-xl bg-[var(--color-raised)] p-3 text-sm">
        {same ? (
          <p className="text-[var(--color-muted)]">{c.same}</p>
        ) : preview.kind === "loading" || preview.kind === "idle" ? (
          <p className="flex items-center gap-2 text-[var(--color-muted)]">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
            {c.previewing}
          </p>
        ) : preview.kind === "error" ? (
          <Notice tone="error">{preview.message}</Notice>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="font-medium">
              {p!.timing === "immediately" ? c.immediately : format(c.periodEnd, { date: formatDate(current.periodEnd, locale), plan: t.plans[current.plan] })}
            </p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
              {p!.timing === "immediately" && (
                <>
                  <dt className="text-[var(--color-muted)]">{c.dueNow}</dt>
                  <dd className="m-0 text-right font-semibold tabular-nums">{amount(p!.dueNowMinor)}</dd>
                </>
              )}
              {p!.creditMinor > 0 && (
                <>
                  <dt className="text-[var(--color-muted)]">{c.credit}</dt>
                  <dd className="m-0 text-right tabular-nums">{amount(p!.creditMinor)}</dd>
                </>
              )}
              {p!.nextBilledAt && p!.nextTotalMinor !== null && (
                <>
                  <dt className="text-[var(--color-muted)]">{format(c.next, { date: formatDate(p!.nextBilledAt, locale) })}</dt>
                  <dd className="m-0 text-right tabular-nums">{amount(p!.nextTotalMinor)}</dd>
                </>
              )}
            </dl>
            <p className="text-xs text-[var(--color-muted)]">{c.taxNote}</p>
          </div>
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      <DialogFooter>
        <button type="button" className={cn(ghost, "max-sm:w-full max-sm:justify-center")} disabled={busy} onClick={onClose}>
          {c.back}
        </button>
        <button type="button" className={cn(primary, "max-sm:w-full max-sm:justify-center")} disabled={busy || preview.kind !== "ready"} onClick={confirm}>
          {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
          {busy ? c.working : c.confirm}
        </button>
      </DialogFooter>
    </Dialog>
  )
}

function CancelDialog({
  t,
  locale,
  open,
  onClose,
  subscription,
  onDone,
}: {
  t: T
  locale: Locale
  open: boolean
  onClose: () => void
  subscription: SubscriptionJson
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const c = t.cancelDialog
  const cancel = async () => {
    setBusy(true)
    setError(null)
    const r = await send(t, "/api/billing/subscription/cancel")
    setBusy(false)
    if (r.ok) onDone()
    else setError(r.message)
  }
  return (
    <Dialog open={open} onClose={onClose} busy={busy}>
      <DialogHeader>
        <DialogTitle>{c.title}</DialogTitle>
        <DialogDescription>{format(c.text, { plan: t.plans[subscription.plan], date: formatDate(subscription.periodEnd, locale) })}</DialogDescription>
      </DialogHeader>
      {error && <Notice tone="error">{error}</Notice>}
      <DialogFooter>
        <button type="button" className={cn(ghost, "max-sm:w-full max-sm:justify-center")} disabled={busy} onClick={onClose}>
          {c.keep}
        </button>
        <button type="button" className={cn(danger, "max-sm:w-full max-sm:justify-center")} disabled={busy} onClick={cancel}>
          {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
          {busy ? c.working : c.confirm}
        </button>
      </DialogFooter>
    </Dialog>
  )
}

function Usage({ t, locale, usage }: { t: T; locale: Locale; usage: UsageJson }) {
  const ratio = usage.allowanceFifths ? usage.usedFifths / usage.allowanceFifths : 0
  const overageReplies = usage.overage.usedFifths / 5
  return (
    <Group title={t.usage.title}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
          <p className="font-semibold tabular-nums">
            {format(t.usage.used, { used: replies(usage.usedFifths, locale), total: replies(usage.allowanceFifths, locale) })}
          </p>
          <p className="text-[var(--color-muted)]">{format(t.usage.resets, { date: formatDate(usage.resetsAt, locale) })}</p>
        </div>
        <Progress value={ratio * 100} tone={ratio >= 1 ? "danger" : ratio >= 0.8 ? "warning" : "default"} aria-label={t.usage.title} />
        {overageReplies > 0 && (
          <p className="text-sm text-[var(--color-muted)]">
            {format(t.usage.overageUsed, {
              n: replies(usage.overage.usedFifths, locale),
              // blocks are billed once opened
              amount: usd(Math.ceil(overageReplies / OVERAGE_BLOCK.replies) * OVERAGE_BLOCK.priceCents, locale),
            })}
          </p>
        )}
        {!usage.enforced && <p className="text-sm text-[var(--color-muted)]">{t.usage.notEnforced}</p>}
      </div>
      <details className="group text-sm">
        <summary className="cursor-pointer font-medium">{t.usage.weightsTitle}</summary>
        <p className="pt-2 leading-relaxed text-[var(--color-muted)]">{t.usage.weights}</p>
      </details>
    </Group>
  )
}

function Overage({ t, locale, overage, canManage, running }: { t: T; locale: Locale; overage: UsageJson["overage"]; canManage: boolean; running: boolean }) {
  const settle = useSettle()
  const savedCap = overage.capCents ?? DEFAULT_CAP_CENTS
  const [enabled, setEnabled] = useState(overage.enabled)
  const [capDollars, setCapDollars] = useState(savedCap / 100)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const o = t.overage
  const block = { price: usd(OVERAGE_BLOCK.priceCents, locale), n: formatNumber(OVERAGE_BLOCK.replies, locale) }

  if (!overage.allowed)
    return (
      <Group title={o.title}>
        <p className="text-sm text-[var(--color-muted)]">{o.free}</p>
      </Group>
    )

  const capCents = Math.round(capDollars * 100)
  const capValid = capCents >= OVERAGE_BLOCK.priceCents && capCents <= OVERAGE_CAP_MAX_CENTS && capCents % OVERAGE_BLOCK.priceCents === 0
  const dirty = enabled !== overage.enabled || (enabled && capCents !== savedCap)
  // turning it off is always possible; on needs a subscription to bill and the overage price
  const blocked = !overage.enabled && (!overage.billable ? o.unavailable : !running ? o.needsSubscription : null)

  const save = async () => {
    setBusy(true)
    setNotice(null)
    const r = await send(t, "/api/billing/overage", { enabled, capCents: enabled ? capCents : null })
    setBusy(false)
    if (!r.ok) return setNotice({ tone: "error", text: r.message })
    setNotice({ tone: "ok", text: o.saved })
    settle()
  }

  return (
    <Group title={o.title} description={format(o.text, block)}>
      <Toggle
        label={o.toggle}
        // what the switch now says; the cap's hint covers an unsaved "on"
        description={enabled ? (overage.enabled ? format(o.on, { cap: usd(savedCap, locale) }) : undefined) : (blocked ?? o.off)}
        checked={enabled}
        onChange={setEnabled}
        disabled={!canManage || busy || !!blocked}
      />
      {enabled && (
        <NumberInput
          label={o.cap}
          value={capDollars}
          onChange={setCapDollars}
          min={OVERAGE_BLOCK.priceCents / 100}
          max={OVERAGE_CAP_MAX_CENTS / 100}
          step={OVERAGE_BLOCK.priceCents / 100}
          unit="USD"
          hint={format(o.capHint, { max: usd(OVERAGE_CAP_MAX_CENTS, locale) })}
          error={capValid ? undefined : t.errors.invalid_cap}
          disabled={!canManage || busy}
        />
      )}
      {canManage && dirty && (
        <button type="button" className={primary} disabled={busy || (enabled && !capValid)} onClick={save}>
          {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
          {busy ? o.saving : o.save}
        </button>
      )}
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    </Group>
  )
}

type InvoicesState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; invoices: InvoiceJson[] }

function Invoices({ t, locale, canDownload }: { t: T; locale: Locale; canDownload: boolean }) {
  const [state, setState] = useState<InvoicesState>({ kind: "loading" })
  const [round, setRound] = useState(0)
  const i = t.invoices

  useEffect(() => {
    let stale = false
    setState({ kind: "loading" })
    send<{ invoices: InvoiceJson[] }>(t, "/api/billing/invoices", undefined, "GET").then((r) => {
      if (!stale) setState(r.ok ? { kind: "ready", invoices: r.data.invoices } : { kind: "error", message: r.message })
    })
    return () => {
      stale = true
    }
  }, [t, round])

  return (
    <Group title={i.title} description={i.text}>
      {state.kind === "loading" ? (
        <p role="status" className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          {i.loading}
        </p>
      ) : state.kind === "error" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Notice tone="error">{i.failed}</Notice>
          <button type="button" className={ghost} onClick={() => setRound((n) => n + 1)}>
            {i.retry}
          </button>
        </div>
      ) : state.invoices.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">{i.empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{i.date}</TableHead>
              <TableHead>{i.number}</TableHead>
              <TableHead className="text-right">{i.amount}</TableHead>
              <TableHead className="max-sm:hidden">{i.status}</TableHead>
              {canDownload && (
                <TableHead className="text-right">
                  <span className="sr-only">{i.download}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>{inv.billedAt ? formatDate(inv.billedAt, locale) : "–"}</TableCell>
                <TableCell className="max-w-[8rem] truncate font-mono text-xs">{inv.number ?? i.pending}</TableCell>
                <TableCell className="text-right tabular-nums">{money(inv.totalMinor, inv.currency, locale)}</TableCell>
                <TableCell className={cn("max-sm:hidden", inv.status === "past_due" && "text-red-700 dark:text-red-300")}>{i.statuses[inv.status] ?? inv.status}</TableCell>
                {canDownload && (
                  <TableCell className="text-right">
                    {inv.number && (
                      <a
                        href={`/api/billing/invoices/${encodeURIComponent(inv.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={format(i.downloadLabel, { number: inv.number })}
                        className="inline-flex items-center gap-1 text-sm font-semibold"
                      >
                        <FileDown className="h-4 w-4" aria-hidden />
                        {i.download}
                      </a>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Group>
  )
}

type PickerState = { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string }

function PlanPicker({ t, locale, initial }: { t: T; locale: Locale; initial: PlanChoice | null }) {
  const router = useRouter()
  const [plan, setPlan] = useState<PaidPlan>(initial?.plan ?? "pro")
  const [interval, setBillingInterval] = useState<Interval>(initial?.interval ?? "year")
  const [state, setState] = useState<PickerState>({ kind: "idle" })

  const pay = async () => {
    setState({ kind: "busy" })
    let config: CheckoutConfig
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan, interval }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const code = data.error as keyof T["errors"] | undefined
        return setState({ kind: "error", message: (code && t.errors[code]) || data.message || t.errors.generic })
      }
      config = data as CheckoutConfig
    } catch {
      return setState({ kind: "error", message: t.errors.offline })
    }
    try {
      await openCheckout(config, (event) => {
        if (event.name === "checkout.completed") {
          // follow the payment here rather than on Paddle's own success screen
          closeCheckout()
          router.replace(`${BILLING_PATH}?${new URLSearchParams({ checkout: event.data?.transaction_id ?? config.transactionId, plan, interval })}`)
        } else if (event.name === "checkout.closed") {
          setState({ kind: "idle" })
        } else if (event.name === "checkout.error") {
          setState({ kind: "error", message: t.errors.checkout })
        }
      })
    } catch {
      setState({ kind: "error", message: t.errors.load })
    }
  }

  return (
    <Group title={t.choose} description={t.paddleNote}>
      <div role="radiogroup" aria-label={t.choose} className="flex w-fit gap-1 rounded-lg border border-[var(--color-line)] p-1 text-sm">
        {(["month", "year"] as const).map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={interval === i}
            onClick={() => setBillingInterval(i)}
            className={cn(
              "h-8 cursor-pointer rounded-md border-0 px-3 font-medium",
              interval === i ? "bg-[var(--color-text)] text-[var(--color-surface)]" : "bg-transparent text-[var(--color-muted)]",
            )}
          >
            {t.intervals[i]}
          </button>
        ))}
      </div>

      <div role="radiogroup" aria-label={t.currentPlan} className="grid gap-3 sm:grid-cols-3">
        {PAID.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={plan === p}
            onClick={() => setPlan(p)}
            className={cn(
              "flex cursor-pointer flex-col items-start gap-1 rounded-xl border bg-[var(--color-raised)] p-4 text-left",
              plan === p ? "border-[var(--color-text)]" : "border-[var(--color-line)] hover:border-[var(--color-muted)]",
            )}
          >
            <span className="flex w-full items-center justify-between text-sm font-semibold">
              {t.plans[p]}
              {plan === p && <Check className="h-4 w-4" aria-hidden />}
            </span>
            <span className="text-xs text-[var(--color-muted)]">{priceLine(t, p, interval, locale)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primary} disabled={state.kind === "busy"} onClick={pay}>
          {state.kind === "busy" && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
          {state.kind === "busy" ? t.opening : t.pay}
        </button>
        {state.kind === "error" && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {state.message}
          </p>
        )}
      </div>
    </Group>
  )
}

type Progress = { kind: "processing" } | { kind: "active"; plan: PaidPlan } | { kind: "failed" } | { kind: "slow" }

function CheckoutProgress({ t, id, retryHref }: { t: T; id: string; retryHref: string }) {
  const router = useRouter()
  const [progress, setProgress] = useState<Progress>({ kind: "processing" })
  // bumped by "Check again" to start another round of polling
  const [round, setRound] = useState(0)

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const started = Date.now()
    const tick = async () => {
      try {
        const res = await fetch(`/api/billing/checkout/${encodeURIComponent(id)}`, { cache: "no-store" })
        const data = res.ok ? ((await res.json()) as { state: "processing" | "active" | "failed"; plan: PaidPlan | null }) : null
        if (stopped) return
        if (data?.state === "active" && data.plan) {
          setProgress({ kind: "active", plan: data.plan })
          // the frame and the rest of the dashboard show the new plan
          return router.refresh()
        }
        if (data?.state === "failed") return setProgress({ kind: "failed" })
      } catch {
        // offline for a moment: keep asking until we run out of patience
      }
      if (stopped) return
      if (Date.now() - started > PATIENCE_MS) return setProgress({ kind: "slow" })
      timer = setTimeout(tick, POLL_MS)
    }
    setProgress({ kind: "processing" })
    tick()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [id, round, router])

  const p = t.processing
  if (progress.kind === "active")
    return (
      <Group title={format(p.activeTitle, { plan: t.plans[progress.plan] })} description={format(p.activeText, { plan: t.plans[progress.plan] })}>
        <Link href="/dashboard" className={primary}>
          {p.toDashboard}
        </Link>
      </Group>
    )
  if (progress.kind === "failed")
    return (
      <Group title={p.failedTitle} description={p.failedText}>
        <Link href={retryHref} className={primary}>
          {p.tryAgain}
        </Link>
      </Group>
    )
  if (progress.kind === "slow")
    return (
      <Group title={p.slowTitle} description={format(p.slowText, { ref: id })}>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={primary} onClick={() => setRound((r) => r + 1)}>
            {p.keepChecking}
          </button>
          <Link href="/dashboard/support" className={ghost}>
            {p.contactSupport}
          </Link>
        </div>
      </Group>
    )
  return (
    <Group title={p.title} description={p.text}>
      <p role="status" className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        {p.title}
      </p>
    </Group>
  )
}
