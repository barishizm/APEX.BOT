import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite, type Transaction } from "@electric-sql/pglite"
import type { Db, Queryable } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import {
  AuthError,
  CODE_FAIL_LIMIT,
  CODE_MAX_ATTEMPTS,
  getSession,
  issueEmailCode,
  login,
  logout,
  register,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
  type RegisterInput,
} from "../src/auth.ts"

// PGlite is real PostgreSQL compiled to WASM, with no Supabase roles or
// extensions: passing here shows the schema runs on a plain server.
function wrap(q: PGlite | Transaction): Queryable {
  return {
    async query<T>(text: string, params?: unknown[]) {
      // like pg, parameterless queries go through the simple protocol (multi-statement migrations)
      if (params?.length) return { rows: (await q.query<T>(text, params)).rows }
      const results = await q.exec(text)
      return { rows: (results.at(-1)?.rows ?? []) as T[] }
    },
  }
}

function pgliteDb(pg: PGlite): Db {
  return {
    ...wrap(pg),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
  }
}

let pg: PGlite
let db: Db

before(async () => {
  pg = new PGlite()
  db = pgliteDb(pg)
  assert.deepEqual(await migrate(db), ["0001_auth.sql", "0002_function_search_path.sql", "0003_bots.sql", "0004_knowledge.sql", "0005_bot_activity.sql", "0006_account.sql", "0007_conversations.sql", "0008_handoff_verification.sql", "0009_token_usage.sql", "0010_waitlist.sql", "0011_analytics.sql", "0012_knowledge_embeddings.sql", "0013_multi_site.sql", "0014_display_name.sql", "0015_message_topics.sql", "0016_conversation_context.sql", "0017_account_security.sql", "0018_totp_secret_sealed.sql", "0019_knowledge_files_refresh.sql", "0020_workspace_plan.sql", "0021_platform_admin.sql", "0022_admin_guards.sql"])
})
after(() => db.close())
beforeEach(async () => {
  await db.query("truncate app.users, app.organizations, app.auth_events cascade")
})

const meta = { ip: "203.0.113.7", userAgent: "test" }
const input = (over: Partial<RegisterInput> = {}): RegisterInput => ({
  email: "Jane@Example.com",
  username: "janedoe",
  password: "correct horse",
  accountType: "personal",
  acceptTerms: true,
  allowTraining: true,
  ...over,
})

async function rejects(p: Promise<unknown>, code: string) {
  await assert.rejects(p, (err) => err instanceof AuthError && err.code === code)
}

describe("migrations", () => {
  test("re-running applies nothing", async () => {
    assert.deepEqual(await migrate(db), [])
  })

  test("RLS is on for every app table", async () => {
    const { rows } = await db.query<{ relname: string }>(
      "select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app' and c.relkind = 'r' and not c.relrowsecurity",
    )
    assert.deepEqual(rows, [])
  })
})

describe("register", () => {
  test("creates user, owner workspace, verification code and session", async () => {
    const { user, session, code } = await register(db, input(), meta)
    assert.equal(user.email, "jane@example.com")
    assert.equal(user.emailVerified, false)
    assert.match(code, /^\d{6}$/)
    assert.equal(session.persistent, true)

    const s = await getSession(db, session.token)
    assert.equal(s?.user.id, user.id)

    const { rows } = await db.query<{ name: string; role: string }>(
      "select o.name, m.role from app.organizations o join app.organization_members m on m.organization_id = o.id where m.user_id = $1",
      [user.id],
    )
    assert.deepEqual(rows, [{ name: "janedoe", role: "owner" }])
  })

  test("business account stores company name and size", async () => {
    const { user } = await register(db, input({ accountType: "business", company: "Acme Inc", companySize: "51-200" }))
    const { rows } = await db.query(
      "select o.name, o.size from app.organizations o join app.organization_members m on m.organization_id = o.id where m.user_id = $1",
      [user.id],
    )
    assert.deepEqual(rows, [{ name: "Acme Inc", size: "51-200" }])
  })

  test("password is stored hashed", async () => {
    const { user } = await register(db, input())
    const { rows } = await db.query<{ password_hash: string }>("select password_hash from app.users where id = $1", [user.id])
    assert.match(rows[0].password_hash, /^scrypt\$15\$8\$1\$/)
    assert.ok(!rows[0].password_hash.includes("correct horse"))
  })

  test("email and username are unique, case-insensitively", async () => {
    await register(db, input())
    await rejects(register(db, input({ username: "other" , email: "JANE@example.com" })), "email_taken")
    await rejects(register(db, input({ email: "x@example.com", username: "JaneDoe" })), "username_taken")
    // the failed attempts left nothing behind
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from app.organizations")
    assert.equal(rows[0].n, 1)
  })

  test("validates input", async () => {
    await rejects(register(db, input({ email: "nope" })), "invalid_input")
    await rejects(register(db, input({ password: "short" })), "invalid_input")
    await rejects(register(db, input({ username: "a b" })), "invalid_input")
    await rejects(register(db, input({ acceptTerms: false })), "invalid_input")
    await rejects(register(db, input({ accountType: "business", companySize: "huge" })), "invalid_input")
  })
})

