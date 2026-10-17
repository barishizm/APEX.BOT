import type { Db } from "./db.ts"
import { getBotForUser, type BotScope } from "./bots.ts"

// Read side of the dashboard's analytics page. Everything is scoped to the signed-in user's
// bot and to what retention has kept: conversations older than the bot's retention period
// are already gone, so a longer range only reaches back that far.

export const ANALYTICS_RANGES = [7, 30, 90] as const
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number]

/** Questions handed to topic grouping; the most recent win when a range has more. */
export const QUESTION_SAMPLE = 3000
/** Open unanswered replies listed; grouping repeats keeps the visible list much shorter. */
export const UNANSWERED_SAMPLE = 500

export interface PeriodTotals {
  conversations: number
  /** Visitor messages. */
  questions: number
  /** Assistant replies. */
  answers: number
  /** Replies that cited at least one knowledge source. */
  sourcedAnswers: number
  unanswered: number
  handoffs: number
  leads: number
  helpful: number
  notHelpful: number
}

export interface DailyPoint {
  /** YYYY-MM-DD in the requested time zone. */
  day: string
  conversations: number
  questions: number
  answers: number
  sourced: number
  unanswered: number
}

export interface CitedSource {
  title: string
  url: string
  /** Replies citing it. */
  replies: number
  conversations: number
}

export interface QuestionRow {
  content: string
  /** The reply cited a source / was flagged as unanswered; null when no reply was stored. */
  sourced: boolean | null
  unanswered: boolean | null
  /** From the background labeler: null until labeled, '' when the message names no topic. */
  topic: string | null
}

export interface UnansweredRow {
  replyId: string
  conversationId: string
  question: string
  askedAt: Date
}

export interface AnalyticsData {
  days: AnalyticsRange
  timeZone: string
  retentionDays: number
  current: PeriodTotals
  /** The same number of days just before, for the change badges. */
  previous: PeriodTotals
  daily: DailyPoint[]
  /** Visitor messages by local hour of day, 0-23. */
  hours: number[]
  topSources: CitedSource[]
  questions: QuestionRow[]
  unanswered: UnansweredRow[]
  /** Open unanswered replies in the range, including any past the sample. */
  unansweredOpen: number
}

export const parseRange = (raw: unknown): AnalyticsRange => {
  const n = Number(raw)
  return (ANALYTICS_RANGES as readonly number[]).includes(n) ? (n as AnalyticsRange) : 30
}

/** An IANA zone the runtime knows (and so Postgres, which ships the same database), else UTC. */
export function safeTimeZone(raw: unknown): string {
  if (typeof raw !== "string" || !/^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(raw)) return "UTC"
  try {
    return new Intl.DateTimeFormat("en", { timeZone: raw }).resolvedOptions().timeZone
  } catch {
    return "UTC"
  }
}

// $2 time zone, $3 days. `cur` is local midnight (days - 1) days ago, so "7 days" is today plus
// the six before it; `prev` is the start of the equally long period before that.
const BOUNDS = `bounds as (
  select (date_trunc('day', now() at time zone $2) - make_interval(days => $3 - 1)) at time zone $2 as cur,
         (date_trunc('day', now() at time zone $2) - make_interval(days => 2 * $3 - 1)) at time zone $2 as prev
)`

type TotalsRow = { [K in keyof PeriodTotals as `${K}_cur` | `${K}_prev`]: number }

const totals = (r: TotalsRow, p: "cur" | "prev"): PeriodTotals => ({
  conversations: r[`conversations_${p}`],
  questions: r[`questions_${p}`],
  answers: r[`answers_${p}`],
  sourcedAnswers: r[`sourcedAnswers_${p}`],
  unanswered: r[`unanswered_${p}`],
  handoffs: r[`handoffs_${p}`],
  leads: r[`leads_${p}`],
  helpful: r[`helpful_${p}`],
  notHelpful: r[`notHelpful_${p}`],
})

function periodColumns() {
  const cols: string[] = []
  for (const [p, cond] of [
    ["cur", "x.created_at >= b.cur"],
    ["prev", "x.created_at >= b.prev and x.created_at < b.cur"],
  ] as const) {
    const m = (where: string) => `count(*) filter (where ${cond.replaceAll("x.", "m.")} and ${where})::int`
    cols.push(
      `${m("m.role = 'user'")} as "questions_${p}"`,
      `${m("m.role = 'assistant'")} as "answers_${p}"`,
      `${m("m.role = 'assistant' and jsonb_array_length(m.sources) > 0")} as "sourcedAnswers_${p}"`,
      `${m("m.role = 'assistant' and m.unanswered")} as "unanswered_${p}"`,
      `${m("m.feedback = 'up'")} as "helpful_${p}"`,
      `${m("m.feedback = 'down'")} as "notHelpful_${p}"`,
      `(select count(*)::int from app.conversations c where c.bot_id = $1 and c.message_count > 0 and ${cond.replaceAll("x.", "c.")}) as "conversations_${p}"`,
      `(select count(*)::int from app.conversations c where c.bot_id = $1 and ${cond.replaceAll("x.created_at", "c.handoff_at")}) as "handoffs_${p}"`,
      `(select count(*)::int from app.conversations c where c.bot_id = $1 and c.visitor_email is not null and ${cond.replaceAll("x.", "c.")}) as "leads_${p}"`,
    )
  }
  return cols.join(",\n       ")
}
const PERIOD_COLUMNS = periodColumns()

