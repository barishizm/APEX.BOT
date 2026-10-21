import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import { getSubscription, type Db, type Subscription } from "@apex/db"
import { reconcileSubscriptions, subscriptionDrift } from "../lib/billing/reconcile.ts"
import type { BillingProvider, NormalizedSubscription, ProviderSubscription } from "../lib/billing/types.ts"

// The nightly reconciliation (lib/billing/reconcile.ts) against migrated PGlite, with a provider that
// answers from a fixed list, as Paddle's GET /subscriptions would.

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
  const { migrate } = await import("@apex/db/migrate")
  await migrate(db)
})
after(() => db.close())
beforeEach(() => db.query("truncate app.organizations cascade").then(() => {}))

const SUB = "sub_01hv8x29kz0t586xy6zn1a62ny"
const OTHER = "sub_01hv8x29kz0t586xy6zn1a6zzz"
const CTM = "ctm_01hv8x29kz0t586xy6zn1a62ny"
const START = new Date("2026-10-10T12:00:00Z")
const END = new Date("2026-11-10T12:00:00Z")
const NOW = new Date("2026-10-21T04:00:00Z")

async function workspace(opts: { plan?: string; customer?: string; sub?: Partial<Subscription> | false } = {}) {
  const { rows } = await db.query<{ id: string }>("insert into app.organizations (name, plan) values ('Kahve', $1) returning id", [opts.plan ?? "pro"])
  const org = rows[0]!.id
  await db.query("insert into app.billing_customers (organization_id, provider, provider_customer_id) values ($1, 'paddle', $2)", [org, opts.customer ?? CTM])
  if (opts.sub !== false) {
    const s = opts.sub ?? {}
    await db.query(
      `insert into app.subscriptions (organization_id, provider, provider_subscription_id, plan, "interval", status, current_period_start,
         current_period_end, cancel_at_period_end, scheduled_change, provider_updated_at, grace_until)
       values ($1, 'paddle', $2, $3, $4, $5, $6, $7, $8, $9, $10, case when $5 = 'past_due' then $10::timestamptz + interval '7 days' end)`,
      [
        org,
        s.providerSubscriptionId ?? SUB,
        s.plan ?? "pro",
        s.interval ?? "month",
        s.status ?? "active",
        s.currentPeriodStart ?? START,
        s.currentPeriodEnd ?? END,
        s.cancelAtPeriodEnd ?? false,
        s.scheduledChange ? JSON.stringify(s.scheduledChange) : null,
        s.providerUpdatedAt ?? START,
      ],
    )
  }
  return org
}

function live(over: Partial<NormalizedSubscription> = {}, organizationId: string | null = null): ProviderSubscription {
  const subscription: NormalizedSubscription = {
    provider: "paddle",
    providerSubscriptionId: SUB,
    customerId: CTM,
    plan: "pro",
    interval: "month",
    status: "active",
    currentPeriodStart: START,
    currentPeriodEnd: END,
    cancelAtPeriodEnd: false,
    scheduledChange: null,
    providerUpdatedAt: NOW,
    ...over,
  }
  return { providerSubscriptionId: subscription.providerSubscriptionId, organizationId, customerId: subscription.customerId, subscription }
}

function fakePaddle(listed: ProviderSubscription[], single: Record<string, ProviderSubscription | null> = {}) {
  const fetched: string[] = []
  const provider = {
    id: "paddle",
    environment: "sandbox",
    listSubscriptions: async () => listed,
    async fetchSubscription(id: string) {
      fetched.push(id)
      return single[id] ?? null
    },
  } as unknown as BillingProvider
  return { provider, fetched }
}

const planOf = async (org: string) => (await db.query<{ plan: string }>("select plan from app.organizations where id = $1", [org])).rows[0]!.plan

