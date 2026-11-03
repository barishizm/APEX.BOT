import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle, CircleCheck, Info, RefreshCw } from "lucide-react"
import {
  KNOWLEDGE_REFRESH_JOB,
  BILLING_RECONCILE_JOB,
  OVERAGE_BILLING_JOB,
  RETENTION_SWEEP_JOB,
  listBillingEventIssues,
  listOverageIssues,
  maskPII,
  migrationStatus,
  readApiRuntime,
  recentEmailFailures,
  recentJobRuns,
  systemQueues,
  type JobRun,
} from "@apex/db"
import { Empty, Section, Table, tag, td } from "@/components/admin/detail-ui"
import { requirePlatformAdmin } from "@/lib/auth"
import { BILLING_ENV_KEYS, billingStatus } from "@/lib/billing"
import type { ReconcileResult } from "@/lib/billing/reconcile"
import { db } from "@/lib/db"
import { format } from "@/lib/i18n"
import { getAdminDictionary } from "@/lib/i18n/app"
import type { Locale } from "@/lib/i18n/config"
import { formatDate, formatNumber, timeAgo } from "@/lib/i18n/format"
import { requestLocale } from "@/lib/i18n/server"
import { checkSystem, type ServiceState } from "@/lib/status"
import { cn } from "@/lib/utils"
import pkg from "@/package.json"

// /admin/system: the status page's checks in full, the chat API's own report (/health/details, behind
// APEX_HEALTH_TOKEN), migrations, the background jobs' queues and runs, mail failures and what each
// app runs with. Read-only: migrations are run from a shell, never from here.

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).system.title }
}

// The daily cron; a run older than this means it didn't run
const RUN_LATE_HOURS = 26
// a run still open after this died with its function call
const RUN_DEAD_MINUTES = 10
const MIGRATE_COMMAND = "npm run db:migrate"

// What the web app reads; only whether each is set is shown
const WEB_ENV_KEYS = [
  "DATABASE_URL",
  "DATABASE_SSL",
  "DATABASE_CA_CERT",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APEX_API_URL",
  "NEXT_PUBLIC_APEX_SITE_KEY",
  "NEXT_PUBLIC_CONTACT_EMAIL",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "TOTP_ENCRYPTION_KEY",
  "CRON_SECRET",
  "APEX_HEALTH_TOKEN",
  "RESEND_API_KEY",
  "MAIL_FROM",
  "SUPPORT_INBOX_EMAIL",
  "SUPPORT_STAFF_LOCALE",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "APEX_EMBEDDINGS",
  "APEX_MIN_RETRIEVAL_SCORE",
  "APEX_CRAWL_ALLOW_PRIVATE",
  "SIGNUPS_MODE",
  "TRUST_PROXY",
  ...BILLING_ENV_KEYS,
] as const

const STATE_TONE: Record<ServiceState, string> = {
  operational: "bg-green-500/15 text-green-800 dark:text-green-300",
  degraded: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  down: "bg-red-500/15 text-red-700 dark:text-red-300",
}
const OK = "bg-green-500/15 text-green-800 dark:text-green-300"
const WARN = "bg-amber-500/15 text-amber-800 dark:text-amber-200"
const BAD = "bg-red-500/15 text-red-700 dark:text-red-300"
const MUTED = "bg-[var(--color-raised)] text-[var(--color-muted)]"

type RunState = "ok" | "failed" | "running"
const runState = (r: JobRun): RunState => (r.finishedAt ? (r.ok ? "ok" : "failed") : "running")
const runTone = (r: JobRun) => (runState(r) === "ok" ? OK : runState(r) === "failed" || Date.now() - r.startedAt.getTime() > RUN_DEAD_MINUTES * 60_000 ? BAD : MUTED)

/** A section's data, or the error that kept it from loading; one bad query doesn't take the page down. */
type Loaded<T> = { ok: true; value: T } | { ok: false; error: string }
const load = <T,>(p: Promise<T>): Promise<Loaded<T>> =>
  p.then(
    (value) => ({ ok: true as const, value }),
    (err: unknown) => ({ ok: false as const, error: maskPII(err instanceof Error ? err.message : String(err)).slice(0, 300) }),
  )

