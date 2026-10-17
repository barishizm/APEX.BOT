import { MAX_RESOLVE, QUESTION_SAMPLE, type AnalyticsData, type QuestionRow, type UnansweredRow } from "@apex/db"
import { LANGS, LOOSE, detectLang, fold, tokenize, type Lang } from "@apex/knowledge"

// Turns the raw rows from @apex/db into what the analytics page draws. Pure functions, so the
// API route and the server-rendered page give the same answer.

export const TOPIC_COUNT = 10
const TOPIC_EXAMPLES = 3
const UNANSWERED_GROUPS = 100

interface Word {
  stem: string
  surface: string
  /** For casing: Turkish capitalizes "iade" as "İade". */
  locale: "tr" | "en"
}

// Content words of a question: the same five-letter stems retrieval uses, so "kargo", "kargom"
// and "kargoya" (or "grąžinimas", "grąžinimo") count as one word in all five languages
// Words that are frequent in questions but name no topic: question particles and generic verbs
// ("…yapıyor musunuz?", "how long does it take", "kiek kainuoja"). Retrieval keeps them (they
// can still help match a page); topic labels shouldn't be built from them.
const NOT_TOPICS = new Set(
  [
    // tr
    "musunuz", "misiniz", "mısınız", "müsünüz", "musun", "misin", "miyim", "mıyım", "midir", "mıdır", "mudur", "müdür",
    "yapıyor", "yapılır", "yapabilir", "yapabilirim", "yapmak", "olur", "oluyor", "nerede", "kadar", "neler", "istiyorum",
    "lazım", "gerekiyor", "alabilir", "alabilirim", "edebilir", "edilir", "veriyor", "satıyor", "hangileri",
    // en
    "much", "many", "long", "take", "takes", "get", "need", "want", "offer", "sell", "any", "some", "know",
    // lt / lv / et: "costs", "can", "is there"
    "kainuoja", "galima", "maksā", "var", "maksab", "saab", "kas",
  ].flatMap((w) => tokenize(w).filter((t) => !t.startsWith(LOOSE))),
)

function words(text: string): Word[] {
  const out: Word[] = []
  // Turkish lowercases I/İ differently (and plain toLowerCase leaves "İ" as "i̇")
  const locale = detectLang(text) === "tr" ? "tr" : "en"
  for (const raw of text.split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3) continue
    const stem = tokenize(raw).find((t) => !t.startsWith(LOOSE))
    if (!stem || stem.length < 3 || /^\d+$/.test(stem) || NOT_TOPICS.has(stem)) continue
    out.push({ stem, surface: raw.toLocaleLowerCase(locale), locale })
  }
  return out
}

// A four-letter root ("iade", "mars") has no five-letter stem of its own, so its inflections
// ("iadesi" -> "iades", "marsa") would split off. Within one batch, fold such a stem into the
// root when the root itself was used, the way retrieval's looser stem matches them.
function wordsOf(texts: string[]): Word[][] {
  const all = texts.map(words)
  const roots = new Set(all.flatMap((ws) => ws.filter((w) => w.stem.length === 4).map((w) => w.stem)))
  return all.map((ws) => ws.map((w) => (w.stem.length === 5 && roots.has(w.stem.slice(0, 4)) ? { ...w, stem: w.stem.slice(0, 4) } : w)))
}

export interface Topic {
  /** The most common spelling of the topic's main word, plus a frequent companion word. */
  label: string
  /** The main word, capitalized the way its language does it. */
  title: string
  keywords: string[]
  questions: number
  /** Of all questions in the range. */
  share: number
  /** Replies that cited a source / were unanswered, among this topic's questions. */
  sourced: number
  unanswered: number
  replied: number
  examples: string[]
}

function examplesOf(rows: QuestionRow[]): string[] {
  const seen = new Set<string>()
  const examples: string[] = []
  for (const r of rows) {
    const key = fold(r.content).replace(/\W+/g, " ").trim()
    if (seen.has(key)) continue
    seen.add(key)
    examples.push(r.content.length > 160 ? `${r.content.slice(0, 159)}…` : r.content)
    if (examples.length === TOPIC_EXAMPLES) break
  }
  return examples
}

function topic(rows: QuestionRow[], total: number, names: Pick<Topic, "label" | "title" | "keywords">): Topic {
  return {
    ...names,
    questions: rows.length,
    share: total ? rows.length / total : 0,
    sourced: rows.filter((r) => r.sourced).length,
    unanswered: rows.filter((r) => r.unanswered).length,
    replied: rows.filter((r) => r.sourced !== null).length,
    examples: examplesOf(rows),
  }
}

/**
 * The most asked topics. Uses the labels the chat API's background labeler stores on each
 * question once they cover most of the range; until then (or with labeling off), groups by
 * the most frequent words.
 */
export function topTopics(questions: QuestionRow[], count = TOPIC_COUNT): Topic[] {
  const labeled = questions.filter((q) => q.topic !== null && q.topic !== undefined)
  if (labeled.length && labeled.length >= questions.length / 2) return labeledTopics(labeled, count)
  return wordTopics(questions, count)
}

