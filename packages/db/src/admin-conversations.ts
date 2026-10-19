import type { Queryable } from "./db.ts"
import { parseOverviewRange, type OverviewRange } from "./admin.ts"
import type { ListSpec } from "./admin-list.ts"
import { BOT_SERVING_SQL } from "./bots.ts"

// /admin/conversations: how the bots on the platform are doing in their conversations, without
// reading any. Everything here is a count over app.conversations and app.messages (never a
// message, a preview or a visitor's details): staff read a conversation only through support
// access (support-access.ts), and this page shows who opened those windows and what they read.

/** A bot with at least this many replies in the range and this share of them unanswered needs knowledge. */
export const UNANSWERED_ALERT_RATE = 0.3
export const UNANSWERED_ALERT_MIN_ANSWERS = 10
/** Countries and languages listed before the rest are summed up as "other". */
export const BREAKDOWN_TOP = 8
/** Support access windows listed under "recent", and how far back they go. */
export const SUPPORT_WINDOWS_LIMIT = 25
export const SUPPORT_WINDOWS_DAYS = 30

// The first UTC day of a range of `days` (an OverviewRange, checked before it gets here), as a
// timestamp. Like the overview, "7 days" is today plus the six before it.
const sinceSql = (days: OverviewRange) => `(((now() at time zone 'utc')::date - ${Number(days) - 1})::timestamp at time zone 'utc')`

// --- Per bot ---

export interface AdminConversationBotRow {
  id: string
  name: string
  organization_id: string
  organization_name: string
  /** The range the numbers cover, in UTC days. */
  days: OverviewRange
  status: "serving" | "disabled" | "suspended"
  conversations: number
  messages: number
  answers: number
  unanswered: number
  /** Unanswered replies from the range the owner hasn't dealt with yet (analytics page). */
  open_questions: number
  /** Over the unanswered alert: UNANSWERED_ALERT_RATE of at least UNANSWERED_ALERT_MIN_ANSWERS replies. */
  needs_knowledge: boolean
  negative: number
  positive: number
  handoffs: number
  /** Conversations where the visitor left an email or phone number (counted, never shown). */
  leads: number
  last_at: Date | null
}

/**
 * Every bot with its conversation numbers over the last `days` UTC days. A function of the range
 * because the numbers are; the range is one of OVERVIEW_RANGES, so it is safe in the SQL.
 */
