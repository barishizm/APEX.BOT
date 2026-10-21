import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import { BILLING_NOTICE_KINDS, type BillingNotice, type BillingNoticeData, type Db } from "@apex/db"
import { runBillingNotices, sendBillingNoticesFor } from "../lib/billing/notices.ts"
import { LOCALES, type Locale } from "../lib/i18n/config.ts"
import { billingMail } from "../lib/mail.ts"

// The billing notices run (lib/billing/notices.ts) against migrated PGlite, with a mailer that keeps
// what it was asked to send, and every email in every language.

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
beforeEach(() => db.query("truncate app.users, app.organizations cascade").then(() => {}))

const DAY = 86400_000
const PERIOD = new Date("2027-01-10T12:00:00Z")
const at = (days: number) => new Date(PERIOD.getTime() + days * DAY)

async function pastDueWorkspace(locale: string | null = "tr") {
  const { rows } = await db.query<{ id: string }>("insert into app.organizations (name, plan) values ('Kahve', 'pro') returning id")
  const org = rows[0]!.id
  const u = await db.query<{ id: string }>(
    `insert into app.users (email, username, account_type, terms_accepted_at, terms_version, locale)
     values ('owner@example.com', 'owner', 'personal', now(), 'v1', $1) returning id`,
    [locale],
  )
  await db.query("insert into app.organization_members (organization_id, user_id, role) values ($1, $2, 'owner')", [org, u.rows[0]!.id])
  await db.query(
    `insert into app.subscriptions (organization_id, provider, provider_subscription_id, plan, "interval", status, current_period_start,
       current_period_end, grace_until, provider_updated_at)
     values ($1, 'paddle', 'sub_1', 'pro', 'month', 'past_due', $2, $3, $4, $2)`,
    [org, PERIOD, at(31), at(8)],
  )
  // the start was announced when it happened
  await db.query("insert into app.billing_notices (organization_id, kind, period) values ($1, 'subscription_started', 'sub_1')", [org])
  return org
}

function mailer(ok = true) {
  const sent: { email: string; kind: string; locale: Locale; subject: string }[] = []
  const send = async (email: string, n: Pick<BillingNotice, "kind" | "workspace" | "data">, locale: Locale, link: string) => {
    sent.push({ email, kind: n.kind, locale, subject: billingMail(n, locale, link).subject })
    return ok
  }
  return { sent, send }
}

describe("billing notices run", () => {
  test("emails the failed payment in the owner's language, once", async () => {
    await pastDueWorkspace("tr")
    const m = mailer()
    const first = await runBillingNotices(db, at(1), m.send)
    assert.equal(first.sent, 1)
    assert.deepEqual(m.sent.map((s) => [s.email, s.kind, s.locale]), [["owner@example.com", "payment_failed", "tr"]])
    assert.match(m.sent[0]!.subject, /ödeme alınamadı/)
    const second = await runBillingNotices(db, at(1.5), m.send)
    assert.equal(second.due, 0)
    assert.equal(m.sent.length, 1)
  })

  test("ends the grace and sends the downgrade in the same run", async () => {
    const org = await pastDueWorkspace(null)
    const m = mailer()
    const result = await runBillingNotices(db, at(8), m.send)
    assert.equal(result.graceExpired, 1)
    assert.deepEqual(m.sent.map((s) => [s.kind, s.locale]), [["downgraded", "en"]])
    const { rows } = await db.query<{ plan: string }>("select plan from app.organizations where id = $1", [org])
    assert.equal(rows[0]!.plan, "free")
  })

  test("a notice no owner received is tried again on the next run", async () => {
    await pastDueWorkspace()
    const failing = mailer(false)
    const result = await runBillingNotices(db, at(1), failing.send)
    assert.equal(result.failed, 1)
    const m = mailer()
    assert.equal((await runBillingNotices(db, at(1.2), m.send)).sent, 1)
  })

  test("after a webhook, only that workspace's notices go out", async () => {
    const org = await pastDueWorkspace()
    const m = mailer()
    const result = await sendBillingNoticesFor(db, ["00000000-0000-0000-0000-000000000000"], at(1), m.send)
    assert.equal(result.due, 0)
    assert.equal((await sendBillingNoticesFor(db, [org], at(1), m.send)).sent, 1)
  })
})

describe("billing emails", () => {
  const until = new Date("2027-01-18T12:00:00Z")
  const samples: BillingNoticeData[] = [
    { kind: "payment_failed", plan: "pro", graceUntil: until },
    { kind: "grace_reminder", plan: "pro", graceUntil: until },
    { kind: "grace_last_call", plan: "pro", graceUntil: until },
    { kind: "downgraded", plan: "business", freeReplies: 100 },
    { kind: "subscription_started", plan: "starter", interval: "month", renewsAt: until, monthlyReplies: 600 },
    { kind: "subscription_renewed", plan: "starter", interval: "year", renewsAt: until, monthlyReplies: 600 },
    { kind: "cancel_confirmed", plan: "pro", endsAt: until },
    ...(["on", "off", "none"] as const).flatMap((overage) =>
      (["quota_80", "quota_100"] as const).map(
        (kind): BillingNoticeData => ({ kind, plan: "pro", usedReplies: 1250, allowanceReplies: 1500, resetsAt: until, overage, capCents: overage === "on" ? 5000 : null }),
      ),
    ),
  ]

  test("every kind has a sample", () => {
    assert.deepEqual([...new Set(samples.map((s) => s.kind))].sort(), [...BILLING_NOTICE_KINDS].sort())
  })

  for (const locale of LOCALES)
    test(`every email is complete in ${locale}`, () => {
      for (const data of samples) {
        const mail = billingMail({ workspace: "Kahve Dükkanı", data }, locale, "https://www.apexbot.eu/dashboard/settings/billing")
        const all = `${mail.subject}\n${mail.text}`
        assert.ok(mail.subject.includes("Kahve Dükkanı"), `${locale} ${data.kind}: the subject names the workspace`)
        assert.ok(mail.text.includes("https://www.apexbot.eu/dashboard/settings/billing"), `${locale} ${data.kind}: links to billing`)
        assert.doesNotMatch(all, /undefined|null|NaN|\$\{/, `${locale} ${data.kind}`)
        assert.doesNotMatch(all, /\.\./, `${locale} ${data.kind}: no doubled period`)
        if ("graceUntil" in data || "endsAt" in data) assert.match(all, /2027/, `${locale} ${data.kind}: has the date`)
        if ((data.kind === "quota_80" || data.kind === "quota_100") && data.overage === "on") assert.match(mail.text, /50/, `${locale} ${data.kind}: has the cap`)
      }
    })

  test("English reads as written", () => {
    const mail = billingMail({ workspace: "Kahve", data: { kind: "quota_100", plan: "pro", usedReplies: 1500, allowanceReplies: 1500, resetsAt: until, overage: "on", capCents: 5000 } }, "en", "L")
    assert.equal(mail.subject, "Kahve has used all of this month's AI replies")
    assert.match(mail.text, /^Kahve has used all 1,500 AI replies included this month\. Paid extra replies are on, so your assistants keep answering at \$5 per 100 replies, up to your cap of \$50, until the count starts again on January 18, 2027\./)
  })
})
