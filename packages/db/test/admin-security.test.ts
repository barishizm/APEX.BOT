import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { AuthError, login, oauthLogin, register, requestPasswordReset } from "../src/auth.ts"
import { AdminError, writeAudit } from "../src/admin.ts"
import { listPage } from "../src/admin-list.ts"
import {
  ADMIN_SECURITY_EVENTS_LIST,
  createAuthBlock,
  deviceLabel,
  liftAuthBlock,
  listStaffAccounts,
  parseBlockSubject,
  resetThrottle,
  securityOverview,
  type AuthEventRow,
} from "../src/admin-security.ts"
import { ADMIN_AUDIT_LIST, auditDiff, auditFacets, getAuditEntry, type AuditRow } from "../src/admin-audit.ts"

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
beforeEach(() =>
  db
    .query(
      "alter table app.admin_audit_log disable trigger user; truncate app.users, app.organizations, app.auth_events, app.auth_blocks, app.throttle_resets, app.admin_audit_log cascade; alter table app.admin_audit_log enable trigger user",
    )
    .then(() => {}),
)

const PASSWORD = "correct horse"
async function newUser(email: string, username: string, role: "superadmin" | "support" | null = null) {
  const { user } = await register(db, { email, username, password: PASSWORD, accountType: "personal", acceptTerms: true })
  if (role) await db.query("update app.users set platform_role = $1 where id = $2", [role, user.id])
  return user.id
}
const authCode = (c: AuthError["code"]) => (err: unknown) => err instanceof AuthError && err.code === c
const adminCode = (c: AdminError["code"]) => (err: unknown) => err instanceof AdminError && err.code === c
const block = (actor: string, kind: string, value: string, minutes = 60, ip: string | null = null) =>
  db.transaction((tx) => createAuthBlock(tx, { id: actor, ip }, { kind, value, minutes, reason: "abuse" }))
const fail = (email: string, ip: string) => login(db, { email, password: "wrong password" }, { ip }).catch(() => {})

describe("blocks", () => {
  test("a blocked address or network can't log in, and the refusal is logged", async () => {
    const boss = await newUser("boss@example.com", "boss", "superadmin")
    await newUser("jane@example.com", "jane")
    await block(boss, "ip", "203.0.113.7")
    await assert.rejects(login(db, { email: "jane@example.com", password: PASSWORD }, { ip: "203.0.113.7" }), authCode("too_many_attempts"))
    await login(db, { email: "jane@example.com", password: PASSWORD }, { ip: "203.0.113.8" })

    await block(boss, "ip", "198.51.100.99/24")
    await assert.rejects(login(db, { email: "jane@example.com", password: PASSWORD }, { ip: "198.51.100.3" }), authCode("too_many_attempts"))
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from app.auth_events where event = 'access_blocked'")
    assert.equal(rows[0]!.n, 2)
    // stored as the network
    const stored = await db.query<{ ip: string }>("select text(ip) as ip from app.auth_blocks where masklen(ip) = 24")
    assert.equal(stored.rows[0]!.ip, "198.51.100.0/24")
  })

  test("a blocked email can't log in, sign up, reset its password or use Google", async () => {
    const boss = await newUser("boss@example.com", "boss", "superadmin")
    await newUser("jane@example.com", "jane")
    await block(boss, "email", "Jane@Example.com")
    await block(boss, "email", "new@example.com")
    await assert.rejects(login(db, { email: "jane@example.com", password: PASSWORD }), authCode("too_many_attempts"))
    await assert.rejects(requestPasswordReset(db, "jane@example.com"), authCode("too_many_attempts"))
    await assert.rejects(
      register(db, { email: "new@example.com", username: "newbie", password: PASSWORD, accountType: "personal", acceptTerms: true }),
      authCode("too_many_attempts"),
    )
    await assert.rejects(
      oauthLogin(db, { provider: "google", providerAccountId: "g1", email: "jane@example.com", emailVerified: true }),
      authCode("too_many_attempts"),
    )
  })

  test("lifted and expired blocks stop applying", async () => {
    const boss = await newUser("boss@example.com", "boss", "superadmin")
    await newUser("jane@example.com", "jane")
    const { block: b } = await block(boss, "email", "jane@example.com")
    await liftAuthBlock(db, boss, b.id)
    await login(db, { email: "jane@example.com", password: PASSWORD })
    await assert.rejects(liftAuthBlock(db, boss, b.id), adminCode("not_found"))

    await block(boss, "email", "jane@example.com")
    await db.query("update app.auth_blocks set created_at = now() - interval '2 hours', expires_at = now() - interval '1 minute'")
    await login(db, { email: "jane@example.com", password: PASSWORD })
  })

  test("refuses the actor's own address, staff emails, wide networks and odd durations", async () => {
    const boss = await newUser("boss@example.com", "boss", "superadmin")
    await newUser("help@example.com", "help", "support")
    await assert.rejects(block(boss, "ip", "203.0.113.0/24", 60, "203.0.113.50"), adminCode("forbidden"))
    await assert.rejects(block(boss, "email", "help@example.com"), adminCode("forbidden"))
    await assert.rejects(block(boss, "ip", "10.0.0.0/8"), adminCode("invalid_input"))
    await assert.rejects(block(boss, "ip", "2001:db8::/16"), adminCode("invalid_input"))
    await assert.rejects(block(boss, "ip", "203.0.113.7", 61), adminCode("invalid_input"))
    assert.throws(() => parseBlockSubject("ip", "203.0.113.7/24/1"), adminCode("invalid_input"))
    assert.throws(() => parseBlockSubject("ip", "not an ip"), adminCode("invalid_input"))
    assert.deepEqual(parseBlockSubject("ip", " 2001:db8::/48 "), { kind: "ip", value: "2001:db8::/48" })
  })

  test("refuses an address or network staff signed in from in the last 30 days", async () => {
    const help = await newUser("help@example.com", "help", "support")
    await newUser("boss@example.com", "boss", "superadmin")
    await login(db, { email: "boss@example.com", password: PASSWORD }, { ip: "198.51.100.20" })
    await assert.rejects(block(help, "ip", "198.51.100.20"), adminCode("forbidden"))
    await assert.rejects(block(help, "ip", "198.51.100.0/24"), adminCode("forbidden"))
    await block(help, "ip", "198.51.101.0/24")
    // long ago no longer counts
    await db.query("update app.auth_events set created_at = now() - interval '31 days'")
    await block(help, "ip", "198.51.100.20")
  })
})

