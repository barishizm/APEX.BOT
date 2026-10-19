import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { register } from "../src/auth.ts"
import { getBotForUser } from "../src/bots.ts"
import { insertConversation, insertMessage, markConversationHandoff, setConversationVisitor, setMessageFeedback } from "../src/conversations.ts"
import { listPage } from "../src/admin-list.ts"
import { closeSupportAccess, openSupportAccess, supportGetConversation } from "../src/support-access.ts"
import {
  adminConversationBotsList,
  platformConversations,
  supportAccessActivity,
  UNANSWERED_ALERT_MIN_ANSWERS,
  type AdminConversationBotRow,
} from "../src/admin-conversations.ts"

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
beforeEach(() =>
  db
    .query("alter table app.admin_audit_log disable trigger user; truncate app.users, app.organizations, app.admin_audit_log cascade; alter table app.admin_audit_log enable trigger user")
    .then(() => {}),
)

const DAY = 86_400_000
const today = () => new Date().toISOString().slice(0, 10)

async function account(slug: string, role: "superadmin" | "support" | null = null) {
  const r = await register(db, { email: `${slug}@${slug}.example`, username: slug, password: "correct horse", accountType: "business", company: slug, acceptTerms: true })
  await db.query("update app.users set email_verified_at = now(), platform_role = $2 where id = $1", [r.user.id, role])
  return { id: r.user.id, bot: await getBotForUser(db, r.user.id) }
}

interface ChatOptions {
  at?: Date
  unanswered?: boolean
  feedback?: "up" | "down"
  context?: Record<string, string>
  lead?: boolean
  handoff?: boolean
}

async function chat(botId: string, o: ChatOptions = {}) {
  const id = randomUUID()
  const at = o.at ?? new Date()
  await insertConversation(db, { id, botId, origin: "https://kahve.example", context: o.context ?? {}, createdAt: at })
  await insertMessage(db, { id: randomUUID(), conversationId: id, botId, role: "user", content: "Kargo ne kadar?", createdAt: at })
  const replyId = randomUUID()
  await insertMessage(db, { id: replyId, conversationId: id, botId, role: "assistant", content: "Yanıt", unanswered: o.unanswered, createdAt: new Date(at.getTime() + 1) })
  if (o.feedback) await setMessageFeedback(db, botId, id, replyId, o.feedback)
  if (o.lead) await setConversationVisitor(db, botId, id, { email: "ayse@mail.example", name: "Ayşe" })
  if (o.handoff) await markConversationHandoff(db, botId, id, at)
  return { id, replyId }
}

