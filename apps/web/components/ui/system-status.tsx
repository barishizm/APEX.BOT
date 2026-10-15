import { CircleAlert, CircleCheck, CircleX, RefreshCw } from "lucide-react"
import type { ServiceCheck, ServiceState } from "@/lib/status"
import { cn } from "@/lib/utils"

const STATE: Record<ServiceState, { label: string; icon: typeof CircleCheck; color: string }> = {
  operational: { label: "Operational", icon: CircleCheck, color: "text-green-600 dark:text-green-400" },
  degraded: { label: "Degraded", icon: CircleAlert, color: "text-amber-600 dark:text-amber-400" },
  down: { label: "Unavailable", icon: CircleX, color: "text-red-600 dark:text-red-400" },
}

const SUMMARY: Record<ServiceState, string> = {
  operational: "All systems operational",
  degraded: "Some systems are slow",
  down: "Some systems are unavailable",
}

export function SystemStatus({ checks, checkedAt }: { checks: ServiceCheck[]; checkedAt: Date }) {
  const overall: ServiceState = checks.some((c) => c.state === "down")
    ? "down"
    : checks.some((c) => c.state === "degraded")
      ? "degraded"
      : "operational"
  const Overall = STATE[overall].icon

  return (
    <div className="w-full max-w-2xl">
      <p className="eyebrow mb-3">System status</p>
      <div
        role="status"
        className={cn(
          "flex items-center gap-3 rounded-xl border p-5",
          overall === "operational" && "border-green-600/30 bg-green-600/5",
          overall === "degraded" && "border-amber-500/40 bg-amber-500/5",
          overall === "down" && "border-red-600/40 bg-red-600/5",
        )}
      >
        <Overall className={cn("h-6 w-6 shrink-0", STATE[overall].color)} aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{SUMMARY[overall]}</h1>
      </div>

      <ul className="mt-6 divide-y divide-[var(--color-line)] overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-raised)]">
        {checks.map((check) => {
          const s = STATE[check.state]
          return (
            <li key={check.name} className="flex items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{check.name}</p>
                <p className="text-sm text-[var(--color-muted)]">{check.detail ?? check.description}</p>
              </div>
              {check.latencyMs !== null && (
                <span className="font-mono text-xs text-[var(--color-muted)] max-sm:hidden">{check.latencyMs} ms</span>
              )}
              <span className={cn("flex items-center gap-1.5 text-sm font-medium", s.color)}>
                <s.icon className="h-4 w-4" aria-hidden />
                {s.label}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-muted)]">
        <span>
          Checked live at{" "}
          <time dateTime={checkedAt.toISOString()}>
            {checkedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" })} UTC
          </time>
        </span>
        <a href="/status" className="inline-flex items-center gap-1.5 font-medium text-[var(--color-text)] no-underline hover:opacity-70">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Check again
        </a>
      </div>
    </div>
  )
}
