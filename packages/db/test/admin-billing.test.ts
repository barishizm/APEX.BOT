import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import { inSavepoints, type Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { AdminError } from "../src/admin.ts"
import { recordBillingEvent, upsertSubscription, type SubscriptionInput } from "../src/billing.ts"
import { adminGrantComp, adminRevokeComp, getAdminBillingOverview, getAdminWorkspaceBilling, getBillingEvent, monthlyCents } from "../src/admin-billing.ts"

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
beforeEach(() => db.query("truncate app.users, app.organizations, app.billing_events cascade").then(() => {}))

const DAY = 86_400_000
const T0 = new Date("2027-03-15T12:00:00Z")
const at = (days: number) => new Date(T0.getTime() + days * DAY)
const code = (c: string) => (err: unknown) => err instanceof AdminError && err.code === c

let n = 0
async function workspace(plan = "free") {
  n++
  const { rows } = await db.query<{ id: string }>("insert into app.organizations (name, plan) values ($1, $2) returning id", [`Shop ${n}`, plan])
  const u = await db.query<{ id: string }>(
    "insert into app.users (email, username, account_type, terms_accepted_at, terms_version) values ($1, $2, 'personal', now(), 'v1') returning id",
    [`owner${n}@example.com`, `owner${n}`],
  )
  await db.query("insert into app.organization_members (organization_id, user_id, role) values ($1, $2, 'owner')", [rows[0]!.id, u.rows[0]!.id])
  return { org: rows[0]!.id, user: u.rows[0]!.id }
}
const planOf = async (id: string) => (await db.query<{ plan: string }>("select plan from app.organizations where id = $1", [id])).rows[0]!.plan

const subscribe = (organizationId: string, patch: Partial<SubscriptionInput> = {}) =>
  db.transaction((tx) =>
    upsertSubscription(
      tx,
      {
        organizationId,
        provider: "paddle",
        providerSubscriptionId: `sub_${organizationId.slice(0, 8)}`,
        plan: "pro",
        interval: "month",
        status: "active",
        currentPeriodStart: at(-5),
        currentPeriodEnd: at(26),
        cancelAtPeriodEnd: false,
        scheduledChange: null,
        providerUpdatedAt: at(-5),
        ...patch,
      },
      T0,
    ),
  )
const grant = (org: string, user: string, plan: unknown, endsAt: unknown, reason = "partner") =>
  db.transaction((tx) => adminGrantComp(tx, org, { plan, endsAt, reason, grantedBy: user }, T0))

describe("comps", () => {
  test("grant a paid plan until a date, replace a running comp, and end it early", async () => {
    const { org, user } = await workspace()
    const c = await grant(org, user, "starter", at(30).toISOString())
    assert.equal(c.extra.plan, "starter")
    assert.equal(await planOf(org), "starter")
    // a second comp replaces the first rather than stacking with it
    await grant(org, user, "pro", at(60).toISOString(), "upgrade for a pilot")
    const billing = (await getAdminWorkspaceBilling(db, org, T0))!
    assert.equal(await planOf(org), "pro")
    assert.equal(billing.source, "override")
    assert.deepEqual(billing.comps.map((x) => [x.plan, x.running, !!x.revokedAt, x.reason]), [["pro", true, false, "upgrade for a pilot"], ["starter", false, true, "partner"]])

    const running = billing.comps[0]!.id
    const other = await workspace()
    await assert.rejects(db.transaction((tx) => adminRevokeComp(tx, other.org, { compId: running, revokedBy: user }, T0)), code("not_found"))
    await assert.rejects(db.transaction((tx) => adminRevokeComp(tx, org, { compId: billing.comps[1]!.id, revokedBy: user }, T0)), code("not_found"))
    const r = await db.transaction((tx) => adminRevokeComp(tx, org, { compId: running, revokedBy: user }, T0))
    assert.deepEqual([r.before, r.after], [{ plan: "pro", comp: { id: running, plan: "pro", endsAt: at(60).toISOString() } }, { plan: "free", comp: null }])
    assert.equal(await planOf(org), "free")
  })

  test("needs a paid plan and an end date in the next two years", async () => {
    const { org, user } = await workspace()
    for (const plan of ["free", "gold", undefined]) await assert.rejects(grant(org, user, plan, at(30).toISOString()), code("invalid_input"))
    for (const endsAt of [undefined, "", "soon", at(-1).toISOString(), T0.toISOString(), at(731).toISOString()])
      await assert.rejects(grant(org, user, "pro", endsAt), code("invalid_input"))
    await assert.rejects(grant(org, user, "pro", at(30).toISOString(), "  "), code("invalid_input"))
    await assert.rejects(grant("00000000-0000-0000-0000-000000000000", user, "pro", at(30).toISOString()), code("not_found"))
    assert.equal(await planOf(org), "free")
  })

  test("refused while a subscription decides the plan, allowed once it has run out", async () => {
    const { org, user } = await workspace()
    await subscribe(org)
    assert.equal((await getAdminWorkspaceBilling(db, org, T0))!.mayComp, false)
    await assert.rejects(grant(org, user, "business", at(30).toISOString()), code("invalid_input"))
    // canceled but paid up to the period end: still the subscription's
    await subscribe(org, { status: "canceled", scheduledChange: { action: "cancel", effectiveAt: at(26).toISOString() }, providerUpdatedAt: at(-1) })
    await assert.rejects(grant(org, user, "business", at(30).toISOString()), code("invalid_input"))
    // ran out
    await subscribe(org, { status: "canceled", scheduledChange: null, providerUpdatedAt: at(-0.5) })
    assert.equal((await getAdminWorkspaceBilling(db, org, T0))!.mayComp, true)
    await grant(org, user, "business", at(30).toISOString())
    assert.equal(await planOf(org), "business")
  })
})

describe("overview", () => {
  test("MRR at list price, plan sources, past due and overage", async () => {
    const monthly = await workspace()
    await subscribe(monthly.org, { plan: "starter" })
    const annual = await workspace()
    await subscribe(annual.org, { plan: "pro", interval: "year", cancelAtPeriodEnd: true })
    const late = await workspace()
    await subscribe(late.org, { plan: "business", status: "past_due", providerUpdatedAt: at(-2) })
    const trial = await workspace()
    await subscribe(trial.org, { status: "trialing" })
    const comped = await workspace()
    await grant(comped.org, comped.user, "pro", at(10).toISOString())
    await workspace("pro") // placed by hand before comps
    await workspace()

    const o = await getAdminBillingOverview(db, T0)
    const expected = monthlyCents("starter", "month") + monthlyCents("pro", "year") + monthlyCents("business", "month")
    assert.equal(monthlyCents("pro", "year"), 6500)
    assert.equal(o.mrrCents, expected)
    assert.equal(o.arrCents, expected * 12)
    assert.equal(o.atRiskCents, monthlyCents("business", "month"))
    assert.equal(o.cancelingCents, 6500)
    assert.deepEqual(o.subscriptions, { trialing: 1, active: 2, past_due: 1, paused: 0, canceled: 0 })
    const row = (plan: string) => o.plans.find((p) => p.plan === plan)!
    assert.deepEqual(row("pro").bySource, { subscription: 2, override: 1, manual: 1, free: 0 })
    assert.equal(row("free").workspaces, 1)
    assert.equal(o.plans.reduce((sum, p) => sum + p.workspaces, 0), 7)
    assert.deepEqual(o.pastDue.map((p) => [p.organizationId, p.plan, p.graceUntil.toISOString(), p.since.toISOString(), p.ownerEmail?.endsWith("@example.com")]), [
      [late.org, "business", at(5).toISOString(), at(-2).toISOString(), true],
    ])

    // three blocks billed last month, one window still to bill
    await db.query(
      `insert into app.reply_usage (organization_id, period_start, units, overage_units, overage_billed_at, overage_billed_blocks) values
         ($1, '2027-01-10', 600, 250, '2027-02-11T05:00:00Z', 3),
         ($1, '2027-02-10', 300, 40, null, null)`,
      [monthly.org],
    )
    const later = await getAdminBillingOverview(db, T0)
    assert.equal(later.overage.months.length, 12)
    assert.deepEqual(later.overage.months.at(-1), { month: "2027-03", blocks: 0, cents: 0 })
    assert.deepEqual(later.overage.months.at(-2), { month: "2027-02", blocks: 3, cents: 1500 })
    assert.equal(later.overage.totalCents, 1500)
    assert.deepEqual([later.overage.unbilledWindows, later.overage.unbilledReplies], [1, 40])
  })
})

describe("workspace card", () => {
  test("lists the webhooks about the workspace by its id, subscription or customer", async () => {
    const { org } = await workspace()
    const other = await workspace()
    await subscribe(org)
    await db.query("insert into app.billing_customers (organization_id, provider, provider_customer_id) values ($1, 'paddle', 'ctm_a')", [org])
    const store = (eventId: string, data: object, occurred: number) =>
      recordBillingEvent(db, { provider: "paddle", eventId, eventType: "x", occurredAt: at(occurred), payload: { data } })
    await store("evt_1", { id: `sub_${org.slice(0, 8)}`, customer_id: "ctm_a" }, -3)
    await store("evt_2", { id: "txn_1", subscription_id: `sub_${org.slice(0, 8)}` }, -2)
    await store("evt_3", { id: "ctm_a" }, -1)
    await store("evt_4", { id: "txn_2", custom_data: { organization_id: org } }, 0)
    await store("evt_5", { id: "txn_3", custom_data: { organization_id: other.org }, customer_id: "ctm_b" }, 0)
    const billing = (await getAdminWorkspaceBilling(db, org, T0))!
    assert.deepEqual(billing.events.map((e) => e.eventId), ["evt_4", "evt_3", "evt_2", "evt_1"])
    assert.equal(billing.customerId, "ctm_a")
    assert.equal(billing.subscription?.status, "active")
    assert.equal(billing.source, "subscription")
    assert.equal(await getAdminWorkspaceBilling(db, "nope"), null)
    assert.equal((await getAdminWorkspaceBilling(db, other.org, T0))!.source, "free")
  })

  test("getBillingEvent reads one stored webhook and refuses ids that aren't one", async () => {
    const { id } = await recordBillingEvent(db, { provider: "paddle", eventId: "evt_9", eventType: "x", occurredAt: T0, payload: { a: 1 } })
    assert.deepEqual((await getBillingEvent(db, id))?.payload, { a: 1 })
    for (const bad of ["", "1; drop", "-1", "99999999"]) assert.equal(await getBillingEvent(db, bad), null)
  })
})

test("inSavepoints rolls back only the nested transaction that threw", async () => {
  const { org } = await workspace()
  await db.transaction(async (tx) => {
    const nested = inSavepoints(tx)
    await nested.transaction((t) => t.query("update app.organizations set name = 'kept' where id = $1", [org]))
    await assert.rejects(
      nested.transaction(async (t) => {
        await t.query("update app.organizations set name = 'undone' where id = $1", [org])
        throw new Error("boom")
      }),
    )
  })
  assert.equal((await db.query<{ name: string }>("select name from app.organizations where id = $1", [org])).rows[0]!.name, "kept")
})
