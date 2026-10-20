import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import {
  addReplyUsage,
  effectivePlan,
  finishBillingEvent,
  getSubscription,
  grantPlanOverride,
  listWorkspaceQuotas,
  recordBillingEvent,
  replyUsageFifths,
  refreshEffectivePlans,
  revokePlanOverride,
  startBillingEvent,
  upsertBillingCustomer,
  upsertSubscription,
  type PlanOverride,
  type Subscription,
  type SubscriptionInput,
} from "../src/billing.ts"

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
beforeEach(() => db.query("truncate app.organizations, app.billing_events cascade").then(() => {}))

const DAY = 24 * 60 * 60 * 1000
const T0 = new Date("2027-01-10T12:00:00Z")
const at = (days: number) => new Date(T0.getTime() + days * DAY)

async function workspace(plan = "free") {
  const { rows } = await db.query<{ id: string }>("insert into app.organizations (name, plan) values ('Kahve', $1) returning id", [plan])
  return rows[0]!.id
}
const planOf = async (id: string) => (await db.query<{ plan: string }>("select plan from app.organizations where id = $1", [id])).rows[0]!.plan

const sub = (organizationId: string, patch: Partial<SubscriptionInput> = {}): SubscriptionInput => ({
  organizationId,
  provider: "paddle",
  providerSubscriptionId: "sub_1",
  plan: "pro",
  interval: "month",
  status: "active",
  currentPeriodStart: T0,
  currentPeriodEnd: at(31),
  cancelAtPeriodEnd: false,
  scheduledChange: null,
  providerUpdatedAt: T0,
  ...patch,
})
const upsert = (input: SubscriptionInput, now = input.providerUpdatedAt) => db.transaction((tx) => upsertSubscription(tx, input, now))

describe("effective plan", () => {
  const base: Subscription = { ...sub("o"), graceUntil: null }
  const override = (plan: PlanOverride["plan"], from: number, to: number, revoked = false): PlanOverride => ({ plan, startsAt: at(from), endsAt: at(to), revokedAt: revoked ? at(from) : null })

  test("Free without a subscription or override", () => {
    assert.deepEqual(effectivePlan(null, [], T0), { plan: "free", source: "free" })
  })

  test("trialing and active grant the plan; paused and canceled don't", () => {
    for (const status of ["trialing", "active"] as const) assert.equal(effectivePlan({ ...base, status }, [], T0).plan, "pro")
    for (const status of ["paused", "canceled"] as const) assert.equal(effectivePlan({ ...base, status }, [], T0).plan, "free")
  })

  test("past_due keeps the plan until grace ends", () => {
    const pastDue = { ...base, status: "past_due" as const, graceUntil: at(7) }
    assert.equal(effectivePlan(pastDue, [], at(6.9)).plan, "pro")
    assert.equal(effectivePlan(pastDue, [], at(7)).plan, "free")
  })

  test("cancel at period end runs to the period end", () => {
    const canceling = { ...base, cancelAtPeriodEnd: true }
    assert.equal(effectivePlan(canceling, [], at(30)).plan, "pro")
    assert.equal(effectivePlan(canceling, [], at(31)).plan, "free")
  })

  test("a running override comes before the subscription; the highest of several overrides wins", () => {
    assert.deepEqual(effectivePlan({ ...base, plan: "starter" }, [override("business", -1, 1)], T0), { plan: "business", source: "override" })
    assert.deepEqual(effectivePlan(base, [override("starter", -1, 1)], T0), { plan: "starter", source: "override" })
    assert.deepEqual(effectivePlan(base, [override("starter", -1, 1), override("business", -1, 1)], T0), { plan: "business", source: "override" })
    // not started, ended, revoked
    assert.equal(effectivePlan(null, [override("pro", 1, 2), override("pro", -2, 0), override("pro", -1, 1, true)], T0).plan, "free")
  })
})

