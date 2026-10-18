import { inTransaction, type Queryable } from "./db.ts"
import { AdminError } from "./admin.ts"
import type { ActionChange } from "./admin-users.ts"
import type { ListSpec } from "./admin-list.ts"
import { touchWorkspaceBots, type MemberRole } from "./bots.ts"
import { CRAWL_PAGE_CEILING, PLAN_LIMITS, PLANS, type Plan } from "./plans.ts"
import {
  staffChangeMemberRole,
  staffRemoveMember,
  staffResendInvite,
  staffRevokeInvite,
  staffTransferOwnership,
  teamInvites,
  teamMembers,
  type InviteRole,
  type TeamInvite,
  type TeamMember,
} from "./team.ts"

// One workspace in the admin area (/admin/workspaces/[id]) and what staff can do to it. Like the user
// actions (admin-users.ts), each runs in the caller's transaction (withAdminAction) and returns the
// state before and after for the audit entry. Team changes go through team.ts's staff wrappers, so
// the rules that protect a workspace (it always keeps an owner, the team limits) are the same ones
// its owners work under.

export const WORKSPACE_AUDIT_LIMIT = 50
export const ADMIN_NOTE_MAX = 5000
/** The audit action a plan change is written as; the plan timeline reads these back. */
export const PLAN_AUDIT_ACTION = "organization.plan"

export type WorkspaceSize = "1-50" | "51-200" | "201-1000" | "1000+"
export const WORKSPACE_SIZES: readonly WorkspaceSize[] = ["1-50", "51-200", "201-1000", "1000+"]

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

// Latest sign of use: a conversation on one of its sites, or a member signing in
const LAST_ACTIVITY = `greatest(
  (select max(c.updated_at) from app.conversations c join app.bots cb on cb.id = c.bot_id where cb.organization_id = o.id),
  (select max(lu.last_login_at) from app.organization_members lm join app.users lu on lu.id = lm.user_id where lm.organization_id = o.id))`

// --- List ---

export interface AdminWorkspaceRow {
  id: string
  name: string
  plan: Plan
  size: WorkspaceSize | null
  members: number
  bots: number
  /** Email of the longest-serving owner. */
  owner_email: string | null
  last_activity_at: Date | null
  suspended_at: Date | null
  created_at: Date
}

/** Every workspace on the platform, for /admin/workspaces. */
export const ADMIN_WORKSPACES_LIST = {
  select: `o.id, o.name, o.plan, o.size,
    (select count(*)::int from app.organization_members m where m.organization_id = o.id) as members,
    (select count(*)::int from app.bots b where b.organization_id = o.id) as bots,
    (select u.email from app.organization_members m join app.users u on u.id = m.user_id
      where m.organization_id = o.id and m.role = 'owner' order by m.created_at limit 1) as owner_email,
    ${LAST_ACTIVITY} as last_activity_at,
    o.suspended_at, o.created_at`,
  from: "app.organizations o",
  id: { sql: "o.id", type: "uuid" },
  sorts: {
    created: { sql: "o.created_at", type: "timestamptz" },
    name: { sql: "lower(o.name)", type: "text" },
    members: { sql: "(select count(*)::int from app.organization_members m where m.organization_id = o.id)", type: "int" },
    bots: { sql: "(select count(*)::int from app.bots b where b.organization_id = o.id)", type: "int" },
    lastActivity: { sql: `coalesce(${LAST_ACTIVITY}, '-infinity')`, type: "timestamptz" },
  },
  defaultSort: { key: "created", dir: "desc" },
  search: [
    "o.name",
    "o.id::text",
    // members' emails, as one string the search can match
    "coalesce((select string_agg(su.email, ' ') from app.organization_members sm join app.users su on su.id = sm.user_id where sm.organization_id = o.id), '')",
  ],
  filters: {
    plan: Object.fromEntries(PLANS.map((p) => [p, `o.plan = '${p}'`])),
    suspended: { yes: "o.suspended_at is not null", no: "o.suspended_at is null" },
    size: { ...Object.fromEntries(WORKSPACE_SIZES.map((s) => [s, `o.size = '${s}'`])), none: "o.size is null" },
    created: {
      "7d": "o.created_at >= now() - interval '7 days'",
      "30d": "o.created_at >= now() - interval '30 days'",
      "90d": "o.created_at >= now() - interval '90 days'",
      "365d": "o.created_at >= now() - interval '365 days'",
      older: "o.created_at < now() - interval '365 days'",
    },
  },
} satisfies ListSpec

