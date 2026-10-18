import type { Db, Queryable } from "./db.ts"
import { AdminError } from "./admin.ts"
import type { ActionChange } from "./admin-users.ts"
import type { ListSpec } from "./admin-list.ts"
import { AuthError } from "./auth.ts"
import { BotError } from "./bots.ts"

// Support tickets. Customers file one from the dashboard's help menu and follow it at
// /dashboard/support; staff work the queue at /admin/support. Customers only ever see their own
// tickets and the public replies on them: staff-only notes (internal) never leave the admin area.
//
// The staff actions run in the caller's transaction (withAdminAction) and return the state before
// and after for the audit entry, like the other admin actions.

export const TICKET_CATEGORIES = ["bug", "billing", "knowledge", "widget", "account", "other"] as const
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const
export const TICKET_STATUSES = ["open", "pending_user", "in_progress", "resolved", "closed"] as const
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]
export type TicketStatus = (typeof TICKET_STATUSES)[number]

/** Hours staff have to answer the customer, by priority. */
export const SUPPORT_SLA_HOURS: Record<TicketPriority, number> = { urgent: 4, high: 8, normal: 24, low: 72 }
/** Statuses where the ticket is still being worked on. */
export const ACTIVE_TICKET_STATUSES: readonly TicketStatus[] = ["open", "pending_user", "in_progress"]

export const TICKET_SUBJECT_MAX = 200
export const TICKET_BODY_MAX = 10_000
const CONTEXT_TEXT_MAX = 500
const ERROR_TEXT_MAX = 1000
const LOCALES = ["en", "tr", "lt", "lv", "et"] as const
type TicketLocale = (typeof LOCALES)[number]

const isUuid = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
const includes = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value)
// control and format characters out; newlines and tabs stay in bodies
const stripControls = (s: string, keepLines: boolean) => s.replace(keepLines ? /[^\P{Cc}\n\t]|\p{Cf}/gu : /[\p{Cc}\p{Cf}]/gu, "")

/** "#1042", as customers and staff quote a ticket. */
export const ticketRef = (number: number | string) => `#${number}`

// --- Input ---

function cleanSubject(raw: unknown): string {
  if (typeof raw !== "string") throw new AuthError("invalid_input", "Write a subject")
  const subject = stripControls(raw.replace(/\s+/g, " "), false).trim()
  if (!subject) throw new AuthError("invalid_input", "Write a subject")
  if (subject.length > TICKET_SUBJECT_MAX) throw new AuthError("invalid_input", "The subject can be at most 200 characters")
  return subject
}

/** A message body: trimmed, control characters dropped. Throws `make(…)` errors so both sides can use it. */
function cleanBody(raw: unknown, make: (message: string) => Error): string {
  if (typeof raw !== "string") throw make("Write a message")
  const body = stripControls(raw, true).replace(/\r\n?/g, "\n").trim()
  if (!body) throw make("Write a message")
  if (body.length > TICKET_BODY_MAX) throw make("A message can be at most 10000 characters")
  return body
}

const text = (raw: unknown, max: number) => (typeof raw === "string" ? stripControls(raw, false).trim().slice(0, max) || null : null)

/** What the dashboard attached to a ticket by itself. Everything is optional and reported by the browser. */
export interface TicketContext {
  site?: { id: string; name: string }
  page?: string
  browser?: { userAgent?: string; language?: string; timeZone?: string; viewport?: string; platform?: string }
  lastError?: { message: string; source?: string; at?: string }
}

/**
 * Keeps only the fields and sizes the context may have, whatever the browser sent. The site is
 * filled in by the server (the ticket's bot), not taken from the request.
 */