describe("subscriptions", () => {
  test("upsert inserts, then updates, and writes the plan in the same transaction", async () => {
    const org = await workspace()
    await db.transaction((tx) => upsertBillingCustomer(tx, { organizationId: org, provider: "paddle", providerCustomerId: "ctm_1" }))
    const first = await upsert(sub(org))
    assert.ok(first.applied)
    assert.deepEqual(first.plan, { plan: "pro", previous: "free", source: "subscription", changed: true })
    assert.equal(await planOf(org), "pro")

    const scheduledChange = { action: "change" as const, plan: "starter" as const, effectiveAt: at(31).toISOString() }
    const second = await upsert(sub(org, { plan: "business", scheduledChange, providerUpdatedAt: at(1) }))
    assert.ok(second.applied)
    assert.equal(second.subscription.plan, "business")
    assert.deepEqual(second.subscription.scheduledChange, scheduledChange)
    assert.equal(await planOf(org), "business")
    assert.equal((await db.query("select * from app.subscriptions")).rows.length, 1)
  })

  test("an event older than or as old as the stored one is rejected", async () => {
    const org = await workspace()
    await upsert(sub(org, { status: "active", providerUpdatedAt: at(2) }))
    assert.deepEqual(await upsert(sub(org, { status: "canceled", providerUpdatedAt: at(1) })), { applied: false, reason: "stale" })
    assert.deepEqual(await upsert(sub(org, { plan: "starter", providerUpdatedAt: at(2) })), { applied: false, reason: "stale" })
    const stored = await getSubscription(db, org)
    assert.equal(stored?.status, "active")
    assert.equal(stored?.plan, "pro")
    assert.equal(await planOf(org), "pro")
  })

  test("a late cancellation of an earlier subscription doesn't replace the new one", async () => {
    const org = await workspace()
    await upsert(sub(org, { providerSubscriptionId: "sub_old", status: "canceled", providerUpdatedAt: at(1) }))
    await upsert(sub(org, { providerSubscriptionId: "sub_new", plan: "starter", providerUpdatedAt: at(2) }))
    // the old one's final event, delivered last but stamped later
    assert.equal((await upsert(sub(org, { providerSubscriptionId: "sub_old", status: "canceled", providerUpdatedAt: at(3) }))).applied, false)
    assert.equal((await getSubscription(db, org))?.providerSubscriptionId, "sub_new")
    assert.equal(await planOf(org), "starter")
  })

  test("grace runs 7 days from the first failure, then the workspace drops to Free", async () => {
    const org = await workspace()
    await upsert(sub(org))
    await upsert(sub(org, { status: "past_due", providerUpdatedAt: at(1) }))
    // a failed retry doesn't extend the grace
    await upsert(sub(org, { status: "past_due", providerUpdatedAt: at(3) }))
    assert.equal((await getSubscription(db, org))?.graceUntil?.toISOString(), at(8).toISOString())
    assert.equal(await planOf(org), "pro")

    assert.deepEqual(await refreshEffectivePlans(db, at(7.9)), [])
    assert.deepEqual(await refreshEffectivePlans(db, at(8)), [{ plan: "free", previous: "pro", source: "free", changed: true }])
    assert.equal(await planOf(org), "free")

    // paid after all: grace clears and the plan comes back
    await upsert(sub(org, { status: "active", providerUpdatedAt: at(9) }))
    assert.equal((await getSubscription(db, org))?.graceUntil, null)
    assert.equal(await planOf(org), "pro")
  })
})

describe("plan overrides", () => {
  test("a comp raises the plan, and revoking or its end restores the subscription's", async () => {
    const org = await workspace()
    await upsert(sub(org, { plan: "starter" }))
    const granted = await db.transaction((tx) => grantPlanOverride(tx, { organizationId: org, plan: "business", reason: "partner", startsAt: T0, endsAt: at(30) }, T0))
    assert.equal(granted.plan.plan, "business")
    assert.equal(await planOf(org), "business")

    assert.deepEqual(await refreshEffectivePlans(db, at(30)), [{ plan: "starter", previous: "business", source: "subscription", changed: true }])

    const second = await db.transaction((tx) => grantPlanOverride(tx, { organizationId: org, plan: "pro", reason: "refund", startsAt: at(30), endsAt: at(60) }, at(30)))
    assert.equal(await planOf(org), "pro")
    assert.equal((await db.transaction((tx) => revokePlanOverride(tx, second.id, null, at(31))))?.plan, "starter")
    assert.equal(await db.transaction((tx) => revokePlanOverride(tx, second.id, null, at(32))), null)
  })

  test("a workspace with no subscription or override keeps a plan set by hand", async () => {
    const org = await workspace("business")
    assert.deepEqual(await refreshEffectivePlans(db, T0), [])
    assert.equal(await planOf(org), "business")
  })
})

describe("webhook inbox", () => {
  test("an event is stored once and processed once", async () => {
    const event = { provider: "paddle" as const, eventId: "evt_1", eventType: "subscription.updated", occurredAt: T0, payload: { data: { id: "sub_1" } } }
    const first = await recordBillingEvent(db, event)
    assert.deepEqual({ ...first, id: undefined }, { id: undefined, duplicate: false, processed: false })

    assert.equal(await startBillingEvent(db, first.id), 1)
    await finishBillingEvent(db, first.id, "boom")
    assert.equal(await startBillingEvent(db, first.id), 2)
    await finishBillingEvent(db, first.id)

    assert.deepEqual(await recordBillingEvent(db, event), { id: first.id, duplicate: true, processed: true })
    assert.equal(await startBillingEvent(db, first.id), null)
    const { rows } = await db.query<{ error: string | null; attempts: number }>("select error, attempts from app.billing_events")
    assert.deepEqual(rows, [{ error: null, attempts: 2 }])
  })
})

