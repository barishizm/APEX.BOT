import { after, before, beforeEach, test } from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { AdminError, getSubscription, listBillingEventIssues, type Db } from "@apex/db"
import type { PaddleConfig } from "../lib/billing/config.ts"
import { createPaddleProvider, organizationData } from "../lib/billing/paddle.ts"
import { MAX_BODY_BYTES, handleBillingWebhook, replayBillingEvent, type WebhookDeps } from "../lib/billing/webhook.ts"

// The webhook endpoint end to end against migrated PGlite, with Paddle's sandbox payloads
// (test/fixtures/paddle) signed the way Paddle signs them.

const FIXTURES = join(import.meta.dirname, "fixtures/paddle")
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8")) as Record<string, any>

const SECRET = "pdl_ntfset_test_secret"
const CONFIG: PaddleConfig = {
  environment: "sandbox",
  apiKey: "pdl_sdbx_apikey_test",
  webhookSecret: SECRET,
  clientToken: "test_token",
  prices: {
    starter: { month: "pri_01aaaaaaaaaaaaaaaaaaaaaaaa", year: "pri_01bbbbbbbbbbbbbbbbbbbbbbbb" },
    pro: { month: "pri_01gsz8x8sawmvhz1pv30nge1ke", year: "pri_01cccccccccccccccccccccccc" },
    business: { month: "pri_01dddddddddddddddddddddddd", year: "pri_01eeeeeeeeeeeeeeeeeeeeeeee" },
  },
  overagePriceId: null,
}
const provider = createPaddleProvider(CONFIG)
// the fixtures are from 2024; the clock only has to agree with the signature
const NOW = new Date("2027-01-10T12:00:00Z")

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
  // migrate.ts is also a CLI with top-level await, which only loads as ESM
  const { migrate } = await import("@apex/db/migrate")
  await migrate(db)
})
after(() => db.close())
beforeEach(() => db.query("truncate app.organizations, app.billing_events, app.rate_limits cascade").then(() => {}))

async function workspace() {
  const { rows } = await db.query<{ id: string }>("insert into app.organizations (name, plan) values ('Kahve', 'free') returning id")
  return rows[0]!.id
}

function sign(body: string, at = NOW, secret = SECRET) {
  const ts = Math.floor(at.getTime() / 1000)
  return `ts=${ts};h1=${createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex")}`
}

function deliver(payload: unknown, opts: { signature?: string; deps?: Partial<WebhookDeps>; body?: string } = {}) {
  const body = opts.body ?? JSON.stringify(payload)
  const request = new Request("http://localhost/api/billing/webhooks/paddle", {
    method: "POST",
    headers: { "content-type": "application/json", "paddle-signature": opts.signature ?? sign(body) },
    body,
  })
  return handleBillingWebhook(request, { db, provider, ip: "203.0.113.7", now: () => NOW, ...opts.deps })
}

const forOrg = (name: string, organizationId: string | null) => {
  const raw = fixture(name)
  raw.data.custom_data = organizationId ? organizationData(organizationId, SECRET) : null
  return raw
}

test("an unsigned custom_data.organization_id doesn't credit a workspace", async () => {
  const org = await workspace()
  const raw = fixture("subscription-created")
  // what a browser could pass to Paddle.Checkout.open() with the public client token
  raw.data.custom_data = { organization_id: org }
  const res = await deliver(raw)
  assert.equal(res.status, 200, "stored, so Paddle doesn't retry")
  assert.equal((await res.json()).outcome, "unknown_organization")
  assert.equal(await getSubscription(db, org), null)
})

const inbox = () =>
  db.query<{ event_id: string; processed: boolean; attempts: number; error: string | null }>(
    "select event_id, processed_at is not null as processed, attempts, error from app.billing_events order by id",
  )

