import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { register } from "../src/auth.ts"
import { getBotForUser } from "../src/bots.ts"
import { addTokenUsage, insertConversation, insertMessage, setMessageFeedback } from "../src/conversations.ts"
import { ATTENTION_LIMIT, LOGIN_FAILURE_THRESHOLD, parseOverviewRange, platformOverview } from "../src/admin.ts"

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
beforeEach(() => db.query("truncate app.users, app.organizations, app.auth_events, app.waitlist, app.support_tickets cascade").then(() => {}))

const DAY = 86_400_000
const today = () => new Date().toISOString().slice(0, 10)

async function owner(email: string, username: string, verified = true) {
  const { user } = await register(db, { email, username, password: "correct horse", accountType: "personal", acceptTerms: true })
  if (verified) await db.query("update app.users set email_verified_at = now() where id = $1", [user.id])
  return { user, bot: await getBotForUser(db, user.id) }
}

async function chat(botId: string, opts: { at?: Date; unanswered?: boolean } = {}) {
  const id = randomUUID()
  const at = opts.at ?? new Date()
  await insertConversation(db, { id, botId, origin: "https://kahve.example", createdAt: at })
  await insertMessage(db, { id: randomUUID(), conversationId: id, botId, role: "user", content: "Kargo?", createdAt: at })
  const replyId = randomUUID()
  await insertMessage(db, { id: replyId, conversationId: id, botId, role: "assistant", content: "Yanıt", unanswered: opts.unanswered, createdAt: new Date(at.getTime() + 1) })
  return { id, replyId }
}

