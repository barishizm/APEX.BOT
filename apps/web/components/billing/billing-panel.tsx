"use client"

import { AlertTriangle, Check, LoaderCircle } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { PLAN_PRICES, type Plan } from "@apex/db/plans"
import { useAppI18n } from "@/components/i18n/app-provider"
import { Group } from "@/components/widget-studio/fields"
import { BILLING_PATH, billingPath, type PlanChoice } from "@/lib/billing/intent"
import { closeCheckout, openCheckout } from "@/lib/billing/paddle-js"
import type { CheckoutConfig } from "@/lib/billing/types"
import { format, LOCALE_META, type Locale } from "@/lib/i18n"
import { formatDate } from "@/lib/i18n/format"
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
}

const PAID: PaidPlan[] = ["starter", "pro", "business"]
// how often, and for how long, the page asks whether the webhook has landed
const POLL_MS = 3000
const PATIENCE_MS = 90_000

const primary =
  "inline-flex h-9 w-fit cursor-pointer items-center gap-2 rounded-lg border-0 bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-on-primary)] no-underline transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
const ghost =
  "inline-flex h-9 w-fit cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-line)] bg-transparent px-4 text-sm font-semibold text-[var(--color-text)] no-underline transition-colors hover:border-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-40"

const usd = (cents: number, locale: Locale) =>
  new Intl.NumberFormat(LOCALE_META[locale].intl, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)

type T = ReturnType<typeof useAppI18n>["t"]["billing"]

function priceLine(t: T, plan: PaidPlan, interval: Interval, locale: Locale) {
  const p = PLAN_PRICES[plan]
  return interval === "year"
    ? format(t.billedYearly, { price: usd(Math.round(p.annual / 12), locale), total: usd(p.annual, locale) })
    : format(t.billedMonthly, { price: usd(p.monthly, locale) })
}

/**
 * The workspace's plan and, while plans are on sale, the way to buy one: Paddle's overlay opens on a
 * transaction the server made (POST /api/billing/checkout); afterwards ?checkout=<id> follows it.
 */
export function BillingPanel({
  live,
  canPay,
  plan,
  subscription,
  choice,
  checkoutId,
}: {
  live: boolean
  canPay: boolean
  plan: Plan
  subscription: SubscriptionJson | null
  choice: PlanChoice | null
  checkoutId: string | null
}) {
  const { t: app, locale } = useAppI18n()
  const t = app.billing

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
            <CurrentPlan t={t} locale={locale} plan={plan} subscription={subscription} />
            {!live ? (
              <Group title={t.betaTitle}>
                <p className="text-sm text-[var(--color-muted)]">{t.betaText}</p>
              </Group>
            ) : subscription ? null : !canPay ? (
              <p className="text-sm text-[var(--color-muted)]">{t.membersOnly}</p>
            ) : (
              <PlanPicker t={t} locale={locale} initial={choice} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CurrentPlan({ t, locale, plan, subscription }: { t: T; locale: Locale; plan: Plan; subscription: SubscriptionJson | null }) {
  const date = (iso: string) => formatDate(iso, locale)
  return (
    <Group title={t.currentPlan}>
      <div className="flex flex-col gap-1.5 text-sm">
        <p className="text-base font-semibold">{t.plans[plan]}</p>
        {subscription && (
          <>
            <p>
              {format(t.subscribed, { plan: t.plans[subscription.plan], interval: t.intervals[subscription.interval].toLowerCase() })}{" "}
              {priceLine(t, subscription.plan, subscription.interval, locale)}
            </p>
            {subscription.status === "past_due" ? (
              <p role="alert" className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {format(t.pastDue, { date: date(subscription.graceUntil ?? subscription.periodEnd), plan: t.plans[subscription.plan] })}
              </p>
            ) : (
              <p className="text-[var(--color-muted)]">{format(subscription.endsAtPeriodEnd ? t.ends : t.renews, { date: date(subscription.periodEnd) })}</p>
            )}
          </>
        )}
      </div>
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
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
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
