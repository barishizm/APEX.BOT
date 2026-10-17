import { missingMigrations } from "@apex/db"
import { db } from "@/lib/db"
import { apiUrl } from "@/lib/site"

export type ServiceState = "operational" | "degraded" | "down"

export type ServiceId = "dashboard" | "database" | "chat" | "widget"
// Shown instead of the description when something is off; the page translates these
export type ServiceDetail = "timeout" | "unreachable" | "migrations" | "syncDelayed"

export interface ServiceCheck {
  id: ServiceId
  state: ServiceState
  latencyMs: number | null
  detail?: ServiceDetail
}

const TIMEOUT_MS = 4000
// Slower than this still works, but visitors will notice
const SLOW_MS = 1500

async function timed(fn: (signal: AbortSignal) => Promise<ServiceDetail | void>) {
  const started = performance.now()
  try {
    const detail = await fn(AbortSignal.timeout(TIMEOUT_MS))
    const latencyMs = Math.round(performance.now() - started)
    return { state: latencyMs > SLOW_MS ? ("degraded" as const) : ("operational" as const), latencyMs, detail: detail || undefined }
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")
    return { state: "down" as const, latencyMs: null, detail: timeout ? ("timeout" as const) : ("unreachable" as const) }
  }
}

function withTimeout<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(Object.assign(new Error("timeout"), { name: "TimeoutError" }))
    if (signal.aborted) return onAbort()
    signal.addEventListener("abort", onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort))
  })
}

// Live checks, run on every visit. Details are generic on purpose: this page is public.
export async function checkServices(): Promise<ServiceCheck[]> {
  const api = apiUrl()
  const [database, chat, widget] = await Promise.all([
    timed(async (signal) => {
      const missing = await withTimeout(missingMigrations(db()), signal)
      if (missing.length) return "migrations"
    }),
    timed(async (signal) => {
      const res = await fetch(`${api}/health`, { signal, cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.ok) throw new Error(`health ${res.status}`)
      if (body.botSync === "failing") return "syncDelayed"
    }),
    timed(async (signal) => {
      const res = await fetch(`${api}/widget.js`, { method: "HEAD", signal, cache: "no-store" })
      if (!res.ok) throw new Error(`widget ${res.status}`)
    }),
  ])
  return [
    { id: "dashboard", state: "operational", latencyMs: null },
    {
      id: "database",
      ...database,
      state: database.state === "operational" && database.detail ? "degraded" : database.state,
    },
    {
      id: "chat",
      ...chat,
      state: chat.state === "operational" && chat.detail ? "degraded" : chat.state,
    },
    { id: "widget", ...widget },
  ]
}

// Each check costs a DB query and two API round-trips (~1s). Visitors within this
// window share one result, and concurrent visits wait on the same run.
const CACHE_MS = 30_000
let cached: { at: number; result: Promise<{ checks: ServiceCheck[]; checkedAt: Date }> } | null = null

export function cachedCheckServices() {
  const now = Date.now()
  if (!cached || now - cached.at > CACHE_MS) {
    cached = { at: now, result: checkServices().then((checks) => ({ checks, checkedAt: new Date() })) }
  }
  return cached.result
}
