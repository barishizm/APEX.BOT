import { test } from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { BILLING_ENV_KEYS, billingStatus, getBillingProvider, requireBillingProvider, BillingError, type BillingEvent } from "../lib/billing/index.ts"
import { readBillingConfig, type PriceMap } from "../lib/billing/config.ts"
import { changeTiming, createPaddleProvider, normalizePaddleEvent, organizationData, signOrganization, verifyPaddleSignature, SIGNATURE_TOLERANCE_SECONDS } from "../lib/billing/paddle.ts"

// Normalising is tested against Paddle's real sandbox payloads (test/fixtures/paddle/README.md).

const FIXTURES = join(import.meta.dirname, "fixtures/paddle")
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8")) as Record<string, any>

// pri_01gsz8x8sawmvhz1pv30nge1ke is the fixtures' base plan price; the rest only need to be distinct
const PRICES: PriceMap = {
  starter: { month: "pri_01aaaaaaaaaaaaaaaaaaaaaaaa", year: "pri_01bbbbbbbbbbbbbbbbbbbbbbbb" },
  pro: { month: "pri_01gsz8x8sawmvhz1pv30nge1ke", year: "pri_01cccccccccccccccccccccccc" },
  business: { month: "pri_01dddddddddddddddddddddddd", year: "pri_01eeeeeeeeeeeeeeeeeeeeeeee" },
}
const ORG = "6f1c2b9e-4d3a-4c5b-9a8e-1f2d3c4b5a69"
// the webhook secret; it also signs the workspace in custom_data
const SECRET = "pdl_ntfset_01testsecret_abcdefghijklmnop"
const signed = (organizationId = ORG) => organizationData(organizationId, SECRET)

const normalize = (payload: unknown) => normalizePaddleEvent(payload, PRICES, SECRET)
function expectType<T extends BillingEvent["type"]>(e: BillingEvent, type: T): BillingEvent & { type: T } {
  assert.equal(e.type, type, `expected ${type}, got ${e.type}${e.type === "ignored" ? ` (${e.reason})` : ""}`)
  return e as BillingEvent & { type: T }
}

// --- subscriptions ---

test("subscription.created: plan, interval, period and customer from the payload", () => {
  const e = expectType(normalize(fixture("subscription-created")), "subscription.updated")
  assert.equal(e.provider, "paddle")
  assert.equal(e.providerType, "subscription.created")
  assert.equal(e.reason, "created")
  assert.equal(e.organizationId, null, "the docs' payload carries no custom_data")
  assert.deepEqual(e.subscription, {
    provider: "paddle",
    providerSubscriptionId: "sub_01hv8x29kz0t586xy6zn1a62ny",
    customerId: "ctm_01hv6y1jedq4p1n0yqn5ba3ky4",
    plan: "pro",
    interval: "month",
    status: "active",
    currentPeriodStart: new Date("2024-04-12T10:18:47.635628Z"),
    currentPeriodEnd: new Date("2024-05-12T10:18:47.635628Z"),
    cancelAtPeriodEnd: false,
    scheduledChange: null,
    providerUpdatedAt: new Date("2024-04-12T10:18:49.621022Z"),
  })
})

test("event id and occurred_at pass through; the event time orders updates", () => {
  const raw = fixture("subscription-activated")
  const e = expectType(normalize(raw), "subscription.updated")
  assert.equal(e.eventId, raw.event_id)
  assert.equal(e.reason, "activated")
  assert.deepEqual(e.occurredAt, new Date(raw.occurred_at))
  assert.deepEqual(e.subscription.providerUpdatedAt, new Date(raw.occurred_at))
})

test("the workspace comes from custom_data.organization_id, and only when it is a uuid", () => {
  const raw = fixture("subscription-activated")
  raw.data.custom_data = { ...signed(), organization_id: ORG.toUpperCase(), utm_source: "x" }
  assert.equal(normalize(raw).organizationId, ORG)
  raw.data.custom_data = { organization_id: "'; drop table app.subscriptions; --", apex_org_sig: signOrganization("'; drop table app.subscriptions; --", SECRET) }
  assert.equal(normalize(raw).organizationId, null)
  raw.data.custom_data = { organization_id: 42 }
  assert.equal(normalize(raw).organizationId, null)
})

