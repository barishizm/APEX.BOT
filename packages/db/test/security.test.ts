import { after, before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { PGlite } from "@electric-sql/pglite"
import type { Db } from "../src/db.ts"
import { migrate } from "../src/migrate.ts"
import {
  AuthError,
  beginTwoFactorSetup,
  completeTwoFactorLogin,
  deleteAccount,
  disableTwoFactor,
  enableTwoFactor,
  getAccount,
  getSession,
  hasLoginChallenge,
  login,
  oauthLogin,
  regenerateRecoveryCodes,
  register,
  requestEmailChange,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from "../src/auth.ts"
import { getBotForUser, listBotsForUser } from "../src/bots.ts"
import { openTotpSecret, sealTotpSecret, totpCode, totpStep } from "../src/crypto.ts"
import {
  acceptInvitation,
  changeMemberRole,
  getInvitation,
  getTeam,
  invitationAllowsSignup,
  inviteMember,
  removeMember,
  revokeInvite,
  setActiveWorkspace,
} from "../src/team.ts"

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

const PASSWORD = "correct horse"
const code = (c: AuthError["code"]) => (err: unknown) => err instanceof AuthError && err.code === c

async function verifiedUser(email: string, username: string) {
  const { user, session, code: emailCode } = await register(db, { email, username, password: PASSWORD, accountType: "personal", acceptTerms: true })
  await verifyEmail(db, user.id, emailCode)
  return { user, session }
}

// The code an authenticator shows `offset` steps from now
const appCode = (secret: string, offset = 0) => totpCode(secret, totpStep() + offset)

async function withTwoFactor() {
  const { user, session } = await verifiedUser("jane@example.com", "jane")
  const { secret } = await beginTwoFactorSetup(db, user.id)
  // enabling spends the current step, so later sign-ins in the same test use the next one
  const { recoveryCodes } = await enableTwoFactor(db, user.id, appCode(secret, -1))
  return { user, session, secret, recoveryCodes }
}

describe("two-step sign-in", () => {
  test("setup gives a QR uri and only turns on with a correct code", async () => {
    const { user } = await verifiedUser("jane@example.com", "jane")
    const { secret, uri } = await beginTwoFactorSetup(db, user.id)
    assert.match(secret, /^[A-Z2-7]{32}$/)
    assert.ok(uri.startsWith("otpauth://totp/Apex%20Bot%3Ajane%40example.com?secret="))
    await assert.rejects(enableTwoFactor(db, user.id, "12345"), code("invalid_input"))
    const wrong = appCode(secret) === "000000" ? "111111" : "000000"
    await assert.rejects(enableTwoFactor(db, user.id, wrong), code("invalid_code"))
    // still off: password alone signs in
    assert.ok((await login(db, { email: "jane@example.com", password: PASSWORD })).session)

    const { recoveryCodes } = await enableTwoFactor(db, user.id, appCode(secret))
    assert.equal(recoveryCodes.length, 10)
    assert.match(recoveryCodes[0], /^[a-z0-9]{5}-[a-z0-9]{5}$/)
    await assert.rejects(beginTwoFactorSetup(db, user.id), code("conflict"))
    const account = await getAccount(db, user.id, "00000000-0000-0000-0000-000000000000")
    assert.equal(account.user.twoFactor, true)
    assert.equal(account.recoveryCodesLeft, 10)
  })

  test("a password sign-in waits for the code, and each code works once", async () => {
    const { secret } = await withTwoFactor()
    const first = await login(db, { email: "jane@example.com", password: PASSWORD, remember: true })
    assert.equal(first.session, undefined)
    assert.ok(first.challenge)
    assert.equal(await hasLoginChallenge(db, first.challenge.token), true)

    await assert.rejects(completeTwoFactorLogin(db, first.challenge.token, "abc"), code("invalid_code"))
    const done = await completeTwoFactorLogin(db, first.challenge.token, appCode(secret))
    assert.equal(done.session.persistent, true)
    assert.equal(done.usedRecoveryCode, false)
    assert.ok(await getSession(db, done.session.token))
    // the challenge is spent
    await assert.rejects(completeTwoFactorLogin(db, first.challenge.token, appCode(secret, 1)), code("unauthorized"))

    // the same code can't be replayed on a new sign-in
    const second = await login(db, { email: "jane@example.com", password: PASSWORD })
    await assert.rejects(completeTwoFactorLogin(db, second.challenge!.token, appCode(secret)), code("invalid_code"))
    assert.ok(await completeTwoFactorLogin(db, second.challenge!.token, appCode(secret, 1)))
  })

  test("a challenge allows five wrong codes, then needs a new sign-in", async () => {
    await withTwoFactor()
    const { challenge } = await login(db, { email: "jane@example.com", password: PASSWORD })
    for (let i = 0; i < 5; i++) await assert.rejects(completeTwoFactorLogin(db, challenge!.token, "zzzzz-zzzzz"), code("invalid_code"))
    await assert.rejects(completeTwoFactorLogin(db, challenge!.token, "zzzzz-zzzzz"), code("too_many_attempts"))
    assert.equal(await hasLoginChallenge(db, challenge!.token), false)
  })

  test("recovery codes sign in once each", async () => {
    const { recoveryCodes } = await withTwoFactor()
    const a = await login(db, { email: "jane@example.com", password: PASSWORD })
    const done = await completeTwoFactorLogin(db, a.challenge!.token, ` ${recoveryCodes[0].toUpperCase().replace("-", " ")} `)
    assert.equal(done.usedRecoveryCode, true)
    assert.equal(done.recoveryCodesLeft, 9)
    const b = await login(db, { email: "jane@example.com", password: PASSWORD })
    await assert.rejects(completeTwoFactorLogin(db, b.challenge!.token, recoveryCodes[0]), code("invalid_code"))
  })

  test("Google/GitHub sign-in also asks for the code", async () => {
    const { secret } = await withTwoFactor()
    const out = await oauthLogin(db, { provider: "google", providerAccountId: "g-1", email: "jane@example.com", emailVerified: true })
    assert.equal(out.session, undefined)
    assert.ok(await completeTwoFactorLogin(db, out.challenge!.token, appCode(secret)))
  })

  test("a password reset still asks for the code", async () => {
    const { secret } = await withTwoFactor()
    const sent = await requestPasswordReset(db, "jane@example.com")
    const out = await resetPassword(db, { email: "jane@example.com", code: sent!.code, password: "brand new pw" })
    assert.equal(out.session, undefined)
    assert.ok(await completeTwoFactorLogin(db, out.challenge!.token, appCode(secret)))
  })

  test("setup needs a verified email, and a verified owner taking over an address drops a squatter's authenticator", async () => {
    // a stranger registers the address without proving it and can't set up an authenticator
    const { user } = await register(db, { email: "jane@example.com", username: "squat", password: "squatter pw", accountType: "personal", acceptTerms: true })
    await assert.rejects(beginTwoFactorSetup(db, user.id), code("forbidden"))
    // even if one were on, the verified owner signing in with Google gets straight in
    await db.query("update app.users set totp_secret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', totp_enabled_at = now() where id = $1", [user.id])
    const out = await oauthLogin(db, { provider: "google", providerAccountId: "g-1", email: "jane@example.com", emailVerified: true })
    assert.ok(out.session)
    assert.equal(out.user.twoFactor, false)
  })

  test("the secret is stored encrypted and bound to its account", async () => {
    const { user, secret } = await withTwoFactor()
    const { rows } = await db.query<{ totp_secret: string }>("select totp_secret from app.users where id = $1", [user.id])
    assert.match(rows[0].totp_secret, /^v1\./)
    assert.ok(!rows[0].totp_secret.includes(secret))
    assert.equal(openTotpSecret(rows[0].totp_secret, user.id).secret, secret)
    // copied onto another account, or opened with another key, it fails
    assert.throws(() => openTotpSecret(rows[0].totp_secret, "00000000-0000-0000-0000-000000000000"))
    const key = process.env.TOTP_ENCRYPTION_KEY
    process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64")
    try {
      assert.throws(() => openTotpSecret(rows[0].totp_secret, user.id))
      delete process.env.TOTP_ENCRYPTION_KEY
      assert.throws(() => sealTotpSecret(secret, user.id), /TOTP_ENCRYPTION_KEY is not set/)
    } finally {
      process.env.TOTP_ENCRYPTION_KEY = key
    }
  })

  test("a secret saved unencrypted before still works and gets encrypted on first use", async () => {
    const { user, secret } = await withTwoFactor()
    await db.query("update app.users set totp_secret = $2 where id = $1", [user.id, secret])
    const { challenge } = await login(db, { email: "jane@example.com", password: PASSWORD })
    assert.ok(await completeTwoFactorLogin(db, challenge!.token, appCode(secret, 1)))
    const { rows } = await db.query<{ totp_secret: string }>("select totp_secret from app.users where id = $1", [user.id])
    assert.equal(openTotpSecret(rows[0].totp_secret, user.id).legacy, false)
  })

  test("turning off and new recovery codes need a code", async () => {
    const { user, secret, recoveryCodes } = await withTwoFactor()
    await assert.rejects(regenerateRecoveryCodes(db, user.id, "000000"), code("invalid_code"))
    const fresh = await regenerateRecoveryCodes(db, user.id, recoveryCodes[1])
    assert.notDeepEqual(fresh.recoveryCodes, recoveryCodes)
    // the old set no longer works
    await assert.rejects(disableTwoFactor(db, user.id, recoveryCodes[2]), code("invalid_code"))
    await disableTwoFactor(db, user.id, appCode(secret))
    const signIn = await login(db, { email: "jane@example.com", password: PASSWORD })
    assert.ok(signIn.session)
    assert.equal((await getAccount(db, user.id, "00000000-0000-0000-0000-000000000000")).recoveryCodesLeft, 0)
  })
})

describe("changing the account email", () => {
  test("needs the password, mails the new address and switches once verified", async () => {
    const { user, session } = await verifiedUser("jane@example.com", "jane")
    await verifiedUser("taken@example.com", "taken")
    const ageCodes = () => db.query("update app.verification_codes set created_at = created_at - interval '1 minute'")
    await ageCodes()
    await assert.rejects(requestEmailChange(db, user.id, { email: "new@example.com", password: "wrong" }), code("invalid_credentials"))
    await assert.rejects(requestEmailChange(db, user.id, { email: "jane@example.com", password: PASSWORD }), code("invalid_input"))
    await assert.rejects(requestEmailChange(db, user.id, { email: "taken@example.com", password: PASSWORD }), code("email_taken"))
    await ageCodes()

    const sent = await requestEmailChange(db, user.id, { email: " New@Example.com ", password: PASSWORD })
    assert.equal(sent.email, "new@example.com")
    // unchanged and still verified until the code comes back
    const before = (await getSession(db, session.token))!.user
    assert.equal(before.email, "jane@example.com")
    assert.equal(before.emailVerified, true)

    const updated = await verifyEmail(db, user.id, sent.code)
    assert.equal(updated.email, "new@example.com")
    assert.ok((await login(db, { email: "new@example.com", password: PASSWORD })).session)
  })

  test("Google/GitHub-only accounts change it without a password", async () => {
    const { user } = await oauthLogin(db, { provider: "github", providerAccountId: "9", email: "octo@example.com", emailVerified: true, username: "octo" })
    const sent = await requestEmailChange(db, user.id, { email: "octo2@example.com" })
    assert.equal((await verifyEmail(db, user.id, sent.code)).email, "octo2@example.com")
  })
})

describe("team", () => {
  test("an owner invites, the invitee accepts and works in the shared workspace", async () => {
    const { user: owner } = await verifiedUser("owner@example.com", "owner")
    const ownerBot = await getBotForUser(db, owner.id)
    const { user: guest } = await verifiedUser("guest@example.com", "guest")

    const { token, invite, workspaceName } = await inviteMember(db, owner.id, { email: "Guest@example.com", role: "admin" })
    assert.equal(invite.email, "guest@example.com")
    assert.equal(workspaceName, "owner")
    assert.deepEqual(
      { ...(await getInvitation(db, token)) },
      { workspaceName: "owner", invitedBy: "owner", email: "guest@example.com", role: "admin", status: "open" },
    )
    assert.equal(await invitationAllowsSignup(db, token, "guest@example.com"), true)
    assert.equal(await invitationAllowsSignup(db, token, "other@example.com"), false)

    const { user: stranger } = await verifiedUser("stranger@example.com", "stranger")
    await assert.rejects(acceptInvitation(db, stranger.id, token), code("forbidden"))

    await acceptInvitation(db, guest.id, token)
    assert.equal((await getInvitation(db, token))?.status, "accepted")
    await assert.rejects(acceptInvitation(db, guest.id, token), code("conflict"))
    // the invited workspace is now the guest's current one
    assert.equal((await getBotForUser(db, guest.id)).id, ownerBot.id)
    assert.equal((await getBotForUser(db, guest.id)).role, "admin")
    const team = await getTeam(db, guest.id)
    assert.deepEqual(team.members.map((m) => [m.email, m.role]), [["owner@example.com", "owner"], ["guest@example.com", "admin"]])
    assert.equal(team.workspaces.length, 2)

    // switching back to their own workspace
    const own = team.workspaces.find((w) => w.id !== team.workspace.id)!
    await setActiveWorkspace(db, guest.id, own.id)
    assert.equal((await listBotsForUser(db, guest.id)).canEdit, true)
    assert.notEqual((await getBotForUser(db, guest.id)).id, ownerBot.id)
    await assert.rejects(setActiveWorkspace(db, stranger.id, team.workspace.id), code("not_found"))
  })

  test("roles limit who may invite, change roles and remove", async () => {
    const { user: owner } = await verifiedUser("owner@example.com", "owner")
    const { user: admin } = await verifiedUser("admin@example.com", "admin")
    const { user: member } = await verifiedUser("member@example.com", "member")
    await acceptInvitation(db, admin.id, (await inviteMember(db, owner.id, { email: "admin@example.com", role: "admin" })).token)
    await acceptInvitation(db, member.id, (await inviteMember(db, admin.id, { email: "member@example.com", role: "member" })).token)

    await assert.rejects(inviteMember(db, admin.id, { email: "x@example.com", role: "admin" }), code("forbidden"))
    await assert.rejects(inviteMember(db, member.id, { email: "x@example.com", role: "member" }), code("forbidden"))
    await assert.rejects(inviteMember(db, owner.id, { email: "member@example.com", role: "member" }), code("conflict"))
    await assert.rejects(changeMemberRole(db, admin.id, member.id, "admin"), code("forbidden"))
    await assert.rejects(removeMember(db, admin.id, owner.id), code("forbidden"))
    await assert.rejects(changeMemberRole(db, owner.id, owner.id, "member"), code("conflict"))
    await assert.rejects(removeMember(db, owner.id, owner.id), code("conflict"))

    await changeMemberRole(db, owner.id, member.id, "admin")
    await changeMemberRole(db, owner.id, member.id, "member")
    await removeMember(db, admin.id, member.id)
    // back in their own workspace
    assert.equal((await getTeam(db, member.id)).members.length, 1)
    assert.deepEqual((await removeMember(db, admin.id, admin.id)), { left: true })
    assert.equal((await getTeam(db, owner.id)).members.length, 1)
  })

  test("invitations can be sent again, withdrawn and expire", async () => {
    const { user: owner } = await verifiedUser("owner@example.com", "owner")
    const first = await inviteMember(db, owner.id, { email: "guest@example.com", role: "member" })
    const second = await inviteMember(db, owner.id, { email: "guest@example.com", role: "member" })
    assert.equal(await getInvitation(db, first.token), null)
    assert.equal((await getTeam(db, owner.id)).invites.length, 1)

    await db.query("update app.organization_invitations set expires_at = now() - interval '1 second'")
    assert.equal((await getInvitation(db, second.token))?.status, "expired")
    const { user: guest } = await verifiedUser("guest@example.com", "guest")
    await assert.rejects(acceptInvitation(db, guest.id, second.token), code("code_expired"))

    await revokeInvite(db, owner.id, second.invite.id)
    assert.equal((await getTeam(db, owner.id)).invites.length, 0)
    await assert.rejects(revokeInvite(db, owner.id, second.invite.id), code("not_found"))

    // admins can't withdraw an owner's admin invitation
    const { user: admin } = await verifiedUser("admin@example.com", "admin")
    await acceptInvitation(db, admin.id, (await inviteMember(db, owner.id, { email: "admin@example.com", role: "admin" })).token)
    const forAdmin = await inviteMember(db, owner.id, { email: "boss@example.com", role: "admin" })
    await assert.rejects(revokeInvite(db, admin.id, forAdmin.invite.id), code("not_found"))
  })

  test("deleting the only owner hands the workspace to an admin", async () => {
    const { user: owner } = await verifiedUser("owner@example.com", "owner")
    const { user: member } = await verifiedUser("member@example.com", "member")
    const { user: admin } = await verifiedUser("admin@example.com", "admin")
    await acceptInvitation(db, member.id, (await inviteMember(db, owner.id, { email: "member@example.com", role: "member" })).token)
    await acceptInvitation(db, admin.id, (await inviteMember(db, owner.id, { email: "admin@example.com", role: "admin" })).token)
    await deleteAccount(db, owner.id, "owner@example.com")
    const team = await getTeam(db, admin.id)
    assert.deepEqual(team.members.map((m) => [m.email, m.role]), [["admin@example.com", "owner"], ["member@example.com", "member"]])
  })
})
