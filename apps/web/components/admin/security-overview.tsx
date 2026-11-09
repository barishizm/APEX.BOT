"use client"

import type { AuthBlock, SecurityOverview, StaffAccount } from "@apex/db"
import { Ban, LogOut, RotateCcw, ShieldCheck, ShieldOff } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartEmptyOverlay } from "@/components/analytics/charts"
import { useAppI18n } from "@/components/i18n/app-provider"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { LOCALE_META, type Locale } from "@/lib/i18n/config"
import { formatDate, formatNumber } from "@/lib/i18n/format"
import { cn } from "@/lib/utils"
import { button, ConfirmDialog, dangerButton, Empty, field, fill, postJson, Section, Table, tag, td, When, type Jsonify } from "./detail-ui"

// /admin/security above the feed: 24-hour counts and panels, the active blocks, and the staff
// accounts. Every action goes through ConfirmDialog (a reason, a step-up for blocking) and the
// audit log; ending sessions reuses the user action (/api/admin/users/<id>/revoke-sessions).

export type SecurityOverviewJson = Jsonify<SecurityOverview>
export type StaffAccountJson = Jsonify<StaffAccount>
type BlockJson = Jsonify<AuthBlock>

type Subject = { kind: "ip" | "email"; value: string }
type Dialog =
  | { type: "block"; subject?: Subject }
  | { type: "unblock"; block: BlockJson }
  | { type: "reset"; subject: Subject }
  | { type: "end"; userId: string; email: string }

const small = "h-7 gap-1 px-2 text-xs"
const num = "whitespace-nowrap text-right tabular-nums"
const box = "flex min-w-0 flex-col gap-1 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4"
const link = "font-medium text-[var(--color-text)] no-underline hover:underline"
const TONE = {
  locked: "bg-[var(--color-warning)]/15 text-[var(--color-warning)]",
  blocked: "bg-[var(--color-danger)]/15 text-[var(--color-danger)]",
  staff: "bg-[var(--color-bubble)] text-[var(--color-text)]",
  muted: "bg-[var(--color-raised)] text-[var(--color-muted)]",
  ok: "bg-[var(--color-success)]/15 text-[var(--color-success)]",
} as const

const feedHref = (key: "ip" | "email", value: string) => `/admin/security?${new URLSearchParams({ [key]: value })}#events`

function useCountryName(locale: Locale) {
  return useMemo(() => {
    let names: Intl.DisplayNames | null = null
    try {
      names = new Intl.DisplayNames([LOCALE_META[locale].intl], { type: "region" })
    } catch {}
    return (code: string | null) => (code ? `${names?.of(code) ?? code} (${code})` : null)
  }, [locale])
}

