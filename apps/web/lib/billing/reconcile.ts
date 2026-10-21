import {
  applyBillingEvent,
  listStoredSubscriptions,
  maskPII,
  organizationForCustomer,
  type Db,
  type Subscription,
  type SubscriptionEventType,
  type SubscriptionStatus,
} from "@apex/db"
import type { BillingProvider, NormalizedSubscription, ProviderSubscription } from "./types.ts"

// Nightly reconciliation (/api/cron/billing-reconcile): the backstop for webhooks that never arrived
// or never applied. Every live subscription at the provider is compared with app.subscriptions, and so
// is every live one we store that the provider no longer lists. A difference is fixed by applying what
// the provider holds now as an event through applyBillingEvent, so it takes the same checks as a
// webhook (customer, subscription, transition), the same downgrade and cancellation rules and the
// same audit entry. Its time is the provider's own updated_at: a webhook for anything later still
// applies on top, and one for anything earlier is stale by then. What can't be fixed (a subscription
// no workspace claims, a rejected transition, one the provider doesn't know) is only reported, in
// app.job_runs, for /admin/system.

/** Statuses the provider is asked for; canceled is final, and the stored ones are checked one by one. */
export const LIVE_STATUSES: SubscriptionStatus[] = ["active", "trialing", "past_due", "paused"]
/** Differences kept in a run's result; the counts cover the rest. */
export const RECONCILE_REPORT_LIMIT = 50

export type DriftField = "subscription" | "status" | "plan" | "interval" | "period" | "cancelAtPeriodEnd"

export type DriftOutcome =
  /** Applied: app.subscriptions now matches the provider. */
  | "fixed"
  /** A webhook stored something newer while the run was reading; nothing written. */
  | "stale"
  /** applyBillingEvent refused it (e.g. a second live subscription, an impossible transition). */
  | "rejected"
  /** A live subscription at the provider that no workspace of ours claims. */
  | "unmatched"
  /** A live subscription we store that the provider doesn't have. */
  | "missing"
  | "failed"

export interface Drift {
  organizationId: string | null
  subscriptionId: string
  fields: DriftField[]
  outcome: DriftOutcome
  /** Stored → provider, e.g. "active → canceled". */
  change?: string
  detail?: string
}

export interface ReconcileResult {
  /** Live subscriptions the provider listed (ours or not). */
  providerLive: number
  /** Live subscriptions stored. */
  storedLive: number
  matched: number
  fixed: number
  /** Differences left as they are: stale, rejected, unmatched, missing or failed. */
  unresolved: number
  /** The differences, fixed or not, up to RECONCILE_REPORT_LIMIT. */
  drifts: Drift[]
}

export interface ReconcileDeps {
  db: Db
  provider: BillingProvider
  /** After a fix changed a workspace's billing: sends the billing emails now due. */
  notify?: (organizationIds: string[]) => Promise<unknown>
}

const errorText = (err: unknown) => maskPII(err instanceof Error ? err.message : String(err)).slice(0, 300)

/** What the subscription will be on once a scheduled change applies: a downgrade is stored as one. */
function target(s: Pick<Subscription, "plan" | "interval" | "scheduledChange">) {
  const c = s.scheduledChange
  return c?.action === "change" ? { plan: c.plan ?? s.plan, interval: c.interval ?? s.interval } : { plan: s.plan, interval: s.interval }
}

/**
 * Where the stored subscription and the provider's disagree, in what applyBillingEvent would store.
 * Empty when they agree. A canceled one at both ends agrees whatever else it says.
 */
export function subscriptionDrift(stored: Subscription | null, live: NormalizedSubscription): DriftField[] {
  if (!stored || stored.providerSubscriptionId !== live.providerSubscriptionId) return stored?.status === "canceled" && live.status === "canceled" ? [] : ["subscription"]
  if (stored.status !== live.status) return ["status"]
  if (live.status === "canceled") return []
  const fields: DriftField[] = []
  // compared where each is headed: a downgrade stored as a scheduled change matches the provider's lower items
  const [a, b] = [target(stored), target(live)]
  if (a.plan !== b.plan) fields.push("plan")
  if (a.interval !== b.interval) fields.push("interval")
  if (live.currentPeriodEnd && live.currentPeriodEnd.getTime() !== stored.currentPeriodEnd.getTime()) fields.push("period")
  if (live.cancelAtPeriodEnd !== stored.cancelAtPeriodEnd) fields.push("cancelAtPeriodEnd")
  return fields
}

