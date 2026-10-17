import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { register } from "../src/auth.ts"
import { getBotForUser } from "../src/bots.ts"
import { analyticsData, parseRange, safeTimeZone } from "../src/analytics.ts"
import { dismissUnansweredForUser, insertConversation, insertMessage, markConversationHandoff, setConversationVisitor, setMessageFeedback } from "../src/conversations.ts"
import { addAnswerToKnowledge, listKnowledgeChunks, listSources } from "../src/knowledge.ts"
import { saveTopics, topicVocabulary, unlabeledQuestions } from "../src/topics.ts"

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
  await db.query("update app.users set email_verified_at = now() where id = $1", [user.id])
  return { user, bot: await getBotForUser(db, user.id) }
}

const DAY = 86_400_000
const KARGO = { url: "https://kahve.example/kargo", title: "Kargo" }

async function chat(botId: string, question: string, opts: { unanswered?: boolean; at?: Date; sources?: { url: string; title: string }[] } = {}) {
  const id = randomUUID()
  const at = opts.at ?? new Date()
  await insertConversation(db, { id, botId, origin: "https://kahve.example", createdAt: at })
  await insertMessage(db, { id: randomUUID(), conversationId: id, botId, role: "user", content: question, createdAt: at })
  const replyId = randomUUID()
  await insertMessage(db, {
    id: replyId,
    conversationId: id,
    botId,
    role: "assistant",
    content: opts.unanswered ? "Bilmiyorum" : "Yanıt",
    sources: opts.unanswered ? [] : (opts.sources ?? [KARGO]),
    unanswered: opts.unanswered,
    createdAt: new Date(at.getTime() + 1),
  })
  return { id, replyId }
}

const chunker = (title: string, content: string) => content.split(/\n\n/).map((text) => ({ url: "", title, text }))

describe("analytics", () => {
  test("totals, the previous period and the sourced-answer split", async () => {
    const { user, bot } = await owner()
    const now = Date.now()
    const a = await chat(bot.id, "Kargo ücretsiz mi?", { at: new Date(now - 60_000) })
    await chat(bot.id, "Mars'a kargo var mı?", { unanswered: true, at: new Date(now - 50_000) })
    await chat(bot.id, "İade süresi?", { at: new Date(now - 40_000), sources: [] })
    await setMessageFeedback(db, bot.id, a.id, a.replyId, "up")
    await markConversationHandoff(db, bot.id, a.id)
    await setConversationVisitor(db, bot.id, a.id, { email: "ada@example.com" })
    // ten days ago: the previous 7-day period, not the current one
    await chat(bot.id, "Eski soru", { at: new Date(now - 10 * DAY) })

    const r = await analyticsData(db, user.id, { days: 7, timeZone: "Europe/Istanbul" })
    assert.equal(r.days, 7)
    assert.equal(r.timeZone, "Europe/Istanbul")
    assert.deepEqual(r.current, { conversations: 3, questions: 3, answers: 3, sourcedAnswers: 1, unanswered: 1, handoffs: 1, leads: 1, helpful: 1, notHelpful: 0 })
    assert.equal(r.previous.conversations, 1)
    assert.equal(r.previous.sourcedAnswers, 1)
    assert.equal(r.daily.length, 7)
    assert.equal(r.daily.reduce((n, d) => n + d.questions, 0), 3)
    assert.equal(r.daily.reduce((n, d) => n + d.answers, 0), 3)
    assert.equal(r.daily.reduce((n, d) => n + d.sourced, 0), 1)
    assert.equal(r.hours.length, 24)
    assert.equal(r.hours.reduce((n, h) => n + h, 0), 3)
    assert.deepEqual(r.topSources, [{ ...KARGO, replies: 1, conversations: 1 }])
    assert.equal(r.questions.length, 3)
    assert.deepEqual(
      r.questions.map((q) => [q.content, q.sourced, q.unanswered]),
      [
        ["İade süresi?", false, false],
        ["Mars'a kargo var mı?", false, true],
        ["Kargo ücretsiz mi?", true, false],
      ],
    )
    assert.equal(r.unansweredOpen, 1)
    assert.equal(r.unanswered[0].question, "Mars'a kargo var mı?")
  })

  test("an empty bot gets zeros and a full run of days", async () => {
    const { user } = await owner()
    const r = await analyticsData(db, user.id, { days: 30 })
    assert.equal(r.current.conversations, 0)
    assert.equal(r.daily.length, 30)
    assert.ok(r.daily.every((d) => d.conversations === 0))
    assert.deepEqual(r.topSources, [])
  })

  test("range and time zone are sanitized", () => {
    assert.equal(parseRange("90"), 90)
    assert.equal(parseRange("365"), 30)
    assert.equal(parseRange(undefined), 30)
    assert.equal(safeTimeZone("Europe/Vilnius"), "Europe/Vilnius")
    assert.equal(safeTimeZone("Mars/Olympus"), "UTC")
    assert.equal(safeTimeZone("UTC'; drop table app.users; --"), "UTC")
    assert.equal(safeTimeZone(42), "UTC")
  })

  test("tenants only ever see their own numbers", async () => {
    const a = await owner()
    const b = await owner("b@example.com", "bob")
    await chat(a.bot.id, "Gizli soru", { unanswered: true })
    const r = await analyticsData(db, b.user.id, { days: 7 })
    assert.equal(r.current.questions, 0)
    assert.deepEqual(r.questions, [])
    assert.deepEqual(r.unanswered, [])
  })
})

