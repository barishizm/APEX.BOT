import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db, Queryable } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { AuthError, register } from "../src/auth.ts"
import { AdminError } from "../src/admin.ts"
import { listPage } from "../src/admin-list.ts"
import { getBotForUser } from "../src/bots.ts"
import { inviteMember } from "../src/team.ts"
import {
  cachedRead,
  clearSettingsCache,
  featureEnabled,
  flagEnabled,
  platformSettings,
  readPlatformSettings,
  setFeatureFlag,
  setSignupsMode,
  settingsOverview,
} from "../src/platform-settings.ts"
import {
  ADMIN_WAITLIST_LIST,
  deleteFromWaitlist,
  inviteFromWaitlist,
  isWaitlistInvited,
  joinWaitlist,
  signupAllowed,
  waitlistCounts,
  type AdminWaitlistRow,
} from "../src/waitlist.ts"
import {
  announcementText,
  announcementsFor,
  cleanAnnouncement,
  createAnnouncement,
  deleteAnnouncement,
  endAnnouncement,
  listAnnouncements,
  liveAnnouncements,
  marketingAnnouncements,
  updateAnnouncement,
} from "../src/announcements.ts"

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
beforeEach(async () => {
  await db.query("truncate app.users, app.organizations, app.platform_settings, app.waitlist, app.announcements cascade")
  clearSettingsCache()
})

const run = <T>(fn: (tx: Queryable) => Promise<T>) => db.transaction(fn)
const err = (c: string) => (e: unknown) => (e instanceof AdminError || e instanceof AuthError) && e.code === c

async function account(slug: string) {
  const r = await register(db, { email: `${slug}@${slug}.example`, username: slug, password: "correct horse", accountType: "business", company: slug, acceptTerms: true })
  await db.query("update app.users set email_verified_at = now(), platform_role = 'superadmin' where id = $1", [r.user.id])
  const bot = await getBotForUser(db, r.user.id)
  return { id: r.user.id, organizationId: bot.organizationId }
}

describe("the settings cache", () => {
  test("a read is kept for the TTL, shared while in flight, and dropped when it fails", async () => {
    let loads = 0
    const q = {} as Queryable
    const load = async () => ++loads
    assert.equal(await cachedRead(q, "x", load, 30_000, 1000), 1)
    assert.equal(await cachedRead(q, "x", load, 30_000, 30_999), 1)
    assert.equal(await cachedRead(q, "x", load, 30_000, 31_000), 2)

    let fail = true
    const flaky = async () => {
      if (fail) throw new Error("down")
      return "ok"
    }
    await assert.rejects(cachedRead(q, "y", flaky, 30_000, 0))
    fail = false
    assert.equal(await cachedRead(q, "y", flaky, 30_000, 1), "ok")
  })

  test("platformSettings is cached until cleared", async () => {
    const admin = await account("ayar")
    assert.equal((await platformSettings(db)).signupsMode, null)
    await run((tx) => setSignupsMode(tx, admin.id, "closed"))
    assert.equal((await platformSettings(db)).signupsMode, null, "still the cached value")
    clearSettingsCache()
    assert.equal((await platformSettings(db)).signupsMode, "closed")
  })
})

