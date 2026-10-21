import type { Queryable } from "./db.ts"
import { GRACE_DAYS, SUBSCRIPTION_COLUMNS, quotaAnchor, subscriptionGrants, type BillingInterval, type PaidPlan, type Subscription } from "./billing.ts"
import { flagEnabled, readPlatformSettings } from "./platform-settings.ts"
import { PLANS, PLAN_LIMITS, OVERAGE_BLOCK, replyWindow, type Plan } from "./plans.ts"

// Billing emails to workspace owners (docs/adr/0003-billing.md (c), (f), (g); migrations/0038_billing_notices.sql).
// What is due is read from the billing state, not from events, so the daily cron
// (/api/cron/billing-notices) catches whatever a webhook-time send missed. Each notice goes out once
// per workspace, kind and period: claimBillingNotice takes the row before any mail is sent.

/** The notices cron, as named in app.job_runs. */
export const BILLING_NOTICES_JOB = "billing.notices"

export const BILLING_NOTICE_KINDS = [
  "payment_failed",
  "grace_reminder",
  "grace_last_call",
  "downgraded",
  "subscription_started",
  "subscription_renewed",
  "cancel_confirmed",
  "quota_80",
  "quota_100",
  "beta_ending_30",
  "beta_ending_7",
] as const
export type BillingNoticeKind = (typeof BILLING_NOTICE_KINDS)[number]

/** Days into the grace when the reminder and the last call go out (ADR 0003 (f): day 0, 3 and 6). */
export const GRACE_REMINDER_DAY = 3
export const GRACE_LAST_CALL_DAY = 6
/** A start or a renewal older than this isn't announced any more (a cron that was down for a while). */
export const NOTICE_FRESH_DAYS = 3
/** Days before a beta placement ends when its owners hear about it (ADR 0003 (g)). */
export const BETA_ENDING_DAYS = { first: 30, last: 7 } as const
/** Share of the monthly replies that sends the first quota warning. */
export const QUOTA_WARNING_SHARE = 0.8

const DAY = 24 * 60 * 60 * 1000

export type BillingNoticeData =
  /** A failed renewal, and the reminders while its grace runs. */
  | { kind: "payment_failed" | "grace_reminder" | "grace_last_call"; plan: PaidPlan; graceUntil: Date }
  /** The subscription stopped granting and the workspace is on Free (end of grace, cancellation). */
  | { kind: "downgraded"; plan: PaidPlan; freeReplies: number }
  | { kind: "subscription_started" | "subscription_renewed"; plan: PaidPlan; interval: BillingInterval; renewsAt: Date; monthlyReplies: number }
  /** The owner canceled; the plan runs to `endsAt`. */
  | { kind: "cancel_confirmed"; plan: PaidPlan; endsAt: Date }
  | {
      kind: "quota_80" | "quota_100"
      plan: Plan
      usedReplies: number
      allowanceReplies: number
      resetsAt: Date
      /** "on": overage continues past the allowance up to capCents; "off": a paid plan without it; "none": Free. */
      overage: "on" | "off" | "none"
      capCents: number | null
    }
  /** The plan a beta workspace was given at launch ends at `endsAt` (30 days ahead, then 7). */
  | { kind: "beta_ending_30" | "beta_ending_7"; plan: PaidPlan; endsAt: Date; freeReplies: number }

export interface NoticeRef {
  organizationId: string
  kind: BillingNoticeKind
  period: string
}

export type BillingNotice = NoticeRef & {
  workspace: string
  data: BillingNoticeData
  /** Recorded with this one and never sent: what this notice makes redundant (a start's first period). */
  claimAlso: Omit<NoticeRef, "organizationId">[]
  /** The workspace's owners, in the language they last used the dashboard in (null: unknown). */
  recipients: { email: string; locale: string | null }[]
}

type SubscriptionRow = Subscription & { graceExpiredAt: Date | null }

/**
 * The notices due at `now` that haven't gone out, for every workspace or for the given ones.
 * Workspaces without an owner who can receive mail are left out.
 */