test("custom_data names a workspace only with our signature: Paddle.js lets a browser set any", () => {
  const raw = fixture("subscription-activated")
  const other = "0b8f1d2e-3c4a-4b5d-8e6f-7a8b9c0d1e2f"
  raw.data.custom_data = { organization_id: ORG }
  assert.equal(normalize(raw).organizationId, null, "unsigned")
  raw.data.custom_data = { organization_id: other, apex_org_sig: signed().apex_org_sig }
  assert.equal(normalize(raw).organizationId, null, "another workspace's signature")
  raw.data.custom_data = { organization_id: ORG, apex_org_sig: signOrganization(ORG, "another secret") }
  assert.equal(normalize(raw).organizationId, null, "signed with another secret")
  raw.data.custom_data = { organization_id: ORG, apex_org_sig: signed().apex_org_sig.slice(0, -1) }
  assert.equal(normalize(raw).organizationId, null, "truncated")
  raw.data.custom_data = signed(other)
  assert.equal(normalize(raw).organizationId, other)
})

test("subscription.past_due: status past_due with the period that failed to renew", () => {
  const e = expectType(normalize(fixture("subscription-past-due")), "subscription.updated")
  assert.equal(e.reason, "past_due")
  assert.equal(e.subscription.status, "past_due")
  assert.deepEqual(e.subscription.currentPeriodStart, new Date("2024-05-12T10:18:47.635628Z"))
})

test("subscription.canceled: status canceled; Paddle drops the period, so it is null (keep the stored one)", () => {
  const e = expectType(normalize(fixture("subscription-canceled")), "subscription.updated")
  assert.equal(e.reason, "canceled")
  assert.equal(e.subscription.status, "canceled")
  assert.equal(e.subscription.currentPeriodStart, null)
  assert.equal(e.subscription.currentPeriodEnd, null)
  assert.equal(e.subscription.cancelAtPeriodEnd, false)
})

test("subscription.updated: extra items (add-ons) don't hide the plan item", () => {
  const raw = fixture("subscription-updated")
  assert.ok(raw.data.items.length > 1)
  const e = expectType(normalize(raw), "subscription.updated")
  assert.equal(e.subscription.plan, "pro")
  // plan item moved to last: still found
  raw.data.items.reverse()
  assert.equal(expectType(normalize(raw), "subscription.updated").subscription.plan, "pro")
})

test("a scheduled cancellation sets cancelAtPeriodEnd and the change's date", () => {
  const raw = fixture("subscription-updated")
  raw.data.scheduled_change = { action: "cancel", effective_at: "2024-05-12T10:37:59.556997Z", resume_at: null }
  const s = expectType(normalize(raw), "subscription.updated").subscription
  assert.equal(s.cancelAtPeriodEnd, true)
  assert.deepEqual(s.scheduledChange, { action: "cancel", effectiveAt: "2024-05-12T10:37:59.556Z" })
  raw.data.scheduled_change = { action: "pause", effective_at: "2024-05-12T10:37:59.556997Z", resume_at: null }
  const paused = expectType(normalize(raw), "subscription.updated").subscription
  assert.equal(paused.cancelAtPeriodEnd, false)
  assert.equal(paused.scheduledChange?.action, "pause")
})

test("a downgrade keeps the paid plan until the period it was paid for ends", () => {
  const raw = fixture("subscription-updated")
  const periodEnd = raw.data.current_billing_period.ends_at
  raw.data.custom_data = { ...signed(), apex_paid_plan: "business", apex_paid_until: periodEnd }
  const during = expectType(normalize(raw), "subscription.updated").subscription
  assert.equal(during.plan, "business")
  assert.deepEqual(during.scheduledChange, { action: "change", plan: "pro", interval: "month", effectiveAt: new Date(periodEnd).toISOString() })

  // the renewal moves the period past the marker: the items' plan applies
  raw.data.current_billing_period = { starts_at: periodEnd, ends_at: "2024-06-12T10:37:59.556997Z" }
  const after = expectType(normalize(raw), "subscription.updated").subscription
  assert.equal(after.plan, "pro")
  assert.equal(after.scheduledChange, null)
})

