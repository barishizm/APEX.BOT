"use client"

import type { EmbeddingCoverageRow, JobRun, KnowledgeSummary } from "@apex/db"
import { AlertTriangle, ChevronRight } from "lucide-react"
import Link from "next/link"
import { useAppI18n } from "@/components/i18n/app-provider"
import { formatDate, formatNumber, formatPercent } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { Empty, fill, Section, Table, tag, td, When, type Jsonify } from "./detail-ui"

// The top of /admin/knowledge: counts that link to filtered views of the list below, the daily
// refresh job's last runs (app.job_runs) and how much of each bot's knowledge has embeddings.

export interface KnowledgeOverviewJson {
  summary: KnowledgeSummary
  runs: Jsonify<JobRun>[]
  /** null when APEX_EMBEDDINGS is off here. */
  coverage: EmbeddingCoverageRow[] | null
  model: string | null
}

// Vercel Cron runs it daily; a run older than this means it didn't run
const RUN_LATE_HOURS = 26
// a run still open after this died with its function call (the job's own limit is 5 minutes)
const RUN_DEAD_MINUTES = 10
// below this share of chunks embedded, a bot answers mostly by keywords
const COVERAGE_LOW = 0.9

const box = "flex min-w-0 flex-col gap-1 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4"

type RunState = "ok" | "failed" | "running" | "dead"
const runState = (r: Jsonify<JobRun>): RunState =>
  r.finishedAt ? (r.ok ? "ok" : "failed") : Date.now() - new Date(r.startedAt).getTime() > RUN_DEAD_MINUTES * 60_000 ? "dead" : "running"
const RUN_TONE: Record<RunState, string> = {
  ok: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
  failed: "bg-[var(--color-danger)]/15 text-[var(--color-danger)]",
  running: "bg-[var(--color-bubble)] text-[var(--color-text)]",
  dead: "bg-[var(--color-danger)]/15 text-[var(--color-danger)]",
}

function Tile({ label, value, help, href, warn }: { label: string; value: string; help: string; href?: string; warn?: boolean }) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-2 text-xs font-medium text-[var(--color-muted)]">
        {label}
        {href && <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-text)]" aria-hidden />}
      </span>
      <span className="flex items-center gap-1.5 text-2xl font-semibold tracking-tight tabular-nums">
        {warn && <AlertTriangle className="h-4 w-4 text-[var(--color-warning)]" aria-hidden />}
        {value}
      </span>
      <span className="mt-auto pt-1 text-xs leading-snug text-[var(--color-muted)]">{help}</span>
    </>
  )
  return href ? (
    <Link href={href} className={cn(box, "group text-[var(--color-text)] no-underline transition-colors hover:border-[var(--color-muted)] focus-visible:border-[var(--color-muted)]")}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  )
}