describe("platformConversations", () => {
  test("an empty platform", async () => {
    const r = await platformConversations(db, 7)
    assert.equal(r.days, 7)
    assert.equal(r.daily.length, 7)
    assert.equal(r.daily.at(-1)!.day, today())
    assert.ok(r.daily.every((d) => d.conversations === 0 && d.unanswered === 0))
    assert.deepEqual(r.totals, {
      conversations: 0, previousConversations: 0, messages: 0, visitorMessages: 0, answers: 0, unanswered: 0, previousAnswers: 0,
      previousUnanswered: 0, openQuestions: 0, negative: 0, positive: 0, handoffs: 0, leads: 0, activeBots: 0, activeWorkspaces: 0, alertBots: 0,
    })
    assert.deepEqual(r.breakdown, { devices: [], countries: [], languages: [] })
  })

  test("counts the range, the range before it, and nothing older", async () => {
    const a = await account("kahve")
    const b = await account("cay")
    await chat(a.bot.id, { feedback: "down", lead: true })
    await chat(a.bot.id, { unanswered: true, handoff: true })
    await chat(b.bot.id, { feedback: "up" })
    // the previous 7 days
    await chat(a.bot.id, { at: new Date(Date.now() - 9 * DAY), unanswered: true })
    // older than both ranges
    await chat(b.bot.id, { at: new Date(Date.now() - 30 * DAY) })
    // an empty conversation (the widget opened, nothing sent) doesn't count
    await insertConversation(db, { id: randomUUID(), botId: b.bot.id, origin: null, createdAt: new Date() })

    const { totals } = await platformConversations(db, 7)
    assert.deepEqual(totals, {
      conversations: 3, previousConversations: 1, messages: 6, visitorMessages: 3, answers: 3, unanswered: 1, previousAnswers: 1,
      previousUnanswered: 1, openQuestions: 1, negative: 1, positive: 1, handoffs: 1, leads: 1, activeBots: 2, activeWorkspaces: 2, alertBots: 0,
    })

    // a resolved question is no longer open
    await db.query("update app.messages set resolved_at = now() where unanswered and created_at > now() - interval '1 day'")
    assert.equal((await platformConversations(db, 7)).totals.openQuestions, 0)
  })

  test("days are UTC days, oldest first, with the day's numbers", async () => {
    const a = await account("kahve")
    await chat(a.bot.id, { unanswered: true, feedback: "down", handoff: true })
    await chat(a.bot.id, { at: new Date(Date.now() - 2 * DAY) })
    const { daily } = await platformConversations(db, 7)
    assert.deepEqual(daily.at(-1), { day: today(), conversations: 1, answers: 1, unanswered: 1, negative: 1, handoffs: 1 })
    assert.equal(daily.reduce((n, d) => n + d.conversations, 0), 2)
    assert.deepEqual(daily.map((d) => d.day), [...daily.map((d) => d.day)].sort())
  })

  test("a bot with many unanswered replies is counted for the alert", async () => {
    const a = await account("kahve")
    const b = await account("cay")
    for (let i = 0; i < UNANSWERED_ALERT_MIN_ANSWERS; i++) await chat(a.bot.id, { unanswered: i < 4 })
    // too few replies to judge, all unanswered
    for (let i = 0; i < 3; i++) await chat(b.bot.id, { unanswered: true })
    assert.equal((await platformConversations(db, 7)).totals.alertBots, 1)
  })

  test("breaks conversations down by device, country and language, the rest summed up", async () => {
    const a = await account("kahve")
    await chat(a.bot.id, { context: { device: "mobile", country: "TR", locale: "tr-TR" } })
    await chat(a.bot.id, { context: { device: "mobile", country: "TR", locale: "tr" } })
    await chat(a.bot.id, { context: { device: "desktop", country: "DE", locale: "de-DE" } })
    await chat(a.bot.id)
    const { breakdown } = await platformConversations(db, 30)
    assert.deepEqual(breakdown.devices, [{ key: "mobile", n: 2 }, { key: "desktop", n: 1 }, { key: null, n: 1 }])
    assert.deepEqual(breakdown.countries, [{ key: "TR", n: 2 }, { key: "DE", n: 1 }, { key: null, n: 1 }])
    assert.deepEqual(breakdown.languages, [{ key: "tr", n: 2 }, { key: "de", n: 1 }, { key: null, n: 1 }])
  })

  test("only the top groups are named", async () => {
    const a = await account("kahve")
    const countries = ["TR", "TR", "TR", "DE", "DE", "FR", "NL", "BE", "AT", "CH", "IT", "ES", "PT"]
    for (const country of countries) await chat(a.bot.id, { context: { country } })
    const rows = (await platformConversations(db, 30)).breakdown.countries
    assert.equal(rows.length, 9)
    assert.deepEqual(rows.slice(0, 2), [{ key: "TR", n: 3 }, { key: "DE", n: 2 }])
    assert.deepEqual(rows.at(-1), { key: null, n: 2 })
    assert.equal(rows.reduce((n, r) => n + r.n, 0), countries.length)
  })
})