describe("unanswered questions", () => {
  test("adding an answer appends to one managed source and resolves the replies", async () => {
    const { user, bot } = await owner()
    const q1 = await chat(bot.id, "Mars'a kargo var mı?", { unanswered: true })
    const q2 = await chat(bot.id, "Marsa kargo var mi", { unanswered: true })
    const q3 = await chat(bot.id, "Hafta sonu açık mısınız?", { unanswered: true })

    const first = await addAnswerToKnowledge(
      db,
      user.id,
      { question: "Mars'a kargo var mı?", answer: "Hayır, yalnızca Türkiye içine gönderim yapıyoruz.\n\n\nTeşekkürler.", replyIds: [q1.replyId, q2.replyId], title: "Yanıtlanan sorular" },
      chunker,
    )
    assert.equal(first.resolved, 2)
    assert.equal(first.source.managed, true)
    const second = await addAnswerToKnowledge(
      db,
      user.id,
      { question: "Hafta sonu açık mısınız?", answer: "Cumartesi 10-18 arası açığız.", replyIds: [q3.replyId], title: "ignored" },
      chunker,
    )
    assert.equal(second.source.id, first.source.id)
    assert.equal(second.source.title, "Yanıtlanan sorular")

    const sources = await listSources(db, user.id)
    assert.equal(sources.length, 1)
    // blank lines inside an answer are folded, so each question stays with its answer
    assert.deepEqual(
      (await listKnowledgeChunks(db, bot.id)).map((c) => c.text),
      ["Mars'a kargo var mı?\nHayır, yalnızca Türkiye içine gönderim yapıyoruz.\nTeşekkürler.", "Hafta sonu açık mısınız?\nCumartesi 10-18 arası açığız."],
    )
    const r = await analyticsData(db, user.id, { days: 7 })
    assert.equal(r.unansweredOpen, 0)
    // still counted as unanswered in the history
    assert.equal(r.current.unanswered, 3)
  })

  test("dismissing resolves without touching the knowledge base", async () => {
    const { user, bot } = await owner()
    const q = await chat(bot.id, "asdfgh", { unanswered: true })
    assert.equal(await dismissUnansweredForUser(db, user.id, [q.replyId]), 1)
    assert.equal(await dismissUnansweredForUser(db, user.id, [q.replyId]), 0)
    assert.deepEqual(await listSources(db, user.id), [])
  })

  test("input is checked and other tenants' replies are left alone", async () => {
    const a = await owner()
    const b = await owner("b@example.com", "bob")
    const q = await chat(a.bot.id, "Gizli?", { unanswered: true })
    const answer = (input: Record<string, unknown>) =>
      addAnswerToKnowledge(db, a.user.id, { question: "Soru?", answer: "Yeterince uzun bir yanıt.", replyIds: [q.replyId], title: "Yanıtlar", ...input }, chunker)
    await assert.rejects(answer({ question: " " }), /Write the question/)
    await assert.rejects(answer({ answer: "kısa" }), /at least a few words/)
    await assert.rejects(answer({ replyIds: ["not-a-uuid"] }), /no longer open/)
    await assert.rejects(answer({ replyIds: [] }), /no longer open/)

    assert.equal(await dismissUnansweredForUser(db, b.user.id, [q.replyId]), 0)
    assert.equal((await analyticsData(db, a.user.id, { days: 7 })).unansweredOpen, 1)
  })

  test("only owners and admins can resolve", async () => {
    const { user, bot } = await owner()
    const q = await chat(bot.id, "Soru?", { unanswered: true })
    await db.query("update app.organization_members set role = 'member' where user_id = $1", [user.id])
    await assert.rejects(dismissUnansweredForUser(db, user.id, [q.replyId]), /owners and admins/)
    await assert.rejects(
      addAnswerToKnowledge(db, user.id, { question: "Soru?", answer: "Yeterince uzun bir yanıt.", replyIds: [q.replyId], title: "Yanıtlar" }, chunker),
      /owners and admins/,
    )
  })
})

