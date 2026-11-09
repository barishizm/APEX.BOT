import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { getAdminBillingOverview, listBillingEventIssues, listOverageIssues, maskPII, type SubscriptionStatus } from "@apex/db"
import { BillingWebhooks } from "@/components/admin/billing-webhooks"
import { Empty, Section, Table, type Jsonify } from "@/components/admin/detail-ui"
import { requirePlatformAdmin } from "@/lib/auth"
import { billingStatus } from "@/lib/billing"
import { db } from "@/lib/db"
import { format } from "@/lib/i18n"
import { getAdminDictionary } from "@/lib/i18n/app"
import type { Locale } from "@/lib/i18n/config"
import { formatDate, formatNumber, formatUsd } from "@/lib/i18n/format"
import { requestLocale } from "@/lib/i18n/server"
import { cn } from "@/lib/utils"

// /admin/billing: recurring revenue at list price, where each workspace's plan comes from, past-due
// subscriptions, webhooks left unprocessed (with "Process again") and overage charged. Everything but
// the replay is read-only; plans are changed per workspace (a comp) or in Paddle.

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).billing.title }
}

const WEBHOOKS_SHOWN = 50
const STATUSES: SubscriptionStatus[] = ["active", "trialing", "past_due", "paused", "canceled"]
const box = "flex min-w-0 flex-col gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4"
// detail-ui is a client module: its class strings don't reach a server component, so these are local (as on /admin/usage)
const td = "px-3 py-2.5 align-top"
const num = "whitespace-nowrap tabular-nums"

function Kpi({ label, value, help, tone }: { label: string; value: string; help: string; tone?: "warn" }) {
  return (
    <div className={cn(box, tone === "warn" && "border-[var(--color-warning)]/50")}>
      <span className="text-xs font-medium text-[var(--color-muted)]">{label}</span>
      <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
      <span className="mt-auto pt-1 text-xs leading-snug text-[var(--color-muted)]">{help}</span>
    </div>
  )
}

function Alert({ tone, children }: { tone: "bad" | "warn"; children: React.ReactNode }) {
  return (
    <div role="alert" className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", tone === "bad" ? "border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10" : "border-[var(--color-warning)]/50 bg-[var(--color-warning)]/10")}>
      <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "bad" ? "text-[var(--color-danger)]" : "text-[var(--color-warning)]")} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

const errorText = (err: unknown) => maskPII(err instanceof Error ? err.message : String(err)).slice(0, 300)