function Alert({ tone, title, children }: { tone: "bad" | "warn" | "info"; title?: string; children: React.ReactNode }) {
  const Icon = tone === "info" ? Info : AlertTriangle
  return (
    <div
      role={tone === "info" ? undefined : "alert"}
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3 text-sm",
        tone === "bad" && "border-red-500/50 bg-red-500/10",
        tone === "warn" && "border-amber-500/50 bg-amber-500/10",
        tone === "info" && "border-[var(--color-line)] bg-[var(--color-raised)] text-[var(--color-muted)]",
      )}
    >
      <Icon
        className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "bad" && "text-red-700 dark:text-red-300", tone === "warn" && "text-amber-800 dark:text-amber-200")}
        aria-hidden
      />
      <div className="flex min-w-0 flex-col gap-1.5">
        {title && <strong className="font-semibold text-[var(--color-text)]">{title}</strong>}
        {children}
      </div>
    </div>
  )
}

/** Label/value rows. */
function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="m-0 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[var(--color-muted)]">{k}</dt>
          <dd className="m-0 min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

const Badge = ({ tone, children }: { tone: string; children: React.ReactNode }) => <span className={cn(tag, tone)}>{children}</span>
const Mono = ({ children }: { children: React.ReactNode }) => <code className="break-all text-xs">{children}</code>
const ErrorText = ({ children }: { children: React.ReactNode }) => <span className="block break-words text-xs text-red-700 dark:text-red-300">{children}</span>

function EnvKeys({ keys, set, unset }: { keys: [string, boolean][]; set: string; unset: string }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {keys.map(([k, on]) => (
        <li key={k} title={on ? set : unset} className={cn(tag, "gap-1.5 font-mono font-medium", on ? OK : MUTED)}>
          <span aria-hidden>{on ? "●" : "○"}</span>
          {k}
          <span className="sr-only">: {on ? set : unset}</span>
        </li>
      ))}
    </ul>
  )
}

function duration(seconds: number, locale: Locale) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const n = (x: number) => formatNumber(x, locale)
  return d ? `${n(d)}d ${n(h)}h` : h ? `${n(h)}h ${n(m)}m` : `${n(m)}m`
}