export function cleanTicketContext(raw: unknown, serverUserAgent?: string | null): TicketContext {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const out: TicketContext = {}

  const page = text(r.page, CONTEXT_TEXT_MAX)
  // a path inside the app, never a full URL that could carry someone else's query string
  if (page && page.startsWith("/") && !page.startsWith("//")) out.page = page

  const b = r.browser && typeof r.browser === "object" ? (r.browser as Record<string, unknown>) : {}
  const browser = {
    userAgent: text(serverUserAgent, CONTEXT_TEXT_MAX) ?? text(b.userAgent, CONTEXT_TEXT_MAX),
    language: text(b.language, 35),
    timeZone: text(b.timeZone, 64),
    viewport: typeof b.viewport === "string" && /^\d{1,5}x\d{1,5}$/.test(b.viewport) ? b.viewport : null,
    platform: text(b.platform, 64),
  }
  const kept = Object.fromEntries(Object.entries(browser).filter(([, v]) => v)) as TicketContext["browser"]
  if (kept && Object.keys(kept).length) out.browser = kept

  const e = r.lastError && typeof r.lastError === "object" ? (r.lastError as Record<string, unknown>) : null
  const message = e && text(e.message, ERROR_TEXT_MAX)
  if (e && message) {
    const at = typeof e.at === "string" && !Number.isNaN(Date.parse(e.at)) ? new Date(e.at).toISOString() : undefined
    const source = text(e.source, CONTEXT_TEXT_MAX) ?? undefined
    out.lastError = { message, ...(source && { source }), ...(at && { at }) }
  }
  return out
}

// --- Rows ---

export interface SupportTicket {
  id: string
  number: number
  organizationId: string
  userId: string | null
  botId: string | null
  subject: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  assigneeId: string | null
  slaDueAt: Date | null
  locale: TicketLocale
  context: TicketContext
  createdAt: Date
  updatedAt: Date
}

const TICKET_COLUMNS = `t.id, t.number::int as number, t.organization_id as "organizationId", t.user_id as "userId", t.bot_id as "botId",
  t.subject, t.category, t.priority, t.status, t.assignee_id as "assigneeId", t.sla_due_at as "slaDueAt", t.locale, t.context,
  t.created_at as "createdAt", t.updated_at as "updatedAt"`

const parseContext = <T extends { context: unknown }>(row: T): T => ({ ...row, context: typeof row.context === "string" ? JSON.parse(row.context) : row.context ?? {} })

export interface TicketMessage {
  id: string
  body: string
  fromStaff: boolean
  internal: boolean
  authorId: string | null
  /** Display name or username; null when the account is gone. */
  authorName: string | null
  createdAt: Date
}

const MESSAGE_COLUMNS = `m.id, m.body, m.from_staff as "fromStaff", m.internal, m.author_id as "authorId",
  coalesce(u.display_name, u.username) as "authorName", m.created_at as "createdAt"`

async function loadMessages(q: Queryable, ticketId: string, withInternal: boolean): Promise<TicketMessage[]> {
  const { rows } = await q.query<TicketMessage>(
    `select ${MESSAGE_COLUMNS} from app.support_messages m left join app.users u on u.id = m.author_id
      where m.ticket_id = $1 ${withInternal ? "" : "and not m.internal"} order by m.created_at, m.id`,
    [ticketId],
  )
  return rows
}

async function lockTicket(q: Queryable, ticketId: string): Promise<SupportTicket | null> {
  if (!isUuid(ticketId)) return null
  const { rows } = await q.query<SupportTicket>(`select ${TICKET_COLUMNS} from app.support_tickets t where t.id = $1 for update`, [ticketId])
  return rows[0] ? parseContext(rows[0]) : null
}

const slaInterval = (priority: TicketPriority) => `${SUPPORT_SLA_HOURS[priority]} hours`

// --- Customer side ---

export interface NewTicketInput {
  subject: unknown
  category: unknown
  body: unknown
  /** The site the dashboard was showing; ignored unless the user can see it. */
  botId?: unknown
  context?: unknown
  locale?: unknown
  /** The request's user agent, preferred over the one the browser reported. */
  userAgent?: string | null
}

/** Who to tell about a ticket, for the caller's emails once the transaction commits. */
export interface TicketMailInfo {
  ticket: { id: string; number: number; subject: string; locale: TicketLocale; status: TicketStatus }
  customer: { email: string; name: string } | null
  assignee: { email: string; name: string } | null
  workspace: string
  site: string | null
}

