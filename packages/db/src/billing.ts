import type { Db, Queryable } from "./db.ts"
import { BOT_SERVING_SQL } from "./bots.ts"
import { flagEnabled, readPlatformSettings } from "./platform-settings.ts"
import { PLANS, PLAN_LIMITS, type Plan } from "./plans.ts"

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

/** Whether the subscription still grants its plan at `now`. */
export function subscriptionGrants(sub: Pick<Subscription, "status" | "graceUntil" | "cancelAtPeriodEnd" | "currentPeriodEnd">, now: Date) {
  switch (sub.status) {
    case "trialing":
    case "active":
      // backstop for a lost "canceled" webhook: a cancellation at period end stops there
      return !(sub.cancelAtPeriodEnd && now >= sub.currentPeriodEnd)
    case "past_due":
      return sub.graceUntil !== null && now < sub.graceUntil
    default:
      return false
  }
}

/** The plan a workspace is entitled to from its subscription and overrides: the highest that applies. */
export function effectivePlan(sub: Subscription | null, overrides: PlanOverride[], now: Date): { plan: Plan; source: PlanSource } {
  let best: { plan: Plan; source: PlanSource } = { plan: "free", source: "free" }
  if (sub && subscriptionGrants(sub, now)) best = { plan: sub.plan, source: "subscription" }
  for (const o of overrides) {
    const running = !o.revokedAt && o.startsAt <= now && now < o.endsAt
    if (running && rank(o.plan) > rank(best.plan)) best = { plan: o.plan, source: "override" }
  }
  return best
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
    sub_status: SubscriptionStatus | null
    sub_period_start: Date | null
    sub_period_end: Date | null
    sub_cancel_at_period_end: boolean | null
    sub_grace_until: Date | null
  }>(
    `select o.id, o.plan, o.overage_enabled, o.overage_cap_units,
            s.status as sub_status, s.current_period_start as sub_period_start, s.current_period_end as sub_period_end,
            s.cancel_at_period_end as sub_cancel_at_period_end, s.grace_until as sub_grace_until
       from app.organizations o
       left join app.subscriptions s on s.organization_id = o.id
      where exists (select 1 from app.bots b where b.organization_id = o.id and ${BOT_SERVING_SQL})`,
  )
  const settings = await readPlatformSettings(q)
  return rows.map((r) => {
    const plan: Plan = PLANS.includes(r.plan) ? r.plan : "free"
    const limits = PLAN_LIMITS[plan]
    const grants =
      r.sub_status !== null &&
      subscriptionGrants(
        { status: r.sub_status, graceUntil: r.sub_grace_until, cancelAtPeriodEnd: !!r.sub_cancel_at_period_end, currentPeriodEnd: r.sub_period_end! },
        now,
      )
    const overage = limits.overageAllowed && r.overage_enabled && r.overage_cap_units ? r.overage_cap_units * 5 : 0
    return {
      organizationId: r.id,
      plan,
      anchor: grants ? r.sub_period_start : null,
      allowanceFifths: limits.monthlyReplies * 5,
      overageCapFifths: overage,
      enforcePlan: flagEnabled(settings, "plan_limits", r.id),
    }
  })
}
