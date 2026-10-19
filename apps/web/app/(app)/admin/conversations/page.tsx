import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle, ChevronRight, LockKeyhole, MessagesSquare } from "lucide-react"
import {
  adminConversationBotsList,
  OVERVIEW_RANGES,
  platformConversations,
  supportAccessActivity,
  UNANSWERED_ALERT_MIN_ANSWERS,
  UNANSWERED_ALERT_RATE,
  type BreakdownRow,
  type SupportWindow,
} from "@apex/db"
import { ConversationBotsTable } from "@/components/admin/conversation-bots-table"
import { ConversationCharts } from "@/components/admin/conversation-charts"
import { readTableQuery } from "@/components/admin/table-query"
import { requirePlatformAdmin } from "@/lib/auth"
import { listFilterKeys } from "@/lib/admin-list"
import { db } from "@/lib/db"
import { format } from "@/lib/i18n"
import { getAdminDictionary } from "@/lib/i18n/app"
import { LOCALE_META, type Locale } from "@/lib/i18n/config"
import { formatDate, formatNumber, formatPercent, timeAgo } from "@/lib/i18n/format"
import { requestLocale } from "@/lib/i18n/server"
import { cn } from "@/lib/utils"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAdminDictionary(await requestLocale()).conversations.title }
}

// Platform-wide conversation numbers (admin-conversations.ts). Nothing on this page reads a
// conversation: staff do that only through support access on a bot, and the windows they opened,
// with what they read in them, are listed here.

const box = "flex min-w-0 flex-col gap-1 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4"
const card = "flex min-w-0 flex-col gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 sm:p-5"
const th = "whitespace-nowrap px-3 py-2 font-semibold"
const td = "px-3 py-2.5 align-top"
const tag = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
const link = "font-medium text-[var(--color-text)] no-underline hover:underline"
const subLink = "text-inherit no-underline hover:underline"

function Tile({ label, value, help, href, warn }: { label: string; value: string; help: string; href?: string; warn?: boolean }) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-2 text-xs font-medium text-[var(--color-muted)]">
        {label}
        {href && <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-text)]" aria-hidden />}
      </span>
      <span className="flex items-center gap-1.5 text-2xl font-semibold tracking-tight tabular-nums">
        {warn && <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />}
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

function Section({ id, title, text, children, className }: { id: string; title: string; text?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn(card, "scroll-mt-6", className)} aria-labelledby={`${id}-title`}>
      <div>
        <h2 id={`${id}-title`} className="m-0 text-base font-semibold">
          {title}
        </h2>
        {text && <p className="m-0 mt-1 text-sm text-[var(--color-muted)]">{text}</p>}
      </div>
      {children}
    </section>
  )
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-line)]">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-[var(--color-raised)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className={th}>
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

const Time = ({ at, locale }: { at: Date; locale: Locale }) => (
  <time dateTime={at.toISOString()} title={formatDate(at, locale, { dateStyle: "medium", timeStyle: "short" })} className="whitespace-nowrap">
    {timeAgo(at, locale)}
  </time>
)

/** Names for ISO codes in the viewer's language; the code itself where the runtime has none. */
function displayNames(locale: Locale, type: "region" | "language") {
  let names: Intl.DisplayNames | null = null
  try {
    names = new Intl.DisplayNames([LOCALE_META[locale].intl], { type })
  } catch {}
  return (code: string) => {
    try {
      return names?.of(code) ?? code
    } catch {
      return code
    }
  }
}