const EVENT_FOR: Record<SubscriptionStatus, SubscriptionEventType> = {
  trialing: "subscription.updated",
  active: "subscription.updated",
  past_due: "subscription.updated",
  paused: "subscription.updated",
  canceled: "subscription.canceled",
}

/** Compares every live subscription at the provider and every live one stored, and fixes what differs. */
export async function reconcileSubscriptions({ db, provider, notify }: ReconcileDeps, runId: string = new Date().toISOString()): Promise<ReconcileResult> {
  const stored = await listStoredSubscriptions(db, provider.id)
  const byOrg = new Map(stored.map((s) => [s.organizationId, s]))
  const bySub = new Map(stored.map((s) => [s.providerSubscriptionId, s]))
  const live = await provider.listSubscriptions(LIVE_STATUSES)

  const result: ReconcileResult = { providerLive: live.length, storedLive: stored.filter((s) => s.status !== "canceled").length, matched: 0, fixed: 0, unresolved: 0, drifts: [] }
  const changed: string[] = []
  const report = (d: Drift) => {
    if (d.outcome === "fixed") result.fixed++
    else result.unresolved++
    if (result.drifts.length < RECONCILE_REPORT_LIMIT) result.drifts.push(d)
  }

  async function check(p: ProviderSubscription) {
    const id = p.providerSubscriptionId
    const s = p.subscription
    // not one of our plan prices: someone else's product on the same Paddle account
    if (!s) return
    // the workspace we store it for; failing that, the one its signed custom data names. Never its
    // customer alone, as for webhooks (lib/billing/webhook.ts): that would let an unsigned checkout in
    const organizationId = bySub.get(id)?.organizationId ?? p.organizationId
    if (!organizationId) {
      const claimed = p.customerId ? await organizationForCustomer(db, provider.id, p.customerId) : null
      return report({ organizationId: claimed, subscriptionId: id, fields: ["subscription"], outcome: "unmatched", detail: claimed ? "unsigned: its customer is this workspace's" : undefined })
    }
    const current = byOrg.get(organizationId) ?? null
    const fields = subscriptionDrift(current, s)
    if (!fields.length) return void result.matched++
    const change = `${current ? `${current.plan}/${current.interval} ${current.status}` : "none"} → ${s.plan}/${s.interval} ${s.status}`
    try {
      const { providerUpdatedAt, ...subscription } = s
      const applied = await db.transaction((tx) =>
        applyBillingEvent(
          tx,
          { provider: provider.id, eventId: `reconcile:${runId}:${id}`, organizationId, occurredAt: providerUpdatedAt, type: EVENT_FOR[s.status], subscription },
          new Date(),
        ),
      )
      if (applied.outcome === "applied") {
        changed.push(organizationId)
        report({ organizationId, subscriptionId: id, fields, outcome: "fixed", change })
      } else if (applied.outcome === "rejected") report({ organizationId, subscriptionId: id, fields, outcome: "rejected", change, detail: `${applied.reason}: ${applied.message}` })
      else if (applied.outcome === "unknown_organization") report({ organizationId, subscriptionId: id, fields, outcome: "unmatched", change })
      else report({ organizationId, subscriptionId: id, fields, outcome: "stale", change, detail: applied.outcome === "ignored" ? applied.reason : undefined })
    } catch (err) {
      report({ organizationId, subscriptionId: id, fields, outcome: "failed", change, detail: errorText(err) })
    }
  }

  const listed = new Set<string>()
  for (const p of live) {
    listed.add(p.providerSubscriptionId)
    await check(p)
  }
  // live here, not live there: canceled (or paused/past_due outside the list) without a webhook
  for (const s of stored) {
    if (s.status === "canceled" || listed.has(s.providerSubscriptionId)) continue
    try {
      const p = await provider.fetchSubscription(s.providerSubscriptionId)
      if (p) await check(p)
      else report({ organizationId: s.organizationId, subscriptionId: s.providerSubscriptionId, fields: ["subscription"], outcome: "missing" })
    } catch (err) {
      report({ organizationId: s.organizationId, subscriptionId: s.providerSubscriptionId, fields: [], outcome: "failed", detail: errorText(err) })
    }
  }

  if (changed.length && notify) await notify(changed).catch((err: unknown) => console.error("[billing] reconcile: couldn't send the billing emails", errorText(err)))
  return result
}