describe("comparing", () => {
  const stored = (over: Partial<Subscription> = {}): Subscription => ({
    organizationId: "o",
    provider: "paddle",
    providerSubscriptionId: SUB,
    plan: "pro",
    interval: "month",
    status: "active",
    currentPeriodStart: START,
    currentPeriodEnd: END,
    cancelAtPeriodEnd: false,
    scheduledChange: null,
    graceUntil: null,
    providerUpdatedAt: START,
    ...over,
  })

  test("the same subscription agrees", () => {
    assert.deepEqual(subscriptionDrift(stored(), live().subscription!), [])
  })

  test("a downgrade stored as a scheduled change agrees with the provider's lower items", () => {
    const s = stored({ scheduledChange: { action: "change", plan: "starter", interval: "month", effectiveAt: END.toISOString() } })
    assert.deepEqual(subscriptionDrift(s, live({ plan: "starter" }).subscription!), [])
    assert.deepEqual(subscriptionDrift(stored(), live({ plan: "starter" }).subscription!), ["plan"])
  })

  test("names what differs", () => {
    assert.deepEqual(subscriptionDrift(null, live().subscription!), ["subscription"])
    assert.deepEqual(subscriptionDrift(stored(), live({ status: "past_due" }).subscription!), ["status"])
    assert.deepEqual(subscriptionDrift(stored(), live({ interval: "year", currentPeriodEnd: new Date("2027-10-10T12:00:00Z") }).subscription!), ["interval", "period"])
    assert.deepEqual(subscriptionDrift(stored(), live({ cancelAtPeriodEnd: true }).subscription!), ["cancelAtPeriodEnd"])
    // Paddle drops the period of a canceled subscription
    assert.deepEqual(subscriptionDrift(stored({ status: "canceled" }), live({ status: "canceled", currentPeriodEnd: null }).subscription!), [])
  })
})

