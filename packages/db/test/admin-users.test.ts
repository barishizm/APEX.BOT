import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { getSession, login, register, AuthError } from "../src/auth.ts"
import { ADMIN_USERS_LIST, AdminError, bootstrapSuperadmin, changePlatformRole } from "../src/admin.ts"
import { listPage } from "../src/admin-list.ts"
import {
  addUserNote,
  adminDeleteUser,
  adminResendVerification,
  adminResetTwoFactor,
  adminRevokeSessions,
  adminSendPasswordReset,
  adminSuspendUser,
  adminUnsuspendUser,
  adminVerifyEmail,
  getAdminUserDetail,
  type AdminActor,
} from "../src/admin-users.ts"

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
beforeEach(() => db.query("truncate app.users, app.organizations, app.auth_events, app.admin_audit_log cascade").then(() => {}))

const PASSWORD = "correct horse"
async function newUser(email: string, username: string) {
  const r = await register(db, { email, username, password: PASSWORD, accountType: "personal", acceptTerms: true })
  return { id: r.user.id, token: r.session.token }
}
async function staff() {
  const boss = await newUser("boss@example.com", "boss")
  await bootstrapSuperadmin(db, "boss@example.com")
  const help = await newUser("help@example.com", "help")
  await db.transaction((tx) => changePlatformRole(tx, boss.id, help.id, "support"))
  return { boss: { id: boss.id, role: "superadmin" } as AdminActor, support: { id: help.id, role: "support" } as AdminActor }
}
const code = (c: string) => (err: unknown) => (err instanceof AdminError || err instanceof AuthError) && err.code === c
const run = <T>(fn: (tx: Parameters<Parameters<Db["transaction"]>[0]>[0]) => Promise<T>) => db.transaction(fn)
const NOBODY = "00000000-0000-0000-0000-000000000000"

describe("who may act on whom", () => {
  test("nobody acts on themselves or a superadmin; only a superadmin acts on other staff", async () => {
    const { boss, support } = await staff()
    const jane = await newUser("jane@example.com", "jane")
    await assert.rejects(run((tx) => adminRevokeSessions(tx, boss, boss.id)), code("forbidden"))
    await assert.rejects(run((tx) => adminRevokeSessions(tx, support, boss.id)), code("forbidden"))
    await assert.rejects(run((tx) => adminRevokeSessions(tx, support, support.id)), code("forbidden"))
    await run((tx) => adminRevokeSessions(tx, boss, support.id))
    await run((tx) => adminRevokeSessions(tx, support, jane.id))
    await assert.rejects(run((tx) => adminRevokeSessions(tx, support, NOBODY)), code("not_found"))
    await assert.rejects(run((tx) => adminRevokeSessions(tx, support, "not-a-uuid")), code("not_found"))
  })

  test("only a superadmin changes roles, and never to or from superadmin", async () => {
    const { boss, support } = await staff()
    const jane = await newUser("jane@example.com", "jane")
    await assert.rejects(run((tx) => changePlatformRole(tx, support.id, jane.id, "support")), code("forbidden"))
    await assert.rejects(run((tx) => changePlatformRole(tx, boss.id, boss.id, null)), code("forbidden"))
    assert.deepEqual(await run((tx) => changePlatformRole(tx, boss.id, support.id, null)), { before: "support", after: null })
  })
})