test("a downgrade marker never lowers a plan or names an unknown one", () => {
  const raw = fixture("subscription-updated")
  const until = raw.data.current_billing_period.ends_at
  for (const paid of ["starter", "free", "enterprise", null]) {
    raw.data.custom_data = { ...signed(), apex_paid_plan: paid, apex_paid_until: until }
    const s = expectType(normalize(raw), "subscription.updated").subscription
    assert.equal(s.plan, "pro", `marker ${paid}`)
    assert.equal(s.scheduledChange, null)
  }
})

test("a cancellation outranks a pending downgrade", () => {
  const raw = fixture("subscription-updated")
  raw.data.custom_data = { apex_paid_plan: "business", apex_paid_until: raw.data.current_billing_period.ends_at }
  raw.data.scheduled_change = { action: "cancel", effective_at: raw.data.current_billing_period.ends_at, resume_at: null }
  const s = expectType(normalize(raw), "subscription.updated").subscription
  assert.equal(s.plan, "business")
  assert.equal(s.scheduledChange?.action, "cancel")
})

test("a subscription to a price that isn't one of our plans is ignored, not guessed", () => {
  const e = normalizePaddleEvent(fixture("subscription-created"), { ...PRICES, pro: { month: "pri_01ffffffffffffffffffffffff", year: PRICES.pro.year } }, SECRET)
  assert.equal(expectType(e, "ignored").reason, "unknown_price")
})

// --- transactions ---

test("transaction.completed from checkout: payment.succeeded with total, invoice and subscription", () => {
  const e = expectType(normalize(fixture("transaction-completed")), "payment.succeeded")
  assert.equal(e.transactionId, "txn_01hv8wptq8987qeep44cyrewp9")
  assert.equal(e.kind, "checkout")
  assert.equal(e.amountMinor, 65215)
  assert.equal(e.currency, "USD")
  assert.equal(e.invoiceNumber, "325-10566")
  assert.equal(e.subscriptionId, "sub_01hv8x29kz0t586xy6zn1a62ny")
  assert.equal(e.customerId, "ctm_01hv6y1jedq4p1n0yqn5ba3ky4")
  assert.equal(e.errorCode, null, "an earlier declined attempt doesn't make a completed payment a failure")
})

test("transaction.past_due on a renewal: payment.failed with the decline reason", () => {
  const e = expectType(normalize(fixture("transaction-past-due")), "payment.failed")
  assert.equal(e.kind, "renewal")
  assert.equal(e.subscriptionId, "sub_01hv8x29kz0t586xy6zn1a62ny")
  assert.equal(e.amountMinor, 43549)
  assert.equal(e.errorCode, "authentication_failed")
  assert.equal(e.invoiceNumber, null)
})

test("transaction.payment_failed at checkout: payment.failed with no subscription yet", () => {
  const e = expectType(normalize(fixture("transaction-payment-failed")), "payment.failed")
  assert.equal(e.kind, "checkout")
  assert.equal(e.subscriptionId, null)
  assert.equal(e.errorCode, "declined")
})

test("origins map to payment kinds; a payment-method change is not a payment", () => {
  const raw = fixture("transaction-completed")
  for (const [origin, kind] of [
    ["subscription_charge", "one_time"],
    ["subscription_update", "change"],
    ["subscription_recurring", "renewal"],
    ["api", "checkout"],
    ["something_new", "other"],
  ]) {
    raw.data.origin = origin
    assert.equal(expectType(normalize(raw), "payment.succeeded").kind, kind)
  }
  raw.data.origin = "subscription_payment_method_change"
  assert.equal(expectType(normalize(raw), "ignored").reason, "payment_method_change")
})