export function SecurityOverviewPanels({
  data,
  staff,
  utcHours,
  limits,
}: {
  data: SecurityOverviewJson
  staff: StaffAccountJson[]
  /** "14:00" for each hour of data.hourly, formatted on the server */
  utcHours: string[]
  limits: { resetBurst: number; lookbackDays: number }
}) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.security
  const router = useRouter()
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const country = useCountryName(locale)
  const n = (v: number) => formatNumber(v, locale)

  function done(message: string) {
    setDialog(null)
    setNotice(message)
    router.refresh()
  }

  const more = (shown: number, total: number) =>
    total > shown && <p className="m-0 text-xs text-[var(--color-muted)]">{fill(t.panels.more, { shown: n(shown), total: n(total) })}</p>

  const subjectActions = (subject: Subject, blocked: boolean) => (
    <span className="flex flex-wrap justify-end gap-1">
      {!blocked && (
        <button type="button" className={cn(button, small, dangerButton)} onClick={() => setDialog({ type: "block", subject })}>
          <Ban className="h-3.5 w-3.5" aria-hidden />
          {t.actions.block.label}
        </button>
      )}
      <button type="button" className={cn(button, small)} onClick={() => setDialog({ type: "reset", subject })}>
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        {t.actions.reset.label}
      </button>
    </span>
  )

  const endSessions = (userId: string, email: string) => (
    <button type="button" className={cn(button, small)} onClick={() => setDialog({ type: "end", userId, email })}>
      <LogOut className="h-3.5 w-3.5" aria-hidden />
      {t.actions.endSessions.label}
    </button>
  )

  const flags = (r: { locked?: boolean; blocked?: boolean }) => (
    <>
      {r.locked && <span className={cn(tag, TONE.locked)}>{t.tags.locked}</span>}
      {r.blocked && <span className={cn(tag, TONE.blocked)}>{t.tags.blocked}</span>}
    </>
  )

  const kpis: [string, number, string][] = [
    [t.kpi.login, data.totals.login, t.last24h],
    [t.kpi.loginFailed, data.totals.loginFailed, t.last24h],
    [t.kpi.twoFactorFailed, data.totals.twoFactorFailed, t.last24h],
    [t.kpi.resetRequested, data.totals.resetRequested, t.last24h],
    [t.kpi.accessBlocked, data.totals.accessBlocked, t.last24h],
    [t.kpi.blocks, data.blocks.length, t.blocksHelp],
  ]

  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <p role="status" className="m-0 rounded-lg bg-[var(--color-success)]/10 px-3 py-2 text-sm text-[var(--color-success)]">
          {notice}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map(([label, value, help]) => (
          <div key={label} className={box}>
            <span className="text-xs font-medium text-[var(--color-muted)]">{label}</span>
            <span className="text-2xl font-semibold tracking-tight tabular-nums">{n(value)}</span>
            <span className="mt-auto pt-1 text-xs text-[var(--color-muted)]">{help}</span>
          </div>
        ))}
      </div>

      <HourlyChart hourly={data.hourly} labels={utcHours} />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Section title={t.panels.byIp.title} count={data.failuresByIp.total}>
          {data.failuresByIp.rows.length ? (
            <Table head={[t.panels.byIp.columns.ip, t.panels.byIp.columns.failures, t.panels.byIp.columns.emails, t.panels.byIp.columns.last, ""]}>
              {data.failuresByIp.rows.map((r) => (
                <tr key={r.ip} className="border-t border-[var(--color-line)]">
                  <td className={td}>
                    <span className="flex flex-col gap-1">
                      <Link href={feedHref("ip", r.ip)} className={cn(link, "font-mono text-xs")}>
                        {r.ip}
                      </Link>
                      {r.country && <span className="text-xs text-[var(--color-muted)]">{country(r.country)}</span>}
                      <span className="flex flex-wrap gap-1">{flags(r)}</span>
                    </span>
                  </td>
                  <td className={cn(td, num)}>{n(r.failures)}</td>
                  <td className={cn(td, num)}>{n(r.emails)}</td>
                  <td className={td}>
                    <When at={r.lastAt} locale={locale} />
                  </td>
                  <td className={td}>{subjectActions({ kind: "ip", value: r.ip }, r.blocked)}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>{t.panels.byIp.empty}</Empty>
          )}
          {more(data.failuresByIp.rows.length, data.failuresByIp.total)}
        </Section>

        <Section title={t.panels.byEmail.title} count={data.failuresByEmail.total}>
          {data.failuresByEmail.rows.length ? (
            <Table head={[t.panels.byEmail.columns.email, t.panels.byEmail.columns.failures, t.panels.byEmail.columns.ips, t.panels.byEmail.columns.last, ""]}>
              {data.failuresByEmail.rows.map((r) => (
                <tr key={r.email} className="border-t border-[var(--color-line)]">
                  <td className={cn(td, "max-w-56")}>
                    <span className="flex min-w-0 flex-col gap-1">
                      <Link href={feedHref("email", r.email)} className={cn(link, "truncate")}>
                        {r.email}
                      </Link>
                      <span className="flex flex-wrap gap-1">
                        {r.userId ? (
                          <Link href={`/admin/users/${r.userId}`} className="text-xs text-[var(--color-muted)] hover:underline">
                            {t.actions.account}
                          </Link>
                        ) : (
                          <span className={cn(tag, TONE.muted)}>{t.tags.noAccount}</span>
                        )}
                        {flags(r)}
                      </span>
                    </span>
                  </td>
                  <td className={cn(td, num)}>{n(r.failures)}</td>
                  <td className={cn(td, num)}>{n(r.ips)}</td>
                  <td className={td}>
                    <When at={r.lastAt} locale={locale} />
                  </td>
                  <td className={td}>
                    <span className="flex flex-col items-end gap-1">
                      {subjectActions({ kind: "email", value: r.email }, r.blocked)}
                      {r.userId && endSessions(r.userId, r.email)}
                    </span>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>{t.panels.byEmail.empty}</Empty>
          )}
          {more(data.failuresByEmail.rows.length, data.failuresByEmail.total)}
        </Section>

        <Section title={t.panels.twoFactor.title} count={data.twoFactorFailures.total}>
          {data.twoFactorFailures.rows.length ? (
            <Table
              head={[t.panels.twoFactor.columns.account, t.panels.twoFactor.columns.failures, t.panels.twoFactor.columns.ips, t.panels.twoFactor.columns.last, ""]}
            >
              {data.twoFactorFailures.rows.map((r) => (
                <tr key={r.userId} className="border-t border-[var(--color-line)]">
                  <td className={cn(td, "max-w-56")}>
                    <span className="flex min-w-0 flex-col gap-1">
                      <Link href={`/admin/users/${r.userId}`} className={cn(link, "truncate")}>
                        {r.email}
                      </Link>
                      <span className="flex flex-wrap gap-1">{flags(r)}</span>
                    </span>
                  </td>
                  <td className={cn(td, num)}>{n(r.failures)}</td>
                  <td className={cn(td, num)}>{n(r.ips)}</td>
                  <td className={td}>
                    <When at={r.lastAt} locale={locale} />
                  </td>
                  <td className={td}>
                    <span className="flex flex-col items-end gap-1">
                      <button type="button" className={cn(button, small)} onClick={() => setDialog({ type: "reset", subject: { kind: "email", value: r.email } })}>
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        {t.actions.reset.label}
                      </button>
                      {endSessions(r.userId, r.email)}
                    </span>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>{t.panels.twoFactor.empty}</Empty>
          )}
          {more(data.twoFactorFailures.rows.length, data.twoFactorFailures.total)}
        </Section>

        <Section title={t.panels.resets.title} count={data.resetBursts.total}>
          <p className="m-0 -mt-2 text-sm text-[var(--color-muted)]">{fill(t.panels.resets.text, { n: limits.resetBurst })}</p>
          {data.resetBursts.rows.length ? (
            <Table head={[t.panels.resets.columns.key, t.panels.resets.columns.requests, t.panels.resets.columns.last, ""]}>
              {data.resetBursts.rows.map((r) => (
                <tr key={`${r.kind}:${r.key}`} className="border-t border-[var(--color-line)]">
                  <td className={cn(td, "max-w-56")}>
                    <span className="flex min-w-0 flex-col gap-1">
                      <Link href={feedHref(r.kind, r.key)} className={cn(link, "truncate", r.kind === "ip" && "font-mono text-xs")}>
                        {r.key}
                      </Link>
                      <span className="flex flex-wrap gap-1">
                        {r.userId && (
                          <Link href={`/admin/users/${r.userId}`} className="text-xs text-[var(--color-muted)] hover:underline">
                            {t.actions.account}
                          </Link>
                        )}
                        {flags(r)}
                      </span>
                    </span>
                  </td>
                  <td className={cn(td, num)}>{n(r.requests)}</td>
                  <td className={td}>
                    <When at={r.lastAt} locale={locale} />
                  </td>
                  <td className={td}>
                    {!r.blocked && (
                      <span className="flex justify-end">
                        <button type="button" className={cn(button, small, dangerButton)} onClick={() => setDialog({ type: "block", subject: { kind: r.kind, value: r.key } })}>
                          <Ban className="h-3.5 w-3.5" aria-hidden />
                          {t.actions.block.label}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>{t.panels.resets.empty}</Empty>
          )}
          {more(data.resetBursts.rows.length, data.resetBursts.total)}
        </Section>
      </div>

      <Section title={t.panels.newSignIns.title} count={data.newSignIns.total}>
        <p className="m-0 -mt-2 text-sm text-[var(--color-muted)]">{fill(t.panels.newSignIns.text, { days: limits.lookbackDays })}</p>
        {data.newSignIns.rows.length ? (
          <Table head={[t.panels.newSignIns.columns.account, t.panels.newSignIns.columns.from, t.panels.newSignIns.columns.device, t.panels.newSignIns.columns.when, ""]}>
            {data.newSignIns.rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--color-line)]">
                <td className={cn(td, "max-w-56")}>
                  <span className="flex min-w-0 flex-col gap-1">
                    <Link href={`/admin/users/${r.userId}`} className={cn(link, "truncate")}>
                      {r.email}
                    </Link>
                    {r.platformRole && <span className={cn(tag, TONE.staff, "self-start")}>{t.tags.staff}</span>}
                  </span>
                </td>
                <td className={td}>
                  <span className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-1">
                      {country(r.country) ?? "—"}
                      {r.newCountry && <span className={cn(tag, TONE.locked)}>{t.panels.newSignIns.newCountry}</span>}
                    </span>
                    {r.ip && (
                      <Link href={feedHref("ip", r.ip)} className="font-mono text-xs text-[var(--color-muted)] hover:underline">
                        {r.ip}
                      </Link>
                    )}
                    {r.newCountry && r.knownCountries.length > 0 && (
                      <span className="text-xs text-[var(--color-muted)]">{fill(t.panels.newSignIns.known, { list: r.knownCountries.join(", ") })}</span>
                    )}
                  </span>
                </td>
                <td className={td}>
                  <span className="flex flex-wrap items-center gap-1" title={r.userAgent ?? undefined}>
                    {r.device ?? "—"}
                    {r.newDevice && <span className={cn(tag, TONE.locked)}>{t.panels.newSignIns.newDevice}</span>}
                  </span>
                </td>
                <td className={td}>
                  <When at={r.at} locale={locale} />
                </td>
                <td className={td}>
                  <span className="flex justify-end">{endSessions(r.userId, r.email)}</span>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>{t.panels.newSignIns.empty}</Empty>
        )}
        {more(data.newSignIns.rows.length, data.newSignIns.total)}
      </Section>

      <Section title={t.blocks.title} count={data.blocks.length}>
        <div className="-mt-2 flex justify-end">
          <button type="button" className={cn(button, dangerButton)} onClick={() => setDialog({ type: "block" })}>
            <Ban className="h-4 w-4" aria-hidden />
            {t.actions.blockNew.label}
          </button>
        </div>
        {data.blocks.length ? (
          <Table head={[t.blocks.columns.value, t.blocks.columns.reason, t.blocks.columns.by, t.blocks.columns.until, ""]}>
            {data.blocks.map((b) => (
              <tr key={b.id} className="border-t border-[var(--color-line)]">
                <td className={td}>
                  <span className="flex flex-col gap-1">
                    <Link href={b.kind === "email" || !b.value.includes("/") ? feedHref(b.kind, b.value) : "/admin/security#events"} className={cn(link, b.kind === "ip" && "font-mono text-xs")}>
                      {b.value}
                    </Link>
                    <span className="text-xs text-[var(--color-muted)]">{t.blocks.kinds[b.kind]}</span>
                  </span>
                </td>
                <td className={cn(td, "max-w-72 break-words")}>{b.reason}</td>
                <td className={td}>
                  <span className="flex flex-col">
                    {b.createdByName ?? "—"}
                    <When at={b.createdAt} locale={locale} />
                  </span>
                </td>
                <td className={cn(td, "whitespace-nowrap")}>{formatDate(b.expiresAt, locale, { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className={td}>
                  <span className="flex justify-end">
                    <button type="button" className={cn(button, small)} onClick={() => setDialog({ type: "unblock", block: b })}>
                      {t.actions.unblock.label}
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>{t.blocks.empty}</Empty>
        )}
      </Section>

      <StaffSection staff={staff} />

      {dialog?.type === "block" && (
        <BlockDialog subject={dialog.subject} onClose={() => setDialog(null)} onDone={() => done(t.done.block)} />
      )}
      {dialog?.type === "unblock" && (
        <ConfirmDialog
          title={`${t.actions.unblock.label}: ${dialog.block.value}`}
          text={fill(t.actions.unblock.text, { value: dialog.block.value })}
          stepUp={false}
          submit={(reason) => postJson("/api/admin/security/unblock", { reason, id: dialog.block.id })}
          onClose={() => setDialog(null)}
          onDone={() => done(t.done.unblock)}
        />
      )}
      {dialog?.type === "reset" && (
        <ConfirmDialog
          title={`${t.actions.reset.label}: ${dialog.subject.value}`}
          text={fill(t.actions.reset.text, { value: dialog.subject.value })}
          stepUp
          submit={(reason) => postJson("/api/admin/security/reset-throttle", { reason, ...dialog.subject })}
          onClose={() => setDialog(null)}
          onDone={(res) => done(fill(t.done.reset, { n: n((res as { cleared?: number } | null)?.cleared ?? 0) }))}
        />
      )}
      {dialog?.type === "end" && (
        <ConfirmDialog
          title={`${t.actions.endSessions.label}: ${dialog.email}`}
          text={fill(t.actions.endSessions.text, { email: dialog.email })}
          danger
          stepUp
          submit={(reason) => postJson(`/api/admin/users/${dialog.userId}/revoke-sessions`, { reason })}
          onClose={() => setDialog(null)}
          onDone={(res) => done(fill(t.done.endSessions, { n: n((res as { signedOut?: number } | null)?.signedOut ?? 0) }))}
        />
      )}
    </div>
  )
}

function BlockDialog({ subject, onClose, onDone }: { subject?: Subject; onClose: () => void; onDone: () => void }) {
  const { t: app } = useAppI18n()
  const t = app.admin!.security
  const [kind, setKind] = useState<Subject["kind"]>(subject?.kind ?? "ip")
  const [value, setValue] = useState(subject?.value ?? "")
  const [minutes, setMinutes] = useState("1440")
  const label = "flex flex-col gap-1.5 text-sm font-medium"
  return (
    <ConfirmDialog
      title={subject ? `${t.actions.block.label}: ${subject.value}` : t.actions.blockNew.label}
      text={subject ? fill(t.actions.block.text, { value: subject.value }) : t.actions.blockNew.text}
      danger
      stepUp
      ready={!!value.trim()}
      submit={(reason) => postJson("/api/admin/security/block", { reason, kind, value: value.trim(), minutes: Number(minutes) })}
      onClose={onClose}
      onDone={onDone}
    >
      {!subject && (
        <>
          <label className={label}>
            {t.dialog.kind}
            <select value={kind} onChange={(e) => setKind(e.target.value as Subject["kind"])} className={`${field} h-10`}>
              <option value="ip">{t.dialog.kinds.ip}</option>
              <option value="email">{t.dialog.kinds.email}</option>
            </select>
          </label>
          <label className={label}>
            {t.dialog.value}
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={254}
              autoComplete="off"
              placeholder={kind === "ip" ? "203.0.113.0/24" : "name@example.com"}
              className={cn(field, "h-10", kind === "ip" && "font-mono")}
            />
            <span className="text-xs font-normal text-[var(--color-muted)]">{t.dialog.valueHint}</span>
          </label>
        </>
      )}
      <label className={label}>
        {t.dialog.duration}
        <select value={minutes} onChange={(e) => setMinutes(e.target.value)} className={`${field} h-10`}>
          {Object.entries(t.dialog.durations).map(([m, text]) => (
            <option key={m} value={m}>
              {text}
            </option>
          ))}
        </select>
      </label>
    </ConfirmDialog>
  )
}

function HourlyChart({ hourly, labels }: { hourly: SecurityOverviewJson["hourly"]; labels: string[] }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.security.chart
  const config = {
    loginFailed: { label: t.loginFailed, color: "var(--chart-1)" },
    twoFactorFailed: { label: t.twoFactorFailed, color: "var(--chart-2)" },
    resetRequested: { label: t.resetRequested, color: "var(--chart-3)" },
    accessBlocked: { label: t.accessBlocked, color: "var(--chart-5)" },
  } satisfies ChartConfig
  // hour labels come from the server, so they match what it rendered
  const data = hourly.map((h, i) => ({ ...h, label: labels[i] ?? h.hour }))
  const total = hourly.reduce((s, h) => s + h.loginFailed + h.twoFactorFailed + h.resetRequested + h.accessBlocked, 0)
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 sm:p-5" aria-labelledby="security-hourly">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="security-hourly" className="m-0 text-base font-semibold">
          {t.title}
        </h2>
        <span className="text-xs text-[var(--color-muted)]">{t.utc}</span>
      </div>
      <ChartEmptyOverlay show={total === 0} message={t.empty}>
        <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
          <BarChart accessibilityLayer data={data} margin={{ left: 0, right: 4, top: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={20} />
            <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
            <ChartTooltip cursor content={<ChartTooltipContent valueFormatter={(v) => formatNumber(v, locale)} />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="loginFailed" stackId="s" fill="var(--color-loginFailed)" />
            <Bar dataKey="twoFactorFailed" stackId="s" fill="var(--color-twoFactorFailed)" />
            <Bar dataKey="resetRequested" stackId="s" fill="var(--color-resetRequested)" />
            <Bar dataKey="accessBlocked" stackId="s" fill="var(--color-accessBlocked)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </ChartEmptyOverlay>
    </section>
  )
}

function StaffSection({ staff }: { staff: StaffAccountJson[] }) {
  const { t: app, locale } = useAppI18n()
  const t = app.admin!.security.staff
  const actions = useAuditLabels()
  const head = [t.columns.account, t.columns.role, t.columns.twoFactor, t.columns.lastLogin, t.columns.lastAction, t.columns.sessions]
  return (
    <Section title={t.title} count={staff.length}>
      <p className="m-0 -mt-2 text-sm text-[var(--color-muted)]">{t.text}</p>
      <Table head={head}>
        {staff.map((s) => (
          <tr key={s.id} className="border-t border-[var(--color-line)]">
            <td className={cn(td, "max-w-60")}>
              <span className="flex min-w-0 flex-col">
                <Link href={`/admin/users/${s.id}`} className={cn(link, "truncate")}>
                  {s.name}
                </Link>
                <span className="truncate text-xs text-[var(--color-muted)]">{s.email}</span>
                {s.suspended && <span className={cn(tag, TONE.blocked, "mt-1 self-start")}>{t.suspended}</span>}
              </span>
            </td>
            <td className={td}>
              <span className={cn(tag, s.role === "superadmin" ? TONE.locked : TONE.staff)}>{t.roles[s.role]}</span>
            </td>
            <td className={td}>
              {s.twoFactor ? (
                <span className="flex flex-col gap-0.5">
                  <span className={cn(tag, TONE.ok, "gap-1 self-start")}>
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    {t.on}
                  </span>
                  {s.twoFactorSince && <span className="text-xs text-[var(--color-muted)]">{fill(t.since, { date: formatDate(s.twoFactorSince, locale, { dateStyle: "medium" }) })}</span>}
                </span>
              ) : (
                <span className={cn(tag, TONE.blocked, "gap-1")}>
                  <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                  {t.off}
                </span>
              )}
            </td>
            <td className={td}>
              {s.lastLoginAt ? (
                <span className="flex flex-col">
                  <When at={s.lastLoginAt} locale={locale} />
                  {(s.lastLoginIp || s.lastLoginCountry) && (
                    <span className="font-mono text-xs text-[var(--color-muted)]">{[s.lastLoginIp, s.lastLoginCountry].filter(Boolean).join(" · ")}</span>
                  )}
                </span>
              ) : (
                <span className="text-[var(--color-muted)]">{t.never}</span>
              )}
            </td>
            <td className={td}>
              {s.lastActionAt && s.lastAction ? (
                <span className="flex flex-col">
                  <Link href={`/admin/audit?actor=${s.id}`} className={link}>
                    {actions(s.lastAction)}
                  </Link>
                  <When at={s.lastActionAt} locale={locale} />
                </span>
              ) : (
                <span className="text-[var(--color-muted)]">{t.none}</span>
              )}
            </td>
            <td className={cn(td, num)}>{formatNumber(s.sessions, locale)}</td>
          </tr>
        ))}
      </Table>
    </Section>
  )
}

/** The label of an audit action in the staff member's language, from every section's list; the code itself when none has one. */
export function useAuditLabels(): (action: string) => string {
  const { t: app } = useAppI18n()
  const a = app.admin!
  return useMemo(() => {
    const all: Record<string, string> = {
      ...a.users.detail.auditActions,
      ...a.workspaces.detail.auditActions,
      ...a.bots.detail.auditActions,
      ...a.knowledge.detail.auditActions,
      ...a.audit.actions,
    }
    return (action: string) => all[action] ?? action
  }, [a])
}
