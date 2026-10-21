import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { clearSettingsCache } from "../src/platform-settings.ts"
import { DEFAULT_SETTINGS, type BotSettings } from "../src/bot-settings.ts"
import { refreshOverridePlans, upsertSubscription } from "../src/billing.ts"
import { claimBillingNotice, dueBillingNotices, finishBillingNotice } from "../src/billing-notices.ts"
import {
  BETA_PLACEMENT_AUDIT_ACTION,
  applyBetaPlacement,
  planBetaPlacements,
  planCovering,
  runningBetaPlacement,
  type BetaPlacementOptions,
  type BetaUsage,
} from "../src/beta-placement.ts"

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
  await db.query("truncate app.users, app.organizations, app.platform_settings, app.admin_audit_log cascade").catch(async () => {
    // the audit log is append-only (migration 0029); leave it
    await db.query("truncate app.users, app.organizations, app.platform_settings cascade")
  })
  clearSettingsCache()
})

const DAY = 24 * 60 * 60 * 1000
const T0 = new Date("2027-01-10T12:00:00Z")
const at = (days: number) => new Date(T0.getTime() + days * DAY)
const OPTS: BetaPlacementOptions = { now: T0, endsAt: at(60), plan: "auto", minPlan: "starter", createdBefore: T0 }

let n = 0
async function workspace(name = "Kahve", plan = "free") {
  n++
  const { rows } = await db.query<{ id: string }>("insert into app.organizations (name, plan, created_at) values ($1, $2, $3) returning id", [name, plan, at(-90)])
  const org = rows[0]!.id
  const u = await db.query<{ id: string }>(
    `insert into app.users (email, username, account_type, terms_accepted_at, terms_version) values ($1, $2, 'personal', now(), 'v1') returning id`,
    [`owner${n}@example.com`, `owner${n}`],
  )
  await db.query("insert into app.organization_members (organization_id, user_id, role) values ($1, $2, 'owner')", [org, u.rows[0]!.id])
  return org
}
async function bot(org: string, patch: (s: BotSettings) => void = () => {}, opts: { answers?: number; pages?: number } = {}) {
  const s = structuredClone({ ...DEFAULT_SETTINGS, handoff: { ...DEFAULT_SETTINGS.handoff, email: "team@example.com" } })
  patch(s)
  const { rows } = await db.query<{ id: string }>(
    `insert into app.bots (organization_id, site_key, settings) values ($1, 'apex_pk_' || md5(random()::text), $2::jsonb) returning id`,
    [org, JSON.stringify(s)],
  )
  const id = rows[0]!.id
  if (opts.pages) await db.query(`insert into app.knowledge_sources (bot_id, kind, title, url, pages) values ($1, 'website', 'Site', 'https://example.com', $2)`, [id, opts.pages])
  if (opts.answers) {
    const conv = randomUUID()
    await db.query("insert into app.conversations (id, bot_id) values ($1, $2)", [conv, id])
    await db.query(
      `insert into app.messages (id, conversation_id, bot_id, role, content, created_at)
       select gen_random_uuid(), $1, $2, 'assistant', 'hi', $3::timestamptz from generate_series(1, $4::int)`,
      [conv, id, at(-5), opts.answers],
    )
  }
  return id
}
const fast = (s: BotSettings) => {
  s.model.id = "claude-haiku-5-5"
  s.model.fallback.enabled = false
}
const planOf = async (id: string) => (await db.query<{ plan: string }>("select plan from app.organizations where id = $1", [id])).rows[0]!.plan
const overrides = async (id: string) => (await db.query<{ plan: string; kind: string }>("select plan, kind from app.plan_overrides where organization_id = $1", [id])).rows
const place = async (opts = OPTS) => {
  const plan = await planBetaPlacements(db, opts)
  for (const p of plan.filter((x) => x.plan)) await db.transaction((tx) => applyBetaPlacement(tx, p, opts))
  return plan
}

