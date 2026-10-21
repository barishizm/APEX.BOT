import type { Db, Queryable } from "./db.ts"
import { writeAudit } from "./admin.ts"
import { BOT_SERVING_SQL } from "./bots.ts"
import { featureEnabled, flagEnabled, readPlatformSettings } from "./platform-settings.ts"
import { OVERAGE_BLOCK, OVERAGE_CAP_MAX_CENTS, PLANS, PLAN_LIMITS, replyWindow, type Plan, type ReplyWindow } from "./plans.ts"

// Subscriptions, plan overrides, webhook inbox and reply usage (docs/adr/0003-billing.md,
// migrations/0035_billing.sql). app.organizations.plan is a cache of effectivePlan(); every write
// here that can change it recomputes it in the same transaction.

export type BillingProviderId = "paddle" | "iyzico"
export type PaidPlan = Exclude<Plan, "free">
export type BillingInterval = "month" | "year"
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "paused" | "canceled"

/** Grace after the first failed renewal before the workspace drops to Free (ADR 0003 (f)). */
export const GRACE_DAYS = 7

export interface ScheduledChange {
  action: "change" | "cancel" | "pause"
  plan?: PaidPlan
  interval?: BillingInterval
  effectiveAt: string
}

export interface Subscription {
  organizationId: string
  provider: BillingProviderId
  providerSubscriptionId: string
  plan: PaidPlan
  interval: BillingInterval
  status: SubscriptionStatus
  currentPeriodStart: Date
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
  scheduledChange: ScheduledChange | null
  graceUntil: Date | null
  providerUpdatedAt: Date
}

export interface PlanOverride {
  plan: PaidPlan
  startsAt: Date
  endsAt: Date
  revokedAt: Date | null
}

export type PlanSource = "subscription" | "override" | "free"

const rank = (plan: Plan) => PLANS.indexOf(plan)

type GrantFields = Pick<Subscription, "plan" | "status" | "graceUntil" | "cancelAtPeriodEnd" | "currentPeriodEnd" | "scheduledChange">

/**
 * The paid plan the subscription grants at `now`, or null. A scheduled change that is due applies
 * even before the provider's event for it arrives (backstop for a lost webhook).
 */
export function subscriptionPlanAt(sub: GrantFields, now: Date): PaidPlan | null {
  const change = sub.scheduledChange
  const due = change !== null && now >= new Date(change.effectiveAt)
  switch (sub.status) {
    case "trialing":
    case "active":
      // backstop for a lost "canceled" webhook: a cancellation at period end stops there
      if (sub.cancelAtPeriodEnd && now >= sub.currentPeriodEnd) return null
      if (!change || !due) return sub.plan
      return change.action === "change" ? (change.plan ?? sub.plan) : null
    case "past_due":
      return sub.graceUntil !== null && now < sub.graceUntil ? sub.plan : null
    case "canceled":
      // canceled mid-period while paid up (applyBillingEvent): the paid period runs out first
      return change?.action === "cancel" && !due ? sub.plan : null
    default:
      return null
  }
}

/** Whether the subscription still grants a plan at `now`. */
export function subscriptionGrants(sub: GrantFields, now: Date) {
  return subscriptionPlanAt(sub, now) !== null
}

/** Where the workspace's reply windows count from: the granting subscription's period start, else calendar months. */
export function quotaAnchor(sub: (GrantFields & Pick<Subscription, "currentPeriodStart">) | null, now: Date): Date | null {
  return sub && subscriptionGrants(sub, now) ? sub.currentPeriodStart : null
}

/**
 * The plan a workspace is entitled to, in order: a running override (the highest, if several), then
 * what the subscription grants (trialing or active; past_due within its grace), then Free.
 */
export function effectivePlan(sub: Subscription | null, overrides: PlanOverride[], now: Date): { plan: Plan; source: PlanSource } {
  let override: PaidPlan | null = null
  for (const o of overrides) {
    const running = !o.revokedAt && o.startsAt <= now && now < o.endsAt
    if (running && (!override || rank(o.plan) > rank(override))) override = o.plan
  }
  if (override) return { plan: override, source: "override" }
  const paid = sub ? subscriptionPlanAt(sub, now) : null
  return paid ? { plan: paid, source: "subscription" } : { plan: "free", source: "free" }
}

const SUBSCRIPTION_COLUMNS = `organization_id as "organizationId", provider, provider_subscription_id as "providerSubscriptionId",
  plan, "interval", status, current_period_start as "currentPeriodStart", current_period_end as "currentPeriodEnd",
  cancel_at_period_end as "cancelAtPeriodEnd", scheduled_change as "scheduledChange", grace_until as "graceUntil",
  provider_updated_at as "providerUpdatedAt"`

