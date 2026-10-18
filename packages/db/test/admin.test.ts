import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { getSession, register } from "../src/auth.ts"
import {
  AdminError,
  bootstrapSuperadmin,
  getPlatformRole,
  isPlatformAdmin,
  setPlatformRole,
  writeAudit,
} from "../src/admin.ts"

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
beforeEach(() => db.query("alter table app.admin_audit_log disable trigger user; truncate app.users, app.organizations, app.auth_events, app.admin_audit_log, app.platform_settings cascade; alter table app.admin_audit_log enable trigger user").then(() => {}))

async function newUser(email: string, username: string) {
  const { user } = await register(db, { email, username, password: "correct horse", accountType: "personal", acceptTerms: true })
  return user.id
}
const verify = (id: string) => db.query("update app.users set email_verified_at = now() where id = $1", [id])
const code = (c: AdminError["code"]) => (err: unknown) => err instanceof AdminError && err.code === c
const audit = () =>
  db.query<{ actor_id: string | null; action: string; target_type: string; target_id: string; before: unknown; after: unknown }>(
    "select actor_id, action, target_type, target_id, before, after from app.admin_audit_log order by id",
  ).then((r) => r.rows)

describe("schema", () => {
  test("new columns default to null and platform_role only takes known roles", async () => {
    const id = await newUser("jane@example.com", "jane")
    const { rows } = await db.query<Record<string, unknown>>(
      `select u.platform_role, u.suspended_at, u.suspended_reason, o.suspended_at as org_suspended_at, o.admin_note
         from app.users u join app.organization_members m on m.user_id = u.id join app.organizations o on o.id = m.organization_id
        where u.id = $1`,
      [id],
    )
    assert.deepEqual(rows[0], { platform_role: null, suspended_at: null, suspended_reason: null, org_suspended_at: null, admin_note: null })
    await assert.rejects(db.query("update app.users set platform_role = 'owner' where id = $1", [id]))
    await db.query("update app.users set platform_role = 'support' where id = $1", [id])
  })

  test("bots can be disabled with a reason", async () => {
    const cols = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'app' and table_name = 'bots' and column_name like 'disabled%' order by 1",
    )
    assert.deepEqual(cols.rows.map((r) => r.column_name), ["disabled_at", "disabled_reason"])
  })

  test("platform settings hold JSON values keyed by name", async () => {
    const id = await newUser("jane@example.com", "jane")
    await db.query("insert into app.platform_settings (key, value, updated_by) values ($1, $2::jsonb, $3)", ["flags.signups_open", "true", id])
    const { rows } = await db.query<{ value: unknown }>("select value from app.platform_settings where key = 'flags.signups_open'")
    assert.equal(rows[0]!.value, true)
    await assert.rejects(db.query("insert into app.platform_settings (key, value) values ('Bad Key', '1')"))
  })

  test("RLS is on for the new tables", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relnamespace = 'app'::regnamespace and relname in ('admin_audit_log', 'platform_settings') order by 1",
    )
    assert.deepEqual(rows, [
      { relname: "admin_audit_log", relrowsecurity: true },
      { relname: "platform_settings", relrowsecurity: true },
    ])
  })
})

describe("platform roles", () => {
  test("isPlatformAdmin is false for customers and suspended staff", async () => {
    const id = await newUser("jane@example.com", "jane")
    assert.equal(await isPlatformAdmin(db, id), false)
    await db.query("update app.users set platform_role = 'support' where id = $1", [id])
    assert.equal(await isPlatformAdmin(db, id), true)
    assert.equal(await isPlatformAdmin(db, id, "support"), true)
    assert.equal(await isPlatformAdmin(db, id, "superadmin"), false)
    await db.query("update app.users set suspended_at = now() where id = $1", [id])
    assert.equal(await getPlatformRole(db, id), null)
    assert.equal(await isPlatformAdmin(db, id), false)
    assert.equal(await isPlatformAdmin(db, "00000000-0000-0000-0000-000000000000"), false)
  })

  test("a superadmin can grant and take back support, and each change is audited", async () => {
    const boss = await newUser("boss@example.com", "boss")
    const jane = await newUser("jane@example.com", "jane")
    await verify(boss)
    await bootstrapSuperadmin(db, "boss@example.com")
    await setPlatformRole(db, { id: boss, ip: "203.0.113.5", userAgent: "test" }, jane, "support", "on-call")
    assert.equal(await getPlatformRole(db, jane), "support")
    await setPlatformRole(db, { id: boss }, jane, null)
    assert.equal(await getPlatformRole(db, jane), null)

    const log = await audit()
    assert.equal(log.length, 3)
    assert.deepEqual(log[1], {
      actor_id: boss,
      action: "user.platform_role",
      target_type: "user",
      target_id: jane,
      before: { platformRole: null },
      after: { platformRole: "support" },
    })
    const { rows } = await db.query<{ ip: string; reason: string }>("select host(ip) as ip, reason from app.admin_audit_log where id = (select min(id) + 1 from app.admin_audit_log)")
    assert.deepEqual(rows[0], { ip: "203.0.113.5", reason: "on-call" })
  })

  test("superadmin can't be granted or changed from the UI path, and only a superadmin may assign", async () => {
    const boss = await newUser("boss@example.com", "boss")
    const jane = await newUser("jane@example.com", "jane")
    await verify(boss)
    await bootstrapSuperadmin(db, "boss@example.com")
    await assert.rejects(setPlatformRole(db, { id: boss }, jane, "superadmin" as never), code("forbidden"))
    await assert.rejects(setPlatformRole(db, { id: boss }, boss, null), code("forbidden"))
    await setPlatformRole(db, { id: boss }, jane, "support")
    const bob = await newUser("bob@example.com", "bob")
    // support staff can't hand out roles
    await assert.rejects(setPlatformRole(db, { id: jane }, bob, "support"), code("forbidden"))
    await assert.rejects(setPlatformRole(db, { id: boss }, "00000000-0000-0000-0000-000000000000", "support"), code("not_found"))
    assert.equal(await getPlatformRole(db, boss), "superadmin")
    assert.equal(await getPlatformRole(db, bob), null)
  })
})

