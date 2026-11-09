import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle, ChevronRight, CircleCheck, Database, KeyRound, LifeBuoy, RefreshCw, Wallet } from "lucide-react"
import { OVERVIEW_RANGES, platformOverview, type AttentionGroup } from "@apex/db"
import { OverviewCharts } from "@/components/admin/overview-charts"
import { requirePlatformAdmin } from "@/lib/auth"
import { db } from "@/lib/db"
import { format } from "@/lib/i18n"
import { getAdminDictionary, getAppDictionary } from "@/lib/i18n/app"
import type { Locale } from "@/lib/i18n/config"
import { formatNumber, formatPercent, plural, timeAgo } from "@/lib/i18n/format"
import { requestLocale } from "@/lib/i18n/server"
import { cn } from "@/lib/utils"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).overview.title }
}

const box = "flex min-w-0 flex-col gap-1 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4"

/** A KPI tile; with an href it opens the section behind the number. */
function Kpi({ label, value, help, href, tone }: { label: string; value: string; help: string; href?: string; tone?: "warn" }) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-2 text-xs font-medium text-[var(--color-muted)]">
        {label}
        {href && <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-text)]" aria-hidden />}
      </span>
      <span className="flex items-center gap-1.5 text-2xl font-semibold tracking-tight tabular-nums">
        {tone === "warn" && <AlertTriangle className="h-4 w-4 text-[var(--color-warning)]" aria-hidden />}
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

function KpiGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">{title}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
    </section>
  )
}

interface AttentionRow {
  key: string
  href: string
  title: string
  detail: string
  meta?: string
}

function AttentionList({ icon: Icon, title, total, rows, more }: { icon: React.ComponentType<{ className?: string }>; title: string; total: number; rows: AttentionRow[]; more: string }) {
  if (!total) return null
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-[var(--color-warning)]" aria-hidden />
        {title}
        <span className="rounded-full bg-[var(--color-bubble)] px-2 py-px text-xs font-semibold tabular-nums">{total}</span>
      </h3>
      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map((r) => (
          <li key={r.key} className="border-t border-[var(--color-line)] first:border-t-0">
            <Link href={r.href} className="group flex items-center gap-3 rounded-lg px-2 py-2 text-[var(--color-text)] no-underline hover:bg-[var(--color-raised)]">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{r.title}</span>
                <span className="truncate text-xs text-[var(--color-muted)]">{r.detail}</span>
              </span>
              {r.meta && <span className="shrink-0 text-xs text-[var(--color-muted)] tabular-nums">{r.meta}</span>}
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-muted)] group-hover:text-[var(--color-text)]" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {rows.length < total && <p className="m-0 text-xs text-[var(--color-muted)]">{format(more, { shown: String(rows.length), total: String(total) })}</p>}
    </section>
  )
}

const rowsOf = <T,>(g: AttentionGroup<T>, map: (r: T) => AttentionRow) => ({ total: g.total, rows: g.rows.map(map) })