describe("reconciling", () => {
  test("leaves a subscription that matches alone", async () => {
    const org = await workspace()
    const result = await reconcileSubscriptions({ db, provider: fakePaddle([live()]).provider }, "run")
    assert.deepEqual([result.matched, result.fixed, result.unresolved, result.drifts.length], [1, 0, 0, 0])
    assert.equal((await getSubscription(db, org))!.providerUpdatedAt.getTime(), START.getTime(), "nothing written")
  })

  test("applies a cancellation whose webhook was lost, and moves the workspace to Free", async () => {
    const org = await workspace({ sub: { cancelAtPeriodEnd: true, currentPeriodEnd: new Date("2026-10-20T12:00:00Z") } })
    const notified: string[][] = []
    const { provider, fetched } = fakePaddle([], { [SUB]: live({ status: "canceled", currentPeriodStart: null, currentPeriodEnd: null }) })
    const result = await reconcileSubscriptions({ db, provider, notify: async (ids) => notified.push(ids) }, "run")
    assert.deepEqual(fetched, [SUB], "stored as live, not listed: asked for by id")
    assert.equal(result.fixed, 1)
    assert.deepEqual(result.drifts[0], { organizationId: org, subscriptionId: SUB, fields: ["status"], outcome: "fixed", change: "pro/month active → pro/month canceled" })
    assert.equal((await getSubscription(db, org))!.status, "canceled")
    assert.equal(await planOf(org), "free")
    assert.deepEqual(notified, [[org]])
    const audit = await db.query<{ reason: string }>("select reason from app.admin_audit_log where action = 'billing.subscription.canceled' and target_id = $1", [org])
    assert.equal(audit.rows[0]?.reason, `paddle reconcile:run:${SUB}`)
  })

  test("stores a subscription whose created webhook was lost, for the workspace its signed custom data names", async () => {
    const org = await workspace({ plan: "free", sub: false })
    const result = await reconcileSubscriptions({ db, provider: fakePaddle([live({}, org)]).provider }, "run")
    assert.equal(result.fixed, 1)
    assert.equal((await getSubscription(db, org))!.providerSubscriptionId, SUB)
    assert.equal(await planOf(org), "pro")
  })

  test("applies an upgrade whose webhook was lost", async () => {
    const org = await workspace({ plan: "starter", sub: { plan: "starter" } })
    const result = await reconcileSubscriptions({ db, provider: fakePaddle([live({ plan: "business" })]).provider }, "run")
    assert.deepEqual(result.drifts.map((d) => [d.fields, d.outcome]), [[["plan"], "fixed"]])
    assert.equal(await planOf(org), "business")
  })

  test("reports a live subscription no workspace claims, and doesn't store it", async () => {
    const result = await reconcileSubscriptions({ db, provider: fakePaddle([live({ customerId: "ctm_01hv8x29kz0t586xy6zn1a6zzz" })]).provider }, "run")
    assert.deepEqual(result.drifts.map((d) => d.outcome), ["unmatched"])
    assert.equal(result.unresolved, 1)
    assert.equal((await db.query("select 1 from app.subscriptions")).rows.length, 0)
  })

  test("never attaches an unsigned subscription to a workspace through its customer alone", async () => {
    const org = await workspace({ plan: "free", sub: false })
    const result = await reconcileSubscriptions({ db, provider: fakePaddle([live({}, null)]).provider }, "run")
    assert.deepEqual(result.drifts.map((d) => [d.organizationId, d.outcome]), [[org, "unmatched"]])
    assert.equal(await getSubscription(db, org), null)
    assert.equal(await planOf(org), "free")
  })

  test("reports a stored subscription the provider doesn't have", async () => {
    await workspace()
    const result = await reconcileSubscriptions({ db, provider: fakePaddle([]).provider }, "run")
    assert.deepEqual(result.drifts.map((d) => d.outcome), ["missing"])
  })

  test("rejects a second live subscription for a workspace instead of replacing the first", async () => {
    const org = await workspace()
    const result = await reconcileSubscriptions({ db, provider: fakePaddle([live(), live({ providerSubscriptionId: OTHER }, org)]).provider }, "run")
    assert.equal(result.matched, 1)
    assert.equal(result.drifts[0]?.outcome, "rejected")
    assert.match(result.drifts[0]?.detail ?? "", /^subscription_mismatch/)
    assert.equal((await getSubscription(db, org))!.providerSubscriptionId, SUB)
  })

  test("a webhook newer than the read wins", async () => {
    const org = await workspace({ sub: { status: "past_due", providerUpdatedAt: new Date(NOW.getTime() + 60_000) } })
    const result = await reconcileSubscriptions({ db, provider: fakePaddle([live()]).provider }, "run")
    assert.deepEqual(result.drifts.map((d) => d.outcome), ["stale"])
    assert.equal((await getSubscription(db, org))!.status, "past_due")
  })

  test("skips subscriptions for prices that aren't our plans", async () => {
    const result = await reconcileSubscriptions({ db, provider: fakePaddle([{ providerSubscriptionId: OTHER, organizationId: null, customerId: null, subscription: null }]).provider }, "run")
    assert.deepEqual([result.providerLive, result.matched, result.unresolved], [1, 0, 0])
  })

  test("a failure for one subscription doesn't stop the others", async () => {
    await workspace()
    const CTM2 = "ctm_01hv8x29kz0t586xy6zn1a6zzz"
    const org2 = await workspace({ customer: CTM2, sub: { providerSubscriptionId: OTHER, cancelAtPeriodEnd: true, currentPeriodEnd: new Date("2026-10-20T12:00:00Z") } })
    const provider = {
      ...fakePaddle([]).provider,
      listSubscriptions: async () => [],
      async fetchSubscription(id: string) {
        if (id === SUB) throw new Error("Paddle GET /subscriptions: HTTP 500")
        return live({ providerSubscriptionId: OTHER, customerId: CTM2, status: "canceled", currentPeriodStart: null, currentPeriodEnd: null })
      },
    } as unknown as BillingProvider
    const result = await reconcileSubscriptions({ db, provider }, "run")
    assert.deepEqual(result.drifts.map((d) => d.outcome).sort(), ["failed", "fixed"])
    assert.equal(await planOf(org2), "free")
  })
})