// --- envelope ---

test("events we don't act on are ignored", () => {
  for (const type of ["transaction.created", "transaction.billed", "customer.created", "address.updated"]) {
    const raw = fixture("transaction-completed")
    raw.event_type = type
    assert.equal(expectType(normalize(raw), "ignored").reason, "unhandled_type")
  }
})

test("malformed bodies throw invalid_payload", () => {
  const bad: unknown[] = [null, "x", [], {}, { event_id: "evt_1", event_type: "subscription.created" }]
  const noTime = fixture("subscription-created")
  delete noTime.occurred_at
  const badStatus = fixture("subscription-created")
  badStatus.data.status = "zombie"
  for (const payload of [...bad, noTime, badStatus])
    assert.throws(() => normalize(payload), (err: unknown) => err instanceof BillingError && err.code === "invalid_payload")
})

test("normalising is pure: a replay of the stored payload gives the same event", () => {
  for (const name of ["subscription-created", "subscription-canceled", "transaction-completed", "transaction-past-due"]) {
    const stored = JSON.stringify(fixture(name))
    assert.deepEqual(normalize(JSON.parse(stored)), normalize(JSON.parse(stored)), name)
  }
})

// --- webhook signature ---

const sign = (body: string, ts: number, secret = SECRET) => createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex")

test("verifyWebhook accepts Paddle's signature over the raw body and rejects anything else", () => {
  const body = readFileSync(join(FIXTURES, "subscription-created.json"), "utf8")
  const now = new Date("2026-10-20T12:00:00Z")
  const ts = Math.floor(now.getTime() / 1000)
  const ok = `ts=${ts};h1=${sign(body, ts)}`
  assert.equal(verifyPaddleSignature(body, { "paddle-signature": ok }, SECRET, now), true)
  assert.equal(verifyPaddleSignature(body, new Headers({ "Paddle-Signature": ok }), SECRET, now), true, "a fetch Headers object")

  assert.equal(verifyPaddleSignature(body + " ", { "paddle-signature": ok }, SECRET, now), false, "body changed")
  assert.equal(verifyPaddleSignature(JSON.stringify(JSON.parse(body)), { "paddle-signature": ok }, SECRET, now), false, "re-serialised body")
  assert.equal(verifyPaddleSignature(body, { "paddle-signature": `ts=${ts};h1=${sign(body, ts, "other")}` }, SECRET, now), false, "other secret")
  assert.equal(verifyPaddleSignature(body, { "paddle-signature": `ts=${ts + 1};h1=${sign(body, ts)}` }, SECRET, now), false, "ts changed")
  assert.equal(verifyPaddleSignature(body, {}, SECRET, now), false, "no header")
  for (const h of ["", "garbage", `ts=${ts}`, `h1=${sign(body, ts)}`, `ts=abc;h1=${sign(body, ts)}`, `ts=${ts};h1=zz`])
    assert.equal(verifyPaddleSignature(body, { "paddle-signature": h }, SECRET, now), false, `header ${JSON.stringify(h)}`)
})

test("verifyWebhook rejects old and future-dated signatures", () => {
  const body = "{}"
  const now = new Date("2026-10-20T12:00:00Z")
  const at = (offset: number) => {
    const ts = Math.floor(now.getTime() / 1000) + offset
    return verifyPaddleSignature(body, { "paddle-signature": `ts=${ts};h1=${sign(body, ts)}` }, SECRET, now)
  }
  assert.equal(at(-SIGNATURE_TOLERANCE_SECONDS), true)
  assert.equal(at(-SIGNATURE_TOLERANCE_SECONDS - 1), false)
  assert.equal(at(SIGNATURE_TOLERANCE_SECONDS + 1), false)
})

test("verifyWebhook accepts any of several h1 values while a secret rotates", () => {
  const body = "{}"
  const now = new Date()
  const ts = Math.floor(now.getTime() / 1000)
  const h = `ts=${ts};h1=${sign(body, ts, "old-secret")};h1=${sign(body, ts)}`
  assert.equal(verifyPaddleSignature(body, { "paddle-signature": h }, SECRET, now), true)
})