async function mailInfo(q: Queryable, ticketId: string): Promise<TicketMailInfo> {
  const { rows } = await q.query<{
    id: string
    number: number
    subject: string
    locale: TicketLocale
    status: TicketStatus
    customerEmail: string | null
    customerName: string | null
    customerSuspended: boolean
    assigneeEmail: string | null
    assigneeName: string | null
    workspace: string
    site: string | null
  }>(
    `select t.id, t.number::int as number, t.subject, t.locale, t.status,
            cu.email as "customerEmail", coalesce(cu.display_name, cu.username) as "customerName", cu.suspended_at is not null as "customerSuspended",
            au.email as "assigneeEmail", coalesce(au.display_name, au.username) as "assigneeName",
            o.name as workspace, b.name as site
       from app.support_tickets t
       join app.organizations o on o.id = t.organization_id
       left join app.bots b on b.id = t.bot_id
       left join app.users cu on cu.id = t.user_id
       left join app.users au on au.id = t.assignee_id and au.platform_role is not null and au.suspended_at is null
      where t.id = $1`,
    [ticketId],
  )
  const r = rows[0]!
  return {
    ticket: { id: r.id, number: r.number, subject: r.subject, locale: r.locale, status: r.status },
    customer: r.customerEmail && !r.customerSuspended ? { email: r.customerEmail, name: r.customerName ?? "" } : null,
    assignee: r.assigneeEmail ? { email: r.assigneeEmail, name: r.assigneeName ?? "" } : null,
    workspace: r.workspace,
    site: r.site,
  }
}

/**
 * Files a ticket for the user, in the workspace of the site they were looking at (or their first
 * workspace when they named none they can see), with their first message.
 */
export async function createTicket(db: Db, userId: string, input: NewTicketInput): Promise<{ ticket: SupportTicket; mail: TicketMailInfo }> {
  const subject = cleanSubject(input.subject)
  if (!includes(TICKET_CATEGORIES, input.category)) throw new AuthError("invalid_input", "Choose a category")
  const body = cleanBody(input.body, (m) => new AuthError("invalid_input", m))
  const locale: TicketLocale = includes(LOCALES, input.locale) ? input.locale : "en"
  const context = cleanTicketContext(input.context, input.userAgent)

  return db.transaction(async (tx) => {
    // the membership join keeps other workspaces' sites out
    const site = isUuid(input.botId)
      ? (
          await tx.query<{ id: string; name: string; organizationId: string }>(
            `select b.id, b.name, b.organization_id as "organizationId" from app.bots b
               join app.organization_members m on m.organization_id = b.organization_id and m.user_id = $1
              where b.id = $2`,
            [userId, input.botId],
          )
        ).rows[0]
      : undefined
    let organizationId = site?.organizationId
    if (!organizationId) {
      const ws = await tx.query<{ id: string }>("select organization_id as id from app.organization_members where user_id = $1 order by created_at limit 1", [userId])
      organizationId = ws.rows[0]?.id
    }
    if (!organizationId) throw new BotError("not_found", "Workspace not found")
    if (site) context.site = { id: site.id, name: site.name }

    const { rows } = await tx.query<SupportTicket>(
      `insert into app.support_tickets as t (organization_id, user_id, bot_id, subject, category, locale, context, sla_due_at)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, now() + $8::interval) returning ${TICKET_COLUMNS}`,
      [organizationId, userId, site?.id ?? null, subject, input.category, locale, JSON.stringify(context), slaInterval("normal")],
    )
    const ticket = parseContext(rows[0]!)
    await tx.query("insert into app.support_messages (ticket_id, author_id, body) values ($1, $2, $3)", [ticket.id, userId, body])
    return { ticket, mail: await mailInfo(tx, ticket.id) }
  })
}

export interface UserTicketRow {
  id: string
  number: number
  subject: string
  category: TicketCategory
  status: TicketStatus
  siteName: string | null
  messages: number
  /** Whether the newest public message is from staff: an answer the customer may not have read. */
  lastFromStaff: boolean
  createdAt: Date
  updatedAt: Date
}

