import type { Queryable } from "./db.ts"
import { AdminError } from "./admin.ts"
import type { ActionChange } from "./admin-users.ts"
import {
  effectivePlan,
  getSubscription,
  lockOrganization,
  refreshEffectivePlan,
  subscriptionGrants,
  SUBSCRIPTION_COLUMNS,
  type BillingInterval,
  type BillingProviderId,
  type PaidPlan,
  type PlanOverride,
  type PlanSource,
  type Subscription,
  type SubscriptionStatus,
} from "./billing.ts"
import { OVERAGE_BLOCK, PLAN_PRICES, PLANS, type Plan } from "./plans.ts"

// Billing in the admin area: /admin/billing (revenue, plans, payments that failed, webhooks and
// overage) and the subscription card on /admin/workspaces/[id], with the one plan change staff make
// by hand: a comp, a paid plan for free until a set date (app.plan_overrides). A workspace that pays
// gets its plan from its subscription only; staff change that in Paddle, never here.

/** The audit actions a comp is written as; the plan timeline reads these back with PLAN_AUDIT_ACTION. */
export const COMP_AUDIT_ACTION = "organization.comp"
export const COMP_REVOKE_AUDIT_ACTION = "organization.comp_revoke"
/** The longest comp staff can grant in one go. */
export const COMP_MAX_DAYS = 730
/** Webhooks listed on the workspace's card. */
export const WORKSPACE_BILLING_EVENTS = 30

const PAID_PLANS = PLANS.filter((p): p is PaidPlan => p !== "free")
const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

/** What a subscription brings in a month at list price, in US cents; an annual one counts as a twelfth. */
export const monthlyCents = (plan: PaidPlan, interval: BillingInterval) =>
  interval === "month" ? PLAN_PRICES[plan].monthly : Math.round(PLAN_PRICES[plan].annual / 12)

// --- /admin/billing ---

/** Where a workspace's plan comes from: "manual" is a paid plan set by hand before comps (beta workspaces). */
export type PlanOrigin = PlanSource | "manual"

export interface PlanDistributionRow {
  plan: Plan
  workspaces: number
  bySource: Record<PlanOrigin, number>
}

export interface PastDueSubscription {
  organizationId: string
  name: string
  ownerEmail: string | null
  plan: PaidPlan
  interval: BillingInterval
  monthlyCents: number
  providerSubscriptionId: string
  /** When the first payment failed (grace started). */
  since: Date
  graceUntil: Date
  /** Set once the grace ran out and the workspace was moved to Free. */
  graceExpiredAt: Date | null
}

export interface OverageMonth {
  /** YYYY-MM, in UTC, by when the charge was made. */
  month: string
  blocks: number
  cents: number
}

export interface AdminBillingOverview {
  /** List prices of what pays now: active subscriptions and past_due ones still in their grace; trials not included. */
  mrrCents: number
  arrCents: number
  /** Of the MRR: past_due in grace, and set to cancel at the period end. */
  atRiskCents: number
  cancelingCents: number
  subscriptions: Record<SubscriptionStatus, number>
  plans: PlanDistributionRow[]
  pastDue: PastDueSubscription[]
  overage: {
    /** The last 12 months, oldest first, months without charges included. */
    months: OverageMonth[]
    totalCents: number
    /** Closed or open windows with overage not charged yet. */
    unbilledWindows: number
    unbilledReplies: number
  }
}

const OVERAGE_MONTHS = 12
const monthKey = (d: Date) => d.toISOString().slice(0, 7)