export async function getSubscription(q: Queryable, organizationId: string): Promise<Subscription | null> {
  const { rows } = await q.query<Subscription>(`select ${SUBSCRIPTION_COLUMNS} from app.subscriptions where organization_id = $1`, [organizationId])
  return rows[0] ?? null
}

export interface EffectivePlanResult {
  plan: Plan
  previous: Plan
  source: PlanSource
  changed: boolean
}

/**
 * Recomputes the workspace's effective plan and writes it to app.organizations.plan. Call it inside
 * the transaction that changed the subscription or an override. A workspace with neither keeps its
 * plan (beta workspaces placed by hand).
 */
export async function refreshEffectivePlan(tx: Queryable, organizationId: string, now = new Date()): Promise<EffectivePlanResult | null> {
  const org = await tx.query<{ plan: Plan }>("select plan from app.organizations where id = $1 for update", [organizationId])
  const previous = org.rows[0]?.plan
  if (!previous) return null
  const sub = await getSubscription(tx, organizationId)
  const overrides = await tx.query<PlanOverride>(
    `select plan, starts_at as "startsAt", ends_at as "endsAt", revoked_at as "revokedAt" from app.plan_overrides where organization_id = $1`,
    [organizationId],
  )
  if (!sub && !overrides.rows.length) return { plan: previous, previous, source: "free", changed: false }
  const { plan, source } = effectivePlan(sub, overrides.rows, now)
  if (plan !== previous) await tx.query("update app.organizations set plan = $2 where id = $1", [organizationId, plan])
  return { plan, previous, source, changed: plan !== previous }
}

/** Recomputes every workspace that has a subscription or an override, each in its own transaction. Run periodically. */
export async function refreshEffectivePlans(db: Db, now = new Date()): Promise<EffectivePlanResult[]> {
  const { rows } = await db.query<{ id: string }>(
    "select organization_id as id from app.subscriptions union select organization_id from app.plan_overrides",
  )
  const changed: EffectivePlanResult[] = []
  for (const { id } of rows) {
    const result = await db.transaction((tx) => refreshEffectivePlan(tx, id, now))
    if (result?.changed) changed.push(result)
  }
  return changed
}

export async function upsertBillingCustomer(q: Queryable, input: { organizationId: string; provider: BillingProviderId; providerCustomerId: string }) {
  await q.query(
    `insert into app.billing_customers (organization_id, provider, provider_customer_id) values ($1, $2, $3)
     on conflict (organization_id) do update set provider = excluded.provider, provider_customer_id = excluded.provider_customer_id`,
    [input.organizationId, input.provider, input.providerCustomerId],
  )
}

/** The provider's customer id stored for the workspace, or null before its first checkout. */
export async function getBillingCustomerId(q: Queryable, organizationId: string): Promise<string | null> {
  const { rows } = await q.query<{ id: string }>("select provider_customer_id as id from app.billing_customers where organization_id = $1", [organizationId])
  return rows[0]?.id ?? null
}

/** Whether the workspace exists; locks it for the rest of the transaction, as upsertSubscription does. */
export async function lockOrganization(q: Queryable, organizationId: string): Promise<boolean> {
  const { rows } = await q.query("select 1 from app.organizations where id = $1 for update", [organizationId])
  return rows.length > 0
}

/** The workspace a provider subscription is stored for, or null when we have none. */
export async function organizationForSubscription(q: Queryable, provider: BillingProviderId, providerSubscriptionId: string): Promise<string | null> {
  const { rows } = await q.query<{ id: string }>(
    "select organization_id as id from app.subscriptions where provider = $1 and provider_subscription_id = $2",
    [provider, providerSubscriptionId],
  )
  return rows[0]?.id ?? null
}

/** The workspace a provider customer is stored for, or null when we have none. */
export async function organizationForCustomer(q: Queryable, provider: BillingProviderId, providerCustomerId: string): Promise<string | null> {
  const { rows } = await q.query<{ id: string }>(
    "select organization_id as id from app.billing_customers where provider = $1 and provider_customer_id = $2",
    [provider, providerCustomerId],
  )
  return rows[0]?.id ?? null
}

export type SubscriptionInput = Omit<Subscription, "graceUntil">

export type UpsertSubscriptionResult =
  | { applied: true; subscription: Subscription; plan: EffectivePlanResult }
  | { applied: false; reason: "stale" }

/**
 * Stores the provider's view of a subscription, unless what is stored is as new or newer
 * (providerUpdatedAt), and recomputes the workspace's plan. A stale "canceled" for an earlier
 * subscription never replaces the workspace's newer one. Must run in a transaction.
 */
