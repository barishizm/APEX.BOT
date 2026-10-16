// Scoring for the retrieval evals. Pure functions over ranked hits, so they are unit-tested
// on their own and every retriever is scored the same way.
import type { Hit } from "@apex/knowledge/retrieval";

export interface GoldenCase {
  id: string;
  /** The visitor's message. */
  q: string;
  /** The previous visitor message, for follow-ups ("Peki ücreti?"). */
  prev?: string;
  /** URL paths of pages that answer it (any one is enough); null = the site can't answer it. */
  expect: string[] | null;
  tags: string[];
}

export interface CaseResult {
  id: string;
  tags: string[];
  answerable: boolean;
  /** 1-based rank of the first relevant chunk in the ranked list; null when none was retrieved. */
  rank: number | null;
  /** The chunks the answer would be built from were empty: the "I don't know" path. */
  abstained: boolean;
  /** Answerable: a relevant chunk reached the model. Unknown: the bot abstained. */
  pass: boolean;
  /** Paths of the chunks that would reach the model, best first (for reading failures). */
  used: string[];
}

export interface Summary {
  cases: number;
  answerable: number;
  unknown: number;
  /** Share of answerable cases whose top hit is relevant. */
  hitAt1: number;
  /** Share of answerable cases with a relevant chunk anywhere in the top k. */
  recallAtK: number;
  /** Mean reciprocal rank of the first relevant chunk (0 when missing). */
  mrr: number;
  /** Share of answerable cases where a relevant chunk survives the score floor and reaches the model. */
  contextRecall: number;
  /** Share of answerable cases wrongly sent down the "I don't know" path. */
  falseAbstain: number;
  /** Share of unanswerable cases correctly sent down the "I don't know" path. */
  abstainAccuracy: number;
  /** Share of all cases that pass. The headline number. */
  passRate: number;
  byTag: Record<string, { cases: number; passRate: number }>;
}

export const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

export function scoreCase(c: GoldenCase, ranked: Hit[], used: Hit[]): CaseResult {
  const relevant = (h: Hit) => c.expect !== null && c.expect.includes(pathOf(h.chunk.url));
  const index = ranked.findIndex(relevant);
  const abstained = used.length === 0;
  const answerable = c.expect !== null;
  return {
    id: c.id,
    tags: c.tags,
    answerable,
    rank: index === -1 ? null : index + 1,
    abstained,
    pass: answerable ? used.some(relevant) : abstained,
    used: used.map((h) => pathOf(h.chunk.url)),
  };
}

const share = (n: number, of: number) => (of === 0 ? 0 : round(n / of));
const round = (x: number) => Math.round(x * 10_000) / 10_000;

export function summarize(results: CaseResult[]): Summary {
  const answerable = results.filter((r) => r.answerable);
  const unknown = results.filter((r) => !r.answerable);
  const byTag: Summary["byTag"] = {};
  for (const tag of [...new Set(results.flatMap((r) => r.tags))].sort()) {
    const tagged = results.filter((r) => r.tags.includes(tag));
    byTag[tag] = { cases: tagged.length, passRate: share(tagged.filter((r) => r.pass).length, tagged.length) };
  }
  return {
    cases: results.length,
    answerable: answerable.length,
    unknown: unknown.length,
    hitAt1: share(answerable.filter((r) => r.rank === 1).length, answerable.length),
    recallAtK: share(answerable.filter((r) => r.rank !== null).length, answerable.length),
    mrr: share(
      answerable.reduce((sum, r) => sum + (r.rank ? 1 / r.rank : 0), 0),
      answerable.length,
    ),
    contextRecall: share(answerable.filter((r) => r.pass).length, answerable.length),
    falseAbstain: share(answerable.filter((r) => r.abstained).length, answerable.length),
    abstainAccuracy: share(unknown.filter((r) => r.abstained).length, unknown.length),
    passRate: share(results.filter((r) => r.pass).length, results.length),
    byTag,
  };
}

/** Headline metrics where a drop is a regression (falseAbstain is the one where lower is better). */
export const GATED: (keyof Omit<Summary, "byTag" | "cases" | "answerable" | "unknown">)[] = [
  "passRate",
  "contextRecall",
  "abstainAccuracy",
  "recallAtK",
  "mrr",
  "hitAt1",
  "falseAbstain",
];

export const lowerIsBetter = (metric: string) => metric === "falseAbstain";