const use = (patch: Partial<BetaUsage> = {}): BetaUsage => ({
  replyFifths: 0,
  websites: 1,
  pages: 0,
  modelTier: "fast",
  removeBranding: false,
  declineTopics: false,
  leadCapture: false,
  retentionDays: 30,
  ...patch,
})

describe("planCovering", () => {
  test("the smallest plan whose limits hold the use", () => {
    assert.deepEqual(planCovering(use()), { plan: "free", fits: true })
    assert.equal(planCovering(use({ modelTier: "standard" })).plan, "starter")
    assert.equal(planCovering(use({ replyFifths: 601 * 5 })).plan, "pro")
    assert.equal(planCovering(use({ websites: 2 })).plan, "pro")
    assert.equal(planCovering(use({ removeBranding: true })).plan, "pro")
    assert.equal(planCovering(use({ retentionDays: 365 })).plan, "business")
    assert.deepEqual(planCovering(use({ websites: 11 })), { plan: "business", fits: false })
  })
})

describe("planBetaPlacements and applyBetaPlacement", () => {
  test("a dry run writes nothing", async () => {
    const org = await workspace()
    await bot(org)
    const plan = await planBetaPlacements(db, OPTS)
    assert.equal(plan.length, 1)
    assert.equal(plan[0]!.plan, "starter")
    assert.deepEqual(await overrides(org), [])
    assert.equal(await planOf(org), "free")
  })

  test("places each workspace on the plan its last 30 days need, at least Starter", async () => {
    const small = await workspace("Small")
    await bot(small, fast, { answers: 20 })
    // 700 Sonnet answers: more than Starter's 600
    const busy = await workspace("Busy")
    await bot(busy, () => {}, { answers: 700 })
    // 3,500 Haiku answers are 700 replies; Fable's 5 per answer makes 200 of them 1,000
    const fable = await workspace("Fable")
    await bot(fable, (s) => (s.model.id = "claude-fable-5-1"), { answers: 200 })
    const sites = await workspace("Sites")
    for (let i = 0; i < 4; i++) await bot(sites, fast)
    const plan = await place()
    const got = Object.fromEntries(plan.map((p) => [p.name, p.plan]))
    assert.deepEqual(got, { Small: "starter", Busy: "pro", Fable: "pro", Sites: "business" })
    assert.equal(await planOf(busy), "pro")
    assert.deepEqual(await overrides(busy), [{ plan: "pro", kind: "beta" }])
    const audit = await db.query<{ action: string; actor_email: string }>("select action, actor_email from app.admin_audit_log where target_id = $1", [busy])
    assert.deepEqual(audit.rows, [{ action: BETA_PLACEMENT_AUDIT_ACTION, actor_email: "system:beta-placement" }])
  })

  test("--plan gives everyone that plan; --min-plan free leaves small ones on Free", async () => {
    const a = await workspace("A")
    await bot(a, fast)
    const b = await workspace("B")
    await bot(b, (s) => (s.appearance.showBranding = false))
    const fixed = await planBetaPlacements(db, { ...OPTS, plan: "pro" })
    assert.deepEqual(fixed.map((p) => p.plan), ["pro", "pro"])
    const auto = await planBetaPlacements(db, { ...OPTS, minPlan: "free" })
    assert.deepEqual(auto.map((p) => [p.name, p.plan, p.skip]).sort(), [["A", null, "fits_free"], ["B", "pro", null]])
  })

  test("a plan set by hand in the beta is kept when it is larger", async () => {
    const org = await workspace("Partner", "business")
    await bot(org, fast)
    const [p] = await planBetaPlacements(db, OPTS)
    assert.equal(p!.plan, "business")
  })

  test("skips workspaces that pay, were placed already, or are newer than the cut-off", async () => {
    const paying = await workspace("Paying")
    await db.transaction((tx) =>
      upsertSubscription(
        tx,
        {
          organizationId: paying,
          provider: "paddle",
          providerSubscriptionId: "sub_1",
          plan: "starter",
          interval: "month",
          status: "active",
          currentPeriodStart: T0,
          currentPeriodEnd: at(30),
          cancelAtPeriodEnd: false,
          scheduledChange: null,
          providerUpdatedAt: T0,
        },
        T0,
      ),
    )
    const placed = await workspace("Placed")
    await place()
    const second = await planBetaPlacements(db, OPTS)
    assert.deepEqual(second.map((p) => [p.name, p.skip]).sort(), [["Paying", "subscribed"], ["Placed", "placed"]])
    assert.equal((await overrides(placed)).length, 1)
    // a second apply of the same placement changes nothing
    const again = await db.transaction((tx) => applyBetaPlacement(tx, { organizationId: placed, plan: "pro", usage: use(), covering: "free" }, OPTS))
    assert.deepEqual(again, { applied: false, reason: "placed" })
    await db.query("update app.organizations set created_at = $2 where id = $1", [placed, at(1)])
    assert.deepEqual((await planBetaPlacements(db, OPTS)).map((p) => p.name), ["Paying"])
  })

  test("the plan ends with the placement: the workspace moves to Free", async () => {
    const org = await workspace()
    await bot(org)
    await place()
    assert.equal((await runningBetaPlacement(db, org, at(59)))?.plan, "starter")
    assert.equal(await runningBetaPlacement(db, org, at(60)), null)
    await refreshOverridePlans(db, at(59))
    assert.equal(await planOf(org), "starter")
    const changed = await refreshOverridePlans(db, at(60))
    assert.equal(changed.length, 1)
    assert.equal(await planOf(org), "free")
  })
})