test("an invalid signature is refused with 401 and nothing is stored", async () => {
  const org = await workspace()
  const payload = forOrg("subscription-created", org)
  const body = JSON.stringify(payload)

  for (const signature of [sign(body, NOW, "wrong-secret"), sign(`${body} `), "ts=1;h1=00", "", sign(body, new Date(NOW.getTime() - 301_000))]) {
    const res = await deliver(payload, { signature, body })
    assert.equal(res.status, 401, signature)
  }
  assert.equal((await inbox()).rows.length, 0)
  assert.equal(await getSubscription(db, org), null)
})

test("a valid delivery is stored, applied and answered 200", async () => {
  const org = await workspace()
  const res = await deliver(forOrg("subscription-created", org))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, outcome: "applied" })
  const sub = await getSubscription(db, org)
  assert.equal(sub?.plan, "pro")
  assert.equal(sub?.status, "active")
  const [row] = (await inbox()).rows
  assert.deepEqual(row, { event_id: "evt_01hv8x2acma2gz7he8kg2s0hna", processed: true, attempts: 1, error: null })
  const plan = await db.query<{ plan: string }>("select plan from app.organizations where id = $1", [org])
  assert.equal(plan.rows[0]!.plan, "pro")
})

test("a repeated event is stored once and applied once", async () => {
  const org = await workspace()
  const payload = forOrg("subscription-created", org)
  assert.equal((await (await deliver(payload)).json()).outcome, "applied")

  const again = await deliver(payload)
  assert.equal(again.status, 200)
  assert.deepEqual(await again.json(), { ok: true, outcome: "duplicate" })
  const rows = (await inbox()).rows
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.attempts, 1, "a duplicate isn't processed again")
})

test("out of order: subscription.created after subscription.updated doesn't overwrite the newer state", async () => {
  const org = await workspace()
  const updated = forOrg("subscription-updated", org)
  // something the older event doesn't have, to see which one won
  updated.data.scheduled_change = { action: "cancel", effective_at: updated.data.current_billing_period.ends_at, resume_at: null }
  assert.equal((await (await deliver(updated)).json()).outcome, "applied")

  const created = forOrg("subscription-created", org)
  assert.ok(new Date(created.occurred_at) < new Date(updated.occurred_at))
  const res = await deliver(created)
  assert.equal(res.status, 200)
  assert.equal((await res.json()).outcome, "stale")

  const sub = await getSubscription(db, org)
  assert.equal(sub?.cancelAtPeriodEnd, true)
  assert.deepEqual(sub?.providerUpdatedAt, new Date(updated.occurred_at))
  assert.ok((await inbox()).rows.every((r) => r.processed && !r.error), "a stale event is processed, not failed")
})

test("an unknown workspace is answered 200, kept unprocessed with the reason, and listed for the admin area", async () => {
  // no custom_data and no stored subscription
  const res = await deliver(forOrg("subscription-created", null))
  assert.equal(res.status, 200)
  assert.equal((await res.json()).outcome, "unknown_organization")

  // a well-formed id that isn't a workspace
  const missing = forOrg("subscription-activated", "6f1c2b9e-4d3a-4c5b-9a8e-1f2d3c4b5a69")
  assert.equal((await (await deliver(missing)).json()).outcome, "unknown_organization")

  const rows = (await inbox()).rows
  assert.equal(rows.length, 2)
  for (const r of rows) {
    assert.equal(r.processed, false)
    assert.equal(r.attempts, 1)
    assert.match(r.error ?? "", /^unknown_organization: /)
  }
  const issues = await listBillingEventIssues(db)
  assert.equal(issues.total, 2)
  assert.deepEqual(issues.events.map((e) => e.eventType).sort(), ["subscription.activated", "subscription.created"])
})

