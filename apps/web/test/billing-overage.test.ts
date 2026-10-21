import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import { listOverageIssues, overageBlocks, type Db } from "@apex/db"
import { billOverage, overageChargeKey, type OverageBilling } from "../lib/billing/overage.ts"
import { BillingError, type BillingProvider, type OneTimeItem, type SubscriptionRef } from "../lib/billing/types.ts"

// The overage cron (lib/billing/overage.ts) against migrated PGlite, with a provider that keeps the
// charges it took by idempotency key, as Paddle's does through the charge's price description.

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
const PRICE = "pri_01hv8xxw3kz0t586xy6zn1a62n"
// the subscription renewed on Jan 10; the window from Dec 10 is closed
const PERIOD = new Date("2027-01-10T12:00:00Z")
const CLOSED = new Date("2026-12-10T12:00:00Z")
const NOW = new Date("2027-01-11T04:30:00Z")

async function workspace(opts: { status?: string; capUnits?: number | null; subscription?: boolean } = {}) {
  const cap = opts.capUnits === undefined ? 1000 : opts.capUnits
  const { rows } = await db.query<{ id: string }>(
    "insert into app.organizations (name, plan, overage_enabled, overage_cap_units) values ('Kahve', 'pro', $1, $2) returning id",
    [cap !== null, cap],
  )
  const org = rows[0]!.id
  if (opts.subscription !== false)
    await db.query(
      `insert into app.subscriptions (organization_id, provider, provider_subscription_id, plan, "interval", status, current_period_start,
         current_period_end, grace_until, provider_updated_at)
       values ($1, 'paddle', $2, 'pro', 'month', $3, $4, $4::timestamptz + interval '1 month', $5, $4)`,
      [org, SUB, opts.status ?? "active", PERIOD, opts.status === "past_due" ? new Date(PERIOD.getTime() + 7 * 86400_000) : null],
    )
  return org
}

/** A window's usage, in replies (units), of which `overage` past the allowance. */
async function usage(org: string, overage: number, periodStart = CLOSED) {
  await db.query("insert into app.reply_usage (organization_id, period_start, units, overage_units) values ($1, $2, $3, $4)", [org, periodStart, 1500 + overage, overage])
}

async function windowOf(org: string, periodStart = CLOSED) {
  const { rows } = await db.query<{ billed: Date | null; blocks: number | null; txn: string | null; error: string | null; attempts: number }>(
    `select overage_billed_at as billed, overage_billed_blocks as blocks, overage_transaction_id as txn, overage_error as error, overage_attempts as attempts
       from app.reply_usage where organization_id = $1 and period_start = $2`,
    [org, periodStart],
  )
  return rows[0]!
}

function fakePaddle(opts: { failWith?: Error; failAfterCharge?: number } = {}) {
  const taken = new Map<string, { sub: SubscriptionRef; items: OneTimeItem[] }>()
  const calls: string[] = []
  let failsLeft = opts.failAfterCharge ?? 0
  const provider = {
    id: "paddle",
    environment: "sandbox",
    async createOneTimeCharge(sub: SubscriptionRef, items: OneTimeItem[], key: string) {
      calls.push(key)
      if (opts.failWith) throw opts.failWith
      if (taken.has(key)) return { transactionId: `txn_${taken.size}`, duplicate: true }
      taken.set(key, { sub, items })
      // Paddle took the charge, but the answer never reached us
      if (failsLeft-- > 0) throw new BillingError("provider_error", "socket hang up")
      return { transactionId: `txn_${taken.size}`, duplicate: false }
    },
  } as unknown as BillingProvider
  return { billing: { provider, priceId: PRICE } satisfies OverageBilling, taken, calls }
}

describe("rounding to blocks of 100", () => {
  test("a block is billed once it is opened", () => {
    assert.deepEqual(overageBlocks(1, 1000), { blocks: 1, capped: false }) // ⅕ of a reply
    assert.deepEqual(overageBlocks(100 * 5, 1000), { blocks: 1, capped: false })
    assert.deepEqual(overageBlocks(100 * 5 + 1, 1000), { blocks: 2, capped: false })
    assert.deepEqual(overageBlocks(250 * 5, 1000), { blocks: 3, capped: false })
    assert.deepEqual(overageBlocks(0, 1000), { blocks: 0, capped: false })
  })

  test("charges the window's overage as whole blocks of the overage price, keyed by workspace and window", async () => {
    const org = await workspace()
    await usage(org, 250.2)
    const { billing, taken } = fakePaddle()
    const result = await billOverage(db, billing, NOW)
    assert.equal(result.billed, 1)
    assert.equal(result.blocks, 3)
    const key = `overage:${org}:${CLOSED.toISOString()}`
    assert.equal(overageChargeKey({ organizationId: org, periodStart: CLOSED }), key)
    assert.deepEqual(taken.get(key)?.items, [{ priceId: PRICE, quantity: 3 }])
    assert.equal(taken.get(key)?.sub.providerSubscriptionId, SUB)
    const w = await windowOf(org)
    assert.equal(w.blocks, 3)
    assert.equal(w.txn, "txn_1")
    assert.equal(w.billed?.getTime(), NOW.getTime())
    const audit = await db.query<{ after: { blocks: number; cents: number } }>("select after from app.admin_audit_log where action = 'billing.overage_charged' and target_id = $1", [org])
    assert.deepEqual([audit.rows[0]?.after.blocks, audit.rows[0]?.after.cents], [3, 1500])
  })

  test("leaves the window the workspace still counts in, and windows without overage", async () => {
    const org = await workspace()
    await usage(org, 120, PERIOD)
    await usage(org, 0)
    const { billing, calls } = fakePaddle()
    const result = await billOverage(db, billing, NOW)
    assert.equal(result.due, 0)
    assert.equal(calls.length, 0)
  })
})

