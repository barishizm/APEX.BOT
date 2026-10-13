import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { register } from "../src/auth.ts"
import { BotError, getBotForUser, listBotsChangedSince, rotateSiteKey, saveBotSettings } from "../src/bots.ts"
import {
  BotSettingsError,
  DEFAULT_SETTINGS,
  MODELS,
  checkSettings,
  parseSettings,
  publicWidgetSettings,
  repairSettings,
} from "../src/bot-settings.ts"

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
beforeEach(() => db.query("truncate app.users, app.organizations, app.auth_events cascade").then(() => {}))

async function newUser(email = "owner@example.com", username = "owner", company = "Crest Cycles") {
  const { user } = await register(db, {
    email,
    username,
    password: "correct horse",
    accountType: "business",
    company,
    acceptTerms: true,
  })
  return user
}

const issuesOf = (raw: unknown) => checkSettings(raw).map((i) => i.path)

describe("settings validation", () => {
  test("a sparse document takes every other default", () => {
    const s = parseSettings({ handoff: { email: "team@example.com" } })
    assert.deepEqual(s, { ...DEFAULT_SETTINGS, handoff: { ...DEFAULT_SETTINGS.handoff, email: "team@example.com" } })
  })

  test("the defaults themselves are valid apart from the hand-off address", () => {
    assert.deepEqual(issuesOf(DEFAULT_SETTINGS), ["handoff.email"])
  })

  test("every catalog model validates as the primary model", () => {
    for (const m of MODELS) {
      const settings = { model: { provider: m.provider, id: m.id, temperature: 0 }, handoff: { enabled: false } }
      assert.deepEqual(issuesOf(settings), [], `${m.provider}/${m.id}`)
    }
  })

  test("rejects unknown models and a model under the wrong provider", () => {
    assert.deepEqual(issuesOf({ model: { provider: "openai", id: "gpt-2" }, handoff: { enabled: false } }), ["model.id"])
    assert.deepEqual(issuesOf({ model: { provider: "google", id: "claude-opus-5-5" }, handoff: { enabled: false } }), ["model.id"])
  })

  test("caps temperature per provider", () => {
    const at = (provider: string, id: string, temperature: number) =>
      issuesOf({ model: { provider, id, temperature }, handoff: { enabled: false } })
    assert.deepEqual(at("anthropic", "claude-haiku-4-5", 1.5), ["model.temperature"])
    assert.deepEqual(at("google", "gemini-3.8-flash", 1.5), [])
    assert.deepEqual(at("openai", "gpt-4.1", 2.5), ["model.temperature"])
  })

  test("the fallback must be a different catalog model", () => {
    const base = { handoff: { enabled: false }, model: { provider: "anthropic", id: "claude-sonnet-5-5" } }
    assert.deepEqual(issuesOf({ ...base, model: { ...base.model, fallback: { enabled: true, provider: "anthropic", id: "claude-sonnet-5-5" } } }), ["model.fallback.id"])
    assert.deepEqual(issuesOf({ ...base, model: { ...base.model, fallback: { enabled: true, provider: "openai", id: "gpt-6-luna" } } }), [])
    // a disabled fallback isn't checked
    assert.deepEqual(issuesOf({ ...base, model: { ...base.model, fallback: { enabled: false, provider: "openai", id: "nope" } } }), [])
  })

  test("reports bad colors, URLs, origins, paths and ranges by path", () => {
    const issues = issuesOf({
      handoff: { enabled: true, email: "not-an-email" },
      appearance: { primaryColor: "red", avatar: "image", avatarUrl: "http://insecure.example/a.png", radius: 99 },
      messages: { privacyUrl: "javascript:alert(1)", greeting: { tr: " ", en: "Hi" } },
      behavior: { hiddenPaths: ["/ok", "checkout"] },
      security: { allowedOrigins: ["https://shop.example/path", "ftp://x.example"], messagesPerMinute: 0 },
    })
    assert.deepEqual(issues.sort(), [
      "appearance.avatarUrl",
      "appearance.avatarUrl",
      "appearance.primaryColor",
      "appearance.radius",
      "behavior.hiddenPaths.1",
      "handoff.email",
      "messages.greeting.tr",
      "messages.privacyUrl",
      "security.allowedOrigins.1",
      "security.messagesPerMinute",
    ])
  })

  test("trims text, normalizes origins and drops blank and duplicate list items", () => {
    const s = parseSettings({
      handoff: { enabled: false },
      general: { botName: "  Ada  " },
      messages: { suggestions: { tr: ["Kargo", " ", "Kargo"], en: [] } },
      security: { allowedOrigins: ["https://Shop.example/any/path", "https://shop.example"] },
    })
    assert.equal(s.general.botName, "Ada")
    assert.deepEqual(s.messages.suggestions.tr, ["Kargo"])
    assert.deepEqual(s.security.allowedOrigins, ["https://shop.example"])
  })

  test("parseSettings throws every issue at once", () => {
    assert.throws(
      () => parseSettings({ general: { botName: "" }, model: { maxOutputTokens: 1 } }),
      (err: unknown) => err instanceof BotSettingsError && err.issues.length >= 3,
    )
  })

  test("repairSettings resets only what no longer validates", () => {
    const stored = {
      general: { botName: "Ada" },
      model: { provider: "openai", id: "gpt-retired", temperature: 0.2 },
      appearance: { primaryColor: "#123456", radius: 500 },
      handoff: { email: "team@example.com" },
    }
    const s = repairSettings(stored)
    assert.equal(s.general.botName, "Ada")
    assert.equal(s.appearance.primaryColor, "#123456")
    assert.equal(s.appearance.radius, DEFAULT_SETTINGS.appearance.radius)
    // the stale model id can't stand with its provider, so the model section resets
    assert.deepEqual(s.model, DEFAULT_SETTINGS.model)
    assert.equal(s.handoff.email, "team@example.com")
  })

  test("the public view hides the hand-off address, limits and prompt", () => {
    const pub = publicWidgetSettings(parseSettings({ handoff: { email: "team@example.com" }, persona: { instructions: "secret" } }))
    const json = JSON.stringify(pub)
    assert.ok(!json.includes("team@example.com"))
    assert.ok(!json.includes("secret"))
    assert.ok(!("security" in pub) && !("model" in pub) && !("persona" in pub))
    assert.equal(pub.handoff.enabled, true)
  })
})

