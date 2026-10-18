import type { Db, Queryable } from "./db.ts"
import { AdminError, writeAudit } from "./admin.ts"
import type { RequestMeta } from "./auth.ts"
import {
  listBotConversations,
  loadConversation,
  maskConversation,
  maskConversationSummary,
  type ListConversationsOptions,
  type StoredConversation,
} from "./conversations.ts"

// Support access (/admin/bots/[id]/conversations). Staff can't read a customer's conversations by
// default. To help with a support request they open a window on one bot with a reason (and the
// ticket number, when there is one): for SUPPORT_ACCESS_MINUTES that staff member, and only they,
// can read its conversations, with the visitor's details and personal data in messages masked.
// Showing them is a separate, audited step. Opening a window emails the workspace owners.
// The audit entries (target "bot") are written by the callers, in the same transaction.

export const SUPPORT_ACCESS_MINUTES = 60
const TICKET_MAX = 100

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

export interface SupportAccess {
  id: string
  botId: string
  adminId: string
  reason: string
  ticketRef: string | null
  createdAt: Date
  expiresAt: Date
}

const COLUMNS = `id, bot_id as "botId", admin_id as "adminId", reason, ticket_ref as "ticketRef", created_at as "createdAt", expires_at as "expiresAt"`

/** A ticket number as staff typed it: trimmed, control characters dropped; null when empty. */
export function cleanTicketRef(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null
  if (typeof raw !== "string") throw new AdminError("invalid_input", "Enter the ticket number as text")
  const ref = raw.replace(/[\p{Cc}\p{Cf}]/gu, "").trim()
  if (ref.length > TICKET_MAX) throw new AdminError("invalid_input", "The ticket number can be at most 100 characters")
  return ref || null
}

/** This staff member's open window on the bot, or null. */
export async function activeSupportAccess(q: Queryable, adminId: string, botId: string): Promise<SupportAccess | null> {
  if (!isUuid(botId) || !isUuid(adminId)) return null
  const { rows } = await q.query<SupportAccess>(
    `select ${COLUMNS} from app.support_access_grants
      where admin_id = $1 and bot_id = $2 and ended_at is null and expires_at > now()
      order by expires_at desc limit 1`,
    [adminId, botId],
  )
  return rows[0] ?? null
}

/** Like activeSupportAccess, but throws when there is no open window. */
export async function requireSupportAccess(q: Queryable, adminId: string, botId: string): Promise<SupportAccess> {
  const grant = await activeSupportAccess(q, adminId, botId)
  if (!grant) throw new AdminError("forbidden", "Open support access for this bot first")
  return grant
}

export interface OpenedSupportAccess {
  grant: SupportAccess
  /** The window this one replaced, if one was still open. */
  replaced: string | null
  bot: { id: string; name: string; organizationName: string }
  /** Who to tell: the workspace owners' addresses. */
  owners: string[]
}

/**
 * Opens a window on the bot for this staff member, closing any they still had open on it. The
 * caller audits it and emails `owners` once committed.
 */
export async function openSupportAccess(tx: Queryable, adminId: string, botId: string, reason: string, rawTicket?: unknown): Promise<OpenedSupportAccess> {
  if (!reason.trim()) throw new AdminError("invalid_input", "Give a reason for this action")
  const ticketRef = cleanTicketRef(rawTicket)
  if (!isUuid(botId)) throw new AdminError("not_found", "Bot not found")
  const bot = await tx.query<{ id: string; name: string; organizationId: string; organizationName: string }>(
    `select b.id, b.name, o.id as "organizationId", o.name as "organizationName"
       from app.bots b join app.organizations o on o.id = b.organization_id where b.id = $1`,
    [botId],
  )
  const b = bot.rows[0]
  if (!b) throw new AdminError("not_found", "Bot not found")

  const closed = await tx.query<{ id: string }>(
    "update app.support_access_grants set ended_at = now() where admin_id = $1 and bot_id = $2 and ended_at is null and expires_at > now() returning id",
    [adminId, botId],
  )
  const { rows } = await tx.query<SupportAccess>(
    `insert into app.support_access_grants (bot_id, admin_id, reason, ticket_ref, expires_at)
     values ($1, $2, $3, $4, now() + make_interval(mins => $5)) returning ${COLUMNS}`,
    [botId, adminId, reason.slice(0, 1000), ticketRef, SUPPORT_ACCESS_MINUTES],
  )
  const owners = await tx.query<{ email: string }>(
    `select u.email from app.organization_members m join app.users u on u.id = m.user_id
      where m.organization_id = $1 and m.role = 'owner' and u.suspended_at is null order by u.email`,
    [b.organizationId],
  )
  return {
    grant: rows[0]!,
    replaced: closed.rows[0]?.id ?? null,
    bot: { id: b.id, name: b.name, organizationName: b.organizationName },
    owners: owners.rows.map((r) => r.email),
  }
}

/** Closes this staff member's open window on the bot early; null when there was none. */
export async function closeSupportAccess(tx: Queryable, adminId: string, botId: string): Promise<{ id: string } | null> {
  if (!isUuid(botId)) throw new AdminError("not_found", "Bot not found")
  const { rows } = await tx.query<{ id: string }>(
    "update app.support_access_grants set ended_at = now() where admin_id = $1 and bot_id = $2 and ended_at is null and expires_at > now() returning id",
    [adminId, botId],
  )
  return rows[0] ?? null
}

/** The bot's inbox, masked, for a staff member with an open window. */
export async function supportListConversations(q: Queryable, adminId: string, botId: string, options: Omit<ListConversationsOptions, "search"> = {}) {
  const grant = await requireSupportAccess(q, adminId, botId)
  // no search: matching on visitor details would reveal them one guess at a time
  const page = await listBotConversations(q, botId, { ...options, search: null })
  return { grant, hasMore: page.hasMore, conversations: page.conversations.map(maskConversationSummary) }
}

/**
 * One transcript for a staff member with an open window: masked, unless `reveal`. Each read is
 * audited against the bot: "bot.conversation.view", or "bot.conversation.reveal_pii" when the
 * visitor's details are shown. Null when the conversation isn't this bot's.
 */
export async function supportGetConversation(
  db: Db,
  adminId: string,
  botId: string,
  conversationId: string,
  options: { reveal?: boolean; meta?: RequestMeta } = {},
): Promise<{ grant: SupportAccess; conversation: StoredConversation } | null> {
  return db.transaction(async (tx) => {
    const grant = await requireSupportAccess(tx, adminId, botId)
    const conversation = await loadConversation(tx, botId, conversationId)
    if (!conversation) return null
    await writeAudit(tx, {
      actorId: adminId,
      action: options.reveal ? "bot.conversation.reveal_pii" : "bot.conversation.view",
      targetType: "bot",
      targetId: botId,
      reason: grant.reason,
      after: { conversationId, grantId: grant.id, ticketRef: grant.ticketRef },
      ip: options.meta?.ip,
      userAgent: options.meta?.userAgent,
    })
    return { grant, conversation: options.reveal ? conversation : maskConversation(conversation) }
  })
}