/** The user's own tickets, newest activity first. */
export async function listUserTickets(q: Queryable, userId: string, limit = 100): Promise<UserTicketRow[]> {
  const { rows } = await q.query<UserTicketRow>(
    `select t.id, t.number::int as number, t.subject, t.category, t.status, b.name as "siteName",
            (select count(*)::int from app.support_messages m where m.ticket_id = t.id and not m.internal) as messages,
            coalesce((select m.from_staff from app.support_messages m where m.ticket_id = t.id and not m.internal order by m.created_at desc, m.id desc limit 1), false) as "lastFromStaff",
            t.created_at as "createdAt", t.updated_at as "updatedAt"
       from app.support_tickets t left join app.bots b on b.id = t.bot_id
      where t.user_id = $1 order by t.updated_at desc, t.id desc limit $2`,
    [userId, limit],
  )
  return rows
}

export interface UserTicket {
  ticket: Omit<SupportTicket, "assigneeId" | "slaDueAt" | "context" | "priority"> & { siteName: string | null }
  /** Public messages only. Staff replies carry no name: they come from the support team. */
  messages: (Omit<TicketMessage, "internal" | "authorId" | "authorName"> & { authorName: string | null })[]
}

/** One of the user's own tickets with its public messages; null when it isn't theirs. */
export async function getUserTicket(q: Queryable, userId: string, ticketId: string): Promise<UserTicket | null> {
  if (!isUuid(ticketId)) return null
  const { rows } = await q.query<UserTicket["ticket"]>(
    `select t.id, t.number::int as number, t.organization_id as "organizationId", t.user_id as "userId", t.bot_id as "botId",
            t.subject, t.category, t.status, t.locale, t.created_at as "createdAt", t.updated_at as "updatedAt", b.name as "siteName"
       from app.support_tickets t left join app.bots b on b.id = t.bot_id
      where t.id = $1 and t.user_id = $2`,
    [ticketId, userId],
  )
  const ticket = rows[0]
  if (!ticket) return null
  const messages = (await loadMessages(q, ticketId, false)).map((m) => ({
    id: m.id,
    body: m.body,
    fromStaff: m.fromStaff,
    authorName: m.fromStaff ? null : m.authorName,
    createdAt: m.createdAt,
  }))
  return { ticket, messages }
}

async function lockUserTicket(tx: Queryable, userId: string, ticketId: string) {
  const ticket = await lockTicket(tx, ticketId)
  if (!ticket || ticket.userId !== userId) throw new BotError("not_found", "Ticket not found")
  return ticket
}

/**
 * The customer writes on their ticket. It goes back to "open" and staff owe an answer again
 * (unless a deadline is already running). A closed ticket takes no more messages.
 */
export async function replyAsUser(db: Db, userId: string, ticketId: string, rawBody: unknown): Promise<{ mail: TicketMailInfo }> {
  const body = cleanBody(rawBody, (m) => new AuthError("invalid_input", m))
  return db.transaction(async (tx) => {
    const ticket = await lockUserTicket(tx, userId, ticketId)
    if (ticket.status === "closed") throw new BotError("conflict", "This ticket is closed. Open a new one")
    await tx.query("insert into app.support_messages (ticket_id, author_id, body) values ($1, $2, $3)", [ticket.id, userId, body])
    await tx.query(
      `update app.support_tickets set status = case when status = 'in_progress' then status else 'open' end,
              sla_due_at = coalesce(sla_due_at, now() + $2::interval), updated_at = now() where id = $1`,
      [ticket.id, slaInterval(ticket.priority)],
    )
    return { mail: await mailInfo(tx, ticket.id) }
  })
}

/** The customer says it's sorted. */
export async function resolveAsUser(db: Db, userId: string, ticketId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const ticket = await lockUserTicket(tx, userId, ticketId)
    if (ticket.status === "resolved" || ticket.status === "closed") return
    await tx.query("update app.support_tickets set status = 'resolved', sla_due_at = null where id = $1", [ticket.id])
  })
}

// --- Staff: list ---

export interface AdminTicketRow {
  id: string
  number: number
  subject: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  sla_due_at: Date | null
  organization_id: string
  organization_name: string
  user_email: string | null
  bot_name: string | null
  assignee_id: string | null
  assignee_name: string | null
  messages: number
  created_at: Date
  updated_at: Date
}

