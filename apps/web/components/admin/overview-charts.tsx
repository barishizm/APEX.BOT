"use client"

import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { useAppI18n } from "@/components/i18n/app-provider"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { ChartEmptyOverlay, card } from "@/components/analytics/charts"
import { format } from "@/lib/i18n"
import { LOCALE_META } from "@/lib/i18n/config"
import { formatNumber } from "@/lib/i18n/format"

// The admin overview's daily charts. The four measures differ in scale by orders of magnitude
// (tokens vs new accounts), so each gets its own small chart instead of sharing an axis.

export interface OverviewDayJson {
  day: string
  newUsers: number
  conversations: number
  messages: number
  tokens: number
}

const SERIES = ["newUsers", "conversations", "messages", "tokens"] as const
type Series = (typeof SERIES)[number]

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

function DailyChart({ series, daily }: { series: Series; daily: OverviewDayJson[] }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.overview.charts
  const label = useDayLabel()
  const intl = LOCALE_META[locale].intl
  const config = { [series]: { label: t[series], color: "var(--chart-1)" } } satisfies ChartConfig
  const total = daily.reduce((n, d) => n + d[series], 0)
  const id = `overview-${series}-title`

  return (
    <section className={card} aria-labelledby={id}>
      <div className="flex flex-col gap-0.5">
        <h3 id={id} className="text-sm font-semibold">
          {t[series]}
        </h3>
        <p className="text-sm text-[var(--color-muted)] tabular-nums">{format(t.total, { n: formatNumber(total, locale) })}</p>
      </div>
      <ChartEmptyOverlay show={total === 0} message={t.empty}>
        <ChartContainer config={config} className="aspect-auto h-[160px] w-full">
          <BarChart accessibilityLayer data={daily} margin={{ left: 0, right: 4, top: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tickFormatter={label.short} />
            <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} tickFormatter={(v: number) => compact(v, intl)} />
            <ChartTooltip
              cursor
              content={<ChartTooltipContent labelFormatter={(_, payload) => label.long(payload?.[0]?.payload?.day)} valueFormatter={(v) => formatNumber(v, locale)} />}
            />
            <Bar dataKey={series} fill={`var(--color-${series})`} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </ChartEmptyOverlay>
    </section>
  )
}

export function OverviewCharts({ daily }: { daily: OverviewDayJson[] }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.overview.charts
  const label = useDayLabel()
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        {SERIES.map((s) => (
          <DailyChart key={s} series={s} daily={daily} />
        ))}
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
                {SERIES.map((s) => (
                  <th key={s} scope="col" className="py-1.5 pl-4 font-medium">
                    {t[s]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.day} className="border-t border-[var(--color-line)]">
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {label.long(d.day)}
                  </th>
                  {SERIES.map((s) => (
                    <td key={s} className="py-1.5 pl-4">
                      {formatNumber(d[s], locale)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
