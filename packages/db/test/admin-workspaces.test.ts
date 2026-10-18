import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import { AuthError, register } from "../src/auth.ts"
import { AdminError, writeAudit } from "../src/admin.ts"
import { listPage } from "../src/admin-list.ts"
import { createBot, getBotForUser, listBotIds, listBotsChangedSince, membership } from "../src/bots.ts"
import { acceptInvitation, getInvitation, getTeam, inviteMember } from "../src/team.ts"
import {
  ADMIN_WORKSPACES_LIST,
  PLAN_AUDIT_ACTION,
  adminChangeMemberRole,
  adminDeleteWorkspace,
  adminRemoveMember,
  adminResendInvite,
  adminRevokeInvite,
  adminSetPlan,
  adminSetWorkspaceNote,
  adminSuspendWorkspace,
  adminTransferOwnership,
  adminUnsuspendWorkspace,
  assertMayChangeWorkspace,
  getAdminWorkspaceDetail,
  planLimitChanges,
  type AdminWorkspaceRow,
} from "../src/admin-workspaces.ts"

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
beforeEach(() => db.query("alter table app.admin_audit_log disable trigger user; truncate app.users, app.organizations, app.admin_audit_log cascade; alter table app.admin_audit_log enable trigger user").then(() => {}))

async function newUser(email: string, username: string) {
  const r = await register(db, { email, username, password: "correct horse", accountType: "personal", acceptTerms: true })
  await db.query("update app.users set email_verified_at = now() where id = $1", [r.user.id])
  return r.user.id
}
/** An owner with an admin and a member who joined by invitation. */
async function team() {
  const owner = await newUser("owner@example.com", "owner")
  const admin = await newUser("admin@example.com", "admin")
  const member = await newUser("member@example.com", "member")
  await acceptInvitation(db, admin, (await inviteMember(db, owner, { email: "admin@example.com", role: "admin" })).token)
  await acceptInvitation(db, member, (await inviteMember(db, owner, { email: "member@example.com", role: "member" })).token)
  // invitations make the workspace the one they're in; the owner's own stays theirs
  const org = (await membership(db, owner)).organization_id
  return { owner, admin, member, org }
}
const code = (c: string) => (err: unknown) => (err instanceof AdminError || err instanceof AuthError) && err.code === c
const run = <T>(fn: (tx: Parameters<Parameters<Db["transaction"]>[0]>[0]) => Promise<T>) => db.transaction(fn)
const roles = async (org: string) =>
  Object.fromEntries(
    (await db.query<{ email: string; role: string }>("select u.email, m.role from app.organization_members m join app.users u on u.id = m.user_id where m.organization_id = $1", [org])).rows.map(
      (r) => [r.email, r.role],
    ),
  )

describe("workspace list", () => {
  test("searches by name and member email, filters by plan and suspension", async () => {
    const { org } = await team()
    const solo = await newUser("solo@example.com", "solo")
    const soloOrg = (await membership(db, solo)).organization_id
    await db.query("update app.organizations set plan = 'pro', size = '51-200' where id = $1", [org])
    await run((tx) => adminSuspendWorkspace(tx, soloOrg, "spam"))

    const all = await listPage<AdminWorkspaceRow>(db, ADMIN_WORKSPACES_LIST)
    // admin@ and member@ have workspaces of their own too
    assert.equal(all.rows.length, 4)
    const row = all.rows.find((r) => r.id === org)!
    assert.equal(row.members, 3)
    assert.equal(row.owner_email, "owner@example.com")
    assert.equal(row.size, "51-200")

    // member@ is in the owner's workspace and owns one of their own
    const ownOrg = (await db.query<{ organization_id: string }>(
      "select m.organization_id from app.organization_members m join app.users u on u.id = m.user_id where u.email = 'member@example.com' and m.role = 'owner'",
    )).rows[0]!.organization_id
    const found = await listPage<AdminWorkspaceRow>(db, ADMIN_WORKSPACES_LIST, { q: "member@example" })
    assert.deepEqual(found.rows.map((r) => r.id).sort(), [org, ownOrg].sort())
    assert.deepEqual((await listPage<AdminWorkspaceRow>(db, ADMIN_WORKSPACES_LIST, { filters: { plan: "pro" } })).rows.map((r) => r.id), [org])
    assert.deepEqual((await listPage<AdminWorkspaceRow>(db, ADMIN_WORKSPACES_LIST, { filters: { suspended: "yes" } })).rows.map((r) => r.id), [soloOrg])
    assert.ok((await listPage(db, ADMIN_WORKSPACES_LIST, { sort: "lastActivity", dir: "desc" })).rows.length)
    await assert.rejects(listPage(db, ADMIN_WORKSPACES_LIST, { filters: { plan: "gold" } }), code("invalid_input"))
  })
})

