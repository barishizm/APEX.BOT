import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { AuthError, getImpersonatedSession, getSession, logout, register } from "../src/auth.ts"
import { AdminError } from "../src/admin.ts"
import { getBotForUser } from "../src/bots.ts"
import { insertConversation, insertMessage, MASKED, setConversationVisitor } from "../src/conversations.ts"
import { endImpersonation, startImpersonation } from "../src/impersonation.ts"
import {
  activeSupportAccess,
  closeSupportAccess,
  openSupportAccess,
  SUPPORT_ACCESS_MINUTES,
  supportGetConversation,
  supportListConversations,
} from "../src/support-access.ts"

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
const err = (c: string) => (e: unknown) => (e instanceof AdminError || e instanceof AuthError) && e.code === c

async function account(slug: string, role: "superadmin" | "support" | null = null) {
  const r = await register(db, { email: `${slug}@${slug}.example`, username: slug, password: "correct horse", accountType: "business", company: slug, acceptTerms: true })
  await db.query("update app.users set email_verified_at = now(), platform_role = $2 where id = $1", [r.user.id, role])
  return { ...r, id: r.user.id }
}

async function customerWithConversation() {
  const owner = await account("kahve")
  const bot = await getBotForUser(db, owner.id)
  const id = randomUUID()
  const at = new Date()
  await insertConversation(db, { id, botId: bot.id, origin: "https://kahve.example", createdAt: at })
  await insertMessage(db, { id: randomUUID(), conversationId: id, botId: bot.id, role: "user", content: "Write to ayse@mail.example or call +90 532 123 45 67", createdAt: at })
  await setConversationVisitor(db, bot.id, id, { email: "ayse@mail.example", name: "Ayşe Yılmaz", phone: "+90 532 123 45 67" })
  return { owner, bot, conversationId: id }
}

const audit = async () =>
  (await db.query<{ action: string; actor_id: string; target_type: string; target_id: string; reason: string | null; after: Record<string, unknown> | null }>(
    "select action, actor_id, target_type, target_id, reason, after from app.admin_audit_log order by id",
  )).rows

// moves a row back in time, as if it had been opened `minutes` ago
const age = (table: "support_access_grants" | "impersonation_sessions", id: string, minutes: number) =>
  db.query(`update app.${table} set created_at = created_at - make_interval(mins => $2), expires_at = expires_at - make_interval(mins => $2) where id = $1`, [id, minutes])