/** Everything the analytics page shows, for the user's bot, over the last `days` local days. */
export async function analyticsData(db: Db, who: BotScope, options: { days?: unknown; timeZone?: unknown } = {}): Promise<AnalyticsData> {
  const bot = await getBotForUser(db, who)
  const days = parseRange(options.days)
  const tz = safeTimeZone(options.timeZone)
  const args = [bot.id, tz, days]

  const [summary, daily, hours, sources, questions, unanswered, open] = await Promise.all([
    db.query<TotalsRow>(
      `with ${BOUNDS}
       select ${PERIOD_COLUMNS}
         from bounds b left join app.messages m on m.bot_id = $1 and m.created_at >= b.prev
        group by b.cur, b.prev`,
      args,
    ),
    db.query<DailyPoint>(
      `with ${BOUNDS},
       d as (
         select generate_series(date_trunc('day', now() at time zone $2) - make_interval(days => $3 - 1), date_trunc('day', now() at time zone $2), interval '1 day')::date as day
       ),
       m as (
         select (m.created_at at time zone $2)::date as day,
                count(*) filter (where m.role = 'user')::int as questions,
                count(*) filter (where m.role = 'assistant')::int as answers,
                count(*) filter (where m.role = 'assistant' and jsonb_array_length(m.sources) > 0)::int as sourced,
                count(*) filter (where m.role = 'assistant' and m.unanswered)::int as unanswered
           from app.messages m, bounds b
          where m.bot_id = $1 and m.created_at >= b.cur
          group by 1
       ),
       c as (
         select (c.created_at at time zone $2)::date as day, count(*)::int as conversations
           from app.conversations c, bounds b
          where c.bot_id = $1 and c.message_count > 0 and c.created_at >= b.cur
          group by 1
       )
       select to_char(d.day, 'YYYY-MM-DD') as day,
              coalesce(c.conversations, 0) as conversations,
              coalesce(m.questions, 0) as questions,
              coalesce(m.answers, 0) as answers,
              coalesce(m.sourced, 0) as sourced,
              coalesce(m.unanswered, 0) as unanswered
         from d left join m using (day) left join c using (day)
        order by d.day`,
      args,
    ),
    db.query<{ hour: number; n: number }>(
      `with ${BOUNDS}
       select extract(hour from m.created_at at time zone $2)::int as hour, count(*)::int as n
         from app.messages m, bounds b
        where m.bot_id = $1 and m.role = 'user' and m.created_at >= b.cur
        group by 1`,
      args,
    ),
    db.query<CitedSource>(
      `with ${BOUNDS}
       select coalesce(nullif(s ->> 'title', ''), s ->> 'url', '') as title,
              coalesce(s ->> 'url', '') as url,
              count(distinct m.id)::int as replies,
              count(distinct m.conversation_id)::int as conversations
         from app.messages m cross join bounds b cross join lateral jsonb_array_elements(m.sources) s
        where m.bot_id = $1 and m.role = 'assistant' and m.created_at >= b.cur and jsonb_typeof(m.sources) = 'array'
        group by 1, 2
        order by replies desc, title
        limit 10`,
      args,
    ),
    // each visitor message with the first reply after it in the same conversation
    db.query<QuestionRow>(
      `with ${BOUNDS}
       select u.content, jsonb_array_length(r.sources) > 0 as sourced, r.unanswered, u.topic
         from app.messages u cross join bounds b
         left join lateral (
           select r.sources, r.unanswered from app.messages r
            where r.conversation_id = u.conversation_id and r.bot_id = u.bot_id and r.role = 'assistant' and r.created_at >= u.created_at
            order by r.created_at, r.id limit 1
         ) r on true
        where u.bot_id = $1 and u.role = 'user' and u.created_at >= b.cur
        order by u.created_at desc
        limit ${QUESTION_SAMPLE}`,
      args,
    ),
    // each open unanswered reply with the visitor message it answered
    db.query<{ replyId: string; conversationId: string; question: string; askedAt: Date }>(
      `with ${BOUNDS}
       select r.id as "replyId", r.conversation_id as "conversationId", q.content as question, q.created_at as "askedAt"
         from app.messages r cross join bounds b
         join lateral (
           select q.content, q.created_at from app.messages q
            where q.conversation_id = r.conversation_id and q.bot_id = r.bot_id and q.role = 'user' and q.created_at <= r.created_at
            order by q.created_at desc, q.id desc limit 1
         ) q on true
        where r.bot_id = $1 and r.role = 'assistant' and r.unanswered and r.resolved_at is null and r.created_at >= b.cur
        order by r.created_at desc
        limit ${UNANSWERED_SAMPLE}`,
      args,
    ),
    db.query<{ n: number }>(
      `with ${BOUNDS}
       select count(*)::int as n from app.messages r, bounds b
        where r.bot_id = $1 and r.role = 'assistant' and r.unanswered and r.resolved_at is null and r.created_at >= b.cur`,
      args,
    ),
  ])

  const byHour = Array.from({ length: 24 }, () => 0)
  for (const r of hours.rows) byHour[r.hour] = r.n

  return {
    days,
    timeZone: tz,
    retentionDays: bot.settings.security.retentionDays,
    current: totals(summary.rows[0], "cur"),
    previous: totals(summary.rows[0], "prev"),
    daily: daily.rows,
    hours: byHour,
    topSources: sources.rows,
    questions: questions.rows,
    unanswered: unanswered.rows.map((r) => ({ ...r, askedAt: new Date(r.askedAt) })),
    unansweredOpen: open.rows[0].n,
  }
}