export default async function AdminSystemPage() {
  // opens with migrations pending (it is where they are reported); each section copes with a missing table
  await requirePlatformAdmin("support", { outdatedSchema: true })
  const locale: Locale = await requestLocale()
  const t = getAdminDictionary(locale).system
  const num = (n: number) => formatNumber(n, locale)
  const ago = (d: Date | string | null | undefined) => (d ? timeAgo(d, locale) : t.api.never)
  const at = (d: Date | string) => formatDate(d, locale, { dateStyle: "short", timeStyle: "short" })

  const [system, runtime] = await Promise.all([checkSystem(), load(readApiRuntime(db()))])
  const api = system.api.state === "ok" ? system.api.data : null
  const embeddingModel = api?.runtime ? api.runtime.embeddings : runtime.ok ? (runtime.value?.embeddings ?? null) : null
  const [migrations, queues, refreshRuns, sweepRuns, mail, webhooks, overageRuns, overageIssues, reconcileRuns] = await Promise.all([
    load(migrationStatus(db())),
    load(systemQueues(db(), embeddingModel)),
    load(recentJobRuns(db(), KNOWLEDGE_REFRESH_JOB, 8)),
    load(recentJobRuns(db(), RETENTION_SWEEP_JOB, 8)),
    load(recentEmailFailures(db())),
    load(listBillingEventIssues(db())),
    load(recentJobRuns(db(), OVERAGE_BILLING_JOB, 8)),
    load(listOverageIssues(db())),
    load(recentJobRuns(db(), BILLING_RECONCILE_JOB, 8)),
  ])

  const pending = migrations.ok ? migrations.value.pending : []
  const lastRefresh = refreshRuns.ok ? refreshRuns.value[0] : undefined
  const refreshLate = refreshRuns.ok && (!lastRefresh || Date.now() - lastRefresh.startedAt.getTime() > RUN_LATE_HOURS * 3600_000)
  const refreshResult = (r: JobRun) => {
    const v = (r.result ?? {}) as { due?: number; started?: number; busy?: number; failed?: number }
    return typeof v.due === "number" ? format(t.jobs.refresh.result, { due: num(v.due), started: num(v.started ?? 0), busy: num(v.busy ?? 0), failed: num(v.failed ?? 0) }) : null
  }
  const overageResult = (r: JobRun) => {
    const v = (r.result ?? {}) as { due?: number; billed?: number; blocks?: number; failed?: number }
    return typeof v.due === "number"
      ? format(t.billing.overage.result, { due: num(v.due), billed: num(v.billed ?? 0), blocks: num(v.blocks ?? 0), failed: num(v.failed ?? 0) })
      : null
  }
  const reconcileResult = (r: JobRun) => {
    const v = (r.result ?? {}) as Partial<ReconcileResult>
    return typeof v.providerLive === "number"
      ? format(t.billing.reconcile.result, { live: num(v.providerLive), stored: num(v.storedLive ?? 0), fixed: num(v.fixed ?? 0), unresolved: num(v.unresolved ?? 0) })
      : null
  }
  const lastReconcile = reconcileRuns.ok ? reconcileRuns.value.find((r) => r.finishedAt) : undefined
  const drifts = ((lastReconcile?.result ?? {}) as Partial<ReconcileResult>).drifts ?? []
  const sweepResult = (r: JobRun) => {
    const v = (r.result ?? {}) as { deleted?: number }
    return typeof v.deleted === "number" ? format(t.jobs.retention.deleted, { n: num(v.deleted) }) : null
  }

  const RunsTable = ({ runs, result }: { runs: JobRun[]; result: (r: JobRun) => string | null }) => (
    <Table head={[t.jobs.runs.started, t.jobs.runs.duration, t.jobs.runs.outcome]}>
      {runs.map((r) => (
        <tr key={r.id} className="border-t border-[var(--color-line)]">
          <td className={cn(td, "whitespace-nowrap")}>{at(r.startedAt)}</td>
          <td className={cn(td, "whitespace-nowrap tabular-nums")}>
            {r.finishedAt ? format(t.jobs.runs.seconds, { n: num(Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000)) }) : "—"}
          </td>
          <td className={td}>
            <span className="flex flex-col items-start gap-0.5">
              <Badge tone={runTone(r)}>{t.jobs.runs.states[runState(r)]}</Badge>
              {result(r) && <span className="text-xs text-[var(--color-muted)]">{result(r)}</span>}
              {r.error && <ErrorText>{r.error}</ErrorText>}
            </span>
          </td>
        </tr>
      ))}
    </Table>
  )

  const billing = billingStatus()
  const webCommit = process.env.VERCEL_GIT_COMMIT_SHA ?? null
  const apiRuntime = api?.runtime
  const reported = runtime.ok ? runtime.value : null

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="mt-1 max-w-3xl text-[var(--color-muted)]">{t.lede}</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-[var(--color-muted)]">
          <span>{format(t.checkedAt, { when: at(system.checkedAt) })}</span>
          <Link
            href="/admin/system"
            prefetch={false}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] px-3 py-1.5 font-medium text-[var(--color-text)] no-underline hover:border-[var(--color-muted)]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t.refresh}
          </Link>
        </div>
      </header>

      {pending.length > 0 && (
        <Alert tone="bad" title={format(t.migrations.pendingTitle, { n: num(pending.length) })}>
          <p className="m-0">{t.migrations.pendingHelp}</p>
          <pre className="m-0 select-all overflow-x-auto rounded-lg bg-[var(--color-raised)] px-3 py-2 font-mono text-xs text-[var(--color-text)]">{MIGRATE_COMMAND}</pre>
          <ul className="m-0 flex flex-wrap gap-1.5 p-0">
            {pending.map((name) => (
              <li key={name} className={cn(tag, BAD, "font-mono font-medium")}>
                {name}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t.services.title}>
          <p className="m-0 -mt-2 text-sm text-[var(--color-muted)]">{t.services.description}</p>
          <Table head={[t.services.columns.service, t.services.columns.state, t.services.columns.latency]}>
            {system.checks.map((c) => (
              <tr key={c.id} className="border-t border-[var(--color-line)]">
                <td className={td}>
                  <span className="font-medium">{t.services.names[c.id]}</span>
                  {c.id === "dashboard" && <span className="block text-xs text-[var(--color-muted)]">{t.services.servedThis}</span>}
                  {c.detail && <span className="block text-xs text-[var(--color-muted)]">{t.services.details[c.detail]}</span>}
                  {c.error && <ErrorText>{c.error}</ErrorText>}
                </td>
                <td className={td}>
                  <Badge tone={STATE_TONE[c.state]}>{t.states[c.state]}</Badge>
                </td>
                <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>
                  {c.latencyMs === null ? "—" : `${num(c.latencyMs)} ms`}
                  {c.latencyMs !== null && c.latencyMs > 1500 && <span className="block text-xs text-amber-800 dark:text-amber-200">{t.services.slow}</span>}
                </td>
              </tr>
            ))}
          </Table>
        </Section>

        <Section title={t.api.title}>
          {system.api.state === "unconfigured" && <Alert tone="info">{t.api.unconfigured}</Alert>}
          {system.api.state === "rejected" && <Alert tone="warn">{t.api.rejected}</Alert>}
          {system.api.state === "unreachable" && <Alert tone="bad">{format(t.api.unreachable, { error: system.api.error })}</Alert>}
          {api && (
            <Facts
              rows={[
                ...(typeof api.uptimeSeconds === "number" ? [[t.api.uptime, duration(api.uptimeSeconds, locale)] as [string, React.ReactNode]] : []),
                [
                  t.api.botSync,
                  <span key="s" className="flex flex-wrap items-center gap-2">
                    <Badge tone={api.botSync === "ok" ? OK : api.botSync === "failing" ? BAD : api.botSync === "starting" ? WARN : MUTED}>
                      {t.api.syncStates[api.botSync ?? "off"]}
                    </Badge>
                    {api.sync && <span className="text-xs text-[var(--color-muted)]">{format(t.api.interval, { seconds: num(Math.round(api.sync.intervalMs / 1000)) })}</span>}
                  </span>,
                ],
                ...(api.sync
                  ? ([
                      [t.api.lastSync, api.sync.lastOkAt ? <span title={at(api.sync.lastOkAt)}>{ago(api.sync.lastOkAt)}</span> : t.api.never],
                      [t.api.lastAttempt, api.sync.lastAttemptAt ? <span title={at(api.sync.lastAttemptAt)}>{ago(api.sync.lastAttemptAt)}</span> : t.api.never],
                      [t.api.bots, num(api.sync.bots)],
                      ...(api.sync.lastError ? [[t.api.lastError, <ErrorText key="e">{api.sync.lastError}</ErrorText>]] : []),
                    ] as [string, React.ReactNode][])
                  : []),
                [
                  t.api.semanticSearch,
                  <Badge key="q" tone={api.semanticSearch === "ok" ? OK : api.semanticSearch === "paused" ? WARN : MUTED}>
                    {t.api.searchStates[api.semanticSearch ?? "off"]}
                  </Badge>,
                ],
              ]}
            />
          )}
        </Section>
      </div>

      <Section title={t.billing.title}>
        {billing.enabled ? (
          <>
            <p className="m-0 flex items-center gap-2 text-sm">
              <CircleCheck className="h-4 w-4 text-green-800 dark:text-green-300" aria-hidden />
              {format(t.billing.on, { environment: billing.environment })}
            </p>
            {!billing.overage && <Alert tone="info">{t.billing.noOverage}</Alert>}
          </>
        ) : (
          <Alert tone="info" title={t.billing.off}>
            <p className="m-0">{t.billing.offHelp}</p>
            <Facts
              rows={[
                ...(billing.missing.length ? [[t.billing.missing, <Mono key="m">{billing.missing.join(", ")}</Mono>] as [string, React.ReactNode]] : []),
                ...billing.invalid.map(
                  (i) =>
                    [
                      t.billing.invalid,
                      <span key={i.key} className="text-[var(--color-text)]">
                        <Mono>{i.key}</Mono> {i.reason}
                      </span>,
                    ] as [string, React.ReactNode],
                ),
              ]}
            />
          </Alert>
        )}
        <h3 className="m-0 text-sm font-semibold">{t.billing.webhooks.title}</h3>
        {!webhooks.ok ? (
          <Alert tone="bad">{format(t.billing.webhooks.unavailable, { error: webhooks.error })}</Alert>
        ) : webhooks.value.total === 0 ? (
          <Empty>{t.billing.webhooks.none}</Empty>
        ) : (
          <>
            <Alert tone="warn">{format(t.billing.webhooks.count, { n: num(webhooks.value.total) })}</Alert>
            <Table head={[t.billing.webhooks.columns.event, t.billing.webhooks.columns.received, t.billing.webhooks.columns.attempts, t.billing.webhooks.columns.error]}>
              {webhooks.value.events.map((e) => (
                <tr key={e.id} className="border-t border-[var(--color-line)]">
                  <td className={td}>
                    <span className="block font-medium">{e.eventType}</span>
                    <Mono>{e.eventId}</Mono>
                  </td>
                  <td className={cn(td, "whitespace-nowrap")} title={at(e.receivedAt)}>
                    {ago(e.receivedAt)}
                  </td>
                  <td className={cn(td, "tabular-nums")}>{num(e.attempts)}</td>
                  <td className={td}>{e.error ? <ErrorText>{maskPII(e.error)}</ErrorText> : <Badge tone={MUTED}>{t.billing.webhooks.waiting}</Badge>}</td>
                </tr>
              ))}
            </Table>
          </>
        )}
        <h3 className="m-0 text-sm font-semibold">{t.billing.overage.title}</h3>
        {!overageIssues.ok ? (
          <Alert tone="bad">{format(t.jobs.unavailable, { error: overageIssues.error })}</Alert>
        ) : (
          overageIssues.value.total > 0 && (
            <>
              <Alert tone="bad">{format(t.billing.overage.failing, { n: num(overageIssues.value.total) })}</Alert>
              <Table head={[t.billing.overage.columns.workspace, t.billing.overage.columns.window, t.billing.overage.columns.replies, t.billing.overage.columns.attempts, t.billing.overage.columns.error]}>
                {overageIssues.value.windows.map((w) => (
                  <tr key={`${w.organizationId}:${w.periodStart.toISOString()}`} className="border-t border-[var(--color-line)]">
                    <td className={td}>
                      <Link href={`/admin/workspaces/${w.organizationId}`} className="block font-medium">
                        {w.organizationName}
                      </Link>
                      <Mono>{w.organizationId}</Mono>
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>{at(w.periodStart)}</td>
                    <td className={cn(td, "tabular-nums")}>{num(w.overageFifths / 5)}</td>
                    <td className={cn(td, "tabular-nums")}>{num(w.attempts)}</td>
                    <td className={td}>
                      <ErrorText>{maskPII(w.error)}</ErrorText>
                    </td>
                  </tr>
                ))}
              </Table>
            </>
          )
        )}
        {!overageRuns.ok ? (
          <Alert tone="bad">{format(t.jobs.unavailable, { error: overageRuns.error })}</Alert>
        ) : overageRuns.value.length ? (
          <RunsTable runs={overageRuns.value} result={overageResult} />
        ) : (
          <Empty>{t.billing.overage.none}</Empty>
        )}
        <h3 className="m-0 text-sm font-semibold">{t.billing.reconcile.title}</h3>
        <p className="m-0 -mt-2 text-sm text-[var(--color-muted)]">{t.billing.reconcile.description}</p>
        {drifts.length > 0 && lastReconcile && (
          <>
            <Alert tone={drifts.some((d) => d.outcome !== "fixed") ? "bad" : "info"}>{format(t.billing.reconcile.found, { n: num(drifts.length), when: at(lastReconcile.startedAt) })}</Alert>
            <Table head={[t.billing.reconcile.columns.workspace, t.billing.reconcile.columns.subscription, t.billing.reconcile.columns.fields, t.billing.reconcile.columns.outcome]}>
              {drifts.map((d) => (
                <tr key={`${d.subscriptionId}:${d.organizationId}`} className="border-t border-[var(--color-line)]">
                  <td className={td}>{d.organizationId ? <Link href={`/admin/workspaces/${d.organizationId}`}><Mono>{d.organizationId}</Mono></Link> : "—"}</td>
                  <td className={td}>
                    <Mono>{d.subscriptionId}</Mono>
                    {d.change && <span className="block text-xs text-[var(--color-muted)]">{d.change}</span>}
                  </td>
                  <td className={td}>{d.fields.join(", ") || "—"}</td>
                  <td className={td}>
                    <span className="flex flex-col items-start gap-0.5">
                      <Badge tone={d.outcome === "fixed" ? OK : d.outcome === "stale" ? MUTED : BAD}>{t.billing.reconcile.outcomes[d.outcome]}</Badge>
                      {d.detail && <ErrorText>{maskPII(d.detail)}</ErrorText>}
                    </span>
                  </td>
                </tr>
              ))}
            </Table>
          </>
        )}
        {!reconcileRuns.ok ? (
          <Alert tone="bad">{format(t.jobs.unavailable, { error: reconcileRuns.error })}</Alert>
        ) : reconcileRuns.value.length ? (
          <RunsTable runs={reconcileRuns.value} result={reconcileResult} />
        ) : (
          <Empty>{t.billing.reconcile.none}</Empty>
        )}
      </Section>

      <Section title={t.migrations.title}>
        {!migrations.ok ? (
          <Alert tone="bad">{format(t.migrations.unavailable, { error: migrations.error })}</Alert>
        ) : (
          <>
            {pending.length === 0 && (
              <p className="m-0 flex items-center gap-2 text-sm">
                <CircleCheck className="h-4 w-4 text-green-800 dark:text-green-300" aria-hidden />
                {format(t.migrations.upToDate, { n: num(migrations.value.applied.length) })}
              </p>
            )}
            {migrations.value.unknown.length > 0 && (
              <Alert tone="warn" title={t.migrations.unknownTitle}>
                <p className="m-0">{t.migrations.unknownHelp}</p>
                <p className="m-0 font-mono text-xs">{migrations.value.unknown.map((u) => u.name).join(", ")}</p>
              </Alert>
            )}
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium">{format(t.migrations.applied, { n: num(migrations.value.applied.length) })}</summary>
              <div className="mt-3 max-h-[26rem] overflow-y-auto">
                <Table head={[t.migrations.columns.name, t.migrations.columns.appliedAt]}>
                  {[...migrations.value.applied].reverse().map((m) => (
                    <tr key={m.name} className="border-t border-[var(--color-line)]">
                      <td className={td}>
                        <Mono>{m.name}</Mono>
                      </td>
                      <td className={cn(td, "whitespace-nowrap")}>{at(m.appliedAt)}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            </details>
          </>
        )}
      </Section>

      <h2 className="m-0 -mb-2 text-lg font-semibold">{t.jobs.title}</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t.jobs.refresh.title}>
          {!refreshRuns.ok ? (
            <Alert tone="bad">{format(t.jobs.unavailable, { error: refreshRuns.error })}</Alert>
          ) : (
            <>
              {refreshLate && <Alert tone="bad">{lastRefresh ? format(t.jobs.refresh.late, { hours: RUN_LATE_HOURS }) : t.jobs.refresh.none}</Alert>}
              {refreshRuns.value.length > 0 && <RunsTable runs={refreshRuns.value} result={refreshResult} />}
            </>
          )}
        </Section>

        <Section title={t.jobs.retention.title}>
          {queues.ok && (
            <Facts
              rows={[
                [
                  t.jobs.retention.overdue,
                  <span key="o" className="flex flex-col gap-0.5">
                    <span className="font-semibold tabular-nums">{num(queues.value.overdueConversations)}</span>
                    <span className="text-xs text-[var(--color-muted)]">{t.jobs.retention.overdueHelp}</span>
                  </span>,
                ],
              ]}
            />
          )}
          {!queues.ok && <Alert tone="bad">{format(t.jobs.unavailable, { error: queues.error })}</Alert>}
          {!sweepRuns.ok ? (
            <Alert tone="bad">{format(t.jobs.unavailable, { error: sweepRuns.error })}</Alert>
          ) : sweepRuns.value.length ? (
            <RunsTable runs={sweepRuns.value} result={sweepResult} />
          ) : (
            <Empty>{t.jobs.retention.none}</Empty>
          )}
        </Section>

        <Section title={t.jobs.topics.title}>
          {!queues.ok ? (
            <Alert tone="bad">{format(t.jobs.unavailable, { error: queues.error })}</Alert>
          ) : (
            <Facts
              rows={[
                [
                  t.jobs.topics.queue,
                  <span key="q" className="flex flex-col gap-0.5">
                    <span className="font-semibold tabular-nums">{num(queues.value.unlabeledTopics)}</span>
                    <span className="text-xs text-[var(--color-muted)]">{t.jobs.topics.queueHelp}</span>
                  </span>,
                ],
                ...(queues.value.oldestUnlabeledAt ? [[t.jobs.topics.oldest, ago(queues.value.oldestUnlabeledAt)] as [string, React.ReactNode]] : []),
                ...(api?.topics
                  ? ([
                      [t.jobs.topics.lastRun, api.topics.lastRunAt ? <span title={at(api.topics.lastRunAt)}>{ago(api.topics.lastRunAt)}</span> : t.api.never],
                      ...(api.topics.lastOkAt ? [["", format(t.jobs.topics.lastSaved, { n: num(api.topics.lastSaved) })]] : []),
                    ] as [string, React.ReactNode][])
                  : []),
              ]}
            />
          )}
          {api?.topics?.failing && <Alert tone="warn">{t.jobs.topics.failing}</Alert>}
          {api && api.topics === null && <Alert tone="info">{t.jobs.topics.off}</Alert>}
        </Section>

        <Section title={t.jobs.embeddings.title}>
          {!queues.ok ? (
            <Alert tone="bad">{format(t.jobs.unavailable, { error: queues.error })}</Alert>
          ) : !queues.value.embeddings ? (
            <Alert tone="info">{t.jobs.embeddings.off}</Alert>
          ) : (
            <>
              <p className="m-0 text-sm">
                <Mono>{queues.value.embeddings.model}</Mono>
              </p>
              <Facts
                rows={[
                  [
                    t.jobs.embeddings.missing,
                    <span key="m" className="flex flex-col gap-0.5">
                      <span className="font-semibold tabular-nums">{num(queues.value.embeddings.chunks - queues.value.embeddings.embedded)}</span>
                      <span className="text-xs text-[var(--color-muted)]">
                        {format(t.jobs.embeddings.coverage, {
                          embedded: num(queues.value.embeddings.embedded),
                          chunks: num(queues.value.embeddings.chunks),
                          bots: num(queues.value.embeddings.bots),
                        })}
                      </span>
                    </span>,
                  ],
                  ...(api?.indexer
                    ? ([
                        [t.jobs.embeddings.pending, <span key="p" className="tabular-nums">{num(api.indexer.pending)}</span>],
                        ...(api.indexer.active ? [[t.jobs.embeddings.active, <Mono key="a">{api.indexer.active}</Mono>]] : []),
                        ...(api.indexer.lastError
                          ? [
                              [
                                t.jobs.embeddings.lastError,
                                <span key="e" className="flex flex-col gap-0.5">
                                  <span className="text-xs text-[var(--color-muted)]">
                                    {ago(api.indexer.lastError.at)} · <Mono>{api.indexer.lastError.tenant}</Mono>
                                  </span>
                                  <ErrorText>{api.indexer.lastError.error}</ErrorText>
                                </span>,
                              ],
                            ]
                          : []),
                      ] as [string, React.ReactNode][])
                    : []),
                ]}
              />
            </>
          )}
        </Section>
      </div>

      <Section title={t.email.title}>
        <p className="m-0 -mt-2 text-sm text-[var(--color-muted)]">{t.email.description}</p>
        {!mail.ok ? (
          <Alert tone="bad">{format(t.email.unavailable, { error: mail.error })}</Alert>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              {(
                [
                  [t.email.last24h, mail.value.last24h],
                  [t.email.last7d, mail.value.last7d],
                ] as const
              ).map(([label, n]) => (
                <div key={label} className="flex min-w-36 flex-col gap-0.5 rounded-xl border border-[var(--color-line)] px-4 py-3">
                  <span className="text-xs font-medium text-[var(--color-muted)]">{label}</span>
                  <span className={cn("text-xl font-semibold tabular-nums", n > 0 && "text-red-700 dark:text-red-300")}>{num(n)}</span>
                </div>
              ))}
            </div>
            {mail.value.recent.length ? (
              <Table head={[t.email.columns.when, t.email.columns.kind, t.email.columns.recipient, t.email.columns.error]}>
                {mail.value.recent.map((f) => (
                  <tr key={f.id} className="border-t border-[var(--color-line)]">
                    <td className={cn(td, "whitespace-nowrap")}>
                      <span title={at(f.createdAt)}>{ago(f.createdAt)}</span>
                      <span className="block text-xs text-[var(--color-muted)]">{t.email.sources[f.source]}</span>
                    </td>
                    <td className={td}>
                      <Mono>{f.kind}</Mono>
                    </td>
                    <td className={td}>
                      <Mono>{f.recipient}</Mono>
                    </td>
                    <td className={cn(td, "min-w-48")}>
                      <Badge tone={BAD}>{f.status ?? t.email.unreachable}</Badge>
                      {f.error && <span className="mt-1 block break-words text-xs text-[var(--color-muted)]">{f.error}</span>}
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <p className="m-0 flex items-center gap-2 text-sm text-[var(--color-muted)]">
                <CircleCheck className="h-4 w-4 text-green-800 dark:text-green-300" aria-hidden />
                {t.email.none}
              </p>
            )}
          </>
        )}
      </Section>

      <Section title={t.env.title}>
        <p className="m-0 -mt-2 text-sm text-[var(--color-muted)]">{t.env.description}</p>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <h3 className="m-0 text-sm font-semibold">{t.env.web}</h3>
            <Facts
              rows={[
                [t.env.nodeEnv, <Mono key="n">{process.env.NODE_ENV ?? t.env.none}</Mono>],
                [t.env.deployEnv, <Mono key="d">{process.env.VERCEL_ENV ?? t.env.none}</Mono>],
                [t.env.version, <Mono key="v">{pkg.version ?? t.env.none}</Mono>],
                [t.env.commit, <Mono key="c">{webCommit ? webCommit.slice(0, 12) : t.env.none}</Mono>],
              ]}
            />
            <EnvKeys keys={WEB_ENV_KEYS.map((k) => [k, !!process.env[k]])} set={t.env.set} unset={t.env.unset} />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <h3 className="m-0 text-sm font-semibold">{t.env.api}</h3>
            {apiRuntime ? (
              <>
                <Facts
                  rows={[
                    [t.env.nodeEnv, <Mono key="n">{apiRuntime.nodeEnv ?? t.env.none}</Mono>],
                    [t.env.version, <Mono key="v">{apiRuntime.version ?? t.env.none}</Mono>],
                    [t.env.commit, <Mono key="c">{apiRuntime.commit ? apiRuntime.commit.slice(0, 12) : t.env.none}</Mono>],
                    [t.env.model, <Mono key="m">{apiRuntime.model}</Mono>],
                    [t.env.embeddings, <Mono key="e">{apiRuntime.embeddings ?? t.env.none}</Mono>],
                    [t.env.topicModel, <Mono key="t">{apiRuntime.topicModel ?? t.env.none}</Mono>],
                  ]}
                />
                <EnvKeys keys={Object.entries(apiRuntime.env)} set={t.env.set} unset={t.env.unset} />
              </>
            ) : reported ? (
              <>
                <Facts
                  rows={[
                    [t.env.model, <Mono key="m">{reported.defaultModel || t.env.none}</Mono>],
                    [t.env.embeddings, <Mono key="e">{reported.embeddings ?? t.env.none}</Mono>],
                    [t.env.topicModel, <Mono key="t">{reported.topicModel ?? t.env.none}</Mono>],
                  ]}
                />
                <EnvKeys keys={Object.entries(reported.keys)} set={t.env.set} unset={t.env.unset} />
                <p className="m-0 text-xs text-[var(--color-muted)]">{format(t.env.apiFallback, { when: reported.reportedAt ? ago(reported.reportedAt) : t.api.never })}</p>
              </>
            ) : (
              <Empty>{t.env.apiUnknown}</Empty>
            )}
          </div>
        </div>
      </Section>
    </div>
  )
}
