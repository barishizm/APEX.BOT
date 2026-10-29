import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import {
  addReplyUsage,
  applyBillingEvent,
  BILLING_AUDIT_ACTOR,
  getSubscription,
  grantPlanOverride,
  isValidTransition,
  refreshEffectivePlans,
  replyUsageFifths,
  upsertBillingCustomer,
  type ApplicableBillingEvent,
  type BillingRejection,
  type SubscriptionEventType,
  type SubscriptionSnapshot,
  type SubscriptionStatus,
  type TransitionFrom,
} from "../src/billing.ts"
import type { PaidPlan } from "../src/billing.ts"

// applyBillingEvent against migrated PGlite: the transition table, plan timing (upgrades now,
// downgrades and cancellations at the period end), the reply window and the audit trail.

let pg: PGlite
let db: Db
before(async () => {
  pg = new PGlite()
  db = {
    query: async (t, p) => ({ rows: (p?.length ? await pg.query(t, p) : (await pg.exec(t)).at(-1)!).rows as never[] }),
    transaction: (fn) =>
      pg.transaction((tx) => fn({ query: async (t, p) => ({ rows: (p?.length ? await tx.query(t, p) : (await tx.exec(t)).at(-1)!).rows as never[] }) })),
    close: () => pg.close(),
  }
  await migrate(db)
})
after(() => db.close())
beforeEach(() => db.query("truncate app.organizations cascade").then(() => {}))

const DAY = 24 * 60 * 60 * 1000
const T0 = new Date("2027-01-10T12:00:00Z")
const at = (days: number) => new Date(T0.getTime() + days * DAY)

async function workspace(plan = "free") {
  const { rows } = await db.query<{ id: string }>("insert into app.organizations (name, plan) values ('Kahve', $1) returning id", [plan])
  return rows[0]!.id
}
const planOf = async (id: string) => (await db.query<{ plan: string }>("select plan from app.organizations where id = $1", [id])).rows[0]!.plan

