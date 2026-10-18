import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { AuthError, register } from "../src/auth.ts"
import { AdminError } from "../src/admin.ts"
import { listPage } from "../src/admin-list.ts"
import { BotError, getBotForUser } from "../src/bots.ts"
import {
  ADMIN_TICKETS_LIST,
  cleanTicketContext,
  createTicket,
  getAdminTicket,
  getUserTicket,
  listUserTickets,
  replyAsUser,
  resolveAsUser,
  staffAssignTicket,
  staffReply,
  staffSetTicketPriority,
  staffSetTicketStatus,
  supportQueueCounts,
  type AdminTicketRow,
} from "../src/support-tickets.ts"

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
beforeEach(() => db.query("truncate app.users, app.organizations, app.support_tickets cascade").then(() => {}))

const run = <T>(fn: (tx: Parameters<Parameters<Db["transaction"]>[0]>[0]) => Promise<T>) => db.transaction(fn)
const err = (c: string) => (e: unknown) => (e instanceof AdminError || e instanceof AuthError || e instanceof BotError) && e.code === c

async function account(slug: string, role: "superadmin" | "support" | null = null) {
  const r = await register(db, { email: `${slug}@${slug}.example`, username: slug, password: "correct horse", accountType: "business", company: slug, acceptTerms: true })
  await db.query("update app.users set email_verified_at = now(), platform_role = $2 where id = $1", [r.user.id, role])
  return { ...r, id: r.user.id }
}

const ticketRow = async (id: string) =>
  (await db.query<{ status: string; priority: string; assignee_id: string | null; sla_due_at: Date | null }>("select status, priority, assignee_id, sla_due_at from app.support_tickets where id = $1", [id])).rows[0]!

async function filed() {
  const customer = await account("kahve")
  const bot = await getBotForUser(db, customer.id)
  const { ticket, mail } = await createTicket(db, customer.id, {
    subject: "  Widget doesn't\nopen  ",
    category: "widget",
    body: "  It stopped opening yesterday.\r\nAny idea?  ",
    botId: bot.id,
    locale: "tr",
    context: { page: "/dashboard/widget", site: { id: "spoofed", name: "Spoofed" }, browser: { language: "tr-TR", viewport: "1440x900" }, lastError: { message: "TypeError: x is undefined", at: "2026-10-18T10:00:00Z" } },
    userAgent: "Mozilla/5.0 Test",
  })
  return { customer, bot, ticket, mail }
}

