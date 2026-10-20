import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { register } from "../src/auth.ts"
import { listWorkspaceQuotas } from "../src/billing.ts"
import { BotSettingsError, DEFAULT_SETTINGS, type BotSettings } from "../src/bot-settings.ts"
import {
  BOTS_PER_WORKSPACE,
  BotError,
  createBot,
  deleteBot,
  getBotForUser,
  listBotsChangedSince,
  listBotsForUser,
  saveBotSettings,
  setActiveSites,
  type Bot,
} from "../src/bots.ts"
import { insertConversation, sweepConversations } from "../src/conversations.ts"
import { effectiveSettings, modelAllowed, planDefaultModel, planIssues } from "../src/entitlements.ts"
import { clearSettingsCache } from "../src/platform-settings.ts"
import { entitlementsFor, type Plan } from "../src/plans.ts"

// Plan limits on the server (entitlements.ts, docs/adr/0003-billing.md (e)), behind the plan_limits flag.

const FREE = entitlementsFor("free")
const PRO = entitlementsFor("pro")
const settings = (patch: (s: BotSettings) => void = () => {}) => {
  const s = structuredClone({ ...DEFAULT_SETTINGS, handoff: { ...DEFAULT_SETTINGS.handoff, email: "team@example.com" } })
  patch(s)
  return s
}
const paths = (next: BotSettings, stored: BotSettings, plan: Plan) => planIssues(next, stored, entitlementsFor(plan)).map((i) => i.path)

describe("plan rules", () => {
  test("models: Free includes only the fast tier, and its default model is Haiku", () => {
    assert.equal(modelAllowed(FREE, "anthropic", "claude-haiku-5-5"), true)
    assert.equal(modelAllowed(FREE, "anthropic", "claude-sonnet-5-5"), false)
    assert.equal(modelAllowed(PRO, "anthropic", "claude-fable-5-1"), true)
    assert.equal(modelAllowed(PRO, "anthropic", "not-a-model"), false)
    assert.deepEqual(planDefaultModel(FREE), { provider: "anthropic", id: "claude-haiku-5-5" })
    assert.deepEqual(planDefaultModel(PRO), { provider: "anthropic", id: "claude-sonnet-5-5" })
  })

  test("a save can't pick a model, or fallback, the plan doesn't include", () => {
    const fast = settings((s) => (s.model.id = "claude-haiku-5-5"))
    assert.deepEqual(paths(settings((s) => (s.model.id = "claude-opus-5-5")), fast, "free"), ["model.id"])
    assert.deepEqual(paths(settings((s) => (s.model.id = "claude-opus-5-5")), fast, "starter"), [])
    const fallback = settings((s) => {
      s.model.id = "claude-haiku-5-5"
      s.model.fallback = { enabled: true, provider: "google", id: "gemini-3.8-flash" }
    })
    assert.deepEqual(paths(fallback, fast, "free"), ["model.fallback.id"])
  })

  test("showBranding off needs removeBranding", () => {
    const off = settings((s) => (s.appearance.showBranding = false))
    assert.deepEqual(paths(off, settings(), "starter"), ["appearance.showBranding"])
    assert.deepEqual(paths(off, settings(), "pro"), [])
  })

  test("topics to decline and lead capture need their feature", () => {
    const topics = settings((s) => (s.persona.blockedTopics = ["politics"]))
    assert.deepEqual(paths(topics, settings(), "starter"), ["persona.blockedTopics"])
    assert.deepEqual(paths(topics, settings(), "pro"), [])
    const lead = settings((s) => (s.handoff.leadCapture = "before-chat"))
    assert.deepEqual(paths(lead, settings(), "free"), ["handoff.leadCapture"])
    assert.deepEqual(paths(lead, settings(), "starter"), [])
  })

  test("retention can't be set above the plan's longest", () => {
    assert.deepEqual(paths(settings((s) => (s.security.retentionDays = 31)), settings(), "free"), ["security.retentionDays"])
    assert.deepEqual(paths(settings((s) => (s.security.retentionDays = 90)), settings(), "starter"), [])
  })

  test("after a downgrade the bot's own values can stay; only adding is refused", () => {
    const big = settings((s) => {
      s.model.id = "claude-opus-5-5"
      s.model.fallback = { enabled: true, provider: "google", id: "gemini-3.8-flash" }
      s.appearance.showBranding = false
      s.persona.blockedTopics = ["politics", "medicine"]
      s.handoff.leadCapture = "before-chat"
      s.security.retentionDays = 365
    })
    // the owner saves another field: nothing above the plan is new, so nothing is refused
    assert.deepEqual(paths(settings((s) => Object.assign(s, structuredClone(big), { general: { ...big.general, botName: "New" } })), big, "free"), [])
    // removing a topic is fine, adding one isn't
    assert.deepEqual(paths({ ...big, persona: { ...big.persona, blockedTopics: ["politics"] } }, big, "free"), [])
    assert.deepEqual(paths({ ...big, persona: { ...big.persona, blockedTopics: ["politics", "law"] } }, big, "free"), ["persona.blockedTopics"])
  })

  test("the bot serves what the plan allows, and the stored settings are untouched", () => {
    const big = settings((s) => {
      s.model.id = "claude-opus-5-5"
      s.model.fallback = { enabled: true, provider: "google", id: "gemini-3.8-flash" }
      s.appearance.showBranding = false
      s.persona.blockedTopics = ["politics"]
      s.handoff.leadCapture = "before-chat"
      s.security.retentionDays = 365
    })
    const copy = structuredClone(big)
    const free = effectiveSettings(big, FREE)
    assert.deepEqual(free.model.id, "claude-haiku-5-5")
    assert.equal(free.model.fallback.enabled, false)
    assert.equal(free.appearance.showBranding, true)
    assert.deepEqual(free.persona.blockedTopics, [])
    assert.equal(free.handoff.leadCapture, "off")
    assert.equal(free.security.retentionDays, 30)
    assert.deepEqual(big, copy)
    // a plan that includes all of it serves the settings as they are
    assert.deepEqual(effectiveSettings(big, entitlementsFor("business")), big)
  })
})

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