describe("bots", () => {
  test("first visit creates the workspace bot with sensible defaults", async () => {
    const user = await newUser()
    const bot = await getBotForUser(db, user.id)
    assert.match(bot.siteKey, /^apex_pk_[a-f0-9]{36}$/)
    assert.equal(bot.role, "owner")
    assert.equal(bot.version, 1)
    assert.equal(bot.settings.general.companyName, "Crest Cycles")
    assert.equal(bot.settings.handoff.email, "owner@example.com")
    // the second visit returns the same bot
    assert.equal((await getBotForUser(db, user.id)).id, bot.id)
  })

  test("saves validated settings and bumps the version", async () => {
    const user = await newUser()
    const bot = await getBotForUser(db, user.id)
    const next = structuredClone(bot.settings)
    next.general.botName = "Ada"
    next.model = { ...next.model, provider: "google", id: "gemini-3.8-flash", temperature: 1.2 }
    const saved = await saveBotSettings(db, user.id, next, bot.version)
    assert.equal(saved.version, 2)
    assert.equal(saved.settings.general.botName, "Ada")
    assert.equal(saved.settings.model.id, "gemini-3.8-flash")
  })

  test("rejects invalid settings without writing", async () => {
    const user = await newUser()
    const bot = await getBotForUser(db, user.id)
    await assert.rejects(saveBotSettings(db, user.id, { general: { botName: "" } }, bot.version), BotSettingsError)
    assert.equal((await getBotForUser(db, user.id)).version, 1)
  })

  test("a save based on an old version is a conflict", async () => {
    const user = await newUser()
    const bot = await getBotForUser(db, user.id)
    await saveBotSettings(db, user.id, bot.settings, bot.version)
    await assert.rejects(
      saveBotSettings(db, user.id, bot.settings, bot.version),
      (err: unknown) => err instanceof BotError && err.code === "conflict",
    )
  })

  test("plain members can read but not change the bot", async () => {
    const owner = await newUser()
    const bot = await getBotForUser(db, owner.id)
    const member = await newUser("member@example.com", "member", "Other Co")
    await db.query("delete from app.organization_members where user_id = $1", [member.id])
    await db.query("insert into app.organization_members (organization_id, user_id, role) values ($1, $2, 'member')", [bot.organizationId, member.id])
    assert.equal((await getBotForUser(db, member.id)).id, bot.id)
    await assert.rejects(
      saveBotSettings(db, member.id, bot.settings, bot.version),
      (err: unknown) => err instanceof BotError && err.code === "forbidden",
    )
    await assert.rejects(rotateSiteKey(db, member.id), (err: unknown) => err instanceof BotError && err.code === "forbidden")
  })

  test("users only ever see their own workspace's bot", async () => {
    const a = await getBotForUser(db, (await newUser("a@example.com", "usera", "A")).id)
    const b = await getBotForUser(db, (await newUser("b@example.com", "userb", "B")).id)
    assert.notEqual(a.id, b.id)
    assert.notEqual(a.siteKey, b.siteKey)
  })

  test("rotating the site key replaces it", async () => {
    const user = await newUser()
    const bot = await getBotForUser(db, user.id)
    const rotated = await rotateSiteKey(db, user.id)
    assert.notEqual(rotated.siteKey, bot.siteKey)
    assert.equal(rotated.version, bot.version + 1)
  })

  test("lists bots changed after a point in time", async () => {
    const user = await newUser()
    const bot = await getBotForUser(db, user.id)
    const all = await listBotsChangedSince(db, null)
    assert.deepEqual(all.map((b) => b.siteKey), [bot.siteKey])
    assert.equal(all[0].organizationName, "Crest Cycles")
    assert.deepEqual(await listBotsChangedSince(db, all[0].updatedAt), [])
  })
})