export async function upsertSubscription(tx: Queryable, input: SubscriptionInput, now = new Date()): Promise<UpsertSubscriptionResult> {
  // serialises webhooks for one workspace; refreshEffectivePlan takes the same lock
  await tx.query("select 1 from app.organizations where id = $1 for update", [input.organizationId])
  const { rows } = await tx.query<Subscription>(
    `insert into app.subscriptions as s (organization_id, provider, provider_subscription_id, plan, "interval", status,
       current_period_start, current_period_end, cancel_at_period_end, scheduled_change, grace_until, provider_updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       case when $6 = 'past_due' then $11::timestamptz + make_interval(days => ${GRACE_DAYS}) end, $11)
     on conflict (organization_id) do update set
       provider = excluded.provider,
       provider_subscription_id = excluded.provider_subscription_id,
       plan = excluded.plan,
       "interval" = excluded."interval",
       status = excluded.status,
       current_period_start = excluded.current_period_start,
       current_period_end = excluded.current_period_end,
       cancel_at_period_end = excluded.cancel_at_period_end,
       scheduled_change = excluded.scheduled_change,
       -- grace runs from the first failure; a retry that fails again doesn't extend it
       grace_until = case when excluded.status <> 'past_due' then null
                          when s.status = 'past_due' and s.provider_subscription_id = excluded.provider_subscription_id then s.grace_until
                          else excluded.grace_until end,
       provider_updated_at = excluded.provider_updated_at
     where excluded.provider_updated_at > s.provider_updated_at
       and (s.provider_subscription_id = excluded.provider_subscription_id or s.status = 'canceled' or excluded.status <> 'canceled')
     returning ${SUBSCRIPTION_COLUMNS}`,
    [
      input.organizationId,
      input.provider,
      input.providerSubscriptionId,
      input.plan,
      input.interval,
      input.status,
      input.currentPeriodStart,
      input.currentPeriodEnd,
      input.cancelAtPeriodEnd,
      input.scheduledChange ? JSON.stringify(input.scheduledChange) : null,
      input.providerUpdatedAt,
    ],
  )
  const subscription = rows[0]
  if (!subscription) return { applied: false, reason: "stale" }
  const plan = (await refreshEffectivePlan(tx, input.organizationId, now))!
  return { applied: true, subscription, plan }
}

/** Grants a paid plan for free until `endsAt` and recomputes the plan. Must run in a transaction. */
export async function grantPlanOverride(
  tx: Queryable,
  input: { organizationId: string; plan: PaidPlan; reason: string; endsAt: Date; startsAt?: Date; grantedBy?: string | null },
  now = new Date(),
) {
  const { rows } = await tx.query<{ id: string }>(
    `insert into app.plan_overrides (organization_id, plan, reason, starts_at, ends_at, granted_by)
     values ($1, $2, $3, coalesce($4, now()), $5, $6) returning id`,
    [input.organizationId, input.plan, input.reason, input.startsAt ?? null, input.endsAt, input.grantedBy ?? null],
  )
  return { id: rows[0]!.id, plan: (await refreshEffectivePlan(tx, input.organizationId, now))! }
}

/** Ends an override early and recomputes the plan. Null when there is no running override with this id. */
export async function revokePlanOverride(tx: Queryable, overrideId: string, revokedBy: string | null, now = new Date()) {
  const { rows } = await tx.query<{ organizationId: string }>(
    `update app.plan_overrides set revoked_at = $3, revoked_by = $2
     where id = $1 and revoked_at is null and ends_at > $3 returning organization_id as "organizationId"`,
    [overrideId, revokedBy, now],
  )
  if (!rows[0]) return null
  return refreshEffectivePlan(tx, rows[0].organizationId, now)
}

// --- Applying provider events ---

export const SUBSCRIPTION_EVENT_TYPES = [
  "subscription.created",
  "subscription.updated",
  "subscription.activated",
  "subscription.past_due",
  "subscription.paused",
  "subscription.canceled",
] as const
export type SubscriptionEventType = (typeof SUBSCRIPTION_EVENT_TYPES)[number]
export type TransactionEventType = "transaction.completed" | "transaction.payment_failed"
export type BillingEventType = SubscriptionEventType | TransactionEventType | "customer.updated"

/** Who the audit log names for what applyBillingEvent changes. */
export const BILLING_AUDIT_ACTOR = "system:billing"

/** The provider's view of a subscription in an event. The period is null when the provider dropped it (Paddle does on cancellation). */
export interface SubscriptionSnapshot {
  provider: BillingProviderId
  providerSubscriptionId: string
  customerId: string
  plan: PaidPlan
  interval: BillingInterval
  status: SubscriptionStatus
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  scheduledChange: ScheduledChange | null
}

interface AppliedEventBase {
  provider: BillingProviderId
  /** The provider's event id, for the audit trail. */
  eventId: string
  /** Resolved by the caller (custom data, the stored subscription or customer). */
  organizationId: string
  /** When the provider says it happened; orders events (provider_updated_at). */
  occurredAt: Date
}

