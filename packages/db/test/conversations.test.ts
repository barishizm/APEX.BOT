import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { register } from "../src/auth.ts"
import { getBotForUser, saveBotSettings } from "../src/bots.ts"
import {
  addTokenUsage,
  conversationStats,
  deleteConversation,
  deleteConversationForUser,
  getConversationForUser,
  insertConversation,
  insertMessage,
  listConversations,
  loadConversation,
  markConversationHandoff,
  maskConversationSummary,
  searchTerms,
  setConversationVisitor,
  setMessageFeedback,
  sweepConversations,
  tokensUsedOn,
} from "../src/conversations.ts"

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

async function owner(email = "o@kahve.example", username = "owner") {
  const { user } = await register(db, { email, username, password: "correct horse", accountType: "personal", acceptTerms: true })
  // dashboard users are always email-verified before they reach the bot
  await db.query("update app.users set email_verified_at = now() where id = $1", [user.id])
  return { user, bot: await getBotForUser(db, user.id) }
}

async function chat(botId: string, question: string, answer: string, opts: { unanswered?: boolean; at?: Date } = {}) {
  const id = randomUUID()
  const at = opts.at ?? new Date()
  await insertConversation(db, { id, botId, origin: "https://kahve.example", createdAt: at })
  await insertMessage(db, { id: randomUUID(), conversationId: id, botId, role: "user", content: question, createdAt: at })
  const answerId = randomUUID()
  await insertMessage(db, {
    id: answerId,
    conversationId: id,
    botId,
    role: "assistant",
    content: answer,
    sources: opts.unanswered ? [] : [{ url: "https://kahve.example/kargo", title: "Kargo" }],
    unanswered: opts.unanswered,
    createdAt: new Date(at.getTime() + 1),
  })
  return { id, answerId }
}