describe("sign-up mode", () => {
  test("is stored, refuses junk and no-op changes", async () => {
    const admin = await account("mod")
    const change = await run((tx) => setSignupsMode(tx, admin.id, "invite_only"))
    assert.deepEqual(change.before, { signupsMode: null })
    assert.deepEqual(change.after, { signupsMode: "invite_only" })
    assert.equal((await readPlatformSettings(db)).signupsMode, "invite_only")
    await assert.rejects(run((tx) => setSignupsMode(tx, admin.id, "invite_only")), err("invalid_input"))
    await assert.rejects(run((tx) => setSignupsMode(tx, admin.id, "sometimes")), err("invalid_input"))
    const overview = await settingsOverview(db)
    assert.equal(overview.signupsMode, "invite_only")
    assert.ok(overview.signupsUpdatedAt instanceof Date)
  })

  test("a malformed stored value counts as unset", async () => {
    await db.query("insert into app.platform_settings (key, value) values ('signups_mode', '\"maybe\"')")
    assert.equal((await readPlatformSettings(db)).signupsMode, null)
  })

  test("who may sign up in each mode", async () => {
    const owner = await account("davet")
    await joinWaitlist(db, "Invited@Example.com", "tr")
    await joinWaitlist(db, "waiting@example.com")
    const { rows } = await db.query<{ id: string }>("select id from app.waitlist where email = 'invited@example.com'")
    await run((tx) => inviteFromWaitlist(tx, owner.id, [rows[0]!.id]))
    const { token } = await inviteMember(db, owner.id, { email: "teammate@example.com", role: "member" })

    const allowed = (mode: "open" | "invite_only" | "closed", email: string, inviteToken?: string) => signupAllowed(db, mode, { email, inviteToken })
    assert.equal(await allowed("open", "anyone@example.com"), true)

    assert.equal(await allowed("invite_only", "INVITED@example.com"), true)
    assert.equal(await allowed("invite_only", "waiting@example.com"), false)
    assert.equal(await allowed("invite_only", "anyone@example.com"), false)
    assert.equal(await allowed("invite_only", "teammate@example.com", token), true)
    assert.equal(await allowed("invite_only", "anyone@example.com", token), false)

    assert.equal(await allowed("closed", "invited@example.com"), false)
    assert.equal(await allowed("closed", "teammate@example.com", token), true)
    assert.equal(await allowed("closed", "not an email"), false)
  })
})

describe("feature flags", () => {
  test("defaults, the global switch and workspace settings", async () => {
    const admin = await account("bayrak")
    const other = await account("diger")
    assert.equal(await featureEnabled(db, "hybrid_search"), true)

    await run((tx) => setFeatureFlag(tx, admin.id, "hybrid_search", { enabled: false }))
    await run((tx) => setFeatureFlag(tx, admin.id, "hybrid_search", { enabled: true, organizationId: other.organizationId.toUpperCase() }))
    let settings = await readPlatformSettings(db)
    assert.equal(flagEnabled(settings, "hybrid_search"), false)
    assert.equal(flagEnabled(settings, "hybrid_search", admin.organizationId), false)
    assert.equal(flagEnabled(settings, "hybrid_search", other.organizationId), true)
    assert.equal(flagEnabled(settings, "file_uploads", other.organizationId), true)

    // back to following the global switch
    const change = await run((tx) => setFeatureFlag(tx, admin.id, "hybrid_search", { enabled: null, organizationId: other.organizationId }))
    assert.deepEqual(change.before, { flag: "hybrid_search", enabled: false, workspaces: { [other.organizationId]: true } })
    assert.deepEqual(change.after, { flag: "hybrid_search", enabled: false, workspaces: {} })
    settings = await readPlatformSettings(db)
    assert.equal(flagEnabled(settings, "hybrid_search", other.organizationId), false)

    await assert.rejects(run((tx) => setFeatureFlag(tx, admin.id, "hybrid_search", { enabled: false })), err("invalid_input"))
    await assert.rejects(run((tx) => setFeatureFlag(tx, admin.id, "teleport", { enabled: true })), err("invalid_input"))
    await assert.rejects(run((tx) => setFeatureFlag(tx, admin.id, "file_uploads", { enabled: "yes" })), err("invalid_input"))
    await assert.rejects(
      run((tx) => setFeatureFlag(tx, admin.id, "file_uploads", { enabled: false, organizationId: "00000000-0000-0000-0000-000000000000" })),
      err("not_found"),
    )
    await assert.rejects(run((tx) => setFeatureFlag(tx, admin.id, "file_uploads", { enabled: null, organizationId: other.organizationId })), err("invalid_input"))
  })

  test("the overview names the workspaces with their own setting", async () => {
    const admin = await account("ozet")
    await run((tx) => setFeatureFlag(tx, admin.id, "file_uploads", { enabled: false, organizationId: admin.organizationId }))
    const { flags } = await settingsOverview(db)
    const uploads = flags.find((f) => f.flag === "file_uploads")!
    assert.equal(uploads.enabled, true)
    assert.equal(uploads.stored, true)
    assert.deepEqual(uploads.workspaces, [{ organizationId: admin.organizationId, name: "ozet", plan: "free", enabled: false }])
    assert.equal(flags.find((f) => f.flag === "hybrid_search")!.stored, false)
  })
})