describe("reply usage", () => {
  test("adds fifths of a reply to the window and returns its total in fifths", async () => {
    const org = await workspace()
    assert.equal(await addReplyUsage(db, org, T0, 1), 1)
    assert.equal(await addReplyUsage(db, org, T0, 25), 26)
    assert.equal(await addReplyUsage(db, org, at(31), 5), 5)
    await assert.rejects(addReplyUsage(db, org, T0, 0.5))
    // stored in replies, one decimal
    const { rows } = await db.query<{ units: string }>("select units::text from app.reply_usage where organization_id = $1 and period_start = $2", [org, T0])
    assert.equal(rows[0]!.units, "5.2")
    assert.equal(await replyUsageFifths(db, org, T0), 26)
    assert.equal(await replyUsageFifths(db, org, at(62)), 0)
  })

  test("concurrent additions all count", async () => {
    const org = await workspace()
    const weights = Array.from({ length: 40 }, (_, i) => [1, 5, 10, 25][i % 4]!)
    const totals = await Promise.all(weights.map((f) => addReplyUsage(db, org, T0, f)))
    const sum = weights.reduce((a, b) => a + b, 0)
    assert.equal(await replyUsageFifths(db, org, T0), sum)
    // every caller saw a distinct running total, ending at the sum
    assert.equal(new Set(totals).size, weights.length)
    assert.equal(Math.max(...totals), sum)
  })

  test("keeps the part past the allowance as overage, up to the cap", async () => {
    const org = await workspace("starter")
    const overage = { allowanceFifths: 10, capFifths: 15 }
    const overageOf = async () =>
      Number((await db.query<{ o: string }>("select overage_units::text as o from app.reply_usage where organization_id = $1", [org])).rows[0]!.o)
    await addReplyUsage(db, org, T0, 5, overage)
    assert.equal(await overageOf(), 0)
    await addReplyUsage(db, org, T0, 10, overage) // 15 fifths: 5 past the allowance
    assert.equal(await overageOf(), 1)
    await addReplyUsage(db, org, T0, 25, overage) // 40: 30 past it, held to the cap
    assert.equal(await overageOf(), 3)
    await addReplyUsage(db, org, T0, 5) // overage off: what was used under it stays
    assert.equal(await overageOf(), 3)
    // a first reply that already goes past a zero allowance
    const other = await workspace("pro")
    await addReplyUsage(db, other, T0, 10, { allowanceFifths: 0, capFifths: 500 })
    assert.equal((await db.query<{ o: string }>("select overage_units::text as o from app.reply_usage where organization_id = $1", [other])).rows[0]!.o, "2.0")
  })

  test("units must be whole fifths and the overage cap whole blocks", async () => {
    const org = await workspace()
    await assert.rejects(db.query("insert into app.reply_usage (organization_id, period_start, units) values ($1, now(), 0.3)", [org]))
    await assert.rejects(db.query("update app.organizations set overage_enabled = true where id = $1", [org]))
    await assert.rejects(db.query("update app.organizations set overage_cap_units = 150 where id = $1", [org]))
    await db.query("update app.organizations set overage_enabled = true, overage_cap_units = 200 where id = $1", [org])
  })
})

describe("workspace quotas for the chat API", () => {
  async function bot(org: string, opts: { disabled?: boolean } = {}) {
    await db.query(
      `insert into app.bots (organization_id, name, site_key, settings, disabled_at) values ($1, 'Site', 'apex_pk_' || md5(random()::text), '{}'::jsonb, $2)`,
      [org, opts.disabled ? T0 : null],
    )
  }
  const quotaOf = async (org: string, now: Date) => (await listWorkspaceQuotas(db, now)).find((q) => q.organizationId === org)

  test("Free counts calendar months, with its allowance and no overage", async () => {
    const org = await workspace()
    await bot(org)
    assert.deepEqual(await quotaOf(org, T0), { organizationId: org, plan: "free", anchor: null, allowanceFifths: 500, overageCapFifths: 0, enforcePlan: false })
  })

  test("a granting subscription anchors the window; one that no longer grants doesn't", async () => {
    const org = await workspace()
    await bot(org)
    await upsert(sub(org, { plan: "starter" }))
    const q = (await quotaOf(org, at(1)))!
    assert.equal(q.plan, "starter")
    assert.equal(q.anchor?.getTime(), T0.getTime())
    assert.equal(q.allowanceFifths, 3000)
    await upsert(sub(org, { plan: "starter", status: "past_due", providerUpdatedAt: at(2) }), at(2))
    assert.equal((await quotaOf(org, at(8)))!.anchor?.getTime(), T0.getTime(), "within grace")
    assert.equal((await quotaOf(org, at(9.1)))!.anchor, null, "grace over")
  })

  test("overage counts only on a plan that has it, with the owner's cap", async () => {
    const paid = await workspace("pro")
    const free = await workspace("free")
    for (const org of [paid, free]) {
      await bot(org)
      await db.query("update app.organizations set overage_enabled = true, overage_cap_units = 200 where id = $1", [org])
    }
    assert.equal((await quotaOf(paid, T0))!.overageCapFifths, 1000)
    assert.equal((await quotaOf(free, T0))!.overageCapFifths, 0)
  })

  test("only workspaces with a bot that serves", async () => {
    const none = await workspace()
    const disabled = await workspace()
    await bot(disabled, { disabled: true })
    assert.equal(await quotaOf(none, T0), undefined)
    assert.equal(await quotaOf(disabled, T0), undefined)
  })
})