describe("support tickets: customer side", () => {
  test("files a ticket on the site being viewed, with a deadline and the cleaned context", async () => {
    const { customer, bot, ticket, mail } = await filed()
    assert.ok(ticket.number >= 1001)
    assert.equal(ticket.subject, "Widget doesn't open")
    assert.equal(ticket.status, "open")
    assert.equal(ticket.priority, "normal")
    assert.equal(ticket.botId, bot.id)
    assert.equal(ticket.organizationId, bot.organizationId)
    assert.equal(ticket.locale, "tr")
    assert.ok(ticket.slaDueAt && ticket.slaDueAt.getTime() > Date.now() + 23 * 3600_000)
    assert.deepEqual(ticket.context.site, { id: bot.id, name: bot.name }, "the site comes from the server, not the request")
    assert.equal(ticket.context.browser?.userAgent, "Mozilla/5.0 Test")
    assert.equal(ticket.context.lastError?.message, "TypeError: x is undefined")
    assert.equal(mail.customer?.email, customer.user.email)
    assert.equal(mail.assignee, null)

    const mine = await getUserTicket(db, customer.id, ticket.id)
    assert.equal(mine?.messages.length, 1)
    assert.equal(mine?.messages[0]!.body, "It stopped opening yesterday.\nAny idea?")
  })

  test("refuses bad input", async () => {
    const customer = await account("kahve")
    const base = { subject: "Help", category: "bug", body: "Broken" }
    await assert.rejects(createTicket(db, customer.id, { ...base, subject: " " }), err("invalid_input"))
    await assert.rejects(createTicket(db, customer.id, { ...base, subject: "x".repeat(201) }), err("invalid_input"))
    await assert.rejects(createTicket(db, customer.id, { ...base, category: "sales" }), err("invalid_input"))
    await assert.rejects(createTicket(db, customer.id, { ...base, body: "\u0000​" }), err("invalid_input"))
    await assert.rejects(createTicket(db, customer.id, { ...base, body: "x".repeat(10_001) }), err("invalid_input"))
  })

  test("a site of another workspace is ignored; the ticket goes to the user's own workspace", async () => {
    const other = await account("other")
    const otherBot = await getBotForUser(db, other.id)
    const customer = await account("kahve")
    const own = await getBotForUser(db, customer.id)
    const { ticket } = await createTicket(db, customer.id, { subject: "Hi", category: "other", body: "Hello", botId: otherBot.id })
    assert.equal(ticket.botId, null)
    assert.equal(ticket.organizationId, own.organizationId)
    assert.equal(ticket.context.site, undefined)
  })

  test("customers see only their own tickets and never internal notes", async () => {
    const { customer, ticket } = await filed()
    const stranger = await account("stranger")
    const staff = await account("staff", "support")
    await run((tx) => staffReply(tx, staff.id, ticket.id, { body: "Customer seems to use an old snippet", internal: true }))
    await run((tx) => staffReply(tx, staff.id, ticket.id, { body: "Could you paste your snippet?" }))

    assert.equal(await getUserTicket(db, stranger.id, ticket.id), null)
    assert.deepEqual(await listUserTickets(db, stranger.id), [])
    await assert.rejects(replyAsUser(db, stranger.id, ticket.id, "hi"), err("not_found"))

    const mine = await getUserTicket(db, customer.id, ticket.id)
    assert.deepEqual(mine!.messages.map((m) => [m.fromStaff, m.body, m.authorName]), [
      [false, "It stopped opening yesterday.\nAny idea?", "kahve"],
      [true, "Could you paste your snippet?", null],
    ])
    const [row] = await listUserTickets(db, customer.id)
    assert.equal(row!.messages, 2)
    assert.equal(row!.lastFromStaff, true)
    assert.equal(row!.status, "pending_user")
  })

  test("a customer reply reopens the ticket and restarts the clock; closed tickets take no replies", async () => {
    const { customer, ticket } = await filed()
    const staff = await account("staff", "support")
    await run((tx) => staffReply(tx, staff.id, ticket.id, { body: "Try again now" }))
    assert.equal((await ticketRow(ticket.id)).sla_due_at, null)

    const { mail } = await replyAsUser(db, customer.id, ticket.id, "Still broken")
    const row = await ticketRow(ticket.id)
    assert.equal(row.status, "open")
    assert.ok(row.sla_due_at)
    assert.equal(mail.assignee?.email, "staff@staff.example", "the staff member who answered took the ticket")

    await resolveAsUser(db, customer.id, ticket.id)
    assert.equal((await ticketRow(ticket.id)).status, "resolved")
    await run((tx) => staffSetTicketStatus(tx, ticket.id, "closed"))
    await assert.rejects(replyAsUser(db, customer.id, ticket.id, "One more thing"), err("conflict"))
  })
})