const OVERDUE = "t.sla_due_at < now()"

/** Every ticket on the platform, for /admin/support. */
export const ADMIN_TICKETS_LIST = {
  select: `t.id, t.number::int as number, t.subject, t.category, t.priority, t.status, t.sla_due_at,
    o.id as organization_id, o.name as organization_name, cu.email as user_email, b.name as bot_name,
    t.assignee_id, coalesce(au.display_name, au.username) as assignee_name,
    (select count(*)::int from app.support_messages m where m.ticket_id = t.id and not m.internal) as messages,
    t.created_at, t.updated_at`,
  from: `app.support_tickets t
    join app.organizations o on o.id = t.organization_id
    left join app.users cu on cu.id = t.user_id
    left join app.bots b on b.id = t.bot_id
    left join app.users au on au.id = t.assignee_id`,
  id: { sql: "t.id", type: "uuid" },
  sorts: {
    updated: { sql: "t.updated_at", type: "timestamptz" },
    created: { sql: "t.created_at", type: "timestamptz" },
    number: { sql: "t.number", type: "bigint" },
    // tickets without a deadline go last
    sla: { sql: "coalesce(t.sla_due_at, 'infinity')", type: "timestamptz" },
    priority: { sql: "case t.priority when 'urgent' then 4 when 'high' then 3 when 'normal' then 2 else 1 end", type: "int" },
  },
  defaultSort: { key: "updated", dir: "desc" },
  search: ["t.subject", "t.number::text", "('#' || t.number)", "coalesce(cu.email, '')", "o.name", "coalesce(b.name, '')"],
  filters: {
    status: {
      active: `t.status in (${ACTIVE_TICKET_STATUSES.map((s) => `'${s}'`).join(", ")})`,
      ...Object.fromEntries(TICKET_STATUSES.map((s) => [s, `t.status = '${s}'`])),
    },
    priority: Object.fromEntries(TICKET_PRIORITIES.map((p) => [p, `t.priority = '${p}'`])),
    category: Object.fromEntries(TICKET_CATEGORIES.map((c) => [c, `t.category = '${c}'`])),
    assigned: { yes: "t.assignee_id is not null", no: "t.assignee_id is null" },
    sla: {
      overdue: OVERDUE,
      soon: "t.sla_due_at >= now() and t.sla_due_at < now() + interval '4 hours'",
    },
  },
  valueFilters: {
    assignee: { sql: "t.assignee_id = {}", type: "uuid" },
    user: { sql: "t.user_id = {}", type: "uuid" },
    organization: { sql: "t.organization_id = {}", type: "uuid" },
    bot: { sql: "t.bot_id = {}", type: "uuid" },
  },
} satisfies ListSpec

/** How many active tickets are past their deadline or nobody has taken, for the queue's header. */
export async function supportQueueCounts(q: Queryable): Promise<{ active: number; overdue: number; unassigned: number }> {
  const { rows } = await q.query<{ active: number; overdue: number; unassigned: number }>(
    `select count(*)::int as active,
            count(*) filter (where ${OVERDUE})::int as overdue,
            count(*) filter (where t.assignee_id is null)::int as unassigned
       from app.support_tickets t where t.status in (${ACTIVE_TICKET_STATUSES.map((s) => `'${s}'`).join(", ")})`,
  )
  return rows[0]!
}

// --- Staff: detail ---

export interface StaffMember {
  id: string
  name: string
  email: string
}

/** Staff who can take a ticket: anyone with a platform role whose account is active. */
export async function listSupportStaff(q: Queryable): Promise<StaffMember[]> {
  const { rows } = await q.query<StaffMember>(
    `select id, coalesce(display_name, username) as name, email from app.users
      where platform_role is not null and suspended_at is null order by lower(coalesce(display_name, username))`,
  )
  return rows
}

