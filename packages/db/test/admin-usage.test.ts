import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { register } from "../src/auth.ts"
import { getBotForUser } from "../src/bots.ts"
import { addTokenUsage } from "../src/conversations.ts"
import {
  API_RUNTIME_KEY,
  ESTIMATED_INPUT_SHARE,
  freeGeminiEmbeddings,
  parseUsageRange,
  platformUsage,
  priceUsage,
  readApiRuntime,
  reportApiRuntime,
  resolveModel,
  usageExportRows,
} from "../src/admin-usage.ts"

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
beforeEach(() => db.query("truncate app.users, app.organizations, app.platform_settings cascade").then(() => {}))

const DAY = 86_400_000
const dayAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10)

async function owner(username: string, model?: { provider: string; id: string }) {
  const { user } = await register(db, { email: `${username}@kahve.example`, username, password: "correct horse", accountType: "personal", acceptTerms: true })
  const bot = await getBotForUser(db, user.id)
  if (model) await db.query(`update app.bots set settings = jsonb_set(settings, '{model}', $2::jsonb) where id = $1`, [bot.id, JSON.stringify(model)])
  const { rows } = await db.query<{ organization_id: string }>("select organization_id from app.bots where id = $1", [bot.id])
  return { user, bot, orgId: rows[0]!.organization_id }
}

const runtime = (over: Partial<Parameters<typeof reportApiRuntime>[1]> = {}) => ({
  keys: { ANTHROPIC_API_KEY: true, OPENAI_API_KEY: false, GEMINI_API_KEY: true, RESEND_API_KEY: false },
  embeddings: "gemini:gemini-embedding-2@768",
  geminiTier: null,
  maxDailyTokensPerTenant: 20_000_000,
  defaultModel: "claude-haiku-5-5",
  topicModel: "claude-haiku-5-5",
  ...over,
})

describe("pricing", () => {
  test("prices recorded input and output at their own rates", () => {
    const s = priceUsage({ tokens: 3_000_000, input: 2_000_000, output: 1_000_000 }, { input: 2, output: 10 })
    assert.equal(s.cost, 2 * 2 + 1 * 10)
    assert.equal(s.unsplit, 0)
  })

  test("splits tokens without a recorded split at the assumed ratio", () => {
    const s = priceUsage({ tokens: 1_000_000, input: 0, output: 0 }, { input: 2, output: 10 })
    assert.equal(s.unsplit, 1_000_000)
    assert.ok(Math.abs(s.cost - (ESTIMATED_INPUT_SHARE * 2 + (1 - ESTIMATED_INPUT_SHARE) * 10)) < 1e-9)
  })

  test("a model without a price counts as unpriced, not free", () => {
    const s = priceUsage({ tokens: 500, input: 400, output: 100 }, null)
    assert.equal(s.cost, 0)
    assert.equal(s.unpriced, 500)
  })

  test("reads a bot's model as the chat API does", () => {
    assert.deepEqual(resolveModel("anthropic", "claude-haiku-5-5").price, { input: 0.1, output: 0.5 })
    assert.equal(resolveModel(undefined, undefined).id, "claude-sonnet-5-5")
    assert.equal(resolveModel("openai", "gpt-6-luna").price, null)
    assert.equal(resolveModel("nope", "gpt-6-luna").provider, "anthropic")
  })

  test("only 7, 30 and 90 days are ranges", () => {
    assert.equal(parseUsageRange("7"), 7)
    assert.equal(parseUsageRange("365"), 30)
    assert.equal(parseUsageRange(undefined), 30)
  })
})

describe("addTokenUsage", () => {
  test("adds input and output apart, and keeps the total the budget reads", async () => {
    const { bot } = await owner("split")
    await addTokenUsage(db, bot.id, dayAgo(0), 1000) // an API that predates the split
    await addTokenUsage(db, bot.id, dayAgo(0), { input: 300, output: 50 })
    await addTokenUsage(db, bot.id, dayAgo(0), { input: 200, output: 25.4 })
    const { rows } = await db.query<{ tokens: string; input_tokens: string; output_tokens: string }>(
      "select tokens, input_tokens, output_tokens from app.token_usage where bot_id = $1",
      [bot.id],
    )
    assert.deepEqual(rows.map((r) => [Number(r.tokens), Number(r.input_tokens), Number(r.output_tokens)]), [[1575, 500, 75]])
  })
})

describe("api runtime report", () => {
  test("stores only whether each key is set", async () => {
    await reportApiRuntime(db, { ...runtime(), keys: { ...runtime().keys, OPENAI_API_KEY: "sk-secret" as unknown as boolean, EXTRA: true } as never })
    const { rows } = await db.query<{ value: unknown }>("select value from app.platform_settings where key = $1", [API_RUNTIME_KEY])
    assert.ok(!JSON.stringify(rows[0]!.value).includes("sk-secret"))
    const r = await readApiRuntime(db)
    assert.deepEqual(r!.keys, { ANTHROPIC_API_KEY: true, OPENAI_API_KEY: false, GEMINI_API_KEY: true, RESEND_API_KEY: false })
  })

  test("warns about Gemini embeddings until the key is declared paid", async () => {
    assert.equal(freeGeminiEmbeddings(null), false)
    await reportApiRuntime(db, runtime())
    assert.equal(freeGeminiEmbeddings(await readApiRuntime(db)), true)
    await reportApiRuntime(db, runtime({ geminiTier: "paid" }))
    assert.equal(freeGeminiEmbeddings(await readApiRuntime(db)), false)
    await reportApiRuntime(db, runtime({ embeddings: null }))
    assert.equal(freeGeminiEmbeddings(await readApiRuntime(db)), false)
  })
})