describe("the waitlist", () => {
  test("stores an email once, lowercased, and rejects junk", async () => {
    await joinWaitlist(db, " Jane@Example.com ", "tr")
    await joinWaitlist(db, "jane@example.com")
    const { rows } = await db.query<{ email: string; locale: string }>("select email, locale from app.waitlist")
    assert.deepEqual(rows, [{ email: "jane@example.com", locale: "tr" }])
    await assert.rejects(joinWaitlist(db, "nope"), err("invalid_input"))
  })

  test("lists, filters, invites and deletes", async () => {
    const admin = await account("liste")
    await joinWaitlist(db, "a@example.com", "tr")
    await joinWaitlist(db, "b@example.com", "xx")
    // already has an account
    await joinWaitlist(db, "liste@liste.example")
    const page = await listPage<AdminWaitlistRow>(db, ADMIN_WAITLIST_LIST, { sort: "email", dir: "asc" })
    assert.deepEqual(page.rows.map((r) => [r.email, r.signed_up]), [["a@example.com", false], ["b@example.com", false], ["liste@liste.example", true]])
    const ids = Object.fromEntries(page.rows.map((r) => [r.email, r.id]))

    const invited = await run((tx) => inviteFromWaitlist(tx, admin.id, Object.values(ids)))
    // the existing account is skipped; an unknown language falls back to English
    assert.deepEqual(invited.extra.invites.sort((x, y) => x.email.localeCompare(y.email)), [
      { email: "a@example.com", locale: "tr" },
      { email: "b@example.com", locale: "en" },
    ])
    assert.equal(invited.extra.skipped, 1)
    assert.equal(await isWaitlistInvited(db, "A@example.com"), true)
    assert.equal(await isWaitlistInvited(db, "liste@liste.example"), false)

    const again = await run((tx) => inviteFromWaitlist(tx, admin.id, [ids["a@example.com"]]))
    assert.deepEqual(again.before, { reinvited: 1 })
    const { rows } = await db.query<{ invite_count: number }>("select invite_count from app.waitlist where email = 'a@example.com'")
    assert.equal(rows[0]!.invite_count, 2)

    assert.deepEqual(
      (await listPage<AdminWaitlistRow>(db, ADMIN_WAITLIST_LIST, { filters: { invited: "no" } })).rows.map((r) => r.email),
      ["liste@liste.example"],
    )
    assert.deepEqual((await listPage<AdminWaitlistRow>(db, ADMIN_WAITLIST_LIST, { q: "b@" })).rows.map((r) => r.email), ["b@example.com"])
    assert.deepEqual(await waitlistCounts(db), { total: 3, invited: 2, signedUp: 1 })

    await assert.rejects(run((tx) => inviteFromWaitlist(tx, admin.id, [ids["liste@liste.example"]])), err("invalid_input"))
    await assert.rejects(run((tx) => inviteFromWaitlist(tx, admin.id, [])), err("invalid_input"))
    await assert.rejects(run((tx) => inviteFromWaitlist(tx, admin.id, ["' or 1=1 --"])), err("invalid_input"))

    const deleted = await run((tx) => deleteFromWaitlist(tx, [ids["a@example.com"], ids["b@example.com"]]))
    assert.equal(deleted.extra.deleted, 2)
    assert.deepEqual(await waitlistCounts(db), { total: 1, invited: 0, signedUp: 1 })
    await assert.rejects(run((tx) => deleteFromWaitlist(tx, [ids["a@example.com"]])), err("not_found"))
  })
})