export default async function AdminBillingPage() {
  await requirePlatformAdmin()
  const locale: Locale = await requestLocale()
  const a = getAdminDictionary(locale)
  const t = a.billing
  const plans = a.workspaces.plans
  const n = (x: number) => formatNumber(x, locale)
  const usd = (cents: number) => formatUsd(cents / 100, locale)
  const day = (d: Date) => formatDate(d, locale, { dateStyle: "medium" })
  const month = (key: string) => formatDate(`${key}-01T00:00:00Z`, locale, { month: "short", year: "numeric", timeZone: "UTC" })

  const [overview, webhooks, overageIssues] = await Promise.all([
    getAdminBillingOverview(db()),
    listBillingEventIssues(db(), WEBHOOKS_SHOWN).catch((err: unknown) => ({ error: errorText(err) })),
    listOverageIssues(db()).catch(() => null),
  ])
  const billing = billingStatus()
  const { overage } = overview

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 max-w-3xl text-[var(--color-muted)]">{t.lede}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t.metrics.mrr} value={usd(overview.mrrCents)} help={t.metrics.mrrHint} />
        <Kpi label={t.metrics.arr} value={usd(overview.arrCents)} help={t.metrics.arrHint} />
        <Kpi label={t.metrics.atRisk} value={usd(overview.atRiskCents)} help={t.metrics.atRiskHint} tone={overview.atRiskCents ? "warn" : undefined} />
        <Kpi label={t.metrics.canceling} value={usd(overview.cancelingCents)} help={t.metrics.cancelingHint} />
      </div>

      <Section title={t.subscriptions}>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {STATUSES.map((s) => (
            <li
              key={s}
              className={cn(
                "inline-flex items-baseline rounded-full border border-[var(--color-line)] px-3 py-1 text-sm",
                s === "past_due" && overview.subscriptions[s] && "border-[var(--color-warning)]/50 bg-[var(--color-warning)]/10 text-[var(--color-warning)]",
              )}
            >
              {t.statuses[s]}
              <span className="ml-2 font-semibold tabular-nums">{n(overview.subscriptions[s])}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t.plans.title}>
        <Table head={[t.plans.columns.plan, t.plans.columns.workspaces, t.plans.columns.subscription, t.plans.columns.override, t.plans.columns.manual]}>
          {overview.plans.map((p) => (
            <tr key={p.plan} className="border-t border-[var(--color-line)]">
              <td className={cn(td, "font-medium")}>
                <Link href={`/admin/workspaces?plan=${p.plan}`}>{plans[p.plan]}</Link>
              </td>
              <td className={cn(td, num)}>{n(p.workspaces)}</td>
              {(["subscription", "override", "manual"] as const).map((source) => (
                <td key={source} className={cn(td, num, !p.bySource[source] && "text-[var(--color-muted)]")}>
                  {p.plan === "free" ? "—" : n(p.bySource[source])}
                </td>
              ))}
            </tr>
          ))}
        </Table>
        {overview.plans.some((p) => p.bySource.manual) && <p className="m-0 text-xs text-[var(--color-muted)]">{t.plans.manualHint}</p>}
      </Section>

      <Section title={t.pastDue.title} count={overview.pastDue.length}>
        {overview.pastDue.length ? (
          <Table head={[t.pastDue.columns.workspace, t.pastDue.columns.plan, t.pastDue.columns.amount, t.pastDue.columns.since, t.pastDue.columns.grace]}>
            {overview.pastDue.map((s) => (
              <tr key={s.organizationId} className="border-t border-[var(--color-line)]">
                <td className={td}>
                  <Link href={`/admin/workspaces/${s.organizationId}`} className="font-medium">
                    {s.name}
                  </Link>
                  {s.ownerEmail && <span className="block break-all text-xs text-[var(--color-muted)]">{s.ownerEmail}</span>}
                </td>
                <td className={cn(td, "whitespace-nowrap")}>
                  {plans[s.plan]} <span className="text-xs text-[var(--color-muted)]">· {t.pastDue.intervals[s.interval]}</span>
                </td>
                <td className={cn(td, num)}>{usd(s.monthlyCents)}</td>
                <td className={cn(td, "whitespace-nowrap")}>{day(s.since)}</td>
                <td className={cn(td, "whitespace-nowrap")}>
                  {day(s.graceUntil)}
                  {s.graceExpiredAt && <span className="block text-xs text-[var(--color-danger)]">{t.pastDue.expired}</span>}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>{t.pastDue.none}</Empty>
        )}
      </Section>

      <Section title={t.webhooks.title} count={"total" in webhooks ? webhooks.total : undefined}>
        {"error" in webhooks ? (
          <Alert tone="bad">{format(t.unavailable, { error: webhooks.error })}</Alert>
        ) : webhooks.total ? (
          <>
            <Alert tone="warn">{format(t.webhooks.count, { n: n(webhooks.total) })}</Alert>
            {!billing.enabled && <p className="m-0 text-sm text-[var(--color-muted)]">{t.webhooks.off}</p>}
            <BillingWebhooks
              events={(JSON.parse(JSON.stringify(webhooks.events)) as Jsonify<typeof webhooks.events>).map((e) => ({ ...e, error: e.error && maskPII(e.error) }))}
              canReplay={billing.enabled}
            />
            {webhooks.total > webhooks.events.length && (
              <p className="m-0 text-xs text-[var(--color-muted)]">{format(t.webhooks.more, { shown: n(webhooks.events.length), n: n(webhooks.total) })}</p>
            )}
          </>
        ) : (
          <Empty>{t.webhooks.none}</Empty>
        )}
      </Section>

      <Section title={t.overage.title}>
        <p className="m-0 text-sm font-medium">{format(t.overage.total, { amount: usd(overage.totalCents) })}</p>
        {overageIssues && overageIssues.total > 0 && (
          <Alert tone="bad">
            <Link href="/admin/system">{format(t.overage.failing, { n: n(overageIssues.total) })}</Link>
          </Alert>
        )}
        {overage.unbilledWindows > 0 && (
          <p className="m-0 text-sm text-[var(--color-muted)]">{format(t.overage.unbilled, { windows: n(overage.unbilledWindows), replies: n(overage.unbilledReplies) })}</p>
        )}
        {overage.totalCents ? (
          <Table head={[t.overage.columns.month, t.overage.columns.blocks, t.overage.columns.amount]}>
            {[...overage.months].reverse().map((m) => (
              <tr key={m.month} className="border-t border-[var(--color-line)]">
                <td className={cn(td, "whitespace-nowrap")}>{month(m.month)}</td>
                <td className={cn(td, num, !m.blocks && "text-[var(--color-muted)]")}>{n(m.blocks)}</td>
                <td className={cn(td, num, !m.blocks && "text-[var(--color-muted)]")}>{usd(m.cents)}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>{t.overage.none}</Empty>
        )}
      </Section>
    </div>
  )
}