describe("platformUsage", () => {
  test("totals, days, providers, top bots and plans over the range", async () => {
    const a = await owner("haiku", { provider: "anthropic", id: "claude-haiku-5-5" })
    const b = await owner("luna", { provider: "openai", id: "gpt-6-luna" })
    await db.query("update app.organizations set plan = 'pro' where id = $1", [a.orgId])
    await addTokenUsage(db, a.bot.id, dayAgo(0), { input: 2_000_000, output: 1_000_000 })
    await addTokenUsage(db, a.bot.id, dayAgo(3), 1_000_000)
    await addTokenUsage(db, b.bot.id, dayAgo(1), { input: 400, output: 100 })
    await addTokenUsage(db, b.bot.id, dayAgo(10), 999) // outside 7 days

    const u = await platformUsage(db, 7)
    assert.equal(u.days, 7)
    assert.equal(u.daily.length, 7)
    assert.equal(u.daily.at(-1)!.day, dayAgo(0))
    assert.equal(u.totals.tokens, 4_000_500)
    assert.equal(u.totals.bots, 2)
    assert.equal(u.totals.workspaces, 2)
    assert.equal(u.totals.unpriced, 500)
    assert.equal(u.totals.unsplit, 1_000_000)
    const haikuCost = (2 * 0.1 + 1 * 0.5) + (ESTIMATED_INPUT_SHARE * 0.1 + (1 - ESTIMATED_INPUT_SHARE) * 0.5)
    assert.ok(Math.abs(u.totals.cost - haikuCost) < 1e-9)
    assert.equal(u.daily.reduce((n, d) => n + d.tokens, 0), u.totals.tokens)

    assert.deepEqual(u.bots.map((x) => x.id), [a.bot.id, b.bot.id])
    assert.equal(u.bots[0]!.model.label, "Claude Haiku 5.5")
    const openai = u.providers.find((p) => p.provider === "openai")!
    assert.equal(openai.tokens, 500)
    assert.equal(openai.configuredBots, 1)
    assert.equal(u.providers.find((p) => p.provider === "google")!.tokens, 0)

    const pro = u.plans.find((p) => p.plan === "pro")!
    assert.equal(pro.workspaces, 1)
    assert.equal(pro.activeWorkspaces, 1)
    assert.equal(pro.tokens, 4_000_000)

    assert.equal((await platformUsage(db, 30)).totals.tokens, 4_001_499)
  })

  test("lists bots near their limit, with staff overrides and the platform ceiling", async () => {
    const own = await owner("own")
    const ceiling = await owner("ceiling")
    const raised = await owner("raised")
    const lowered = await owner("lowered")
    const calm = await owner("calm")
    const setBudget = (id: string) => db.query(`update app.bots set settings = jsonb_set(settings, '{security,dailyTokenBudget}', '100000') where id = $1`, [id])
    const override = (id: string, tokens: number) =>
      db.query("update app.bots set token_budget_override = $2, token_budget_override_until = now() + interval '1 day' where id = $1", [id, tokens])
    await setBudget(own.bot.id)
    await setBudget(raised.bot.id)
    await override(raised.bot.id, 5_000_000)
    await override(lowered.bot.id, 50_000)
    await addTokenUsage(db, own.bot.id, dayAgo(0), 95_000)
    await addTokenUsage(db, ceiling.bot.id, dayAgo(0), 900_000) // budget 2M, but the API caps it at 1M
    await addTokenUsage(db, raised.bot.id, dayAgo(0), 95_000) // near its setting, far from the override
    await addTokenUsage(db, lowered.bot.id, dayAgo(0), 45_000)
    await addTokenUsage(db, calm.bot.id, dayAgo(0), 1000)
    await addTokenUsage(db, calm.bot.id, dayAgo(1), 10_000_000) // yesterday doesn't count

    await reportApiRuntime(db, runtime({ maxDailyTokensPerTenant: 1_000_000 }))
    const u = await platformUsage(db)
    assert.equal(u.maxDailyTokens, 1_000_000)
    assert.equal(u.nearBudget.total, 3)
    assert.deepEqual(
      u.nearBudget.rows.map((r) => [r.id, r.limit, r.limitedBy, r.override]),
      [
        [own.bot.id, 100_000, "bot", false],
        [ceiling.bot.id, 1_000_000, "platform", false],
        [lowered.bot.id, 50_000, "bot", true],
      ],
    )
  })
})

describe("usageExportRows", () => {
  test("one priced row per bot and day, newest first, capped", async () => {
    const a = await owner("csv", { provider: "anthropic", id: "claude-haiku-5-5" })
    await addTokenUsage(db, a.bot.id, dayAgo(2), { input: 1_000_000, output: 0 })
    await addTokenUsage(db, a.bot.id, dayAgo(0), { input: 0, output: 1_000_000 })
    const all = await usageExportRows(db, 7, 10)
    assert.equal(all.truncated, false)
    assert.deepEqual(all.rows.map((r) => [r.day, r.cost]), [[dayAgo(0), 0.5], [dayAgo(2), 0.1]])
    assert.equal(all.rows[0]!.model.id, "claude-haiku-5-5")
    const one = await usageExportRows(db, 7, 1)
    assert.equal(one.truncated, true)
    assert.equal(one.rows.length, 1)
  })
})