test("a replay from the admin area applies a held-back event once its cause is fixed, together with the caller's transaction", async () => {
  const org = "6f1c2b9e-4d3a-4c5b-9a8e-1f2d3c4b5a69"
  assert.equal((await (await deliver(forOrg("subscription-created", org))).json()).outcome, "unknown_organization")
  const [{ id }] = (await listBillingEventIssues(db)).events
  await db.query("insert into app.organizations (id, name, plan) values ($1, 'Kahve', 'free')", [org])

  // the audit entry failing undoes the replay with it
  await assert.rejects(
    db.transaction(async (tx) => {
      assert.equal((await replayBillingEvent(tx, provider, id!, () => NOW)).outcome, "applied")
      throw new Error("audit failed")
    }),
    /audit failed/,
  )
  assert.equal(await getSubscription(db, org), null)
  assert.equal((await listBillingEventIssues(db)).total, 1)

  const r = await db.transaction((tx) => replayBillingEvent(tx, provider, id!, () => NOW))
  assert.deepEqual([r.outcome, r.error, r.attempts, r.changed], ["applied", null, 2, [org]])
  assert.equal((await getSubscription(db, org))?.status, "active")
  assert.equal((await listBillingEventIssues(db)).total, 0)

  const refused = (c: string) => (err: unknown) => err instanceof AdminError && err.code === c
  await assert.rejects(db.transaction((tx) => replayBillingEvent(tx, provider, id!, () => NOW)), refused("invalid_input"))
  await assert.rejects(db.transaction((tx) => replayBillingEvent(tx, provider, "999999", () => NOW)), refused("not_found"))
})

test("a replay that fails again is recorded, and the caller's transaction still commits", async () => {
  assert.equal((await (await deliver(forOrg("subscription-created", null))).json()).outcome, "unknown_organization")
  const [{ id }] = (await listBillingEventIssues(db)).events
  const r = await db.transaction((tx) => replayBillingEvent(tx, provider, id!, () => NOW))
  assert.equal(r.outcome, "unknown_organization")
  assert.match(r.error ?? "", /^unknown_organization: /)
  assert.deepEqual([r.attempts, r.changed], [2, []])
})

test("an event without custom_data finds its workspace through the stored subscription", async () => {
  const org = await workspace()
  await deliver(forOrg("subscription-created", org))
  const res = await deliver(forOrg("subscription-past-due", null))
  assert.equal((await res.json()).outcome, "applied")
  assert.equal((await getSubscription(db, org))?.status, "past_due")
})

test("a processing failure is answered 200 and recorded with its error and attempts; a later delivery retries it", async () => {
  const [org, other] = [await workspace(), await workspace()]
  // the customer already belongs to another workspace: storing it violates the unique key
  await db.query("insert into app.billing_customers (organization_id, provider, provider_customer_id) values ($1, 'paddle', 'ctm_01hv6y1jedq4p1n0yqn5ba3ky4')", [other])
  const payload = forOrg("subscription-created", org)

  const res = await deliver(payload)
  assert.equal(res.status, 200)
  assert.equal((await res.json()).outcome, "failed")
  let [row] = (await inbox()).rows
  assert.equal(row!.processed, false)
  assert.equal(row!.attempts, 1)
  assert.ok(row!.error)
  assert.equal(await getSubscription(db, org), null, "the failed transaction left nothing behind")

  await db.query("delete from app.billing_customers where organization_id = $1", [other])
  assert.equal((await (await deliver(payload)).json()).outcome, "applied")
  ;[row] = (await inbox()).rows
  assert.deepEqual({ processed: row!.processed, attempts: row!.attempts, error: row!.error }, { processed: true, attempts: 2, error: null })
})

test("an event for another customer than the workspace's is held back", async () => {
  const org = await workspace()
  await db.query("insert into app.billing_customers (organization_id, provider, provider_customer_id) values ($1, 'paddle', 'ctm_someone_else')", [org])
  const res = await deliver(forOrg("subscription-created", org))
  assert.equal((await res.json()).outcome, "customer_mismatch")
  assert.equal(await getSubscription(db, org), null)
})