export function adminConversationBotsList(range: unknown): ListSpec {
  const days = parseOverviewRange(range)
  const since = sinceSql(days)
  const high = `(coalesce(m.answers, 0) >= ${UNANSWERED_ALERT_MIN_ANSWERS} and m.unanswered >= ${UNANSWERED_ALERT_RATE} * m.answers)`
  const open = `(select count(*) from app.messages q where q.bot_id = b.id and q.unanswered and q.resolved_at is null and q.created_at >= ${since})`
  return {
    select: `b.id, b.name, o.id as organization_id, o.name as organization_name, ${days}::int as days,
      case when b.disabled_at is not null then 'disabled' when o.suspended_at is not null then 'suspended' else 'serving' end as status,
      coalesce(c.conversations, 0) as conversations, coalesce(m.messages, 0) as messages, coalesce(m.answers, 0) as answers,
      coalesce(m.unanswered, 0) as unanswered, ${open}::int as open_questions, coalesce(${high}, false) as needs_knowledge,
      coalesce(m.negative, 0) as negative,
      coalesce(m.positive, 0) as positive, coalesce(c.handoffs, 0) as handoffs, coalesce(c.leads, 0) as leads, c.last_at`,
    from: `app.bots b
      join app.organizations o on o.id = b.organization_id
      left join (
        select c.bot_id, count(*)::int as conversations,
               count(*) filter (where c.handoff_at is not null)::int as handoffs,
               count(*) filter (where c.visitor_email is not null or c.visitor_phone is not null)::int as leads,
               max(c.created_at) as last_at
          from app.conversations c
         where c.created_at >= ${since} and c.message_count > 0
         group by c.bot_id
      ) c on c.bot_id = b.id
      left join (
        select m.bot_id, count(*)::int as messages,
               count(*) filter (where m.role = 'assistant')::int as answers,
               count(*) filter (where m.role = 'assistant' and m.unanswered)::int as unanswered,
               count(*) filter (where m.feedback = 'down')::int as negative,
               count(*) filter (where m.feedback = 'up')::int as positive
          from app.messages m
         where m.created_at >= ${since}
         group by m.bot_id
      ) m on m.bot_id = b.id`,
    id: { sql: "b.id", type: "uuid" },
    sorts: {
      conversations: { sql: "coalesce(c.conversations, 0)", type: "int" },
      messages: { sql: "coalesce(m.messages, 0)", type: "int" },
      // bots that sent no reply sort after every bot that did
      unanswered: { sql: "coalesce(round(m.unanswered::numeric / nullif(m.answers, 0), 6), -1)", type: "numeric" },
      // share of rated replies rated down; bots with no rating sort after every rated one
      negative: { sql: "coalesce(round(m.negative::numeric / nullif(m.negative + m.positive, 0), 6), -1)", type: "numeric" },
      handoffs: { sql: "coalesce(c.handoffs, 0)", type: "int" },
      last: { sql: "coalesce(c.last_at, '-infinity')", type: "timestamptz" },
      name: { sql: "lower(b.name)", type: "text" },
    },
    defaultSort: { key: "conversations", dir: "desc" },
    search: ["b.name", "o.name", "b.id::text", "o.id::text"],
    filters: {
      status: {
        serving: BOT_SERVING_SQL,
        disabled: "b.disabled_at is not null",
        suspended: "b.disabled_at is null and o.suspended_at is not null",
      },
      activity: { active: "coalesce(c.conversations, 0) > 0", quiet: "coalesce(c.conversations, 0) = 0" },
      unanswered: { high: high, any: "coalesce(m.unanswered, 0) > 0" },
      open: { yes: `${open} > 0` },
      negative: { yes: "coalesce(m.negative, 0) > 0" },
      handoff: { yes: "coalesce(c.handoffs, 0) > 0" },
    },
  }
}

// --- Platform totals ---

export interface ConversationTotals {
  conversations: number
  /** The same number for the range just before this one, for the trend. */
  previousConversations: number
  messages: number
  visitorMessages: number
  answers: number
  unanswered: number
  previousAnswers: number
  previousUnanswered: number
  openQuestions: number
  negative: number
  positive: number
  handoffs: number
  leads: number
  activeBots: number
  activeWorkspaces: number
  /** Bots over the unanswered alert (UNANSWERED_ALERT_RATE of at least UNANSWERED_ALERT_MIN_ANSWERS replies). */
  alertBots: number
}

export interface ConversationDay {
  /** YYYY-MM-DD, UTC. */
  day: string
  conversations: number
  answers: number
  unanswered: number
  negative: number
  handoffs: number
}

export interface BreakdownRow {
  /** An ISO code ("TR", "tr", "mobile"); null sums up the rest and the conversations without one. */
  key: string | null
  n: number
}

export interface PlatformConversations {
  days: OverviewRange
  totals: ConversationTotals
  daily: ConversationDay[]
  /** Where conversations came from, from what the widget reports (conversations.context). */
  breakdown: { devices: BreakdownRow[]; countries: BreakdownRow[]; languages: BreakdownRow[] }
}

// $1 days, as in admin.ts: d0 is the first UTC day, since its start, prev the start of the range before
const RANGE = `r as (
  select (now() at time zone 'utc')::date - ($1::int - 1) as d0,
         ((now() at time zone 'utc')::date - ($1::int - 1))::timestamp at time zone 'utc' as since,
         ((now() at time zone 'utc')::date - (2 * $1::int - 1))::timestamp at time zone 'utc' as prev
)`