describe("throttle resets", () => {
  test("resetting an email lets its owner log in again; the failures stay in the log", async () => {
    const boss = await newUser("boss@example.com", "boss", "superadmin")
    await newUser("jane@example.com", "jane")
    for (let i = 0; i < 10; i++) await fail("jane@example.com", "192.0.2.1")
    await assert.rejects(login(db, { email: "jane@example.com", password: PASSWORD }, { ip: "192.0.2.1" }), authCode("too_many_attempts"))

    const reset = await resetThrottle(db, boss, "email", "jane@example.com")
    assert.deepEqual(reset, { kind: "email", value: "jane@example.com", cleared: 10 })
    await login(db, { email: "jane@example.com", password: PASSWORD }, { ip: "192.0.2.1" })
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from app.auth_events where event = 'login_failed'")
    assert.equal(rows[0]!.n, 10)
  })

  test("resetting an address clears its own lock", async () => {
    const boss = await newUser("boss@example.com", "boss", "superadmin")
    await newUser("jane@example.com", "jane")
    for (let i = 0; i < 50; i++) await fail(`guess${i}@example.com`, "192.0.2.9")
    await assert.rejects(login(db, { email: "jane@example.com", password: PASSWORD }, { ip: "192.0.2.9" }), authCode("too_many_attempts"))
    const reset = await resetThrottle(db, boss, "ip", "192.0.2.9")
    assert.equal(reset.cleared, 50)
    await login(db, { email: "jane@example.com", password: PASSWORD }, { ip: "192.0.2.9" })
    await assert.rejects(resetThrottle(db, boss, "ip", "192.0.2.0/24"), adminCode("invalid_input"))
  })

  // a reset lifts the limits on password and code guesses: never for a staff account
  test("refuses staff emails, and addresses staff signed in from lately", async () => {
    const boss = await newUser("boss@example.com", "boss", "superadmin")
    await newUser("help@example.com", "help", "support")
    for (const email of ["boss@example.com", "help@example.com"]) {
      await assert.rejects(resetThrottle(db, boss, "email", email), adminCode("forbidden"), email)
    }
    await login(db, { email: "help@example.com", password: PASSWORD }, { ip: "192.0.2.20" })
    await assert.rejects(resetThrottle(db, boss, "ip", "192.0.2.20"), adminCode("forbidden"))
    assert.equal((await resetThrottle(db, boss, "ip", "192.0.2.21")).cleared, 0, "other addresses still can")
  })
})