// --- plan change timing ---

test("upgrades apply now, downgrades at the period end (ADR 0003 (a))", () => {
  assert.equal(changeTiming({ plan: "starter", interval: "month" }, { plan: "pro", interval: "month" }), "immediately")
  assert.equal(changeTiming({ plan: "pro", interval: "year" }, { plan: "business", interval: "month" }), "immediately")
  assert.equal(changeTiming({ plan: "pro", interval: "month" }, { plan: "pro", interval: "year" }), "immediately")
  assert.equal(changeTiming({ plan: "business", interval: "month" }, { plan: "pro", interval: "month" }), "period_end")
  assert.equal(changeTiming({ plan: "pro", interval: "year" }, { plan: "pro", interval: "month" }), "period_end")
  assert.equal(changeTiming({ plan: "pro", interval: "year" }, { plan: "pro", interval: "year" }), null)
})

// --- configuration ---

const SANDBOX_ENV = {
  PADDLE_ENV: "sandbox",
  PADDLE_API_KEY: "pdl_sdbx_apikey_01abc_xyz",
  PADDLE_WEBHOOK_SECRET: SECRET,
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test_7d279f61a3499fed520f7cd8c08",
  PADDLE_PRICE_STARTER_MONTH: PRICES.starter.month,
  PADDLE_PRICE_STARTER_YEAR: PRICES.starter.year,
  PADDLE_PRICE_PRO_MONTH: PRICES.pro.month,
  PADDLE_PRICE_PRO_YEAR: PRICES.pro.year,
  PADDLE_PRICE_BUSINESS_MONTH: PRICES.business.month,
  PADDLE_PRICE_BUSINESS_YEAR: PRICES.business.year,
}

test("without keys billing is off, says what is missing, and nothing throws", () => {
  const status = billingStatus({})
  assert.equal(status.enabled, false)
  if (!status.enabled) assert.deepEqual(status.missing.sort(), BILLING_ENV_KEYS.filter((k) => k !== "PADDLE_ENV" && k !== "PADDLE_PRICE_OVERAGE").sort())
  assert.equal(getBillingProvider({}), null)
  assert.throws(() => requireBillingProvider({}), (err: unknown) => err instanceof BillingError && err.code === "disabled")
})

test("a complete sandbox configuration turns billing on", () => {
  assert.deepEqual(billingStatus(SANDBOX_ENV), { enabled: true, provider: "paddle", environment: "sandbox", overage: false })
  assert.deepEqual(billingStatus({ ...SANDBOX_ENV, PADDLE_PRICE_OVERAGE: "pri_01gggggggggggggggggggggggg" }), {
    enabled: true,
    provider: "paddle",
    environment: "sandbox",
    overage: true,
  })
  assert.equal(getBillingProvider(SANDBOX_ENV)?.environment, "sandbox")
})

test("keys from the other environment, bad or repeated price ids, or a bad PADDLE_ENV keep billing off", () => {
  const invalidKeys = (env: Record<string, string>) => {
    const s = readBillingConfig(env).status
    return s.enabled ? [] : s.invalid.map((i) => i.key)
  }
  assert.deepEqual(invalidKeys({ ...SANDBOX_ENV, PADDLE_ENV: "production" }), ["PADDLE_API_KEY", "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN"])
  assert.deepEqual(invalidKeys({ ...SANDBOX_ENV, PADDLE_API_KEY: "pdl_live_apikey_01abc" }), ["PADDLE_API_KEY"])
  assert.deepEqual(invalidKeys({ ...SANDBOX_ENV, PADDLE_ENV: "live" }), ["PADDLE_ENV"])
  assert.deepEqual(invalidKeys({ ...SANDBOX_ENV, PADDLE_PRICE_PRO_YEAR: "price_123" }), ["PADDLE_PRICE_PRO_YEAR"])
  assert.deepEqual(invalidKeys({ ...SANDBOX_ENV, PADDLE_PRICE_PRO_YEAR: PRICES.pro.month }), ["PADDLE_PRICE_PRO_YEAR"])
  assert.equal(billingStatus({ ...SANDBOX_ENV, PADDLE_PRICE_PRO_YEAR: PRICES.pro.month }).enabled, false)
})