export async function getAdminBillingOverview(q: Queryable, now = new Date()): Promise<AdminBillingOverview> {
  const firstMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (OVERAGE_MONTHS - 1), 1))
  const [subs, plans, pastDue, overage, unbilled] = await Promise.all([
    q.query<Subscription>(`select ${SUBSCRIPTION_COLUMNS} from app.subscriptions`),
    q.query<{ plan: Plan; source: PlanOrigin; n: number }>(
      `select o.plan,
              case when exists (select 1 from app.plan_overrides p where p.organization_id = o.id and p.revoked_at is null and p.starts_at <= $1 and p.ends_at > $1) then 'override'
                   when o.plan = 'free' then 'free'
                   when exists (select 1 from app.subscriptions s where s.organization_id = o.id) then 'subscription'
                   else 'manual' end as source,
              count(*)::int as n
         from app.organizations o group by 1, 2`,
      [now],
    ),
    q.query<Omit<PastDueSubscription, "monthlyCents" | "since">>(
      `select s.organization_id as "organizationId", o.name,
              (select u.email from app.organization_members m join app.users u on u.id = m.user_id
                where m.organization_id = o.id and m.role = 'owner' order by m.created_at limit 1) as "ownerEmail",
              s.plan, s."interval", s.provider_subscription_id as "providerSubscriptionId",
              s.grace_until as "graceUntil", s.grace_expired_at as "graceExpiredAt"
         from app.subscriptions s join app.organizations o on o.id = s.organization_id
        where s.status = 'past_due'
        order by s.grace_until, o.name`,
    ),
    q.query<{ month: string; blocks: number }>(
      `select to_char(date_trunc('month', overage_billed_at at time zone 'UTC'), 'YYYY-MM') as month, sum(overage_billed_blocks)::int as blocks
         from app.reply_usage where overage_billed_at >= $1 group by 1`,
      [firstMonth],
    ),
    q.query<{ windows: number; replies: string }>(
      "select count(*)::int as windows, coalesce(sum(overage_units), 0)::text as replies from app.reply_usage where overage_units > 0 and overage_billed_at is null",
    ),
  ])

  const subscriptions: Record<SubscriptionStatus, number> = { trialing: 0, active: 0, past_due: 0, paused: 0, canceled: 0 }
  let mrrCents = 0
  let atRiskCents = 0
  let cancelingCents = 0
  for (const s of subs.rows) {
    subscriptions[s.status]++
    if ((s.status !== "active" && s.status !== "past_due") || !subscriptionGrants(s, now)) continue
    const cents = monthlyCents(s.plan, s.interval)
    mrrCents += cents
    if (s.status === "past_due") atRiskCents += cents
    else if (s.cancelAtPeriodEnd || s.scheduledChange?.action === "cancel") cancelingCents += cents
  }

  const byPlan = new Map<Plan, PlanDistributionRow>(PLANS.map((plan) => [plan, { plan, workspaces: 0, bySource: { subscription: 0, override: 0, manual: 0, free: 0 } }]))
  for (const r of plans.rows) {
    const row = byPlan.get(r.plan)
    if (!row) continue
    row.workspaces += r.n
    row.bySource[r.source] += r.n
  }

  const blocks = new Map(overage.rows.map((r) => [r.month, r.blocks]))
  const months = Array.from({ length: OVERAGE_MONTHS }, (_, i) => {
    const month = monthKey(new Date(Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + i, 1)))
    const b = blocks.get(month) ?? 0
    return { month, blocks: b, cents: b * OVERAGE_BLOCK.priceCents }
  })

  return {
    mrrCents,
    arrCents: mrrCents * 12,
    atRiskCents,
    cancelingCents,
    subscriptions,
    plans: [...byPlan.values()],
    pastDue: pastDue.rows.map((r) => ({
      ...r,
      monthlyCents: monthlyCents(r.plan, r.interval),
      since: new Date(r.graceUntil.getTime() - 7 * 86_400_000),
    })),
    overage: {
      months,
      totalCents: months.reduce((sum, m) => sum + m.cents, 0),
      unbilledWindows: unbilled.rows[0]!.windows,
      unbilledReplies: Math.ceil(Number(unbilled.rows[0]!.replies)),
    },
  }
}

/** A stored webhook as a replay needs it. Null when there is no such event. */
export interface StoredBillingEvent {
  id: string
  provider: BillingProviderId
  eventId: string
  eventType: string
  payload: unknown
  processedAt: Date | null
}

export async function getBillingEvent(q: Queryable, id: string): Promise<StoredBillingEvent | null> {
  if (!/^\d{1,18}$/.test(id)) return null
  const { rows } = await q.query<StoredBillingEvent>(
    `select id::text, provider, event_id as "eventId", event_type as "eventType", payload, processed_at as "processedAt"
       from app.billing_events where id = $1`,
    [id],
  )
  return rows[0] ?? null
}

// --- The workspace's subscription card ---