/** Groups by stored label; questions labeled "no topic" (greetings, names) only count towards the total. */
function labeledTopics(questions: QuestionRow[], count: number): Topic[] {
  const groups = new Map<string, { rows: QuestionRow[]; spellings: Map<string, number> }>()
  for (const q of questions) {
    const name = q.topic!.replace(/\s+/g, " ").trim()
    if (!name) continue
    const key = fold(name)
    const g = groups.get(key) ?? { rows: [], spellings: new Map<string, number>() }
    g.rows.push(q)
    g.spellings.set(name, (g.spellings.get(name) ?? 0) + 1)
    groups.set(key, g)
  }
  return [...groups.values()]
    .filter((g) => g.rows.length >= 2)
    .map((g) => ({ ...g, name: [...g.spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0] }))
    .sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name))
    .slice(0, count)
    .map((g) => topic(g.rows, questions.length, { label: g.name, title: g.name, keywords: [g.name] }))
}

/**
 * Greedy and deterministic: take the word that appears in the most not-yet-grouped questions,
 * make those questions a topic, repeat. A question belongs to one topic only, so shares add
 * up to at most 100%.
 */
function wordTopics(questions: QuestionRow[], count: number): Topic[] {
  const batch = wordsOf(questions.map((q) => q.content))
  const docs = questions.map((q, i) => ({ q, words: batch[i] }))
  const spellings = new Map<string, Map<string, number>>()
  const locales = new Map<string, Word["locale"]>()
  for (const d of docs) {
    for (const w of d.words) {
      const s = spellings.get(w.stem) ?? new Map<string, number>()
      s.set(w.surface, (s.get(w.surface) ?? 0) + 1)
      spellings.set(w.stem, s)
      if (w.locale === "tr" || !locales.has(w.surface)) locales.set(w.surface, w.locale)
    }
  }
  const capitalize = (word: string) => word.charAt(0).toLocaleUpperCase(locales.get(word) ?? "en") + word.slice(1)
  const spell = (stem: string) => [...(spellings.get(stem) ?? [])].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? stem

  const stems = docs.map((d) => new Set(d.words.map((w) => w.stem)))
  let open = docs.map((_, i) => i)
  const topics: Topic[] = []
  while (topics.length < count && open.length) {
    const df = new Map<string, number>()
    for (const i of open) for (const s of stems[i]) df.set(s, (df.get(s) ?? 0) + 1)
    const [main, n] = [...df].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? []
    if (!main || n < 2) break

    const members = open.filter((i) => stems[i].has(main))
    const co = new Map<string, number>()
    for (const i of members) for (const s of stems[i]) if (s !== main) co.set(s, (co.get(s) ?? 0) + 1)
    const companions = [...co]
      .filter(([, c]) => c >= 2 && c >= members.length * 0.4)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 2)
      .map(([s]) => s)

    topics.push(
      topic(
        members.map((i) => docs[i].q),
        questions.length,
        {
          label: [spell(main), ...companions.slice(0, 1).map(spell)].join(" · "),
          title: capitalize(spell(main)),
          keywords: [main, ...companions].map(spell),
        },
      ),
    )
    const taken = new Set(members)
    open = open.filter((i) => !taken.has(i))
  }
  return topics
}

export type LanguageMix = Record<Lang | "other", number>

/** Which languages visitors asked in; short or mixed messages count as "other". */
export function languageMix(questions: QuestionRow[]): LanguageMix {
  const mix = Object.fromEntries([...LANGS, "other"].map((l) => [l, 0])) as LanguageMix
  for (const q of questions) mix[detectLang(q.content) ?? "other"]++
  return mix
}

export interface UnansweredGroup {
  /** Stable for the same wording, so the client can track a row across refreshes. */
  key: string
  question: string
  /** How many times it was asked (and left unanswered) in the range. */
  count: number
  replyIds: string[]
  conversationId: string
  lastAskedAt: string
}

/** Collapses repeats of the same question ("Mars'a kargo var mı?" / "marsa kargo var mi"). */
export function groupUnanswered(rows: UnansweredRow[]): UnansweredGroup[] {
  const groups = new Map<string, UnansweredGroup>()
  // rows arrive newest first, so each group keeps its latest wording and conversation
  const batch = wordsOf(rows.map((r) => r.question))
  for (const [i, r] of rows.entries()) {
    const stems = [...new Set(batch[i].map((w) => w.stem))].sort()
    const key = stems.length ? stems.join(" ") : fold(r.question).replace(/\s+/g, " ").trim()
    const g = groups.get(key)
    if (g) {
      g.count++
      // one request resolves at most MAX_RESOLVE replies; any beyond stay open for next time
      if (g.replyIds.length < MAX_RESOLVE) g.replyIds.push(r.replyId)
    } else {
      groups.set(key, {
        key,
        question: r.question.replace(/\s+/g, " ").trim().slice(0, 300),
        count: 1,
        replyIds: [r.replyId],
        conversationId: r.conversationId,
        lastAskedAt: r.askedAt.toISOString(),
      })
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.lastAskedAt.localeCompare(a.lastAskedAt)).slice(0, UNANSWERED_GROUPS)
}

export function analyticsJson(d: AnalyticsData) {
  return {
    days: d.days,
    timeZone: d.timeZone,
    retentionDays: d.retentionDays,
    current: d.current,
    previous: d.previous,
    daily: d.daily,
    hours: d.hours,
    topSources: d.topSources,
    topics: topTopics(d.questions),
    languages: languageMix(d.questions),
    /** Topics and languages were worked out from the most recent questions only. */
    sampled: d.questions.length >= QUESTION_SAMPLE,
    questionCount: d.questions.length,
    unanswered: groupUnanswered(d.unanswered),
    unansweredOpen: d.unansweredOpen,
  }
}
export type AnalyticsJson = ReturnType<typeof analyticsJson>