describe("support access", () => {
  test("staff can't read conversations without an open window", async () => {
    const { bot, conversationId } = await customerWithConversation()
    const staff = await account("staff", "support")
    assert.equal(await activeSupportAccess(db, staff.id, bot.id), null)
    await assert.rejects(supportListConversations(db, staff.id, bot.id), err("forbidden"))
    await assert.rejects(supportGetConversation(db, staff.id, bot.id, conversationId), err("forbidden"))
    assert.deepEqual(await audit(), [], "a refused read leaves no audit entry")
  })

  test("opens a 60-minute window for that staff member only, and names the owners to tell", async () => {
    const { owner, bot } = await customerWithConversation()
    const staff = await account("staff", "support")
    const other = await account("other", "support")
    const opened = await run((tx) => openSupportAccess(tx, staff.id, bot.id, "Customer asked why the bot misanswered", "  T-1042 "))
    assert.equal(opened.grant.ticketRef, "T-1042")
    assert.deepEqual(opened.owners, [owner.user.email])
    const minutes = (opened.grant.expiresAt.getTime() - opened.grant.createdAt.getTime()) / 60_000
    assert.equal(Math.round(minutes), SUPPORT_ACCESS_MINUTES)
    assert.equal((await activeSupportAccess(db, staff.id, bot.id))?.id, opened.grant.id)
    assert.equal(await activeSupportAccess(db, other.id, bot.id), null, "another staff member needs a window of their own")
    await assert.rejects(run((tx) => openSupportAccess(tx, staff.id, bot.id, "   ")), err("invalid_input"))
    await assert.rejects(run((tx) => openSupportAccess(tx, staff.id, bot.id, "x", "T".repeat(101))), err("invalid_input"))
  })

  test("masks the visitor's details and personal data in messages", async () => {
    const { bot, conversationId } = await customerWithConversation()
    const staff = await account("staff", "support")
    await run((tx) => openSupportAccess(tx, staff.id, bot.id, "ticket"))

    const page = await supportListConversations(db, staff.id, bot.id)
    const row = page.conversations[0]!
    assert.equal(row.visitorEmail, MASKED.email)
    assert.equal(row.visitorName, MASKED.name)
    assert.equal(row.preview.includes("ayse@mail.example"), false)

    const { conversation } = (await supportGetConversation(db, staff.id, bot.id, conversationId))!
    assert.deepEqual(conversation.visitor, { email: MASKED.email, name: MASKED.name, phone: MASKED.phone })
    assert.equal(conversation.messages[0]!.content, "Write to [email] or call [phone]")
  })

  test("audits every transcript read, and showing the details as a separate event", async () => {
    const { bot, conversationId } = await customerWithConversation()
    const staff = await account("staff", "support")
    const { grant } = await run((tx) => openSupportAccess(tx, staff.id, bot.id, "T-7 refund question", "T-7"))

    await supportGetConversation(db, staff.id, bot.id, conversationId, { meta: { ip: "203.0.113.9" } })
    const revealed = await supportGetConversation(db, staff.id, bot.id, conversationId, { reveal: true })
    assert.equal(revealed!.conversation.visitor?.email, "ayse@mail.example")
    assert.equal(revealed!.conversation.messages[0]!.content.includes("ayse@mail.example"), true)
    // another bot's conversation id reads as missing, and isn't audited
    assert.equal(await supportGetConversation(db, staff.id, bot.id, randomUUID()), null)

    const entries = await audit()
    assert.deepEqual(entries.map((e) => e.action), ["bot.conversation.view", "bot.conversation.reveal_pii"])
    for (const e of entries) {
      assert.equal(e.actor_id, staff.id)
      assert.equal(e.target_type, "bot")
      assert.equal(e.target_id, bot.id)
      assert.equal(e.reason, "T-7 refund question")
      assert.deepEqual(e.after, { conversationId, grantId: grant.id, ticketRef: "T-7" })
    }
    assert.equal(JSON.stringify(entries).includes("ayse"), false, "the audit log holds no visitor data")
  })

  test("the window closes after 60 minutes, or early on request", async () => {
    const { bot, conversationId } = await customerWithConversation()
    const staff = await account("staff", "support")
    const first = await run((tx) => openSupportAccess(tx, staff.id, bot.id, "ticket"))
    await age("support_access_grants", first.grant.id, SUPPORT_ACCESS_MINUTES)
    assert.equal(await activeSupportAccess(db, staff.id, bot.id), null)
    await assert.rejects(supportGetConversation(db, staff.id, bot.id, conversationId), err("forbidden"))

    const second = await run((tx) => openSupportAccess(tx, staff.id, bot.id, "ticket"))
    assert.equal(second.replaced, null, "an expired window isn't counted as replaced")
    assert.deepEqual(await run((tx) => closeSupportAccess(tx, staff.id, bot.id)), { id: second.grant.id })
    assert.equal(await activeSupportAccess(db, staff.id, bot.id), null)
    assert.equal(await run((tx) => closeSupportAccess(tx, staff.id, bot.id)), null)
  })

  test("the database refuses a window longer than 60 minutes", async () => {
    const { bot } = await customerWithConversation()
    const staff = await account("staff", "support")
    await assert.rejects(
      db.query("insert into app.support_access_grants (bot_id, admin_id, reason, expires_at) values ($1, $2, 'x', now() + interval '61 minutes')", [bot.id, staff.id]),
    )
  })
})

