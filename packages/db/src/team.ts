import type { Db, Queryable } from "./db.ts"
import { AuthError, normalizeEmail } from "./auth.ts"
import { canEditBot, membership, type MemberRole } from "./bots.ts"
import { newSessionToken, sha256 } from "./crypto.ts"

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** Invitations one workspace may send per 24 hours, so the form can't be used to mail strangers. */
export const INVITES_PER_DAY = 20
/** People in one workspace, counting open invitations. */
export const TEAM_LIMIT = 25

export type InviteRole = "admin" | "member"
const INVITE_ROLES: readonly string[] = ["admin", "member"]
const MEMBER_ROLES: readonly string[] = ["owner", "admin", "member"]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface TeamMember {
  userId: string
  email: string
  name: string
  role: MemberRole
  joinedAt: Date
}

export interface TeamInvite {
  id: string
  email: string
  role: InviteRole
  invitedBy: string | null
  createdAt: Date
  expiresAt: Date
}

export interface Team {
  workspace: { id: string; name: string }
  /** The requesting user's role in it. */
  role: MemberRole
  members: TeamMember[]
  /** Open invitations, expired ones included so they can be sent again. */
  invites: TeamInvite[]
  /** Every workspace the user belongs to, for switching. */
  workspaces: { id: string; name: string; role: MemberRole }[]
}

const nameOf = (r: { display_name: string | null; username: string }) => r.display_name || r.username

/** Members of a workspace, owners first. */
export async function teamMembers(q: Queryable, organizationId: string): Promise<TeamMember[]> {
  const { rows } = await q.query<{ user_id: string; email: string; username: string; display_name: string | null; role: MemberRole; created_at: Date }>(
    `select m.user_id, u.email, u.username, u.display_name, m.role, m.created_at
       from app.organization_members m join app.users u on u.id = m.user_id
      where m.organization_id = $1
      order by array_position(array['owner', 'admin', 'member'], m.role), m.created_at`,
    [organizationId],
  )
  return rows.map((r) => ({ userId: r.user_id, email: r.email, name: nameOf(r), role: r.role, joinedAt: r.created_at }))
}

/** Open invitations of a workspace, newest first, expired ones included so they can be sent again. */
export async function teamInvites(q: Queryable, organizationId: string): Promise<TeamInvite[]> {
  const { rows } = await q.query<{ id: string; email: string; role: InviteRole; created_at: Date; expires_at: Date; username: string | null; display_name: string | null }>(
    `select i.id, i.email, i.role, i.created_at, i.expires_at, u.username, u.display_name
       from app.organization_invitations i left join app.users u on u.id = i.invited_by
      where i.organization_id = $1 and i.accepted_at is null
      order by i.created_at desc`,
    [organizationId],
  )
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    invitedBy: r.username ? nameOf({ username: r.username, display_name: r.display_name }) : null,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }))
}

/** The members and open invitations of the user's current workspace. */
export async function getTeam(db: Db, userId: string): Promise<Team> {
  const me = await membership(db, userId)
  const [members, invites, workspaces] = await Promise.all([
    teamMembers(db, me.organization_id),
    teamInvites(db, me.organization_id),
    db.query<{ id: string; name: string; role: MemberRole }>(
      `select o.id, o.name, m.role from app.organization_members m join app.organizations o on o.id = m.organization_id
        where m.user_id = $1 order by o.name, o.id`,
      [userId],
    ),
  ])
  return { workspace: { id: me.organization_id, name: me.name }, role: me.role, members, invites, workspaces: workspaces.rows }
}

// ---------- Whose authority a change runs with ----------

/**
 * The workspace a team change applies to and the role it is made with: a member's own role, or
 * for platform staff (the admin area) an owner's, without being a member (`userId` null).
 */
export interface TeamActor {
  organizationId: string
  workspaceName: string
  role: MemberRole
  userId: string | null
}

async function memberActor(q: Queryable, userId: string): Promise<TeamActor> {
  const me = await membership(q, userId)
  return { organizationId: me.organization_id, workspaceName: me.name, role: me.role, userId }
}