describe("overview", () => {
  test("groups failures by address and email, and flags locks and blocks", async () => {
    const boss = await newUser("boss@example.com", "boss", "superadmin")
    await newUser("jane@example.com", "jane")
    for (let i = 0; i < 10; i++) await fail("jane@example.com", "192.0.2.1")
    await fail("nobody@example.com", "192.0.2.1")
    await block(boss, "ip", "192.0.2.1")

    const o = await securityOverview(db)
    assert.equal(o.totals.loginFailed, 11)
    assert.equal(o.hourly.length, 24)
    assert.equal(o.hourly.reduce((n, h) => n + h.loginFailed, 0), 11)
    assert.deepEqual(
      o.failuresByIp.rows.map((r) => ({ ip: r.ip, failures: r.failures, emails: r.emails, locked: r.locked, blocked: r.blocked })),
      [{ ip: "192.0.2.1", failures: 11, emails: 2, locked: false, blocked: true }],
    )
    const jane = o.failuresByEmail.rows.find((r) => r.email === "jane@example.com")!
    assert.equal(jane.locked, true)
    assert.ok(jane.userId)
    assert.equal(o.failuresByEmail.rows.find((r) => r.email === "nobody@example.com")!.userId, null)
    assert.deepEqual(o.blocks.map((b) => ({ kind: b.kind, value: b.value })), [{ kind: "ip", value: "192.0.2.1" }])
  })

  test("finds password reset bursts", async () => {
    const jane = await newUser("jane@example.com", "jane")
    for (let i = 0; i < 5; i++) {
      await db.query("insert into app.auth_events (event, user_id, email, ip) values ('reset_requested', $1, 'jane@example.com', '192.0.2.4')", [jane])
    }
    const o = await securityOverview(db)
    assert.deepEqual(
      o.resetBursts.rows.map((r) => [r.kind, r.key, r.requests, !!r.userId]).sort(),
      [
        ["email", "jane@example.com", 5, true],
        ["ip", "192.0.2.4", 5, false],
      ],
    )
  })

  test("flags sign-ins from a new country or device, not an account's first", async () => {
    const jane = await newUser("jane@example.com", "jane")
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
    const macNewer = mac.replace("141.0", "142.0")
    const win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0"
    const signIn = (agent: string, country: string, ago: string) =>
      db.query(
        `insert into app.auth_events (event, user_id, email, user_agent, country, created_at)
         values ('login', $1, 'jane@example.com', $2, $3, now() - $4::interval)`,
        [jane, agent, country, ago],
      )
    await signIn(mac, "EE", "10 days")
    await signIn(macNewer, "EE", "3 hours")
    await signIn(win, "EE", "2 hours")
    await signIn(mac, "BR", "1 hour")
    const o = await securityOverview(db)
    assert.deepEqual(
      o.newSignIns.rows.map((r) => ({ device: r.device, country: r.country, newCountry: r.newCountry, newDevice: r.newDevice })),
      [
        { device: "Chrome · macOS", country: "BR", newCountry: true, newDevice: false },
        { device: "Firefox · Windows", country: "EE", newCountry: false, newDevice: true },
      ],
    )
  })

  test("device labels", () => {
    assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"), "Safari · iOS")
    assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0"), "Edge · Windows")
    assert.equal(deviceLabel("curl/8.7.1"), "Script · Other")
    assert.equal(deviceLabel(null), null)
  })

  test("lists staff with two-step sign-in, last login and last action", async () => {
    const boss = await newUser("boss@example.com", "boss", "superadmin")
    await newUser("help@example.com", "help", "support")
    await newUser("jane@example.com", "jane")
    await db.query("update app.users set totp_enabled_at = now() where id = $1", [boss])
    await writeAudit(db, { actorId: boss, action: "user.suspend", targetType: "user", targetId: "x" })
    const staff = await listStaffAccounts(db)
    assert.deepEqual(
      staff.map((s) => ({ email: s.email, role: s.role, twoFactor: s.twoFactor, lastAction: s.lastAction, sessions: s.sessions })),
      [
        { email: "boss@example.com", role: "superadmin", twoFactor: true, lastAction: "user.suspend", sessions: 1 },
        { email: "help@example.com", role: "support", twoFactor: false, lastAction: null, sessions: 1 },
      ],
    )
  })
})

