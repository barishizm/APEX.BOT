import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { clearSettingsCache } from "../src/platform-settings.ts"
import { addReplyUsage, dueGraceExpiries, expireGrace, getSubscription, replyUsageFifths, upsertSubscription, type SubscriptionInput } from "../src/billing.ts"
import { claimBillingNotice, dueBillingNotices, finishBillingNotice, releaseBillingNotice, rememberUserLocale, type BillingNotice } from "../src/billing-notices.ts"
import { replyWindow } from "../src/plans.ts"

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
beforeEach(async () => {
  await db.query("truncate app.users, app.organizations, app.platform_settings cascade")
  clearSettingsCache()
})

const DAY = 24 * 60 * 60 * 1000
const T0 = new Date("2027-01-10T12:00:00Z")
const at = (days: number) => new Date(T0.getTime() + days * DAY)

let n = 0
async function workspace(plan = "free", owners: { locale?: string | null; suspended?: boolean }[] = [{}]) {
  const { rows } = await db.query<{ id: string }>("insert into app.organizations (name, plan) values ('Kahve', $1) returning id", [plan])
  const org = rows[0]!.id
  for (const o of owners) {
    n++
    const u = await db.query<{ id: string }>(
      `insert into app.users (email, username, account_type, terms_accepted_at, terms_version, locale, suspended_at)
       values ($1, $2, 'personal', now(), 'v1', $3, $4) returning id`,
      [`owner${n}@example.com`, `owner${n}`, o.locale ?? null, o.suspended ? new Date() : null],
    )
    await db.query("insert into app.organization_members (organization_id, user_id, role) values ($1, $2, 'owner')", [org, u.rows[0]!.id])
  }
  return org
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
// the payment failed at T0 + 1 day: grace runs to T0 + 8 days
const failPayment = (org: string) => upsert(sub(org, { status: "past_due", providerUpdatedAt: at(1) }))

const kinds = async (now: Date, org?: string) => (await dueBillingNotices(db, now, org ? [org] : null)).map((x) => x.kind).sort()
/** What a run does with each notice: claim it, then record it as sent. */
async function deliver(now: Date) {
  const due = await dueBillingNotices(db, now)
  for (const x of due) if (await claimBillingNotice(db, x)) await finishBillingNotice(db, x, x.recipients.length)
  return due
}
async function replyQuotaOn(org: string) {
  await db.query("insert into app.platform_settings (key, value) values ('flags.reply_quota', $1::jsonb)", [JSON.stringify({ enabled: false, workspaces: { [org]: true } })])
  clearSettingsCache()
}

describe("grace_expired", () => {
  test("drops the workspace to Free once the grace has run out, once, with an audit entry", async () => {
    const org = await workspace()
    await upsert(sub(org))
    await failPayment(org)
    assert.equal(await planOf(org), "pro")

    assert.deepEqual(await dueGraceExpiries(db, at(7)), [])
    assert.deepEqual(await db.transaction((tx) => expireGrace(tx, org, at(7))), { outcome: "not_due" })

    assert.deepEqual(await dueGraceExpiries(db, at(8)), [org])
    const result = await db.transaction((tx) => expireGrace(tx, org, at(8)))
    assert.equal(result.outcome, "applied")
    assert.equal(result.outcome === "applied" && result.plan.plan, "free")
    assert.equal(await planOf(org), "free")
    // the provider may still collect: the subscription stays past_due
    assert.equal((await getSubscription(db, org))!.status, "past_due")
    const audit = await db.query<{ action: string; actor_email: string | null }>("select action, actor_email from app.admin_audit_log where target_id = $1 and action = 'billing.grace_expired'", [org])
    assert.equal(audit.rows.length, 1)

    assert.deepEqual(await dueGraceExpiries(db, at(9)), [])
    assert.deepEqual(await db.transaction((tx) => expireGrace(tx, org, at(9))), { outcome: "not_due" })
  })

  test("carries the window's replies over to the calendar month", async () => {
    const org = await workspace()
    await upsert(sub(org))
    await failPayment(org)
    await addReplyUsage(db, org, T0, 50)
    await db.transaction((tx) => expireGrace(tx, org, at(8)))
    assert.equal(await replyUsageFifths(db, org, T0), 0)
    assert.equal(await replyUsageFifths(db, org, replyWindow(null, at(8)).start), 50)
  })

  test("an override keeps its plan; a recovered payment clears the mark", async () => {
    const org = await workspace()
    await upsert(sub(org))
    await failPayment(org)
    await db.query("insert into app.plan_overrides (organization_id, plan, reason, starts_at, ends_at) values ($1, 'starter', 'comp', $2, $3)", [org, T0, at(60)])
    const result = await db.transaction((tx) => expireGrace(tx, org, at(8)))
    assert.equal(result.outcome === "applied" && result.plan.plan, "starter")

    await upsert(sub(org, { status: "active", currentPeriodStart: at(9), currentPeriodEnd: at(40), providerUpdatedAt: at(9) }), at(9))
    const { rows } = await db.query<{ grace_expired_at: Date | null }>("select grace_expired_at from app.subscriptions where organization_id = $1", [org])
    assert.equal(rows[0]!.grace_expired_at, null)
  })

  test("not for a workspace that isn't past_due", async () => {
    const org = await workspace()
    await upsert(sub(org))
    assert.deepEqual(await db.transaction((tx) => expireGrace(tx, org, at(40))), { outcome: "not_due" })
    assert.deepEqual(await db.transaction((tx) => expireGrace(tx, "00000000-0000-0000-0000-000000000000", at(40))), { outcome: "unknown_organization" })
  })
})

describe("billing notices", () => {
  test("a start, then the renewal of the next period, each once", async () => {
    const org = await workspace("free", [{ locale: "tr" }])
    await upsert(sub(org))
    const [start] = await deliver(at(0.1))
    assert.equal(start!.kind, "subscription_started")
    assert.deepEqual(start!.recipients, [{ email: start!.recipients[0]!.email, locale: "tr" }])
    assert.equal(start!.data.kind === "subscription_started" && start!.data.renewsAt.getTime(), at(31).getTime())
    // the first period isn't also a renewal, and nothing is sent twice
    assert.deepEqual(await kinds(at(1)), [])

    await upsert(sub(org, { currentPeriodStart: at(31), currentPeriodEnd: at(59), providerUpdatedAt: at(31) }), at(31))
    assert.deepEqual(await kinds(at(31.1)), ["subscription_renewed"])
    await deliver(at(31.1))
    assert.deepEqual(await kinds(at(32)), [])
  })

  test("a start or renewal more than a few days old isn't announced", async () => {
    const org = await workspace()
    await upsert(sub(org))
    assert.deepEqual(await kinds(at(4)), [])
  })

  test("a failed payment on day 0, a reminder on day 3, the last call on day 6, then the downgrade", async () => {
    const org = await workspace()
    await upsert(sub(org))
    await deliver(at(0.5))
    await failPayment(org)
    assert.deepEqual(await kinds(at(1)), ["payment_failed"])
    await deliver(at(1))
    assert.deepEqual(await kinds(at(2)), [])
    assert.deepEqual(await kinds(at(4)), ["grace_reminder"])
    await deliver(at(4))
    assert.deepEqual(await kinds(at(5)), [])
    const [last] = await deliver(at(7.5))
    assert.equal(last!.kind, "grace_last_call")
    assert.equal(last!.data.kind === "grace_last_call" && last!.data.graceUntil.getTime(), at(8).getTime())

    await db.transaction((tx) => expireGrace(tx, org, at(8)))
    assert.deepEqual(await kinds(at(8)), ["downgraded"])
    await deliver(at(8))
    assert.deepEqual(await kinds(at(9)), [])
    // Paddle cancels it after its last retry: still the same downgrade
    await upsert(sub(org, { status: "canceled", providerUpdatedAt: at(9) }), at(9))
    assert.deepEqual(await kinds(at(10)), [])
  })

  test("a run that missed days sends only the stage it is in", async () => {
    const org = await workspace()
    await upsert(sub(org))
    await deliver(at(0.5))
    await failPayment(org)
    assert.deepEqual(await kinds(at(7.5)), ["grace_last_call"])
  })

  test("a cancellation is confirmed once, then the end of the subscription", async () => {
    const org = await workspace("free")
    await upsert(sub(org))
    await deliver(at(0.5))
    await upsert(sub(org, { cancelAtPeriodEnd: true, scheduledChange: { action: "cancel", effectiveAt: at(31).toISOString() }, providerUpdatedAt: at(5) }), at(5))
    const [cancel] = await deliver(at(5))
    assert.equal(cancel!.kind, "cancel_confirmed")
    assert.equal(cancel!.data.kind === "cancel_confirmed" && cancel!.data.endsAt.getTime(), at(31).getTime())
    assert.deepEqual(await kinds(at(6)), [])

    await upsert(sub(org, { status: "canceled", providerUpdatedAt: at(31) }), at(31))
    assert.equal(await planOf(org), "free")
    assert.deepEqual(await kinds(at(31)), ["downgraded"])
  })

  test("quota warnings at 80% and 100% of the window, only while the reply quota is enforced", async () => {
    const org = await workspace("free")
    const window = replyWindow(null, T0)
    await addReplyUsage(db, org, window.start, 85 * 5)
    assert.deepEqual(await kinds(T0), [])

    await replyQuotaOn(org)
    const [warn] = await deliver(T0)
    assert.equal(warn!.kind, "quota_80")
    assert.deepEqual(warn!.data, { kind: "quota_80", plan: "free", usedReplies: 85, allowanceReplies: 100, resetsAt: window.end, overage: "none", capCents: null })
    assert.deepEqual(await kinds(T0), [])

    await addReplyUsage(db, org, window.start, 20 * 5)
    assert.deepEqual(await kinds(T0), ["quota_100"])
    await deliver(T0)
    assert.deepEqual(await kinds(T0), [])
    // the next window starts again
    await addReplyUsage(db, org, window.end, 100 * 5)
    assert.deepEqual(await kinds(at(30)), ["quota_100"])
  })

  test("the quota notice says whether overage takes over", async () => {
    const org = await workspace("free")
    await upsert(sub(org))
    await deliver(at(0.5))
    await db.query("update app.organizations set overage_enabled = true, overage_cap_units = 1000 where id = $1", [org])
    await replyQuotaOn(org)
    await addReplyUsage(db, org, T0, 1500 * 5)
    const [full] = await dueBillingNotices(db, at(1))
    assert.equal(full!.data.kind === "quota_100" && full!.data.overage, "on")
    assert.equal(full!.data.kind === "quota_100" && full!.data.capCents, 5000)
  })

  test("goes to the owners who can receive it; a workspace without one gets nothing", async () => {
    const org = await workspace("free", [{}, { suspended: true }])
    await upsert(sub(org))
    const [start] = await dueBillingNotices(db, at(0.1))
    assert.equal(start!.recipients.length, 1)

    const none = await workspace("free", [])
    await upsert(sub(none, { providerSubscriptionId: "sub_2" }))
    assert.deepEqual(await kinds(at(0.1), none), [])
  })

  test("a claim is taken once; one given back is tried again", async () => {
    const org = await workspace()
    await upsert(sub(org))
    const [start] = (await dueBillingNotices(db, at(0.1))) as [BillingNotice]
    assert.equal(await claimBillingNotice(db, start), true)
    assert.equal(await claimBillingNotice(db, start), false)
    assert.deepEqual(await kinds(at(0.1)), [])
    await releaseBillingNotice(db, start)
    assert.deepEqual(await kinds(at(0.1)), ["subscription_started"])
  })

  test("the user's dashboard language is remembered", async () => {
    await workspace("free", [{ locale: "en" }])
    const { rows } = await db.query<{ id: string }>("select id from app.users")
    await rememberUserLocale(db, rows[0]!.id, "lv")
    assert.equal((await db.query<{ locale: string }>("select locale from app.users")).rows[0]!.locale, "lv")
  })
})