describe("actions", () => {
  test("verifying the email by hand voids the code that was out", async () => {
    const { support } = await staff()
    const jane = await newUser("jane@example.com", "jane")
    const change = await run((tx) => adminVerifyEmail(tx, support, jane.id, { ip: "203.0.113.5" }))
    assert.deepEqual(change.before, { emailVerified: false })
    const { rows } = await db.query<{ verified: boolean; live: number }>(
      `select email_verified_at is not null as verified,
              (select count(*)::int from app.verification_codes where user_id = $1 and consumed_at is null) as live
         from app.users where id = $1`,
      [jane.id],
    )
    assert.deepEqual(rows[0], { verified: true, live: 0 })
    await assert.rejects(run((tx) => adminVerifyEmail(tx, support, jane.id)), code("invalid_input"))
    await assert.rejects(run((tx) => adminResendVerification(tx, support, jane.id)), code("invalid_input"))
  })

  test("a resent verification code and a reset code go to the account, not in the audit data", async () => {
    const { support } = await staff()
    const jane = await newUser("jane@example.com", "jane")
    await db.query("update app.verification_codes set created_at = now() - interval '1 minute' where user_id = $1", [jane.id])
    const resent = await run((tx) => adminResendVerification(tx, support, jane.id))
    assert.equal(resent.extra.email, "jane@example.com")
    assert.match(resent.extra.code, /^\d{6}$/)
    assert.equal(JSON.stringify([resent.before, resent.after]).includes(resent.extra.code), false)

    const reset = await run((tx) => adminSendPasswordReset(tx, support, jane.id))
    assert.match(reset.extra.code, /^\d{6}$/)
    assert.deepEqual(reset.after, { email: "jane@example.com" })
    // a second one within 30 seconds is refused, as on the forgot-password page
    await assert.rejects(run((tx) => adminSendPasswordReset(tx, support, jane.id)), code("too_many_attempts"))
  })

  test("resetting two-step sign-in clears the secret, recovery codes and open challenges", async () => {
    const { support } = await staff()
    const jane = await newUser("jane@example.com", "jane")
    await db.query("update app.users set totp_enabled_at = now(), totp_last_step = 1 where id = $1", [jane.id])
    await db.query("insert into app.recovery_codes (user_id, code_hash) values ($1, '\\x00'), ($1, '\\x01')", [jane.id])
    await db.query("insert into app.login_challenges (user_id, token_hash, persistent, expires_at) values ($1, '\\x02', false, now() + interval '5 minutes')", [jane.id])
    const change = await run((tx) => adminResetTwoFactor(tx, support, jane.id))
    assert.equal((change.before as { recoveryCodesLeft: number }).recoveryCodesLeft, 2)
    const { rows } = await db.query<Record<string, unknown>>(
      `select totp_secret, totp_enabled_at, totp_last_step,
              (select count(*)::int from app.recovery_codes where user_id = $1) as codes,
              (select count(*)::int from app.login_challenges where user_id = $1) as challenges
         from app.users where id = $1`,
      [jane.id],
    )
    assert.deepEqual(rows[0], { totp_secret: null, totp_enabled_at: null, totp_last_step: null, codes: 0, challenges: 0 })
    await assert.rejects(run((tx) => adminResetTwoFactor(tx, support, jane.id)), code("invalid_input"))
  })

  test("suspending ends every session at once and blocks log-in; lifting it lets them back", async () => {
    const { support } = await staff()
    const jane = await newUser("jane@example.com", "jane")
    await db.query("update app.users set email_verified_at = now() where id = $1", [jane.id])
    const change = await run((tx) => adminSuspendUser(tx, support, jane.id, "chargeback fraud"))
    assert.equal(change.extra.signedOut, 1)
    assert.equal(await getSession(db, jane.token), null)
    const { rows } = await db.query<{ n: number; reason: string }>(
      "select (select count(*)::int from app.sessions where user_id = $1) as n, suspended_reason as reason from app.users where id = $1",
      [jane.id],
    )
    assert.deepEqual(rows[0], { n: 0, reason: "chargeback fraud" })
    await assert.rejects(login(db, { email: "jane@example.com", password: PASSWORD }), code("account_suspended"))
    await assert.rejects(run((tx) => adminSuspendUser(tx, support, jane.id, "again")), code("invalid_input"))

    await run((tx) => adminUnsuspendUser(tx, support, jane.id))
    const back = await db.query<{ suspended_at: Date | null; suspended_reason: string | null }>("select suspended_at, suspended_reason from app.users where id = $1", [jane.id])
    assert.deepEqual(back.rows[0], { suspended_at: null, suspended_reason: null })
    await assert.rejects(run((tx) => adminUnsuspendUser(tx, support, jane.id)), code("invalid_input"))
  })

  test("deleting needs the email typed; solo workspaces go, shared ones pass to another member", async () => {
    const { support } = await staff()
    const jane = await newUser("jane@example.com", "jane")
    const bob = await newUser("bob@example.com", "bob")
    // bob joins jane's workspace
    const { rows: org } = await db.query<{ id: string }>("select organization_id as id from app.organization_members where user_id = $1", [jane.id])
    await db.query("insert into app.organization_members (organization_id, user_id, role) values ($1, $2, 'member')", [org[0]!.id, bob.id])

    const detail = await getAdminUserDetail(db, jane.id)
    assert.deepEqual(detail!.deletion.deleted, [])
    assert.equal(detail!.deletion.transferred.length, 1)
    assert.equal(detail!.deletion.transferred[0]!.newOwnerEmail, "bob@example.com")
    const bobDetail = await getAdminUserDetail(db, bob.id)
    assert.equal(bobDetail!.deletion.deleted.length, 1)

    await assert.rejects(run((tx) => adminDeleteUser(tx, support, jane.id, "wrong@example.com")), code("invalid_input"))
    const change = await run((tx) => adminDeleteUser(tx, support, jane.id, " JANE@example.com "))
    assert.equal((change.before as { transferredWorkspaces: unknown[] }).transferredWorkspaces.length, 1)
    assert.equal(await getAdminUserDetail(db, jane.id), null)
    const { rows } = await db.query<{ role: string }>("select role from app.organization_members where organization_id = $1", [org[0]!.id])
    assert.deepEqual(rows, [{ role: "owner" }])
  })
})