/** A verified, normalised provider event (lib/billing maps the provider's payloads onto this). */
export type ApplicableBillingEvent =
  | (AppliedEventBase & { type: SubscriptionEventType; subscription: SubscriptionSnapshot })
  | (AppliedEventBase & { type: TransactionEventType; customerId: string | null; subscriptionId: string | null })
  | (AppliedEventBase & { type: "customer.updated"; customerId: string })

export type BillingRejection =
  /** Not the customer stored for the workspace: custom data copied or tampered with. */
  | "customer_mismatch"
  /** About another subscription than the workspace's live one. */
  | "subscription_mismatch"
  /** A second subscription, or a second "created", while the workspace's is live. */
  | "subscription_exists"
  /** The event's status doesn't fit its type, or can't follow the stored status. */
  | "invalid_transition"

/** "none": no subscription yet, or a new one replacing a canceled one. */
export type TransitionFrom = SubscriptionStatus | "none"

/** Which status may follow which within one subscription. Canceled is final: paying again starts a new subscription. */
export const STATUS_TRANSITIONS: Record<TransitionFrom, readonly SubscriptionStatus[]> = {
  none: ["trialing", "active", "past_due", "paused", "canceled"],
  trialing: ["trialing", "active", "past_due", "paused", "canceled"],
  active: ["active", "past_due", "paused", "canceled"],
  past_due: ["past_due", "active", "paused", "canceled"],
  paused: ["paused", "active", "canceled"],
  canceled: ["canceled"],
}

/** What each event may come from and report, on top of STATUS_TRANSITIONS. */
export const EVENT_TRANSITIONS: Record<SubscriptionEventType, { from: readonly TransitionFrom[]; to: readonly SubscriptionStatus[] }> = {
  "subscription.created": { from: ["none"], to: ["trialing", "active"] },
  // also right after "created" with an active status; and before it, when deliveries cross
  "subscription.activated": { from: ["none", "trialing", "active"], to: ["active"] },
  "subscription.updated": { from: ["none", "trialing", "active", "past_due", "paused", "canceled"], to: ["trialing", "active", "past_due", "paused", "canceled"] },
  "subscription.past_due": { from: ["none", "trialing", "active", "past_due"], to: ["past_due"] },
  "subscription.paused": { from: ["none", "trialing", "active", "past_due", "paused"], to: ["paused"] },
  "subscription.canceled": { from: ["none", "trialing", "active", "past_due", "paused", "canceled"], to: ["canceled"] },
}

/** Whether `type` may move a subscription from `from` to `to`. */
export function isValidTransition(type: SubscriptionEventType, from: TransitionFrom, to: SubscriptionStatus): boolean {
  const rule = EVENT_TRANSITIONS[type]
  return rule.from.includes(from) && rule.to.includes(to) && STATUS_TRANSITIONS[from].includes(to)
}

export type ApplyBillingEventResult =
  | { outcome: "applied"; plan: EffectivePlanResult; subscription: Subscription | null; auditId: string | null }
  /** Not newer than what is stored; nothing written. */
  | { outcome: "stale" }
  /** Nothing to store: a subscription that never reached us without a period, or the late end of a replaced one. */
  | { outcome: "ignored"; reason: "no_period" | "superseded" }
  | { outcome: "rejected"; reason: BillingRejection; message: string }
  | { outcome: "unknown_organization" }

const rejected = (reason: BillingRejection, message: string): ApplyBillingEventResult => ({ outcome: "rejected", reason, message })

/**
 * Applies one provider event to the workspace's billing state, in the caller's transaction:
 *   - checks that it belongs to the workspace's customer and subscription and is a valid transition
 *     (EVENT_TRANSITIONS); anything else is rejected and nothing is written;
 *   - an upgrade (or a change of interval) takes effect now; a downgrade inside the paid period is
 *     stored as a scheduled change for the period end, the paid plan running on until then; a
 *     cancellation of a paid-up subscription likewise keeps the plan to the period end. A failed
 *     payment's cancellation (past_due) and a trial's end now;
 *   - recomputes the effective plan (override > trialing/active > past_due within grace > Free) into
 *     app.organizations.plan; when it changed, moves the current reply window's usage onto the new
 *     anchor (alignReplyUsage);
 *   - records what changed in the audit log as BILLING_AUDIT_ACTOR.
 * Payments and customer updates change no subscription state (grace follows the subscription's
 * past_due status) but are checked the same way and recompute the plan.
 */