async function owner(plan: Plan, limits = true) {
  const { user } = await register(db, { email: `o${randomUUID().slice(0, 8)}@example.com`, username: `o${randomUUID().slice(0, 8)}`, password: "correct horse", accountType: "personal", acceptTerms: true })
  await db.query("update app.users set email_verified_at = now() where id = $1", [user.id])
  const { rows } = await db.query<{ organization_id: string }>("select organization_id from app.organization_members where user_id = $1", [user.id])
  const org = rows[0]!.organization_id
  await setPlan(org, plan)
  if (limits) {
    await db.query(
      `insert into app.platform_settings (key, value) values ('flags.plan_limits', $1::jsonb)
       on conflict (key) do update set value = jsonb_set(app.platform_settings.value, '{workspaces}', app.platform_settings.value -> 'workspaces' || excluded.value -> 'workspaces')`,
      [JSON.stringify({ enabled: false, workspaces: { [org]: true } })],
    )
    clearSettingsCache()
  }
  return { userId: user.id, org }
}
const setPlan = (org: string, plan: Plan) => db.query("update app.organizations set plan = $2 where id = $1", [org, plan])
const save = (userId: string, bot: Bot, patch: (s: BotSettings) => void) => {
  const next = structuredClone(bot.settings)
  patch(next)
  return saveBotSettings(db, { userId, botId: bot.id }, next, bot.version)
}
const refused = (path: string) => (err: unknown) => err instanceof BotSettingsError && err.issues.some((i) => i.path === path)
const code = (c: string) => (err: unknown) => err instanceof BotError && err.code === c

