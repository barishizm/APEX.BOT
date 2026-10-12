import { after, before, beforeEach, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { AuthError, getSession, login, oauthLogin, register } from "../src/auth.ts"

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
  assert.equal((await getSession(db, session.token))?.user.id, user.id)
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