/** Platform staff acting on a workspace. Staff only: check the caller's platform role first. */
async function staffActor(q: Queryable, organizationId: unknown): Promise<TeamActor> {
  if (typeof organizationId !== "string" || !UUID.test(organizationId)) throw new AuthError("not_found", "Workspace not found")
  const { rows } = await q.query<{ name: string }>("select name from app.organizations where id = $1", [organizationId])
  if (!rows[0]) throw new AuthError("not_found", "Workspace not found")
  return { organizationId, workspaceName: rows[0].name, role: "owner", userId: null }
}

/**
 * Invites someone to the user's workspace by email. Owners invite admins or members, admins
 * invite members. Sending again to the same address replaces the earlier link. The caller
 * emails `token` as a link.
 */
export async function inviteMember(
  db: Db,
  userId: string,
  input: { email: unknown; role: unknown },
): Promise<{ invite: TeamInvite; token: string; workspaceName: string }> {
  const email = normalizeEmail(input.email)
  if (typeof input.role !== "string" || !INVITE_ROLES.includes(input.role)) throw new AuthError("invalid_input", "Choose a role")
  const role = input.role as InviteRole
  const me = await memberActor(db, userId)
  if (!canEditBot(me.role)) throw new AuthError("forbidden", "Only workspace owners and admins can invite people")
  if (role === "admin" && me.role !== "owner") throw new AuthError("forbidden", "Only owners can invite admins")
  return issueInvite(db, me, email, role, userId)
}

/** Writes a new invitation link (replacing any open one for the address) within the workspace's limits. */
async function issueInvite(
  db: Db,
  actor: TeamActor,
  email: string,
  role: InviteRole,
  invitedBy: string | null,
): Promise<{ invite: TeamInvite; token: string; workspaceName: string }> {
  return db.transaction(async (tx) => {
    // serializes invitations so the limits hold
    await tx.query("select 1 from app.organizations where id = $1 for update", [actor.organizationId])
    const { rows } = await tx.query<{ member: boolean; people: number; today: number }>(
      `select exists (select 1 from app.organization_members m join app.users u on u.id = m.user_id
                       where m.organization_id = $1 and u.email = $2) as member,
              (select count(*)::int from app.organization_members where organization_id = $1)
                + (select count(*)::int from app.organization_invitations
                    where organization_id = $1 and accepted_at is null and expires_at > now() and email <> $2) as people,
              (select count(*)::int from app.organization_invitations
                where organization_id = $1 and created_at > now() - interval '24 hours') as today`,
      [actor.organizationId, email],
    )
    if (rows[0].member) throw new AuthError("conflict", "This person is already in the workspace")
    if (rows[0].people >= TEAM_LIMIT) throw new AuthError("conflict", `A workspace can have up to ${TEAM_LIMIT} people`)
    if (rows[0].today >= INVITES_PER_DAY) throw new AuthError("too_many_attempts", "Too many invitations today. Try again tomorrow", 24 * 60 * 60)

    const token = newSessionToken()
    await tx.query("delete from app.organization_invitations where organization_id = $1 and email = $2 and accepted_at is null", [
      actor.organizationId,
      email,
    ])
    const inserted = await tx.query<{ id: string; created_at: Date; expires_at: Date }>(
      `insert into app.organization_invitations (organization_id, email, role, token_hash, invited_by, expires_at)
       values ($1, $2, $3, $4, $5, $6) returning id, created_at, expires_at`,
      [actor.organizationId, email, role, sha256(token), invitedBy, new Date(Date.now() + INVITE_TTL_MS)],
    )
    const inviter = await tx.query<{ username: string; display_name: string | null }>("select username, display_name from app.users where id = $1", [invitedBy])
    const r = inserted.rows[0]
    return {
      invite: { id: r.id, email, role, invitedBy: inviter.rows[0] ? nameOf(inviter.rows[0]) : null, createdAt: r.created_at, expiresAt: r.expires_at },
      token,
      workspaceName: actor.workspaceName,
    }
  })
}

const findInvite = async (q: Queryable, actor: TeamActor, inviteId: unknown) => {
  if (typeof inviteId !== "string" || !UUID.test(inviteId)) throw new AuthError("not_found", "This invitation no longer exists")
  // like sending, admins handle member invitations only
  const { rows } = await q.query<{ id: string; email: string; role: InviteRole; invited_by: string | null }>(
    `select id, email, role, invited_by from app.organization_invitations
      where id = $1 and organization_id = $2 and accepted_at is null and ($3 = 'owner' or role = 'member')`,
    [inviteId, actor.organizationId, actor.role],
  )
  if (!rows[0]) throw new AuthError("not_found", "This invitation no longer exists")
  return rows[0]
}