describe("plan limits in the database", () => {
  test("off by default: a Free workspace saves any model and adds up to the platform's limit", async () => {
    const { userId } = await owner("free", false)
    const bot = await getBotForUser(db, userId)
    assert.equal(bot.settings.model.id, DEFAULT_SETTINGS.model.id)
    await save(userId, bot, (s) => (s.model.id = "claude-opus-5-5"))
    for (let i = 1; i < BOTS_PER_WORKSPACE; i++) await createBot(db, userId, `Site ${i}`)
    assert.ok((await listBotsForUser(db, userId)).bots.every((b) => !b.paused))
  })

  test("a new bot starts on a model its plan includes", async () => {
    const { userId } = await owner("free")
    assert.equal((await getBotForUser(db, userId)).settings.model.id, "claude-haiku-5-5")
  })

  test("saving settings above the plan is refused, field by field", async () => {
    const { userId } = await owner("free")
    const bot = await getBotForUser(db, userId)
    await assert.rejects(save(userId, bot, (s) => (s.model.id = "claude-sonnet-5-5")), refused("model.id"))
    await assert.rejects(save(userId, bot, (s) => (s.appearance.showBranding = false)), refused("appearance.showBranding"))
    await assert.rejects(save(userId, bot, (s) => (s.persona.blockedTopics = ["politics"])), refused("persona.blockedTopics"))
    await assert.rejects(save(userId, bot, (s) => (s.handoff.leadCapture = "before-chat")), refused("handoff.leadCapture"))
    await assert.rejects(save(userId, bot, (s) => (s.security.retentionDays = 60)), refused("security.retentionDays"))
    // what the plan includes saves
    await save(userId, bot, (s) => (s.security.retentionDays = 14))
  })

  test("after a downgrade the settings stay and the rest can still be saved", async () => {
    const { userId, org } = await owner("business")
    let bot = await getBotForUser(db, userId)
    bot = await save(userId, bot, (s) => {
      s.model.id = "claude-opus-5-5"
      s.appearance.showBranding = false
      s.persona.blockedTopics = ["politics"]
      s.handoff.leadCapture = "before-chat"
      s.security.retentionDays = 365
    })
    await setPlan(org, "free")
    bot = await save(userId, bot, (s) => (s.general.botName = "Still saves"))
    assert.equal(bot.settings.general.botName, "Still saves")
    assert.equal(bot.settings.model.id, "claude-opus-5-5")
    assert.equal(bot.settings.appearance.showBranding, false)
    assert.deepEqual(bot.settings.persona.blockedTopics, ["politics"])
    assert.equal(bot.settings.security.retentionDays, 365)
    // switching to another model above the plan is not
    await assert.rejects(save(userId, bot, (s) => (s.model.id = "claude-sonnet-5-5")), refused("model.id"))
  })

  test("adding a website past the plan's number is refused with plan_limit", async () => {
    const free = await owner("free")
    await getBotForUser(db, free.userId)
    await assert.rejects(createBot(db, free.userId, "Second"), code("plan_limit"))
    const pro = await owner("pro")
    await getBotForUser(db, pro.userId)
    await createBot(db, pro.userId, "Second")
    await createBot(db, pro.userId, "Third")
    await assert.rejects(createBot(db, pro.userId, "Fourth"), code("plan_limit"))
    assert.equal((await listBotsForUser(db, pro.userId)).limit, 3)
  })

  test("a downgrade pauses the newest websites over the limit and deletes nothing", async () => {
    const { userId, org } = await owner("pro")
    const first = await getBotForUser(db, userId)
    const second = await createBot(db, userId, "Second")
    const third = await createBot(db, userId, "Third")
    const paused = async () => Object.fromEntries((await listBotsForUser(db, userId)).bots.map((b) => [b.id, b.paused]))
    assert.deepEqual(await paused(), { [first.id]: false, [second.id]: false, [third.id]: false })

    await setPlan(org, "free")
    assert.deepEqual(await paused(), { [first.id]: false, [second.id]: true, [third.id]: true })
    const ranks = Object.fromEntries((await listBotsChangedSince(db, null)).map((b) => [b.id, b.siteRank]))
    assert.deepEqual(ranks, { [first.id]: 1, [second.id]: 2, [third.id]: 3 })
    // settings of a paused website stay readable
    assert.equal((await getBotForUser(db, { userId, botId: third.id })).name, "Third")

    // the owner chooses which one stays active
    await setActiveSites(db, userId, [third.id])
    assert.deepEqual(await paused(), { [first.id]: true, [second.id]: true, [third.id]: false })
    await assert.rejects(setActiveSites(db, userId, [first.id, third.id]), code("plan_limit"))
    await assert.rejects(setActiveSites(db, userId, [randomUUID()]), code("not_found"))
    await assert.rejects(setActiveSites(db, userId, []), BotSettingsError)

    // upgrading again lifts every pause
    await setPlan(org, "pro")
    assert.deepEqual(await paused(), { [first.id]: false, [second.id]: false, [third.id]: false })
  })

  test("removing an active website lets the next one answer", async () => {
    const { userId, org } = await owner("pro")
    const first = await getBotForUser(db, userId)
    const second = await createBot(db, userId, "Second")
    await setPlan(org, "free")
    assert.deepEqual((await listBotsForUser(db, userId)).bots.map((b) => b.paused), [false, true])
    await deleteBot(db, { userId, botId: first.id })
    assert.deepEqual((await listBotsForUser(db, userId)).bots.map((b) => [b.id, b.paused]), [[second.id, false]])
  })

  test("a new conversation keeps the plan's retention cap; older ones keep theirs", async () => {
    const { userId } = await owner("business")
    let bot = await getBotForUser(db, userId)
    bot = await save(userId, bot, (s) => (s.security.retentionDays = 180))
    const before = randomUUID()
    const capped = randomUUID()
    // started while the plan allowed 365 days, and one after a downgrade to Free (30)
    await insertConversation(db, { id: before, botId: bot.id, context: {}, retentionCapDays: 365, createdAt: new Date() })
    await insertConversation(db, { id: capped, botId: bot.id, context: {}, retentionCapDays: 30, createdAt: new Date() })
    await db.query("update app.conversations set updated_at = now() - interval '40 days'")
    assert.equal(await sweepConversations(db), 1)
    assert.deepEqual((await db.query<{ id: string }>("select id from app.conversations")).rows.map((r) => r.id), [before])
    // without a cap (plan limits were off) the bot's setting alone applies
    const uncapped = randomUUID()
    await insertConversation(db, { id: uncapped, botId: bot.id, context: {}, retentionCapDays: null, createdAt: new Date() })
    await db.query("update app.conversations set updated_at = now() - interval '100 days' where id = $1", [uncapped])
    assert.equal(await sweepConversations(db), 0)
    // a database before migration 0036 sweeps by the setting
    assert.equal(await sweepConversations(db, { retentionCaps: false }), 0)
  })

  test("the chat API learns from the workspace list whether the plan is held to", async () => {
    const on = await owner("free")
    const off = await owner("free", false)
    await getBotForUser(db, on.userId)
    await getBotForUser(db, off.userId)
    const quotas = Object.fromEntries((await listWorkspaceQuotas(db)).map((q) => [q.organizationId, q.enforcePlan]))
    assert.deepEqual(quotas, { [on.org]: true, [off.org]: false })
  })
})