export interface AdminTicketDetail {
  ticket: SupportTicket & {
    organizationName: string
    siteName: string | null
    customer: { id: string; email: string; name: string; suspended: boolean } | null
    assigneeName: string | null
  }
  messages: TicketMessage[]
  staff: StaffMember[]
  /** The customer's other tickets, newest first. */
  others: { id: string; number: number; subject: string; status: TicketStatus; createdAt: Date }[]
}

/** Everything the ticket page shows, internal notes included; null when there is no such ticket. Staff only. */
export async function getAdminTicket(q: Queryable, ticketId: string): Promise<AdminTicketDetail | null> {
  if (!isUuid(ticketId)) return null
  const { rows } = await q.query<SupportTicket & {
    organizationName: string
    siteName: string | null
    customerEmail: string | null
    customerName: string | null
    customerSuspended: boolean | null
    assigneeName: string | null
  }>(
    `select ${TICKET_COLUMNS}, o.name as "organizationName", b.name as "siteName",
            cu.email as "customerEmail", coalesce(cu.display_name, cu.username) as "customerName", cu.suspended_at is not null as "customerSuspended",
            coalesce(au.display_name, au.username) as "assigneeName"
       from app.support_tickets t
       join app.organizations o on o.id = t.organization_id
       left join app.bots b on b.id = t.bot_id
       left join app.users cu on cu.id = t.user_id
       left join app.users au on au.id = t.assignee_id
      where t.id = $1`,
    [ticketId],
  )
  const r = rows[0]
  if (!r) return null
  const { customerEmail, customerName, customerSuspended, ...ticket } = parseContext(r)
  const [messages, staff, others] = await Promise.all([
    loadMessages(q, ticketId, true),
    listSupportStaff(q),
    ticket.userId
      ? q.query<AdminTicketDetail["others"][number]>(
          `select id, number::int as number, subject, status, created_at as "createdAt" from app.support_tickets
            where user_id = $1 and id <> $2 order by created_at desc limit 10`,
          [ticket.userId, ticketId],
        )
      : Promise.resolve({ rows: [] }),
  ])
  return {
    ticket: {
      ...ticket,
      customer: ticket.userId && customerEmail ? { id: ticket.userId, email: customerEmail, name: customerName ?? "", suspended: !!customerSuspended } : null,
    },
    messages,
    staff,
    others: others.rows,
  }
}

// --- Staff: actions ---

async function requireTicket(tx: Queryable, ticketId: string) {
  const ticket = await lockTicket(tx, ticketId)
  if (!ticket) throw new AdminError("not_found", "Ticket not found")
  return ticket
}

const snapshot = (t: SupportTicket) => ({ status: t.status, priority: t.priority, assigneeId: t.assigneeId, slaDueAt: t.slaDueAt?.toISOString() ?? null })

/** The deadline for a status: none while the ticket waits on the customer or is done. */
const slaFor = (status: TicketStatus, current: string) => (status === "open" || status === "in_progress" ? current : "null::timestamptz")

export interface StaffReplyResult {
  messageId: string
  /** Set for a public reply: who to email. */
  mail: TicketMailInfo | null
}

/**
 * A staff reply, or with `internal` a note only staff see. A public reply answers the customer: the
 * deadline is met and the ticket waits on them, unless `status` says otherwise. A note changes
 * nothing but the status, when one is given. A staff member who answers an unassigned ticket takes it.
 */
export async function staffReply(
  tx: Queryable,
  adminId: string,
  ticketId: string,
  input: { body: unknown; internal?: unknown; status?: unknown },
): Promise<ActionChange<StaffReplyResult>> {
  const body = cleanBody(input.body, (m) => new AdminError("invalid_input", m))
  const internal = input.internal === true
  if (input.status !== undefined && input.status !== null && !includes(TICKET_STATUSES, input.status)) throw new AdminError("invalid_input", "Choose a status")
  const ticket = await requireTicket(tx, ticketId)
  const status: TicketStatus = (input.status as TicketStatus | null | undefined) ?? (internal ? ticket.status : "pending_user")

  const { rows } = await tx.query<{ id: string }>(
    "insert into app.support_messages (ticket_id, author_id, from_staff, body, internal) values ($1, $2, true, $3, $4) returning id",
    [ticket.id, adminId, body, internal],
  )
  const deadline = internal ? "sla_due_at" : "null::timestamptz"
  const { rows: after } = await tx.query<SupportTicket>(
    `update app.support_tickets t set status = $2,
            sla_due_at = case when $2 in ('open', 'in_progress') then ${deadline} else null end,
            assignee_id = coalesce(assignee_id, case when $3 then $4::uuid end),
            updated_at = now()
      where id = $1 returning ${TICKET_COLUMNS}`,
    [ticket.id, status, !internal, adminId],
  )
  return {
    before: snapshot(ticket),
    after: { ...snapshot(parseContext(after[0]!)), messageId: rows[0]!.id, internal, length: body.length },
    extra: { messageId: rows[0]!.id, mail: internal ? null : await mailInfo(tx, ticket.id) },
  }
}