describe("support tickets: staff side", () => {
  test("an internal note leaves status, deadline and assignee alone and sends no mail", async () => {
    const { ticket } = await filed()
    const staff = await account("staff", "support")
    const before = await ticketRow(ticket.id)
    const note = await run((tx) => staffReply(tx, staff.id, ticket.id, { body: "Looking into logs", internal: true }))
    assert.equal(note.extra.mail, null)
    assert.deepEqual(await ticketRow(ticket.id), before)

    const detail = await getAdminTicket(db, ticket.id)
    assert.equal(detail!.messages.length, 2)
    assert.equal(detail!.messages[1]!.internal, true)
    assert.equal(detail!.messages[1]!.authorName, "staff")
    assert.equal(detail!.ticket.customer?.email, "kahve@kahve.example")
    assert.ok(detail!.staff.some((s) => s.id === staff.id))
  })

  test("a reply can keep the ticket in progress, and then the deadline stays", async () => {
    const { ticket } = await filed()
    const staff = await account("staff", "support")
    const r = await run((tx) => staffReply(tx, staff.id, ticket.id, { body: "On it", status: "in_progress" }))
    assert.equal(r.extra.mail?.ticket.locale, "tr")
    const row = await ticketRow(ticket.id)
    assert.equal(row.status, "in_progress")
    assert.equal(row.sla_due_at, null, "a public reply meets the deadline")
    await assert.rejects(run((tx) => staffReply(tx, staff.id, ticket.id, { body: "x", status: "done" })), err("invalid_input"))
  })

  test("assigns only to active staff", async () => {
    const { ticket, customer } = await filed()
    const staff = await account("staff", "support")
    await assert.rejects(run((tx) => staffAssignTicket(tx, ticket.id, customer.id)), err("invalid_input"))
    await assert.rejects(run((tx) => staffAssignTicket(tx, ticket.id, "nope")), err("invalid_input"))
    const c = await run((tx) => staffAssignTicket(tx, ticket.id, staff.id))
    assert.deepEqual(c.after, { assigneeId: staff.id })
    assert.equal(c.extra.mail?.assignee?.email, "staff@staff.example")
    await assert.rejects(run((tx) => staffAssignTicket(tx, ticket.id, staff.id)), err("invalid_input"))
    await run((tx) => staffAssignTicket(tx, ticket.id, null))
    assert.equal((await ticketRow(ticket.id)).assignee_id, null)
  })

  test("priority moves the deadline; waiting or done clears it and reopening starts it again", async () => {
    const { ticket } = await filed()
    const start = (await ticketRow(ticket.id)).sla_due_at!.getTime()
    await run((tx) => staffSetTicketPriority(tx, ticket.id, "urgent"))
    assert.equal((await ticketRow(ticket.id)).sla_due_at!.getTime(), start - 20 * 3600_000)

    await run((tx) => staffSetTicketStatus(tx, ticket.id, "resolved"))
    assert.equal((await ticketRow(ticket.id)).sla_due_at, null)
    await run((tx) => staffSetTicketStatus(tx, ticket.id, "open"))
    const reopened = (await ticketRow(ticket.id)).sla_due_at!.getTime()
    assert.ok(reopened > Date.now() + 3.9 * 3600_000 && reopened < Date.now() + 4.1 * 3600_000, "urgent: 4 hours")
    await assert.rejects(run((tx) => staffSetTicketStatus(tx, ticket.id, "open")), err("invalid_input"))
    await assert.rejects(run((tx) => staffSetTicketPriority(tx, ticket.id, "critical")), err("invalid_input"))
  })

  test("the queue filters by status, assignee and overdue deadlines", async () => {
    const { ticket } = await filed()
    const staff = await account("staff", "support")
    const second = await createTicket(db, (await account("cay")).id, { subject: "Invoice", category: "billing", body: "Wrong VAT" })
    await run((tx) => staffAssignTicket(tx, second.ticket.id, staff.id))
    await db.query("update app.support_tickets set sla_due_at = now() - interval '1 hour' where id = $1", [ticket.id])

    const ids = async (filters: Record<string, string>) => (await listPage<AdminTicketRow>(db, ADMIN_TICKETS_LIST, { filters })).rows.map((r) => r.id).sort()
    assert.deepEqual(await ids({ sla: "overdue" }), [ticket.id])
    assert.deepEqual(await ids({ assignee: staff.id }), [second.ticket.id])
    assert.deepEqual(await ids({ assigned: "no" }), [ticket.id])
    assert.deepEqual(await ids({ category: "billing" }), [second.ticket.id])
    assert.equal((await ids({ status: "active" })).length, 2)
    assert.deepEqual(await ids({ status: "closed" }), [])
    const found = await listPage<AdminTicketRow>(db, ADMIN_TICKETS_LIST, { q: `#${second.ticket.number}` })
    assert.deepEqual(found.rows.map((r) => r.subject), ["Invoice"])
    assert.deepEqual(await supportQueueCounts(db), { active: 2, overdue: 1, unassigned: 1 })
  })
})

describe("cleanTicketContext", () => {
  test("keeps known fields at bounded sizes and drops the rest", () => {
    const c = cleanTicketContext({
      page: "https://evil.example/x",
      browser: { userAgent: "UA".repeat(400), viewport: "big", language: "en-GB", extra: 1 },
      lastError: { message: "  ", source: "x" },
      secret: "nope",
    })
    assert.equal(c.page, undefined, "only app paths")
    assert.equal(c.browser?.userAgent?.length, 500)
    assert.equal(c.browser?.viewport, undefined)
    assert.equal(c.browser?.language, "en-GB")
    assert.equal(c.lastError, undefined)
    assert.equal("secret" in c, false)
    assert.deepEqual(cleanTicketContext("junk"), {})
  })
})
