import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { register } from "../src/auth.ts"
import { AdminError, ADMIN_USERS_LIST, type AdminUserRow } from "../src/admin.ts"
import { listAll, listPage, type ListParams } from "../src/admin-list.ts"

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

async function newUser(email: string, username: string) {
  const { user } = await register(db, { email, username, password: "correct horse", accountType: "personal", acceptTerms: true })
  return user.id
}

/** Walks every page and returns the emails in order. */
async function walk(params: ListParams) {
  const emails: string[] = []
  let cursor: string | null = null
  for (let i = 0; i < 50; i++) {
    const page: { rows: AdminUserRow[]; nextCursor: string | null } = await listPage<AdminUserRow>(db, ADMIN_USERS_LIST, { ...params, cursor })
    emails.push(...page.rows.map((r) => r.email))
    if (!page.nextCursor) return emails
    cursor = page.nextCursor
  }
  throw new Error("never reached the last page")
}

const invalid = (err: unknown) => err instanceof AdminError && err.code === "invalid_input"

describe("admin lists", () => {
  test("pages through every row exactly once, even when sort values tie", async () => {
    for (let i = 0; i < 7; i++) await newUser(`user${i}@example.com`, `user${i}`)
    // identical timestamps down to the microsecond: only the id tiebreaker separates them
    await db.query("update app.users set created_at = '2026-01-01 10:00:00.123456+00' where email in ('user1@example.com', 'user2@example.com', 'user3@example.com')")

    for (const dir of ["asc", "desc"] as const) {
      const emails = await walk({ sort: "created", dir, limit: 2 })
      assert.equal(emails.length, 7)
      assert.equal(new Set(emails).size, 7)
    }
    assert.deepEqual(await walk({ sort: "email", dir: "asc", limit: 3 }), [0, 1, 2, 3, 4, 5, 6].map((i) => `user${i}@example.com`))
  })

  test("the last page has no cursor", async () => {
    await newUser("a@example.com", "aaa")
    await newUser("b@example.com", "bbb")
    const page = await listPage(db, ADMIN_USERS_LIST, { limit: 2 })
    assert.equal(page.rows.length, 2)
    assert.equal(page.nextCursor, null)
    assert.ok(!("__sort" in page.rows[0]!) && !("__id" in page.rows[0]!))
  })

  test("searches case-insensitively and treats wildcards literally", async () => {
    await newUser("ayse@example.com", "ayse_k")
    await newUser("mehmet@example.com", "mehmet")
    assert.deepEqual(await walk({ q: "AYSE" }), ["ayse@example.com"])
    assert.deepEqual(await walk({ q: "_k" }), ["ayse@example.com"])
    assert.deepEqual(await walk({ q: "%" }), [])
  })

  test("filters only on whitelisted values", async () => {
    const staff = await newUser("staff@example.com", "staff")
    await newUser("customer@example.com", "customer")
    await db.query("update app.users set platform_role = 'support' where id = $1", [staff])
    assert.deepEqual(await walk({ filters: { role: "staff" } }), ["staff@example.com"])
    assert.deepEqual(await walk({ filters: { role: "none", status: "" } }), ["customer@example.com"])
    await assert.rejects(listPage(db, ADMIN_USERS_LIST, { filters: { role: "1=1" } }), invalid)
    await assert.rejects(listPage(db, ADMIN_USERS_LIST, { filters: { nope: "staff" } }), invalid)
    for (const key of ["constructor", "__proto__", "toString"]) {
      await assert.rejects(listPage(db, ADMIN_USERS_LIST, { filters: { [key]: "x" } }), invalid, `filter ${key}`)
      await assert.rejects(listPage(db, ADMIN_USERS_LIST, { filters: { role: key } }), invalid, `filter value ${key}`)
      await assert.rejects(listPage(db, ADMIN_USERS_LIST, { sort: key }), invalid, `sort ${key}`)
    }
  })

  test("rejects unknown sorts and cursors from another sort order", async () => {
    for (let i = 0; i < 3; i++) await newUser(`u${i}@example.com`, `user${i}`)
    await assert.rejects(listPage(db, ADMIN_USERS_LIST, { sort: "password_hash" }), invalid)
    await assert.rejects(listPage(db, ADMIN_USERS_LIST, { dir: "sideways" }), invalid)
    await assert.rejects(listPage(db, ADMIN_USERS_LIST, { cursor: "not-a-cursor" }), invalid)
    const { nextCursor } = await listPage(db, ADMIN_USERS_LIST, { sort: "email", limit: 1 })
    await assert.rejects(listPage(db, ADMIN_USERS_LIST, { sort: "created", cursor: nextCursor }), invalid)
  })

  test("sorts nullable columns through coalesce", async () => {
    await newUser("never@example.com", "never")
    await newUser("recent@example.com", "recent")
    await db.query("update app.users set last_login_at = now() where email = 'recent@example.com'")
    await db.query("update app.users set last_login_at = null where email = 'never@example.com'")
    assert.deepEqual(await walk({ sort: "lastLogin", dir: "desc", limit: 1 }), ["recent@example.com", "never@example.com"])
  })

  test("exports every matching row up to the cap", async () => {
    for (let i = 0; i < 4; i++) await newUser(`e${i}@example.com`, `user${i}`)
    const all = await listAll<AdminUserRow>(db, ADMIN_USERS_LIST, { sort: "email", dir: "asc" })
    assert.equal(all.rows.length, 4)
    assert.equal(all.truncated, false)
    assert.equal(all.rows[0]!.workspaces, 1)
    const capped = await listAll(db, ADMIN_USERS_LIST, {}, 3)
    assert.equal(capped.rows.length, 3)
    assert.equal(capped.truncated, true)
  })
})
