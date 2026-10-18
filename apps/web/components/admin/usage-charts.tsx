"use client"

import { Download } from "lucide-react"
import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartEmptyOverlay, card } from "@/components/analytics/charts"
import { useAppI18n } from "@/components/i18n/app-provider"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { format } from "@/lib/i18n"
import { LOCALE_META } from "@/lib/i18n/config"
import { formatNumber, formatUsd } from "@/lib/i18n/format"
import { errorMessage } from "./data-table"
import { button } from "./detail-ui"

// /admin/usage's daily charts: tokens stacked by kind (input, output, and the days counted
// before the split was recorded), and the estimated cost. Tokens and dollars get a chart each.

export interface UsageDayJson {
  day: string
  input: number
  output: number
  unsplit: number
  cost: number
}

function useDayLabel() {
  const { locale } = useAppI18n()
  return useMemo(() => {
    const short = new Intl.DateTimeFormat(LOCALE_META[locale].intl, { day: "numeric", month: "short", timeZone: "UTC" })
    const long = new Intl.DateTimeFormat(LOCALE_META[locale].intl, { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" })
    const parse = (day: unknown) => new Date(`${String(day)}T00:00:00Z`)
    return { short: (day: unknown) => short.format(parse(day)), long: (day: unknown) => long.format(parse(day)) }
  }, [locale])
}

const compact = (n: number, intl: string) => new Intl.NumberFormat(intl, { notation: "compact", maximumFractionDigits: 1 }).format(n)

export function UsageCharts({ daily }: { daily: UsageDayJson[] }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.usage.charts
  const label = useDayLabel()
  const intl = LOCALE_META[locale].intl
  const showUnsplit = daily.some((d) => d.unsplit > 0)
  const tokenConfig = {
    input: { label: t.input, color: "var(--chart-1)" },
    output: { label: t.output, color: "var(--chart-2)" },
    ...(showUnsplit ? { unsplit: { label: t.unsplit, color: "var(--chart-5)" } } : {}),
  } satisfies ChartConfig
  const costConfig = { cost: { label: t.costSeries, color: "var(--chart-3)" } } satisfies ChartConfig
  const tokens = daily.reduce((n, d) => n + d.input + d.output + d.unsplit, 0)
  const cost = daily.reduce((n, d) => n + d.cost, 0)
  const tooltipLabel = (_: unknown, payload: readonly { payload?: { day?: string } }[] | undefined) => label.long(payload?.[0]?.payload?.day)

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <section className={card} aria-labelledby="usage-tokens-title">
          <div className="flex flex-col gap-0.5">
            <h3 id="usage-tokens-title" className="text-sm font-semibold">
              {t.tokens}
            </h3>
            <p className="text-sm text-[var(--color-muted)] tabular-nums">{format(t.total, { n: formatNumber(tokens, locale) })}</p>
          </div>
          <ChartEmptyOverlay show={tokens === 0} message={t.empty}>
            <ChartContainer config={tokenConfig} className="aspect-auto h-[220px] w-full">
              <BarChart accessibilityLayer data={daily} margin={{ left: 0, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tickFormatter={label.short} />
                <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} tickFormatter={(v: number) => compact(v, intl)} />
                <ChartTooltip cursor content={<ChartTooltipContent labelFormatter={tooltipLabel} valueFormatter={(v) => formatNumber(v, locale)} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="input" stackId="t" fill="var(--color-input)" />
                <Bar dataKey="output" stackId="t" fill="var(--color-output)" radius={showUnsplit ? undefined : [3, 3, 0, 0]} />
                {showUnsplit && <Bar dataKey="unsplit" stackId="t" fill="var(--color-unsplit)" radius={[3, 3, 0, 0]} />}
              </BarChart>
            </ChartContainer>
          </ChartEmptyOverlay>
        </section>
        <section className={card} aria-labelledby="usage-cost-title">
          <div className="flex flex-col gap-0.5">
            <h3 id="usage-cost-title" className="text-sm font-semibold">
              {t.cost}
            </h3>
            <p className="text-sm text-[var(--color-muted)] tabular-nums">{format(t.total, { n: formatUsd(cost, locale) })}</p>
          </div>
          <ChartEmptyOverlay show={tokens === 0} message={t.empty}>
            <ChartContainer config={costConfig} className="aspect-auto h-[220px] w-full">
              <BarChart accessibilityLayer data={daily} margin={{ left: 0, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tickFormatter={label.short} />
                <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => formatUsd(v, locale)} />
                <ChartTooltip cursor content={<ChartTooltipContent labelFormatter={tooltipLabel} valueFormatter={(v) => formatUsd(v, locale)} />} />
                <Bar dataKey="cost" fill="var(--color-cost)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </ChartEmptyOverlay>
        </section>
      </div>
      <details className="rounded-xl border border-[var(--color-line)] px-4 py-2 text-sm">
        <summary className="cursor-pointer text-[var(--color-muted)]">{t.table}</summary>
        <div className="mt-2 max-h-80 overflow-auto">
          <table className="w-full border-collapse text-right tabular-nums">
            <thead className="sticky top-0 bg-[var(--color-surface)] text-xs text-[var(--color-muted)]">
              <tr>
                <th scope="col" className="py-1.5 text-left font-medium">
                  {t.day}
                </th>
                <th scope="col" className="py-1.5 pl-4 font-medium">
                  {t.input}
                </th>
                <th scope="col" className="py-1.5 pl-4 font-medium">
                  {t.output}
                </th>
                {showUnsplit && (
                  <th scope="col" className="py-1.5 pl-4 font-medium">
                    {t.unsplit}
                  </th>
                )}
                <th scope="col" className="py-1.5 pl-4 font-medium">
                  {t.costSeries}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.day} className="border-t border-[var(--color-line)]">
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {label.long(d.day)}
                  </th>
                  <td className="py-1.5 pl-4">{formatNumber(d.input, locale)}</td>
                  <td className="py-1.5 pl-4">{formatNumber(d.output, locale)}</td>
                  {showUnsplit && <td className="py-1.5 pl-4">{formatNumber(d.unsplit, locale)}</td>}
                  <td className="py-1.5 pl-4">{formatUsd(d.cost, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

/** Downloads the range as CSV (one row per bot and day); the export is audited. */
export function UsageExportButton({ days }: { days: number }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function download() {
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/admin/usage?days=${days}`, { cache: "no-store" })
      if (!res.ok) throw new Error(await errorMessage(res, t.table.exportFailed))
      const truncated = res.headers.get("x-export-truncated")
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "usage.csv"
      const url = URL.createObjectURL(await res.blob())
      Object.assign(document.createElement("a"), { href: url, download: name }).click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      if (truncated) setNotice(t.table.exportTruncated.replace("{n}", formatNumber(Number(truncated), locale)))
    } catch (err) {
      setNotice(err instanceof Error && err.message ? err.message : t.table.exportFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={download} disabled={busy} className={button}>
        <Download className="h-4 w-4" aria-hidden />
        {busy ? t.table.exporting : t.usage.exportCsv}
      </button>
      {notice && (
        <p role="status" className="m-0 max-w-xs text-right text-xs text-[var(--color-muted)]">
          {notice}
        </p>
      )}
    </div>
  )
}
