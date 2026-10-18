import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { register } from "../src/auth.ts"
import { AdminError } from "../src/admin.ts"
import { listPage } from "../src/admin-list.ts"
import { getBotForUser, listBotsChangedSince } from "../src/bots.ts"
import { adminSuspendWorkspace } from "../src/admin-workspaces.ts"
import {
  ADMIN_BOTS_LIST,
  adminClearTokenBudgetOverride,
  adminDisableBot,
  adminEnableBot,
  adminRepairBotSettings,
  adminResetHandoffEmail,
  adminRotateBotSiteKey,
  adminSetTokenBudgetOverride,
  getAdminBotDetail,
  type AdminBotRow,
} from "../src/admin-bots.ts"

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
beforeEach(() => db.query("truncate app.users, app.organizations, app.admin_audit_log cascade").then(() => {}))

const run = <T>(fn: (tx: Parameters<Parameters<Db["transaction"]>[0]>[0]) => Promise<T>) => db.transaction(fn)
const invalid = (err: unknown) => err instanceof AdminError && err.code === "invalid_input"

async function newBot(slug = "kahve") {
  const r = await register(db, { email: `o@${slug}.example`, username: slug, password: "correct horse", accountType: "business", company: slug, acceptTerms: true })
  return getBotForUser(db, r.user.id)
}

describe("admin bot list", () => {
  test("shows every bot with its key tail, origins, model, today's tokens and status", async () => {
    const bot = await newBot()
    await db.query(`update app.bots set settings = jsonb_set(settings, '{security,allowedOrigins}', '["https://kahve.example"]') where id = $1`, [bot.id])
    await db.query("insert into app.token_usage (bot_id, day, tokens) values ($1, (now() at time zone 'utc')::date, 1234), ($1, '2020-01-01', 99)", [bot.id])
    const other = await newBot("cay")

    const page = await listPage<AdminBotRow>(db, ADMIN_BOTS_LIST, {})
    const row = page.rows.find((r) => r.id === bot.id)!
    assert.equal(row.site_key_tail, bot.siteKey.slice(-6))
    assert.equal(Object.values(row).includes(bot.siteKey), false, "the full key never leaves the database")
    assert.deepEqual(row.allowed_origins, ["https://kahve.example"])
    assert.equal(row.model_provider, bot.settings.model.provider)
    assert.equal(Number(row.today_tokens), 1234)
    assert.equal(row.status, "serving")
    assert.equal(Number(page.rows.find((r) => r.id === other.id)!.today_tokens), 0)

    await run((tx) => adminDisableBot(tx, bot.id, "abuse"))
    await run((tx) => adminSuspendWorkspace(tx, other.organizationId, "unpaid"))
    const statuses = (await listPage<AdminBotRow>(db, ADMIN_BOTS_LIST, {})).rows.map((r) => [r.id, r.status])
    assert.deepEqual(Object.fromEntries(statuses), { [bot.id]: "disabled", [other.id]: "suspended" })
    assert.deepEqual((await listPage<AdminBotRow>(db, ADMIN_BOTS_LIST, { filters: { status: "disabled" } })).rows.map((r) => r.id), [bot.id])
    // staff can paste a key from a customer's page to find its bot
    assert.deepEqual((await listPage<AdminBotRow>(db, ADMIN_BOTS_LIST, { q: other.siteKey })).rows.map((r) => r.id), [other.id])
    assert.deepEqual((await listPage<AdminBotRow>(db, ADMIN_BOTS_LIST, { filters: { seen: "never" } })).rows.length, 2)
  })
})

describe("admin bot detail", () => {
  test("shows the stored settings with their problems and long images shortened", async () => {
    const bot = await newBot()
    const image = `data:image/png;base64,${"A".repeat(5000)}`
    await db.query(
      `update app.bots set settings = jsonb_set(jsonb_set(settings, '{model,id}', '"retired-model"'), '{appearance,launcherImage}', to_jsonb($2::text)) where id = $1`,
      [bot.id, image],
    )
    const d = (await getAdminBotDetail(db, bot.id))!
    assert.ok(d.issues.some((i) => i.path.startsWith("model")))
    const shown = JSON.stringify(d.settings)
    assert.match(shown, /retired-model/, "shown as stored, not repaired")
    assert.equal(shown.includes(image), false)
    assert.match(shown, /5022 characters/)
    assert.equal(d.bot.siteKeyTail, bot.siteKey.slice(-6))
    assert.equal(JSON.stringify(d).includes(bot.siteKey), false)
    assert.equal(await getAdminBotDetail(db, "not-a-uuid"), null)
    assert.equal(await getAdminBotDetail(db, "00000000-0000-4000-8000-000000000000"), null)
  })
})

