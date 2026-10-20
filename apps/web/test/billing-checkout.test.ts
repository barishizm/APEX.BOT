import { after, before, beforeEach, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import { clearSettingsCache, type Db } from "@apex/db"
import { CheckoutRefused, checkoutState, startCheckout } from "../lib/billing/checkout.ts"
import { billingNextPath, billingPath, checkoutLocale, parsePlanChoice } from "../lib/billing/intent.ts"
import type { BillingProvider, CheckoutConfig, CheckoutStatus } from "../lib/billing/types.ts"
import { inviteTokenFromPath, safeNextPath } from "../lib/next-path.ts"

// Starting a checkout from the billing page (lib/billing/checkout.ts) against migrated PGlite, with a
// provider that records what it was asked; and the ?next= paths that carry a plan through sign-up.

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
beforeEach(async () => {
  await db.query("truncate app.organizations, app.users, app.platform_settings, app.rate_limits cascade")
  clearSettingsCache()
})

let n = 0
async function member(role: "owner" | "admin" | "member", organizationId?: string) {
  n++
  const org = organizationId ?? (await db.query<{ id: string }>("insert into app.organizations (name) values ('Kahve') returning id")).rows[0]!.id
  const { rows } = await db.query<{ id: string; email: string }>(
    `insert into app.users (email, username, account_type, email_verified_at, terms_accepted_at, terms_version)
     values ($1, $2, 'business', now(), now(), '1') returning id, email`,
    [`user${n}@example.com`, `user${n}`],
  )
  await db.query("insert into app.organization_members (organization_id, user_id, role) values ($1, $2, $3)", [org, rows[0]!.id, role])
  return { org, user: rows[0]! }
}

const billingOn = () => db.query(`insert into app.platform_settings (key, value) values ('flags.billing', '{"enabled": true}'::jsonb)`)

function fakeProvider(opts: { customer?: string; status?: (id: string) => CheckoutStatus } = {}) {
  const calls = { customers: [] as string[], checkouts: [] as Parameters<BillingProvider["createCheckout"]>[] }
  const provider = {
    id: "paddle",
    environment: "sandbox",
    async findOrCreateCustomer(email: string) {
      calls.customers.push(email)
      return opts.customer ?? "ctm_01hv6y1jedq4p1n0yqn5ba3ky4"
    },
    async createCheckout(...args: Parameters<BillingProvider["createCheckout"]>): Promise<CheckoutConfig> {
      calls.checkouts.push(args)
      return { provider: "paddle", environment: "sandbox", clientToken: "test_x", transactionId: "txn_01hv8wptq8987qeep44cyrewp9", settings: args[3] ?? {} }
    },
    async checkoutStatus(id: string) {
      return opts.status?.(id) ?? { status: "draft", subscriptionId: null, organizationId: null }
    },
  } as unknown as BillingProvider
  return { provider, calls }
}

const refused = (code: CheckoutRefused["code"]) => (err: unknown) => err instanceof CheckoutRefused && err.code === code
const PRO_YEAR = { plan: "pro", interval: "year" } as const

test("an owner or admin gets a checkout for their workspace, prefilled with their email, in their language", async () => {
  await billingOn()
  for (const role of ["owner", "admin"] as const) {
    const { org, user } = await member(role)
    const { provider, calls } = fakeProvider()
    const config = await startCheckout(db, provider, user, PRO_YEAR, "tr")
    assert.equal(config.transactionId, "txn_01hv8wptq8987qeep44cyrewp9")
    assert.deepEqual(calls.customers, [user.email])
    assert.deepEqual(calls.checkouts, [[{ id: org, customerId: "ctm_01hv6y1jedq4p1n0yqn5ba3ky4" }, "pro", "year", { locale: "tr" }]])
  }
})

test("a member can't start a checkout, and nobody can while billing is off", async () => {
  const { user } = await member("member")
  const { provider, calls } = fakeProvider()
  await billingOn()
  await assert.rejects(startCheckout(db, provider, user, PRO_YEAR, "en"), refused("forbidden"))

  await db.query("truncate app.platform_settings")
  clearSettingsCache()
  const { user: owner } = await member("owner")
  await assert.rejects(startCheckout(db, provider, owner, PRO_YEAR, "en"), refused("billing_disabled"))
  await billingOn()
  clearSettingsCache()
  await assert.rejects(startCheckout(db, null, owner, PRO_YEAR, "en"), refused("billing_disabled"), "no Paddle configuration")
  assert.equal(calls.checkouts.length, 0)
})

test("a workspace with a running subscription isn't sold a second one", async () => {
  await billingOn()
  const { org, user } = await member("owner")
  await db.query(
    `insert into app.subscriptions (organization_id, provider, provider_subscription_id, plan, "interval", status, current_period_start, current_period_end, provider_updated_at)
     values ($1, 'paddle', 'sub_01hv8x29kz0t586xy6zn1a62ny', 'pro', 'month', 'active', now(), now() + interval '1 month', now())`,
    [org],
  )
  await assert.rejects(startCheckout(db, fakeProvider().provider, user, PRO_YEAR, "en"), refused("already_subscribed"))
})

test("the workspace's stored customer is reused; another workspace's customer is never borrowed", async () => {
  await billingOn()
  const { org, user } = await member("owner")
  await db.query("insert into app.billing_customers (organization_id, provider, provider_customer_id) values ($1, 'paddle', 'ctm_01hv8wt8nffez4p2t6typn4a5j')", [org])
  const stored = fakeProvider()
  await startCheckout(db, stored.provider, user, PRO_YEAR, "en")
  assert.deepEqual(stored.calls.customers, [], "no lookup")
  assert.equal(stored.calls.checkouts[0]![0].customerId, "ctm_01hv8wt8nffez4p2t6typn4a5j")

  // the payer's email already pays for their other workspace: no prefill, they type one
  const { org: second } = await member("owner")
  const { user: payer } = await member("admin", second)
  await db.query("update app.billing_customers set provider_customer_id = 'ctm_01hv6y1jedq4p1n0yqn5ba3ky4' where organization_id = $1", [org])
  const borrowed = fakeProvider({ customer: "ctm_01hv6y1jedq4p1n0yqn5ba3ky4" })
  await startCheckout(db, borrowed.provider, payer, PRO_YEAR, "en")
  assert.equal(borrowed.calls.checkouts[0]![0].customerId, null)
})

test("starting checkouts is rate limited per user", async () => {
  await billingOn()
  const { user } = await member("owner")
  const { provider } = fakeProvider()
  for (let i = 0; i < 10; i++) await startCheckout(db, provider, user, PRO_YEAR, "en")
  await assert.rejects(startCheckout(db, provider, user, PRO_YEAR, "en"), refused("rate_limited"))
})

test("a checkout is active once the webhook stored the subscription it created", async () => {
  await billingOn()
  const { org, user } = await member("owner")
  let status: CheckoutStatus = { status: "ready", subscriptionId: null, organizationId: org }
  const { provider } = fakeProvider({ status: () => status })
  const txn = "txn_01hv8wptq8987qeep44cyrewp9"
  assert.deepEqual(await checkoutState(db, provider, user.id, txn), { state: "processing", plan: null })

  // paid, but the webhook hasn't landed yet
  status = { status: "completed", subscriptionId: "sub_01hv8x29kz0t586xy6zn1a62ny", organizationId: org }
  assert.deepEqual(await checkoutState(db, provider, user.id, txn), { state: "processing", plan: null })

  await db.query(
    `insert into app.subscriptions (organization_id, provider, provider_subscription_id, plan, "interval", status, current_period_start, current_period_end, provider_updated_at)
     values ($1, 'paddle', 'sub_01hv8x29kz0t586xy6zn1a62ny', 'pro', 'year', 'active', now(), now() + interval '1 year', now())`,
    [org],
  )
  assert.deepEqual(await checkoutState(db, provider, user.id, txn), { state: "active", plan: "pro" })

  status = { status: "canceled", subscriptionId: null, organizationId: org }
  await db.query("delete from app.subscriptions")
  assert.equal((await checkoutState(db, provider, user.id, txn)).state, "failed")
})

test("another workspace's checkout, or one we didn't sign, can't be followed", async () => {
  await billingOn()
  const { user } = await member("owner")
  const { org: other } = await member("owner")
  for (const organizationId of [other, null]) {
    const { provider } = fakeProvider({ status: () => ({ status: "completed", subscriptionId: "sub_x", organizationId }) })
    await assert.rejects(checkoutState(db, provider, user.id, "txn_01hv8wptq8987qeep44cyrewp9"), refused("not_found"))
  }
})

// --- the plan through sign-up ---

test("parsePlanChoice takes only our paid plans and intervals", () => {
  assert.deepEqual(parsePlanChoice("pro", "year"), PRO_YEAR)
  for (const [plan, interval] of [["free", "month"], ["enterprise", "year"], ["pro", "week"], ["pro", null], [["pro"], "year"]])
    assert.equal(parsePlanChoice(plan, interval), null, `${plan}/${interval}`)
})

test("next may return to the billing page with a plan, rebuilt, and nowhere else", () => {
  assert.equal(safeNextPath(billingPath(PRO_YEAR)), "/dashboard/settings/billing?plan=pro&interval=year")
  assert.equal(safeNextPath("/dashboard/settings/billing"), "/dashboard/settings/billing")
  // extra parameters are dropped, the order normalised
  assert.equal(safeNextPath("/dashboard/settings/billing?interval=month&plan=starter&checkout=txn_x&next=//evil.com"), "/dashboard/settings/billing?plan=starter&interval=month")
  for (const raw of [
    "//evil.com/dashboard/settings/billing",
    "https://evil.com/dashboard/settings/billing?plan=pro&interval=year",
    "/dashboard/settings/billingx?plan=pro&interval=year",
    "/dashboard/settings/billing/../../admin",
    "/dashboard/settings/billing#x",
    "/dashboard/settings/billing?plan=free&interval=month",
    "/dashboard",
    "/\\evil.com",
    null,
    42,
  ])
    assert.equal(safeNextPath(raw), null, String(raw))
  assert.equal(billingNextPath("/dashboard/settings/billing?plan=pro"), null, "half a choice")
})

test("invitation links still pass, and only they carry an invite token", () => {
  const invite = "/invite/abcdefghijklmnopqrstuvwxyz012345"
  assert.equal(safeNextPath(invite), invite)
  assert.equal(inviteTokenFromPath(invite), "abcdefghijklmnopqrstuvwxyz012345")
  assert.equal(inviteTokenFromPath(billingPath(PRO_YEAR)), null)
})

test("Paddle Checkout gets the dashboard's language where it has it, English otherwise", () => {
  assert.equal(checkoutLocale("tr"), "tr")
  assert.equal(checkoutLocale("en"), "en")
  for (const l of ["lt", "lv", "et"] as const) assert.equal(checkoutLocale(l), "en")
})

// --- launch copy (withLaunchCopy in lib/i18n/server.ts) ---

test("every language's launch copy replaces its cost question and drops the beta", async () => {
  const dictionaries = await Promise.all(["en", "tr", "lt", "lv", "et"].map(async (l) => [l, (await import(`../lib/i18n/dictionaries/${l}.ts`))[l]] as const))
  for (const [locale, dict] of dictionaries) {
    assert.ok(dict.landing.faq.items.some((item: { q: string }) => item.q === dict.launch.faqCost.q), `${locale}: launch.faqCost.q must match an FAQ question`)
    assert.doesNotMatch(JSON.stringify(dict.launch), /beta|beeta/i, locale)
    assert.match(dict.launch.paidCta, /\{plan\}/, locale)
  }
})