describe("running again", () => {
  test("a second run bills nothing", async () => {
    const org = await workspace()
    await usage(org, 150)
    const { billing, calls } = fakePaddle()
    assert.equal((await billOverage(db, billing, NOW)).billed, 1)
    const again = await billOverage(db, billing, new Date(NOW.getTime() + 86400_000))
    assert.equal(again.due, 0)
    assert.equal(calls.length, 1)
  })

  test("a charge Paddle took whose answer was lost is found by its key and recorded, not billed twice", async () => {
    const org = await workspace()
    await usage(org, 150)
    const { billing, taken, calls } = fakePaddle({ failAfterCharge: 1 })
    const first = await billOverage(db, billing, NOW)
    assert.equal(first.failed, 1)
    assert.equal((await windowOf(org)).billed, null)
    const second = await billOverage(db, billing, NOW)
    assert.deepEqual([second.billed, second.duplicates], [1, 1])
    assert.equal(calls.length, 2)
    assert.equal(taken.size, 1)
    assert.equal((await windowOf(org)).blocks, 2)
  })

  test("concurrent runs charge a window once", async () => {
    const org = await workspace()
    await usage(org, 150)
    const { billing, taken } = fakePaddle()
    const runs = await Promise.all([billOverage(db, billing, NOW), billOverage(db, billing, NOW)])
    assert.equal(runs.reduce((n, r) => n + r.billed, 0), 1)
    assert.equal(taken.size, 1)
  })
})

describe("the cap", () => {
  test("never bills past the owner's cap, even when the usage went over it", async () => {
    const org = await workspace({ capUnits: 1000 })
    await usage(org, 1430)
    const { billing, taken } = fakePaddle()
    const result = await billOverage(db, billing, NOW)
    assert.deepEqual([result.blocks, result.capped], [10, 1])
    assert.equal([...taken.values()][0]!.items[0]!.quantity, 10)
  })

  test("bills to the cap as it stands when the window is charged", async () => {
    const org = await workspace({ capUnits: 300 })
    await usage(org, 450)
    const { billing } = fakePaddle()
    assert.equal((await billOverage(db, billing, NOW)).blocks, 3)
  })

  test("without a cap nothing is billed and the window is reported", async () => {
    const org = await workspace({ capUnits: null })
    await usage(org, 50)
    const { billing, calls } = fakePaddle()
    const result = await billOverage(db, billing, NOW)
    assert.equal(result.failed, 1)
    assert.equal(calls.length, 0)
    assert.match((await windowOf(org)).error ?? "", /no overage cap/)
  })

  test("never past OVERAGE_CAP_MAX_CENTS, whatever the stored cap", () => {
    assert.deepEqual(overageBlocks(30_000 * 5, 1_000_000), { blocks: 200, capped: true })
  })
})

describe("subscriptions that can't be charged", () => {
  test("a canceled subscription isn't charged; the window is kept for staff and retried", async () => {
    const org = await workspace({ status: "canceled" })
    await usage(org, 150)
    const { billing, calls } = fakePaddle()
    const result = await billOverage(db, billing, NOW)
    assert.deepEqual([result.billed, result.failed], [0, 1])
    assert.equal(result.failures[0]?.organizationId, org)
    assert.equal(result.failures[0]?.error, "the subscription is canceled")
    assert.equal(calls.length, 0)
    const w = await windowOf(org)
    assert.deepEqual([w.billed, w.attempts], [null, 1])
    const issues = await listOverageIssues(db)
    assert.equal(issues.total, 1)
    assert.deepEqual([issues.windows[0]?.organizationId, issues.windows[0]?.overageFifths, issues.windows[0]?.error], [org, 750, "the subscription is canceled"])
    // still unbilled, so the next run tries again
    assert.equal((await billOverage(db, billing, NOW)).due, 1)
    assert.equal((await windowOf(org)).attempts, 2)
  })

  test("past_due and no subscription at all are reported the same way", async () => {
    const late = await workspace({ status: "past_due" })
    const none = await workspace({ subscription: false })
    await usage(late, 10)
    await usage(none, 10, new Date("2026-12-01T00:00:00Z"))
    const { billing, calls } = fakePaddle()
    const result = await billOverage(db, billing, NOW)
    assert.equal(result.failed, 2)
    assert.equal(calls.length, 0)
    assert.deepEqual(result.failures.map((f) => f.error).sort(), ["the subscription is past_due", "the workspace has no subscription to bill"])
  })

  test("a provider error is kept on the window; once it clears the window is billed and leaves the list", async () => {
    const org = await workspace()
    await usage(org, 150)
    const broken = fakePaddle({ failWith: new BillingError("provider_error", "Paddle 503") })
    assert.equal((await billOverage(db, broken.billing, NOW)).failed, 1)
    assert.equal((await listOverageIssues(db)).windows[0]?.error, "Paddle 503")
    const { billing } = fakePaddle()
    assert.equal((await billOverage(db, billing, NOW)).billed, 1)
    assert.equal((await listOverageIssues(db)).total, 0)
    assert.equal((await windowOf(org)).error, null)
  })

  test("with billing off every closed window is reported, nothing charged", async () => {
    const org = await workspace()
    await usage(org, 150)
    const result = await billOverage(db, null, NOW)
    assert.equal(result.failed, 1)
    assert.match((await windowOf(org)).error ?? "", /billing is off/)
  })
})
