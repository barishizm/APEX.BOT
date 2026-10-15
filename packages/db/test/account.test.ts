import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import {
  AuthError,
  changePassword,
  deleteAccount,
  getAccount,
  getSession,
  login,
  oauthLogin,
  register,
  requestPasswordReset,
  resetPassword,
  revokeOtherSessions,
  updateProfile,
} from "../src/auth.ts"
import { getBotForUser } from "../src/bots.ts"

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

const PASSWORD = "correct horse"
async function newUser(email = "jane@example.com", username = "jane") {
  return register(db, { email, username, password: PASSWORD, accountType: "personal", acceptTerms: true })
}
const code = (c: AuthError["code"]) => (err: unknown) => err instanceof AuthError && err.code === c
// Codes are rate limited per account; tests move the last one back in time instead of sleeping
const ageCodes = () => db.query("update app.verification_codes set created_at = created_at - interval '1 minute'")

describe("password reset", () => {
  test("an emailed code sets a new password, verifies the email and signs out other devices", async () => {
    const { user, session: old } = await newUser()
    assert.equal(await requestPasswordReset(db, "nobody@example.com"), null)
    const sent = await requestPasswordReset(db, "  JANE@example.com ")
    assert.equal(sent?.email, "jane@example.com")
    await assert.rejects(requestPasswordReset(db, "jane@example.com"), code("too_many_attempts"))

    await assert.rejects(resetPassword(db, { email: "jane@example.com", code: "000000", password: "new password" }), code("invalid_code"))
    const { user: after, session } = await resetPassword(db, { email: "jane@example.com", code: sent!.code, password: "new password" })
    assert.equal(after.id, user.id)
    assert.equal(after.emailVerified, true)
    assert.equal(await getSession(db, old.token), null)
    assert.ok(await getSession(db, session.token))
    await assert.rejects(login(db, { email: "jane@example.com", password: PASSWORD }), code("invalid_credentials"))
    assert.ok(await login(db, { email: "jane@example.com", password: "new password" }))
    // single use
    await assert.rejects(resetPassword(db, { email: "jane@example.com", code: sent!.code, password: "another one" }), code("invalid_code"))
  })

  test("wrong codes lock the code after the limit; expired codes are refused", async () => {
    await newUser()
    const sent = await requestPasswordReset(db, "jane@example.com")
    for (let i = 0; i < 5; i++) {
      await assert.rejects(resetPassword(db, { email: "jane@example.com", code: "111111", password: "new password" }), code("invalid_code"))
    }
    await assert.rejects(resetPassword(db, { email: "jane@example.com", code: sent!.code, password: "new password" }), code("too_many_attempts"))

    await ageCodes()
    const fresh = await requestPasswordReset(db, "jane@example.com")
    await db.query("update app.verification_codes set expires_at = now() - interval '1 second' where purpose = 'password_reset' and consumed_at is null")
    await assert.rejects(resetPassword(db, { email: "jane@example.com", code: fresh!.code, password: "new password" }), code("code_expired"))
  })

  test("validates the new password before touching anything", async () => {
    await newUser()
    const sent = await requestPasswordReset(db, "jane@example.com")
    await assert.rejects(resetPassword(db, { email: "jane@example.com", code: sent!.code, password: "short" }), code("invalid_input"))
    // the code still works afterwards
    assert.ok(await resetPassword(db, { email: "jane@example.com", code: sent!.code, password: "long enough" }))
  })

  test("a reset code doesn't verify an email-verification flow and vice versa", async () => {
    const { code: verifyCode } = await newUser()
    await assert.rejects(resetPassword(db, { email: "jane@example.com", code: verifyCode, password: "new password" }), code("invalid_code"))
  })
})