describe("announcements", () => {
  const base = { level: "warn", message: { en: "  Maintenance tonight\n at 22:00 ", tr: "Bu gece 22:00'de bakım" }, audience: "all" }

  test("validation", async () => {
    const admin = await account("dogrula")
    const now = new Date("2026-10-18T12:00:00Z")
    const clean = await cleanAnnouncement(db, base, now)
    assert.deepEqual(clean.message, { en: "Maintenance tonight at 22:00", tr: "Bu gece 22:00'de bakım" })
    assert.equal(clean.startsAt, now)
    assert.equal(clean.dismissible, true)

    const bad: Record<string, unknown>[] = [
      { ...base, level: "panic" },
      { ...base, message: { tr: "yalnızca Türkçe" } },
      { ...base, message: { en: "x".repeat(501) } },
      { ...base, startsAt: "2026-10-18T12:00:00Z", endsAt: "2026-10-18T11:00:00Z" },
      { ...base, startsAt: "not a date" },
      { ...base, audience: "plan", plans: [] },
      { ...base, audience: "plan", plans: ["gold"] },
      { ...base, audience: "workspace", organizationIds: [] },
      { ...base, audience: "workspace", organizationIds: ["00000000-0000-0000-0000-000000000000"] },
      { ...base, audience: "plan", plans: ["pro"], marketing: true },
    ]
    for (const input of bad) await assert.rejects(cleanAnnouncement(db, input), err("invalid_input"), JSON.stringify(input))
    const ws = await cleanAnnouncement(db, { ...base, audience: "workspace", organizationIds: [admin.organizationId, admin.organizationId.toUpperCase()] })
    assert.deepEqual(ws.organizationIds, [admin.organizationId])
  })

  test("targeting, the time window, the website and ordering", async () => {
    const admin = await account("hedef")
    const other = await account("baska")
    const hour = 3_600_000
    const now = Date.now()
    const create = (raw: Record<string, unknown>) => run((tx) => createAnnouncement(tx, admin.id, raw)).then((c) => c.extra.announcement)

    const everyone = await create({ ...base, level: "info", marketing: true })
    const pro = await create({ ...base, level: "critical", audience: "plan", plans: ["pro"] })
    const mine = await create({ ...base, audience: "workspace", organizationIds: [admin.organizationId] })
    const later = await create({ ...base, startsAt: new Date(now + hour).toISOString() })
    const past = await create({ ...base, startsAt: new Date(now - 2 * hour).toISOString(), endsAt: new Date(now - hour).toISOString() })

    // the ones without a start began when they were created, after `now`
    const at = Date.now()
    const live = await liveAnnouncements(db)
    assert.ok(!live.some((a) => a.id === past.id), "ended ones aren't loaded")
    assert.ok(live.some((a) => a.id === later.id), "scheduled ones are, for when they start")

    const ids = (list: { id: string }[]) => list.map((a) => a.id)
    assert.deepEqual(ids(announcementsFor(live, { organizationId: admin.organizationId, plan: "free" }, at)), [mine.id, everyone.id])
    assert.deepEqual(ids(announcementsFor(live, { organizationId: other.organizationId, plan: "pro" }, at)), [pro.id, everyone.id])
    assert.deepEqual(ids(marketingAnnouncements(live, at)), [everyone.id])
    // the scheduled one shows up from the same cached list once its time comes
    assert.ok(ids(announcementsFor(live, { organizationId: other.organizationId, plan: "free" }, now + 2 * hour)).includes(later.id))

    assert.equal(announcementText(everyone, "tr"), "Bu gece 22:00'de bakım")
    assert.equal(announcementText(everyone, "lv"), "Maintenance tonight at 22:00")
  })

  test("update, end and delete", async () => {
    const admin = await account("degistir")
    const created = (await run((tx) => createAnnouncement(tx, admin.id, base))).extra.announcement
    const updated = await run((tx) => updateAnnouncement(tx, created.id, { ...base, level: "critical", dismissible: false }))
    assert.equal(updated.extra.announcement.level, "critical")
    assert.equal(updated.extra.announcement.dismissible, false)
    assert.equal(updated.extra.announcement.startsAt.getTime(), created.startsAt.getTime(), "the start stays")

    await run((tx) => endAnnouncement(tx, created.id))
    assert.equal((await listAnnouncements(db))[0]!.endsAt !== null, true)
    await assert.rejects(run((tx) => endAnnouncement(tx, created.id)), err("invalid_input"))

    const scheduled = (await run((tx) => createAnnouncement(tx, admin.id, { ...base, startsAt: new Date(Date.now() + 3_600_000).toISOString() }))).extra.announcement
    await assert.rejects(run((tx) => endAnnouncement(tx, scheduled.id)), err("invalid_input"))
    await run((tx) => deleteAnnouncement(tx, scheduled.id))
    await assert.rejects(run((tx) => deleteAnnouncement(tx, scheduled.id)), err("not_found"))
    await assert.rejects(run((tx) => deleteAnnouncement(tx, "nope")), err("not_found"))
    assert.equal((await listAnnouncements(db)).length, 1)
  })
})