describe("login", () => {
  test("right password signs in; remember controls persistence", async () => {
    await register(db, input())
    const short = await login(db, { email: " JANE@example.com ", password: "correct horse" }, meta)
    assert.equal(short.session!.persistent, false)
    const long = await login(db, { email: "jane@example.com", password: "correct horse", remember: true }, meta)
    assert.equal(long.session!.persistent, true)
    assert.equal((await getSession(db, long.session!.token))?.user.username, "janedoe")
  })

  test("wrong password and unknown email fail the same way", async () => {
    await register(db, input())
    await rejects(login(db, { email: "jane@example.com", password: "wrong pass" }), "invalid_credentials")
    await rejects(login(db, { email: "ghost@example.com", password: "whatever1" }), "invalid_credentials")
  })

  test("throttles after repeated failures for one email", async () => {
    await register(db, input())
    for (let i = 0; i < 10; i++) {
      await rejects(login(db, { email: "jane@example.com", password: "wrong pass" }, meta), "invalid_credentials")
    }
    await rejects(login(db, { email: "jane@example.com", password: "correct horse" }, meta), "too_many_attempts")
  })

  test("a stranger's failures from another address don't lock the owner out", async () => {
    await register(db, input())
    const attacker = { ip: "198.51.100.77" }
    for (let i = 0; i < 10; i++) {
      await rejects(login(db, { email: "jane@example.com", password: "wrong pass" }, attacker), "invalid_credentials")
    }
    await rejects(login(db, { email: "jane@example.com", password: "wrong pass" }, attacker), "too_many_attempts")
    const owner = await login(db, { email: "jane@example.com", password: "correct horse" }, { ip: "203.0.113.5" })
    assert.equal(owner.user.username, "janedoe")
  })

  test("a taken username is reported the same whether or not the email is taken", async () => {
    await register(db, input())
    await rejects(register(db, input({ email: "fresh@example.com" })), "username_taken")
    await rejects(register(db, input()), "username_taken")
  })
})

describe("sessions", () => {
  test("logout revokes the token", async () => {
    const { session } = await register(db, input())
    await logout(db, session.token, meta)
    assert.equal(await getSession(db, session.token), null)
  })

  test("expired and unknown tokens resolve to null", async () => {
    const { session } = await register(db, input())
    await db.query("update app.sessions set expires_at = now() - interval '1 second'")
    assert.equal(await getSession(db, session.token), null)
    assert.equal(await getSession(db, "made-up"), null)
    assert.equal(await getSession(db, undefined), null)
  })
})