/**
 * A fresh link for an open (or expired) invitation, same address and role, from the same inviter.
 * The old link stops working. The caller emails `token`.
 */
async function resendInviteAs(db: Db, actor: TeamActor, inviteId: unknown) {
  if (!canEditBot(actor.role)) throw new AuthError("forbidden", "Only workspace owners and admins can manage invitations")
  const old = await findInvite(db, actor, inviteId)
  const sent = await issueInvite(db, actor, old.email, old.role, old.invited_by)
  return { ...sent, previousId: old.id }
}

/** Withdraws an open invitation; its link stops working. */
export async function revokeInvite(db: Db, userId: string, inviteId: unknown): Promise<void> {
  await revokeInviteAs(db, await memberActor(db, userId), inviteId)
}

async function revokeInviteAs(db: Db, actor: TeamActor, inviteId: unknown): Promise<{ email: string; role: InviteRole }> {
  if (!canEditBot(actor.role)) throw new AuthError("forbidden", "Only workspace owners and admins can manage invitations")
  if (typeof inviteId !== "string" || !UUID.test(inviteId)) throw new AuthError("not_found", "This invitation no longer exists")
  // like sending, admins handle member invitations only
  const { rows } = await db.query<{ email: string; role: InviteRole }>(
    `delete from app.organization_invitations
      where id = $1 and organization_id = $2 and accepted_at is null and ($3 = 'owner' or role = 'member') returning email, role`,
    [inviteId, actor.organizationId, actor.role],
  )
  if (!rows[0]) throw new AuthError("not_found", "This invitation no longer exists")
  return rows[0]
}

export interface Invitation {
  workspaceName: string
  invitedBy: string | null
  email: string
  role: InviteRole
  status: "open" | "expired" | "accepted"
}

/** What an invitation link is for, to show before accepting. Null for an unknown link. */
export async function getInvitation(db: Db, token: unknown): Promise<Invitation | null> {
  if (typeof token !== "string" || !token || token.length > 100) return null
  const { rows } = await db.query<{
    name: string
    email: string
    role: InviteRole
    accepted: boolean
    expired: boolean
    username: string | null
    display_name: string | null
  }>(
    `select o.name, i.email, i.role, i.accepted_at is not null as accepted, i.expires_at <= now() as expired, u.username, u.display_name
       from app.organization_invitations i
       join app.organizations o on o.id = i.organization_id
       left join app.users u on u.id = i.invited_by
      where i.token_hash = $1`,
    [sha256(token)],
  )
  const r = rows[0]
  if (!r) return null
  return {
    workspaceName: r.name,
    invitedBy: r.username ? nameOf({ username: r.username, display_name: r.display_name }) : null,
    email: r.email,
    role: r.role,
    status: r.accepted ? "accepted" : r.expired ? "expired" : "open",
  }
}

/** Whether an invitation link lets this address sign up while sign-ups are closed. */
export async function invitationAllowsSignup(db: Db, token: unknown, email: unknown): Promise<boolean> {
  const invitation = await getInvitation(db, token)
  if (!invitation || invitation.status !== "open") return false
  try {
    return normalizeEmail(email) === invitation.email
  } catch {
    return false
  }
}

/**
 * Joins the workspace an invitation is for and makes it the user's current one. The account's
 * verified email must be the invited address.
 */
