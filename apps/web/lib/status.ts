import { maskPII, missingMigrations } from "@apex/db"
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

/** A check with what went wrong, for /admin/system only: the public page never shows `error`. */
export interface ServiceProbe extends ServiceCheck {
  error?: string
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
    const error = maskPII(err instanceof Error ? `${err.message}${err.cause instanceof Error ? ` (${err.cause.message})` : ""}` : String(err)).slice(0, 300)
    return { state: "down" as const, latencyMs: null, detail: timeout ? ("timeout" as const) : ("unreachable" as const), error }
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
  return (await probeServices()).map(({ error: _error, ...check }) => check)
}

async function probeServices(): Promise<ServiceProbe[]> {
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

// ---------- /admin/system ----------

/** The header the API's /health/details checks against APEX_HEALTH_TOKEN (set on both apps). */
export const HEALTH_TOKEN_HEADER = "x-apex-health-token"

/** What the chat API reports on /health/details (apps/api/src/server.ts); every part may be missing on an older API. */
export interface ApiHealthDetails {
  uptimeSeconds?: number
  botSync?: "starting" | "ok" | "failing" | "off"
  semanticSearch?: "ok" | "paused" | "off"
  sync?: { status: string; lastAttemptAt: string | null; lastOkAt: string | null; lastError: string | null; bots: number; intervalMs: number } | null
  indexer?: { model: string; pending: number; active: string | null; lastDoneAt: string | null; lastError: { tenant: string; at: string; error: string } | null } | null
  topics?: { running: boolean; failing: boolean; lastRunAt: string | null; lastOkAt: string | null; lastSaved: number; intervalMs: number } | null
  retention?: { at: string; ok: boolean; deleted: number; error: string | null } | null
  runtime?: {
    nodeEnv: string | null
    version: string | null
    commit: string | null
    model: string
    embeddings: string | null
    topicModel: string | null
    env: Record<string, boolean>
  }
}

export type ApiDetailsResult =
  | { state: "ok"; latencyMs: number; data: ApiHealthDetails }
  /** APEX_HEALTH_TOKEN isn't set on the web app */
  | { state: "unconfigured" }
  /** 404: the API has no token, a different one, or predates the route */
  | { state: "rejected" }
  | { state: "unreachable"; error: string }

async function apiDetails(): Promise<ApiDetailsResult> {
  const token = process.env.APEX_HEALTH_TOKEN
  if (!token) return { state: "unconfigured" }
  const started = performance.now()
  try {
    const res = await fetch(`${apiUrl()}/health/details`, { headers: { [HEALTH_TOKEN_HEADER]: token }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" })
    if (res.status === 404) return { state: "rejected" }
    if (!res.ok) return { state: "unreachable", error: `HTTP ${res.status}` }
    return { state: "ok", latencyMs: Math.round(performance.now() - started), data: (await res.json()) as ApiHealthDetails }
  } catch (err) {
    return { state: "unreachable", error: maskPII(err instanceof Error ? err.message : String(err)).slice(0, 300) }
  }
}

/** The status page's checks with their errors, and the API's own report. Not cached: staff want it live. */
export async function checkSystem(): Promise<{ checks: ServiceProbe[]; api: ApiDetailsResult; checkedAt: Date }> {
  const [checks, api] = await Promise.all([probeServices(), apiDetails()])
  return { checks, api, checkedAt: new Date() }
}