describe("email verification", () => {
  const backdateCodes = () => db.query("update app.verification_codes set created_at = created_at - interval '1 minute'")

  test("correct code verifies; it can't be reused", async () => {
    const { user, code } = await register(db, input())
    const verified = await verifyEmail(db, user.id, code, meta)
    assert.equal(verified.emailVerified, true)
    await rejects(verifyEmail(db, user.id, code), "invalid_code")
    await rejects(issueEmailCode(db, user.id), "already_verified")
  })

  test("wrong codes count, and lock the code after the limit", async () => {
    const { user, code } = await register(db, input())
    const wrong = code === "000000" ? "111111" : "000000"
    for (let i = 0; i < CODE_MAX_ATTEMPTS; i++) await rejects(verifyEmail(db, user.id, wrong), "invalid_code")
    await rejects(verifyEmail(db, user.id, code), "too_many_attempts")
  })

  test("wrong password-reset codes are counted across resends, not per code", async () => {
    const { user, code } = await register(db, input())
    await verifyEmail(db, user.id, code)
    const email = "jane@example.com"
    const reset = { email, password: "another horse 99" }
    let issued = (await requestPasswordReset(db, email))!
    const wrong = issued.code === "000000" ? "111111" : "000000"
    for (let i = 0; i < CODE_FAIL_LIMIT.max; i++) {
      // a fresh code (fresh per-code counter) every round, as an attacker would request
      await rejects(resetPassword(db, { ...reset, code: wrong }), "invalid_code")
      if (i % 2 === 1 && i < CODE_FAIL_LIMIT.max - 1) {
        await backdateCodes()
        issued = (await requestPasswordReset(db, email))!
      }
    }
    await backdateCodes()
    issued = (await requestPasswordReset(db, email))!
    await rejects(resetPassword(db, { ...reset, code: issued.code }), "too_many_attempts")
  })

  test("expired code is rejected", async () => {
    const { user, code } = await register(db, input())
    await db.query("update app.verification_codes set expires_at = now() - interval '1 second'")
    await rejects(verifyEmail(db, user.id, code), "code_expired")
  })

  test("resend is rate limited and replaces the old code", async () => {
    const { user, code: first } = await register(db, input())
    await rejects(issueEmailCode(db, user.id), "too_many_attempts")
    await backdateCodes()
    const { code: second } = await issueEmailCode(db, user.id)
    if (first !== second) await rejects(verifyEmail(db, user.id, first), "invalid_code")
    assert.equal((await verifyEmail(db, user.id, second)).emailVerified, true)
  })

  test("resend is capped per account per hour", async () => {
    const { user } = await register(db, input())
    for (let i = 0; i < 4; i++) {
      await backdateCodes()
      await issueEmailCode(db, user.id, {}, { ip: `198.51.100.${i + 1}` })
    }
    await backdateCodes()
    await rejects(issueEmailCode(db, user.id, {}, { ip: "198.51.100.99" }), "too_many_attempts")
  })

  test("signups are capped per IP per hour", async () => {
    for (let i = 0; i < 5; i++) await register(db, input({ email: `u${i}@example.com`, username: `user${i}` }), meta)
    await rejects(register(db, input({ email: "u9@example.com", username: "user9" }), meta), "too_many_attempts")
    await register(db, input({ email: "other@example.com", username: "other" }), { ip: "203.0.113.8" })
  })

  test("correcting the address before verification updates the account", async () => {
    const { user } = await register(db, input())
    await backdateCodes()
    const { code, email } = await issueEmailCode(db, user.id, { email: "Jane.Fixed@Example.com" })
    assert.equal(email, "jane.fixed@example.com")
    const verified = await verifyEmail(db, user.id, code)
    assert.equal(verified.email, "jane.fixed@example.com")
    // log-in now uses the corrected address
    await login(db, { email: "jane.fixed@example.com", password: "correct horse" })
  })

  test("can't move to an address another account uses", async () => {
    await register(db, input({ email: "taken@example.com", username: "first" }))
    const { user } = await register(db, input())
    await backdateCodes()
    await rejects(issueEmailCode(db, user.id, { email: "taken@example.com" }), "email_taken")
  })
})

test("the apps know every migration, and can tell what a database is missing", async () => {
  const { readdir } = await import("node:fs/promises")
  const { MIGRATIONS_DIR } = await import("../src/migrate.ts")
  const { MIGRATION_NAMES, missingMigrations } = await import("../src/schema-version.ts")
  assert.deepEqual([...MIGRATION_NAMES], (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort())
  assert.deepEqual(await missingMigrations(db), [])
  const empty = pgliteDb(new PGlite())
  assert.deepEqual(await missingMigrations(empty), [...MIGRATION_NAMES])
  await empty.close()
})
