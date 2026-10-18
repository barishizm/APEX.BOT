import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { register } from "../src/auth.ts"
import { AdminError } from "../src/admin.ts"
import { listPage } from "../src/admin-list.ts"
import { getBotForUser } from "../src/bots.ts"
import { CRAWL_PAGE_CEILING } from "../src/plans.ts"
import {
  ADMIN_KNOWLEDGE_LIST,
  adminDeleteSource,
  adminDisableRefresh,
  adminKnowledgeSummary,
  adminResetSync,
  adminResyncSource,
  embeddingCoverage,
  finishJobRun,
  getAdminKnowledgeDetail,
  recentJobRuns,
  startJobRun,
  type AdminKnowledgeRow,
} from "../src/admin-knowledge.ts"

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
beforeEach(() => db.query("truncate app.users, app.organizations, app.admin_audit_log, app.job_runs cascade").then(() => {}))

const run = <T>(fn: (tx: Parameters<Parameters<Db["transaction"]>[0]>[0]) => Promise<T>) => db.transaction(fn)
const invalid = (err: unknown) => err instanceof AdminError && err.code === "invalid_input"

async function newBot(slug = "kahve") {
  const r = await register(db, { email: `o@${slug}.example`, username: slug, password: "correct horse", accountType: "business", company: slug, acceptTerms: true })
  return getBotForUser(db, r.user.id)
}

async function website(botId: string, fields: { status?: string; pages?: number; minutesAgo?: number; syncedAt?: boolean; refresh?: string } = {}) {
  const { rows } = await db.query<{ id: string }>(
    `insert into app.knowledge_sources (bot_id, kind, title, url, status, pages, refresh, synced_at)
     values ($1, 'website', 'Site', 'https://kahve.example', $2, $3, $4, case when $5 then now() end) returning id`,
    [botId, fields.status ?? "ready", fields.pages ?? 0, fields.refresh ?? "weekly", fields.syncedAt ?? false],
  )
  const id = rows[0]!.id
  // updated_at is set by a trigger on every update, so it's moved back with the trigger off
  if (fields.minutesAgo) {
    await db.query("alter table app.knowledge_sources disable trigger knowledge_sources_set_updated_at")
    await db.query("update app.knowledge_sources set updated_at = now() - make_interval(mins => $2) where id = $1", [id, fields.minutesAgo])
    await db.query("alter table app.knowledge_sources enable trigger knowledge_sources_set_updated_at")
  }
  return id
}

const list = (params: Parameters<typeof listPage>[2]) => listPage<AdminKnowledgeRow>(db, ADMIN_KNOWLEDGE_LIST, params).then((p) => p.rows)

describe("admin knowledge list", () => {
  test("lists every source with its bot and filters by status, stuck and the crawl ceiling", async () => {
    const bot = await newBot()
    const other = await newBot("cay")
    const ready = await website(bot.id, { syncedAt: true })
    const stuck = await website(bot.id, { status: "syncing", minutesAgo: 20 })
    const syncing = await website(other.id, { status: "syncing", minutesAgo: 2 })
    await db.query("update app.organizations set plan = 'pro' where id = $1", [other.organizationId])
    const capped = await website(other.id, { pages: CRAWL_PAGE_CEILING })
    // a starter site at 300 pages hit its plan limit, not the ceiling
    const full = await website(bot.id, { pages: CRAWL_PAGE_CEILING })
    await db.query("update app.organizations set plan = 'starter' where id = $1", [bot.organizationId])

    const rows = await list({})
    assert.equal(rows.length, 5)
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    assert.equal(byId[ready]!.bot_name, bot.name)
    assert.equal(byId[stuck]!.stuck, true)
    assert.equal(byId[syncing]!.stuck, false)
    assert.equal(byId[capped]!.at_ceiling, true)
    assert.equal(byId[capped]!.plan_pages, 1000)
    assert.equal(byId[full]!.at_ceiling, false)

    assert.deepEqual((await list({ filters: { status: "stuck" } })).map((r) => r.id), [stuck])
    assert.deepEqual((await list({ filters: { status: "syncing" } })).map((r) => r.id), [syncing])
    assert.deepEqual((await list({ filters: { ceiling: "yes" } })).map((r) => r.id), [capped])
    assert.deepEqual((await list({ filters: { synced: "never" } })).length, 4)
    assert.deepEqual((await list({ q: "cay" })).map((r) => r.id).sort(), [syncing, capped].sort())

    const summary = await adminKnowledgeSummary(db)
    assert.deepEqual({ ...summary }, { sources: 5, websites: 5, chunks: 0, pending: 0, syncing: 1, stuck: 1, failed: 0, atCeiling: 1 })
  })
})