describe("plans", () => {
  test("the preview lists every limit and the websites a downgrade cuts", async () => {
    const { owner, org } = await team()
    await db.query("update app.organizations set plan = 'pro' where id = $1", [org])
    const bot = await getBotForUser(db, owner)
    await db.query(
      `insert into app.knowledge_sources (bot_id, kind, title, url, status, pages) values
         ($1, 'website', 'Big site', 'https://big.example', 'ready', 250),
         ($1, 'website', 'Small site', 'https://small.example', 'ready', 20)`,
      [bot.id],
    )
    const detail = (await getAdminWorkspaceDetail(db, org))!
    assert.deepEqual(detail.planPreviews.map((p) => p.plan), ["free", "starter", "business"])
    const free = detail.planPreviews.find((p) => p.plan === "free")!
    assert.deepEqual(free.limits, [{ key: "websitePages", from: 1000, to: 50, effectiveFrom: 300, effectiveTo: 50 }])
    assert.deepEqual(free.overLimit.map((s) => [s.title, s.pages, s.limit]), [["Big site", 250, 50]])
    assert.deepEqual(detail.planPreviews.find((p) => p.plan === "starter")!.overLimit, [])
    // above the crawl ceiling nothing changes in practice
    assert.deepEqual(planLimitChanges("pro", "business")[0], { key: "websitePages", from: 1000, to: 3000, effectiveFrom: 300, effectiveTo: 300 })
  })

  test("plan changes become the timeline, read back from the audit log", async () => {
    const { org } = await team()
    for (const plan of ["starter", "pro"]) {
      await run(async (tx) => {
        const c = await adminSetPlan(tx, org, plan)
        await writeAudit(tx, { actorId: null, action: PLAN_AUDIT_ACTION, targetType: "organization", targetId: org, reason: `to ${plan}`, before: c.before, after: c.after })
      })
    }
    await assert.rejects(run((tx) => adminSetPlan(tx, org, "pro")), code("invalid_input"))
    await assert.rejects(run((tx) => adminSetPlan(tx, org, "gold")), code("invalid_input"))
    const detail = (await getAdminWorkspaceDetail(db, org))!
    assert.equal(detail.workspace.plan, "pro")
    assert.deepEqual(detail.planHistory.map((h) => [h.from, h.to, h.reason]), [["free", "starter", "to starter"], ["starter", "pro", "to pro"]])
  })
})

describe("suspension", () => {
  test("a suspended workspace's sites leave the chat API's sync and come back when lifted", async () => {
    const { owner, org } = await team()
    const first = await getBotForUser(db, owner)
    const shop = await createBot(db, owner, "Shop")
    assert.deepEqual((await listBotIds(db)).sort(), [first.id, shop.id].sort())
    const since = (await listBotsChangedSince(db, null)).at(-1)!.updatedAt

    const s = await run((tx) => adminSuspendWorkspace(tx, org, "unpaid"))
    assert.equal(s.extra.sites, 2)
    assert.deepEqual(await listBotIds(db), [])
    // still returned, as paused: the chat API keeps their keys to answer "out of service"
    assert.deepEqual((await listBotsChangedSince(db, null)).map((b) => b.serving), [false, false])
    await assert.rejects(run((tx) => adminSuspendWorkspace(tx, org, "again")), code("invalid_input"))

    await new Promise((r) => setTimeout(r, 5))
    await run((tx) => adminUnsuspendWorkspace(tx, org))
    // the sync only asks for bots changed since its last pass; lifting counts as a change
    assert.deepEqual((await listBotsChangedSince(db, since)).map((b) => b.id).sort(), [first.id, shop.id].sort())
    assert.equal((await listBotIds(db)).length, 2)
    await assert.rejects(run((tx) => adminUnsuspendWorkspace(tx, org)), code("invalid_input"))
  })

  test("a bot disabled by staff stops too", async () => {
    const { owner } = await team()
    const bot = await getBotForUser(db, owner)
    await db.query("update app.bots set disabled_at = now() where id = $1", [bot.id])
    assert.deepEqual(await listBotIds(db), [])
  })
})

