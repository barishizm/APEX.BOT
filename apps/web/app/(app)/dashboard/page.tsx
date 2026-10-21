import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle, ArrowRight, BookOpen, ChevronRight, CircleCheck, Code2, Cpu, Globe, MessageSquareText, Palette, Radio } from "lucide-react"
import { OVERAGE_BLOCK, PROVIDERS, conversationStats, findModel, membership, workspaceReplyUsage, type ReplyUsage } from "@apex/db"
import { CopySnippet } from "@/components/copy-snippet"
import { DashboardFrame } from "@/components/dashboard/frame"
import { requireVerifiedUser } from "@/lib/auth"
import { currentBot, currentSources, getSetup, shownSite } from "@/lib/dashboard"
import { conversationsHref } from "@/lib/conversations"
import { db } from "@/lib/db"
import { SETUP_STEPS } from "@/lib/setup-steps"
import { embedSnippet } from "@/lib/site"
import { BILLING_PATH } from "@/lib/billing/intent"
import { firstName } from "@/lib/display-name"
import { format, type Locale } from "@/lib/i18n"
import { getAppDictionary } from "@/lib/i18n/app"
import { formatDate, formatNumber, formatPercent, formatUsd, plural, timeAgo } from "@/lib/i18n/format"
import { requestLocale } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: getAppDictionary(await requestLocale()).overview.title }
}

const card = "flex flex-col gap-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5"
const linkButton =
  "inline-flex h-9 w-fit items-center gap-1.5 rounded-lg border border-[var(--color-line)] px-3 text-sm font-semibold text-[var(--color-text)] no-underline transition-colors hover:border-[var(--color-muted)]"

// the overview counts over this window; stat links open the inbox narrowed to it
const DAYS = 7

/** A count that opens the list behind it. */
function StatLink({ href, value, label }: { href: string; value: string; label: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-xl border border-transparent bg-[var(--color-raised)] p-3 no-underline transition-colors hover:border-[var(--color-line)] hover:bg-[var(--color-bubble)] focus-visible:border-[var(--color-muted)]"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-[var(--color-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-text)]" aria-hidden />
      </span>
      <span className="text-xs text-[var(--color-muted)] group-hover:text-[var(--color-text)]">{label}</span>
    </Link>
  )
}

/** Share of the allowance at which the overview starts warning (ADR 0003 (c)); full is 1. */
const QUOTA_WARN = 0.8

/**
 * The 80% and 100% reply warnings, while the workspace is held to its replies (reply_quota). At 100%
 * what happens next depends on overage: paid replies continue up to the cap, then the contact form.
 */