export async function dueBillingNotices(q: Queryable, now = new Date(), organizationIds: string[] | null = null): Promise<BillingNotice[]> {
  const since = new Date(now.getTime() - 32 * DAY)
  const orgs = await q.query<{ id: string; name: string; plan: Plan; overage_enabled: boolean; overage_cap_units: number | null }>(
    `select o.id, o.name, o.plan, o.overage_enabled, o.overage_cap_units from app.organizations o
      where ($2::uuid[] is null or o.id = any($2::uuid[]))
        and (exists (select 1 from app.subscriptions s where s.organization_id = o.id)
             or exists (select 1 from app.reply_usage u where u.organization_id = o.id and u.period_start >= $1)
             or exists (select 1 from app.plan_overrides p where p.organization_id = o.id and p.kind = 'beta' and p.revoked_at is null and p.ends_at > $3))`,
    [since, organizationIds, now],
  )
  if (!orgs.rows.length) return []
  const ids = orgs.rows.map((o) => o.id)
  const [subs, usage, sent, owners, settings, betas] = await Promise.all([
    q.query<SubscriptionRow>(`select ${SUBSCRIPTION_COLUMNS}, grace_expired_at as "graceExpiredAt" from app.subscriptions where organization_id = any($1::uuid[])`, [ids]),
    q.query<{ id: string; start: Date; fifths: number }>(
      `select organization_id as id, period_start as start, (units * 5)::int as fifths from app.reply_usage
        where organization_id = any($1::uuid[]) and period_start >= $2`,
      [ids, since],
    ),
    q.query<NoticeRef>(`select organization_id as "organizationId", kind, period from app.billing_notices where organization_id = any($1::uuid[])`, [ids]),
    q.query<{ id: string; email: string; locale: string | null }>(
      `select m.organization_id as id, u.email, u.locale from app.organization_members m join app.users u on u.id = m.user_id
        where m.organization_id = any($1::uuid[]) and m.role = 'owner' and u.suspended_at is null order by u.email`,
      [ids],
    ),
    readPlatformSettings(q),
    q.query<{ id: string; overrideId: string; plan: PaidPlan; endsAt: Date }>(
      `select organization_id as id, id as "overrideId", plan, ends_at as "endsAt" from app.plan_overrides
        where organization_id = any($1::uuid[]) and kind = 'beta' and revoked_at is null and starts_at <= $2 and ends_at > $2`,
      [ids, now],
    ),
  ])
  const betaOf = new Map(betas.rows.map((b) => [b.id, b]))
  const subOf = new Map(subs.rows.map((s) => [s.organizationId, s]))
  const done = new Set(sent.rows.map((n) => `${n.organizationId}|${n.kind}|${n.period}`))
  const ownersOf = new Map<string, BillingNotice["recipients"]>()
  for (const o of owners.rows) ownersOf.set(o.id, [...(ownersOf.get(o.id) ?? []), { email: o.email, locale: o.locale }])

  const due: BillingNotice[] = []
  for (const org of orgs.rows) {
    const recipients = ownersOf.get(org.id)
    if (!recipients?.length) continue
    const add = (period: string, data: BillingNoticeData, claimAlso: BillingNotice["claimAlso"] = []) => {
      if (!done.has(`${org.id}|${data.kind}|${period}`)) due.push({ organizationId: org.id, kind: data.kind, period, workspace: org.name, data, claimAlso, recipients })
    }
    const sub = subOf.get(org.id) ?? null
    if (sub) {
      const id = sub.providerSubscriptionId
      const grants = subscriptionGrants(sub, now)
      if (sub.status === "past_due" && sub.graceUntil && now < sub.graceUntil && !sub.graceExpiredAt) {
        // one per stage, by how far into the grace we are: a missed run never sends two at once
        const day = (now.getTime() - (sub.graceUntil.getTime() - GRACE_DAYS * DAY)) / DAY
        const kind = day >= GRACE_LAST_CALL_DAY ? "grace_last_call" : day >= GRACE_REMINDER_DAY ? "grace_reminder" : "payment_failed"
        add(`${id}:${sub.graceUntil.toISOString()}`, { kind, plan: sub.plan, graceUntil: sub.graceUntil })
      }
      // a paused subscription hasn't ended; an override keeps the workspace off Free
      if (!grants && sub.status !== "paused" && org.plan === "free") add(id, { kind: "downgraded", plan: sub.plan, freeReplies: PLAN_LIMITS.free.monthlyReplies })
      const canceling = sub.cancelAtPeriodEnd || sub.scheduledChange?.action === "cancel"
      if (grants && canceling) {
        const endsAt = sub.scheduledChange?.action === "cancel" ? new Date(sub.scheduledChange.effectiveAt) : sub.currentPeriodEnd
        add(id, { kind: "cancel_confirmed", plan: sub.plan, endsAt })
      }
      if (grants && (sub.status === "active" || sub.status === "trialing") && now.getTime() - sub.currentPeriodStart.getTime() < NOTICE_FRESH_DAYS * DAY) {
        const renewal = `${id}:${sub.currentPeriodStart.toISOString()}`
        const data = { plan: sub.plan, interval: sub.interval, renewsAt: sub.currentPeriodEnd, monthlyReplies: PLAN_LIMITS[sub.plan].monthlyReplies }
        // the first period is the start; every later one a renewal
        if (!done.has(`${org.id}|subscription_started|${id}`)) add(id, { kind: "subscription_started", ...data }, [{ kind: "subscription_renewed", period: renewal }])
        else add(renewal, { kind: "subscription_renewed", ...data })
      }
    }
    // a beta placement nearing its end, unless the workspace subscribed meanwhile: one per stage,
    // by how close the end is, so a missed run never sends both
    const beta = betaOf.get(org.id)
    if (beta && !(sub && subscriptionGrants(sub, now))) {
      const daysLeft = (beta.endsAt.getTime() - now.getTime()) / DAY
      const data = { plan: beta.plan, endsAt: beta.endsAt, freeReplies: PLAN_LIMITS.free.monthlyReplies }
      if (daysLeft <= BETA_ENDING_DAYS.last) add(beta.overrideId, { kind: "beta_ending_7", ...data }, [{ kind: "beta_ending_30", period: beta.overrideId }])
      else if (daysLeft <= BETA_ENDING_DAYS.first) add(beta.overrideId, { kind: "beta_ending_30", ...data })
    }
    // the warnings go out only while the chat API holds the workspace to its replies (ADR 0003 (g))
    if (flagEnabled(settings, "reply_quota", org.id)) {
      const plan: Plan = PLANS.includes(org.plan) ? org.plan : "free"
      const limits = PLAN_LIMITS[plan]
      // the same window the chat API counts in (listWorkspaceQuotas)
      const window = replyWindow(quotaAnchor(sub, now), now)
      const used = usage.rows.find((u) => u.id === org.id && new Date(u.start).getTime() === window.start.getTime())?.fifths ?? 0
      const allowance = limits.monthlyReplies * 5
      const kind = used >= allowance ? "quota_100" : used >= allowance * QUOTA_WARNING_SHARE ? "quota_80" : null
      if (kind) {
        const on = limits.overageAllowed && org.overage_enabled && !!org.overage_cap_units
        add(window.start.toISOString(), {
          kind,
          plan,
          usedReplies: Math.floor(used / 5),
          allowanceReplies: limits.monthlyReplies,
          resetsAt: window.end,
          overage: on ? "on" : limits.overageAllowed ? "off" : "none",
          capCents: on ? (org.overage_cap_units! / OVERAGE_BLOCK.replies) * OVERAGE_BLOCK.priceCents : null,
        })
      }
    }
  }
  return due
}