export function KnowledgeOverview({ data }: { data: KnowledgeOverviewJson }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.knowledge.overview
  const { summary: s, runs, coverage, model } = data
  const num = (n: number) => formatNumber(n, locale)
  const last = runs[0]
  const late = !last || Date.now() - new Date(last.startedAt).getTime() > RUN_LATE_HOURS * 3600_000
  const result = (r: Jsonify<JobRun>) => {
    const v = (r.result ?? {}) as { due?: number; started?: number; busy?: number; failed?: number }
    return typeof v.due === "number" ? fill(t.runResult, { due: num(v.due), started: num(v.started ?? 0), busy: num(v.busy ?? 0), failed: num(v.failed ?? 0) }) : null
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label={t.tiles.sources} value={num(s.sources)} help={fill(t.help.sources, { websites: num(s.websites) })} />
        <Tile label={t.tiles.chunks} value={num(s.chunks)} help={t.help.chunks} />
        <Tile label={t.tiles.syncing} value={num(s.syncing + s.pending)} help={fill(t.help.syncing, { pending: num(s.pending) })} href="/admin/knowledge?status=syncing" />
        <Tile label={t.tiles.stuck} value={num(s.stuck)} help={t.help.stuck} href="/admin/knowledge?status=stuck" warn={s.stuck > 0} />
        <Tile label={t.tiles.failed} value={num(s.failed)} help={t.help.failed} href="/admin/knowledge?status=failed" warn={s.failed > 0} />
        <Tile label={t.tiles.ceiling} value={num(s.atCeiling)} help={t.help.ceiling} href="/admin/knowledge?ceiling=yes" warn={s.atCeiling > 0} />
      </div>

      {s.atCeiling > 0 && (
        <p className="m-0 rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 px-3 py-2 text-sm">{fill(t.ceilingNote, { n: num(s.atCeiling) })}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t.refresh.title}>
          {late && (
            <p className="m-0 flex items-start gap-2 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-3 py-2 text-sm text-[var(--color-danger)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {last ? fill(t.refresh.late, { hours: RUN_LATE_HOURS }) : t.refresh.none}
            </p>
          )}
          {last && (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-[var(--color-muted)]">{t.refresh.lastRun}</dt>
              <dd className="m-0">
                <When at={last.startedAt} locale={locale} /> <span className="text-xs text-[var(--color-muted)]">({formatDate(last.startedAt, locale, { dateStyle: "medium", timeStyle: "short" })})</span>
              </dd>
              <dt className="text-[var(--color-muted)]">{t.refresh.outcome}</dt>
              <dd className="m-0 flex flex-col items-start gap-1">
                <span className={cn(tag, RUN_TONE[runState(last)])}>{t.refresh.states[runState(last)]}</span>
                {result(last) && <span>{result(last)}</span>}
                {last.error && <span className="break-words text-xs text-[var(--color-danger)]">{last.error}</span>}
              </dd>
            </dl>
          )}
          {runs.length > 1 && (
            <Table head={[t.refresh.columns.started, t.refresh.columns.duration, t.refresh.columns.outcome]}>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-[var(--color-line)]">
                  <td className={td}>{formatDate(r.startedAt, locale, { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className={cn(td, "tabular-nums")}>{r.finishedAt ? fill(t.refresh.seconds, { n: num(Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000)) }) : "—"}</td>
                  <td className={td}>
                    <span className="flex flex-col items-start gap-0.5">
                      <span className={cn(tag, RUN_TONE[runState(r)])}>{t.refresh.states[runState(r)]}</span>
                      {result(r) && <span className="text-xs text-[var(--color-muted)]">{result(r)}</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </Table>
          )}
          <p className="m-0 text-xs text-[var(--color-muted)]">{t.refresh.hint}</p>
        </Section>

        <Section title={t.coverage.title}>
          {model === null ? (
            <Empty>{t.coverage.off}</Empty>
          ) : (
            <>
              <p className="m-0 text-sm">
                {t.coverage.model} <code className="text-xs">{model}</code>
              </p>
              {coverage?.length ? (
                <div className="max-h-[26rem] overflow-y-auto">
                  <Table head={[t.coverage.columns.bot, t.coverage.columns.chunks, t.coverage.columns.embedded]}>
                    {coverage.map((c) => {
                      const share = c.chunks ? c.embedded / c.chunks : 1
                      return (
                        <tr key={c.botId} className="border-t border-[var(--color-line)]">
                          <td className={cn(td, "max-w-48")}>
                            <Link href={`/admin/bots/${c.botId}`} className="block truncate font-medium">
                              {c.botName}
                            </Link>
                            <span className="block truncate text-xs text-[var(--color-muted)]">{c.organizationName}</span>
                          </td>
                          <td className={cn(td, "text-right tabular-nums")}>{num(c.chunks)}</td>
                          <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>
                            <span className={cn("font-medium", share < COVERAGE_LOW && "text-[var(--color-warning)]")}>{formatPercent(share, locale)}</span>
                            <span className="block text-xs text-[var(--color-muted)]">
                              {num(c.embedded)}
                              {c.otherModels > 0 && ` · ${fill(t.coverage.otherModels, { n: num(c.otherModels) })}`}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </Table>
                </div>
              ) : (
                <Empty>{t.coverage.empty}</Empty>
              )}
              <p className="m-0 text-xs text-[var(--color-muted)]">{t.coverage.hint}</p>
            </>
          )}
        </Section>
      </div>
    </div>
  )
}