describe("account settings", () => {
  test("change password needs the current one and signs out other devices", async () => {
    const { user, session } = await newUser()
    const me = (await getSession(db, session.token))!
    const other = await login(db, { email: "jane@example.com", password: PASSWORD })
    assert.equal((await getAccount(db, user.id, me.sessionId)).otherSessions, 1)

    await assert.rejects(changePassword(db, user.id, { current: "wrong", next: "brand new pw" }, me.sessionId), code("invalid_credentials"))
    await assert.rejects(changePassword(db, user.id, { current: PASSWORD, next: PASSWORD }, me.sessionId), code("invalid_input"))
    assert.deepEqual(await changePassword(db, user.id, { current: PASSWORD, next: "brand new pw" }, me.sessionId), { signedOut: 1 })
    assert.equal(await getSession(db, other.session.token), null)
    assert.ok(await getSession(db, session.token))
    assert.ok(await login(db, { email: "jane@example.com", password: "brand new pw" }))
  })

  test("Google/GitHub-only accounts can set a password without a current one", async () => {
    const { user, session } = await oauthLogin(db, { provider: "github", providerAccountId: "42", email: "oauth@example.com", emailVerified: true, username: "octo" })
    const me = (await getSession(db, session.token))!
    const account = await getAccount(db, user.id, me.sessionId)
    assert.equal(account.hasPassword, false)
    assert.deepEqual(account.providers, ["github"])
    await changePassword(db, user.id, { next: "first password" }, me.sessionId)
    assert.equal((await getAccount(db, user.id, me.sessionId)).hasPassword, true)
  })

  test("profile updates validate and keep usernames unique", async () => {
    const { user } = await newUser()
    await newUser("bob@example.com", "bob")
    assert.equal((await updateProfile(db, user.id, { username: "jane.doe" })).username, "jane.doe")
    await assert.rejects(updateProfile(db, user.id, { username: "BOB" }), code("username_taken"))
    await assert.rejects(updateProfile(db, user.id, { username: "x" }), code("invalid_input"))
    await assert.rejects(updateProfile(db, user.id, {}), code("invalid_input"))
    await updateProfile(db, user.id, { allowTraining: true })
    const { rows } = await db.query<{ allow_training: boolean }>("select allow_training from app.users where id = $1", [user.id])
    assert.equal(rows[0].allow_training, true)
  })

  test("revoking other sessions keeps this one", async () => {
    const { user, session } = await newUser()
    const me = (await getSession(db, session.token))!
    const a = await login(db, { email: "jane@example.com", password: PASSWORD })
    const b = await login(db, { email: "jane@example.com", password: PASSWORD })
    assert.equal(await revokeOtherSessions(db, user.id, me.sessionId), 2)
    assert.equal(await getSession(db, a.session.token), null)
    assert.equal(await getSession(db, b.session.token), null)
    assert.ok(await getSession(db, session.token))
  })

  test("deleting an account removes its own workspace and bot, but not shared ones", async () => {
    const { user } = await newUser()
    const { user: bob } = await newUser("bob@example.com", "bob")
    const janeBot = await getBotForUser(db, user.id)
    const bobBot = await getBotForUser(db, bob.id)
    // jane is also a member of bob's workspace
    await db.query("insert into app.organization_members (organization_id, user_id, role) values ($1, $2, 'admin')", [bobBot.organizationId, user.id])

    await assert.rejects(deleteAccount(db, user.id, "someone@else.com"), code("invalid_input"))
    await deleteAccount(db, user.id, " JANE@example.com ")
    const users = await db.query<{ email: string }>("select email from app.users")
    assert.deepEqual(users.rows.map((r) => r.email), ["bob@example.com"])
    const bots = await db.query<{ id: string }>("select id from app.bots")
    assert.deepEqual(bots.rows.map((r) => r.id), [bobBot.id])
    assert.notEqual(janeBot.id, bobBot.id)
    const events = await db.query<{ event: string; user_id: string | null }>("select event, user_id from app.auth_events where event = 'account_deleted'")
    assert.deepEqual(events.rows, [{ event: "account_deleted", user_id: null }])
  })
})