describe("platformOverview", () => {
  test("range parsing falls back to 30 days", () => {
    assert.equal(parseOverviewRange("7"), 7)
    assert.equal(parseOverviewRange(90), 90)
    assert.equal(parseOverviewRange("365"), 30)
    assert.equal(parseOverviewRange(undefined), 30)
  })

  test("an empty platform", async () => {
    const r = await platformOverview(db, 7)
    assert.equal(r.days, 7)
    assert.equal(r.daily.length, 7)
    assert.equal(r.daily.at(-1)!.day, today())
    assert.deepEqual(r.totals, {
      users: 0, newUsers: 0, unverifiedUsers: 0, workspaces: 0, activeWorkspaces: 0, bots: 0, botsSeen7d: 0, conversations: 0,
      messages: 0, answers: 0, unanswered: 0, negativeFeedback: 0, tokens: 0, failedSources: 0, waitlist: 0, openTickets: 0,
    })
    assert.deepEqual(r.plans.map((p) => p.workspaces), [0, 0, 0, 0])
    assert.deepEqual(r.attention.failedSyncs, { total: 0, rows: [] })
    assert.deepEqual(r.attention.missingMigrations, [])
  })

  test("counts users, workspaces, bots, traffic and tokens within the range", async () => {
    const a = await owner("a@kahve.example", "alice")
    const b = await owner("b@kahve.example", "bobby", false)
    // an old account, outside a 7-day range
    const c = await owner("c@kahve.example", "carol")
    await db.query("update app.users set created_at = now() - interval '20 days' where id = $1", [c.user.id])
    await db.query("update app.organizations set plan = 'pro' where id = (select organization_id from app.bots where id = $1)", [a.bot.id])

    const x = await chat(a.bot.id)
    await chat(a.bot.id, { unanswered: true })
    await chat(c.bot.id, { at: new Date(Date.now() - 20 * DAY) })
    await setMessageFeedback(db, a.bot.id, x.id, x.replyId, "down")
    await addTokenUsage(db, a.bot.id, today(), 1200)
    await addTokenUsage(db, c.bot.id, new Date(Date.now() - 20 * DAY).toISOString().slice(0, 10), 999)
    await db.query("insert into app.bot_activity (bot_id, widget_seen_at) values ($1, now()), ($2, now() - interval '8 days')", [a.bot.id, b.bot.id])
    await db.query("insert into app.waitlist (email) values ('w@example.com')")

    const r = await platformOverview(db, 7)
    assert.deepEqual(r.totals, {
      users: 3, newUsers: 2, unverifiedUsers: 1, workspaces: 3, activeWorkspaces: 1, bots: 3, botsSeen7d: 1, conversations: 2,
      messages: 4, answers: 2, unanswered: 1, negativeFeedback: 1, tokens: 1200, failedSources: 0, waitlist: 1, openTickets: 0,
    })
    assert.deepEqual(r.plans, [
      { plan: "free", workspaces: 2 },
      { plan: "starter", workspaces: 0 },
      { plan: "pro", workspaces: 1 },
      { plan: "business", workspaces: 0 },
    ])
    assert.deepEqual(r.daily.at(-1), { day: today(), newUsers: 2, conversations: 2, messages: 4, tokens: 1200 })

    const wide = await platformOverview(db, 30)
    assert.equal(wide.totals.newUsers, 3)
    assert.equal(wide.totals.conversations, 3)
    assert.equal(wide.totals.tokens, 2199)
    assert.equal(wide.daily.length, 30)
  })

  test("needs attention: failed syncs, bots near budget, failed log-ins and overdue tickets", async () => {
    const a = await owner("a@kahve.example", "alice")
    const b = await owner("b@kahve.example", "bobby")
    await db.query(
      `insert into app.knowledge_sources (bot_id, kind, title, url, status, error)
       values ($1, 'website', 'Site', 'https://kahve.example', 'failed', 'DNS'), ($1, 'website', 'Ok', 'https://kahve.example/ok', 'ready', null)`,
      [a.bot.id],
    )
    // a: custom 100k budget, 95k spent; b: default 2M budget, 1M spent
    await db.query(`update app.bots set settings = '{"security":{"dailyTokenBudget":100000}}' where id = $1`, [a.bot.id])
    await addTokenUsage(db, a.bot.id, today(), 95_000)
    await addTokenUsage(db, b.bot.id, today(), 1_000_000)

    const fail = (email: string | null, ip: string | null, n: number, ago = "1 hour") =>
      db.query(
        `insert into app.auth_events (event, email, ip, created_at) select 'login_failed', $1, $2::inet, now() - $3::interval from generate_series(1, $4)`,
        [email, ip, ago, n],
      )
    await fail("a@kahve.example", "203.0.113.9", LOGIN_FAILURE_THRESHOLD)
    await fail("ghost@example.com", null, LOGIN_FAILURE_THRESHOLD + 5)
    await fail("b@kahve.example", "198.51.100.1", LOGIN_FAILURE_THRESHOLD - 1)
    await fail("b@kahve.example", "198.51.100.1", 30, "2 days")

    await db.query(
      `insert into app.support_tickets (subject, category, status, sla_due_at, organization_id)
       select subject, 'bug', status, sla_due_at::timestamptz, (select organization_id from app.bots where id = $1)
         from (values ('Late', 'open', now() - interval '1 hour'),
                      ('On time', 'pending_user', now() + interval '1 hour'),
                      ('Sorted', 'resolved', now() - interval '1 day'),
                      ('Done', 'closed', now() - interval '1 day')) v (subject, status, sla_due_at)`,
      [a.bot.id],
    )

    const r = await platformOverview(db)
    assert.equal(r.totals.failedSources, 1)
    assert.equal(r.attention.failedSyncs.total, 1)
    assert.equal(r.attention.failedSyncs.rows[0]!.error, "DNS")
    assert.equal(r.attention.failedSyncs.rows[0]!.botId, a.bot.id)

    assert.equal(r.attention.budgetBots.total, 1)
    assert.deepEqual(
      { id: r.attention.budgetBots.rows[0]!.id, tokens: r.attention.budgetBots.rows[0]!.tokens, budget: r.attention.budgetBots.rows[0]!.budget },
      { id: a.bot.id, tokens: 95_000, budget: 100_000 },
    )

    assert.deepEqual(
      r.attention.loginFailures.rows.map(({ kind, key, failures, userId }) => ({ kind, key, failures, userId })),
      [
        { kind: "email", key: "ghost@example.com", failures: 25, userId: null },
        { kind: "email", key: "a@kahve.example", failures: 20, userId: a.user.id },
        { kind: "ip", key: "203.0.113.9", failures: 20, userId: null },
      ].sort((x, y) => y.failures - x.failures),
    )

    assert.equal(r.totals.openTickets, 2)
    assert.equal(r.attention.overdueTickets.total, 1)
    assert.equal(r.attention.overdueTickets.rows[0]!.subject, "Late")
    assert.ok(r.attention.overdueTickets.rows[0]!.organizationName)
  })

  test("attention lists are capped but keep the full count", async () => {
    const a = await owner("a@kahve.example", "alice")
    await db.query(
      `insert into app.knowledge_sources (bot_id, kind, title, url, status)
       select $1, 'website', 'Site ' || i, 'https://kahve.example/' || i, 'failed' from generate_series(1, $2) i`,
      [a.bot.id, ATTENTION_LIMIT + 3],
    )
    const r = await platformOverview(db)
    assert.equal(r.attention.failedSyncs.total, ATTENTION_LIMIT + 3)
    assert.equal(r.attention.failedSyncs.rows.length, ATTENTION_LIMIT)
  })
})