describe("beta ending notices", () => {
  const kinds = async (now: Date) => (await dueBillingNotices(db, now)).map((x) => x.kind)
  async function deliver(now: Date) {
    for (const x of await dueBillingNotices(db, now)) if (await claimBillingNotice(db, x)) await finishBillingNotice(db, x, x.recipients.length)
  }

  test("30 days before the end, then 7, each once", async () => {
    const org = await workspace()
    await bot(org)
    await place()
    assert.deepEqual(await kinds(at(29)), [])
    assert.deepEqual(await kinds(at(30)), ["beta_ending_30"])
    const [notice] = await dueBillingNotices(db, at(30))
    assert.deepEqual(notice!.data, { kind: "beta_ending_30", plan: "starter", endsAt: at(60), freeReplies: 100 })
    await deliver(at(30))
    assert.deepEqual(await kinds(at(40)), [])
    assert.deepEqual(await kinds(at(53)), ["beta_ending_7"])
    await deliver(at(53))
    assert.deepEqual(await kinds(at(59)), [])
    assert.deepEqual(await kinds(at(61)), [])
  })

  test("a run that missed the first sends only the last, and records both", async () => {
    const org = await workspace()
    await bot(org)
    await place()
    assert.deepEqual(await kinds(at(55)), ["beta_ending_7"])
    await deliver(at(55))
    const sent = await db.query<{ kind: string }>("select kind from app.billing_notices where organization_id = $1 order by kind", [org])
    assert.deepEqual(sent.rows.map((r) => r.kind), ["beta_ending_30", "beta_ending_7"])
  })

  test("nothing for a workspace that subscribed, or a staff comp", async () => {
    const org = await workspace()
    await bot(org)
    await place()
    await db.transaction((tx) =>
      upsertSubscription(
        tx,
        {
          organizationId: org,
          provider: "paddle",
          providerSubscriptionId: "sub_2",
          plan: "pro",
          interval: "year",
          status: "active",
          currentPeriodStart: at(20),
          currentPeriodEnd: at(385),
          cancelAtPeriodEnd: false,
          scheduledChange: null,
          providerUpdatedAt: at(20),
        },
        at(20),
      ),
    )
    assert.deepEqual((await kinds(at(31))).filter((k) => k.startsWith("beta")), [])
    const comp = await workspace("Comp")
    await db.query("insert into app.plan_overrides (organization_id, plan, reason, starts_at, ends_at) values ($1, 'pro', 'partner', $2, $3)", [comp, T0, at(10)])
    assert.deepEqual((await dueBillingNotices(db, at(5), [comp])).map((x) => x.kind), [])
  })
})