test("PADDLE_ENV defaults to sandbox, so a live key without it stays off", () => {
  const { PADDLE_ENV: _, ...rest } = SANDBOX_ENV
  assert.equal(billingStatus(rest).enabled, true)
  assert.equal(billingStatus({ ...rest, PADDLE_API_KEY: "pdl_live_apikey_01abc", NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "live_abc" }).enabled, false)
})

// --- API calls (fetch stubbed) ---

type Call = { method: string; url: string; body: any }
function stubFetch(handler: (c: Call) => unknown) {
  const calls: Call[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const call = { method: init.method ?? "GET", url: String(url), body: init.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(call)
    return new Response(JSON.stringify({ data: handler(call), meta: { request_id: "req" } }), { status: 200 })
  }) as typeof fetch
  return { calls, restore: () => (globalThis.fetch = original) }
}

const SUB = {
  organizationId: ORG,
  providerSubscriptionId: "sub_01hv8x29kz0t586xy6zn1a62ny",
  plan: "pro" as const,
  interval: "month" as const,
  currentPeriodEnd: new Date("2026-11-12T10:00:00Z"),
}
const OVERAGE_PRICE = { id: "pri_01gggggggggggggggggggggggg", product_id: "pro_01hhhhhhhhhhhhhhhhhhhhhhhh", name: "100 extra replies", tax_mode: "account_setting", billing_cycle: null, unit_price: { amount: "500", currency_code: "USD" } }

test("createOneTimeCharge bills once per idempotency key", async () => {
  const provider = createPaddleProvider(readBillingConfig(SANDBOX_ENV).config!)
  const charged: any[] = []
  const stub = stubFetch((c) => {
    if (c.url.includes("/transactions?")) return charged.map((items, i) => ({ id: `txn_${i}`, status: "completed", items: items.map((l: any) => ({ price: l.price })) }))
    if (c.url.includes("/prices/")) return OVERAGE_PRICE
    if (c.url.endsWith("/charge")) return charged.push(c.body.items), { id: SUB.providerSubscriptionId }
    throw new Error(`unexpected ${c.method} ${c.url}`)
  })
  try {
    const first = await provider.createOneTimeCharge(SUB, [{ priceId: OVERAGE_PRICE.id, quantity: 250 }], "overage:2026-10-12")
    assert.deepEqual(first, { transactionId: "txn_0", duplicate: false })
    const charge = stub.calls.find((c) => c.url.endsWith("/charge"))!
    assert.equal(charge.url, `https://sandbox-api.paddle.com/subscriptions/${SUB.providerSubscriptionId}/charge`)
    assert.equal(charge.body.effective_from, "immediately")
    assert.equal(charge.body.on_payment_failure, "apply_change")
    assert.deepEqual(charge.body.items.map((l: any) => l.quantity), [100, 100, 50], "split at Paddle's 100-per-line default")
    assert.deepEqual(charge.body.items[0].price, {
      product_id: OVERAGE_PRICE.product_id,
      description: "apex-charge:overage:2026-10-12",
      name: OVERAGE_PRICE.name,
      tax_mode: "account_setting",
      unit_price: OVERAGE_PRICE.unit_price,
    })

    const again = await provider.createOneTimeCharge(SUB, [{ priceId: OVERAGE_PRICE.id, quantity: 250 }], "overage:2026-10-12")
    assert.deepEqual(again, { transactionId: "txn_0", duplicate: true })
    assert.equal(charged.length, 1, "the retry billed nothing")

    await provider.createOneTimeCharge(SUB, [{ priceId: OVERAGE_PRICE.id, quantity: 1 }], "overage:2026-11-12")
    assert.equal(charged.length, 2, "another key bills")
    assert.equal(stub.calls.filter((c) => c.url.includes("/prices/")).length, 1, "the catalog price is read once")
  } finally {
    stub.restore()
  }
})

