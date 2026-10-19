import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle, Info } from "lucide-react"
import {
  ESTIMATED_INPUT_SHARE,
  freeGeminiEmbeddings,
  NEAR_BUDGET_RATIO,
  platformUsage,
  PROVIDERS,
  RUNTIME_KEYS,
  USAGE_RANGES,
  USAGE_TOP,
  type RuntimeKey,
  type UsageSums,
} from "@apex/db"
import { UsageCharts, UsageExportButton } from "@/components/admin/usage-charts"
import { requirePlatformAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { format } from "@/lib/i18n"
import { getAdminDictionary } from "@/lib/i18n/app"
import type { Locale } from "@/lib/i18n/config"
import { formatNumber, formatPercent, formatUsd, timeAgo } from "@/lib/i18n/format"
import { requestLocale } from "@/lib/i18n/server"
import { cn } from "@/lib/utils"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).usage.title }
}

const box = "flex min-w-0 flex-col gap-1 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4"
const card = "flex min-w-0 flex-col gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 sm:p-5"
const th = "whitespace-nowrap px-3 py-2 font-semibold"
const td = "px-3 py-2.5 align-top"
const num = "whitespace-nowrap text-right tabular-nums"
const tag = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
const link = "font-medium text-[var(--color-text)] no-underline hover:underline"

// Which provider each key serves, for the "bots set to a provider without its key" warning
const PROVIDER_KEY: Record<string, RuntimeKey> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", google: "GEMINI_API_KEY" }

/** Whether the web app (this process) has each key; values are never read beyond that. */
const webKeys = (): Record<RuntimeKey, boolean> => ({
  ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
  RESEND_API_KEY: !!process.env.RESEND_API_KEY,
})

function Kpi({ label, value, help, estimated }: { label: string; value: string; help: string; estimated?: string }) {
  return (
    <div className={box}>
      <span className="flex items-center gap-2 text-xs font-medium text-[var(--color-muted)]">
        {label}
        {estimated && <span className={cn(tag, "bg-[var(--color-bubble)] px-1.5 py-px font-medium text-[var(--color-muted)]")}>{estimated}</span>}
      </span>
      <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
      <span className="mt-auto pt-1 text-xs leading-snug text-[var(--color-muted)]">{help}</span>
    </div>
  )
}

function Notice({ tone, title, children }: { tone: "warn" | "info"; title?: string; children: React.ReactNode }) {
  const Icon = tone === "warn" ? AlertTriangle : Info
  return (
    <div
      role={tone === "warn" ? "alert" : undefined}
      className={cn(
        "flex gap-3 rounded-2xl border px-4 py-3 text-sm",
        tone === "warn" ? "border-amber-500/50 bg-amber-500/10" : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-muted)]",
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "warn" ? "text-amber-600 dark:text-amber-400" : "")} aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        {title && <strong className="font-semibold text-[var(--color-text)]">{title}</strong>}
        <p className="m-0">{children}</p>
      </div>
    </div>
  )
}