/** Gives the ticket to a staff member, or with null leaves it unassigned. */
export async function staffAssignTicket(tx: Queryable, ticketId: string, rawAssignee: unknown): Promise<ActionChange<{ mail: TicketMailInfo | null }>> {
  const ticket = await requireTicket(tx, ticketId)
  const assigneeId = rawAssignee === null || rawAssignee === "" ? null : rawAssignee
  if (assigneeId !== null) {
    if (!isUuid(assigneeId)) throw new AdminError("invalid_input", "Choose a staff member")
    const { rows } = await tx.query("select 1 from app.users where id = $1 and platform_role is not null and suspended_at is null", [assigneeId])
    if (!rows.length) throw new AdminError("invalid_input", "Choose a staff member")
  }
  if (ticket.assigneeId === assigneeId) throw new AdminError("invalid_input", "The ticket is already assigned that way")
  await tx.query("update app.support_tickets set assignee_id = $2 where id = $1", [ticket.id, assigneeId])
  return {
    before: { assigneeId: ticket.assigneeId },
    after: { assigneeId },
    extra: { mail: assigneeId ? await mailInfo(tx, ticket.id) : null },
  }
}

export async function staffSetTicketStatus(tx: Queryable, ticketId: string, rawStatus: unknown): Promise<ActionChange> {
  if (!includes(TICKET_STATUSES, rawStatus)) throw new AdminError("invalid_input", "Choose a status")
  const ticket = await requireTicket(tx, ticketId)
  if (ticket.status === rawStatus) throw new AdminError("invalid_input", "The ticket already has that status")
  // back to work from waiting or done: the clock starts again
  const reopened = (rawStatus === "open" || rawStatus === "in_progress") && !ticket.slaDueAt
  const { rows } = await tx.query<SupportTicket>(
    `update app.support_tickets t set status = $2,
            sla_due_at = ${slaFor(rawStatus, reopened ? "now() + $3::interval" : "sla_due_at")}
      where id = $1 returning ${TICKET_COLUMNS}`,
    reopened ? [ticket.id, rawStatus, slaInterval(ticket.priority)] : [ticket.id, rawStatus],
  )
  return { before: snapshot(ticket), after: snapshot(parseContext(rows[0]!)), extra: {} }
}

/** Changes the priority; a running deadline moves by the difference between the two answer times. */
export async function staffSetTicketPriority(tx: Queryable, ticketId: string, rawPriority: unknown): Promise<ActionChange> {
  if (!includes(TICKET_PRIORITIES, rawPriority)) throw new AdminError("invalid_input", "Choose a priority")
  const ticket = await requireTicket(tx, ticketId)
  if (ticket.priority === rawPriority) throw new AdminError("invalid_input", "The ticket already has that priority")
  const shift = SUPPORT_SLA_HOURS[rawPriority] - SUPPORT_SLA_HOURS[ticket.priority]
  const { rows } = await tx.query<SupportTicket>(
    `update app.support_tickets t set priority = $2, sla_due_at = sla_due_at + make_interval(hours => $3)
      where id = $1 returning ${TICKET_COLUMNS}`,
    [ticket.id, rawPriority, shift],
  )
  return { before: snapshot(ticket), after: snapshot(parseContext(rows[0]!)), extra: {} }
}
