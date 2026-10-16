"use client"

import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { useAppI18n } from "@/components/i18n/app-provider"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { AnalyticsJson } from "@/lib/analytics"
import { format } from "@/lib/i18n"
import { LOCALE_META } from "@/lib/i18n/config"
import { formatNumber, formatPercent } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"

// Charts follow shadcn/ui's line and bar recipes (https://ui.shadcn.com/charts)

type Daily = AnalyticsJson["daily"]

export const card = "flex min-w-0 flex-col gap-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5"

export function CardHeader({ id, title, description, children }: { id?: string; title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm text-[var(--color-muted)]">{description}</p>}
      </div>
      {children}
    </div>
  )
}

/** "2026-10-16" -> "16 Oct" in the reader's language; the date is already local to the bot's chosen zone. */
function useDayLabel() {
  const { locale } = useAppI18n()
  return useMemo(() => {
    const short = new Intl.DateTimeFormat(LOCALE_META[locale].intl, { day: "numeric", month: "short", timeZone: "UTC" })
    const long = new Intl.DateTimeFormat(LOCALE_META[locale].intl, { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" })
    const parse = (day: unknown) => new Date(`${String(day)}T00:00:00Z`)
    return { short: (day: unknown) => short.format(parse(day)), long: (day: unknown) => long.format(parse(day)) }
  }, [locale])
}

// ---------- Activity: shadcn "Line Chart - Interactive" ----------

type ActivityKey = "conversations" | "questions"

export function ActivityChart({ daily }: { daily: Daily }) {
  const { t: app, locale } = useAppI18n()
  const t = app.analytics
  const [active, setActive] = useState<ActivityKey>("conversations")
  const label = useDayLabel()
  const config = {
    conversations: { label: t.series.conversations, color: "var(--chart-1)" },
    questions: { label: t.series.questions, color: "var(--chart-2)" },
  } satisfies ChartConfig
  const total = useMemo(
    () => ({ conversations: daily.reduce((n, d) => n + d.conversations, 0), questions: daily.reduce((n, d) => n + d.questions, 0) }),
    [daily],
  )

  return (
    <section className={cn(card, "gap-0 p-0")} aria-labelledby="activity-chart-title">
      <div className="flex flex-col items-stretch border-b border-[var(--color-line)] sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-0.5 px-5 py-4">
          <h2 id="activity-chart-title" className="font-semibold">
            {t.activity.title}
          </h2>
          <p className="text-sm text-[var(--color-muted)]">{t.activity.description}</p>
        </div>
        <div className="flex" role="tablist" aria-label={t.activity.title}>
          {(["conversations", "questions"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active === key}
              onClick={() => setActive(key)}
              className={cn(
                "relative flex flex-1 cursor-pointer flex-col justify-center gap-1 border-0 border-t border-[var(--color-line)] px-5 py-3 text-left text-[var(--color-text)] transition-colors even:border-l sm:border-t-0 sm:border-l sm:px-7 sm:py-4",
                active === key ? "bg-[var(--color-raised)]" : "bg-transparent hover:bg-[var(--color-raised)]/60",
              )}
            >
              <span className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: config[key].color }} aria-hidden />
                {config[key].label}
              </span>
              <span className="text-xl font-semibold tabular-nums sm:text-2xl">{formatNumber(total[key], locale)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="px-2 pt-4 pb-3 sm:px-5">
        <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
          <LineChart accessibilityLayer data={daily} margin={{ left: 4, right: 12, top: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tickFormatter={label.short} />
            <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} tickFormatter={(v: number) => formatNumber(v, locale)} />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent className="w-[11rem]" nameKey={active} labelFormatter={(_, payload) => label.long(payload?.[0]?.payload?.day)} valueFormatter={(v) => formatNumber(v, locale)} />}
            />
            <Line dataKey={active} type="monotone" stroke={`var(--color-${active})`} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ChartContainer>
      </div>
    </section>
  )
}

// ---------- Answer quality: shadcn "Line Chart - Multiple" ----------

export function QualityChart({ daily }: { daily: Daily }) {
  const { t: app, locale } = useAppI18n()
  const t = app.analytics
  const label = useDayLabel()
  const config = {
    sourced: { label: t.series.sourced, color: "var(--chart-2)" },
    unanswered: { label: t.series.unanswered, color: "var(--chart-4)" },
  } satisfies ChartConfig
  // a day without replies has no rate, so the line breaks instead of dropping to zero
  const rates = useMemo(
    () => daily.map((d) => ({ day: d.day, sourced: d.answers ? d.sourced / d.answers : null, unanswered: d.answers ? d.unanswered / d.answers : null })),
    [daily],
  )
  const pct = (v: number) => formatPercent(v, locale)

  return (
    <section className={card} aria-labelledby="quality-chart-title">
      <div className="flex flex-col gap-0.5">
        <h2 id="quality-chart-title" className="font-semibold">
          {t.quality.title}
        </h2>
        <p className="text-sm text-[var(--color-muted)]">{t.quality.description}</p>
      </div>
      <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
        <LineChart accessibilityLayer data={rates} margin={{ left: 4, right: 12, top: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tickFormatter={label.short} />
          <YAxis tickLine={false} axisLine={false} width={44} domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={pct} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(_, payload) => label.long(payload?.[0]?.payload?.day)} valueFormatter={pct} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Line dataKey="sourced" type="monotone" stroke="var(--color-sourced)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
          <Line dataKey="unanswered" type="monotone" stroke="var(--color-unanswered)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} connectNulls={false} />
        </LineChart>
      </ChartContainer>
    </section>
  )
}

// ---------- Busiest hours: shadcn "Bar Chart" ----------

const hh = (h: number) => String(h).padStart(2, "0")

export function HoursChart({ hours }: { hours: number[] }) {
  const { t: app, locale } = useAppI18n()
  const t = app.analytics
  const config = { questions: { label: t.series.questions, color: "var(--chart-1)" } } satisfies ChartConfig
  const data = hours.map((questions, hour) => ({ hour, questions }))
  const peak = Math.max(...hours)

  return (
    <section className={card} aria-labelledby="hours-chart-title">
      <CardHeader id="hours-chart-title" title={t.hours.title} description={t.hours.description} />
      <ChartContainer config={config} className="aspect-auto h-[180px] w-full">
        <BarChart accessibilityLayer data={data} margin={{ left: 0, right: 4, top: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={6} interval={2} tickFormatter={(h: number) => hh(h)} />
          <YAxis hide domain={[0, Math.max(1, peak)]} />
          <ChartTooltip
            cursor
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const h = Number(payload?.[0]?.payload?.hour ?? 0)
                  return format(t.hours.label, { from: `${hh(h)}:00`, to: `${hh(h)}:59` })
                }}
                valueFormatter={(v) => formatNumber(v, locale)}
              />
            }
          />
          <Bar dataKey="questions" fill="var(--color-questions)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </section>
  )
}
