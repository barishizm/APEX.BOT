"use client"

import { ArrowDownRight, ArrowUpRight, ChartColumn, ChevronDown, Download, ExternalLink, FileText, Globe, Minus, RefreshCw } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useAppI18n } from "@/components/i18n/app-provider"
import type { AnalyticsJson } from "@/lib/analytics"
import { format } from "@/lib/i18n"
import { formatNumber, formatPercent, plural } from "@/lib/i18n/format"
import { LOCALE_META } from "@/lib/i18n/config"
import { TZ_COOKIE } from "@/lib/time-zone"
import { cn } from "@/lib/utils"
import { ActivityChart, CardHeader, HoursChart, QualityChart, card } from "./charts"
import { UnansweredQuestions, type AnswerLimits } from "./unanswered"

const RANGES = [7, 30, 90] as const
type Totals = AnalyticsJson["current"]

const ratio = (a: number, b: number) => (b > 0 ? a / b : null)

// ---------- KPI tiles ----------

type Trend = { text: string; direction: "up" | "down" | "flat"; tone: "good" | "bad" | "neutral" }

function Kpi({ label, value, help, trend, vs }: { label: string; value: string; help: string; trend: Trend | null; vs: string }) {
  const Icon = trend?.direction === "up" ? ArrowUpRight : trend?.direction === "down" ? ArrowDownRight : Minus
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <span className="text-xs font-medium text-[var(--color-muted)]">{label}</span>
      <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
      {trend && (
        <span
          className={cn(
            "inline-flex w-fit items-center gap-0.5 rounded-full px-1.5 py-px text-xs font-semibold tabular-nums",
            trend.tone === "good" && "bg-green-600/12 text-green-700 dark:text-green-300",
            trend.tone === "bad" && "bg-red-500/12 text-red-700 dark:text-red-300",
            trend.tone === "neutral" && "bg-[var(--color-bubble)] text-[var(--color-muted)]",
          )}
          title={vs}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {trend.text}
          <span className="sr-only"> {vs}</span>
        </span>
      )}
      <span className="mt-auto pt-1 text-xs leading-snug text-[var(--color-muted)]">{help}</span>
    </div>
  )
}

// ---------- Topics and cited pages ----------