test("createOneTimeCharge refuses bad keys, quantities and recurring prices before billing", async () => {
  const provider = createPaddleProvider(readBillingConfig(SANDBOX_ENV).config!)
  const stub = stubFetch((c) => (c.url.includes("/transactions?") ? [] : c.url.includes("/prices/") ? { ...OVERAGE_PRICE, billing_cycle: { interval: "month", frequency: 1 } } : {}))
  try {
    const invalid = (err: unknown) => err instanceof BillingError && err.code === "invalid_input"
    await assert.rejects(provider.createOneTimeCharge(SUB, [{ priceId: OVERAGE_PRICE.id, quantity: 1 }], "has space"), invalid)
    await assert.rejects(provider.createOneTimeCharge(SUB, [{ priceId: OVERAGE_PRICE.id, quantity: 0 }], "k"), invalid)
    await assert.rejects(provider.createOneTimeCharge(SUB, [], "k"), invalid)
    await assert.rejects(provider.createOneTimeCharge(SUB, [{ priceId: OVERAGE_PRICE.id, quantity: 1 }], "k"), invalid)
    assert.equal(stub.calls.filter((c) => c.url.endsWith("/charge")).length, 0)
  } finally {
    stub.restore()
  }
})

test("changePlan: upgrades prorate now; a downgrade bills from renewal and keeps the paid plan until then", async () => {
  const provider = createPaddleProvider(readBillingConfig(SANDBOX_ENV).config!)
  const stub = stubFetch(() => ({}))
  try {
    assert.deepEqual(await provider.changePlan(SUB, { plan: "business", interval: "month" }), { timing: "immediately" })
    assert.deepEqual(stub.calls[0]!.body, {
      items: [{ price_id: PRICES.business.month, quantity: 1 }],
      proration_billing_mode: "prorated_immediately",
      on_payment_failure: "prevent_change",
      custom_data: signed(),
    })
    assert.deepEqual(await provider.changePlan(SUB, { plan: "starter", interval: "month" }), { timing: "period_end" })
    assert.deepEqual(stub.calls[1]!.body, {
      items: [{ price_id: PRICES.starter.month, quantity: 1 }],
      proration_billing_mode: "full_next_billing_period",
      custom_data: { ...signed(), apex_paid_plan: "pro", apex_paid_until: SUB.currentPeriodEnd.toISOString() },
    })
    // Paddle only takes immediate modes for a billing frequency change
    const yearly = { ...SUB, interval: "year" as const }
    assert.deepEqual(await provider.changePlan(yearly, { plan: "pro", interval: "month" }), { timing: "immediately" })
    assert.equal(stub.calls[2]!.body.proration_billing_mode, "prorated_immediately")
    await assert.rejects(provider.changePlan(SUB, { plan: "pro", interval: "month" }), (err: unknown) => err instanceof BillingError && err.code === "no_change")
  } finally {
    stub.restore()
  }
})

test("a Paddle error becomes provider_error with Paddle's code and request id", async () => {
  const provider = createPaddleProvider(readBillingConfig(SANDBOX_ENV).config!)
  const original = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { type: "request_error", code: "subscription_locked_pending_changes", detail: "Subscription is locked" }, meta: { request_id: "req_9" } }), {
      status: 409,
    })) as typeof fetch
  try {
    await assert.rejects(provider.cancelAtPeriodEnd(SUB), (err: unknown) => {
      assert.ok(err instanceof BillingError)
      assert.equal(err.code, "provider_error")
      assert.deepEqual(err.details, { status: 409, providerCode: "subscription_locked_pending_changes", requestId: "req_9" })
      return true
    })
  } finally {
    globalThis.fetch = original
  }
})

