import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { createDb, sslModeFor, type Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { AuthError, getSession, login, register, verifyEmail } from "../src/auth.ts"
import { getBotForUser } from "../src/bots.ts"
import { loadEmbeddings, saveEmbeddings } from "../src/knowledge.ts"

// The production path: node-postgres over TCP, against a Postgres wire-protocol server.
let server: PGLiteSocketServer
let pg: PGlite
let db: Db

before(async () => {
  pg = new PGlite()
  server = new PGLiteSocketServer({ db: pg, port: 0, host: "127.0.0.1" })
  await server.start()
  const port = new URL(`postgres://${server.getServerConn()}`).port
  // PGlite is a single session, so one pooled connection keeps transactions isolated
  db = createDb(`postgresql://postgres@127.0.0.1:${port}/postgres?sslmode=require`, { max: 1 })
})

after(async () => {
  await db.close()
  await server.stop()
  await pg.close()
})

test("migrations and the auth flow work through pg", async () => {
  assert.deepEqual(await migrate(db), ["0001_auth.sql", "0002_function_search_path.sql", "0003_bots.sql", "0004_knowledge.sql", "0005_bot_activity.sql", "0006_account.sql", "0007_conversations.sql", "0008_handoff_verification.sql", "0009_token_usage.sql", "0010_waitlist.sql", "0011_analytics.sql", "0012_knowledge_embeddings.sql", "0013_multi_site.sql", "0014_display_name.sql", "0015_message_topics.sql", "0016_conversation_context.sql", "0017_account_security.sql", "0018_totp_secret_sealed.sql", "0019_knowledge_files_refresh.sql", "0020_workspace_plan.sql", "0021_platform_admin.sql", "0022_admin_guards.sql", "0023_admin_overview.sql", "0024_admin_users.sql", "0025_admin_bots.sql", "0026_job_runs.sql", "0027_support_access.sql", "0028_token_usage_split.sql", "0029_security_audit.sql", "0030_support_tickets.sql", "0031_platform_controls.sql", "0032_email_failures.sql"])
  assert.deepEqual(await migrate(db), [])

  const input = { email: "a@example.com", username: "alice", password: "password1", accountType: "personal", acceptTerms: true }
  const { user, code } = await register(db, input, { ip: "::1" })
  await assert.rejects(register(db, { ...input, username: "alice2" }), (e) => e instanceof AuthError && e.code === "email_taken")
  assert.equal((await verifyEmail(db, user.id, code)).emailVerified, true)

  const { session } = await login(db, { email: "a@example.com", password: "password1" })
  assert.equal((await getSession(db, session!.token))?.user.emailVerified, true)

  // bytea comes back from pg as a Buffer, which may share a pooled ArrayBuffer at any offset
  const bot = await getBotForUser(db, user.id)
  const hash = new Uint8Array(32).fill(7)
  await saveEmbeddings(db, bot.id, "gemini:test@3", [{ hash, vector: new Uint8Array(Float32Array.from([0.6, 0, 0.8]).buffer) }])
  const [row] = await loadEmbeddings(db, bot.id, "gemini:test@3", [hash])
  const v = new Float32Array(row.vector.buffer.slice(row.vector.byteOffset, row.vector.byteOffset + row.vector.byteLength))
  assert.deepEqual([...v].map((x) => Math.round(x * 10) / 10), [0.6, 0, 0.8])
})

test("ssl defaults: off for localhost, on for anything else", () => {
  assert.equal(sslModeFor("postgresql://u@localhost:5432/db"), "off")
  assert.equal(sslModeFor("postgresql://u:p@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"), "require")
})