// --- Plan change preview ---

export type PlanLimitKey = keyof (typeof PLAN_LIMITS)[Plan]

export interface PlanLimitChange {
  key: PlanLimitKey
  from: number
  to: number
  /** What actually applies after technical ceilings (website pages: CRAWL_PAGE_CEILING). */
  effectiveFrom: number
  effectiveTo: number
}

export interface PlanPreview {
  plan: Plan
  /** Every limit of the plan, changed or not. */
  limits: PlanLimitChange[]
  /** Website sources holding more pages than the new plan reads; they shrink on their next sync. */
  overLimit: { sourceId: string; title: string; botId: string; botName: string; pages: number; limit: number }[]
}

const CEILINGS: Partial<Record<PlanLimitKey, number>> = { websitePages: CRAWL_PAGE_CEILING }
const effective = (key: PlanLimitKey, value: number) => Math.min(value, CEILINGS[key] ?? Infinity)

/** How each limit moves from one plan to another. */
export function planLimitChanges(from: Plan, to: Plan): PlanLimitChange[] {
  return (Object.keys(PLAN_LIMITS[to]) as PlanLimitKey[]).map((key) => ({
    key,
    from: PLAN_LIMITS[from][key],
    to: PLAN_LIMITS[to][key],
    effectiveFrom: effective(key, PLAN_LIMITS[from][key]),
    effectiveTo: effective(key, PLAN_LIMITS[to][key]),
  }))
}

interface WebsiteSource {
  sourceId: string
  title: string
  botId: string
  botName: string
  pages: number
}

function planPreview(from: Plan, to: Plan, sources: WebsiteSource[]): PlanPreview {
  const limit = effective("websitePages", PLAN_LIMITS[to].websitePages)
  return {
    plan: to,
    limits: planLimitChanges(from, to),
    overLimit: sources.filter((s) => s.pages > limit).map((s) => ({ ...s, limit })),
  }
}

// --- Detail ---