/** Platform-wide conversation numbers over the last `range` UTC days. Staff only: check before calling. */
export async function platformConversations(q: Queryable, range?: unknown): Promise<PlatformConversations> {
  const days = parseOverviewRange(range)
  const [totals, daily, devices, countries, languages] = await Promise.all([
    q.query<ConversationTotals>(
      `with ${RANGE},
       c as (
         select count(*) filter (where c.created_at >= r.since)::int as conversations,
                count(*) filter (where c.created_at < r.since)::int as "previousConversations",
                count(*) filter (where c.created_at >= r.since and c.handoff_at is not null)::int as handoffs,
                count(*) filter (where c.created_at >= r.since and (c.visitor_email is not null or c.visitor_phone is not null))::int as leads,
                count(distinct c.bot_id) filter (where c.created_at >= r.since)::int as "activeBots",
                count(distinct b.organization_id) filter (where c.created_at >= r.since)::int as "activeWorkspaces"
           from app.conversations c join app.bots b on b.id = c.bot_id, r
          where c.created_at >= r.prev and c.message_count > 0
       ),
       m as (
         select count(*) filter (where m.created_at >= r.since)::int as messages,
                count(*) filter (where m.created_at >= r.since and m.role = 'user')::int as "visitorMessages",
                count(*) filter (where m.created_at >= r.since and m.role = 'assistant')::int as answers,
                count(*) filter (where m.created_at >= r.since and m.role = 'assistant' and m.unanswered)::int as unanswered,
                count(*) filter (where m.created_at < r.since and m.role = 'assistant')::int as "previousAnswers",
                count(*) filter (where m.created_at < r.since and m.role = 'assistant' and m.unanswered)::int as "previousUnanswered",
                count(*) filter (where m.created_at >= r.since and m.unanswered and m.resolved_at is null)::int as "openQuestions",
                count(*) filter (where m.created_at >= r.since and m.feedback = 'down')::int as negative,
                count(*) filter (where m.created_at >= r.since and m.feedback = 'up')::int as positive
           from app.messages m, r
          where m.created_at >= r.prev
       ),
       per_bot as (
         select m.bot_id
           from app.messages m, r
          where m.created_at >= r.since and m.role = 'assistant'
          group by m.bot_id
         having count(*) >= $2::int and count(*) filter (where m.unanswered) >= $3::float8 * count(*)
       )
       select c.*, m.*, (select count(*)::int from per_bot) as "alertBots" from c, m`,
      [days, UNANSWERED_ALERT_MIN_ANSWERS, UNANSWERED_ALERT_RATE],
    ),
    q.query<ConversationDay>(
      `with ${RANGE},
       d as (select generate_series(r.d0::timestamp, (now() at time zone 'utc')::date::timestamp, interval '1 day')::date as day from r),
       c as (select (c.created_at at time zone 'utc')::date as day, count(*)::int as conversations,
                    count(*) filter (where c.handoff_at is not null)::int as handoffs
               from app.conversations c, r where c.created_at >= r.since and c.message_count > 0 group by 1),
       m as (select (m.created_at at time zone 'utc')::date as day,
                    count(*) filter (where m.role = 'assistant')::int as answers,
                    count(*) filter (where m.role = 'assistant' and m.unanswered)::int as unanswered,
                    count(*) filter (where m.feedback = 'down')::int as negative
               from app.messages m, r where m.created_at >= r.since group by 1)
       select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(c.conversations, 0) as conversations, coalesce(m.answers, 0) as answers,
              coalesce(m.unanswered, 0) as unanswered, coalesce(m.negative, 0) as negative, coalesce(c.handoffs, 0) as handoffs
         from d left join c using (day) left join m using (day)
        order by d.day`,
      [days],
    ),
    breakdown(q, days, "device", 3),
    breakdown(q, days, "country", BREAKDOWN_TOP),
    breakdown(q, days, "language", BREAKDOWN_TOP),
  ])
  return { days, totals: totals.rows[0]!, daily: daily.rows, breakdown: { devices, countries, languages } }
}

/**
 * Conversations in the range grouped by one context field: the `top` biggest groups, then one row
 * (key null) for the rest and the conversations that don't have the field. Empty when there are none.
 * A language is the browser's without its region: "tr-TR" and "tr" count as one.
 */