describe("events feed", () => {
  test("filters by event, address, email and day", async () => {
    await newUser("jane@example.com", "jane")
    await fail("jane@example.com", "192.0.2.1")
    await fail("joe@example.com", "192.0.2.2")
    const page = (filters: Record<string, string>) =>
      listPage<AuthEventRow>(db, ADMIN_SECURITY_EVENTS_LIST, { filters }).then((p) => p.rows.map((r) => `${r.event}:${r.email}:${r.ip ?? ""}`))
    assert.deepEqual(await page({ event: "login_failed", ip: "192.0.2.1" }), ["login_failed:jane@example.com:192.0.2.1"])
    assert.deepEqual(await page({ event: "failures", email: "JOE@example.com" }), ["login_failed:joe@example.com:192.0.2.2"])
    assert.equal((await page({ event: "register" })).length, 1)
    const today = new Date().toISOString().slice(0, 10)
    assert.equal((await page({ from: today, to: today })).length, 4)
    assert.equal((await page({ to: "2000-01-01" })).length, 0)
    for (const bad of [{ ip: "1.2.3" }, { from: "yesterday" }, { user: "not-a-uuid" }, { event: "drop table" }]) {
      await assert.rejects(listPage(db, ADMIN_SECURITY_EVENTS_LIST, { filters: bad }), adminCode("invalid_input"), JSON.stringify(bad))
    }
  })
})

describe("audit log", () => {
  test("lists entries with their actor and target, filtered by actor, action and target", async () => {
    const boss = await newUser("boss@example.com", "boss", "superadmin")
    const jane = await newUser("jane@example.com", "jane")
    await writeAudit(db, { actorId: boss, action: "user.suspend", targetType: "user", targetId: jane, before: { suspended: false }, after: { suspended: true } })
    await writeAudit(db, { actorId: null, action: "user.platform_role.bootstrap", targetType: "user", targetId: boss })
    const page = (filters: Record<string, string>) => listPage<AuditRow>(db, ADMIN_AUDIT_LIST, { filters }).then((p) => p.rows)

    const [entry] = await page({ actor: boss })
    assert.equal(entry!.action, "user.suspend")
    assert.equal(entry!.actor_email, "boss@example.com")
    assert.equal(entry!.target_label, "jane@example.com")
    assert.deepEqual(entry!.after, { suspended: true })
    assert.equal((await page({ actorKind: "system" }))[0]!.action, "user.platform_role.bootstrap")
    assert.equal((await page({ action: "user.suspend", target: jane })).length, 1)
    assert.equal((await page({ targetType: "bot" })).length, 0)

    const facets = await auditFacets(db)
    assert.deepEqual(facets, {
      actors: [{ id: boss, label: "boss@example.com" }],
      actions: ["user.platform_role.bootstrap", "user.suspend"],
      targetTypes: ["user"],
    })
    const detail = await getAuditEntry(db, entry!.id)
    assert.equal(detail!.action, "user.suspend")
    assert.equal(await getAuditEntry(db, "1; drop table x"), null)
  })

  test("diffs before and after leaf by leaf", () => {
    assert.deepEqual(auditDiff({ plan: "free", limits: { pages: 50, bots: 1 }, note: "x" }, { plan: "pro", limits: { pages: 500, bots: 1 }, tags: ["a"] }), [
      { path: "limits.bots", kind: "same", before: 1, after: 1 },
      { path: "limits.pages", kind: "changed", before: 50, after: 500 },
      { path: "note", kind: "removed", before: "x" },
      { path: "plan", kind: "changed", before: "free", after: "pro" },
      { path: "tags", kind: "added", after: ["a"] },
    ])
    assert.deepEqual(auditDiff(null, { a: 1 }), [{ path: "a", kind: "added", after: 1 }])
    assert.deepEqual(auditDiff(null, null), [])
    assert.deepEqual(auditDiff("on", "off"), [{ path: "", kind: "changed", before: "on", after: "off" }])
  })
})