export async function applyBillingEvent(tx: Queryable, event: ApplicableBillingEvent, now = new Date()): Promise<ApplyBillingEventResult> {
  const org = await tx.query<{ plan: Plan }>("select plan from app.organizations where id = $1 for update", [event.organizationId])
  if (!org.rows[0]) return { outcome: "unknown_organization" }
  const previousPlan = org.rows[0].plan
  const stored = await getSubscription(tx, event.organizationId)

  const customerId = event.type === "customer.updated" ? event.customerId : "subscription" in event ? event.subscription.customerId : event.customerId
  const storedCustomer = await getBillingCustomerId(tx, event.organizationId)
  if (storedCustomer && customerId && storedCustomer !== customerId)
    return rejected("customer_mismatch", `the event's customer isn't the one stored for ${event.organizationId}`)

  let subscription: Subscription | null = stored
  let refreshed: EffectivePlanResult | null = null
  if ("subscription" in event) {
    const s = event.subscription
    if (stored && event.occurredAt <= stored.providerUpdatedAt) return { outcome: "stale" }
    const same = stored?.providerSubscriptionId === s.providerSubscriptionId
    const replacing = stored && !same && stored.status !== "canceled"
    if (replacing && s.status === "canceled") return { outcome: "ignored", reason: "superseded" }
    if (replacing)
      return event.type === "subscription.created"
        ? rejected("subscription_exists", `${event.organizationId} already has a live subscription`)
        : rejected("subscription_mismatch", `the event is for another subscription than ${event.organizationId}'s`)
    const from: TransitionFrom = same ? stored!.status : "none"
    if (!isValidTransition(event.type, from, s.status))
      return event.type === "subscription.created" && same
        ? rejected("subscription_exists", `${event.organizationId} already has this subscription`)
        : rejected("invalid_transition", `${event.type} can't move a subscription from ${from} to ${s.status}`)

    const currentPeriodStart = s.currentPeriodStart ?? (same ? stored!.currentPeriodStart : null)
    const currentPeriodEnd = s.currentPeriodEnd ?? (same ? stored!.currentPeriodEnd : null)
    if (!currentPeriodStart || !currentPeriodEnd) return { outcome: "ignored", reason: "no_period" }

    let { plan, interval, scheduledChange } = s
    if (same && s.status !== "canceled" && rank(plan) < rank(stored!.plan) && currentPeriodStart < stored!.currentPeriodEnd) {
      // a downgrade inside the paid period: the paid plan runs on, the lower one starts at its end
      scheduledChange = { action: "change", plan, interval, effectiveAt: stored!.currentPeriodEnd.toISOString() }
      plan = stored!.plan
      interval = stored!.interval
    }
    if (same && s.status === "canceled" && stored!.status === "active" && subscriptionGrants(stored!, event.occurredAt) && event.occurredAt < currentPeriodEnd) {
      // canceled while paid up: the plan runs to the end of the period paid for
      scheduledChange = { action: "cancel", effectiveAt: currentPeriodEnd.toISOString() }
      plan = stored!.plan
    }

    const result = await upsertSubscription(
      tx,
      {
        organizationId: event.organizationId,
        provider: s.provider,
        providerSubscriptionId: s.providerSubscriptionId,
        plan,
        interval,
        status: s.status,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        scheduledChange,
        providerUpdatedAt: event.occurredAt,
      },
      now,
    )
    if (!result.applied) return { outcome: "stale" }
    subscription = result.subscription
    refreshed = result.plan
  } else if (event.type !== "customer.updated" && event.subscriptionId && stored && stored.providerSubscriptionId !== event.subscriptionId && stored.status !== "canceled") {
    return rejected("subscription_mismatch", `the payment is for another subscription than ${event.organizationId}'s`)
  }

  const addedCustomer = !storedCustomer && !!customerId && (event.type === "customer.updated" || "subscription" in event)
  if (addedCustomer) await upsertBillingCustomer(tx, { organizationId: event.organizationId, provider: event.provider, providerCustomerId: customerId! })

  // upsertSubscription recomputed it for a subscription event; payments and customer updates do it here
  const effective = refreshed ?? (await refreshEffectivePlan(tx, event.organizationId, now))!
  if (effective.changed) await alignReplyUsage(tx, event.organizationId, quotaAnchor(stored, now), quotaAnchor(subscription, now), now)

  let auditId: string | null = null
  if ("subscription" in event || effective.changed || addedCustomer) {
    auditId = await writeAudit(tx, {
      actorId: null,
      actorLabel: BILLING_AUDIT_ACTOR,
      action: `billing.${event.type}`,
      targetType: "organization",
      targetId: event.organizationId,
      reason: `${event.provider} ${event.eventId}`,
      before: auditState(previousPlan, stored),
      after: auditState(effective.plan, subscription),
    })
  }
  return { outcome: "applied", plan: effective, subscription, auditId }
}

// what the audit log keeps: our own state, nothing from the payload
const auditState = (plan: Plan, sub: Subscription | null) => ({
  plan,
  subscription: sub && {
    id: sub.providerSubscriptionId,
    plan: sub.plan,
    interval: sub.interval,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    scheduledChange: sub.scheduledChange,
    graceUntil: sub.graceUntil?.toISOString() ?? null,
  },
})

// --- Webhook inbox ---

