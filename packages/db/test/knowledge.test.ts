import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { register } from "../src/auth.ts"
import { addAllowedOrigin, getBotForUser, listBotsChangedSince, recordWidgetSeen } from "../src/bots.ts"
import {
  KNOWLEDGE_LIMITS,
  KnowledgeError,
  addTextSource,
  addWebsiteSource,
  deleteSource,
  failSync,
  finishSync,
  listKnowledgeChunks,
  listSources,
  startSync,
  type ChunkRecord,
} from "../src/knowledge.ts"

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

async function newUser(email = "owner@example.com", username = "owner") {
  const { user } = await register(db, { email, username, password: "correct horse", accountType: "business", company: username, acceptTerms: true })
  // dashboard users are always email-verified before they reach the bot
  await db.query("update app.users set email_verified_at = now() where id = $1", [user.id])
  return user
}

const chunker = (title: string, content: string): ChunkRecord[] =>
  content.split("\n\n").map((text) => ({ url: "", title, text }))

const code = (c: KnowledgeError["code"]) => (err: unknown) => err instanceof KnowledgeError && err.code === c

describe("knowledge sources", () => {
  test("text sources are searchable right away and bump the bot's knowledge version", async () => {
    const user = await newUser()
    const bot = await getBotForUser(db, user.id)
    const [before] = await listBotsChangedSince(db, null)
    const source = await addTextSource(db, user.id, { title: "  Return   policy ", content: "Unopened bags: 14 days.\n\nGround coffee can't be returned." }, chunker)
    assert.equal(source.title, "Return policy")
    assert.equal(source.status, "ready")
    assert.equal(source.chunks, 2)
    assert.match(source.preview!, /^Unopened bags/)
    assert.deepEqual(await listKnowledgeChunks(db, bot.id), [
      { url: "", title: "Return policy", text: "Unopened bags: 14 days." },
      { url: "", title: "Return policy", text: "Ground coffee can't be returned." },
    ])
    const [afterAdd] = await listBotsChangedSince(db, null)
    assert.equal(afterAdd.knowledgeVersion, before.knowledgeVersion + 1)
  })

  test("validates text input", async () => {
    const user = await newUser()
    await assert.rejects(addTextSource(db, user.id, { title: "", content: "Long enough content here." }, chunker), code("invalid_input"))
    await assert.rejects(addTextSource(db, user.id, { title: "x", content: "short" }, chunker), code("invalid_input"))
    await assert.rejects(addTextSource(db, user.id, { title: "x", content: "a".repeat(KNOWLEDGE_LIMITS.textChars + 1) }, chunker), code("invalid_input"))
  })

  test("a website goes pending → syncing → ready, and its chunks replace the old ones", async () => {
    const user = await newUser()
    const bot = await getBotForUser(db, user.id)
    const site = await addWebsiteSource(db, user.id, "https://kahve.example/")
    assert.equal(site.status, "pending")
    assert.equal(site.title, "kahve.example")
    // adding the same address again returns the existing source
    assert.equal((await addWebsiteSource(db, user.id, "https://kahve.example/")).id, site.id)

    const claimed = await startSync(db, user.id, site.id)
    assert.equal(claimed.url, "https://kahve.example/")
    await assert.rejects(startSync(db, user.id, site.id), code("busy"))
    await finishSync(db, site.id, { pages: 2, chunks: [{ url: "https://kahve.example/a", title: "A", text: "first" }] })
    let [listed] = await listSources(db, user.id)
    assert.equal(listed.status, "ready")
    assert.equal(listed.pages, 2)
    assert.equal(listed.chunks, 1)
    assert.ok(listed.syncedAt)

    await startSync(db, user.id, site.id)
    await finishSync(db, site.id, { pages: 1, chunks: [{ url: "https://kahve.example/b", title: "B", text: "second" }] })
    assert.deepEqual(
      (await listKnowledgeChunks(db, bot.id)).map((c) => c.text),
      ["second"],
    )

    await startSync(db, user.id, site.id)
    await failSync(db, site.id, "The domain doesn't exist")
    ;[listed] = await listSources(db, user.id)
    assert.equal(listed.status, "failed")
    assert.equal(listed.error, "The domain doesn't exist")
    // a failed re-sync keeps the previous content searchable
    assert.equal((await listKnowledgeChunks(db, bot.id)).length, 1)
  })

  test("only a couple of websites are read at once per bot", async () => {
    const user = await newUser()
    const ids = []
    for (const host of ["a", "b", "c"]) ids.push((await addWebsiteSource(db, user.id, `https://${host}.example/`)).id)
    await startSync(db, user.id, ids[0])
    await startSync(db, user.id, ids[1])
    await assert.rejects(startSync(db, user.id, ids[2]), code("busy"))
    await finishSync(db, ids[0], { pages: 1, chunks: [] })
    assert.equal((await startSync(db, user.id, ids[2])).id, ids[2])
  })

  test("a sync finishing after the source was deleted writes nothing", async () => {
    const user = await newUser()
    const bot = await getBotForUser(db, user.id)
    const site = await addWebsiteSource(db, user.id, "https://kahve.example/")
    await startSync(db, user.id, site.id)
    await deleteSource(db, user.id, site.id)
    await finishSync(db, site.id, { pages: 1, chunks: [{ url: "https://kahve.example/", title: "A", text: "late" }] })
    assert.deepEqual(await listKnowledgeChunks(db, bot.id), [])
    assert.deepEqual(await listSources(db, user.id), [])
  })

  test("keeps tenants apart", async () => {
    const alice = await newUser("alice@example.com", "alice")
    const bob = await newUser("bob@example.com", "bob")
    const aliceBot = await getBotForUser(db, alice.id)
    const bobBot = await getBotForUser(db, bob.id)
    const secret = await addTextSource(db, alice.id, { title: "Internal", content: "Alice's private pricing notes." }, chunker)
    const site = await addWebsiteSource(db, alice.id, "https://alice.example/")

    assert.deepEqual(await listSources(db, bob.id), [])
    assert.deepEqual(await listKnowledgeChunks(db, bobBot.id), [])
    await assert.rejects(deleteSource(db, bob.id, secret.id), code("not_found"))
    await assert.rejects(startSync(db, bob.id, site.id), code("not_found"))
    await assert.rejects(startSync(db, alice.id, secret.id), code("not_found")) // text sources aren't crawled
    await assert.rejects(deleteSource(db, bob.id, "not-a-uuid"), code("not_found"))
    assert.equal((await listKnowledgeChunks(db, aliceBot.id)).length, 1)
    assert.deepEqual(await listKnowledgeChunks(db, "not-a-uuid"), [])
  })

  test("members can read but not change the knowledge base", async () => {
    const owner = await newUser()
    const member = await newUser("member@example.com", "member")
    const bot = await getBotForUser(db, owner.id)
    // move the member into the owner's workspace only
    await db.query("delete from app.organization_members where user_id = $1", [member.id])
    await db.query("insert into app.organization_members (organization_id, user_id, role) values ($1, $2, 'member')", [bot.organizationId, member.id])
    await addTextSource(db, owner.id, { title: "FAQ", content: "We ship within three days." }, chunker)
    assert.equal((await listSources(db, member.id)).length, 1)
    await assert.rejects(addWebsiteSource(db, member.id, "https://x.example/"), code("forbidden"))
    await assert.rejects(addTextSource(db, member.id, { title: "x", content: "Some content for the test." }, chunker), code("forbidden"))
  })

  test("enforces the source and chunk limits", async () => {
    const user = await newUser()
    for (let i = 0; i < KNOWLEDGE_LIMITS.sources; i++) await addWebsiteSource(db, user.id, `https://site${i}.example/`)
    await assert.rejects(addWebsiteSource(db, user.id, "https://one-more.example/"), code("limit"))

    await db.query("delete from app.knowledge_sources")
    const site = await addWebsiteSource(db, user.id, "https://big.example/")
    await startSync(db, user.id, site.id)
    const many = Array.from({ length: KNOWLEDGE_LIMITS.chunksPerBot + 10 }, (_, i) => ({ url: "https://big.example/", title: "T", text: `chunk ${i}` }))
    await finishSync(db, site.id, { pages: 50, chunks: many })
    const [listed] = await listSources(db, user.id)
    assert.equal(listed.chunks, KNOWLEDGE_LIMITS.chunksPerBot)
    assert.match(listed.error!, /full/)
    await assert.rejects(addTextSource(db, user.id, { title: "More", content: "Anything else at all here." }, chunker), code("limit"))
  })

  test("onboarding adds the site to the allowlist once", async () => {
    const user = await newUser()
    await addAllowedOrigin(db, user.id, "https://kahve.example")
    await addAllowedOrigin(db, user.id, "https://kahve.example")
    const bot = await getBotForUser(db, user.id)
    assert.deepEqual(bot.settings.security.allowedOrigins, ["https://kahve.example"])
  })

  test("records where the widget was last seen without touching the bot's sync timestamp", async () => {
    const user = await newUser()
    const bot = await getBotForUser(db, user.id)
    assert.equal(bot.widgetSeenAt, null)
    const at = new Date("2026-10-01T10:00:00Z")
    await recordWidgetSeen(db, bot.id, "https://kahve.example", at)
    await recordWidgetSeen(db, bot.id, "https://www.kahve.example", new Date("2026-10-01T11:00:00Z"))
    const seen = await getBotForUser(db, user.id)
    assert.equal(seen.widgetSeenOrigin, "https://www.kahve.example")
    assert.equal(seen.widgetSeenAt?.toISOString(), "2026-10-01T11:00:00.000Z")
    assert.equal(seen.updatedAt.getTime(), bot.updatedAt.getTime())
  })
})