export interface WorkspaceComp {
  id: string
  plan: PaidPlan
  reason: string
  startsAt: Date
  endsAt: Date
  revokedAt: Date | null
  grantedBy: string | null
  revokedBy: string | null
  /** Counts toward the plan now. */
  running: boolean
}

export interface WorkspaceBillingEvent {
  id: string
  eventId: string
  eventType: string
  occurredAt: Date
  receivedAt: Date
  processedAt: Date | null
  attempts: number
  error: string | null
}

export interface AdminWorkspaceBilling {
  subscription: (Subscription & { graceExpiredAt: Date | null }) | null
  customerId: string | null
  /** Where the plan comes from now. */
  source: PlanOrigin
  /** Newest first. */
  comps: WorkspaceComp[]
  /** Webhooks about this workspace (its id, subscription or customer), newest first. */
  events: WorkspaceBillingEvent[]
  /** Whether staff may grant a comp: not while a subscription pays for (or still grants) a plan. */
  mayComp: boolean
}

/** Whether the workspace's subscription still decides its plan: anything but one that is canceled and has run out. */
const subscriptionLive = (sub: Subscription | null, now: Date) => sub !== null && (sub.status !== "canceled" || subscriptionGrants(sub, now))

export async function getAdminWorkspaceBilling(q: Queryable, organizationId: string, now = new Date()): Promise<AdminWorkspaceBilling | null> {
  if (!isUuid(organizationId)) return null
  const org = await q.query<{ plan: Plan }>("select plan from app.organizations where id = $1", [organizationId])
  if (!org.rows[0]) return null
  const [sub, customer, comps] = await Promise.all([
    q.query<Subscription & { graceExpiredAt: Date | null }>(
      `select ${SUBSCRIPTION_COLUMNS}, grace_expired_at as "graceExpiredAt" from app.subscriptions where organization_id = $1`,
      [organizationId],
    ),
    q.query<{ id: string }>("select provider_customer_id as id from app.billing_customers where organization_id = $1", [organizationId]),
    q.query<Omit<WorkspaceComp, "running">>(
      `select p.id, p.plan, p.reason, p.starts_at as "startsAt", p.ends_at as "endsAt", p.revoked_at as "revokedAt",
              coalesce(g.display_name, g.username) as "grantedBy", coalesce(r.display_name, r.username) as "revokedBy"
         from app.plan_overrides p
         left join app.users g on g.id = p.granted_by
         left join app.users r on r.id = p.revoked_by
        where p.organization_id = $1
        order by p.created_at desc`,
      [organizationId],
    ),
  ])
  const subscription = sub.rows[0] ?? null
  const customerId = customer.rows[0]?.id ?? null
  const events = await q.query<WorkspaceBillingEvent>(
    `select id::text, event_id as "eventId", event_type as "eventType", occurred_at as "occurredAt", received_at as "receivedAt",
            processed_at as "processedAt", attempts, error
       from app.billing_events
      where payload -> 'data' -> 'custom_data' ->> 'organization_id' = $1
         or payload -> 'data' ->> 'subscription_id' = $2
         or payload -> 'data' ->> 'customer_id' = $3
         or payload -> 'data' ->> 'id' in ($2, $3)
      order by occurred_at desc, id desc limit $4`,
    [organizationId, subscription?.providerSubscriptionId ?? null, customerId, WORKSPACE_BILLING_EVENTS],
  )

  const overrides: PlanOverride[] = comps.rows
  const effective = subscription || overrides.length ? effectivePlan(subscription, overrides, now).source : org.rows[0].plan === "free" ? "free" : "manual"
  return {
    subscription,
    customerId,
    source: effective,
    comps: comps.rows.map((c) => ({ ...c, running: !c.revokedAt && c.startsAt <= now && now < c.endsAt })),
    events: events.rows,
    mayComp: !subscriptionLive(subscription, now),
  }
}

// --- Comps ---

const asPaidPlan = (raw: unknown): PaidPlan | null => (PAID_PLANS.includes(raw as PaidPlan) ? (raw as PaidPlan) : null)

function parseEndsAt(raw: unknown, now: Date): Date {
  const endsAt = typeof raw === "string" && raw ? new Date(raw) : null
  if (!endsAt || Number.isNaN(endsAt.getTime())) throw new AdminError("invalid_input", "Choose when the comp ends")
  if (endsAt.getTime() <= now.getTime()) throw new AdminError("invalid_input", "The end date must be in the future")
  if (endsAt.getTime() > now.getTime() + COMP_MAX_DAYS * 86_400_000) throw new AdminError("invalid_input", `A comp can run for at most ${COMP_MAX_DAYS} days`)
  return endsAt
}