function Breakdown({ title, rows, name, other, locale }: { title: string; rows: BreakdownRow[]; name: (key: string) => string; other: string; locale: Locale }) {
  const total = rows.reduce((n, r) => n + r.n, 0)
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="m-0 text-sm font-semibold">{title}</h3>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((r) => (
          <li key={r.key ?? "other"} className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className={cn("min-w-0 truncate", r.key === null && "text-[var(--color-muted)]")}>{r.key === null ? other : name(r.key)}</span>
              <span className="shrink-0 tabular-nums">
                {formatNumber(r.n, locale)} <span className="text-xs text-[var(--color-muted)]">· {formatPercent(r.n / total, locale)}</span>
              </span>
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-[var(--color-raised)]" aria-hidden>
              <span className={cn("block h-full rounded-full", r.key === null ? "bg-[var(--color-muted)]/40" : "bg-[var(--color-text)]")} style={{ width: `${(r.n / total) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default async function AdminConversationsPage({ searchParams }: PageProps<"/admin/conversations">) {
  const admin = await requirePlatformAdmin()
  const locale = await requestLocale()
  const t = getAdminDictionary(locale).conversations
  const search = await searchParams
  const [data, support] = await Promise.all([platformConversations(db(), search.days), supportAccessActivity(db())])
  const { days, totals: s } = data

  const n = (v: number) => formatNumber(v, locale)
  const pct = (part: number, whole: number) => (whole > 0 ? formatPercent(part / whole, locale) : "–")
  const previous = t.previous[days]!
  // links into the table below keep the range (30 days needs no parameter)
  const tableHref = (filter: string) => `/admin/conversations?${days === 30 ? "" : `days=${days}&`}${filter}#bots`

  const trend = (() => {
    const cur = s.conversations
    const prev = s.previousConversations
    if (prev === 0) return format(cur > 0 ? t.help.trendNew : t.help.trendFlat, { previous })
    const change = (cur - prev) / prev
    if (Math.abs(change) < 0.005) return format(t.help.trendFlat, { previous })
    return format(change > 0 ? t.help.trendUp : t.help.trendDown, { pct: formatPercent(Math.abs(change), locale), previous })
  })()
  const unansweredHelp =
    s.answers === 0
      ? t.help.noReplies
      : s.previousAnswers > 0
        ? format(t.help.unanswered, { n: n(s.unanswered), answers: n(s.answers), previous, rate: pct(s.previousUnanswered, s.previousAnswers) })
        : format(t.help.unansweredNoPrevious, { n: n(s.unanswered), answers: n(s.answers) })
  const rated = s.negative + s.positive

  const country = displayNames(locale, "region")
  const language = displayNames(locale, "language")

  const windowRow = (w: SupportWindow) => (
    <tr key={w.id} className="border-t border-[var(--color-line)]">
      <td className={cn(td, "max-w-40")}>
        <Link href={`/admin/users/${w.adminId}`} className={cn(link, "block truncate")}>
          {w.adminName}
        </Link>
        {w.adminId === admin.user.id && <span className="text-xs text-[var(--color-muted)]">{t.support.yours}</span>}
      </td>
      <td className={cn(td, "max-w-48")}>
        <Link href={`/admin/bots/${w.botId}`} className={cn(link, "block truncate")}>
          {w.botName}
        </Link>
        <Link href={`/admin/workspaces/${w.organizationId}`} className={cn(subLink, "block truncate text-xs text-[var(--color-muted)]")}>
          {w.organizationName}
        </Link>
      </td>
      <td className={cn(td, "min-w-56 max-w-md")}>
        <span className="line-clamp-3 break-words" title={w.reason}>
          {w.reason}
        </span>
        {w.ticketRef && <span className="block text-xs text-[var(--color-muted)]">{format(t.support.ticket, { ref: w.ticketRef })}</span>}
      </td>
      <td className={td}>
        <Time at={w.createdAt} locale={locale} />
      </td>
      <td className={cn(td, "whitespace-nowrap")}>
        {w.state === "open" ? (
          <span className={cn(tag, "bg-amber-500/15 text-amber-800 dark:text-amber-200")}>
            {format(t.support.states.open, { time: formatDate(w.expiresAt, locale, { timeStyle: "short" }) })}
          </span>
        ) : (
          <span className="text-[var(--color-muted)]">
            {format(w.state === "closed" ? t.support.states.closed : t.support.states.expired, { when: timeAgo(w.state === "closed" ? w.endedAt! : w.expiresAt, locale) })}
          </span>
        )}
        {w.state === "open" && w.adminId === admin.user.id && (
          <Link href={`/admin/bots/${w.botId}/conversations`} className={cn(link, "mt-1.5 flex items-center gap-1 text-xs")}>
            <MessagesSquare className="h-3.5 w-3.5" aria-hidden /> {t.support.inbox}
          </Link>
        )}
      </td>
      <td className={cn(td, "whitespace-nowrap tabular-nums")}>
        {w.views + w.reveals === 0 ? (
          <span className="text-[var(--color-muted)]">{t.support.nothingRead}</span>
        ) : (
          <span className="flex flex-col items-start gap-1">
            <span>{format(t.support.views, { n: n(w.views) })}</span>
            {w.reveals > 0 && <span className={cn(tag, "bg-amber-500/15 text-amber-800 dark:text-amber-200")}>{format(t.support.reveals, { n: n(w.reveals) })}</span>}
          </span>
        )}
      </td>
    </tr>
  )
  const windowHead = [t.support.columns.staff, t.support.columns.bot, t.support.columns.reason, t.support.columns.opened, t.support.columns.window, t.support.columns.reads]

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 max-sm:px-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="mt-1 text-[var(--color-muted)]">{t.lede}</p>
        </div>
        <nav aria-label={t.rangeLabel} className="flex flex-col items-end gap-1">
          <div className="flex rounded-lg border border-[var(--color-line)] p-0.5">
            {OVERVIEW_RANGES.map((d) => (
              <Link
                key={d}
                href={d === 30 ? "/admin/conversations" : `/admin/conversations?days=${d}`}
                aria-current={d === days ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1 text-sm no-underline transition-colors",
                  d === days ? "bg-[var(--color-raised)] font-semibold text-[var(--color-text)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]",
                )}
              >
                {t.ranges[d]}
              </Link>
            ))}
          </div>
          <span className="text-xs text-[var(--color-muted)]">{t.utcNote}</span>
        </nav>
      </header>

      <div className="flex gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-sm">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-muted)]" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <strong className="font-semibold">{t.privacy.title}</strong>
          <p className="m-0 text-[var(--color-muted)]">{t.privacy.text}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={t.tiles.conversations} value={n(s.conversations)} help={format(t.help.conversations, { messages: n(s.messages), trend })} />
        <Tile
          label={t.tiles.unanswered}
          value={pct(s.unanswered, s.answers)}
          help={unansweredHelp}
          href={s.unanswered > 0 ? tableHref("unanswered=any&sort=unanswered&dir=desc") : undefined}
        />
        <Tile label={t.tiles.open} value={n(s.openQuestions)} help={t.help.open} href={s.openQuestions > 0 ? tableHref("open=yes") : undefined} />
        <Tile
          label={t.tiles.alert}
          value={n(s.alertBots)}
          help={format(t.help.alert, { min: n(UNANSWERED_ALERT_MIN_ANSWERS), rate: formatPercent(UNANSWERED_ALERT_RATE, locale) })}
          href={s.alertBots > 0 ? tableHref("unanswered=high&sort=unanswered&dir=desc") : undefined}
          warn={s.alertBots > 0}
        />
        <Tile
          label={t.tiles.feedback}
          value={pct(s.negative, rated)}
          help={rated ? format(t.help.feedback, { down: n(s.negative), rated: n(rated), up: n(s.positive) }) : t.help.noFeedback}
          href={s.negative > 0 ? tableHref("negative=yes&sort=negative&dir=desc") : undefined}
        />
        <Tile
          label={t.tiles.handoffs}
          value={n(s.handoffs)}
          help={format(t.help.handoffs, { share: pct(s.handoffs, s.conversations) })}
          href={s.handoffs > 0 ? tableHref("handoff=yes&sort=handoffs&dir=desc") : undefined}
        />
        <Tile label={t.tiles.leads} value={n(s.leads)} help={format(t.help.leads, { share: pct(s.leads, s.conversations) })} />
        <Tile label={t.tiles.active} value={n(s.activeBots)} help={format(t.help.active, { workspaces: n(s.activeWorkspaces) })} href={tableHref("activity=active")} />
      </div>

      <ConversationCharts daily={data.daily} />

      <Section id="bots" title={t.bots.title} text={t.bots.text}>
        {/* the range and the tiles above link to filtered views; a new query starts the table afresh */}
        <ConversationBotsTable key={JSON.stringify(search)} days={days} initialQuery={readTableQuery(search, listFilterKeys(adminConversationBotsList(days)))} />
      </Section>

      <Section id="support" title={t.support.title} text={t.support.text}>
        <p className="m-0 text-sm tabular-nums">
          {format(t.support.totals, { windows: n(support.totals.windows), staff: n(support.totals.staff), views: n(support.totals.views), reveals: n(support.totals.reveals) })}
        </p>
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-semibold">
            {t.support.open} <span className="font-normal text-[var(--color-muted)]">({n(support.open.length)})</span>
          </h3>
          {support.open.length ? <Table head={windowHead}>{support.open.map(windowRow)}</Table> : <p className="m-0 text-sm text-[var(--color-muted)]">{t.support.noneOpen}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-semibold">{t.support.recent}</h3>
          {support.recent.length ? (
            <Table head={windowHead}>{support.recent.map(windowRow)}</Table>
          ) : (
            <p className="m-0 text-sm text-[var(--color-muted)]">{t.support.noneRecent}</p>
          )}
        </div>
        <p className="m-0 text-xs text-[var(--color-muted)]">{t.support.hint}</p>
      </Section>

      <Section id="breakdown" title={t.breakdown.title} text={t.breakdown.text}>
        {s.conversations === 0 ? (
          <p className="m-0 text-sm text-[var(--color-muted)]">{t.breakdown.empty}</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            <Breakdown title={t.breakdown.devices} rows={data.breakdown.devices} name={(k) => t.breakdown.deviceNames[k] ?? k} other={t.breakdown.other} locale={locale} />
            <Breakdown title={t.breakdown.countries} rows={data.breakdown.countries} name={country} other={t.breakdown.other} locale={locale} />
            <Breakdown title={t.breakdown.languages} rows={data.breakdown.languages} name={language} other={t.breakdown.other} locale={locale} />
          </div>
        )}
      </Section>
    </div>
  )
}
