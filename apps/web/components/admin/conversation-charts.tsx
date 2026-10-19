"use client"

import type { ConversationDay } from "@apex/db"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartEmptyOverlay, card } from "@/components/analytics/charts"
import { useAppI18n } from "@/components/i18n/app-provider"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { format } from "@/lib/i18n"
import { LOCALE_META } from "@/lib/i18n/config"
import { formatNumber, formatPercent } from "@/lib/i18n/format"
import { useDayLabel } from "./usage-charts"

// /admin/conversations' daily charts: conversations split into those the bot kept and those handed
// off to a person, and the replies split into answered and unanswered. The numbers behind both fold out as a table.

const compact = (n: number, intl: string) => new Intl.NumberFormat(intl, { notation: "compact", maximumFractionDigits: 1 }).format(n)

export function ConversationCharts({ daily }: { daily: ConversationDay[] }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.conversations.charts
  const label = useDayLabel()
  const intl = LOCALE_META[locale].intl
  const num = (n: number) => formatNumber(n, locale)

  const sum = (key: keyof Omit<ConversationDay, "day">) => daily.reduce((n, d) => n + d[key], 0)
  const conversations = sum("conversations")
  const answers = sum("answers")
  const unanswered = sum("unanswered")
  // hand-offs are a few of a day's conversations: stacked, they stay visible on the same scale
  const volume = daily.map((d) => ({ day: d.day, kept: d.conversations - d.handoffs, handoffs: d.handoffs }))
  const replies = daily.map((d) => ({ day: d.day, answered: d.answers - d.unanswered, unanswered: d.unanswered }))

  const volumeConfig = {
    kept: { label: t.keptSeries, color: "var(--chart-1)" },
    handoffs: { label: t.handoffsSeries, color: "var(--chart-3)" },
  } satisfies ChartConfig
  const replyConfig = {
    answered: { label: t.answered, color: "var(--chart-2)" },
    unanswered: { label: t.unanswered, color: "var(--chart-4)" },
  } satisfies ChartConfig
  const tooltipLabel = (_: unknown, payload: readonly { payload?: { day?: string } }[] | undefined) => label.long(payload?.[0]?.payload?.day)
  const axis = { tickLine: false, axisLine: false } as const

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <section className={card} aria-labelledby="conversations-volume-title">
          <div className="flex flex-col gap-0.5">
            <h3 id="conversations-volume-title" className="text-sm font-semibold">
              {t.conversations}
            </h3>
            <p className="text-sm text-[var(--color-muted)] tabular-nums">{format(t.conversationsTotal, { n: num(conversations), handoffs: num(sum("handoffs")) })}</p>
          </div>
          <ChartEmptyOverlay show={conversations === 0} message={t.empty}>
            <ChartContainer config={volumeConfig} className="aspect-auto h-[220px] w-full">
              <BarChart accessibilityLayer data={volume} margin={{ left: 0, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" {...axis} tickMargin={8} minTickGap={28} tickFormatter={label.short} />
                <YAxis {...axis} width={44} allowDecimals={false} tickFormatter={(v: number) => compact(v, intl)} />
                <ChartTooltip cursor content={<ChartTooltipContent labelFormatter={tooltipLabel} valueFormatter={num} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="kept" stackId="c" fill="var(--color-kept)" />
                <Bar dataKey="handoffs" stackId="c" fill="var(--color-handoffs)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </ChartEmptyOverlay>
        </section>
        <section className={card} aria-labelledby="conversations-replies-title">
          <div className="flex flex-col gap-0.5">
            <h3 id="conversations-replies-title" className="text-sm font-semibold">
              {t.replies}
            </h3>
            <p className="text-sm text-[var(--color-muted)] tabular-nums">
              {format(t.repliesTotal, { rate: answers ? formatPercent(unanswered / answers, locale) : "–", negative: num(sum("negative")) })}
            </p>
          </div>
          <ChartEmptyOverlay show={answers === 0} message={t.empty}>
            <ChartContainer config={replyConfig} className="aspect-auto h-[220px] w-full">
              <BarChart accessibilityLayer data={replies} margin={{ left: 0, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" {...axis} tickMargin={8} minTickGap={28} tickFormatter={label.short} />
                <YAxis {...axis} width={44} allowDecimals={false} tickFormatter={(v: number) => compact(v, intl)} />
                <ChartTooltip cursor content={<ChartTooltipContent labelFormatter={tooltipLabel} valueFormatter={num} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="answered" stackId="r" fill="var(--color-answered)" />
                <Bar dataKey="unanswered" stackId="r" fill="var(--color-unanswered)" radius={[3, 3, 0, 0]} />
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
                {[t.day, t.conversationsSeries, t.handoffsSeries, t.answered, t.unanswered, t.negative].map((h, i) => (
                  <th key={h} scope="col" className={i === 0 ? "py-1.5 text-left font-medium" : "py-1.5 pl-4 font-medium"}>
                    {h}
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
                  <td className="py-1.5 pl-4">{num(d.conversations)}</td>
                  <td className="py-1.5 pl-4">{num(d.handoffs)}</td>
                  <td className="py-1.5 pl-4">{num(d.answers - d.unanswered)}</td>
                  <td className="py-1.5 pl-4">{num(d.unanswered)}</td>
                  <td className="py-1.5 pl-4">{num(d.negative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