function Meter({ value, color = "var(--chart-1)" }: { value: number; color?: string }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bubble)]" aria-hidden>
      <span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.round(value * 100))}%`, background: color }} />
    </span>
  )
}

function TopicsCard({ data }: { data: AnalyticsJson }) {
  const { t: app, locale } = useAppI18n()
  const t = app.analytics.topics
  const [tab, setTab] = useState<"topics" | "sources">("topics")
  const pct = (v: number) => formatPercent(v, locale)
  const topQuestions = Math.max(1, ...data.topics.map((x) => x.questions))
  const topReplies = Math.max(1, ...data.topSources.map((x) => x.replies))

  return (
    <section className={card} aria-labelledby="topics-title">
      <CardHeader id="topics-title" title={t.title} description={t.description}>
        <div role="tablist" aria-label={t.title} className="flex rounded-lg bg-[var(--color-bubble)] p-0.5 text-sm">
          {(["topics", "sources"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              aria-controls={`topics-panel-${key}`}
              onClick={() => setTab(key)}
              className={cn(
                "cursor-pointer rounded-md border-0 px-2.5 py-1 font-medium transition-colors",
                tab === key ? "bg-[var(--color-raised)] text-[var(--color-text)] shadow-sm" : "bg-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]",
              )}
            >
              {t.tabs[key]}
            </button>
          ))}
        </div>
      </CardHeader>

      {tab === "topics" ? (
        <div id="topics-panel-topics" role="tabpanel" className="flex flex-col gap-2">
          {data.topics.length === 0 ? (
            <p className="rounded-xl bg-[var(--color-raised)] px-4 py-6 text-center text-sm text-[var(--color-muted)]">{t.empty}</p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-1 p-0">
              {data.topics.map((topic, i) => {
                const sourced = ratio(topic.sourced, topic.replied)
                return (
                  <li key={topic.label} className="rounded-xl bg-[var(--color-raised)]">
                    <details className="group">
                      <summary className="grid cursor-pointer list-none grid-cols-[1.75rem_1fr_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                        <span className="text-sm font-semibold text-[var(--color-muted)] tabular-nums">{i + 1}</span>
                        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="truncate font-semibold">{topic.title}</span>
                          {topic.keywords.slice(1).map((k) => (
                            <span key={k} className="rounded-md bg-[var(--color-bubble)] px-1.5 py-px text-xs text-[var(--color-muted)]">
                              {k}
                            </span>
                          ))}
                        </span>
                        <span className="text-right text-sm font-semibold tabular-nums">{plural(topic.questions, t.questions, locale)}</span>
                        <span />
                        <span className="flex min-w-0 flex-col gap-1.5">
                          <Meter value={topic.questions / topQuestions} />
                          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--color-muted)]">
                            <span>{format(t.share, { p: pct(topic.share) })}</span>
                            {sourced !== null && <span>{format(t.sourced, { p: pct(sourced) })}</span>}
                            {topic.unanswered > 0 && <span className="font-semibold text-amber-700 dark:text-amber-300">{plural(topic.unanswered, t.unanswered, locale)}</span>}
                          </span>
                        </span>
                        <span className="flex justify-end text-[var(--color-muted)]">
                          <span className="sr-only">{t.showExamples}</span>
                          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
                        </span>
                      </summary>
                      <div className="px-3 pb-3 pl-[3.25rem]">
                        <p className="mb-1 text-xs font-semibold text-[var(--color-muted)]">{t.examples}</p>
                        <ul className="m-0 flex list-disc flex-col gap-1 pl-4 text-sm">
                          {topic.examples.map((ex) => (
                            <li key={ex} className="break-words">
                              {ex}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  </li>
                )
              })}
            </ol>
          )}
          {data.sampled && <p className="text-xs text-[var(--color-muted)]">{format(t.sampled, { n: formatNumber(data.questionCount, locale) })}</p>}
        </div>
      ) : (
        <div id="topics-panel-sources" role="tabpanel">
          {data.topSources.length === 0 ? (
            <p className="rounded-xl bg-[var(--color-raised)] px-4 py-6 text-center text-sm text-[var(--color-muted)]">{t.sourcesEmpty}</p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-1 p-0">
              {data.topSources.map((s, i) => (
                <li key={`${s.url}|${s.title}`} className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-x-3 gap-y-1.5 rounded-xl bg-[var(--color-raised)] px-3 py-2.5">
                  <span className="text-sm font-semibold text-[var(--color-muted)] tabular-nums">{i + 1}</span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    {s.url ? <Globe className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted)]" aria-hidden /> : <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted)]" aria-hidden />}
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-w-0 items-center gap-1 font-semibold">
                        <span className="truncate">{s.title || s.url}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                      </a>
                    ) : (
                      <span className="truncate font-semibold">{s.title || t.textSource}</span>
                    )}
                  </span>
                  <span className="text-right text-xs text-[var(--color-muted)]">{plural(s.replies, t.replies, locale)}</span>
                  <span />
                  <span className="col-span-2">
                    <Meter value={s.replies / topReplies} color="var(--chart-2)" />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  )
}

function LanguagesCard({ languages }: { languages: AnalyticsJson["languages"] }) {
  const { t: app, locale } = useAppI18n()
  const t = app.analytics.languages
  const total = Object.values(languages).reduce((n, v) => n + v, 0)
  const rows = (Object.entries(languages) as [keyof typeof t.names, number][]).filter(([, n]) => n > 0).sort((a, b) => (a[0] === "other" ? 1 : b[0] === "other" ? -1 : b[1] - a[1]))
  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]
  const OTHER = "color-mix(in srgb, var(--color-muted) 40%, transparent)"

  return (
    <section className={card} aria-labelledby="languages-title">
      <CardHeader id="languages-title" title={t.title} description={t.description} />
      {total === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">{app.analytics.noData}</p>
      ) : (
        <>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-bubble)]" aria-hidden>
            {rows.map(([lang, n], i) => (
              <span key={lang} style={{ width: `${(n / total) * 100}%`, background: lang === "other" ? OTHER : colors[i % colors.length] }} />
            ))}
          </div>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
            {rows.map(([lang, n], i) => (
              <li key={lang} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: lang === "other" ? OTHER : colors[i % colors.length] }} aria-hidden />
                <span className="flex-1">{t.names[lang]}</span>
                <span className="tabular-nums text-[var(--color-muted)]">{formatNumber(n, locale)}</span>
                <span className="w-12 text-right font-semibold tabular-nums">{formatPercent(n / total, locale)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

// ---------- Page ----------

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

function downloadCsv(data: AnalyticsJson, labels: Record<"day" | "conversations" | "questions" | "answers" | "sourced" | "unanswered", string>) {
  const esc = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  const head = [labels.day, labels.conversations, labels.questions, labels.answers, labels.sourced, labels.unanswered]
  const rows = data.daily.map((d) => [d.day, d.conversations, d.questions, d.answers, d.sourced, d.unanswered])
  // BOM so spreadsheet apps read Turkish and Baltic letters correctly
  const blob = new Blob(["﻿" + [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement("a"), { href: url, download: `apex-analytics-${data.days}d-${data.daily.at(-1)?.day ?? "export"}.csv` })
  a.click()
  URL.revokeObjectURL(url)
}

export function AnalyticsDashboard({ initial, canEdit, limits }: { initial: AnalyticsJson; canEdit: boolean; limits: AnswerLimits }) {
  const { t: app, locale } = useAppI18n()
  const t = app.analytics
  const [data, setData] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)

  const load = useCallback(
    async (days: number, timeZone: string) => {
      request.current?.abort()
      const controller = new AbortController()
      request.current = controller
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/analytics?days=${days}&tz=${encodeURIComponent(timeZone)}`, { signal: controller.signal, cache: "no-store" })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(typeof json.message === "string" ? json.message : t.loadFailed)
        setData(json as AnalyticsJson)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : t.loadFailed)
      } finally {
        if (request.current === controller) setLoading(false)
      }
    },
    [t.loadFailed],
  )

  // The server rendered days in the remembered zone (UTC on a first visit); if the browser's
  // differs, remember it and reload so "today" means the reader's today
  useEffect(() => {
    const tz = browserTimeZone()
    if (tz === initial.timeZone) return
    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    void load(initial.days, tz)
  }, [initial.days, initial.timeZone, load])

  useEffect(() => () => request.current?.abort(), [])

  const setRange = (days: number) => {
    if (days === data.days && !error) return
    const url = new URL(window.location.href)
    url.searchParams.set("days", String(days))
    window.history.replaceState(null, "", url)
    void load(days, data.timeZone)
  }

  const { current: cur, previous: prev } = data
  const vs = format(t.vsPrevious, { days: data.days })
  const pctNum = (v: number) => formatPercent(v, locale)
  const signed = new Intl.NumberFormat(LOCALE_META[locale].intl, { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" })
  const signedInt = new Intl.NumberFormat(LOCALE_META[locale].intl, { maximumFractionDigits: 0, signDisplay: "exceptZero" })

  // Volumes: relative change, colored neutral (more traffic isn't better or worse by itself)
  const countTrend = (a: number, b: number): Trend | null => {
    if (!a && !b) return null
    if (!b) return { text: t.newValue, direction: "up", tone: "neutral" }
    const change = (a - b) / b
    return { text: signed.format(change), direction: Math.abs(change) < 0.005 ? "flat" : change > 0 ? "up" : "down", tone: "neutral" }
  }
  // Rates: difference in percentage points, green when it moves the right way
  const rateTrend = (a: number | null, b: number | null, higherIsBetter: boolean): Trend | null => {
    if (a === null || b === null) return null
    const pts = Math.round((a - b) * 100)
    const direction = pts === 0 ? "flat" : pts > 0 ? "up" : "down"
    const tone = pts === 0 ? "neutral" : pts > 0 === higherIsBetter ? "good" : "bad"
    return { text: format(t.points, { n: signedInt.format(pts) }), direction, tone }
  }

  const rate = (r: Totals) => ({
    sourced: ratio(r.sourcedAnswers, r.answers),
    unanswered: ratio(r.unanswered, r.answers),
    helpful: ratio(r.helpful, r.helpful + r.notHelpful),
  })
  const rc = rate(cur)
  const rp = rate(prev)
  const show = (v: number | null) => (v === null ? t.noData : pctNum(v))

  const kpis: { key: string; label: string; value: string; help: string; trend: Trend | null }[] = [
    { key: "conversations", label: t.kpi.conversations, value: formatNumber(cur.conversations, locale), help: t.kpiHelp.conversations, trend: countTrend(cur.conversations, prev.conversations) },
    { key: "questions", label: t.kpi.questions, value: formatNumber(cur.questions, locale), help: t.kpiHelp.questions, trend: countTrend(cur.questions, prev.questions) },
    { key: "sourced", label: t.kpi.sourcedRate, value: show(rc.sourced), help: t.kpiHelp.sourcedRate, trend: rateTrend(rc.sourced, rp.sourced, true) },
    { key: "unanswered", label: t.kpi.unansweredRate, value: show(rc.unanswered), help: t.kpiHelp.unansweredRate, trend: rateTrend(rc.unanswered, rp.unanswered, false) },
    { key: "helpful", label: t.kpi.satisfaction, value: show(rc.helpful), help: t.kpiHelp.satisfaction, trend: rateTrend(rc.helpful, rp.helpful, true) },
    {
      key: "leads",
      label: t.kpi.leads,
      value: formatNumber(cur.leads, locale),
      help: format(t.kpiHelp.leads, { handoffs: formatNumber(cur.handoffs, locale) }),
      trend: countTrend(cur.leads, prev.leads),
    },
  ]

  const empty = cur.conversations === 0 && prev.conversations === 0 && data.unanswered.length === 0

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ChartColumn className="h-6 w-6 text-[var(--color-muted)]" aria-hidden />
            {t.title}
          </h1>
          <p className="max-w-2xl text-[var(--color-muted)]">{t.lede}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label={t.range} className="flex rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-0.5 text-sm">
            {RANGES.map((days) => (
              <button
                key={days}
                type="button"
                role="radio"
                aria-checked={data.days === days}
                onClick={() => setRange(days)}
                className={cn(
                  "cursor-pointer rounded-md border-0 px-3 py-1.5 font-medium transition-colors",
                  data.days === days ? "bg-[var(--color-primary)] text-[var(--color-on-primary)]" : "bg-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]",
                )}
              >
                {t.ranges[`d${days}`]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load(data.days, data.timeZone)}
            disabled={loading}
            aria-label={t.refresh}
            title={t.refresh}
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[var(--color-line)] bg-transparent text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] disabled:cursor-default"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => downloadCsv(data, t.csv)}
            disabled={empty}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-transparent px-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-muted)] disabled:cursor-default disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden />
            {t.exportCsv}
          </button>
        </div>
      </header>

      <div className="-mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-muted)]">
        <span>{format(t.timeZone, { tz: data.timeZone.replace(/_/g, " ") })}</span>
        {data.days > data.retentionDays && (
          <span>
            {format(t.retentionNote, { n: data.retentionDays })}{" "}
            <Link href="/dashboard/widget?section=install" className="font-semibold">
              {t.retentionLink}
            </Link>
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <div aria-busy={loading} className={cn("flex flex-col gap-6 transition-opacity", loading && "pointer-events-none opacity-60")}>
        {empty ? (
          <Empty />
        ) : (
          <>
            <section aria-label={t.title} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {kpis.map(({ key, ...k }) => (
                <Kpi key={key} {...k} vs={vs} />
              ))}
            </section>

            <ActivityChart daily={data.daily} />

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <TopicsCard data={data} />
              <div className="flex min-w-0 flex-col gap-6">
                <QualityChart daily={data.daily} />
                <LanguagesCard languages={data.languages} />
              </div>
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <UnansweredQuestions groups={data.unanswered} open={data.unansweredOpen} canEdit={canEdit} limits={limits} />
              <HoursChart hours={data.hours} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Empty(): ReactNode {
  const { t: app } = useAppI18n()
  const t = app.analytics.empty
  return (
    <section className={cn(card, "items-center py-14 text-center")}>
      <ChartColumn className="h-8 w-8 text-[var(--color-muted)]" aria-hidden />
      <h2 className="text-lg font-semibold">{t.title}</h2>
      <p className="max-w-md text-sm text-[var(--color-muted)]">{t.text}</p>
      <Link
        href="/dashboard/widget?section=install"
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 text-sm font-semibold no-underline"
        style={{ color: "var(--color-on-primary)" }}
      >
        {t.install}
      </Link>
    </section>
  )
}