describe("conversations", () => {
  test("the API's writes build a transcript the dashboard can read", async () => {
    const { user, bot } = await owner()
    const { id, answerId } = await chat(bot.id, "Kargo ücretsiz mi?", "750 TL üzeri ücretsiz.")
    await setConversationVisitor(db, bot.id, id, { email: "ziyaretci@example.com", name: "Ada" })
    await markConversationHandoff(db, bot.id, id)
    await setMessageFeedback(db, bot.id, id, answerId, "down")
    await setMessageFeedback(db, bot.id, id, answerId, "down") // same rating twice counts once

    const c = (await getConversationForUser(db, user.id, id))!
    assert.equal(c.messages.length, 2)
    assert.deepEqual(c.messages[1].sources, [{ url: "https://kahve.example/kargo", title: "Kargo" }])
    assert.equal(c.messages[1].feedback, "down")
    assert.deepEqual(c.visitor, { email: "ziyaretci@example.com", name: "Ada", phone: null })
    assert.ok(c.handoffAt)

    const [summary] = (await listConversations(db, user.id)).conversations
    assert.equal(summary.preview, "Kargo ücretsiz mi?")
    assert.equal(summary.messageCount, 2)
    assert.equal(summary.negativeCount, 1)
    await setMessageFeedback(db, bot.id, id, answerId, "up")
    assert.equal((await listConversations(db, user.id)).conversations[0].negativeCount, 0)
  })

  test("filters, pagination and stats", async () => {
    const { user, bot } = await owner()
    const base = Date.now() - 60_000
    await chat(bot.id, "Kargo?", "1-3 gün", { at: new Date(base) })
    const unknown = await chat(bot.id, "Mars?", "Bilmiyorum", { unanswered: true, at: new Date(base + 1000) })
    const lead = await chat(bot.id, "Toptan?", "Ekibe ileteyim", { at: new Date(base + 2000) })
    await setConversationVisitor(db, bot.id, lead.id, { email: "lead@example.com" })
    // a conversation that never got a message (lead form skipped) is not listed
    await insertConversation(db, { id: randomUUID(), botId: bot.id, createdAt: new Date() })

    assert.equal((await listConversations(db, user.id)).conversations.length, 3)
    assert.deepEqual((await listConversations(db, user.id, { filter: "unanswered" })).conversations.map((c) => c.id), [unknown.id])
    assert.deepEqual((await listConversations(db, user.id, { filter: "leads" })).conversations.map((c) => c.id), [lead.id])
    const page1 = await listConversations(db, user.id, { limit: 2 })
    assert.equal(page1.hasMore, true)
    const page2 = await listConversations(db, user.id, { limit: 2, before: page1.conversations[1].updatedAt })
    assert.equal(page2.conversations.length, 1)
    assert.equal(page2.hasMore, false)

    const stats = await conversationStats(db, user.id)
    assert.equal(stats.conversations, 3)
    assert.equal(stats.messages, 6)
    assert.equal(stats.unanswered, 1)
    assert.equal(stats.leads, 1)
  })

  test("keeps where a conversation started, for the list and the transcript", async () => {
    const { user, bot } = await owner()
    const id = randomUUID()
    const context = { page: "/kargo", pageTitle: "Kargo", locale: "tr-TR", country: "TR", device: "mobile", os: "iOS", browser: "Safari" }
    // unknown keys are dropped on the way in
    await insertConversation(db, { id, botId: bot.id, context: { ...context, ip: "1.2.3.4" } as never, createdAt: new Date() })
    await insertMessage(db, { id: randomUUID(), conversationId: id, botId: bot.id, role: "user", content: "Kargo?", createdAt: new Date() })
    assert.deepEqual((await listConversations(db, user.id)).conversations[0].context, context)
    assert.deepEqual((await getConversationForUser(db, user.id, id))!.context, context)
    // a conversation from before migration 0016 reads as no context
    const { id: old } = await chat(bot.id, "Eski?", "Evet")
    assert.deepEqual((await loadConversation(db, bot.id, old))!.context, {})
  })

  test("search matches every word across visitor details, the start page and messages", async () => {
    const { user, bot } = await owner()
    const base = Date.now() - 60_000
    const kargo = await chat(bot.id, "Kargo ücreti ne kadar?", "750 TL üzeri ücretsiz", { at: new Date(base) })
    const iade = await chat(bot.id, "İade nasıl yapılır?", "14 gün içinde", { at: new Date(base + 1000) })
    await setConversationVisitor(db, bot.id, iade.id, { email: "ada@example.com", name: "Ada" })
    const page = randomUUID()
    await insertConversation(db, { id: page, botId: bot.id, context: { page: "/fiyatlar_2026" }, createdAt: new Date(base + 2000) })
    await insertMessage(db, { id: randomUUID(), conversationId: page, botId: bot.id, role: "user", content: "100% indirim?", createdAt: new Date(base + 2000) })

    const ids = async (search: string) => (await listConversations(db, user.id, { search })).conversations.map((c) => c.id)
    assert.deepEqual(await ids("ücretsiz"), [kargo.id], "the assistant's answers count too")
    assert.deepEqual(await ids("KARGO"), [kargo.id], "case doesn't matter")
    assert.deepEqual(await ids("ada@example"), [iade.id])
    assert.deepEqual(await ids("ada 14"), [iade.id])
    assert.deepEqual(await ids("ada@example kargo"), [], "every word must match")
    assert.deepEqual(await ids("fiyatlar_"), [page])
    assert.deepEqual(await ids("100%"), [page])
    assert.deepEqual(await ids("_"), [page], "% and _ are literal")
    assert.equal((await ids("   ")).length, 3)
    assert.deepEqual(searchTerms("a\\b %x"), ["%a\\\\b%", "%\\%x%"])
  })

  test("days narrows the list to the window the stats count over", async () => {
    const { user, bot } = await owner()
    const old = await chat(bot.id, "Eski?", "Bilmiyorum", { unanswered: true, at: new Date(Date.now() - 10 * 86_400_000) })
    const recent = await chat(bot.id, "Yeni?", "Bilmiyorum", { unanswered: true, at: new Date(Date.now() - 60_000) })

    assert.deepEqual((await listConversations(db, user.id, { filter: "unanswered", days: 7 })).conversations.map((c) => c.id), [recent.id])
    assert.deepEqual((await listConversations(db, user.id, { filter: "unanswered", days: 30 })).conversations.map((c) => c.id), [recent.id, old.id])
    assert.equal((await listConversations(db, user.id, { filter: "unanswered" })).conversations.length, 2)
    assert.equal((await conversationStats(db, user.id, 7)).unanswered, 1)
  })

  test("tenants can't read, write or delete each other's conversations", async () => {
    const a = await owner()
    const b = await owner("b@example.com", "bob")
    const { id, answerId } = await chat(a.bot.id, "Gizli soru", "Gizli cevap")
    assert.equal(await loadConversation(db, b.bot.id, id), null)
    assert.equal(await getConversationForUser(db, b.user.id, id), null)
    assert.deepEqual((await listConversations(db, b.user.id)).conversations, [])
    // writes under the wrong bot are ignored
    await insertMessage(db, { id: randomUUID(), conversationId: id, botId: b.bot.id, role: "user", content: "injected", createdAt: new Date() })
    await setMessageFeedback(db, b.bot.id, id, answerId, "down")
    await setConversationVisitor(db, b.bot.id, id, { email: "x@example.com" })
    assert.equal(await deleteConversation(db, b.bot.id, id), false)
    assert.equal(await deleteConversationForUser(db, b.user.id, id), false)
    const c = (await loadConversation(db, a.bot.id, id))!
    assert.equal(c.messages.length, 2)
    assert.equal(c.messages[1].feedback, null)
    assert.equal(c.visitor, null)
    assert.equal(await deleteConversationForUser(db, a.user.id, id), true)
  })

  test("the sweep follows each bot's retention period", async () => {
    const { user, bot } = await owner()
    await saveBotSettings(db, user.id, { ...bot.settings, security: { ...bot.settings.security, retentionDays: 7 } }, bot.version)
    const old = await chat(bot.id, "eski", "eski")
    const fresh = await chat(bot.id, "yeni", "yeni")
    await db.query("update app.conversations set updated_at = now() - interval '8 days' where id = $1", [old.id])
    assert.equal(await sweepConversations(db), 1)
    assert.deepEqual((await listConversations(db, user.id)).conversations.map((c) => c.id), [fresh.id])
  })
})

describe("token usage", () => {
  test("adds up per bot and day", async () => {
    const { bot } = await owner()
    assert.equal(await tokensUsedOn(db, bot.id, "2026-10-15"), 0)
    await addTokenUsage(db, bot.id, "2026-10-15", 1200)
    await addTokenUsage(db, bot.id, "2026-10-15", 300)
    await addTokenUsage(db, bot.id, "2026-10-16", 50)
    assert.equal(await tokensUsedOn(db, bot.id, "2026-10-15"), 1500)
    assert.equal(await tokensUsedOn(db, bot.id, "2026-10-16"), 50)
  })
})

test("a preview cut mid-address does not leak half an email into the masked staff view", () => {
  const preview = ("hello ".repeat(31) + "write me at jane.doe@exam").slice(0, 200)
  assert.equal(preview.length, 200)
  const masked = maskConversationSummary({ preview, visitorEmail: null, visitorName: null } as never).preview
  assert.ok(!masked.includes("jane"), masked)
  assert.ok(!masked.includes("@"), masked)
  assert.equal(maskConversationSummary({ preview: "short mail a@b.co", visitorEmail: null, visitorName: null } as never).preview, "short mail [email]")
})
