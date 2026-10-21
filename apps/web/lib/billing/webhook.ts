import {
  AdminError,
  applyBillingEvent,
  finishBillingEvent,
  getBillingEvent,
  inSavepoints,
  hitRateLimit,
  maskPII,
  organizationForCustomer,
  organizationForSubscription,
  recordBillingEvent,
  startBillingEvent,
  type ApplicableBillingEvent,
  type Db,
  type Queryable,
  type RateLimit,
  type SubscriptionEventType,
} from "@apex/db"
import { BillingError, type BillingEvent, type BillingProvider } from "./types.ts"

// The provider's webhook endpoint (ADR 0003, "Adapter and data"). In order:
//   1. size and rate limits, before anything is parsed;
//   2. the signature over the raw bytes (verifyWebhook: HMAC, constant-time, 5 minutes);
//   3. the event goes into app.billing_events by its event id, outside any transaction, so it is kept
//      even when applying it fails; a delivery of an event already applied stops here;
//   4. it is applied (applyBillingEvent) in one transaction that also marks it processed. Events for
//      one workspace are serialised on its row lock, anything not newer than what is stored
//      (provider_updated_at = the event's occurred_at) is dropped, so late or reordered deliveries
//      can't undo a newer state, and an invalid transition is rejected and kept unprocessed. A failure
//      rolls the work back and is recorded (error, attempts) for a replay.
// The provider gets a 2xx once the event is stored, failed or not: the inbox, not the provider's
// retries, is what brings a failed event back. Processing that outlasts the budget finishes after the
// response. Nothing from the body is logged: payloads hold names, emails and addresses.

/** Paddle's events are a few KB; anything this large isn't one. */
export const MAX_BODY_BYTES = 256 * 1024
/** Per sending address; Paddle sends from a handful of addresses, a few events per change. */
export const WEBHOOK_RATE_LIMIT: RateLimit = { max: 300, windowSeconds: 60 }
/** Paddle wants an answer within 5 seconds; the rest of the work moves after the response. */
export const PROCESS_BUDGET_MS = 4000

export interface WebhookDeps {
  db: Db
  /** Null while billing is off. */
  provider: BillingProvider | null
  /** The client address (requestMeta), for the rate limit; null shares one bucket. */
  ip: string | null
  /** Keeps work alive after the response (next/server `after`). */
  defer?: (work: Promise<unknown>) => void
  /** After an event changed a workspace's billing: sends the billing emails now due (lib/billing/notices.ts). */
  notify?: Notify
  now?: () => Date
  rateLimit?: RateLimit
  budgetMs?: number
}

export type WebhookOutcome =
  /** Stored state changed (or there was nothing to store for a known workspace). */
  | "applied"
  /** Older than what is stored; nothing written. */
  | "stale"
  /** An event type or price that isn't ours to act on. */
  | "ignored"
  /** Already applied, or being applied by a concurrent delivery. */
  | "duplicate"
  /** No workspace for it; kept unprocessed, with the reason, for the admin area. */
  | "unknown_organization"
  /** Didn't match the workspace's own customer; kept unprocessed for the admin area. */
  | "customer_mismatch"
  /** Not a valid transition from the stored state (applyBillingEvent); kept unprocessed with the reason. */
  | "rejected"
  | "failed"
  /** Still running when the budget ran out; finishes after the response. */
  | "deferred"

type Applied = { outcome: Exclude<WebhookOutcome, "duplicate" | "failed" | "deferred">; error?: string; organizationId?: string }
type Notify = (organizationId: string) => Promise<unknown>

const json = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) => Response.json(body, { status, headers })

// event ids and types are the provider's own identifiers, never personal data
function log(level: "info" | "warn" | "error", message: string, fields: Record<string, string | number | null | undefined>) {
  console[level](`[billing] webhook: ${message}`, fields)
}

/** The body as text, or null once it passes `max` bytes, whatever Content-Length said. */
async function readBody(request: Request, max: number): Promise<string | null> {
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString("utf8")
}

/** event_id, event_type and occurred_at: what the inbox needs before the event is read in full. */
function envelope(payload: unknown) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null
  const p = payload as Record<string, unknown>
  const eventId = typeof p.event_id === "string" && p.event_id.length <= 200 ? p.event_id : null
  const eventType = typeof p.event_type === "string" && p.event_type.length <= 200 ? p.event_type : null
  const occurredAt = typeof p.occurred_at === "string" ? new Date(p.occurred_at) : null
  if (!eventId || !eventType || !occurredAt || Number.isNaN(occurredAt.getTime())) return null
  return { eventId, eventType, occurredAt }
}

