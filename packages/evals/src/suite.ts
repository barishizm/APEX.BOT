// Loads golden suites and runs them through retrieval exactly the way /v1/chat does:
// the same top-k, score floor, confidence cut and follow-up weighting.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultLimits } from "@apex/api/src/config.ts";
import { KnowledgeBase, relevantHits, type ChunkInput, type Confidence } from "@apex/knowledge/retrieval";
import { scoreCase, summarize, type CaseResult, type GoldenCase, type Summary } from "./metrics.ts";

export const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../data");

export interface Suite {
  name: string;
  description: string;
  corpus: ChunkInput[];
  cases: GoldenCase[];
}

export interface RetrievalSettings {
  topK: number;
  minScore: number;
  confidence: Confidence;
  /** Weight of the previous visitor message in a follow-up query. */
  previousWeight: number;
}

/** Mirrors apps/api/src/app.ts (POST /v1/chat) with a tenant on default settings. */
export const PRODUCTION_SETTINGS: RetrievalSettings = {
  topK: defaultLimits.retrievalTopK,
  minScore: defaultLimits.minRetrievalScore,
  confidence: "balanced",
  previousWeight: 0.5,
};

export interface SuiteResult {
  name: string;
  summary: Summary;
  cases: CaseResult[];
}

export function loadSuites(dir = DATA_DIR): Suite[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".golden.json"))
    .sort()
    .map((f) => {
      const raw = JSON.parse(readFileSync(join(dir, f), "utf8")) as Omit<Suite, "corpus"> & { corpus: string };
      const corpus = JSON.parse(readFileSync(resolve(dir, raw.corpus), "utf8")) as ChunkInput[];
      validate(raw.name, raw.cases, corpus);
      return { ...raw, corpus };
    });
}

/** A typo in an expected path would silently turn a case into an unwinnable one. */
function validate(name: string, cases: GoldenCase[], corpus: ChunkInput[]): void {
  const paths = new Set(corpus.map((c) => new URL(c.url).pathname));
  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`${name}: duplicate case id ${c.id}`);
    ids.add(c.id);
    for (const p of c.expect ?? []) {
      if (!paths.has(p)) throw new Error(`${name}/${c.id}: expected path ${p} is not in the corpus`);
    }
  }
}

export function runSuite(suite: Suite, settings: RetrievalSettings = PRODUCTION_SETTINGS): SuiteResult {
  const kb = new KnowledgeBase();
  const tenant = `eval_${suite.name}`;
  kb.load(tenant, suite.corpus);
  const cases = suite.cases.map((c) => {
    const query = [{ text: c.q, weight: 1 }];
    if (c.prev) query.push({ text: c.prev, weight: settings.previousWeight });
    const ranked = kb.search(tenant, query, settings.topK);
    return scoreCase(c, ranked, relevantHits(ranked, settings.minScore, settings.confidence));
  });
  return { name: suite.name, summary: summarize(cases), cases };
}