export async function acceptInvitation(db: Db, userId: string, token: unknown): Promise<{ organizationId: string; workspaceName: string }> {
  if (typeof token !== "string" || !token || token.length > 100) throw new AuthError("not_found", "This invitation link isn't valid")
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string; organization_id: string; name: string; email: string; role: InviteRole; accepted: boolean; expired: boolean }>(
      `select i.id, i.organization_id, o.name, i.email, i.role, i.accepted_at is not null as accepted, i.expires_at <= now() as expired
         from app.organization_invitations i join app.organizations o on o.id = i.organization_id
        where i.token_hash = $1
        for update of i`,
      [sha256(token)],
    )
    const invite = rows[0]
    if (!invite) throw new AuthError("not_found", "This invitation link isn't valid")
    if (invite.accepted) throw new AuthError("conflict", "This invitation was already accepted")
    if (invite.expired) throw new AuthError("code_expired", "This invitation has expired. Ask for a new one")
    const user = await tx.query<{ email: string; verified: boolean }>(
      "select email, email_verified_at is not null as verified from app.users where id = $1",
      [userId],
    )
    if (!user.rows[0]) throw new AuthError("unauthorized", "Log in again")
    if (!user.rows[0].verified) throw new AuthError("forbidden", "Verify your email first")
    if (user.rows[0].email !== invite.email) {
      throw new AuthError("forbidden", `This invitation is for ${invite.email}. Log in with that address to accept it`)
    }
    // someone already in the workspace keeps the role they have
    await tx.query(
      `insert into app.organization_members (organization_id, user_id, role) values ($1, $2, $3)
       on conflict (organization_id, user_id) do nothing`,
      [invite.organization_id, userId, invite.role],
    )
    await tx.query("update app.organization_invitations set accepted_at = now() where id = $1", [invite.id])
    await tx.query("update app.users set active_organization_id = $2 where id = $1", [userId, invite.organization_id])
    return { organizationId: invite.organization_id, workspaceName: invite.name }
  })
}

async function memberRole(db: Queryable, organizationId: string, userId: unknown): Promise<MemberRole> {
  if (typeof userId !== "string" || !UUID.test(userId)) throw new AuthError("not_found", "This person isn't in the workspace")
  const { rows } = await db.query<{ role: MemberRole }>("select role from app.organization_members where organization_id = $1 and user_id = $2", [
    organizationId,
    userId,
  ])
  if (!rows[0]) throw new AuthError("not_found", "This person isn't in the workspace")
  return rows[0].role
}

const otherOwners = async (db: Queryable, organizationId: string, userId: string) =>
  (
    await db.query<{ n: number }>(
      "select count(*)::int as n from app.organization_members where organization_id = $1 and role = 'owner' and user_id <> $2",
      [organizationId, userId],
    )
  ).rows[0].n

/** Changes someone's role. Only owners can, and a workspace always keeps at least one owner. */
export async function changeMemberRole(db: Db, userId: string, targetUserId: unknown, rawRole: unknown): Promise<void> {
  await changeMemberRoleAs(db, await memberActor(db, userId), targetUserId, rawRole)
}

async function changeMemberRoleAs(db: Db, actor: TeamActor, targetUserId: unknown, rawRole: unknown): Promise<{ before: MemberRole; after: MemberRole }> {
  if (typeof rawRole !== "string" || !MEMBER_ROLES.includes(rawRole)) throw new AuthError("invalid_input", "Choose a role")
  const role = rawRole as MemberRole
  if (actor.role !== "owner") throw new AuthError("forbidden", "Only owners can change roles")
  return db.transaction(async (tx) => {
    await tx.query("select 1 from app.organizations where id = $1 for update", [actor.organizationId])
    const current = await memberRole(tx, actor.organizationId, targetUserId)
    if (current === role) return { before: current, after: role }
    if (current === "owner" && (await otherOwners(tx, actor.organizationId, targetUserId as string)) === 0) {
      throw new AuthError("conflict", "A workspace needs an owner. Make someone else an owner first")
    }
    await tx.query("update app.organization_members set role = $3 where organization_id = $1 and user_id = $2", [actor.organizationId, targetUserId, role])
    return { before: current, after: role }
  })
}

/**
 * Removes someone from the workspace, or with their own id, leaves it. Owners remove anyone,
 * admins remove members. The last owner can't leave, and nobody can leave their only workspace.
 */
export async function removeMember(db: Db, userId: string, targetUserId: unknown): Promise<{ left: boolean }> {
  const { left } = await removeMemberAs(db, await memberActor(db, userId), targetUserId)
  return { left }
}