describe("team changes by staff", () => {
  test("roles change, but a workspace always keeps an owner", async () => {
    const { owner, member, org } = await team()
    await run((tx) => adminChangeMemberRole(tx, org, member, "admin"))
    assert.equal((await roles(org))["member@example.com"], "admin")
    await assert.rejects(run((tx) => adminChangeMemberRole(tx, org, member, "admin")), code("invalid_input"))
    await assert.rejects(run((tx) => adminChangeMemberRole(tx, org, owner, "member")), code("conflict"))
    await assert.rejects(run((tx) => adminChangeMemberRole(tx, org, owner, "boss")), code("invalid_input"))
    // with a second owner the first may step down
    await run((tx) => adminChangeMemberRole(tx, org, member, "owner"))
    await run((tx) => adminChangeMemberRole(tx, org, owner, "admin"))
    assert.deepEqual(await roles(org), { "owner@example.com": "admin", "admin@example.com": "admin", "member@example.com": "owner" })
  })

  test("removing anyone but the last owner", async () => {
    const { owner, member, org } = await team()
    await assert.rejects(run((tx) => adminRemoveMember(tx, org, owner)), code("conflict"))
    const c = await run((tx) => adminRemoveMember(tx, org, member))
    assert.deepEqual(c.before, { userId: member, role: "member" })
    assert.equal((await getTeam(db, owner)).members.length, 2)
    await assert.rejects(run((tx) => adminRemoveMember(tx, org, member)), code("not_found"))
    await assert.rejects(run((tx) => adminRemoveMember(tx, "00000000-0000-0000-0000-000000000000", owner)), code("not_found"))
  })

  test("ownership passes to one member; former owners become admins", async () => {
    const { admin, member, org } = await team()
    await run((tx) => adminChangeMemberRole(tx, org, admin, "owner"))
    await run((tx) => adminTransferOwnership(tx, org, member))
    assert.deepEqual(await roles(org), { "owner@example.com": "admin", "admin@example.com": "admin", "member@example.com": "owner" })
    await assert.rejects(run((tx) => adminTransferOwnership(tx, org, member)), code("conflict"))
    await assert.rejects(run((tx) => adminTransferOwnership(tx, org, "00000000-0000-0000-0000-000000000000")), code("not_found"))
  })

  test("invitations are withdrawn or sent again with a new link from the same inviter", async () => {
    const { owner, org } = await team()
    const first = await inviteMember(db, owner, { email: "guest@example.com", role: "admin" })
    const again = await run((tx) => adminResendInvite(tx, org, first.invite.id))
    assert.equal(again.extra.email, "guest@example.com")
    assert.equal(again.extra.role, "admin")
    assert.equal(again.extra.inviter, "owner")
    assert.notEqual(again.extra.token, first.token)
    assert.equal(await getInvitation(db, first.token), null)
    assert.equal((await getInvitation(db, again.extra.token))?.status, "open")

    const [open] = (await getAdminWorkspaceDetail(db, org))!.invites
    assert.equal(open!.invitedBy, "owner")
    await run((tx) => adminRevokeInvite(tx, org, open!.id))
    assert.equal((await getAdminWorkspaceDetail(db, org))!.invites.length, 0)
    await assert.rejects(run((tx) => adminRevokeInvite(tx, org, open!.id)), code("not_found"))
    await assert.rejects(run((tx) => adminResendInvite(tx, org, open!.id)), code("not_found"))
  })
})