describe("session user", () => {
  test("carries the platform role; a suspended account has no session at all", async () => {
    const { user, session } = await register(db, { email: "boss@example.com", username: "boss", password: "correct horse", accountType: "personal", acceptTerms: true })
    assert.equal(user.platformRole, null)
    await verify(user.id)
    await bootstrapSuperadmin(db, "boss@example.com")
    assert.equal((await getSession(db, session!.token))?.user.platformRole, "superadmin")
    await db.query("update app.users set suspended_at = now() where id = $1", [user.id])
    assert.equal(await getSession(db, session!.token), null)
  })
})

describe("bootstrap", () => {
  test("makes the first superadmin once; reruns are harmless and other accounts are refused", async () => {
    const boss = await newUser("boss@example.com", "boss")
    await newUser("jane@example.com", "jane")
    await assert.rejects(bootstrapSuperadmin(db, "nobody@example.com"), code("not_found"))
    // whoever registered the address first isn't its owner until they prove it
    await assert.rejects(bootstrapSuperadmin(db, "boss@example.com"), code("forbidden"))
    await verify(boss)
    assert.deepEqual(await bootstrapSuperadmin(db, "  BOSS@example.com "), { userId: boss, created: true })
    assert.deepEqual(await bootstrapSuperadmin(db, "boss@example.com"), { userId: boss, created: false })
    await assert.rejects(bootstrapSuperadmin(db, "jane@example.com"), code("already_bootstrapped"))

    const log = await audit()
    assert.equal(log.length, 1)
    assert.equal(log[0]!.actor_id, null)
    assert.equal(log[0]!.action, "user.platform_role.bootstrap")
  })
})

describe("writeAudit", () => {
  test("stores the entry, drops invalid IPs and keeps it after the actor is deleted", async () => {
    const actor = await newUser("boss@example.com", "boss")
    const id = await writeAudit(db, {
      actorId: actor,
      action: "bot.disable",
      targetType: "bot",
      targetId: "b1",
      reason: "abuse",
      before: { disabledAt: null },
      after: { disabledAt: "2026-10-17" },
      ip: "not-an-ip",
      userAgent: "x".repeat(600),
    })
    assert.match(id, /^\d+$/)
    const row = async () =>
      (await db.query<{ actor_id: string | null; ip: string | null; ua: number; after: unknown }>(
        "select actor_id, ip, length(user_agent) as ua, after from app.admin_audit_log where id = $1",
        [id],
      )).rows[0]!
    assert.deepEqual(await row(), { actor_id: actor, ip: null, ua: 512, after: { disabledAt: "2026-10-17" } })

    // the entry keeps naming who acted, with the email they had
    await db.query("delete from app.users where id = $1", [actor])
    assert.equal((await row()).actor_id, actor)
    const kept = await db.query<{ actor_email: string }>("select actor_email from app.admin_audit_log where id = $1", [id])
    assert.equal(kept.rows[0]!.actor_email, "boss@example.com")
    await assert.rejects(writeAudit(db, { actorId: null, action: "", targetType: "bot" }), code("invalid_input"))
  })

  test("entries can't be changed, deleted or truncated", async () => {
    const id = await writeAudit(db, { actorId: null, action: "bot.disable", targetType: "bot", targetId: "b1" })
    await assert.rejects(db.query("update app.admin_audit_log set reason = 'edited' where id = $1", [id]), /append-only/)
    await assert.rejects(db.query("delete from app.admin_audit_log where id = $1", [id]), /append-only/)
    await assert.rejects(db.query("truncate app.admin_audit_log"), /append-only/)
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from app.admin_audit_log where id = $1 and reason is null", [id])
    assert.equal(rows[0]!.n, 1)
  })
})