test("bodies over the limit are refused before they are read in full", async () => {
  const big = JSON.stringify({ pad: "x".repeat(MAX_BODY_BYTES) })
  const res = await deliver(null, { body: big })
  assert.equal(res.status, 413)
  assert.equal((await inbox()).rows.length, 0)
})

test("deliveries past the rate limit get 429 with Retry-After", async () => {
  const org = await workspace()
  const deps = { rateLimit: { max: 2, windowSeconds: 60 } }
  assert.equal((await deliver(forOrg("subscription-created", org), { deps })).status, 200)
  assert.equal((await deliver(forOrg("subscription-activated", org), { deps })).status, 200)
  const res = await deliver(forOrg("subscription-updated", org), { deps })
  assert.equal(res.status, 429)
  assert.ok(Number(res.headers.get("retry-after")) >= 1)
})

test("billing off: 503, so Paddle retries once it is configured", async () => {
  const res = await deliver(fixture("subscription-created"), { deps: { provider: null } })
  assert.equal(res.status, 503)
})

test("an ignored event type is processed without touching state", async () => {
  const raw = fixture("subscription-created")
  raw.event_type = "address.created"
  assert.equal((await (await deliver(raw)).json()).outcome, "ignored")
  assert.equal((await inbox()).rows[0]!.processed, true)
})

test("customer.updated finds its workspace through the stored customer", async () => {
  const org = await workspace()
  await deliver(forOrg("subscription-created", org))
  const raw = fixture("subscription-created")
  raw.event_id = "evt_customer_updated"
  raw.event_type = "customer.updated"
  raw.data = { id: raw.data.customer_id, custom_data: null }
  assert.equal((await (await deliver(raw)).json()).outcome, "applied")
  assert.ok((await inbox()).rows.every((r) => r.processed && !r.error))
})

test("an invalid transition is answered 200 and kept unprocessed with the reason", async () => {
  const org = await workspace()
  await deliver(forOrg("subscription-created", org))
  const raw = forOrg("subscription-updated", org)
  raw.data.status = "trialing" // active can't go back into a trial
  assert.equal((await (await deliver(raw)).json()).outcome, "rejected")
  const last = (await inbox()).rows.at(-1)!
  assert.equal(last.processed, false)
  assert.match(last.error ?? "", /^invalid_transition: /)
  assert.equal((await getSubscription(db, org))?.status, "active")
})

test("nothing from the payload reaches the logs", async () => {
  const org = await workspace()
  const payload = forOrg("subscription-created", org)
  payload.data.custom_data.note = "ayse.yilmaz@example.com"
  const lines: string[] = []
  const orig = { info: console.info, warn: console.warn, error: console.error }
  for (const level of ["info", "warn", "error"] as const) console[level] = (...args: unknown[]) => void lines.push(JSON.stringify(args))
  try {
    await deliver(payload)
    await deliver(forOrg("subscription-created", null), { body: JSON.stringify({ ...payload, event_id: "evt_x" }) })
    await deliver(payload, { signature: "ts=1;h1=00" })
  } finally {
    Object.assign(console, orig)
  }
  assert.ok(lines.length > 0)
  for (const l of lines) {
    assert.doesNotMatch(l, /ayse|example\.com|ctm_|"data"/)
  }
})

test("processing past the budget is answered 200 and finishes after the response", async () => {
  const org = await workspace()
  const deferred: Promise<unknown>[] = []
  // a database whose transactions take longer than the budget
  const slow: Db = { ...db, transaction: async (fn) => (await new Promise((r) => setTimeout(r, 50)), db.transaction(fn)) }
  const res = await deliver(forOrg("subscription-created", org), { deps: { db: slow, budgetMs: 10, defer: (work) => void deferred.push(work) } })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).outcome, "deferred")
  assert.equal(deferred.length, 1)
  assert.equal(await deferred[0], "applied")
  assert.equal((await getSubscription(db, org))?.plan, "pro")
})
