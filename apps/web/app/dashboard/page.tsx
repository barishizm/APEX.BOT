import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, BookOpen, CircleCheck, Code2, Cpu, Globe, MessageSquareText, Palette, Radio } from "lucide-react"
import { PROVIDERS, conversationStats, findModel } from "@apex/db"
import { CopySnippet } from "@/components/copy-snippet"
import { DashboardFrame } from "@/components/dashboard/frame"
import { requireVerifiedUser } from "@/lib/auth"
import { currentBot, currentSources, getSetup } from "@/lib/dashboard"
import { db } from "@/lib/db"
import { SETUP_STEPS } from "@/lib/setup-steps"
import { embedSnippet } from "@/lib/site"

export const metadata: Metadata = { title: "Dashboard" }

function ago(date: Date) {
  const s = (Date.now() - date.getTime()) / 1000
  if (s < 120) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)} minutes ago`
  if (s < 86400) return `${Math.floor(s / 3600)} hours ago`
  return `${Math.floor(s / 86400)} days ago`
}

const card = "flex flex-col gap-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5"
const linkButton =
  "inline-flex h-9 w-fit items-center gap-1.5 rounded-lg border border-[var(--color-line)] px-3 text-sm font-semibold text-[var(--color-text)] no-underline transition-colors hover:border-[var(--color-muted)]"

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireVerifiedUser()
  const { welcome } = await searchParams
  const [bot, sources, setup, stats] = await Promise.all([currentBot(user.id), currentSources(user.id), getSetup(user.id), conversationStats(db(), user.id, 7)])
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {user.username}</h1>
          <p className="text-[var(--color-muted)]">
            {next ? "A few steps left before your assistant is live." : `${s.general.botName} is live and answering your visitors.`}
          </p>
        </div>

        {next && (
          <section className={`${card} sm:flex-row sm:items-center`} aria-label="Next setup step">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                Next step · {done} of {SETUP_STEPS.length} done
              </p>
              <h2 className="text-lg font-semibold">{next.title}</h2>
              <p className="text-sm text-[var(--color-muted)]">{next.description}</p>
            </div>
            <Link
              href={next.href || "/dashboard/onboarding/list"}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 text-sm font-semibold no-underline"
              style={{ color: "var(--color-on-primary)" }}
            >
              {next.href ? next.cta : "View checklist"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </section>
        )}

        <section className={card} aria-labelledby="activity-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-[var(--color-muted)]" aria-hidden />
              <h2 id="activity-title" className="font-semibold">
                Last 7 days
              </h2>
            </div>
            <Link href="/dashboard/conversations" className="text-sm font-semibold">
              All conversations
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(
              [
                ["Conversations", stats.conversations, "/dashboard/conversations"],
                ["Unanswered", stats.unanswered, "/dashboard/conversations?filter=unanswered"],
                ["Hand-offs", stats.handoffs, "/dashboard/conversations?filter=handoff"],
                ["Leads", stats.leads, "/dashboard/conversations?filter=leads"],
                [
                  "Helpful",
                  stats.helpful + stats.notHelpful ? `${Math.round((stats.helpful / (stats.helpful + stats.notHelpful)) * 100)}%` : "–",
                  "/dashboard/conversations?filter=negative",
                ],
              ] as const
            ).map(([label, value, href]) => (
              <Link key={label} href={href} className="flex flex-col rounded-xl bg-[var(--color-raised)] p-3 no-underline transition-colors hover:bg-[var(--color-bubble)]">
                <span className="text-2xl font-semibold tabular-nums">{typeof value === "number" ? value.toLocaleString("en") : value}</span>
                <span className="text-xs text-[var(--color-muted)]">{label}</span>
              </Link>
            ))}
          </div>
          {stats.conversations === 0 && (
            <p className="text-sm text-[var(--color-muted)]">No conversations yet. They appear here once visitors chat with the widget on your site.</p>
          )}
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <section className={card}>
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-[var(--color-muted)]" aria-hidden />
              <h2 className="font-semibold">Status</h2>
            </div>
            {bot.widgetSeenAt ? (
              <p className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-green-500" aria-hidden />
                <span>
                  Live on <strong>{bot.widgetSeenOrigin?.replace(/^https?:\/\//, "")}</strong>
                  <span className="text-[var(--color-muted)]"> · last seen {ago(bot.widgetSeenAt)}</span>
                </span>
              </p>
            ) : (
              <p className="flex items-start gap-2 text-sm text-[var(--color-muted)]">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--color-line)]" aria-hidden />
                {origins.length ? "Not seen on your website yet. Add the code below to your site and open it." : "Add your website under Install & security, then paste the code below."}
              </p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-[var(--color-muted)]">Allowed sites</dt>
              <dd className="m-0 min-w-0 truncate">{origins.length ? origins.map((o) => o.replace(/^https?:\/\//, "")).join(", ") : "None yet"}</dd>
              <dt className="text-[var(--color-muted)]">Languages</dt>
              <dd className="m-0">Turkish and English · default {s.general.defaultLang === "tr" ? "Turkish" : "English"}</dd>
              <dt className="text-[var(--color-muted)]">Hand-off</dt>
              <dd className="m-0 min-w-0 truncate">{s.handoff.enabled && s.handoff.email ? `To ${s.handoff.email}` : "Off"}</dd>
            </dl>
            <Link href="/dashboard/widget?section=install" className={linkButton}>
              <Globe className="h-4 w-4" aria-hidden />
              Install &amp; security
            </Link>
          </section>

          <section className={card}>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-[var(--color-muted)]" aria-hidden />
              <h2 className="font-semibold">Knowledge</h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Sources", sources.length],
                ["Pages", pages],
                ["Excerpts", chunks],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col rounded-xl bg-[var(--color-raised)] p-3">
                  <span className="text-2xl font-semibold tabular-nums">{Number(value).toLocaleString("en")}</span>
                  <span className="text-xs text-[var(--color-muted)]">{label}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-[var(--color-muted)]">
              {chunks === 0
                ? "Nothing to answer from yet, so the assistant will say it doesn't know."
                : failing
                  ? `${failing} source${failing === 1 ? "" : "s"} failed to sync. Check the Knowledge page.`
                  : "Your assistant answers only from these sources."}
            </p>
            <Link href="/dashboard/knowledge" className={linkButton}>
              <BookOpen className="h-4 w-4" aria-hidden />
              Manage knowledge
            </Link>
          </section>

          <section className={card}>
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-[var(--color-muted)]" aria-hidden />
              <h2 className="font-semibold">Assistant</h2>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-[var(--color-muted)]">Name</dt>
              <dd className="m-0">{s.general.botName}</dd>
              <dt className="text-[var(--color-muted)]">Model</dt>
              <dd className="m-0">
                {model?.label ?? s.model.id} <span className="text-[var(--color-muted)]">· {PROVIDERS.find((p) => p.id === s.model.provider)?.label}</span>
              </dd>
              <dt className="text-[var(--color-muted)]">Tone</dt>
              <dd className="m-0 capitalize">{s.persona.tone}</dd>
              <dt className="text-[var(--color-muted)]">Daily budget</dt>
              <dd className="m-0">{s.security.dailyTokenBudget.toLocaleString("en")} tokens</dd>
            </dl>
            <Link href="/dashboard/widget" className={linkButton}>
              <Palette className="h-4 w-4" aria-hidden />
              Customize
            </Link>
          </section>

          <section className={card}>
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-[var(--color-muted)]" aria-hidden />
              <h2 className="font-semibold">Embed code</h2>
            </div>
            <p className="text-sm text-[var(--color-muted)]">Paste it before the closing &lt;/body&gt; tag on every page where the chat should appear.</p>
            <CopySnippet code={embedSnippet(bot.siteKey)} />
            {!next && (
              <p className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
                <CircleCheck className="h-4 w-4" aria-hidden />
                Setup complete
              </p>
            )}
          </section>
        </div>
      </div>
    </DashboardFrame>
  )
}
