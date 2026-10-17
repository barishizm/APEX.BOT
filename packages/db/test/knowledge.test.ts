import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { register } from "../src/auth.ts"
import { addAllowedOrigin, getBotForUser, listBotsChangedSince, recordWidgetSeen } from "../src/bots.ts"
import { insertConversation, insertMessage } from "../src/conversations.ts"
import {
  KNOWLEDGE_LIMITS,
  KnowledgeError,
  addFileSource,
  addTextSource,
  addWebsiteSource,
  dueRefreshes,
  deleteSource,
  failSync,
  finishSync,
  getSourceDetail,
  listKnowledgeChunks,
  listSources,
  loadEmbeddings,
  pruneEmbeddings,
  saveEmbeddings,
  sourceUsage,
  startScheduledSync,
  startSync,
  updateSource,
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

describe("source detail and editing", () => {
  test("shows a text source's content and excerpts, and a website's pages", async () => {
    const user = await newUser()
    const text = await addTextSource(db, user.id, { title: "Returns", content: "Unopened bags: 14 days.\n\nGround coffee can't be returned." }, chunker)
    const detail = await getSourceDetail(db, user.id, text.id)
    assert.equal(detail.content, "Unopened bags: 14 days.\n\nGround coffee can't be returned.")
    assert.deepEqual(detail.chunks.map((c) => c.position), [0, 1])
    assert.deepEqual(detail.pages, [])

    const site = await addWebsiteSource(db, user.id, "https://kahve.example/")
    await startSync(db, user.id, site.id)
    await finishSync(db, site.id, {
      pages: 2,
      chunks: [
        { url: "https://kahve.example/", title: "Home", text: "Welcome to the shop." },
        { url: "https://kahve.example/kargo", title: "Shipping", text: "Shipping takes 2 days." },
        { url: "https://kahve.example/kargo", title: "Shipping", text: "Free over 500 TL." },
      ],
    })
    const web = await getSourceDetail(db, user.id, site.id)
    assert.equal(web.content, null)
    assert.deepEqual(web.pages, [
      { url: "https://kahve.example/", title: "Home", chunks: 1 },
      { url: "https://kahve.example/kargo", title: "Shipping", chunks: 2 },
    ])
    await assert.rejects(getSourceDetail(db, user.id, randomUUID()), code("not_found"))
    await assert.rejects(getSourceDetail(db, user.id, "nope"), code("not_found"))
  })

  test("editing a text source re-chunks it and bumps the knowledge version", async () => {
    const user = await newUser()
    const bot = await getBotForUser(db, user.id)
    const text = await addTextSource(db, user.id, { title: "Returns", content: "Unopened bags: 14 days." }, chunker)
    const [before] = await listBotsChangedSince(db, null)
    const edited = await updateSource(db, user.id, text.id, { title: "Return policy", content: "Unopened bags: 30 days.\n\nOpened bags can't be returned." }, chunker)
    assert.equal(edited.title, "Return policy")
    assert.equal(edited.chunks, 2)
    assert.deepEqual(await listKnowledgeChunks(db, bot.id), [
      { url: "", title: "Return policy", text: "Unopened bags: 30 days." },
      { url: "", title: "Return policy", text: "Opened bags can't be returned." },
    ])
    const [after] = await listBotsChangedSince(db, null)
    assert.ok(after.knowledgeVersion > before.knowledgeVersion)

    // a rename alone keeps the content and re-titles the excerpts
    await updateSource(db, user.id, text.id, { title: "Returns" }, chunker)
    assert.deepEqual((await listKnowledgeChunks(db, bot.id)).map((c) => c.title), ["Returns", "Returns"])

    await assert.rejects(updateSource(db, user.id, text.id, { content: "short" }, chunker), code("invalid_input"))
    await assert.rejects(updateSource(db, user.id, text.id, { title: " " }, chunker), code("invalid_input"))
    await assert.rejects(updateSource(db, user.id, text.id, {}, chunker), code("invalid_input"))
    await assert.rejects(updateSource(db, user.id, randomUUID(), { title: "x" }, chunker), code("not_found"))
  })

  test("websites can be renamed but not rewritten", async () => {
    const user = await newUser()
    const site = await addWebsiteSource(db, user.id, "https://kahve.example/")
    const renamed = await updateSource(db, user.id, site.id, { title: "Our shop" }, chunker)
    assert.equal(renamed.title, "Our shop")
    assert.equal(renamed.url, "https://kahve.example/")
    await assert.rejects(updateSource(db, user.id, site.id, { content: "Some new content for the site." }, chunker), code("invalid_input"))
  })

  test("members can look but not edit", async () => {
    const owner = await newUser()
    const bot = await getBotForUser(db, owner.id)
    const text = await addTextSource(db, owner.id, { title: "Returns", content: "Unopened bags: 14 days." }, chunker)
    const member = await newUser("member@example.com", "member")
    await db.query("delete from app.organization_members where user_id = $1", [member.id])
    await db.query("insert into app.organization_members (organization_id, user_id, role) values ($1, $2, 'member')", [bot.organizationId, member.id])
    assert.equal((await getSourceDetail(db, member.id, text.id)).chunks.length, 1)
    await assert.rejects(updateSource(db, member.id, text.id, { title: "Mine" }, chunker), code("forbidden"))
    // another workspace's source doesn't exist for them
    const stranger = await newUser("other@example.com", "other")
    await assert.rejects(getSourceDetail(db, stranger.id, text.id), code("not_found"))
    await assert.rejects(updateSource(db, stranger.id, text.id, { title: "Mine" }, chunker), code("not_found"))
  })

  test("an edit that would overflow the knowledge base is refused and changes nothing", async () => {
    const user = await newUser()
    const text = await addTextSource(db, user.id, { title: "Small", content: "Just a sentence or two here." }, chunker)
    const site = await addWebsiteSource(db, user.id, "https://big.example/")
    await startSync(db, user.id, site.id)
    const many = Array.from({ length: KNOWLEDGE_LIMITS.chunksPerBot - 2 }, (_, i) => ({ url: "https://big.example/", title: "T", text: `chunk ${i}` }))
    await finishSync(db, site.id, { pages: 1, chunks: many })
    const huge = Array.from({ length: 5 }, (_, i) => `Paragraph number ${i} of the text.`).join("\n\n")
    await assert.rejects(updateSource(db, user.id, text.id, { content: huge }, chunker), code("limit"))
    assert.equal((await getSourceDetail(db, user.id, text.id)).content, "Just a sentence or two here.")
  })

  test("counts recent replies that cited each source", async () => {
    const user = await newUser()
    const bot = await getBotForUser(db, user.id)
    const text = await addTextSource(db, user.id, { title: "Returns", content: "Unopened bags: 14 days." }, chunker)
    const site = await addWebsiteSource(db, user.id, "https://kahve.example/")
    await startSync(db, user.id, site.id)
    await finishSync(db, site.id, { pages: 1, chunks: [{ url: "https://kahve.example/kargo", title: "Shipping", text: "Shipping takes 2 days." }] })

    const reply = async (sources: { url: string; title: string }[], at = new Date()) => {
      const id = randomUUID()
      await insertConversation(db, { id, botId: bot.id, origin: "https://kahve.example", createdAt: at })
      await insertMessage(db, { id: randomUUID(), conversationId: id, botId: bot.id, role: "assistant", content: "Yanıt", sources, createdAt: at })
    }
    await reply([{ url: "https://kahve.example/kargo", title: "Shipping" }, { url: "", title: "Returns" }])
    await reply([{ url: "https://kahve.example/kargo", title: "Shipping" }])
    await reply([{ url: "", title: "Somebody else's" }])
    await reply([{ url: "", title: "Returns" }], new Date(Date.now() - 40 * 86_400_000))

    assert.deepEqual(await sourceUsage(db, user.id), { [site.id]: 2, [text.id]: 1 })
    assert.deepEqual(await sourceUsage(db, user.id, 60), { [site.id]: 2, [text.id]: 2 })
  })
})

describe("uploaded files", () => {
  test("are stored as their text, searchable right away, with a larger limit than pasted text", async () => {
    const user = await newUser()
    const bot = await getBotForUser(db, user.id)
    const long = "Unopened bags can be returned within 14 days. ".repeat(1500)
    assert.ok(long.length > KNOWLEDGE_LIMITS.textChars && long.length < KNOWLEDGE_LIMITS.fileChars)
    await assert.rejects(addTextSource(db, user.id, { title: "Too long", content: long }, chunker), code("invalid_input"))
    const file = await addFileSource(db, user.id, { title: "Terms", content: long }, chunker)
    assert.equal(file.kind, "file")
    assert.equal(file.status, "ready")
    assert.equal(file.url, null)
    assert.equal((await listKnowledgeChunks(db, bot.id)).length, 1)
    // edited like text, under the file limit
    const edited = await updateSource(db, user.id, file.id, { title: "Store terms", content: `${long}\n\nGround coffee can't be returned.` }, chunker)
    assert.equal(edited.chunks, 2)
    await assert.rejects(updateSource(db, user.id, file.id, { refresh: "daily" }, chunker), code("invalid_input"))
    await assert.rejects(addFileSource(db, user.id, { title: "Empty scan", content: "   " }, chunker), /No readable text was found in this file/)
  })

  test("the schema rejects a file without content", async () => {
    const user = await newUser()
    const bot = await getBotForUser(db, user.id)
    await assert.rejects(db.query("insert into app.knowledge_sources (bot_id, kind, title) values ($1, 'file', 'x')", [bot.id]))
    await assert.rejects(db.query("insert into app.knowledge_sources (bot_id, kind, title, content) values ($1, 'pdf', 'x', 'y')", [bot.id]))
  })
})

describe("scheduled website refresh", () => {
  // updated_at is set by a trigger; tests move time back by hand
  const age = async (id: string, columns: Record<string, string>) => {
    await db.query("alter table app.knowledge_sources disable trigger knowledge_sources_set_updated_at")
    try {
      for (const [column, ago] of Object.entries(columns)) await db.query(`update app.knowledge_sources set ${column} = now() - $2::interval where id = $1`, [id, ago])
    } finally {
      await db.query("alter table app.knowledge_sources enable trigger knowledge_sources_set_updated_at")
    }
  }

  test("websites refresh weekly unless changed, and only websites can be set", async () => {
    const user = await newUser()
    const site = await addWebsiteSource(db, user.id, "https://kahve.example/")
    assert.equal(site.refresh, "weekly")
    assert.equal((await updateSource(db, user.id, site.id, { refresh: "daily" }, chunker)).refresh, "daily")
    await assert.rejects(updateSource(db, user.id, site.id, { refresh: "hourly" }, chunker), code("invalid_input"))
  })

  test("picks websites whose last read is older than their setting, oldest first", async () => {
    const user = await newUser()
    const ids = []
    for (const host of ["daily", "weekly", "fresh", "off", "never"]) ids.push((await addWebsiteSource(db, user.id, `https://${host}.example/`)).id)
    const [daily, weekly, fresh, off, never] = ids
    await updateSource(db, user.id, daily, { refresh: "daily" }, chunker)
    await updateSource(db, user.id, off, { refresh: "off" }, chunker)
    for (const id of [daily, weekly, fresh, off]) {
      await startSync(db, user.id, id)
      await finishSync(db, id, { pages: 1, chunks: [] })
    }
    await age(daily, { synced_at: "1 day" })
    await age(weekly, { synced_at: "8 days" })
    await age(fresh, { synced_at: "2 days" })
    await age(off, { synced_at: "30 days" })
    await age(never, { created_at: "1 day" })
    // a website added just now is read by the add itself, not by the job
    await addWebsiteSource(db, user.id, "https://new.example/")

    assert.deepEqual((await dueRefreshes(db, 10)).map((r) => r.id), [never, weekly, daily])
    assert.deepEqual((await dueRefreshes(db, 1)).map((r) => r.id), [never])
  })

  test("a failed refresh waits a full interval before it is tried again", async () => {
    const user = await newUser()
    const site = await addWebsiteSource(db, user.id, "https://down.example/")
    await startSync(db, user.id, site.id)
    await failSync(db, site.id, "Couldn't connect to the site")
    await age(site.id, { created_at: "10 days" })
    assert.deepEqual(await dueRefreshes(db, 10), [])
    await age(site.id, { updated_at: "8 days" })
    assert.deepEqual((await dueRefreshes(db, 10)).map((r) => r.id), [site.id])
  })

  test("the scheduled sync claims a source like a manual one, without a user", async () => {
    const user = await newUser()
    const bot = await getBotForUser(db, user.id)
    const site = await addWebsiteSource(db, user.id, "https://kahve.example/")
    const claimed = await startScheduledSync(db, site.id)
    assert.equal(claimed.botId, bot.id)
    assert.equal(claimed.url, "https://kahve.example/")
    await assert.rejects(startScheduledSync(db, site.id), code("busy"))
    await assert.rejects(startSync(db, user.id, site.id), code("busy"))
    await finishSync(db, site.id, { pages: 1, chunks: [] })

    await updateSource(db, user.id, site.id, { refresh: "off" }, chunker)
    await assert.rejects(startScheduledSync(db, site.id), code("not_found"))
    const text = await addTextSource(db, user.id, { title: "Text", content: "Some text that is long enough." }, chunker)
    await assert.rejects(startScheduledSync(db, text.id), code("not_found"))
    await assert.rejects(startScheduledSync(db, "nope"), code("not_found"))
  })
})

describe("chunk embeddings", () => {
  const MODEL = "gemini:test@4"
  const hash = (text: string) => new Uint8Array(createHash("sha256").update(text).digest())
  const vector = (...xs: number[]) => new Uint8Array(Float32Array.from(xs).buffer)
  const floats = (bytes: Uint8Array) => [...new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))]

  test("round-trip by text hash, scoped to one bot and model", async () => {
    const bot = await getBotForUser(db, (await newUser()).id)
    const other = await getBotForUser(db, (await newUser("other@example.com", "other")).id)
    await saveEmbeddings(db, bot.id, MODEL, [{ hash: hash("a"), vector: vector(1, 0, 0, 0) }, { hash: hash("b"), vector: vector(0, 1, 0, 0) }])
    await saveEmbeddings(db, other.id, MODEL, [{ hash: hash("a"), vector: vector(0, 0, 0, 1) }])

    const rows = await loadEmbeddings(db, bot.id, MODEL, [hash("a"), hash("c")])
    assert.equal(rows.length, 1)
    assert.deepEqual([...rows[0].hash], [...hash("a")])
    assert.deepEqual(floats(rows[0].vector), [1, 0, 0, 0])
    // another bot's identical text never leaks across, and another model's vectors aren't returned
    assert.deepEqual(floats((await loadEmbeddings(db, other.id, MODEL, [hash("a")]))[0].vector), [0, 0, 0, 1])
    assert.deepEqual(await loadEmbeddings(db, bot.id, "gemini:other@4", [hash("a")]), [])
    assert.deepEqual(await loadEmbeddings(db, "not-a-uuid", MODEL, [hash("a")]), [])
  })

  test("saving an existing hash again is a no-op", async () => {
    const bot = await getBotForUser(db, (await newUser()).id)
    await saveEmbeddings(db, bot.id, MODEL, [{ hash: hash("a"), vector: vector(1, 0, 0, 0) }])
    await saveEmbeddings(db, bot.id, MODEL, [{ hash: hash("a"), vector: vector(0, 1, 0, 0) }])
    assert.deepEqual(floats((await loadEmbeddings(db, bot.id, MODEL, [hash("a")]))[0].vector), [1, 0, 0, 0])
  })

  test("prune keeps only the given hashes of the current model, for that bot", async () => {
    const bot = await getBotForUser(db, (await newUser()).id)
    const other = await getBotForUser(db, (await newUser("other@example.com", "other")).id)
    await saveEmbeddings(db, bot.id, MODEL, ["a", "b", "c"].map((t) => ({ hash: hash(t), vector: vector(1, 0, 0, 0) })))
    await saveEmbeddings(db, bot.id, "gemini:old@4", [{ hash: hash("a"), vector: vector(1, 0, 0, 0) }])
    await saveEmbeddings(db, other.id, MODEL, [{ hash: hash("b"), vector: vector(1, 0, 0, 0) }])

    assert.equal(await pruneEmbeddings(db, bot.id, MODEL, [hash("a"), hash("c")]), 2)
    assert.deepEqual((await loadEmbeddings(db, bot.id, MODEL, ["a", "b", "c"].map(hash))).length, 2)
    assert.equal((await loadEmbeddings(db, other.id, MODEL, [hash("b")])).length, 1)
    // an empty keep list clears the bot (all its sources were deleted)
    assert.equal(await pruneEmbeddings(db, bot.id, MODEL, []), 2)
  })

  test("are deleted with the bot", async () => {
    const user = await newUser()
    const bot = await getBotForUser(db, user.id)
    await saveEmbeddings(db, bot.id, MODEL, [{ hash: hash("a"), vector: vector(1, 0, 0, 0) }])
    await db.query("delete from app.bots where id = $1", [bot.id])
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from app.knowledge_embeddings")
    assert.equal(rows[0].n, 0)
  })

  test("the schema rejects malformed rows", async () => {
    const bot = await getBotForUser(db, (await newUser()).id)
    await assert.rejects(saveEmbeddings(db, bot.id, MODEL, [{ hash: new Uint8Array(5), vector: vector(1) }]))
    await assert.rejects(saveEmbeddings(db, bot.id, MODEL, [{ hash: hash("a"), vector: new Uint8Array(0) }]))
  })
})