function Table({ head, numeric = [], children }: { head: string[]; numeric?: number[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-line)]">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-[var(--color-raised)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
          <tr>
            {head.map((h, i) => (
              <th key={`${i}-${h}`} scope="col" className={cn(th, numeric.includes(i) && "text-right")}>
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

function Section({ id, title, text, children }: { id: string; title: string; text?: string; children: React.ReactNode }) {
  return (
    <section className={card} aria-labelledby={id}>
      <div>
        <h2 id={id} className="m-0 text-base font-semibold">
          {title}
        </h2>
        {text && <p className="m-0 mt-1 text-sm text-[var(--color-muted)]">{text}</p>}
      </div>
      {children}
    </section>
  )
}

const KeyState = ({ on, labels }: { on: boolean | null; labels: { set: string; missing: string; unknown: string } }) =>
  on === null ? (
    <span className={cn(tag, "bg-[var(--color-bubble)] text-[var(--color-muted)]")}>{labels.unknown}</span>
  ) : on ? (
    <span className={cn(tag, "bg-green-500/15 text-green-800 dark:text-green-300")}>{labels.set}</span>
  ) : (
    <span className={cn(tag, "bg-[var(--color-bubble)] text-[var(--color-muted)]")}>{labels.missing}</span>
  )

export default async function AdminUsagePage({ searchParams }: PageProps<"/admin/usage">) {
  await requirePlatformAdmin()
  const locale: Locale = await requestLocale()
  const admin = getAdminDictionary(locale)
  const t = admin.usage
  const planNames = admin.overview.plans.names
  const data = await platformUsage(db(), (await searchParams).days)
  const { totals, runtime } = data
  const web = webKeys()

  const n = (v: number) => formatNumber(Math.round(v), locale)
  const usd = (v: number) => formatUsd(v, locale)
  const pct = (v: number, of: number) => (of > 0 ? formatPercent(v / of, locale) : "–")
  // a cost with unpriced tokens behind it is a floor, not a total
  const cost = (s: UsageSums) => (s.tokens > 0 && s.unpriced === s.tokens ? t.providers.unpriced : usd(s.cost))
  const providerLabel = (id: string) => PROVIDERS.find((p) => p.id === id)?.label ?? id
  const keyLabels = { set: t.keys.set, missing: t.keys.missing, unknown: t.keys.unknown }

  const missingKeys = runtime
    ? data.providers.filter((p) => p.configuredBots > 0 && !runtime.keys[PROVIDER_KEY[p.provider]!])
    : []
  const topBots = data.bots.slice(0, USAGE_TOP)
  const topWorkspaces = data.workspaces.slice(0, USAGE_TOP)
  const daily = data.daily.map(({ day, input, output, unsplit, cost }) => ({ day, input, output, unsplit, cost }))

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="mt-1 text-[var(--color-muted)]">{t.lede}</p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <nav aria-label={t.rangeLabel} className="flex flex-col items-end gap-1">
            <div className="flex rounded-lg border border-[var(--color-line)] p-0.5">
              {USAGE_RANGES.map((d) => (
                <Link
                  key={d}
                  href={d === 30 ? "/admin/usage" : `/admin/usage?days=${d}`}
                  aria-current={d === data.days ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm no-underline transition-colors",
                    d === data.days ? "bg-[var(--color-raised)] font-semibold text-[var(--color-text)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]",
                  )}
                >
                  {t.ranges[d]}
                </Link>
              ))}
            </div>
            <span className="text-xs text-[var(--color-muted)]">{t.utcNote}</span>
          </nav>
          <UsageExportButton days={data.days} />
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {freeGeminiEmbeddings(runtime) && (
          <Notice tone="warn" title={t.freeGemini.title}>
            {format(t.freeGemini.text, { spec: runtime!.embeddings! })}
          </Notice>
        )}
        {missingKeys.map((p) => (
          <Notice key={p.provider} tone="warn">
            {format(t.missingKey, { n: n(p.configuredBots), provider: providerLabel(p.provider), key: PROVIDER_KEY[p.provider]! })}
          </Notice>
        ))}
        {!runtime && <Notice tone="info">{t.notReported}</Notice>}
        <Notice tone="info">
          {t.estimateNote}
          {totals.unsplit > 0 && <> {format(t.unsplitNote, { share: pct(totals.unsplit, totals.tokens), input: formatPercent(ESTIMATED_INPUT_SHARE, locale) })}</>}
          {totals.unpriced > 0 && <> {format(t.unpricedNote, { n: n(totals.unpriced) })}</>}
        </Notice>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t.kpi.tokens} value={n(totals.tokens)} help={format(t.kpi.tokensHelp, { input: n(totals.input), output: n(totals.output) })} />
        <Kpi label={t.kpi.cost} value={usd(totals.cost)} help={format(t.kpi.costHelp, { days: t.ranges[data.days]! })} estimated={t.estimated} />
        <Kpi label={t.kpi.perDay} value={n(totals.tokens / data.days)} help={format(t.kpi.perDayHelp, { cost: usd(totals.cost / data.days) })} />
        <Kpi label={t.kpi.bots} value={n(totals.bots)} help={format(t.kpi.botsHelp, { n: n(totals.workspaces) })} />
      </div>

      <UsageCharts daily={daily} />

      <Section
        id="near-title"
        title={t.near.title}
        text={format(t.near.text, { share: formatPercent(NEAR_BUDGET_RATIO, locale), max: n(data.maxDailyTokens) })}
      >
        {data.nearBudget.total === 0 ? (
          <p className="m-0 text-sm text-[var(--color-muted)]">{t.near.empty}</p>
        ) : (
          <>
            <Table head={[t.near.columns.bot, t.near.columns.used, t.near.columns.limit, t.near.columns.share]} numeric={[1, 2, 3]}>
              {data.nearBudget.rows.map((b) => (
                <tr key={b.id} className="border-t border-[var(--color-line)]">
                  <td className={td}>
                    <Link href={`/admin/bots/${b.id}`} className={link}>
                      {b.name}
                    </Link>
                    <span className="block text-xs text-[var(--color-muted)]">
                      <Link href={`/admin/workspaces/${b.organizationId}`} className="text-inherit no-underline hover:underline">
                        {b.organizationName}
                      </Link>
                    </span>
                  </td>
                  <td className={cn(td, num)}>{n(b.tokens)}</td>
                  <td className={cn(td, num)}>
                    {n(b.limit)}
                    <span className="mt-1 flex justify-end gap-1">
                      <span className={cn(tag, b.limitedBy === "platform" ? "bg-[var(--color-bubble)] text-[var(--color-text)]" : "bg-[var(--color-bubble)] text-[var(--color-muted)]")}>
                        {b.limitedBy === "platform" ? t.near.byPlatform : t.near.byBot}
                      </span>
                      {b.override && <span className={cn(tag, "bg-[var(--color-bubble)] text-[var(--color-text)]")}>{t.near.override}</span>}
                    </span>
                  </td>
                  <td className={cn(td, num, "font-semibold", b.tokens >= b.limit && "text-red-700 dark:text-red-300")}>{pct(b.tokens, b.limit)}</td>
                </tr>
              ))}
            </Table>
            {data.nearBudget.rows.length < data.nearBudget.total && (
              <p className="m-0 text-xs text-[var(--color-muted)]">{format(t.near.more, { shown: n(data.nearBudget.rows.length), total: n(data.nearBudget.total) })}</p>
            )}
          </>
        )}
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section id="providers-title" title={t.providers.title}>
          <Table
            head={[t.providers.columns.provider, t.providers.columns.tokens, t.providers.columns.cost, t.providers.columns.share, t.providers.columns.bots]}
            numeric={[1, 2, 3, 4]}
          >
            {data.providers.map((p) => (
              <tr key={p.provider} className="border-t border-[var(--color-line)]">
                <th scope="row" className={cn(td, "text-left font-medium")}>
                  {providerLabel(p.provider)}
                </th>
                <td className={cn(td, num)}>{n(p.tokens)}</td>
                <td className={cn(td, num)}>{cost(p)}</td>
                <td className={cn(td, num)}>{pct(p.tokens, totals.tokens)}</td>
                <td className={cn(td, num)}>
                  {n(p.bots)} / {n(p.configuredBots)}
                </td>
              </tr>
            ))}
          </Table>
        </Section>

        <Section id="keys-title" title={t.keys.title} text={t.keys.text}>
          <Table head={[t.keys.columns.key, t.keys.columns.api, t.keys.columns.web, t.keys.columns.use]}>
            {RUNTIME_KEYS.map((k) => (
              <tr key={k} className="border-t border-[var(--color-line)]">
                <th scope="row" className={cn(td, "text-left font-mono text-xs font-medium")}>
                  {k}
                </th>
                <td className={td}>
                  <KeyState on={runtime ? runtime.keys[k] : null} labels={keyLabels} />
                </td>
                <td className={td}>
                  <KeyState on={web[k]} labels={keyLabels} />
                </td>
                <td className={cn(td, "text-[var(--color-muted)]")}>{t.keys.uses[k]}</td>
              </tr>
            ))}
          </Table>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-[var(--color-muted)]">{t.keys.ceiling}</dt>
            <dd className="m-0 tabular-nums">{n(data.maxDailyTokens)}</dd>
            <dt className="text-[var(--color-muted)]">{t.keys.defaultModel}</dt>
            <dd className="m-0 font-mono text-xs leading-5">{runtime?.defaultModel || "–"}</dd>
            <dt className="text-[var(--color-muted)]">{t.keys.embeddings}</dt>
            <dd className="m-0 font-mono text-xs leading-5">{runtime ? (runtime.embeddings ?? t.keys.off) : "–"}</dd>
            <dt className="text-[var(--color-muted)]">{t.keys.tier}</dt>
            <dd className="m-0">{runtime ? t.keys.tiers[runtime.geminiTier ?? "unset"] : "–"}</dd>
          </dl>
          {runtime?.reportedAt && <p className="m-0 text-xs text-[var(--color-muted)]">{format(t.reportedAt, { when: timeAgo(runtime.reportedAt, locale) })}</p>}
        </Section>
      </div>

      <Section id="top-bots-title" title={format(t.top.bots, { n: USAGE_TOP })}>
        {topBots.length === 0 ? (
          <p className="m-0 text-sm text-[var(--color-muted)]">{t.top.empty}</p>
        ) : (
          <Table head={[t.top.columns.bot, t.top.columns.plan, t.top.columns.model, t.top.columns.tokens, t.top.columns.cost, t.top.columns.share]} numeric={[3, 4, 5]}>
            {topBots.map((b) => (
              <tr key={b.id} className="border-t border-[var(--color-line)]">
                <td className={td}>
                  <Link href={`/admin/bots/${b.id}`} className={link}>
                    {b.name}
                  </Link>
                  <span className="block text-xs text-[var(--color-muted)]">
                    <Link href={`/admin/workspaces/${b.organizationId}`} className="text-inherit no-underline hover:underline">
                      {b.organizationName}
                    </Link>
                  </span>
                </td>
                <td className={td}>{planNames[b.plan]}</td>
                <td className={td}>
                  {b.model.label}
                  <span className="block text-xs text-[var(--color-muted)]">{providerLabel(b.model.provider)}</span>
                </td>
                <td className={cn(td, num)}>{n(b.tokens)}</td>
                <td className={cn(td, num)}>{cost(b)}</td>
                <td className={cn(td, num)}>{pct(b.tokens, totals.tokens)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <>
        <Section id="top-workspaces-title" title={format(t.top.workspaces, { n: USAGE_TOP })}>
          {topWorkspaces.length === 0 ? (
            <p className="m-0 text-sm text-[var(--color-muted)]">{t.top.empty}</p>
          ) : (
            <Table head={[t.top.columns.workspace, t.top.columns.plan, t.top.columns.bots, t.top.columns.tokens, t.top.columns.cost]} numeric={[2, 3, 4]}>
              {topWorkspaces.map((w) => (
                <tr key={w.id} className="border-t border-[var(--color-line)]">
                  <td className={td}>
                    <Link href={`/admin/workspaces/${w.id}`} className={link}>
                      {w.name}
                    </Link>
                  </td>
                  <td className={td}>{planNames[w.plan]}</td>
                  <td className={cn(td, num)}>{n(w.bots)}</td>
                  <td className={cn(td, num)}>{n(w.tokens)}</td>
                  <td className={cn(td, num)}>{cost(w)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section id="plans-title" title={t.plans.title} text={t.plans.text}>
          <Table
            head={[t.plans.columns.plan, t.plans.columns.workspaces, t.plans.columns.active, t.plans.columns.tokens, t.plans.columns.avgTokens, t.plans.columns.avgActive, t.plans.columns.avgCost]}
            numeric={[1, 2, 3, 4, 5, 6]}
          >
            {data.plans.map((p) => (
              <tr key={p.plan} className="border-t border-[var(--color-line)]">
                <th scope="row" className={cn(td, "text-left font-medium")}>
                  {planNames[p.plan]}
                </th>
                <td className={cn(td, num)}>{n(p.workspaces)}</td>
                <td className={cn(td, num)}>{n(p.activeWorkspaces)}</td>
                <td className={cn(td, num)}>{n(p.tokens)}</td>
                <td className={cn(td, num)}>{p.workspaces ? n(p.tokens / p.workspaces) : "–"}</td>
                <td className={cn(td, num)}>{p.activeWorkspaces ? n(p.tokens / p.activeWorkspaces) : "–"}</td>
                <td className={cn(td, num)}>{p.activeWorkspaces ? usd(p.cost / p.activeWorkspaces) : "–"}</td>
              </tr>
            ))}
          </Table>
        </Section>
      </>

      <Section id="models-title" title={t.models.title}>
        {data.models.length === 0 ? (
          <p className="m-0 text-sm text-[var(--color-muted)]">{t.top.empty}</p>
        ) : (
          <Table head={[t.models.columns.model, t.models.columns.price, t.models.columns.bots, t.models.columns.tokens, t.models.columns.cost]} numeric={[2, 3, 4]}>
            {data.models.map((m) => (
              <tr key={`${m.model.provider}:${m.model.id}`} className="border-t border-[var(--color-line)]">
                <td className={td}>
                  {m.model.label}
                  <span className="block font-mono text-xs text-[var(--color-muted)]">
                    {m.model.provider}:{m.model.id}
                  </span>
                </td>
                <td className={cn(td, "tabular-nums")}>
                  {m.model.price ? `${usd(m.model.price.input)} · ${usd(m.model.price.output)}` : <span className="text-[var(--color-muted)]">{t.models.noPrice}</span>}
                </td>
                <td className={cn(td, num)}>{n(m.bots)}</td>
                <td className={cn(td, num)}>{n(m.tokens)}</td>
                <td className={cn(td, num)}>{cost(m)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  )
}
