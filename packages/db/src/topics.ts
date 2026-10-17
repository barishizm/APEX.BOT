import type { Queryable } from "./db.ts"
import type { Lang } from "./bot-settings.ts"

// Topic labels on visitor messages, for the analytics page's "Top topics". The chat API's
// background labeler reads the queue across bots (like the retention sweep), then writes
// each bot's labels scoped to that bot.

/** Longest a label may be (the column's check). */
export const TOPIC_MAX = 60
/** How far back the labeler looks: the longest analytics range. */
export const TOPIC_LOOKBACK_DAYS = 90

export interface UnlabeledQuestion {
  id: string
  botId: string
  content: string
  /** The bot's default language: labels are written in it. */
  lang: Lang
}

/** Recent visitor messages without a label, newest first. */
export async function unlabeledQuestions(db: Queryable, limit: number): Promise<UnlabeledQuestion[]> {
  const { rows } = await db.query<UnlabeledQuestion>(
    `select m.id, m.bot_id as "botId", m.content, coalesce(b.settings #>> '{general,defaultLang}', 'en') as lang
       from app.messages m join app.bots b on b.id = m.bot_id
      where m.role = 'user' and m.topic is null and m.created_at > now() - make_interval(days => ${TOPIC_LOOKBACK_DAYS})
      order by m.created_at desc
      limit $1`,
    [limit],
  )
  return rows
}

/** The labels a bot already uses, most common first, so new batches reuse them. */
export async function topicVocabulary(db: Queryable, botId: string, limit = 50): Promise<string[]> {
  const { rows } = await db.query<{ topic: string }>(
    `select topic from app.messages
      where bot_id = $1 and role = 'user' and topic <> '' and created_at > now() - make_interval(days => ${TOPIC_LOOKBACK_DAYS})
      group by topic
      order by count(*) desc, topic
      limit $2`,
    [botId, limit],
  )
  return rows.map((r) => r.topic)
}

/** Stores labels for one bot's messages ('' for "no topic"); ids from another bot are ignored. */
export async function saveTopics(db: Queryable, botId: string, labels: { id: string; topic: string }[]): Promise<number> {
  if (!labels.length) return 0
  const { rows } = await db.query(
    `update app.messages m set topic = v.topic
       from unnest($2::uuid[], $3::text[]) as v(id, topic)
      where m.id = v.id and m.bot_id = $1 and m.role = 'user'
      returning m.id`,
    [botId, labels.map((l) => l.id), labels.map((l) => l.topic.replace(/\s+/g, " ").trim().slice(0, TOPIC_MAX))],
  )
  return rows.length
}