export async function handleBillingWebhook(request: Request, deps: WebhookDeps): Promise<Response> {
  const now = deps.now ?? (() => new Date())
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, { Allow: "POST" })
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return json(413, { error: "too_large" })

  const over = await hitRateLimit(deps.db, `billing-webhook:${deps.ip ?? "unknown"}`, deps.rateLimit ?? WEBHOOK_RATE_LIMIT)
  if (over) {
    log("warn", "rate limited", { ip: deps.ip })
    return json(429, { error: "rate_limited" }, { "Retry-After": String(over.retryAfterSeconds) })
  }

  // without the secret nothing can be verified; a 5xx makes the provider retry once billing is on
  const provider = deps.provider
  if (!provider) return json(503, { error: "billing_disabled" })

  const raw = await readBody(request, MAX_BODY_BYTES)
  if (raw === null) return json(413, { error: "too_large" })
  if (!provider.verifyWebhook(raw, request.headers, now())) {
    log("warn", "invalid signature", { ip: deps.ip })
    return json(401, { error: "invalid_signature" })
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return json(400, { error: "invalid_payload" })
  }
  const env = envelope(payload)
  if (!env) return json(400, { error: "invalid_payload" })

  const stored = await recordBillingEvent(deps.db, { provider: provider.id, ...env, payload })
  if (stored.processed) {
    log("info", "already processed", { eventId: env.eventId, eventType: env.eventType })
    return json(200, { ok: true, outcome: "duplicate" })
  }

  const work = processBillingEvent(deps.db, provider, stored.id, payload, now, deps.notify)
  let timer: ReturnType<typeof setTimeout> | undefined
  const budget = new Promise<"deferred">((resolve) => (timer = setTimeout(() => resolve("deferred"), deps.budgetMs ?? PROCESS_BUDGET_MS)))
  const outcome = await Promise.race([work, budget])
  clearTimeout(timer)
  if (outcome === "deferred") {
    deps.defer?.(work)
    log("warn", "processing continues after the response", { eventId: env.eventId, eventType: env.eventType })
  }
  return json(200, { ok: true, outcome })
}

/**
 * Applies a stored event in one transaction and marks it processed; on failure records the error and
 * the attempt. Never throws, and safe to run again on the same event (a replay).
 */
export async function processBillingEvent(
  db: Db,
  provider: BillingProvider,
  id: string,
  payload: unknown,
  now: () => Date = () => new Date(),
  notify?: Notify,
): Promise<WebhookOutcome> {
  let event: BillingEvent | null = null
  try {
    event = provider.normalizeEvent(payload)
    const e = event
    const result = await db.transaction(async (tx) => {
      // locks the inbox row: a concurrent delivery of the same event waits here, then finds it processed
      if ((await startBillingEvent(tx, id)) === null) return null
      const applied = await applyEvent(tx, e, now())
      await finishBillingEvent(tx, id, applied.error ?? null)
      return applied
    })
    if (!result) return "duplicate"
    log(result.error ? "warn" : "info", result.outcome, { eventId: e.eventId, eventType: e.providerType, organizationId: e.organizationId })
    // the daily cron sends whatever this misses
    if (result.outcome === "applied" && result.organizationId && notify)
      await notify(result.organizationId).catch((err: unknown) =>
        log("error", "couldn't send the billing emails", { eventId: e.eventId, error: maskPII(err instanceof Error ? err.message : String(err)).slice(0, 300) }),
      )
    return result.outcome
  } catch (err) {
    // stored for the admin area and logged, so masked like every other error that may quote a value
    const message = maskPII(err instanceof BillingError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : String(err))
    log("error", "failed", { eventId: event?.eventId ?? null, eventType: event?.providerType ?? null, error: message.slice(0, 300) })
    // the transaction rolled back its attempt; count it here with the error
    try {
      await db.transaction(async (tx) => {
        if ((await startBillingEvent(tx, id)) !== null) await finishBillingEvent(tx, id, message)
      })
    } catch (recordErr) {
      log("error", "couldn't record the failure", { id, error: recordErr instanceof Error ? recordErr.message.slice(0, 300) : null })
    }
    return "failed"
  }
}

