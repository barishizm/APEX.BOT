import { CircleAlert, CircleCheck, CircleX, RefreshCw } from "lucide-react"
import { LOCALE_META, localizePath, type Locale } from "@/lib/i18n"
import { getDictionary } from "@/lib/i18n/server"
import type { ServiceCheck, ServiceState } from "@/lib/status"
import { cn } from "@/lib/utils"

// The state's word is set in this color too: the 700 shades are the lightest that keep 4.5:1 on white
const STATE: Record<ServiceState, { icon: typeof CircleCheck; color: string }> = {
  operational: { icon: CircleCheck, color: "text-[var(--color-success)]" },
  degraded: { icon: CircleAlert, color: "text-[var(--color-warning)]" },
  down: { icon: CircleX, color: "text-[var(--color-danger)]" },
}

export function SystemStatus({ locale, checks, checkedAt }: { locale: Locale; checks: ServiceCheck[]; checkedAt: Date }) {
  const t = getDictionary(locale).status
  const overall: ServiceState = checks.some((c) => c.state === "down")
    ? "down"
    : checks.some((c) => c.state === "degraded")
      ? "degraded"
      : "operational"
  const Overall = STATE[overall].icon

  return (
    <div className="w-full max-w-2xl">
      <p className="eyebrow mb-3">{t.eyebrow}</p>
      <div
        role="status"
        className={cn(
          "flex items-center gap-3 rounded-xl border p-5",
          overall === "operational" && "border-[var(--color-success)]/30 bg-[var(--color-success)]/5",
          overall === "degraded" && "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5",
          overall === "down" && "border-[var(--color-danger)]/40 bg-[var(--color-danger)]/5",
        )}
      >
        <Overall className={cn("h-6 w-6 shrink-0", STATE[overall].color)} aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t.summary[overall]}</h1>
      </div>

      <ul className="mt-6 divide-y divide-[var(--color-line)] overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-raised)]">
        {checks.map((check) => {
          const s = STATE[check.state]
          const service = t.services[check.id]
          return (
            <li key={check.id} className="flex items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{service.name}</p>
                <p className="text-sm text-[var(--color-muted)]">{check.detail ? t.details[check.detail] : service.description}</p>
              </div>
              {check.latencyMs !== null && (
                <span className="font-mono text-xs text-[var(--color-muted)] max-sm:hidden">{check.latencyMs} ms</span>
              )}
              <span className={cn("flex items-center gap-1.5 text-sm font-medium", s.color)}>
                <s.icon className="h-4 w-4" aria-hidden />
                {t.states[check.state]}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-muted)]">
        <span>
          {t.checkedAt}{" "}
          <time dateTime={checkedAt.toISOString()}>
            {checkedAt.toLocaleString(LOCALE_META[locale].intl, { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" })} UTC
          </time>
        </span>
        <a href={localizePath("/status", locale)} className="inline-flex items-center gap-1.5 font-medium text-[var(--color-text)] no-underline hover:opacity-70">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          {t.checkAgain}
        </a>
      </div>
    </div>
  )
}