async function breakdown(q: Queryable, days: OverviewRange, field: "device" | "country" | "language", top: number): Promise<BreakdownRow[]> {
  const { rows } = await q.query<{ key: string | null; n: number }>(
    `with ${RANGE},
     g as (
       select nullif(case $3::text
                       when 'device' then c.context ->> 'device'
                       when 'country' then upper(c.context ->> 'country')
                       when 'language' then lower(split_part(c.context ->> 'locale', '-', 1))
                     end, '') as key,
              count(*)::int as n
         from app.conversations c, r
        where c.created_at >= r.since and c.message_count > 0
        group by 1
     ),
     ranked as (select key, n, row_number() over (order by key is null, n desc, key) as i from g)
     select key, n from (
       select case when key is not null and i <= $2 then key end as key, sum(n)::int as n from ranked group by 1
     ) t
      order by key is null, n desc, key`,
    [days, top, field],
  )
  return rows
}

// --- Support access oversight ---

export interface SupportWindow {
  id: string
  botId: string
  botName: string
  organizationId: string
  organizationName: string
  adminId: string
  adminName: string
  reason: string
  ticketRef: string | null
  createdAt: Date
  expiresAt: Date
  endedAt: Date | null
  state: "open" | "closed" | "expired"
  /** Conversations read in the window ("bot.conversation.view"). */
  views: number
  /** Times the visitor's details were shown ("bot.conversation.reveal_pii"). */
  reveals: number
}

export interface SupportAccessActivity {
  /** Windows open now, any staff member's. */
  open: SupportWindow[]
  /** Windows opened in the last SUPPORT_WINDOWS_DAYS days that are over, newest first. */
  recent: SupportWindow[]
  /** Over the last SUPPORT_WINDOWS_DAYS days: windows opened, by how many staff, and reveals. */
  totals: { windows: number; staff: number; views: number; reveals: number }
}

const WINDOW_SELECT = `g.id, g.bot_id as "botId", b.name as "botName", o.id as "organizationId", o.name as "organizationName",
  g.admin_id as "adminId", coalesce(u.display_name, u.username) as "adminName", g.reason, g.ticket_ref as "ticketRef",
  g.created_at as "createdAt", g.expires_at as "expiresAt", g.ended_at as "endedAt",
  case when g.ended_at is not null then 'closed' when g.expires_at <= now() then 'expired' else 'open' end as state,
  coalesce(a.views, 0) as views, coalesce(a.reveals, 0) as reveals`

// The reads each window led to, from the audit entries supportGetConversation writes against the bot
const WINDOW_FROM = `app.support_access_grants g
  join app.bots b on b.id = g.bot_id
  join app.organizations o on o.id = b.organization_id
  join app.users u on u.id = g.admin_id
  left join lateral (
    select count(*) filter (where l.action = 'bot.conversation.view')::int as views,
           count(*) filter (where l.action = 'bot.conversation.reveal_pii')::int as reveals
      from app.admin_audit_log l
     where l.target_type = 'bot' and l.target_id = g.bot_id::text and l.actor_id = g.admin_id
       and l.action in ('bot.conversation.view', 'bot.conversation.reveal_pii') and l.after ->> 'grantId' = g.id::text
  ) a on true`

const OPEN = "g.ended_at is null and g.expires_at > now()"
const SUPPORT_SINCE = `now() - interval '${SUPPORT_WINDOWS_DAYS} days'`

/** Who opened support access to which bot, why, and how many conversations they read. Staff only. */
export async function supportAccessActivity(q: Queryable, limit = SUPPORT_WINDOWS_LIMIT): Promise<SupportAccessActivity> {
  const [open, recent, totals] = await Promise.all([
    q.query<SupportWindow>(`select ${WINDOW_SELECT} from ${WINDOW_FROM} where ${OPEN} order by g.expires_at, g.id`),
    q.query<SupportWindow>(
      `select ${WINDOW_SELECT} from ${WINDOW_FROM} where not (${OPEN}) and g.created_at >= ${SUPPORT_SINCE} order by g.created_at desc, g.id limit $1`,
      [limit],
    ),
    q.query<SupportAccessActivity["totals"]>(
      `select count(*)::int as windows, count(distinct g.admin_id)::int as staff,
              coalesce(sum(a.views), 0)::int as views, coalesce(sum(a.reveals), 0)::int as reveals
         from ${WINDOW_FROM} where g.created_at >= ${SUPPORT_SINCE}`,
    ),
  ])
  return { open: open.rows, recent: recent.rows, totals: totals.rows[0]! }
}