export interface BillingEventInput {
  provider: BillingProviderId
  eventId: string
  eventType: string
  occurredAt: Date
  payload: unknown
}

/** Stores a verified webhook. `duplicate` when the same event was stored before; `processed` when it was already applied. */
export async function recordBillingEvent(q: Queryable, input: BillingEventInput): Promise<{ id: string; duplicate: boolean; processed: boolean }> {
  const inserted = await q.query<{ id: string }>(
    `insert into app.billing_events (provider, event_id, event_type, occurred_at, payload) values ($1, $2, $3, $4, $5)
     on conflict (provider, event_id) do nothing returning id::text`,
    [input.provider, input.eventId, input.eventType, input.occurredAt, JSON.stringify(input.payload)],
  )
  if (inserted.rows[0]) return { id: inserted.rows[0].id, duplicate: false, processed: false }
  const { rows } = await q.query<{ id: string; processed: boolean }>(
    "select id::text, processed_at is not null as processed from app.billing_events where provider = $1 and event_id = $2",
    [input.provider, input.eventId],
  )
  return { id: rows[0]!.id, duplicate: true, processed: rows[0]!.processed }
}

/** Counts an attempt at processing an event. Null when it was already processed. */
export async function startBillingEvent(q: Queryable, id: string) {
  const { rows } = await q.query<{ attempts: number }>(
    "update app.billing_events set attempts = attempts + 1 where id = $1 and processed_at is null returning attempts",
    [id],
  )
  return rows[0]?.attempts ?? null
}

export async function finishBillingEvent(q: Queryable, id: string, error: string | null = null) {
  await q.query(
    `update app.billing_events set processed_at = case when $2::text is null then now() end, error = left($2::text, 5000) where id = $1`,
    [id, error],
  )
}

/** A stored webhook that hasn't been applied: still waiting, failed, or for a workspace we couldn't find. */
export interface BillingEventIssue {
  id: string
  provider: BillingProviderId
  eventId: string
  eventType: string
  occurredAt: Date
  receivedAt: Date
  attempts: number
  error: string | null
}

/** Unprocessed webhooks, newest first, for the admin area, and how many there are in all. */
export async function listBillingEventIssues(q: Queryable, limit = 20): Promise<{ total: number; events: BillingEventIssue[] }> {
  const [count, list] = await Promise.all([
    q.query<{ total: number }>("select count(*)::int as total from app.billing_events where processed_at is null"),
    q.query<BillingEventIssue>(
      `select id::text, provider, event_id as "eventId", event_type as "eventType", occurred_at as "occurredAt",
              received_at as "receivedAt", attempts, error
         from app.billing_events where processed_at is null order by received_at desc limit $1`,
      [limit],
    ),
  ])
  return { total: count.rows[0]!.total, events: list.rows }
}

// --- Reply usage ---

/** How far past its allowance a window may go under overage, in fifths; the excess is stored as overage_units. */
export interface OverageLimit {
  allowanceFifths: number
  capFifths: number
}

/**
 * Adds `fifths` fifths of a reply (fast model 1, standard 5, Opus 10, Fable 25) to the window and
 * returns the window's total in fifths. One upsert, so concurrent replies from any number of API
 * instances all count. With `overage`, the part of the total past the allowance (up to the cap) is
 * kept as the window's overage.
 */
export async function addReplyUsage(q: Queryable, organizationId: string, periodStart: Date, fifths: number, overage?: OverageLimit): Promise<number> {
  if (!Number.isInteger(fifths) || fifths < 0) throw new Error(`reply usage must be a whole number of fifths, got ${fifths}`)
  const { rows } = await q.query<{ fifths: string }>(
    `insert into app.reply_usage as u (organization_id, period_start, units, overage_units)
       values ($1, $2, $3::numeric / 5, least(greatest($3::numeric - $4::numeric, 0), $5::numeric) / 5)
     on conflict (organization_id, period_start) do update set
       units = u.units + excluded.units,
       overage_units = case when $4::numeric is null then u.overage_units
                            else greatest(u.overage_units, least(greatest((u.units + excluded.units) * 5 - $4::numeric, 0), $5::numeric) / 5) end
     returning (units * 5)::int::text as fifths`,
    [organizationId, periodStart, fifths, overage?.allowanceFifths ?? null, overage?.capFifths ?? null],
  )
  return Number(rows[0]!.fifths)
}

/** Fifths of a reply the workspace has used in the window starting at `periodStart`. */
export async function replyUsageFifths(q: Queryable, organizationId: string, periodStart: Date): Promise<number> {
  const { rows } = await q.query<{ fifths: string }>(
    "select (units * 5)::int::text as fifths from app.reply_usage where organization_id = $1 and period_start = $2",
    [organizationId, periodStart],
  )
  return Number(rows[0]?.fifths ?? 0)
}

