import { after, before, beforeEach, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import { clearSettingsCache, type Db } from "@apex/db"
import { CheckoutRefused } from "../lib/billing/checkout.ts"
import { cancelSubscription, changePlan, invoicePdf, portalLink, previewPlanChange, resumeSubscription, updateOverage, workspaceInvoices } from "../lib/billing/manage.ts"
import type { BillingProvider, Invoice, PlanTarget, SubscriptionRef } from "../lib/billing/types.ts"

// Managing a running subscription from the billing page (lib/billing/manage.ts) against migrated
// PGlite, with a provider that records what it was asked.

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
  await db.query(`insert into app.platform_settings (key, value) values ('flags.billing', '{"enabled": true}'::jsonb)`)
  clearSettingsCache()
})

const CUSTOMER = "ctm_01hv6y1jedq4p1n0yqn5ba3ky4"
const SUB = "sub_01hv8x29kz0t586xy6zn1a62ny"
const OURS = "txn_01hv8wptq8987qeep44cyrewp9"
const THEIRS = "txn_01hv8wptq8987qeep44cyrewp0"

let n = 0
async function member(role: "owner" | "admin" | "member", organizationId?: string) {
  n++
  const org = organizationId ?? (await db.query<{ id: string }>("insert into app.organizations (name, plan) values ('Kahve', 'pro') returning id")).rows[0]!.id
  const { rows } = await db.query<{ id: string }>(
    `insert into app.users (email, username, account_type, email_verified_at, terms_accepted_at, terms_version)
     values ($1, $2, 'business', now(), now(), '1') returning id`,
    [`user${n}@example.com`, `user${n}`],
  )
  await db.query("insert into app.organization_members (organization_id, user_id, role) values ($1, $2, $3)", [org, rows[0]!.id, role])
  return { org, userId: rows[0]!.id }
}

async function subscribed(org: string, patch: { status?: string; cancel?: boolean; scheduled?: object } = {}) {
  await db.query("insert into app.billing_customers (organization_id, provider, provider_customer_id) values ($1, 'paddle', $2)", [org, CUSTOMER])
  await db.query(
    `insert into app.subscriptions (organization_id, provider, provider_subscription_id, plan, "interval", status, current_period_start,
       current_period_end, cancel_at_period_end, scheduled_change, provider_updated_at)
     values ($1, 'paddle', $2, 'pro', 'month', $3, now(), now() + interval '1 month', $4, $5, now())`,
    [org, SUB, patch.status ?? "active", patch.cancel ?? false, patch.scheduled ? JSON.stringify(patch.scheduled) : null],
  )
}

function fakeProvider() {
  const calls: { op: string; sub?: SubscriptionRef; target?: PlanTarget; arg?: unknown }[] = []
  const invoice = (id: string): Invoice => ({ id, number: "123-1", status: "completed", kind: "renewal", billedAt: new Date(), totalMinor: 7900, currency: "USD", subscriptionId: SUB })
  const provider = {
    id: "paddle",
    environment: "sandbox",
    async previewChange(sub: SubscriptionRef, target: PlanTarget) {
      calls.push({ op: "preview", sub, target })
      return { timing: "immediately", currency: "USD", dueNowMinor: 8500, creditMinor: 0, nextBilledAt: new Date("2027-02-01T00:00:00Z"), nextTotalMinor: 24900 }
    },
    async changePlan(sub: SubscriptionRef, target: PlanTarget) {
      calls.push({ op: "change", sub, target })
      return { timing: "immediately" }
    },
    async cancelAtPeriodEnd(sub: SubscriptionRef) {
      calls.push({ op: "cancel", sub })
    },
    async resume(sub: SubscriptionRef) {
      calls.push({ op: "resume", sub })
    },
    async portalUrl(customerId: string, ids: string[]) {
      calls.push({ op: "portal", arg: [customerId, ids] })
      return "https://sandbox-customer-portal.paddle.com/cpl_x"
    },
    async listInvoices(customerId: string) {
      calls.push({ op: "invoices", arg: customerId })
      return [invoice(OURS)]
    },
    async invoicePdfUrl(id: string) {
      calls.push({ op: "pdf", arg: id })
      return `https://sandbox-invoices.paddle.com/${id}.pdf`
    },
  } as unknown as BillingProvider
  return { provider, calls }
}

const refused = (code: CheckoutRefused["code"]) => (err: unknown) => err instanceof CheckoutRefused && err.code === code
const BUSINESS = { plan: "business", interval: "month" } as const

test("an owner previews and makes a change on the workspace's own subscription", async () => {
  const { org, userId } = await member("owner")
  await subscribed(org)
  const { provider, calls } = fakeProvider()
  const preview = await previewPlanChange(db, provider, userId, BUSINESS)
  assert.deepEqual(preview, { timing: "immediately", currency: "USD", dueNowMinor: 8500, creditMinor: 0, nextBilledAt: "2027-02-01T00:00:00.000Z", nextTotalMinor: 24900 })
  assert.deepEqual(await changePlan(db, provider, userId, BUSINESS), { timing: "immediately" })
  assert.deepEqual(calls.map((c) => [c.op, c.sub?.providerSubscriptionId, c.sub?.organizationId]), [["preview", SUB, org], ["change", SUB, org]])
})