interface RunningComp {
  id: string
  plan: PaidPlan
  ends_at: Date
}

async function runningComps(tx: Queryable, organizationId: string, now: Date) {
  const { rows } = await tx.query<RunningComp>(
    `select id, plan, ends_at from app.plan_overrides
      where organization_id = $1 and revoked_at is null and starts_at <= $2 and ends_at > $2 order by created_at`,
    [organizationId, now],
  )
  return rows
}

const compState = (c: RunningComp) => ({ id: c.id, plan: c.plan, endsAt: c.ends_at.toISOString() })

/**
 * Grants the workspace a paid plan for free until `endsAt` (a comp), replacing any comp running now,
 * and recomputes its plan. `reason` is the staff member's reason, kept on the override. Refused while
 * a subscription decides the workspace's plan: a paying workspace's plan changes in Paddle only.
 */
export async function adminGrantComp(
  tx: Queryable,
  organizationId: string,
  input: { plan: unknown; endsAt: unknown; reason: string; grantedBy: string },
  now = new Date(),
): Promise<ActionChange<{ plan: Plan }>> {
  const plan = asPaidPlan(input.plan)
  if (!plan) throw new AdminError("invalid_input", "Choose a paid plan")
  const endsAt = parseEndsAt(input.endsAt, now)
  const reason = input.reason.trim()
  if (!reason) throw new AdminError("invalid_input", "Give a reason for this comp")
  if (!isUuid(organizationId) || !(await lockOrganization(tx, organizationId))) throw new AdminError("not_found", "Workspace not found")
  if (subscriptionLive(await getSubscription(tx, organizationId), now))
    throw new AdminError("invalid_input", "This workspace has a subscription; change its plan in Paddle")

  const before = await tx.query<{ plan: Plan }>("select plan from app.organizations where id = $1", [organizationId])
  const replaced = await runningComps(tx, organizationId, now)
  if (replaced.length)
    await tx.query("update app.plan_overrides set revoked_at = $2, revoked_by = $3 where id = any($1::uuid[])", [replaced.map((c) => c.id), now, input.grantedBy])
  const { rows } = await tx.query<{ id: string }>(
    `insert into app.plan_overrides (organization_id, plan, reason, starts_at, ends_at, granted_by) values ($1, $2, $3, $4, $5, $6) returning id`,
    [organizationId, plan, reason.slice(0, 1000), now, endsAt, input.grantedBy],
  )
  const effective = (await refreshEffectivePlan(tx, organizationId, now))!
  return {
    before: { plan: before.rows[0]!.plan, comps: replaced.map(compState) },
    after: { plan: effective.plan, comp: { id: rows[0]!.id, plan, endsAt: endsAt.toISOString() } },
    extra: { plan: effective.plan },
  }
}

/** Ends a running comp now and recomputes the plan (what the subscription grants, or Free). */
export async function adminRevokeComp(
  tx: Queryable,
  organizationId: string,
  input: { compId: unknown; revokedBy: string },
  now = new Date(),
): Promise<ActionChange<{ plan: Plan }>> {
  const compId = typeof input.compId === "string" ? input.compId : ""
  if (!isUuid(organizationId) || !(await lockOrganization(tx, organizationId))) throw new AdminError("not_found", "Workspace not found")
  const comp = isUuid(compId) ? (await runningComps(tx, organizationId, now)).find((c) => c.id === compId) : undefined
  if (!comp) throw new AdminError("not_found", "No running comp with this id on this workspace")
  const before = await tx.query<{ plan: Plan }>("select plan from app.organizations where id = $1", [organizationId])
  await tx.query("update app.plan_overrides set revoked_at = $2, revoked_by = $3 where id = $1", [comp.id, now, input.revokedBy])
  const effective = (await refreshEffectivePlan(tx, organizationId, now))!
  return {
    before: { plan: before.rows[0]!.plan, comp: compState(comp) },
    after: { plan: effective.plan, comp: null },
    extra: { plan: effective.plan },
  }
}