/**
 * Moves what the workspace used in its current reply window under the anchor `from` into the window
 * under `to`, so a plan change neither resets nor loses the count (ADR 0003 (a): what was used carries
 * over). Overage stays on the old window, where it is billed. Null when both anchors give the same window.
 */
export async function alignReplyUsage(tx: Queryable, organizationId: string, from: Date | null, to: Date | null, now = new Date()) {
  const old = replyWindow(from, now).start
  const next = replyWindow(to, now).start
  if (old.getTime() === next.getTime()) return null
  const { rows } = await tx.query<{ units: string; overage: string; billed: boolean }>(
    `select units::text, overage_units::text as overage, overage_billed_at is not null as billed
       from app.reply_usage where organization_id = $1 and period_start = $2 for update`,
    [organizationId, old],
  )
  const row = rows[0]
  if (row && Number(row.units) > 0) {
    await tx.query(
      `insert into app.reply_usage as u (organization_id, period_start, units) values ($1, $2, $3::numeric)
       on conflict (organization_id, period_start) do update set units = u.units + excluded.units`,
      [organizationId, next, row.units],
    )
    if (Number(row.overage) > 0 || row.billed)
      await tx.query("update app.reply_usage set units = overage_units where organization_id = $1 and period_start = $2", [organizationId, old])
    else await tx.query("delete from app.reply_usage where organization_id = $1 and period_start = $2", [organizationId, old])
  }
  return { from: old, to: next, movedFifths: row ? Math.round(Number(row.units) * 5) : 0 }
}

/** What the chat API needs to hold a workspace to its monthly AI replies. */
export interface WorkspaceQuota {
  organizationId: string
  plan: Plan
  /** Where its reply windows count from: the granting subscription's period start; null for calendar months (Free, overrides, beta). */
  anchor: Date | null
  /** Replies included per window, in fifths. */
  allowanceFifths: number
  /** Replies past the allowance the owner allows under overage, in fifths; 0 when overage is off or the plan has none. */
  overageCapFifths: number
  /** Whether the rest of the plan (entitlements.ts) is held to: the plan_limits flag. */
  enforcePlan: boolean
}

/**
 * Every workspace with a bot, with its plan, billing anchor and reply limits, for the chat API's
 * sync. Read on every pass: a renewal or a plan change touches no bot row.
 */
export async function listWorkspaceQuotas(q: Queryable, now = new Date()): Promise<WorkspaceQuota[]> {
  const { rows } = await q.query<{
    id: string
    plan: Plan
    overage_enabled: boolean
    overage_cap_units: number | null
    sub_plan: PaidPlan | null
    sub_status: SubscriptionStatus | null
    sub_period_start: Date | null
    sub_period_end: Date | null
    sub_cancel_at_period_end: boolean | null
    sub_grace_until: Date | null
    sub_scheduled_change: ScheduledChange | null
  }>(
    `select o.id, o.plan, o.overage_enabled, o.overage_cap_units,
            s.plan as sub_plan, s.status as sub_status, s.current_period_start as sub_period_start, s.current_period_end as sub_period_end,
            s.cancel_at_period_end as sub_cancel_at_period_end, s.grace_until as sub_grace_until, s.scheduled_change as sub_scheduled_change
       from app.organizations o
       left join app.subscriptions s on s.organization_id = o.id
      where exists (select 1 from app.bots b where b.organization_id = o.id and ${BOT_SERVING_SQL})`,
  )
  const settings = await readPlatformSettings(q)
  return rows.map((r) => {
    const plan: Plan = PLANS.includes(r.plan) ? r.plan : "free"
    const limits = PLAN_LIMITS[plan]
    const sub =
      r.sub_status === null
        ? null
        : {
            plan: r.sub_plan!,
            status: r.sub_status,
            graceUntil: r.sub_grace_until,
            cancelAtPeriodEnd: !!r.sub_cancel_at_period_end,
            currentPeriodStart: r.sub_period_start!,
            currentPeriodEnd: r.sub_period_end!,
            scheduledChange: r.sub_scheduled_change,
          }
    const overage = limits.overageAllowed && r.overage_enabled && r.overage_cap_units ? r.overage_cap_units * 5 : 0
    return {
      organizationId: r.id,
      plan,
      anchor: quotaAnchor(sub, now),
      allowanceFifths: limits.monthlyReplies * 5,
      overageCapFifths: overage,
      enforcePlan: flagEnabled(settings, "plan_limits", r.id),
    }
  })
}

/** Where a workspace stands in its current reply window, for the dashboard. */
export interface ReplyUsage {
  plan: Plan
  window: ReplyWindow
  /** Used in the window, in fifths of a reply (overage included). */
  usedFifths: number
  /** Replies included per window, in fifths. */
  allowanceFifths: number
  /** Whether the chat API holds the workspace to its replies (the reply_quota flag); counted either way. */
  enforced: boolean
  overage: {
    /** Whether the plan offers overage at all. */
    allowed: boolean
    enabled: boolean
    /** The owner's cap in US cents; kept while overage is off, so turning it on again restores it. */
    capCents: number | null
    /** Used past the allowance under overage in this window, in fifths. */
    usedFifths: number
  }
}

