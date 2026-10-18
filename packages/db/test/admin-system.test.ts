import { after, before, beforeEach, test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { register } from "../src/auth.ts"
import { getBotForUser } from "../src/bots.ts"
import { insertConversation, insertMessage } from "../src/conversations.ts"
import { MIGRATION_NAMES } from "../src/schema-version.ts"
import { maskEmailAddress, migrationStatus, recentEmailFailures, recordEmailFailure, systemQueues } from "../src/admin-system.ts"

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
beforeEach(() => db.query("truncate app.users, app.organizations, app.email_failures cascade").then(() => {}))

const DAY = 86_400_000

test("migrationStatus lists applied, pending and unknown migrations", async () => {
  const all = await migrationStatus(db)
  assert.equal(all.applied.length, MIGRATION_NAMES.length)
  assert.deepEqual(all.pending, [])
  assert.ok(all.applied[0]!.appliedAt instanceof Date)

  await db.query("delete from app.schema_migrations where name = $1", [MIGRATION_NAMES.at(-1)])
  await db.query("insert into app.schema_migrations (name) values ('9999_from_the_future.sql')")
  try {
    const s = await migrationStatus(db)
    assert.deepEqual(s.pending, [MIGRATION_NAMES.at(-1)])
    assert.deepEqual(s.unknown.map((u) => u.name), ["9999_from_the_future.sql"])
  } finally {
    await db.query("delete from app.schema_migrations where name = '9999_from_the_future.sql'")
    await db.query("insert into app.schema_migrations (name) values ($1)", [MIGRATION_NAMES.at(-1)])
  }
})

test("systemQueues counts unlabeled questions and conversations past retention", async () => {
  const { user } = await register(db, { email: "q@example.com", username: "queues", password: "correct horse", accountType: "personal", acceptTerms: true })
  const bot = await getBotForUser(db, user.id)
  const chat = async (at: Date, topic?: string) => {
    const id = randomUUID()
    await insertConversation(db, { id, botId: bot.id, createdAt: at })
    const msg = randomUUID()
    await insertMessage(db, { id: msg, conversationId: id, botId: bot.id, role: "user", content: "Kargo?", createdAt: at })
    await db.query("update app.conversations set updated_at = $2 where id = $1", [id, at])
    if (topic !== undefined) await db.query("update app.messages set topic = $2 where id = $1", [msg, topic])
  }
  await chat(new Date())
  await chat(new Date(Date.now() - 2 * DAY), "shipping")
  await chat(new Date(Date.now() - 40 * DAY)) // past the default 30-day retention, still in the labeler's window
  await chat(new Date(Date.now() - 120 * DAY)) // outside the labeler's window

  const q = await systemQueues(db, null)
  assert.equal(q.unlabeledTopics, 2)
  assert.ok(q.oldestUnlabeledAt && Date.now() - q.oldestUnlabeledAt.getTime() > 39 * DAY)
  assert.equal(q.overdueConversations, 2)
  assert.equal(q.embeddings, null)

  const withModel = await systemQueues(db, "gemini:gemini-embedding-2@768")
  assert.deepEqual(withModel.embeddings, { model: "gemini:gemini-embedding-2@768", bots: 0, chunks: 0, embedded: 0 })
})

test("maskEmailAddress keeps only the first letters and the TLD", () => {
  assert.equal(maskEmailAddress("barishizm@proton.me"), "b***@p***.me")
  assert.equal(maskEmailAddress("ops@mail.example.co.uk"), "o***@m***.uk")
  assert.equal(maskEmailAddress("not an address"), "not an address")
})

test("recordEmailFailure masks the recipient and the error, and keeps codes out", async () => {
  await recordEmailFailure(db, { source: "web", kind: "verification", to: "ayse@example.com", status: 422, error: "Invalid `to`: ayse@example.com, call +90 532 123 45 67" })
  await recordEmailFailure(db, { source: "api", kind: "Bad Kind!", to: "x@y.io", error: null })
  const f = await recentEmailFailures(db)
  assert.equal(f.last24h, 2)
  assert.equal(f.last7d, 2)
  const [api, web] = f.recent
  assert.equal(api!.kind, "other")
  assert.equal(api!.status, null)
  assert.equal(web!.recipient, "a***@e***.com")
  assert.equal(web!.status, 422)
  assert.ok(!web!.error!.includes("ayse@example.com"))
  assert.ok(!web!.error!.includes("532"))
})

test("recordEmailFailure prunes rows older than 30 days", async () => {
  await db.query("insert into app.email_failures (source, kind, recipient, created_at) values ('web', 'old', 'o***@e***.com', now() - interval '31 days')")
  await recordEmailFailure(db, { source: "web", kind: "new", to: "n@example.com" })
  const f = await recentEmailFailures(db)
  assert.deepEqual(f.recent.map((r) => r.kind), ["new"])
})