/**
 * Takes the notice (and what it makes redundant) before any mail goes out. False when it was taken
 * already, by an earlier run or a concurrent one: then nothing is sent.
 */
export async function claimBillingNotice(q: Queryable, n: Pick<BillingNotice, "organizationId" | "kind" | "period" | "claimAlso">): Promise<boolean> {
  const { rows } = await q.query(
    `insert into app.billing_notices (organization_id, kind, period) values ($1, $2, $3) on conflict do nothing returning 1`,
    [n.organizationId, n.kind, n.period],
  )
  if (!rows[0]) return false
  for (const also of n.claimAlso)
    await q.query(`insert into app.billing_notices (organization_id, kind, period) values ($1, $2, $3) on conflict do nothing`, [n.organizationId, also.kind, also.period])
  return true
}

/** Records how many owners the notice reached. */
export async function finishBillingNotice(q: Queryable, n: NoticeRef, recipients: number): Promise<void> {
  await q.query(`update app.billing_notices set recipients = $4, sent_at = now() where organization_id = $1 and kind = $2 and period = $3`, [
    n.organizationId,
    n.kind,
    n.period,
    recipients,
  ])
}

/** Gives a claimed notice back when no mail went out, so the next run tries again. */
export async function releaseBillingNotice(q: Queryable, n: Pick<BillingNotice, "organizationId" | "kind" | "period" | "claimAlso">): Promise<void> {
  for (const ref of [n, ...n.claimAlso])
    await q.query(`delete from app.billing_notices where organization_id = $1 and kind = $2 and period = $3 and recipients = 0`, [n.organizationId, ref.kind, ref.period])
}

/** Remembers the language a user uses the dashboard in, for mail sent without a request. Writes only on a change. */
export async function rememberUserLocale(q: Queryable, userId: string, locale: string): Promise<void> {
  await q.query(`update app.users set locale = $2 where id = $1 and locale is distinct from $2`, [userId, locale])
}