export default async function AdminOverviewPage({ searchParams }: PageProps<"/admin">) {
  const { user } = await requirePlatformAdmin()
  const locale: Locale = await requestLocale()
  const t = getAdminDictionary(locale)
  const o = t.overview
  const role = getAppDictionary(locale).shell.profile[user.platformRole]
  const data = await platformOverview(db(), (await searchParams).days)
  const { totals: k, attention: a } = data

  const num = (n: number) => formatNumber(n, locale)
  const pct = (n: number, of: number) => (of > 0 ? formatPercent(n / of, locale) : "–")
  const ago = (d: Date) => timeAgo(d, locale)
  const q = (path: string, value: string) => `${path}?${new URLSearchParams({ q: value })}`

  const failedSyncs = rowsOf(a.failedSyncs, (s) => ({
    key: s.id,
    href: `/admin/knowledge/${s.id}`,
    title: `${s.title} · ${s.botName}`,
    detail: s.error ?? o.attention.noError,
    meta: format(o.attention.failedAgo, { when: ago(s.failedAt) }),
  }))
  const budgetBots = rowsOf(a.budgetBots, (b) => ({
    key: b.id,
    href: q("/admin/bots", b.id),
    title: `${b.name} · ${b.organizationName}`,
    detail: format(o.attention.budget, { used: num(b.tokens), budget: num(b.budget), share: pct(b.tokens, b.budget) }),
  }))
  const loginFailures = rowsOf(a.loginFailures, (f) => ({
    key: `${f.kind}:${f.key}`,
    href: f.userId ? `/admin/users/${f.userId}` : q("/admin/security", f.key),
    title: f.key,
    detail: `${f.kind === "ip" ? o.attention.ip : o.attention.email}${f.kind === "email" && !f.userId ? ` · ${o.attention.noAccount}` : ""} · ${plural(f.failures, o.attention.failures, locale)}`,
    meta: ago(f.lastAt),
  }))
  const migrations = {
    total: a.missingMigrations.length,
    rows: a.missingMigrations.map((name) => ({ key: name, href: "/admin/system", title: name, detail: o.attention.migrationHelp })),
  }
  const overdueTickets = rowsOf(a.overdueTickets, (tk) => ({
    key: tk.id,
    href: `/admin/support/${tk.id}`,
    title: tk.subject,
    detail: tk.organizationName ?? o.attention.noWorkspace,
    meta: format(o.attention.dueAgo, { when: ago(tk.slaDueAt) }),
  }))
  const needsAttention = failedSyncs.total + budgetBots.total + loginFailures.total + migrations.total + overdueTickets.total > 0
  const maxPlan = Math.max(1, ...data.plans.map((p) => p.workspaces))

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8 max-sm:px-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{o.title}</h1>
          <p className="mt-1 max-w-2xl text-[var(--color-muted)]">{o.lede}</p>
          <p className="mt-3 inline-flex rounded-full border border-[var(--color-line)] px-2.5 py-0.5 text-xs font-medium text-[var(--color-muted)]">
            {o.signedInAs.replace("{role}", role)}
          </p>
        </div>
        <nav aria-label={o.rangeLabel} className="flex flex-col items-end gap-1">
          <div className="flex rounded-lg border border-[var(--color-line)] p-0.5">
            {OVERVIEW_RANGES.map((d) => (
              <Link
                key={d}
                href={d === 30 ? "/admin" : `/admin?days=${d}`}
                aria-current={d === data.days ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1 text-sm no-underline transition-colors",
                  d === data.days ? "bg-[var(--color-raised)] font-semibold text-[var(--color-text)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]",
                )}
              >
                {o.ranges[d]}
              </Link>
            ))}
          </div>
          <span className="text-xs text-[var(--color-muted)]">{o.utcNote}</span>
        </nav>
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="attention-title">
        <h2 id="attention-title" className="text-lg font-semibold">
          {o.attention.title}
        </h2>
        {needsAttention ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <AttentionList icon={Database} title={o.attention.migrations} {...migrations} more={o.attention.more} />
            <AttentionList icon={RefreshCw} title={o.attention.failedSyncs} {...failedSyncs} more={o.attention.more} />
            <AttentionList icon={Wallet} title={o.attention.budgetBots} {...budgetBots} more={o.attention.more} />
            <AttentionList icon={KeyRound} title={o.attention.loginFailures} {...loginFailures} more={o.attention.more} />
            <AttentionList icon={LifeBuoy} title={o.attention.overdueTickets} {...overdueTickets} more={o.attention.more} />
          </div>
        ) : (
          <p className="m-0 flex items-center gap-2 rounded-2xl border border-[var(--color-line)] px-4 py-3 text-sm text-[var(--color-muted)]">
            <CircleCheck className="h-4 w-4 text-[var(--color-success)]" aria-hidden />
            {o.attention.allClear}
          </p>
        )}
      </section>

      <KpiGroup title={o.groups.users}>
        <Kpi label={o.kpi.users} value={num(k.users)} help={o.help.users} href="/admin/users" />
        <Kpi label={o.kpi.newUsers} value={num(k.newUsers)} help={o.help.newUsers} href="/admin/users?sort=created&dir=desc" />
        <Kpi label={o.kpi.unverifiedUsers} value={num(k.unverifiedUsers)} help={o.help.unverifiedUsers} href="/admin/users?status=unverified" />
        <Kpi label={o.kpi.waitlist} value={num(k.waitlist)} help={o.help.waitlist} href="/admin/waitlist" />
      </KpiGroup>

      <KpiGroup title={o.groups.workspaces}>
        <Kpi label={o.kpi.workspaces} value={num(k.workspaces)} help={o.help.workspaces} href="/admin/workspaces" />
        <Kpi label={o.kpi.activeWorkspaces} value={num(k.activeWorkspaces)} help={o.help.activeWorkspaces} href="/admin/workspaces" />
        <Kpi label={o.kpi.bots} value={num(k.bots)} help={o.help.bots} href="/admin/bots" />
        <Kpi label={o.kpi.botsSeen7d} value={num(k.botsSeen7d)} help={format(o.help.botsSeen7d, { share: pct(k.botsSeen7d, k.bots) })} href="/admin/bots" />
      </KpiGroup>

      <KpiGroup title={o.groups.traffic}>
        <Kpi label={o.kpi.conversations} value={num(k.conversations)} help={o.help.conversations} href="/admin/conversations" />
        <Kpi label={o.kpi.messages} value={num(k.messages)} help={o.help.messages} href="/admin/conversations" />
        <Kpi label={o.kpi.unansweredRate} value={pct(k.unanswered, k.answers)} help={format(o.help.unansweredRate, { n: num(k.unanswered), total: num(k.answers) })} />
        <Kpi label={o.kpi.negativeFeedback} value={num(k.negativeFeedback)} help={o.help.negativeFeedback} />
      </KpiGroup>

      <KpiGroup title={o.groups.operations}>
        <Kpi label={o.kpi.tokens} value={num(k.tokens)} help={o.help.tokens} href="/admin/usage" />
        <Kpi label={o.kpi.failedSources} value={num(k.failedSources)} help={o.help.failedSources} href="/admin/knowledge?status=failed" tone={k.failedSources ? "warn" : undefined} />
        <Kpi label={o.kpi.openTickets} value={num(k.openTickets)} help={o.help.openTickets} href="/admin/support" />
      </KpiGroup>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <section className="flex min-w-0 flex-col gap-3" aria-labelledby="daily-title">
          <h2 id="daily-title" className="text-lg font-semibold">
            {o.charts.title}
          </h2>
          <OverviewCharts daily={data.daily} />
        </section>
        <section className="flex flex-col gap-3" aria-labelledby="plans-title">
          <div>
            <h2 id="plans-title" className="text-lg font-semibold">
              {o.plans.title}
            </h2>
            <p className="m-0 text-sm text-[var(--color-muted)]">{o.plans.description}</p>
          </div>
          <ul className={cn(box, "m-0 list-none gap-3")}>
            {data.plans.map((p) => (
              <li key={p.plan} className="flex flex-col gap-1.5">
                <span className="flex justify-between text-sm">
                  <span>{o.plans.names[p.plan]}</span>
                  <span className="font-medium tabular-nums">
                    {num(p.workspaces)} <span className="text-[var(--color-muted)]">· {pct(p.workspaces, k.workspaces)}</span>
                  </span>
                </span>
                <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bubble)]" aria-hidden>
                  <span className="block h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${p.workspaces ? Math.max(2, Math.round((p.workspaces / maxPlan) * 100)) : 0}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