let seq = 0
const snapshot = (patch: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => ({
  provider: "paddle",
  providerSubscriptionId: "sub_1",
  customerId: "ctm_1",
  plan: "pro",
  interval: "month",
  status: "active",
  currentPeriodStart: T0,
  currentPeriodEnd: at(31),
  cancelAtPeriodEnd: false,
  scheduledChange: null,
  ...patch,
})
const subEvent = (organizationId: string, type: SubscriptionEventType, occurredAt: Date, patch: Partial<SubscriptionSnapshot> = {}): ApplicableBillingEvent => ({
  type,
  provider: "paddle",
  eventId: `evt_${++seq}`,
  organizationId,
  occurredAt,
  subscription: snapshot(patch),
})
const apply = (event: ApplicableBillingEvent, now = event.occurredAt) => db.transaction((tx) => applyBillingEvent(tx, event, now))

/** A workspace whose subscription is in `status` (or has none), stored at T0. */
async function workspaceIn(from: TransitionFrom, plan: PaidPlan = "pro") {
  const org = await workspace()
  if (from === "none") return org
  // reach the status the way the provider would, through valid events
  const path: Record<Exclude<TransitionFrom, "none">, [SubscriptionEventType, SubscriptionStatus][]> = {
    trialing: [["subscription.created", "trialing"]],
    active: [["subscription.created", "active"]],
    past_due: [["subscription.created", "active"], ["subscription.past_due", "past_due"]],
    paused: [["subscription.created", "active"], ["subscription.paused", "paused"]],
    canceled: [["subscription.created", "active"], ["subscription.canceled", "canceled"]],
  }
  let t = -3
  for (const [type, status] of path[from]) {
    // a cancellation at the very end of the period, so it takes effect at once
    const occurredAt = status === "canceled" ? at(31) : at(t++)
    const r = await apply(subEvent(org, type, occurredAt, { plan, status }))
    assert.equal(r.outcome, "applied", `setting up ${from}`)
  }
  return org
}

describe("transition table", () => {
  const rows: [SubscriptionEventType, TransitionFrom, SubscriptionStatus, boolean][] = [
    ["subscription.created", "none", "active", true],
    ["subscription.created", "none", "trialing", true],
    ["subscription.created", "none", "past_due", false],
    ["subscription.created", "none", "canceled", false],
    ["subscription.created", "active", "active", false],
    ["subscription.activated", "trialing", "active", true],
    ["subscription.activated", "none", "active", true],
    ["subscription.activated", "active", "active", true],
    ["subscription.activated", "past_due", "active", false],
    ["subscription.activated", "trialing", "trialing", false],
    ["subscription.updated", "active", "active", true],
    ["subscription.updated", "past_due", "active", true],
    ["subscription.updated", "paused", "active", true],
    ["subscription.updated", "active", "trialing", false],
    ["subscription.updated", "paused", "past_due", false],
    ["subscription.updated", "canceled", "active", false],
    ["subscription.past_due", "active", "past_due", true],
    ["subscription.past_due", "trialing", "past_due", true],
    ["subscription.past_due", "past_due", "past_due", true],
    ["subscription.past_due", "paused", "past_due", false],
    ["subscription.past_due", "active", "active", false],
    ["subscription.paused", "active", "paused", true],
    ["subscription.paused", "past_due", "paused", true],
    ["subscription.paused", "canceled", "paused", false],
    ["subscription.paused", "active", "active", false],
    ["subscription.canceled", "active", "canceled", true],
    ["subscription.canceled", "past_due", "canceled", true],
    ["subscription.canceled", "paused", "canceled", true],
    ["subscription.canceled", "canceled", "canceled", true],
    ["subscription.canceled", "active", "active", false],
  ]
  for (const [type, from, to, valid] of rows) {
    test(`${type}: ${from} → ${to} is ${valid ? "valid" : "rejected"}`, () => assert.equal(isValidTransition(type, from, to), valid))
  }
})

describe("applyBillingEvent: transitions against stored state", () => {
  type Row = {
    name: string
    from: TransitionFrom
    type: SubscriptionEventType
    patch?: Partial<SubscriptionSnapshot>
    /** When the event happened; after the setup's events. */
    day?: number
    expect: { outcome: "applied"; status: SubscriptionStatus; plan: string } | { outcome: "rejected"; reason: BillingRejection } | { outcome: "stale" | "ignored" }
  }
  const rows: Row[] = [
    { name: "first checkout", from: "none", type: "subscription.created", expect: { outcome: "applied", status: "active", plan: "pro" } },
    { name: "trial start", from: "none", type: "subscription.created", patch: { status: "trialing" }, expect: { outcome: "applied", status: "trialing", plan: "pro" } },
    { name: "trial converts", from: "trialing", type: "subscription.activated", expect: { outcome: "applied", status: "active", plan: "pro" } },
    { name: "renewal fails: grace keeps the plan", from: "active", type: "subscription.past_due", patch: { status: "past_due" }, expect: { outcome: "applied", status: "past_due", plan: "pro" } },
    { name: "paid after failing", from: "past_due", type: "subscription.updated", expect: { outcome: "applied", status: "active", plan: "pro" } },
    { name: "paused", from: "active", type: "subscription.paused", patch: { status: "paused" }, expect: { outcome: "applied", status: "paused", plan: "free" } },
    { name: "resumed", from: "paused", type: "subscription.updated", expect: { outcome: "applied", status: "active", plan: "pro" } },
    { name: "dunning ends it: Free now", from: "past_due", type: "subscription.canceled", patch: { status: "canceled" }, expect: { outcome: "applied", status: "canceled", plan: "free" } },
    { name: "a trial canceled: Free now", from: "trialing", type: "subscription.canceled", patch: { status: "canceled" }, expect: { outcome: "applied", status: "canceled", plan: "free" } },
    { name: "a new subscription after a canceled one", from: "canceled", type: "subscription.created", patch: { providerSubscriptionId: "sub_2", plan: "starter", currentPeriodStart: at(40), currentPeriodEnd: at(71) }, day: 40, expect: { outcome: "applied", status: "active", plan: "starter" } },
    { name: "created twice", from: "active", type: "subscription.created", expect: { outcome: "rejected", reason: "subscription_exists" } },
    { name: "a second live subscription", from: "active", type: "subscription.created", patch: { providerSubscriptionId: "sub_2" }, expect: { outcome: "rejected", reason: "subscription_exists" } },
    { name: "an update for another subscription", from: "active", type: "subscription.updated", patch: { providerSubscriptionId: "sub_2" }, expect: { outcome: "rejected", reason: "subscription_mismatch" } },
    { name: "a canceled subscription can't come back", from: "canceled", type: "subscription.updated", day: 40, expect: { outcome: "rejected", reason: "invalid_transition" } },
    { name: "back into trial", from: "active", type: "subscription.updated", patch: { status: "trialing" }, expect: { outcome: "rejected", reason: "invalid_transition" } },
    { name: "past_due from paused", from: "paused", type: "subscription.past_due", patch: { status: "past_due" }, expect: { outcome: "rejected", reason: "invalid_transition" } },
    { name: "an event whose status doesn't fit its type", from: "active", type: "subscription.paused", expect: { outcome: "rejected", reason: "invalid_transition" } },
    { name: "created with past_due", from: "none", type: "subscription.created", patch: { status: "past_due" }, expect: { outcome: "rejected", reason: "invalid_transition" } },
    { name: "older than what is stored", from: "active", type: "subscription.updated", day: -10, expect: { outcome: "stale" } },
    { name: "the late end of a replaced subscription", from: "active", type: "subscription.canceled", patch: { providerSubscriptionId: "sub_old", status: "canceled" }, expect: { outcome: "ignored" } },
    { name: "canceled before we saw it, without a period", from: "none", type: "subscription.canceled", patch: { status: "canceled", currentPeriodStart: null, currentPeriodEnd: null }, expect: { outcome: "ignored" } },
  ]

  for (const row of rows) {
    test(`${row.name}: ${row.type} from ${row.from}`, async () => {
      const org = await workspaceIn(row.from)
      const before = await getSubscription(db, org)
      const planBefore = await planOf(org)
      const event = subEvent(org, row.type, at(row.day ?? 1), row.patch)
      const result = await apply(event)
      assert.equal(result.outcome, row.expect.outcome)
      if (row.expect.outcome === "applied") {
        const stored = await getSubscription(db, org)
        assert.equal(stored?.status, row.expect.status)
        assert.equal(await planOf(org), row.expect.plan)
      } else {
        if (row.expect.outcome === "rejected") assert.equal(result.outcome === "rejected" && result.reason, row.expect.reason)
        assert.deepEqual(await getSubscription(db, org), before, "nothing written")
        assert.equal(await planOf(org), planBefore)
      }
    })
  }
})

describe("applyBillingEvent: when plan changes take effect", () => {
  test("an upgrade applies now", async () => {
    const org = await workspaceIn("active", "starter")
    const r = await apply(subEvent(org, "subscription.updated", at(5), { plan: "business" }))
    assert.equal(r.outcome, "applied")
    assert.equal(await planOf(org), "business")
    assert.equal((await getSubscription(db, org))?.scheduledChange, null)
  })

  test("a downgrade is scheduled for the period end, then applies at the renewal", async () => {
    const org = await workspaceIn("active", "business")
    await apply(subEvent(org, "subscription.updated", at(5), { plan: "starter" }))
    const stored = await getSubscription(db, org)
    assert.equal(stored?.plan, "business")
    assert.deepEqual(stored?.scheduledChange, { action: "change", plan: "starter", interval: "month", effectiveAt: at(31).toISOString() })
    assert.equal(await planOf(org), "business")

    // the renewal reports the lower plan for the new period
    await apply(subEvent(org, "subscription.updated", at(31), { plan: "starter", currentPeriodStart: at(31), currentPeriodEnd: at(59) }))
    assert.equal((await getSubscription(db, org))?.plan, "starter")
    assert.equal(await planOf(org), "starter")
  })

  test("a downgrade that also switches the billing interval applies at once (Paddle prorates and credits it)", async () => {
    const org = await workspaceIn("active", "business")
    await apply(subEvent(org, "subscription.updated", at(5), { plan: "starter", interval: "year", currentPeriodStart: at(5), currentPeriodEnd: at(370) }))
    const stored = await getSubscription(db, org)
    assert.equal(stored?.plan, "starter")
    assert.equal(stored?.interval, "year")
    assert.equal(stored?.scheduledChange, null)
    assert.equal(await planOf(org), "starter")
  })

  test("a due downgrade applies even when the renewal's webhook is lost", async () => {
    const org = await workspaceIn("active", "business")
    await apply(subEvent(org, "subscription.updated", at(5), { plan: "pro" }))
    assert.deepEqual(await refreshEffectivePlans(db, at(30.9)), [])
    assert.deepEqual(await refreshEffectivePlans(db, at(31)), [{ plan: "pro", previous: "business", source: "subscription", changed: true }])
  })

  test("an upgrade takes back a scheduled downgrade", async () => {
    const org = await workspaceIn("active", "pro")
    await apply(subEvent(org, "subscription.updated", at(5), { plan: "starter" }))
    await apply(subEvent(org, "subscription.updated", at(6), { plan: "business" }))
    const stored = await getSubscription(db, org)
    assert.equal(stored?.plan, "business")
    assert.equal(stored?.scheduledChange, null)
  })

  test("a cancellation while paid up runs to the period end", async () => {
    const org = await workspaceIn("active", "pro")
    // Paddle drops the period on cancellation
    const r = await apply(subEvent(org, "subscription.canceled", at(10), { status: "canceled", currentPeriodStart: null, currentPeriodEnd: null }))
    assert.equal(r.outcome, "applied")
    const stored = await getSubscription(db, org)
    assert.equal(stored?.status, "canceled")
    assert.deepEqual(stored?.scheduledChange, { action: "cancel", effectiveAt: at(31).toISOString() })
    assert.equal(await planOf(org), "pro")
    assert.deepEqual(await refreshEffectivePlans(db, at(31)), [{ plan: "free", previous: "pro", source: "free", changed: true }])
  })

  test("a running override comes first, even below the subscription's plan", async () => {
    const org = await workspace()
    await db.transaction((tx) => grantPlanOverride(tx, { organizationId: org, plan: "starter", reason: "partner", startsAt: at(-5), endsAt: at(20) }, T0))
    const r = await apply(subEvent(org, "subscription.created", T0, { plan: "business" }))
    assert.ok(r.outcome === "applied")
    assert.deepEqual({ plan: r.plan.plan, source: r.plan.source }, { plan: "starter", source: "override" })
    assert.deepEqual(await refreshEffectivePlans(db, at(20)), [{ plan: "business", previous: "starter", source: "subscription", changed: true }])
  })
})

describe("applyBillingEvent: payments and customers", () => {
  const payment = (organizationId: string, type: "transaction.completed" | "transaction.payment_failed", patch: { subscriptionId?: string | null; customerId?: string | null } = {}): ApplicableBillingEvent => ({
    type,
    provider: "paddle",
    eventId: `evt_${++seq}`,
    organizationId,
    occurredAt: at(2),
    subscriptionId: "sub_1",
    customerId: "ctm_1",
    ...patch,
  })

  const rows: { name: string; from: TransitionFrom; event: (org: string) => ApplicableBillingEvent; expect: "applied" | BillingRejection }[] = [
    { name: "a renewal paid", from: "active", event: (o) => payment(o, "transaction.completed"), expect: "applied" },
    { name: "a renewal failed", from: "active", event: (o) => payment(o, "transaction.payment_failed"), expect: "applied" },
    { name: "a first checkout's payment before its subscription", from: "none", event: (o) => payment(o, "transaction.completed", { subscriptionId: "sub_9" }), expect: "applied" },
    { name: "a payment for another subscription", from: "active", event: (o) => payment(o, "transaction.completed", { subscriptionId: "sub_9" }), expect: "subscription_mismatch" },
    { name: "a payment from another customer", from: "active", event: (o) => payment(o, "transaction.completed", { customerId: "ctm_9" }), expect: "customer_mismatch" },
    { name: "the customer updated", from: "active", event: (o) => ({ type: "customer.updated", provider: "paddle", eventId: "evt_c", organizationId: o, occurredAt: at(2), customerId: "ctm_1" }), expect: "applied" },
    { name: "another customer updated", from: "active", event: (o) => ({ type: "customer.updated", provider: "paddle", eventId: "evt_c", organizationId: o, occurredAt: at(2), customerId: "ctm_9" }), expect: "customer_mismatch" },
  ]
  for (const row of rows) {
    test(`${row.name}: ${row.expect}`, async () => {
      const org = await workspaceIn(row.from)
      const before = await getSubscription(db, org)
      const r = await apply(row.event(org), at(2))
      if (row.expect === "applied") assert.equal(r.outcome, "applied")
      else assert.equal(r.outcome === "rejected" && r.reason, row.expect)
      assert.deepEqual(await getSubscription(db, org), before, "payments change no subscription state")
    })
  }

  test("a subscription event from another customer is rejected", async () => {
    const org = await workspace()
    await db.transaction((tx) => upsertBillingCustomer(tx, { organizationId: org, provider: "paddle", providerCustomerId: "ctm_other" }))
    const r = await apply(subEvent(org, "subscription.created", T0))
    assert.equal(r.outcome === "rejected" && r.reason, "customer_mismatch")
    assert.equal(await getSubscription(db, org), null)
  })

  test("an unknown workspace", async () => {
    assert.equal((await apply(subEvent("6f1c2b9e-4d3a-4c5b-9a8e-1f2d3c4b5a69", "subscription.created", T0))).outcome, "unknown_organization")
  })
})

describe("applyBillingEvent: reply window and audit", () => {
  test("a plan change moves the window's usage onto the subscription's period", async () => {
    const org = await workspace()
    const calendar = new Date("2027-01-01T00:00:00Z")
    await addReplyUsage(db, org, calendar, 40)
    await apply(subEvent(org, "subscription.created", T0))
    assert.equal(await replyUsageFifths(db, org, T0), 40, "carried over")
    assert.equal(await replyUsageFifths(db, org, calendar), 0)

    // dropping to Free goes back to the calendar month, with the count
    await addReplyUsage(db, org, T0, 5)
    await apply(subEvent(org, "subscription.past_due", at(1), { status: "past_due" }))
    await apply(subEvent(org, "subscription.canceled", at(2), { status: "canceled" }))
    assert.equal(await planOf(org), "free")
    assert.equal(await replyUsageFifths(db, org, calendar), 45)
  })

  test("overage stays on the old window, where it is billed", async () => {
    const org = await workspace()
    const calendar = new Date("2027-01-01T00:00:00Z")
    await addReplyUsage(db, org, calendar, 30, { allowanceFifths: 20, capFifths: 500 })
    await apply(subEvent(org, "subscription.created", T0))
    assert.equal(await replyUsageFifths(db, org, T0), 30)
    assert.equal(await replyUsageFifths(db, org, calendar), 10)
  })

  test("an unchanged plan leaves the window alone", async () => {
    const org = await workspaceIn("active")
    await addReplyUsage(db, org, T0, 5)
    await apply(subEvent(org, "subscription.updated", at(5), { interval: "month" }))
    assert.equal(await replyUsageFifths(db, org, T0), 5)
  })

  test("what changed is in the audit log under system:billing", async () => {
    const org = await workspace()
    const r = await apply(subEvent(org, "subscription.created", T0))
    assert.ok(r.outcome === "applied" && r.auditId)
    const { rows } = await db.query<{ actor_id: string | null; actor_email: string; action: string; target_id: string; reason: string; before: any; after: any }>(
      "select actor_id, actor_email, action, target_id, reason, before, after from app.admin_audit_log where id = $1::bigint",
      [r.auditId],
    )
    const entry = rows[0]!
    assert.equal(entry.actor_id, null)
    assert.equal(entry.actor_email, BILLING_AUDIT_ACTOR)
    assert.equal(entry.action, "billing.subscription.created")
    assert.equal(entry.target_id, org)
    assert.match(entry.reason, /^paddle evt_\d+$/)
    assert.deepEqual(entry.before, { plan: "free", subscription: null })
    assert.equal(entry.after.plan, "pro")
    assert.equal(entry.after.subscription.status, "active")

    // a payment that changes nothing isn't logged; a rejected event isn't either
    // the log is append-only, so it outlives the other tests' workspaces: count this one's
    const count = async () => (await db.query<{ n: number }>("select count(*)::int as n from app.admin_audit_log where target_id = $1", [org])).rows[0]!.n
    await apply({ type: "transaction.completed", provider: "paddle", eventId: "evt_t", organizationId: org, occurredAt: at(1), subscriptionId: "sub_1", customerId: "ctm_1" })
    await apply(subEvent(org, "subscription.created", at(2)))
    assert.equal(await count(), 1)
  })
})