describe("admin bot actions", () => {
  test("repair stores the repaired settings and bumps the version, against the version staff saw", async () => {
    const bot = await newBot()
    await db.query(`update app.bots set settings = jsonb_set(settings, '{model,id}', '"retired-model"') where id = $1`, [bot.id])
    const seen = (await getAdminBotDetail(db, bot.id))!
    await assert.rejects(run((tx) => adminRepairBotSettings(tx, bot.id, seen.bot.version - 1)), invalid)
    const c = await run((tx) => adminRepairBotSettings(tx, bot.id, seen.bot.version))
    assert.equal(c.extra.version, seen.bot.version + 1)
    const before = c.before as { issues: unknown[]; settings: { handoff: { email: string } } }
    assert.ok(before.issues.length)
    assert.equal(before.settings.handoff.email, "o***@kahve.example")
    const after = (await getAdminBotDetail(db, bot.id))!
    assert.deepEqual(after.issues, [])
    // nothing left to repair
    await assert.rejects(run((tx) => adminRepairBotSettings(tx, bot.id, after.bot.version)), invalid)
  })

  test("rotating the key keeps only its tails in the audit", async () => {
    const bot = await newBot()
    const c = await run((tx) => adminRotateBotSiteKey(tx, bot.id))
    const [fresh] = await listBotsChangedSince(db, null)
    assert.notEqual(fresh!.siteKey, bot.siteKey)
    assert.deepEqual(c.before, { siteKeyTail: bot.siteKey.slice(-6) })
    assert.deepEqual(c.after, { siteKeyTail: fresh!.siteKey.slice(-6) })
    assert.match(fresh!.siteKey, /^apex_pk_[0-9a-f]{36}$/)
  })

  test("disable and enable flip the bot's serving state once each", async () => {
    const bot = await newBot()
    await run((tx) => adminDisableBot(tx, bot.id, "abuse"))
    assert.equal((await listBotsChangedSince(db, null))[0]!.serving, false)
    assert.equal((await getAdminBotDetail(db, bot.id))!.bot.disabledReason, "abuse")
    await assert.rejects(run((tx) => adminDisableBot(tx, bot.id, "again")), invalid)
    await run((tx) => adminEnableBot(tx, bot.id))
    assert.equal((await listBotsChangedSince(db, null))[0]!.serving, true)
    await assert.rejects(run((tx) => adminEnableBot(tx, bot.id)), invalid)
    await assert.rejects(run((tx) => adminEnableBot(tx, "00000000-0000-4000-8000-000000000000")), (e) => e instanceof AdminError && e.code === "not_found")
  })

  test("a token budget override is checked, lasts its hours, and can be cleared", async () => {
    const bot = await newBot()
    for (const [tokens, hours] of [[-1, 1], [1.5, 1], [30_000_000, 1], [1000, 0], [1000, 721], ["x", 1]]) {
      await assert.rejects(run((tx) => adminSetTokenBudgetOverride(tx, bot.id, tokens, hours)), invalid, `${tokens} for ${hours}h`)
    }
    await assert.rejects(run((tx) => adminClearTokenBudgetOverride(tx, bot.id)), invalid)
    await run((tx) => adminSetTokenBudgetOverride(tx, bot.id, 0, 24))
    const d = (await getAdminBotDetail(db, bot.id))!
    assert.equal(d.tokens.override!.tokens, 0)
    const left = new Date(d.tokens.override!.until).getTime() - Date.now()
    assert.ok(left > 23.9 * 3_600_000 && left <= 24 * 3_600_000)
    assert.deepEqual((await listBotsChangedSince(db, null))[0]!.budgetOverride?.tokens, 0)
    await run((tx) => adminClearTokenBudgetOverride(tx, bot.id))
    assert.equal((await getAdminBotDetail(db, bot.id))!.tokens.override, null)

    // an expired override no longer shows and can't be cleared
    await db.query("update app.bots set token_budget_override = 5, token_budget_override_until = now() - interval '1 minute' where id = $1", [bot.id])
    assert.equal((await getAdminBotDetail(db, bot.id))!.tokens.override, null)
    await assert.rejects(run((tx) => adminClearTokenBudgetOverride(tx, bot.id)), invalid)
  })

  test("resetting the confirmed hand-off address also kills a pending code", async () => {
    const bot = await newBot()
    await assert.rejects(run((tx) => adminResetHandoffEmail(tx, bot.id)), invalid)
    await db.query("update app.bots set handoff_verified_email = 'team@kahve.example' where id = $1", [bot.id])
    await db.query(
      "insert into app.handoff_verifications (bot_id, email, code_hash, expires_at) values ($1, 'x@kahve.example', '\\x00', now() + interval '10 minutes')",
      [bot.id],
    )
    const c = await run((tx) => adminResetHandoffEmail(tx, bot.id))
    assert.deepEqual(c.before, { verifiedEmail: "t***@kahve.example" })
    assert.equal((await getAdminBotDetail(db, bot.id))!.handoff.verifiedEmail, null)
    const { rows } = await db.query<{ live: boolean }>("select expires_at > now() as live from app.handoff_verifications where bot_id = $1", [bot.id])
    assert.equal(rows[0]!.live, false)
  })
})