describe("impersonation", () => {
  async function setup() {
    const { owner } = await customerWithConversation()
    const admin = await account("root", "superadmin")
    const adminSession = (await getSession(db, admin.session.token))!
    return { owner, admin, adminSession }
  }

  test("a superadmin sees the app as the customer, in a session of its own", async () => {
    const { owner, admin, adminSession } = await setup()
    const started = await run((tx) => startImpersonation(tx, { id: admin.id, sessionId: adminSession.sessionId }, owner.id, "Reproduce a bug report", 15))
    assert.equal(Math.round((started.expiresAt.getTime() - Date.now()) / 60_000), 15)

    const viewed = (await getImpersonatedSession(db, started.token, admin.session.token))!
    assert.equal(viewed.user.id, owner.id)
    assert.equal(viewed.stepUpAt, null)
    assert.equal(viewed.impersonation?.admin.id, admin.id)
    assert.equal(viewed.impersonation?.reason, "Reproduce a bug report")
    // the staff member's own session is untouched
    assert.equal((await getSession(db, admin.session.token))?.user.id, admin.id)
    // the token alone isn't enough: it only works next to the session that started it
    assert.equal(await getImpersonatedSession(db, started.token, owner.session.token), null)
    assert.equal(await getImpersonatedSession(db, started.token, null), null)
  })

  test("only a superadmin, for at most 30 minutes, never as staff, themselves or a suspended account", async () => {
    const { owner, admin, adminSession } = await setup()
    const support = await account("helper", "support")
    const supportSession = (await getSession(db, support.session.token))!
    const as = (actor: { id: string }, sessionId: string, target: string, minutes?: unknown) =>
      run((tx) => startImpersonation(tx, { id: actor.id, sessionId }, target, "reason", minutes))

    await assert.rejects(as(support, supportSession.sessionId, owner.id), err("forbidden"))
    await assert.rejects(as(admin, adminSession.sessionId, owner.id, 31), err("invalid_input"))
    await assert.rejects(as(admin, adminSession.sessionId, owner.id, 0), err("invalid_input"))
    await assert.rejects(as(admin, adminSession.sessionId, admin.id), err("forbidden"))
    await assert.rejects(as(admin, adminSession.sessionId, support.id), err("forbidden"))
    await db.query("update app.users set suspended_at = now() where id = $1", [owner.id])
    await assert.rejects(as(admin, adminSession.sessionId, owner.id), err("forbidden"))
    await assert.rejects(
      db.query(
        "insert into app.impersonation_sessions (token_hash, admin_id, admin_session_id, target_user_id, reason, expires_at) values ('\\x00', $1, $2, $3, 'x', now() + interval '31 minutes')",
        [admin.id, adminSession.sessionId, support.id],
      ),
      "the database refuses longer views too",
    )
  })

  test("expires on time, and with the staff session or role", async () => {
    const { owner, admin, adminSession } = await setup()
    const start = () => run((tx) => startImpersonation(tx, { id: admin.id, sessionId: adminSession.sessionId }, owner.id, "reason"))

    const timed = await start()
    await age("impersonation_sessions", timed.id, 30)
    assert.equal(await getImpersonatedSession(db, timed.token, admin.session.token), null, "gone after 30 minutes")
    assert.equal((await getSession(db, admin.session.token))?.user.id, admin.id, "the staff session outlives it")

    const demoted = await start()
    await db.query("update app.users set platform_role = 'support' where id = $1", [admin.id])
    assert.equal(await getImpersonatedSession(db, demoted.token, admin.session.token), null)
    await db.query("update app.users set platform_role = 'superadmin' where id = $1", [admin.id])

    const replaced = await start()
    const next = await start()
    assert.equal(await getImpersonatedSession(db, replaced.token, admin.session.token), null, "starting another ends the first")
    await logout(db, admin.session.token)
    assert.equal(await getImpersonatedSession(db, next.token, admin.session.token), null, "signing out ends it")
  })

  test("ending it is audited, once, including after it ran out", async () => {
    const { owner, admin, adminSession } = await setup()
    const live = await run((tx) => startImpersonation(tx, { id: admin.id, sessionId: adminSession.sessionId }, owner.id, "reason"))
    assert.deepEqual(await endImpersonation(db, live.token, { ip: "203.0.113.9" }), { id: live.id, adminId: admin.id, targetUserId: owner.id, expired: false })
    assert.equal(await getImpersonatedSession(db, live.token, admin.session.token), null)
    assert.equal(await endImpersonation(db, live.token), null, "a second exit does nothing")

    const old = await run((tx) => startImpersonation(tx, { id: admin.id, sessionId: adminSession.sessionId }, owner.id, "reason"))
    await age("impersonation_sessions", old.id, 30)
    assert.equal((await endImpersonation(db, old.token))?.expired, true)
    assert.equal(await endImpersonation(db, "not-a-token"), null)

    const entries = await audit()
    assert.deepEqual(entries.map((e) => [e.action, e.actor_id, e.target_type, e.target_id]), [
      ["user.impersonate.end", admin.id, "user", owner.id],
      ["user.impersonate.end", admin.id, "user", owner.id],
    ])
    assert.deepEqual(entries.map((e) => e.after), [{ expired: false }, { expired: true }])
  })
})