export interface ReplayResult {
  outcome: WebhookOutcome
  /** Left unprocessed: why, as stored. */
  error: string | null
  attempts: number
  /** Workspaces whose billing changed; send their billing emails once the replay commits. */
  changed: string[]
}

/**
 * Applies a stored event again, for the replay button on /admin/billing. It runs in the caller's
 * transaction, with savepoints standing in for processBillingEvent's own transactions, so the replay
 * and its audit entry commit or roll back together.
 */
export async function replayBillingEvent(tx: Queryable, provider: BillingProvider, id: string, now: () => Date = () => new Date()): Promise<ReplayResult> {
  const stored = await getBillingEvent(tx, id)
  if (!stored) throw new AdminError("not_found", "No such webhook")
  if (stored.processedAt) throw new AdminError("invalid_input", "This webhook was processed already")
  if (stored.provider !== provider.id) throw new AdminError("invalid_input", `This webhook came from ${stored.provider}, which isn't the configured provider`)
  const changed: string[] = []
  const outcome = await processBillingEvent(inSavepoints(tx), provider, id, stored.payload, now, async (organizationId) => changed.push(organizationId))
  const { rows } = await tx.query<{ error: string | null; attempts: number }>("select error, attempts from app.billing_events where id = $1", [id])
  return { outcome, error: rows[0]?.error ?? null, attempts: rows[0]?.attempts ?? 0, changed }
}

const SUBSCRIPTION_EVENT: Record<Extract<BillingEvent, { type: "subscription.updated" }>["reason"], SubscriptionEventType> = {
  created: "subscription.created",
  activated: "subscription.activated",
  updated: "subscription.updated",
  trialing: "subscription.updated",
  resumed: "subscription.updated",
  past_due: "subscription.past_due",
  paused: "subscription.paused",
  canceled: "subscription.canceled",
}

/** Our normalised event as applyBillingEvent takes it, once the workspace is known. */
function toApplicable(event: Exclude<BillingEvent, { type: "ignored" }>, organizationId: string): ApplicableBillingEvent {
  const base = { provider: event.provider, eventId: event.eventId, organizationId, occurredAt: event.occurredAt }
  switch (event.type) {
    case "subscription.updated": {
      const { providerUpdatedAt: _, ...subscription } = event.subscription
      return { ...base, type: SUBSCRIPTION_EVENT[event.reason], subscription }
    }
    case "customer.updated":
      return { ...base, type: "customer.updated", customerId: event.customerId }
    default:
      return {
        ...base,
        type: event.type === "payment.succeeded" ? "transaction.completed" : "transaction.payment_failed",
        customerId: event.customerId,
        subscriptionId: event.subscriptionId,
      }
  }
}

async function applyEvent(tx: Queryable, event: BillingEvent, now: Date): Promise<Applied> {
  if (event.type === "ignored") return { outcome: "ignored" }

  const subscriptionId = event.type === "subscription.updated" ? event.subscription.providerSubscriptionId : event.type === "customer.updated" ? null : event.subscriptionId
  const customerId = event.type === "subscription.updated" ? event.subscription.customerId : event.customerId
  // custom_data from the checkout; failing that, the workspace we already store the subscription or customer for
  const organizationId =
    event.organizationId ??
    (subscriptionId ? await organizationForSubscription(tx, event.provider, subscriptionId) : null) ??
    (customerId ? await organizationForCustomer(tx, event.provider, customerId) : null)
  if (!organizationId) return { outcome: "unknown_organization", error: "unknown_organization: no valid custom_data.organization_id and no stored subscription" }

  const result = await applyBillingEvent(tx, toApplicable(event, organizationId), now)
  switch (result.outcome) {
    case "applied":
      return { outcome: "applied", organizationId }
    case "stale":
    case "ignored":
      return { outcome: result.outcome }
    case "unknown_organization":
      return { outcome: "unknown_organization", error: `unknown_organization: ${organizationId} doesn't exist` }
    case "rejected":
      // checkouts prefill the workspace's customer, so another one means custom_data was tampered with
      // or copied; applying it could replace the workspace's subscription with someone else's
      return { outcome: result.reason === "customer_mismatch" ? "customer_mismatch" : "rejected", error: `${result.reason}: ${result.message}` }
  }
}