test("createCheckout makes the transaction on the server; the browser gets only its id", async () => {
  const provider = createPaddleProvider(readBillingConfig(SANDBOX_ENV).config!)
  const stub = stubFetch(() => ({ id: "txn_01hv8wptq8987qeep44cyrewp9", status: "draft" }))
  try {
    const c = await provider.createCheckout({ id: ORG, customerId: "ctm_01hv6y1jedq4p1n0yqn5ba3ky4" }, "pro", "year", { locale: "tr" })
    assert.deepEqual(c, {
      provider: "paddle",
      environment: "sandbox",
      clientToken: SANDBOX_ENV.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
      transactionId: "txn_01hv8wptq8987qeep44cyrewp9",
      settings: { locale: "tr" },
    })
    assert.equal(stub.calls[0]!.method, "POST")
    assert.ok(stub.calls[0]!.url.endsWith("/transactions"))
    assert.deepEqual(stub.calls[0]!.body, {
      items: [{ price_id: PRICES.pro.year, quantity: 1 }],
      custom_data: signed(),
      collection_mode: "automatic",
      customer_id: "ctm_01hv6y1jedq4p1n0yqn5ba3ky4",
    })
    await provider.createCheckout({ id: ORG }, "starter", "month")
    assert.equal(stub.calls[1]!.body.customer_id, undefined, "no customer: the payer types an email")
    assert.ok(!JSON.stringify(c).includes(SANDBOX_ENV.PADDLE_API_KEY), "no server key in what the browser gets")
    assert.ok(!JSON.stringify(c).includes(SECRET), "nor the webhook secret")
    await assert.rejects(provider.createCheckout({ id: "not-a-uuid" }, "pro", "year"), (err: unknown) => err instanceof BillingError && err.code === "invalid_input")
    await assert.rejects(provider.createCheckout({ id: ORG, customerId: "ctm_x/../../" }, "pro", "year"), (err: unknown) => err instanceof BillingError && err.code === "invalid_input")
    assert.equal(stub.calls.length, 2)
  } finally {
    stub.restore()
  }
})

test("findOrCreateCustomer reuses the customer with that email, else creates one", async () => {
  const provider = createPaddleProvider(readBillingConfig(SANDBOX_ENV).config!)
  let existing: { id: string }[] = [{ id: "ctm_01hv6y1jedq4p1n0yqn5ba3ky4" }]
  const stub = stubFetch((c) => (c.method === "GET" ? existing : { id: "ctm_01hv8wt8nffez4p2t6typn4a5j" }))
  try {
    assert.equal(await provider.findOrCreateCustomer(" Ayse@Example.com "), "ctm_01hv6y1jedq4p1n0yqn5ba3ky4")
    assert.ok(stub.calls[0]!.url.includes("email=ayse%40example.com"), "looked up lowercased")
    existing = []
    assert.equal(await provider.findOrCreateCustomer("ayse@example.com"), "ctm_01hv8wt8nffez4p2t6typn4a5j")
    assert.deepEqual(stub.calls.at(-1)!.body, { email: "ayse@example.com" })
  } finally {
    stub.restore()
  }
})

test("checkoutStatus reports the workspace only from our signed custom_data", async () => {
  const provider = createPaddleProvider(readBillingConfig(SANDBOX_ENV).config!)
  let customData: unknown = signed()
  const stub = stubFetch(() => ({ status: "completed", subscription_id: "sub_01hv8x29kz0t586xy6zn1a62ny", custom_data: customData }))
  try {
    assert.deepEqual(await provider.checkoutStatus("txn_01hv8wptq8987qeep44cyrewp9"), { status: "completed", subscriptionId: "sub_01hv8x29kz0t586xy6zn1a62ny", organizationId: ORG })
    customData = { organization_id: ORG }
    assert.equal((await provider.checkoutStatus("txn_01hv8wptq8987qeep44cyrewp9")).organizationId, null)
    await assert.rejects(provider.checkoutStatus("txn_../customers"), (err: unknown) => err instanceof BillingError && err.code === "invalid_input")
    assert.equal(stub.calls.length, 2)
  } finally {
    stub.restore()
  }
})