test("members can read the page's invoices but change nothing", async () => {
  const { org } = await member("owner")
  const { userId } = await member("member", org)
  await subscribed(org)
  const { provider, calls } = fakeProvider()
  await assert.rejects(previewPlanChange(db, provider, userId, BUSINESS), refused("forbidden"))
  await assert.rejects(changePlan(db, provider, userId, BUSINESS), refused("forbidden"))
  await assert.rejects(cancelSubscription(db, provider, userId), refused("forbidden"))
  await assert.rejects(resumeSubscription(db, provider, userId), refused("forbidden"))
  await assert.rejects(portalLink(db, provider, userId), refused("forbidden"))
  await assert.rejects(updateOverage(db, provider, true, userId, { enabled: false, capCents: null }), refused("forbidden"))
  await assert.rejects(invoicePdf(db, provider, userId, OURS), refused("forbidden"), "the PDF carries the payer's details")
  assert.equal((await workspaceInvoices(db, provider, userId)).length, 1)
  assert.deepEqual(calls.map((c) => c.op), ["invoices"])
})

test("a change waits while one is scheduled, and needs a running subscription", async () => {
  const { org, userId } = await member("owner")
  const { provider, calls } = fakeProvider()
  await assert.rejects(previewPlanChange(db, provider, userId, BUSINESS), refused("no_subscription"))
  await subscribed(org, { cancel: true })
  await assert.rejects(previewPlanChange(db, provider, userId, BUSINESS), refused("pending_change"))
  await db.query("update app.subscriptions set cancel_at_period_end = false, scheduled_change = $2 where organization_id = $1", [
    org,
    JSON.stringify({ action: "change", plan: "starter", interval: "month", effectiveAt: new Date(Date.now() + 86_400_000).toISOString() }),
  ])
  await assert.rejects(changePlan(db, provider, userId, BUSINESS), refused("pending_change"))
  await db.query("update app.subscriptions set scheduled_change = null, status = 'past_due', grace_until = now() + interval '7 days' where organization_id = $1", [org])
  await assert.rejects(changePlan(db, provider, userId, BUSINESS), refused("no_subscription"))
  assert.equal(calls.length, 0)
})

test("cancel once, then resume; resuming what isn't canceled is refused", async () => {
  const { org, userId } = await member("admin")
  await subscribed(org)
  const { provider, calls } = fakeProvider()
  await assert.rejects(resumeSubscription(db, provider, userId), refused("not_canceling"))
  await cancelSubscription(db, provider, userId)
  await db.query("update app.subscriptions set cancel_at_period_end = true where organization_id = $1", [org])
  await cancelSubscription(db, provider, userId) // already set to end: nothing more to ask
  await resumeSubscription(db, provider, userId)
  assert.deepEqual(calls.map((c) => c.op), ["cancel", "resume"])
})

test("an invoice PDF only for an invoice on the workspace's own list", async () => {
  const { org, userId } = await member("owner")
  const { provider, calls } = fakeProvider()
  await assert.rejects(invoicePdf(db, provider, userId, OURS), refused("not_found"), "no customer yet")
  await subscribed(org)
  assert.equal(await invoicePdf(db, provider, userId, OURS), `https://sandbox-invoices.paddle.com/${OURS}.pdf`)
  await assert.rejects(invoicePdf(db, provider, userId, THEIRS), refused("not_found"), "another customer's transaction")
  await assert.rejects(invoicePdf(db, provider, userId, "../customers"), refused("not_found"))
  assert.deepEqual(calls.filter((c) => c.op === "pdf").map((c) => c.arg), [OURS])
})

test("the portal opens for the workspace's customer and subscription", async () => {
  const { org, userId } = await member("owner")
  const { provider, calls } = fakeProvider()
  await assert.rejects(portalLink(db, provider, userId), refused("no_subscription"))
  await subscribed(org)
  assert.match(await portalLink(db, provider, userId), /^https:\/\/sandbox-customer-portal\.paddle\.com\//)
  assert.deepEqual(calls.at(-1)!.arg, [CUSTOMER, [SUB]])
})

test("overage turns on only when it can be billed, with a valid cap", async () => {
  const { org, userId } = await member("owner")
  await subscribed(org)
  const { provider } = fakeProvider()
  await assert.rejects(updateOverage(db, provider, false, userId, { enabled: true, capCents: 5000 }), refused("overage_unavailable"))
  await assert.rejects(updateOverage(db, provider, true, userId, { enabled: true, capCents: 4999 }), refused("invalid_cap"))
  await updateOverage(db, provider, true, userId, { enabled: true, capCents: 5000 })
  const row = async () => (await db.query<{ e: boolean; c: number }>("select overage_enabled as e, overage_cap_units as c from app.organizations where id = $1", [org])).rows[0]
  assert.deepEqual(await row(), { e: true, c: 1000 })
  // off works even when it couldn't be turned on now
  await updateOverage(db, provider, false, userId, { enabled: false, capCents: null })
  assert.deepEqual(await row(), { e: false, c: 1000 })
})

test("nothing is managed while billing is off", async () => {
  const { org, userId } = await member("owner")
  await subscribed(org)
  await db.query("truncate app.platform_settings")
  clearSettingsCache()
  const { provider } = fakeProvider()
  await assert.rejects(cancelSubscription(db, provider, userId), refused("billing_disabled"))
  await assert.rejects(workspaceInvoices(db, provider, userId), refused("billing_disabled"))
})