describe("adminConversationBotsList", () => {
  test("one row per bot with its numbers in the range, busiest first", async () => {
    const a = await account("kahve")
    const b = await account("cay")
    const c = await account("quiet")
    await chat(a.bot.id, { unanswered: true, feedback: "down", lead: true, handoff: true })
    await chat(a.bot.id, { feedback: "up" })
    await chat(b.bot.id)
    await chat(b.bot.id, { at: new Date(Date.now() - 20 * DAY) })

    const page = await listPage<AdminConversationBotRow>(db, adminConversationBotsList(7))
    assert.deepEqual(page.rows.map((r) => r.id), [a.bot.id, b.bot.id, c.bot.id])
    const [ra, rb, rc] = page.rows
    assert.equal(ra!.status, "serving")
    assert.equal(ra!.days, 7)
    assert.deepEqual(
      { conversations: ra!.conversations, messages: ra!.messages, answers: ra!.answers, unanswered: ra!.unanswered, open: ra!.open_questions, negative: ra!.negative, positive: ra!.positive, handoffs: ra!.handoffs, leads: ra!.leads },
      { conversations: 2, messages: 4, answers: 2, unanswered: 1, open: 1, negative: 1, positive: 1, handoffs: 1, leads: 1 },
    )
    assert.equal(rb!.conversations, 1)
    assert.equal(rc!.conversations, 0)
    assert.equal(rc!.last_at, null)
    // the 30-day range takes in b's older conversation
    const month = await listPage<AdminConversationBotRow>(db, adminConversationBotsList(30), { filters: { activity: "active" }, sort: "name" })
    assert.deepEqual(month.rows.map((r) => [r.name, r.conversations]), [[rb!.name, 2], [ra!.name, 2]].sort((x, y) => String(x[0]).localeCompare(String(y[0]))))
  })

  test("a range it doesn't know falls back to 30 days", async () => {
    const a = await account("kahve")
    await chat(a.bot.id, { at: new Date(Date.now() - 20 * DAY) })
    const rows = (await listPage<AdminConversationBotRow>(db, adminConversationBotsList("1; drop table app.bots"))).rows
    assert.equal(rows[0]!.conversations, 1)
  })

  test("sorts by unanswered share across pages, bots without replies last", async () => {
    const bots = await Promise.all(["aaa", "bbb", "ccc", "ddd"].map((s) => account(s)))
    // aa: 1 of 2 unanswered, bb: 2 of 2, cc: 0 of 1, dd: no replies
    await chat(bots[0]!.bot.id, { unanswered: true })
    await chat(bots[0]!.bot.id)
    await chat(bots[1]!.bot.id, { unanswered: true })
    await chat(bots[1]!.bot.id, { unanswered: true })
    await chat(bots[2]!.bot.id)
    const spec = adminConversationBotsList(7)
    const first = await listPage<AdminConversationBotRow>(db, spec, { sort: "unanswered", dir: "desc", limit: 2 })
    const second = await listPage<AdminConversationBotRow>(db, spec, { sort: "unanswered", dir: "desc", limit: 2, cursor: first.nextCursor })
    assert.deepEqual([...first.rows, ...second.rows].map((r) => r.id), [bots[1]!.bot.id, bots[0]!.bot.id, bots[2]!.bot.id, bots[3]!.bot.id])
    assert.equal(second.nextCursor, null)
  })

  test("filters", async () => {
    const a = await account("kahve")
    const b = await account("cay")
    const c = await account("quiet")
    for (let i = 0; i < UNANSWERED_ALERT_MIN_ANSWERS; i++) await chat(a.bot.id, { unanswered: i < 5 })
    await chat(b.bot.id, { unanswered: true, feedback: "down", handoff: true })
    await db.query("update app.bots set disabled_at = now() where id = $1", [c.bot.id])
    const spec = adminConversationBotsList(7)
    const ids = async (filters: Record<string, string>) => (await listPage<AdminConversationBotRow>(db, spec, { filters, sort: "name" })).rows.map((r) => r.id).sort()

    assert.deepEqual(await ids({ unanswered: "high" }), [a.bot.id])
    const rows = (await listPage<AdminConversationBotRow>(db, spec, { sort: "name" })).rows
    assert.deepEqual(rows.filter((r) => r.needs_knowledge).map((r) => r.id), [a.bot.id])
    assert.deepEqual(await ids({ unanswered: "any" }), [a.bot.id, b.bot.id].sort())
    assert.deepEqual(await ids({ negative: "yes" }), [b.bot.id])
    assert.deepEqual(await ids({ handoff: "yes" }), [b.bot.id])
    assert.deepEqual(await ids({ activity: "quiet" }), [c.bot.id])
    assert.deepEqual(await ids({ status: "disabled" }), [c.bot.id])
    assert.deepEqual(await ids({ open: "yes" }), [a.bot.id, b.bot.id].sort())
    await db.query("update app.messages set resolved_at = now() where bot_id = $1", [b.bot.id])
    assert.deepEqual(await ids({ open: "yes" }), [a.bot.id])
    await assert.rejects(listPage(db, spec, { filters: { unanswered: "1=1" } }), /Unknown filter/)
  })

  test("never returns conversation content or visitor details", async () => {
    const a = await account("kahve")
    await chat(a.bot.id, { lead: true })
    const [row] = (await listPage<Record<string, unknown>>(db, adminConversationBotsList(7))).rows
    const text = JSON.stringify(row)
    for (const secret of ["ayse@mail.example", "Ayşe", "Kargo", "Yanıt"]) assert.ok(!text.includes(secret), secret)
  })
})

