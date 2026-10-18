import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import {
  AuthError,
  beginTwoFactorSetup,
  completeTwoFactorLogin,
  enableTwoFactor,
  getSession,
  hasRecentStepUp,
  login,
  oauthLogin,
  register,
  STEP_UP_TTL_MS,
  stepUpSession,
  verifyEmail,
} from "../src/auth.ts"
import { totpCode, totpStep } from "../src/crypto.ts"
import { hitRateLimit } from "../src/rate-limit.ts"

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
beforeEach(() => db.query("truncate app.users, app.organizations, app.auth_events, app.rate_limits cascade").then(() => {}))

const PASSWORD = "correct horse"
const code = (c: AuthError["code"]) => (err: unknown) => err instanceof AuthError && err.code === c
const appCode = (secret: string, offset = 0) => totpCode(secret, totpStep() + offset)
const suspend = (id: string) => db.query("update app.users set suspended_at = now(), suspended_reason = 'spam' where id = $1", [id])

async function verifiedUser(email = "jane@example.com", username = "jane") {
  const { user, session, code: emailCode } = await register(db, { email, username, password: PASSWORD, accountType: "personal", acceptTerms: true })
  await verifyEmail(db, user.id, emailCode)
  return { user, session }
}

async function withTwoFactor() {
  const { user, session } = await verifiedUser()
  const { secret } = await beginTwoFactorSetup(db, user.id)
  await enableTwoFactor(db, user.id, appCode(secret, -1))
  return { user, session, secret }
}

describe("suspended accounts", () => {
  test("their sessions stop working at once", async () => {
    const { user, session } = await verifiedUser()
    assert.ok(await getSession(db, session.token))
    await suspend(user.id)
    assert.equal(await getSession(db, session.token), null)
  })

  test("log-in says so, but only with the right password", async () => {
    const { user } = await verifiedUser()
    await suspend(user.id)
    await assert.rejects(login(db, { email: "jane@example.com", password: "wrong one!" }), code("invalid_credentials"))
    await assert.rejects(login(db, { email: "jane@example.com", password: PASSWORD }), code("account_suspended"))
  })

  test("Google/GitHub sign-in is refused too", async () => {
    const { user } = await verifiedUser()
    await suspend(user.id)
    const profile = { provider: "google" as const, providerAccountId: "g-1", email: "jane@example.com", emailVerified: true }
    await assert.rejects(oauthLogin(db, profile), code("account_suspended"))
  })

  test("suspended between password and authenticator code gets no session", async () => {
    const { user, secret } = await withTwoFactor()
    const { challenge } = await login(db, { email: "jane@example.com", password: PASSWORD })
    await suspend(user.id)
    await assert.rejects(completeTwoFactorLogin(db, challenge!.token, appCode(secret)), code("account_suspended"))
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from app.sessions where user_id = $1", [user.id])
    // only the session from registering, which getSession no longer accepts
    assert.equal(rows[0].n, 1)
  })
})

describe("step-up", () => {
  test("a fresh session has none; an authenticator code gives ten minutes", async () => {
    const { user, session, secret } = await withTwoFactor()
    const s = (await getSession(db, session.token))!
    assert.equal(s.stepUpAt, null)
    assert.equal(hasRecentStepUp(s), false)

    await stepUpSession(db, user.id, s.sessionId, appCode(secret))
    const after = (await getSession(db, session.token))!
    assert.ok(hasRecentStepUp(after))
    assert.equal(hasRecentStepUp(after, after.stepUpAt!.getTime() + STEP_UP_TTL_MS + 1), false)
  })

  test("wrong codes, reused codes and recovery codes don't count", async () => {
    const { user, session, secret } = await withTwoFactor()
    const { sessionId } = (await getSession(db, session.token))!
    await assert.rejects(stepUpSession(db, user.id, sessionId, "000000"), code("invalid_code"))
    await assert.rejects(stepUpSession(db, user.id, sessionId, "ABCDE-FGHIJ"), code("invalid_input"))
    await stepUpSession(db, user.id, sessionId, appCode(secret))
    await assert.rejects(stepUpSession(db, user.id, sessionId, appCode(secret)), code("invalid_code"))
  })

  test("only for the caller's own session", async () => {
    const { user, secret } = await withTwoFactor()
    const other = await verifiedUser("john@example.com", "john")
    const { sessionId } = (await getSession(db, other.session.token))!
    await assert.rejects(stepUpSession(db, user.id, sessionId, appCode(secret)), code("unauthorized"))
  })

  test("signing in with a recovery code doesn't count as one", async () => {
    const { user, secret } = await verifiedUser().then(async ({ user }) => {
      const { secret } = await beginTwoFactorSetup(db, user.id)
      return { user, secret }
    })
    const { recoveryCodes } = await enableTwoFactor(db, user.id, appCode(secret, -1))
    const { challenge } = await login(db, { email: "jane@example.com", password: PASSWORD })
    const { session, usedRecoveryCode } = await completeTwoFactorLogin(db, challenge!.token, recoveryCodes[0])
    assert.equal(usedRecoveryCode, true)
    assert.equal(hasRecentStepUp((await getSession(db, session.token))!), false)
  })

  test("signing in with an authenticator code counts as one", async () => {
    const { secret } = await withTwoFactor()
    const { challenge } = await login(db, { email: "jane@example.com", password: PASSWORD })
    const { session } = await completeTwoFactorLogin(db, challenge!.token, appCode(secret))
    assert.ok(hasRecentStepUp((await getSession(db, session.token))!))
  })
})

describe("rate limits", () => {
  test("allow `max` hits per window, then say how long to wait", async () => {
    const limit = { max: 3, windowSeconds: 60 }
    for (let i = 0; i < 3; i++) assert.equal(await hitRateLimit(db, "admin:user:a", limit), null)
    const over = await hitRateLimit(db, "admin:user:a", limit)
    assert.ok(over && over.retryAfterSeconds >= 1 && over.retryAfterSeconds <= 60)
    // other keys are counted apart
    assert.equal(await hitRateLimit(db, "admin:user:b", limit), null)
  })

  test("old windows are cleared", async () => {
    await db.query("insert into app.rate_limits (key, window_start, hits) values ('k', now() - interval '1 hour', 99)")
    assert.equal(await hitRateLimit(db, "k", { max: 1, windowSeconds: 60 }), null)
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from app.rate_limits where key = 'k'")
    assert.equal(rows[0].n, 1)
  })
})