describe("admin knowledge actions", () => {
  test("reset sync: back to ready when it was read before, failed when it never was", async () => {
    const bot = await newBot()
    const old = await website(bot.id, { status: "syncing", syncedAt: true, minutesAgo: 30 })
    const fresh = await website(bot.id, { status: "syncing", minutesAgo: 30 })
    const ready = await website(bot.id)

    assert.deepEqual((await run((tx) => adminResetSync(tx, old))).after, { status: "ready", error: null })
    assert.deepEqual((await run((tx) => adminResetSync(tx, fresh))).after, { status: "failed", error: "The sync was interrupted. Try again" })
    await assert.rejects(run((tx) => adminResetSync(tx, ready)), invalid)
  })

  test("resync claims the website, a stuck one too, and refuses one that is running", async () => {
    const bot = await newBot()
    const stuck = await website(bot.id, { status: "syncing", minutesAgo: 20 })
    const running = await website(bot.id, { status: "syncing", minutesAgo: 1 })
    const c = await run((tx) => adminResyncSource(tx, stuck))
    assert.equal(c.extra.claimed.id, stuck)
    assert.equal(c.extra.claimed.botId, bot.id)
    assert.equal(c.extra.claimed.pageLimit, 50)
    assert.equal((await db.query<{ status: string }>("select status from app.knowledge_sources where id = $1", [stuck])).rows[0]!.status, "syncing")
    await assert.rejects(run((tx) => adminResyncSource(tx, running)), invalid)

    const { rows } = await db.query<{ id: string }>("insert into app.knowledge_sources (bot_id, kind, title, content) values ($1, 'text', 'FAQ', 'Hello') returning id", [bot.id])
    await assert.rejects(run((tx) => adminResyncSource(tx, rows[0]!.id)), invalid)
    await assert.rejects(run((tx) => adminResyncSource(tx, "00000000-0000-0000-0000-000000000000")), (e) => e instanceof AdminError && e.code === "not_found")
  })

  test("turns refresh off once and deletes a source with its chunks", async () => {
    const bot = await newBot()
    const id = await website(bot.id)
    assert.deepEqual((await run((tx) => adminDisableRefresh(tx, id))).after, { refresh: "off" })
    await assert.rejects(run((tx) => adminDisableRefresh(tx, id)), invalid)

    await db.query("insert into app.knowledge_chunks (source_id, bot_id, url, title, text, position) values ($1, $2, 'u', 't', 'x', 0)", [id, bot.id])
    const version = (await db.query<{ v: number }>("select knowledge_version as v from app.bots where id = $1", [bot.id])).rows[0]!.v
    const c = await run((tx) => adminDeleteSource(tx, id))
    assert.equal(c.extra.botId, bot.id)
    assert.equal((await db.query("select 1 from app.knowledge_chunks where source_id = $1", [id])).rows.length, 0)
    assert.equal((await db.query<{ v: number }>("select knowledge_version as v from app.bots where id = $1", [bot.id])).rows[0]!.v, version + 1)
    assert.equal(await getAdminKnowledgeDetail(db, id), null)
  })

  test("detail shows the plan's page limit and the stored chunks", async () => {
    const bot = await newBot()
    await db.query("update app.organizations set plan = 'business' where id = $1", [bot.organizationId])
    const id = await website(bot.id, { pages: CRAWL_PAGE_CEILING })
    const d = (await getAdminKnowledgeDetail(db, id))!
    assert.equal(d.source.planPages, 3000)
    assert.equal(d.source.pageLimit, CRAWL_PAGE_CEILING)
    assert.equal(d.source.atCeiling, true)
    assert.equal(d.source.storedChunks, 0)
    assert.equal(await getAdminKnowledgeDetail(db, "nope"), null)
  })
})

describe("embedding coverage", () => {
  test("counts chunks whose title and text hash has a vector from the active model", async () => {
    const bot = await newBot()
    const id = await website(bot.id)
    const chunks = [
      ["Shipping", "We ship in 2 days"],
      ["Returns", "Return within 14 days"],
      ["Türkçe", "Kargo ücretsiz"],
      ["Hours", "9 to 5"],
    ]
    for (const [i, [title, text]] of chunks.entries()) {
      await db.query("insert into app.knowledge_chunks (source_id, bot_id, url, title, text, position) values ($1, $2, 'u', $3, $4, $5)", [id, bot.id, title, text, i])
    }
    const hash = (title: string, text: string) => createHash("sha256").update(`${title}\n${text}`).digest()
    const model = "gemini:gemini-embedding-2@768"
    for (const [title, text] of chunks.slice(0, 3)) {
      await db.query("insert into app.knowledge_embeddings (bot_id, model, hash, vector) values ($1, $2, $3, $4)", [bot.id, model, hash(title!, text!), Buffer.alloc(8)])
    }
    await db.query("insert into app.knowledge_embeddings (bot_id, model, hash, vector) values ($1, 'openai:x@8', $2, $3)", [bot.id, hash("Hours", "9 to 5"), Buffer.alloc(8)])

    const [row] = await embeddingCoverage(db, model)
    assert.deepEqual({ ...row }, { botId: bot.id, botName: bot.name, organizationId: bot.organizationId, organizationName: row!.organizationName, chunks: 4, embedded: 3, otherModels: 1 })
  })
})

describe("job runs", () => {
  test("records a run from start to finish, newest first", async () => {
    const first = await startJobRun(db, "knowledge.refresh")
    await finishJobRun(db, first, { ok: true, result: { due: 3, started: 2 } })
    await startJobRun(db, "knowledge.refresh")
    const runs = await recentJobRuns(db, "knowledge.refresh")
    assert.equal(runs.length, 2)
    assert.equal(runs[0]!.finishedAt, null)
    assert.equal(runs[1]!.ok, true)
    assert.deepEqual(runs[1]!.result, { due: 3, started: 2 })
    assert.deepEqual(await recentJobRuns(db, "other"), [])
  })
})