describe("supportAccessActivity", () => {
  test("open and past windows with the reads each led to", async () => {
    const staff = await account("staff", "support")
    const other = await account("other", "superadmin")
    const customer = await account("kahve")
    const { id: conversationId } = await chat(customer.bot.id, { lead: true })

    const first = await db.transaction((tx) => openSupportAccess(tx, staff.id, customer.bot.id, "Ticket about shipping answers", "T-1"))
    await supportGetConversation(db, staff.id, customer.bot.id, conversationId)
    await supportGetConversation(db, staff.id, customer.bot.id, conversationId, { reveal: true })
    await db.transaction((tx) => closeSupportAccess(tx, staff.id, customer.bot.id))
    // a second window: its reads are its own, not the first one's
    const second = await db.transaction((tx) => openSupportAccess(tx, staff.id, customer.bot.id, "Follow-up"))
    await supportGetConversation(db, staff.id, customer.bot.id, conversationId)
    // another staff member's window that ran out
    const expired = await db.transaction((tx) => openSupportAccess(tx, other.id, customer.bot.id, "Checking a complaint"))
    await db.query("update app.support_access_grants set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where id = $1", [expired.grant.id])

    const r = await supportAccessActivity(db)
    assert.deepEqual(r.open.map((w) => [w.id, w.state, w.views, w.reveals]), [[second.grant.id, "open", 1, 0]])
    assert.deepEqual(r.recent.map((w) => [w.id, w.state]).sort(), [[first.grant.id, "closed"], [expired.grant.id, "expired"]].sort())
    const closed = r.recent.find((w) => w.id === first.grant.id)!
    assert.deepEqual(
      { views: closed.views, reveals: closed.reveals, ticket: closed.ticketRef, reason: closed.reason, bot: closed.botId, admin: closed.adminId, name: closed.adminName },
      { views: 1, reveals: 1, ticket: "T-1", reason: "Ticket about shipping answers", bot: customer.bot.id, admin: staff.id, name: "staff" },
    )
    assert.deepEqual(r.totals, { windows: 3, staff: 2, views: 2, reveals: 1 })
  })

  test("windows older than 30 days drop out of the recent list", async () => {
    const staff = await account("staff", "support")
    const customer = await account("kahve")
    const old = await db.transaction((tx) => openSupportAccess(tx, staff.id, customer.bot.id, "Old ticket"))
    await db.query("update app.support_access_grants set created_at = now() - interval '40 days', expires_at = now() - interval '40 days' + interval '1 hour' where id = $1", [old.grant.id])
    const r = await supportAccessActivity(db)
    assert.deepEqual(r.recent, [])
    assert.deepEqual(r.totals, { windows: 0, staff: 0, views: 0, reveals: 0 })
  })
})

describe("adminConversationBotsList negative feedback sort", () => {
  test("by share of rated replies rated down, unrated bots last", async () => {
    const a = await account("kahve")
    const b = await account("cay")
    const c = await account("quiet")
    // a: 1 of 4 rated down, b: 1 of 1
    await chat(a.bot.id, { feedback: "down" })
    for (let i = 0; i < 3; i++) await chat(a.bot.id, { feedback: "up" })
    await chat(b.bot.id, { feedback: "down" })
    await chat(c.bot.id)
    const rows = (await listPage<AdminConversationBotRow>(db, adminConversationBotsList(7), { sort: "negative", dir: "desc" })).rows
    assert.deepEqual(rows.map((r) => r.id), [b.bot.id, a.bot.id, c.bot.id])
  })
})