function QuotaAlert({ usage, t, locale }: { usage: ReplyUsage; t: ReturnType<typeof getAppDictionary>["overview"]["quota"]; locale: Locale }) {
  if (!usage.enforced || !usage.allowanceFifths) return null
  const ratio = usage.usedFifths / usage.allowanceFifths
  if (ratio < QUOTA_WARN) return null
  const date = formatDate(usage.window.end, locale)
  const capCents = usage.overage.enabled ? (usage.overage.capCents ?? 0) : 0
  // overage is used in blocks; the cap is reached once every block it allows is used up
  const capFifths = (capCents / OVERAGE_BLOCK.priceCents) * OVERAGE_BLOCK.replies * 5
  const full = ratio >= 1
  const capped = full && capCents > 0 && usage.overage.usedFifths >= capFifths
  const title = !full
    ? format(t.nearTitle, { percent: formatPercent(Math.min(ratio, 0.99), locale) })
    : capped
      ? t.capTitle
      : t.fullTitle
  const text = !full
    ? format(t.nearText, { used: formatNumber(Math.round(usage.usedFifths * 2) / 10, locale), total: formatNumber(usage.allowanceFifths / 5, locale), date })
    : capped
      ? format(t.capText, { date })
      : capCents > 0
        ? format(t.fullOverage, { cap: formatUsd(capCents / 100, locale) })
        : format(usage.overage.allowed ? t.fullOff : t.fullFree, { date })
  // red only while the assistant has stopped answering
  const stopped = full && (capped || capCents === 0)
  return (
    <section
      role={stopped ? "alert" : "status"}
      className={`flex flex-col gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center ${
        stopped ? "border-red-500/40 bg-red-500/10" : "border-amber-500/40 bg-amber-500/10"
      }`}
    >
      <AlertTriangle className={`h-5 w-5 shrink-0 ${stopped ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm">{text}</p>
      </div>
      <Link href={BILLING_PATH} className={`${linkButton} shrink-0 bg-[var(--color-raised)]`}>
        {t.cta}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  )
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireVerifiedUser()
  const locale = await requestLocale()
  const app = getAppDictionary(locale)
  const t = app.overview
  const num = (n: number) => formatNumber(n, locale)
  const { welcome } = await searchParams
  const [bot, sources, setup, stats, member] = await Promise.all([
    currentBot(user.id),
    currentSources(user.id),
    getSetup(user.id),
    conversationStats(db(), await shownSite(user.id), DAYS),
    membership(db(), user.id),
  ])
  const usage = await workspaceReplyUsage(db(), member.organization_id)
  const s = bot.settings
  const model = findModel(s.model.provider, s.model.id)
  const next = SETUP_STEPS.find((step) => !setup[step.id])
  const done = SETUP_STEPS.filter((step) => setup[step.id]).length
  const chunks = sources.reduce((n, x) => n + x.chunks, 0)
  const pages = sources.reduce((n, x) => n + x.pages, 0)
  const failing = sources.filter((x) => x.status === "failed").length
  const origins = s.security.allowedOrigins

  return (
    <DashboardFrame active="Overview" intro={welcome === "1"}>
      <div className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 border-b border-[var(--color-line)] bg-[var(--color-raised)]/95 px-4 py-3 backdrop-blur sm:px-6">
          <h1 className="text-lg font-semibold">{format(t.welcome, { name: firstName(user, locale) })}</h1>
          <p className="text-xs text-[var(--color-muted)]">{next ? t.stepsLeft : format(t.live, { bot: s.general.botName })}</p>
        </header>

        <div className="flex flex-col gap-6 p-4 sm:p-6">
          {usage && <QuotaAlert usage={usage} t={t.quota} locale={locale} />}
          {next && (
            <section className={`${card} sm:flex-row sm:items-center`} aria-label={t.nextStep}>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                  {format(t.nextStepProgress, { done, total: SETUP_STEPS.length })}
                </p>
                <h2 className="text-lg font-semibold">{app.setup.steps[next.id].title}</h2>
                <p className="text-sm text-[var(--color-muted)]">{app.setup.steps[next.id].description}</p>
              </div>
              <Link
                href={next.href || "/dashboard/onboarding/list"}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 text-sm font-semibold no-underline"
                style={{ color: "var(--color-on-primary)" }}
              >
                {next.href ? app.setup.steps[next.id].cta : t.viewChecklist}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </section>
          )}

          <section className={card} aria-labelledby="activity-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-4 w-4 text-[var(--color-muted)]" aria-hidden />
                <h2 id="activity-title" className="font-semibold">
                  {t.last7Days}
                </h2>
              </div>
              <div className="flex items-center gap-4">
                <Link href="/dashboard/analytics" className="text-sm font-semibold">
                  {app.shell.nav.analytics}
                </Link>
                <Link href="/dashboard/conversations" className="text-sm font-semibold">
                  {t.allConversations}
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {(
                [
                  [t.stats.conversations, stats.conversations, conversationsHref("all", DAYS)],
                  [t.stats.unanswered, stats.unanswered, conversationsHref("unanswered", DAYS)],
                  [t.stats.handoffs, stats.handoffs, conversationsHref("handoff", DAYS)],
                  [t.stats.leads, stats.leads, conversationsHref("leads", DAYS)],
                  [
                    t.stats.helpful,
                    stats.helpful + stats.notHelpful ? formatPercent(stats.helpful / (stats.helpful + stats.notHelpful), locale) : "–",
                    conversationsHref("negative", DAYS),
                  ],
                ] as const
              ).map(([label, value, href]) => (
                <StatLink key={label} href={href} value={typeof value === "number" ? num(value) : value} label={label} />
              ))}
            </div>
            {stats.conversations === 0 && (
              <p className="text-sm text-[var(--color-muted)]">{t.noConversations}</p>
            )}
          </section>

          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <section className={card}>
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-[var(--color-muted)]" aria-hidden />
                <h2 className="font-semibold">{t.status}</h2>
              </div>
              {bot.widgetSeenAt ? (
                <p className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-green-500" aria-hidden />
                  <span>
                    {t.liveOn} <strong>{bot.widgetSeenOrigin?.replace(/^https?:\/\//, "")}</strong>
                    <span className="text-[var(--color-muted)]"> · {format(t.lastSeen, { when: timeAgo(bot.widgetSeenAt, locale) })}</span>
                  </span>
                </p>
              ) : (
                <p className="flex items-start gap-2 text-sm text-[var(--color-muted)]">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-line)]" aria-hidden />
                  {origins.length ? t.notSeen : t.noOrigins}
                </p>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-[var(--color-muted)]">{t.allowedSites}</dt>
                <dd className="m-0 min-w-0 truncate">{origins.length ? origins.map((o) => o.replace(/^https?:\/\//, "")).join(", ") : t.noneYet}</dd>
                <dt className="text-[var(--color-muted)]">{t.languages}</dt>
                <dd className="m-0">{format(t.languagesValue, { lang: t.langNames[s.general.defaultLang] })}</dd>
                <dt className="text-[var(--color-muted)]">{t.handoff}</dt>
                <dd className="m-0 min-w-0 truncate">{s.handoff.enabled && s.handoff.email ? format(t.handoffTo, { email: s.handoff.email }) : t.off}</dd>
              </dl>
              <Link href="/dashboard/widget?section=install" className={linkButton}>
                <Globe className="h-4 w-4" aria-hidden />
                {t.install}
              </Link>
            </section>

            <section className={card}>
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[var(--color-muted)]" aria-hidden />
                <h2 className="font-semibold">{t.knowledge}</h2>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    [t.knowledgeStats.sources, sources.length],
                    [t.knowledgeStats.pages, pages],
                    [t.knowledgeStats.excerpts, chunks],
                  ] as const
                ).map(([label, value]) => (
                  <StatLink key={label} href="/dashboard/knowledge" value={num(value)} label={label} />
                ))}
              </div>
              <p className="text-sm text-[var(--color-muted)]">
                {chunks === 0 ? t.knowledgeEmpty : failing ? plural(failing, t.knowledgeFailing, locale) : t.knowledgeOk}
              </p>
              <Link href="/dashboard/knowledge" className={linkButton}>
                <BookOpen className="h-4 w-4" aria-hidden />
                {t.manageKnowledge}
              </Link>
            </section>

            <section className={card}>
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-[var(--color-muted)]" aria-hidden />
                <h2 className="font-semibold">{t.assistant}</h2>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-[var(--color-muted)]">{t.name}</dt>
                <dd className="m-0">{s.general.botName}</dd>
                <dt className="text-[var(--color-muted)]">{t.model}</dt>
                <dd className="m-0">
                  {model?.label ?? s.model.id} <span className="text-[var(--color-muted)]">· {PROVIDERS.find((p) => p.id === s.model.provider)?.label}</span>
                </dd>
                <dt className="text-[var(--color-muted)]">{t.tone}</dt>
                <dd className="m-0">{t.tones[s.persona.tone]}</dd>
                <dt className="text-[var(--color-muted)]">{t.dailyBudget}</dt>
                <dd className="m-0">{format(t.tokens, { n: num(s.security.dailyTokenBudget) })}</dd>
              </dl>
              <Link href="/dashboard/widget" className={linkButton}>
                <Palette className="h-4 w-4" aria-hidden />
                {t.customize}
              </Link>
            </section>

            <section className={card}>
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-[var(--color-muted)]" aria-hidden />
                <h2 className="font-semibold">{t.embedCode}</h2>
              </div>
              <p className="text-sm text-[var(--color-muted)]">{t.embedHelp}</p>
              <CopySnippet code={embedSnippet(bot.siteKey)} />
              {!next && (
                <p className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
                  <CircleCheck className="h-4 w-4" aria-hidden />
                  {t.setupComplete}
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </DashboardFrame>
  )
}