/** The workspace's current reply window and what it used of it; null when there is no such workspace. */
export async function workspaceReplyUsage(q: Queryable, organizationId: string, now = new Date()): Promise<ReplyUsage | null> {
  const org = await q.query<{ plan: Plan; overage_enabled: boolean; overage_cap_units: number | null }>(
    "select plan, overage_enabled, overage_cap_units from app.organizations where id = $1",
    [organizationId],
  )
  const row = org.rows[0]
  if (!row) return null
  const plan: Plan = PLANS.includes(row.plan) ? row.plan : "free"
  // the same window the chat API counts in (listWorkspaceQuotas)
  const window = replyWindow(quotaAnchor(await getSubscription(q, organizationId), now), now)
  const [usage, enforced] = await Promise.all([
    q.query<{ used: string; overage: string }>(
      "select (units * 5)::int::text as used, (overage_units * 5)::int::text as overage from app.reply_usage where organization_id = $1 and period_start = $2",
      [organizationId, window.start],
    ),
    featureEnabled(q, "reply_quota", organizationId),
  ])
  const limits = PLAN_LIMITS[plan]
  return {
    plan,
    window,
    usedFifths: Number(usage.rows[0]?.used ?? 0),
    allowanceFifths: limits.monthlyReplies * 5,
    enforced,
    overage: {
      allowed: limits.overageAllowed,
      enabled: limits.overageAllowed && row.overage_enabled,
      capCents: row.overage_cap_units === null ? null : (row.overage_cap_units / OVERAGE_BLOCK.replies) * OVERAGE_BLOCK.priceCents,
      usedFifths: Number(usage.rows[0]?.overage ?? 0),
    },
  }
}

/** Whether `cents` is a cap an owner may set: whole $5 blocks, from one block to OVERAGE_CAP_MAX_CENTS. */
export const isOverageCap = (cents: unknown): cents is number =>
  Number.isSafeInteger(cents) && (cents as number) >= OVERAGE_BLOCK.priceCents && (cents as number) <= OVERAGE_CAP_MAX_CENTS && (cents as number) % OVERAGE_BLOCK.priceCents === 0

export type OverageRefusal =
  /** The plan has no overage (Free). */
  | "plan_has_no_overage"
  /** Overage is billed to a subscription; a plan from an override or the beta has none. */
  | "no_subscription"
  | "invalid_cap"

/**
 * Turns overage on with a cap (ADR 0003 (c)) or off, and records who did it. Turning it on needs a
 * plan with overage and a subscription that grants it to bill. Must run in a transaction.
 */
export async function setOverage(
  tx: Queryable,
  input: { organizationId: string; enabled: boolean; capCents: number | null; actorId: string },
  now = new Date(),
): Promise<{ ok: true } | { ok: false; reason: OverageRefusal }> {
  const org = await tx.query<{ plan: Plan; overage_enabled: boolean; overage_cap_units: number | null }>(
    "select plan, overage_enabled, overage_cap_units from app.organizations where id = $1 for update",
    [input.organizationId],
  )
  const before = org.rows[0]
  if (!before) throw new Error(`no workspace ${input.organizationId}`)
  let capUnits = before.overage_cap_units
  if (input.enabled) {
    if (!PLAN_LIMITS[before.plan]?.overageAllowed) return { ok: false, reason: "plan_has_no_overage" }
    const sub = await getSubscription(tx, input.organizationId)
    if (!sub || (sub.status !== "active" && sub.status !== "trialing") || subscriptionPlanAt(sub, now) === null) return { ok: false, reason: "no_subscription" }
  }
  if (input.capCents !== null) {
    if (!isOverageCap(input.capCents)) return { ok: false, reason: "invalid_cap" }
    capUnits = (input.capCents / OVERAGE_BLOCK.priceCents) * OVERAGE_BLOCK.replies
  } else if (input.enabled && capUnits === null) return { ok: false, reason: "invalid_cap" }

  await tx.query("update app.organizations set overage_enabled = $2, overage_cap_units = $3 where id = $1", [input.organizationId, input.enabled, capUnits])
  if (before.overage_enabled !== input.enabled || before.overage_cap_units !== capUnits)
    await writeAudit(tx, {
      actorId: input.actorId,
      action: "billing.overage",
      targetType: "organization",
      targetId: input.organizationId,
      before: { enabled: before.overage_enabled, capUnits: before.overage_cap_units },
      after: { enabled: input.enabled, capUnits },
    })
  return { ok: true }
}
