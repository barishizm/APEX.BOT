import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { register } from "../src/auth.ts"
import {
  BOTS_PER_WORKSPACE,
  BotError,
  confirmHandoffEmail,
  createBot,
  deleteBot,
  getBotForUser,
  listBotIds,
  listBotsChangedSince,
  listBotsForUser,
  renameBot,
  rotateSiteKey,
  saveBotSettings,
  startHandoffVerification,
  HANDOFF_CODES_PER_WORKSPACE_PER_DAY,
  UNSAVED_BOT_ID,
} from "../src/bots.ts"
import { addTextSource, listSources } from "../src/knowledge.ts"
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
beforeEach(() => db.query("truncate app.users, app.organizations, app.auth_events, app.mail_sends cascade").then(() => {}))

async function newUser(email = "owner@example.com", username = "owner", company = "Crest Cycles") {
  const { user } = await register(db, {
    email,
    username,
    password: "correct horse",
    accountType: "business",
    company,
    acceptTerms: true,
  })
  // dashboard users are always email-verified before they reach the bot
  await db.query("update app.users set email_verified_at = now() where id = $1", [user.id])
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

  test("settings saved before Lithuanian, Latvian and Estonian existed load with their defaults", () => {
    const s = parseSettings({
      handoff: { enabled: false },
      general: { defaultLang: "lv" },
      messages: { greeting: { tr: "Selam", en: "Hello" }, suggestions: { tr: ["Kargo"], en: [] } },
    })
    assert.equal(s.general.defaultLang, "lv")
    assert.equal(s.messages.greeting.tr, "Selam")
    assert.equal(s.messages.greeting.lt, DEFAULT_SETTINGS.messages.greeting.lt)
    assert.equal(s.messages.greeting.et, DEFAULT_SETTINGS.messages.greeting.et)
    assert.deepEqual(s.messages.suggestions.lv, [])
    assert.equal(s.general.subtitle.lt, "")
  })

  test("a blank required text in any language is reported by path", () => {
    const issues = issuesOf({ handoff: { enabled: false }, messages: { greeting: { lt: "  " } } })
    assert.deepEqual(issues, ["messages.greeting.lt"])
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

  test("read-only (viewing as the user) creates no bot, and shows the real one once there is one", async () => {
    const user = await newUser()
    const shown = await getBotForUser(db, user.id, { readOnly: true })
    assert.equal(shown.id, UNSAVED_BOT_ID)
    assert.equal(shown.settings.general.companyName, "Crest Cycles")
    assert.equal(shown.siteKey, "")
    assert.equal((await db.query<{ n: number }>("select count(*)::int as n from app.bots")).rows[0]!.n, 0)
    const real = await getBotForUser(db, user.id)
    assert.equal((await getBotForUser(db, user.id, { readOnly: true })).id, real.id)
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

  test("hand-offs go only to a confirmed address", async () => {
    const user = await newUser()
    const bot = await getBotForUser(db, user.id)
    assert.equal(bot.handoffVerified, true) // the owner's verified account address
    const other = structuredClone(bot.settings)
    other.handoff.email = "victim@example.org"
    await assert.rejects(saveBotSettings(db, user.id, other, bot.version), BotSettingsError)

    const sent = await startHandoffVerification(db, user.id, "Victim@Example.org")
    assert.equal(sent.email, "victim@example.org")
    const wrong = sent.code === "000000" ? "000001" : "000000"
    await assert.rejects(confirmHandoffEmail(db, user.id, wrong), (e: unknown) => e instanceof BotError && e.code === "invalid_code")
    // codes can't be requested again straight away
    await assert.rejects(startHandoffVerification(db, user.id, "victim@example.org"), (e: unknown) => e instanceof BotError && e.code === "rate_limited")

    const confirmed = await confirmHandoffEmail(db, user.id, sent.code)
    assert.equal(confirmed.version, bot.version + 1)
    const saved = await saveBotSettings(db, user.id, other, confirmed.version)
    assert.equal(saved.handoffVerified, true)
    assert.equal((await listBotsChangedSince(db, null))[0].handoffVerified, true)

    // a code is single-use, and changing the address again needs a new confirmation
    await assert.rejects(confirmHandoffEmail(db, user.id, sent.code), BotError)
    const again = structuredClone(saved.settings)
    again.handoff.email = "someone-else@example.org"
    await assert.rejects(saveBotSettings(db, user.id, again, saved.version), BotSettingsError)
  })

  test("the workspace's daily allowance of hand-off codes survives deleting websites", async () => {
    const user = await newUser()
    const bot = await getBotForUser(db, user.id)
    await db.query("insert into app.mail_sends (kind, scope) select 'handoff_code', $1 from generate_series(1, $2)", [bot.organizationId, HANDOFF_CODES_PER_WORKSPACE_PER_DAY])
    await assert.rejects(startHandoffVerification(db, user.id, "victim@example.org"), (e: unknown) => e instanceof BotError && e.code === "rate_limited")
  })

  test("a code stops working after too many wrong guesses", async () => {
    const user = await newUser()
    await getBotForUser(db, user.id)
    const sent = await startHandoffVerification(db, user.id, "team@example.org")
    const wrong = sent.code === "000000" ? "000001" : "000000"
    for (let i = 0; i < 5; i++) await assert.rejects(confirmHandoffEmail(db, user.id, wrong), BotError)
    await assert.rejects(confirmHandoffEmail(db, user.id, sent.code), (e: unknown) => e instanceof BotError && e.code === "rate_limited")
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

describe("several websites per workspace", () => {
  const code = (c: string) => (err: unknown) => err instanceof BotError && err.code === c

  test("a workspace adds websites, each with its own key and settings", async () => {
    const user = await newUser()
    const first = await getBotForUser(db, user.id)
    assert.equal(first.name, "Crest Cycles")
    const shop = await createBot(db, user.id, "  shop.crest.example ")
    assert.equal(shop.name, "shop.crest.example")
    assert.notEqual(shop.siteKey, first.siteKey)
    assert.equal(shop.settings.handoff.email, "owner@example.com")

    // a bare user id still means the first website
    assert.equal((await getBotForUser(db, user.id)).id, first.id)
    assert.equal((await getBotForUser(db, { userId: user.id, botId: shop.id })).id, shop.id)

    const saved = await saveBotSettings(db, { userId: user.id, botId: shop.id }, { ...shop.settings, general: { ...shop.settings.general, botName: "Shop helper" } }, shop.version)
    assert.equal(saved.id, shop.id)
    assert.equal((await getBotForUser(db, user.id)).settings.general.botName, first.settings.general.botName)

    const list = await listBotsForUser(db, user.id)
    assert.deepEqual(list.bots.map((b) => b.id), [first.id, shop.id])
    assert.equal(list.canEdit, true)
    assert.deepEqual((await listBotIds(db)).sort(), [first.id, shop.id].sort())
  })

  test("knowledge stays with its website", async () => {
    const user = await newUser()
    await getBotForUser(db, user.id)
    const shop = await createBot(db, user.id, "Shop")
    const chunker = (title: string, content: string) => [{ url: "", title, text: content }]
    await addTextSource(db, { userId: user.id, botId: shop.id }, { title: "Returns", content: "Returns are free within 30 days of delivery." }, chunker)
    assert.equal((await listSources(db, { userId: user.id, botId: shop.id })).length, 1)
    assert.equal((await listSources(db, user.id)).length, 0)
  })

  test("another workspace's website can't be read or changed by id", async () => {
    const a = await newUser("a@example.com", "usera", "A")
    const b = await newUser("b@example.com", "userb", "B")
    const aBot = await getBotForUser(db, a.id)
    const bBot = await getBotForUser(db, b.id)
    // reads fall back to the user's own first website
    assert.equal((await getBotForUser(db, { userId: b.id, botId: aBot.id })).id, bBot.id)
    await assert.rejects(saveBotSettings(db, { userId: b.id, botId: aBot.id }, aBot.settings, aBot.version), code("not_found"))
    await assert.rejects(rotateSiteKey(db, { userId: b.id, botId: aBot.id }), code("not_found"))
    await assert.rejects(deleteBot(db, { userId: b.id, botId: aBot.id }), code("not_found"))
    assert.equal((await getBotForUser(db, a.id)).siteKey, aBot.siteKey)
  })

  test("renames, removes, and keeps the last website", async () => {
    const user = await newUser()
    const first = await getBotForUser(db, user.id)
    const shop = await createBot(db, user.id, "Shop")
    const renamed = await renameBot(db, { userId: user.id, botId: shop.id }, "Webshop")
    assert.equal(renamed.name, "Webshop")
    assert.equal(renamed.version, shop.version)
    await assert.rejects(renameBot(db, { userId: user.id, botId: shop.id }, "   "), BotSettingsError)

    await deleteBot(db, { userId: user.id, botId: first.id })
    assert.equal((await getBotForUser(db, user.id)).id, shop.id)
    await assert.rejects(deleteBot(db, { userId: user.id, botId: shop.id }), code("conflict"))
  })

  test("only owners and admins add websites, up to the limit", async () => {
    const owner = await newUser()
    const bot = await getBotForUser(db, owner.id)
    const member = await newUser("member@example.com", "member", "Other Co")
    await db.query("delete from app.organization_members where user_id = $1", [member.id])
    await db.query("insert into app.organization_members (organization_id, user_id, role) values ($1, $2, 'member')", [bot.organizationId, member.id])
    await assert.rejects(createBot(db, member.id, "Mine"), code("forbidden"))
    assert.equal((await listBotsForUser(db, member.id)).canEdit, false)

    await Promise.all(Array.from({ length: BOTS_PER_WORKSPACE }, (_, i) => createBot(db, owner.id, `Site ${i}`).catch((e) => e)))
    assert.equal((await listBotsForUser(db, owner.id)).bots.length, BOTS_PER_WORKSPACE)
    await assert.rejects(createBot(db, owner.id, "One more"), code("conflict"))
  })

  test("two first visits at once create one website", async () => {
    const user = await newUser()
    const [a, b] = await Promise.all([getBotForUser(db, user.id), getBotForUser(db, user.id)])
    assert.equal(a.id, b.id)
    assert.equal((await listBotsForUser(db, user.id)).bots.length, 1)
  })
})