export interface AdminWorkspace {
  id: string
  name: string
  plan: Plan
  size: WorkspaceSize | null
  suspendedAt: Date | null
  suspendedReason: string | null
  adminNote: string | null
  lastActivityAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface AdminWorkspaceMember extends TeamMember {
  lastLoginAt: Date | null
  /** Whether this is the only workspace they belong to. */
  onlyWorkspace: boolean
}

export interface AdminWorkspaceSite {
  id: string
  name: string
  allowedOrigins: string[]
  disabledAt: Date | null
  widgetSeenAt: Date | null
  conversations: number
  sources: number
  pages: number
  createdAt: Date
}

export interface PlanHistoryEntry {
  id: string
  from: Plan | null
  to: Plan | null
  reason: string | null
  actorId: string | null
  actorName: string | null
  createdAt: Date
}

export interface WorkspaceAuditEntry {
  id: string
  action: string
  reason: string | null
  actorId: string | null
  actorName: string | null
  before: unknown
  after: unknown
  createdAt: Date
}

/** What deleting the workspace removes, and who gets a new empty workspace because it was their only one. */
export interface WorkspaceDeletionImpact {
  sites: number
  conversations: number
  sources: number
  members: number
  rehomed: { userId: string; email: string }[]
}

export interface AdminWorkspaceDetail {
  workspace: AdminWorkspace
  members: AdminWorkspaceMember[]
  invites: TeamInvite[]
  sites: AdminWorkspaceSite[]
  /** Oldest first: plan changes made in the admin area. */
  planHistory: PlanHistoryEntry[]
  /** One per other plan, for the change-plan dialog. */
  planPreviews: PlanPreview[]
  audit: WorkspaceAuditEntry[]
  deletion: WorkspaceDeletionImpact
}

const asPlan = (raw: unknown): Plan | null => (PLANS.includes(raw as Plan) ? (raw as Plan) : null)

async function deletionImpact(q: Queryable, organizationId: string): Promise<WorkspaceDeletionImpact> {
  const [counts, rehomed] = await Promise.all([
    q.query<Omit<WorkspaceDeletionImpact, "rehomed">>(
      `select (select count(*)::int from app.bots b where b.organization_id = $1) as sites,
              (select count(*)::int from app.conversations c join app.bots b on b.id = c.bot_id where b.organization_id = $1) as conversations,
              (select count(*)::int from app.knowledge_sources s join app.bots b on b.id = s.bot_id where b.organization_id = $1) as sources,
              (select count(*)::int from app.organization_members m where m.organization_id = $1) as members`,
      [organizationId],
    ),
    q.query<{ userId: string; email: string }>(
      `select u.id as "userId", u.email
         from app.organization_members m join app.users u on u.id = m.user_id
        where m.organization_id = $1
          and not exists (select 1 from app.organization_members x where x.user_id = m.user_id and x.organization_id <> $1)
        order by u.email`,
      [organizationId],
    ),
  ])
  return { ...counts.rows[0]!, rehomed: rehomed.rows }
}

/** Everything the detail page shows; null when there is no such workspace. Staff only: check before calling. */
export async function getAdminWorkspaceDetail(q: Queryable, organizationId: string): Promise<AdminWorkspaceDetail | null> {
  if (!isUuid(organizationId)) return null
  const ws = await q.query<AdminWorkspace>(
    `select o.id, o.name, o.plan, o.size, o.suspended_at as "suspendedAt", o.suspended_reason as "suspendedReason",
            o.admin_note as "adminNote", ${LAST_ACTIVITY} as "lastActivityAt", o.created_at as "createdAt", o.updated_at as "updatedAt"
       from app.organizations o where o.id = $1`,
    [organizationId],
  )
  const workspace = ws.rows[0]
  if (!workspace) return null

  const [members, extra, invites, sites, sources, history, audit, deletion] = await Promise.all([
    teamMembers(q, organizationId),
    q.query<{ userId: string; lastLoginAt: Date | null; onlyWorkspace: boolean }>(
      `select m.user_id as "userId", u.last_login_at as "lastLoginAt",
              not exists (select 1 from app.organization_members x where x.user_id = m.user_id and x.organization_id <> $1) as "onlyWorkspace"
         from app.organization_members m join app.users u on u.id = m.user_id
        where m.organization_id = $1`,
      [organizationId],
    ),
    teamInvites(q, organizationId),
    q.query<AdminWorkspaceSite & { settings: unknown }>(
      `select b.id, b.name, b.settings, b.disabled_at as "disabledAt", a.widget_seen_at as "widgetSeenAt",
              (select count(*)::int from app.conversations c where c.bot_id = b.id) as conversations,
              (select count(*)::int from app.knowledge_sources s where s.bot_id = b.id) as sources,
              (select coalesce(sum(s.pages), 0)::int from app.knowledge_sources s where s.bot_id = b.id) as pages,
              b.created_at as "createdAt"
         from app.bots b left join app.bot_activity a on a.bot_id = b.id
        where b.organization_id = $1
        order by b.created_at, b.id`,
      [organizationId],
    ),
    q.query<WebsiteSource>(
      `select s.id as "sourceId", s.title, b.id as "botId", b.name as "botName", s.pages
         from app.knowledge_sources s join app.bots b on b.id = s.bot_id
        where b.organization_id = $1 and s.kind = 'website'
        order by s.pages desc, s.id`,
      [organizationId],
    ),
    q.query<{ id: string; before: { plan?: unknown } | null; after: { plan?: unknown } | null; reason: string | null; actorId: string | null; actorName: string | null; createdAt: Date }>(
      `select l.id::text, l.before, l.after, l.reason, l.actor_id as "actorId", coalesce(a.display_name, a.username, l.actor_email) as "actorName", l.created_at as "createdAt"
         from app.admin_audit_log l left join app.users a on a.id = l.actor_id
        where l.target_type = 'organization' and l.target_id = $1 and l.action = $2
        order by l.id`,
      [organizationId, PLAN_AUDIT_ACTION],
    ),
    q.query<WorkspaceAuditEntry>(
      `select l.id::text, l.action, l.reason, l.actor_id as "actorId", coalesce(a.display_name, a.username, l.actor_email) as "actorName",
              l.before, l.after, l.created_at as "createdAt"
         from app.admin_audit_log l left join app.users a on a.id = l.actor_id
        where l.target_type = 'organization' and l.target_id = $1
        order by l.id desc limit $2`,
      [organizationId, WORKSPACE_AUDIT_LIMIT],
    ),
    deletionImpact(q, organizationId),
  ])

  const byUser = new Map(extra.rows.map((r) => [r.userId, r]))
  return {
    workspace,
    members: members.map((m) => ({ ...m, lastLoginAt: byUser.get(m.userId)?.lastLoginAt ?? null, onlyWorkspace: byUser.get(m.userId)?.onlyWorkspace ?? false })),
    invites,
    sites: sites.rows.map(({ settings, ...site }) => {
      const s = (typeof settings === "string" ? JSON.parse(settings) : settings) as { security?: { allowedOrigins?: unknown } } | null
      const origins = s?.security?.allowedOrigins
      return { ...site, allowedOrigins: Array.isArray(origins) ? origins.filter((o): o is string => typeof o === "string") : [] }
    }),
    planHistory: history.rows.map((r) => ({
      id: r.id,
      from: asPlan(r.before?.plan),
      to: asPlan(r.after?.plan),
      reason: r.reason,
      actorId: r.actorId,
      actorName: r.actorName,
      createdAt: r.createdAt,
    })),
    planPreviews: PLANS.filter((p) => p !== workspace.plan).map((p) => planPreview(workspace.plan, p, sources.rows)),
    audit: audit.rows,
    deletion,
  }
}

// --- Actions ---

interface WorkspaceRow {
  id: string
  name: string
  plan: Plan
  suspended_at: Date | null
  suspended_reason: string | null
  admin_note: string | null
}

async function lockWorkspace(tx: Queryable, organizationId: string): Promise<WorkspaceRow> {
  if (!isUuid(organizationId)) throw new AdminError("not_found", "Workspace not found")
  const { rows } = await tx.query<WorkspaceRow>(
    "select id, name, plan, suspended_at, suspended_reason, admin_note from app.organizations where id = $1 for update",
    [organizationId],
  )
  if (!rows[0]) throw new AdminError("not_found", "Workspace not found")
  return rows[0]
}

/** Moves the workspace to another plan. Limits apply from the next sync of each website. */
export async function adminSetPlan(tx: Queryable, organizationId: string, rawPlan: unknown): Promise<ActionChange<{ limits: PlanLimitChange[] }>> {
  const plan = asPlan(rawPlan)
  if (!plan) throw new AdminError("invalid_input", "Choose a plan")
  const ws = await lockWorkspace(tx, organizationId)
  if (ws.plan === plan) throw new AdminError("invalid_input", "The workspace is already on this plan")
  await tx.query("update app.organizations set plan = $2 where id = $1", [organizationId, plan])
  const limits = planLimitChanges(ws.plan, plan)
  return {
    before: { plan: ws.plan, limits: Object.fromEntries(limits.map((l) => [l.key, l.from])) },
    after: { plan, limits: Object.fromEntries(limits.map((l) => [l.key, l.to])) },
    extra: { limits },
  }
}

/** Suspends the workspace: none of its sites answer in the widget until it is lifted. `reason` is for staff only. */
export async function adminSuspendWorkspace(tx: Queryable, organizationId: string, reason: string): Promise<ActionChange<{ sites: number }>> {
  const ws = await lockWorkspace(tx, organizationId)
  if (ws.suspended_at) throw new AdminError("invalid_input", "This workspace is already suspended")
  const { rows } = await tx.query<{ suspended_at: Date }>(
    "update app.organizations set suspended_at = now(), suspended_reason = $2 where id = $1 returning suspended_at",
    [organizationId, reason.slice(0, 1000)],
  )
  // the chat API's sync pauses them on its next pass: their widgets say "out of service"
  const sites = await touchWorkspaceBots(tx, organizationId)
  return { before: { suspendedAt: null }, after: { suspendedAt: rows[0]!.suspended_at, sites }, extra: { sites } }
}

/** Lifts a suspension; its sites answer again from the chat API's next sync. */
export async function adminUnsuspendWorkspace(tx: Queryable, organizationId: string): Promise<ActionChange<{ sites: number }>> {
  const ws = await lockWorkspace(tx, organizationId)
  if (!ws.suspended_at) throw new AdminError("invalid_input", "This workspace isn't suspended")
  await tx.query("update app.organizations set suspended_at = null, suspended_reason = null where id = $1", [organizationId])
  // the sync only reloads bots changed since its last pass
  const sites = await touchWorkspaceBots(tx, organizationId)
  return { before: { suspendedAt: ws.suspended_at, suspendedReason: ws.suspended_reason }, after: { suspendedAt: null, sites }, extra: { sites } }
}

/**
 * Deletes the workspace with its sites, knowledge and conversations. Members for whom it was the only
 * workspace get a new empty one of their own, as at sign-up. `confirmName` must be the workspace name.
 */
export async function adminDeleteWorkspace(tx: Queryable, organizationId: string, confirmName: unknown): Promise<ActionChange<{ rehomed: number }>> {
  const ws = await lockWorkspace(tx, organizationId)
  if (typeof confirmName !== "string" || confirmName.trim() !== ws.name.trim()) {
    throw new AdminError("invalid_input", "Type the workspace's name exactly to confirm")
  }
  const impact = await deletionImpact(tx, organizationId)
  const members = await tx.query<{ user_id: string; role: MemberRole }>("select user_id, role from app.organization_members where organization_id = $1", [organizationId])
  await tx.query("delete from app.organizations where id = $1", [organizationId])
  for (const { userId } of impact.rehomed) {
    const { rows } = await tx.query<{ id: string }>(
      "insert into app.organizations (name) select left(username, 120) from app.users where id = $1 returning id",
      [userId],
    )
    await tx.query("insert into app.organization_members (organization_id, user_id, role) values ($1, $2, 'owner')", [rows[0]!.id, userId])
  }
  return {
    before: {
      name: ws.name,
      plan: ws.plan,
      members: members.rows.map((m) => ({ userId: m.user_id, role: m.role })),
      sites: impact.sites,
      conversations: impact.conversations,
      sources: impact.sources,
    },
    after: { rehomed: impact.rehomed.map((r) => r.userId) },
    extra: { rehomed: impact.rehomed.length },
  }
}

/** Replaces the staff note on the workspace; an empty note clears it. Members never see it. */
export async function adminSetWorkspaceNote(tx: Queryable, organizationId: string, rawNote: unknown): Promise<ActionChange> {
  const note = typeof rawNote === "string" ? rawNote.trim() : ""
  if (note.length > ADMIN_NOTE_MAX) throw new AdminError("invalid_input", "A note can be at most 5000 characters")
  const ws = await lockWorkspace(tx, organizationId)
  if ((ws.admin_note ?? "") === note) throw new AdminError("invalid_input", "The note hasn't changed")
  await tx.query("update app.organizations set admin_note = $2 where id = $1", [organizationId, note || null])
  return { before: { adminNote: ws.admin_note }, after: { adminNote: note || null }, extra: {} }
}

// Team changes: team.ts does the work and keeps its rules; these lock nothing extra and only shape the audit.

export async function adminChangeMemberRole(tx: Queryable, organizationId: string, userId: string, role: unknown): Promise<ActionChange> {
  const c = await staffChangeMemberRole(inTransaction(tx), organizationId, userId, role)
  if (c.before === c.after) throw new AdminError("invalid_input", "This person already has that role")
  return { before: { userId, role: c.before }, after: { userId, role: c.after }, extra: {} }
}

export async function adminRemoveMember(tx: Queryable, organizationId: string, userId: string): Promise<ActionChange> {
  const c = await staffRemoveMember(inTransaction(tx), organizationId, userId)
  return { before: { userId, role: c.role }, after: null, extra: {} }
}

export async function adminTransferOwnership(tx: Queryable, organizationId: string, userId: string): Promise<ActionChange> {
  const c = await staffTransferOwnership(inTransaction(tx), organizationId, userId)
  return { before: { owners: c.previousOwners, newOwnerRole: c.before }, after: { owner: c.owner, demotedToAdmin: c.previousOwners }, extra: {} }
}

export async function adminRevokeInvite(tx: Queryable, organizationId: string, inviteId: string): Promise<ActionChange> {
  const c = await staffRevokeInvite(inTransaction(tx), organizationId, inviteId)
  return { before: { inviteId, email: c.email, role: c.role }, after: null, extra: {} }
}

/** A fresh link for the invitation; the caller emails `token` once this commits. */
export async function adminResendInvite(
  tx: Queryable,
  organizationId: string,
  inviteId: string,
): Promise<ActionChange<{ email: string; role: InviteRole; token: string; workspaceName: string; inviter: string | null }>> {
  const c = await staffResendInvite(inTransaction(tx), organizationId, inviteId)
  return {
    before: { inviteId: c.previousId },
    after: { inviteId: c.invite.id, email: c.invite.email, role: c.invite.role, expiresAt: c.invite.expiresAt },
    extra: { email: c.invite.email, role: c.invite.role, token: c.token, workspaceName: c.workspaceName, inviter: c.invite.invitedBy },
  }
}