describe("detail, note and deletion", () => {
  test("the detail shows members, sites and the staff note", async () => {
    const { owner, org } = await team()
    await getBotForUser(db, owner)
    await run((tx) => adminSetWorkspaceNote(tx, org, "  VIP customer "))
    await assert.rejects(run((tx) => adminSetWorkspaceNote(tx, org, "VIP customer")), code("invalid_input"))
    await assert.rejects(run((tx) => adminSetWorkspaceNote(tx, org, "x".repeat(5001))), code("invalid_input"))
    const d = (await getAdminWorkspaceDetail(db, org))!
    assert.equal(d.workspace.adminNote, "VIP customer")
    assert.deepEqual(d.members.map((m) => [m.email, m.role, m.onlyWorkspace]), [
      ["owner@example.com", "owner", true],
      ["admin@example.com", "admin", false],
      ["member@example.com", "member", false],
    ])
    assert.equal(d.sites.length, 1)
    assert.equal(d.deletion.sites, 1)
    assert.deepEqual(d.deletion.rehomed.map((r) => r.email), ["owner@example.com"])
    await run((tx) => adminSetWorkspaceNote(tx, org, ""))
    assert.equal((await getAdminWorkspaceDetail(db, org))!.workspace.adminNote, null)
    assert.equal(await getAdminWorkspaceDetail(db, "nope"), null)
  })

  test("deleting needs the exact name and gives members left without a workspace a new one", async () => {
    const { owner, admin, org } = await team()
    await getBotForUser(db, owner)
    await assert.rejects(run((tx) => adminDeleteWorkspace(tx, org, "wrong")), code("invalid_input"))
    const name = (await getAdminWorkspaceDetail(db, org))!.workspace.name
    const c = await run((tx) => adminDeleteWorkspace(tx, org, name))
    assert.equal(c.extra.rehomed, 1)
    assert.equal(await getAdminWorkspaceDetail(db, org), null)
    // the owner had only this one; they can keep working in a fresh workspace
    const fresh = await membership(db, owner)
    assert.notEqual(fresh.organization_id, org)
    assert.equal(fresh.role, "owner")
    assert.equal(fresh.name, "owner")
    // the admin still has their own
    assert.equal((await membership(db, admin)).name, "admin")
  })
})

describe("workspaces with staff in them", () => {
  test("only a superadmin may change a workspace, site or source that has a staff member", async () => {
    const { owner, member, org } = await team()
    const helper = await newUser("help@apex.example", "help")
    const boss = await newUser("boss@apex.example", "boss")
    await db.query("update app.users set platform_role = 'support' where id = $1", [helper])
    await db.query("update app.users set platform_role = 'superadmin' where id = $1", [boss])
    const support = { id: helper, role: "support" as const }
    const superadmin = { id: boss, role: "superadmin" as const }
    const bot = await createBot(db, owner, "Shop")
    const source = (
      await db.query<{ id: string }>("insert into app.knowledge_sources (bot_id, kind, title, content) values ($1, 'text', 'FAQ', 'x') returning id", [bot.id])
    ).rows[0]!.id

    // a customer workspace: support may
    for (const [id, of] of [[org, "organization"], [bot.id, "bot"], [source, "knowledge_source"]] as const) {
      await run((tx) => assertMayChangeWorkspace(tx, support, id, of))
    }

    // support's own workspace (raising its plan or budget) and one a superadmin is in: refused
    const own = (await membership(db, helper)).organization_id
    await assert.rejects(run((tx) => assertMayChangeWorkspace(tx, support, own)), code("forbidden"))
    await db.query("update app.users set platform_role = 'support' where id = $1", [member])
    for (const [id, of] of [[org, "organization"], [bot.id, "bot"], [source, "knowledge_source"]] as const) {
      await assert.rejects(run((tx) => assertMayChangeWorkspace(tx, support, id, of)), code("forbidden"), of)
      await run((tx) => assertMayChangeWorkspace(tx, superadmin, id, of))
    }
    // an id that isn't one is left for the action to answer "not found"
    await run((tx) => assertMayChangeWorkspace(tx, support, "nope", "bot"))
  })
})
