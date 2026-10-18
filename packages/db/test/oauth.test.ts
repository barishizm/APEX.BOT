import { after, before, beforeEach, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import {
  AuthError,
  beginTwoFactorSetup,
  enableTwoFactor,
  getSession,
  login,
  oauthLogin,
  register,
  requestPasswordReset,
  resetPassword,
} from "../src/auth.ts"
import { adminVerifyEmail } from "../src/admin-users.ts"
import { totpCode, totpStep } from "../src/crypto.ts"

// a fixed test key; production reads its own from the environment
process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")

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

const google = (over = {}) => ({
  provider: "google" as const,
  providerAccountId: "g-1",
  email: "Jane@Example.com",
  emailVerified: true,
  username: "Jane Doe!",
  ...over,
})

test("new identity creates a verified account with a workspace", async () => {
  const { user, session, isNew } = await oauthLogin(db, google())
  assert.equal(isNew, true)
  assert.equal(user.email, "jane@example.com")
  assert.equal(user.username, "JaneDoe")
  assert.equal(user.emailVerified, true)
  assert.equal((await getSession(db, session!.token))?.user.id, user.id)
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from app.organization_members where user_id = $1", [user.id])
  assert.equal(rows[0].n, 1)
})

test("same identity signs in again, even if the provider email changed", async () => {
  const first = await oauthLogin(db, google())
  const again = await oauthLogin(db, google({ email: "new@example.com" }))
  assert.equal(again.isNew, false)
  assert.equal(again.user.id, first.user.id)
})

test("unverified provider email is refused", async () => {
  await assert.rejects(oauthLogin(db, google({ emailVerified: false })), (e) => e instanceof AuthError && e.code === "invalid_input")
})

test("links to a verified password account with the same email", async () => {
  const { user, code } = await register(db, { email: "jane@example.com", username: "jane", password: "correct horse", accountType: "personal", acceptTerms: true })
  const { verifyEmail } = await import("../src/auth.ts")
  await verifyEmail(db, user.id, code)
  const out = await oauthLogin(db, google({ provider: "github", providerAccountId: "gh-9" }))
  assert.equal(out.isNew, false)
  assert.equal(out.user.id, user.id)
  await login(db, { email: "jane@example.com", password: "correct horse" }) // password still works
})

test("taking over an unverified account drops the squatter's password and sessions", async () => {
  const squat = await register(db, { email: "jane@example.com", username: "squatter", password: "attacker pass", accountType: "personal", acceptTerms: true })
  const out = await oauthLogin(db, google())
  assert.equal(out.user.id, squat.user.id)
  assert.equal(out.user.emailVerified, true)
  assert.equal(await getSession(db, squat.session.token), null)
  await assert.rejects(login(db, { email: "jane@example.com", password: "attacker pass" }), (e) => e instanceof AuthError && e.code === "invalid_credentials")
})

test("username collisions get a numeric suffix", async () => {
  await register(db, { email: "x@example.com", username: "JaneDoe", password: "correct horse", accountType: "personal", acceptTerms: true })
  const { user } = await oauthLogin(db, google())
  assert.match(user.username, /^JaneDoe\d{4}$/)
})

test("OAuth-only accounts can't log in with a password", async () => {
  await oauthLogin(db, google())
  await assert.rejects(login(db, { email: "jane@example.com", password: "anything1" }), (e) => e instanceof AuthError && e.code === "invalid_credentials")
})

test("the provider's name becomes the display name, and fills one in for older accounts", async () => {
  const { user } = await oauthLogin(db, google({ displayName: "  Jane   Doe " }))
  assert.equal(user.displayName, "Jane Doe")

  await db.query("update app.users set display_name = null where id = $1", [user.id])
  assert.equal((await oauthLogin(db, google({ displayName: "Jane Doe" }))).user.displayName, "Jane Doe")
})

test("a display name the user chose survives later sign-ins", async () => {
  const { user } = await oauthLogin(db, google({ displayName: "Jane Doe" }))
  await db.query("update app.users set display_name = 'JD' where id = $1", [user.id])
  assert.equal((await oauthLogin(db, google({ displayName: "Jane Doe" }))).user.displayName, "JD")
})

// Staff may mark an address verified on someone's word (/admin/users). That proves nothing about the
// inbox, so a squatter who talked support into it must still lose the account to its owner.
async function staffVerifiedSquatter() {
  const staff = await register(db, { email: "help@apex.example", username: "help", password: "correct horse", accountType: "personal", acceptTerms: true })
  await db.query("update app.users set email_verified_at = now(), platform_role = 'support' where id = $1", [staff.user.id])
  const squat = await register(db, { email: "jane@example.com", username: "squatter", password: "attacker pass", accountType: "personal", acceptTerms: true })
  await db.transaction((tx) => adminVerifyEmail(tx, { id: staff.user.id, role: "support" }, squat.user.id))
  const { secret } = await beginTwoFactorSetup(db, squat.user.id)
  await enableTwoFactor(db, squat.user.id, totpCode(secret, totpStep()))
  return squat
}

const twoFactor = async (id: string) =>
  (await db.query<{ on: boolean }>("select totp_enabled_at is not null as on from app.users where id = $1", [id])).rows[0]!.on

test("an address staff verified by hand is still taken over by its owner signing in with Google", async () => {
  const squat = await staffVerifiedSquatter()
  const out = await oauthLogin(db, google())
  assert.equal(out.user.id, squat.user.id)
  assert.ok(out.session, "no authenticator code asked: the squatter's is gone")
  assert.equal(await twoFactor(squat.user.id), false)
  assert.equal(await getSession(db, squat.session.token), null)
  await assert.rejects(login(db, { email: "jane@example.com", password: "attacker pass" }), (e) => e instanceof AuthError && e.code === "invalid_credentials")
})

test("a reset code proves the inbox too: the owner gets in without the squatter's authenticator, and stays", async () => {
  const squat = await staffVerifiedSquatter()
  const sent = (await requestPasswordReset(db, "jane@example.com"))!
  const reset = await resetPassword(db, { email: "jane@example.com", code: sent.code, password: "owner pass 1" })
  assert.ok(reset.session, "signed straight in")
  assert.equal(await twoFactor(squat.user.id), false)
  // proven now: a later provider sign-in links, and the owner's own password keeps working
  await oauthLogin(db, google())
  await login(db, { email: "jane@example.com", password: "owner pass 1" })
})