describe("topic labels", () => {
  const questionId = async (botId: string, content: string) =>
    (await db.query<{ id: string }>("select id from app.messages where bot_id = $1 and role = 'user' and content = $2", [botId, content])).rows[0].id

  test("the queue holds recent unlabeled visitor messages, in the bot's language", async () => {
    const { bot } = await owner()
    await db.query(`update app.bots set settings = jsonb_set(settings, '{general,defaultLang}', '"tr"') where id = $1`, [bot.id])
    await chat(bot.id, "Kargo ne kadar?")
    await chat(bot.id, "Eski soru", { at: new Date(Date.now() - 100 * DAY) })
    const queue = await unlabeledQuestions(db, 10)
    assert.deepEqual(
      queue.map((q) => [q.content, q.lang, q.botId]),
      [["Kargo ne kadar?", "tr", bot.id]],
    )

    assert.equal(await saveTopics(db, bot.id, [{ id: queue[0].id, topic: "  Kargo   ücreti " }]), 1)
    assert.deepEqual(await unlabeledQuestions(db, 10), [])
    const data = await analyticsData(db, (await owner("o2@kahve.example", "owner2")).user.id)
    assert.deepEqual(data.questions, [])
  })

  test("labels reach the analytics questions, and the vocabulary ranks a bot's own labels", async () => {
    const { user, bot } = await owner()
    for (const q of ["a", "b", "c", "hi"]) await chat(bot.id, q)
    await saveTopics(db, bot.id, [
      { id: await questionId(bot.id, "a"), topic: "Returns" },
      { id: await questionId(bot.id, "b"), topic: "Shipping" },
      { id: await questionId(bot.id, "c"), topic: "Shipping" },
      { id: await questionId(bot.id, "hi"), topic: "" },
    ])
    assert.deepEqual(await topicVocabulary(db, bot.id), ["Shipping", "Returns"])
    const data = await analyticsData(db, user.id)
    assert.deepEqual(data.questions.map((q) => q.topic).sort(), ["", "Returns", "Shipping", "Shipping"])
  })

  test("a bot can't label, or read the labels of, another bot's messages", async () => {
    const a = await owner()
    const b = await owner("o2@kahve.example", "owner2")
    await chat(a.bot.id, "Kargo?")
    const id = await questionId(a.bot.id, "Kargo?")
    assert.equal(await saveTopics(db, b.bot.id, [{ id, topic: "Hacked" }]), 0)
    assert.equal(await saveTopics(db, a.bot.id, [{ id, topic: "Kargo" }]), 1)
    assert.deepEqual(await topicVocabulary(db, b.bot.id), [])
  })
})