async function removeMemberAs(db: Db, actor: TeamActor, targetUserId: unknown): Promise<{ left: boolean; role: MemberRole }> {
  const left = actor.userId !== null && targetUserId === actor.userId
  return db.transaction(async (tx) => {
    await tx.query("select 1 from app.organizations where id = $1 for update", [actor.organizationId])
    const target = await memberRole(tx, actor.organizationId, targetUserId)
    const id = targetUserId as string
    if (!left && !(actor.role === "owner" || (actor.role === "admin" && target === "member"))) {
      throw new AuthError("forbidden", actor.role === "admin" ? "Admins can only remove members" : "Only workspace owners and admins can remove people")
    }
    if (target === "owner" && (await otherOwners(tx, actor.organizationId, id)) === 0) {
      throw new AuthError("conflict", "A workspace needs an owner. Make someone else an owner first")
    }
    if (left) {
      const elsewhere = await tx.query("select 1 from app.organization_members where user_id = $1 and organization_id <> $2 limit 1", [
        id,
        actor.organizationId,
      ])
      if (!elsewhere.rows.length) throw new AuthError("conflict", "This is your only workspace, so you can't leave it")
    }
    await tx.query("delete from app.organization_members where organization_id = $1 and user_id = $2", [actor.organizationId, id])
    await tx.query("update app.users set active_organization_id = null where id = $1 and active_organization_id = $2", [id, actor.organizationId])
    return { left, role: target }
  })
}

/** Makes a member the workspace's only owner; the owners before them become admins. Owners only. */
async function transferOwnershipAs(db: Db, actor: TeamActor, targetUserId: unknown): Promise<{ previousOwners: string[]; owner: string; before: MemberRole }> {
  if (actor.role !== "owner") throw new AuthError("forbidden", "Only owners can hand over the workspace")
  return db.transaction(async (tx) => {
    await tx.query("select 1 from app.organizations where id = $1 for update", [actor.organizationId])
    const before = await memberRole(tx, actor.organizationId, targetUserId)
    const id = targetUserId as string
    const owners = await tx.query<{ user_id: string }>(
      "select user_id from app.organization_members where organization_id = $1 and role = 'owner' and user_id <> $2 order by created_at",
      [actor.organizationId, id],
    )
    if (before === "owner" && !owners.rows.length) throw new AuthError("conflict", "This person already owns the workspace")
    await tx.query("update app.organization_members set role = 'owner' where organization_id = $1 and user_id = $2", [actor.organizationId, id])
    await tx.query("update app.organization_members set role = 'admin' where organization_id = $1 and role = 'owner' and user_id <> $2", [
      actor.organizationId,
      id,
    ])
    return { previousOwners: owners.rows.map((r) => r.user_id), owner: id, before }
  })
}

// ---------- Platform staff (the admin area) ----------
// The same changes with an owner's powers on any workspace; the rules that protect the workspace
// itself (it keeps an owner, the team and invitation limits) still hold. Staff only: the caller checks
// the platform role, and passes its transaction as a Db (inTransaction) to audit in it.

export const staffChangeMemberRole = async (db: Db, organizationId: unknown, targetUserId: unknown, role: unknown) =>
  changeMemberRoleAs(db, await staffActor(db, organizationId), targetUserId, role)

export const staffRemoveMember = async (db: Db, organizationId: unknown, targetUserId: unknown) =>
  removeMemberAs(db, await staffActor(db, organizationId), targetUserId)

export const staffTransferOwnership = async (db: Db, organizationId: unknown, targetUserId: unknown) =>
  transferOwnershipAs(db, await staffActor(db, organizationId), targetUserId)

export const staffRevokeInvite = async (db: Db, organizationId: unknown, inviteId: unknown) =>
  revokeInviteAs(db, await staffActor(db, organizationId), inviteId)

export const staffResendInvite = async (db: Db, organizationId: unknown, inviteId: unknown) =>
  resendInviteAs(db, await staffActor(db, organizationId), inviteId)

/** Switches the workspace the dashboard shows. */
export async function setActiveWorkspace(db: Db, userId: string, organizationId: unknown): Promise<void> {
  if (typeof organizationId !== "string" || !UUID.test(organizationId)) throw new AuthError("not_found", "You aren't in this workspace")
  const { rows } = await db.query(
    `update app.users u set active_organization_id = $2
      where u.id = $1 and exists (select 1 from app.organization_members m where m.organization_id = $2 and m.user_id = $1)
      returning u.id`,
    [userId, organizationId],
  )
  if (!rows.length) throw new AuthError("not_found", "You aren't in this workspace")
}