describe("detail", () => {
  test("shows sessions, events, notes and the audit history; unknown ids are null", async () => {
    const { boss } = await staff()
    const jane = await newUser("jane@example.com", "jane")
    await db.query("update app.sessions set ip = '198.51.100.7', user_agent = 'Firefox' where user_id = $1", [jane.id])
    await db.query("insert into app.oauth_accounts (provider, provider_account_id, user_id, email) values ('github', '42', $1, 'jane@gh.example')", [jane.id])
    const note = await run((tx) => addUserNote(tx, boss.id, jane.id, "  Called about billing  "))
    assert.equal(note.body, "Called about billing")
    assert.equal(note.authorName, "boss")
    await assert.rejects(run((tx) => addUserNote(tx, boss.id, jane.id, "   ")), code("invalid_input"))
    await assert.rejects(run((tx) => addUserNote(tx, boss.id, NOBODY, "x")), code("not_found"))
    await db.query("insert into app.admin_audit_log (actor_id, action, target_type, target_id, reason) values ($1, 'user.suspend', 'user', $2, 'test')", [boss.id, jane.id])

    const d = (await getAdminUserDetail(db, jane.id))!
    assert.equal(d.profile.email, "jane@example.com")
    assert.equal(d.profile.hasPassword, true)
    assert.equal(d.memberships.length, 1)
    assert.equal(d.memberships[0]!.role, "owner")
    assert.deepEqual(d.sessions.map((s) => [s.ip, s.userAgent]), [["198.51.100.7", "Firefox"]])
    assert.deepEqual(d.oauth.map((o) => o.provider), ["github"])
    assert.ok(d.events.some((e) => e.event === "register"))
    assert.equal(d.notes.length, 1)
    assert.deepEqual(d.audit.map((a) => [a.action, a.actorName]), [["user.suspend", "boss"]])
    assert.equal(await getAdminUserDetail(db, NOBODY), null)
    assert.equal(await getAdminUserDetail(db, "x'; drop table app.users; --"), null)
  })
})

describe("list filters", () => {
  test("verified, suspended, provider, account type and sign-up date", async () => {
    await staff()
    const jane = await newUser("jane@example.com", "jane")
    const old = await newUser("old@example.com", "old")
    await db.query("update app.users set email_verified_at = now(), account_type = 'business' where id = $1", [jane.id])
    await db.query("update app.users set created_at = now() - interval '2 years', suspended_at = now() where id = $1", [old.id])
    await db.query("insert into app.oauth_accounts (provider, provider_account_id, user_id) values ('google', 'g1', $1)", [jane.id])
    const emails = async (filters: Record<string, string>) =>
      (await listPage<{ email: string }>(db, ADMIN_USERS_LIST, { filters, sort: "email" })).rows.map((r) => r.email)

    assert.deepEqual(await emails({ verified: "yes" }), ["jane@example.com"])
    assert.deepEqual(await emails({ suspended: "yes" }), ["old@example.com"])
    assert.deepEqual(await emails({ provider: "google" }), ["jane@example.com"])
    assert.deepEqual(await emails({ provider: "github" }), [])
    assert.deepEqual(await emails({ accountType: "business" }), ["jane@example.com"])
    assert.deepEqual(await emails({ created: "older" }), ["old@example.com"])
    assert.deepEqual(await emails({ created: "7d", provider: "none", verified: "no" }), ["boss@example.com", "help@example.com"])
    await assert.rejects(listPage(db, ADMIN_USERS_LIST, { filters: { created: "1 day" } }), code("invalid_input"))
  })
})
