// Calibrates hybrid retrieval (BM25 + embeddings, RRF) on the golden suites. Reproduces
// docs/adr/0002-hybrid-retrieval.md.
//
//   npm run experiment:hybrid -w @apex/evals [-- gemini:gemini-embedding-2@768 ...]
//
// Prints, per embedder: how similar the right page is to answerable questions versus the best page
// for unanswerable ones and small talk (the floor can only separate the latter), then sweeps the
// semantic floor, the near-top window and the follow-up query form. Sweeping on the test set is an
// upper bound, so pick a setting from a flat region, not the single best point.
import { KnowledgeBase, relevantHybridHits, type SemanticQuery } from "@apex/knowledge/retrieval";
import { createEmbedder, embeddingText } from "@apex/knowledge/embed";
import { EmbeddingCache } from "../embeddings.ts";
import { pathOf, scoreCase, summarize, type GoldenCase, type Summary } from "../metrics.ts";
import { PRODUCTION_SETTINGS, loadSuites, type Suite } from "../suite.ts";

const specs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (specs.length === 0) specs.push("gemini:gemini-embedding-2@768", "gemini:gemini-embedding-001@768");

/** How a follow-up's previous message enters the semantic query. */
type FollowupMode = "message" | "joined" | "both";
export const followupTexts = (c: { q: string; prev?: string }, mode: FollowupMode): string[] =>
  !c.prev || mode === "message" ? [c.q] : mode === "joined" ? [`${c.prev}\n${c.q}`] : [c.q, `${c.prev}\n${c.q}`];

const suites = loadSuites();
const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);
const quantiles = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]?.toFixed(3) ?? "-";
  return `min ${at(0)} p10 ${at(0.1)} p50 ${at(0.5)} p90 ${at(0.9)} max ${at(0.999)}`;
};

for (const spec of specs) {
  const cache = new EmbeddingCache(spec, createEmbedder(spec, { openai: process.env.OPENAI_API_KEY, gemini: process.env.GEMINI_API_KEY }, { retries: 6, batchSize: 20 }));
  const prepared: { suite: Suite; kb: KnowledgeBase; vectors: Map<string, Float32Array> }[] = [];
  for (const suite of suites) {
    const kb = new KnowledgeBase();
    const generation = kb.load("t", suite.corpus);
    kb.attachVectors("t", generation, spec, await cache.get(suite.corpus.map(embeddingText), "document"));
    const texts = [...new Set(suite.cases.flatMap((c) => followupTexts(c, "both")))];
    const embedded = await cache.get(texts, "query");
    cache.save();
    prepared.push({ suite, kb, vectors: new Map(texts.map((t, i) => [t, embedded[i]])) });
  }

  const semantic = (vectors: Map<string, Float32Array>, c: GoldenCase, mode: FollowupMode): SemanticQuery => ({
    embedder: spec,
    vectors: followupTexts(c, mode).map((t) => vectors.get(t)!),
  });

  console.log(`\n=== ${spec}`);
  for (const { suite, kb, vectors } of prepared) {
    const right: number[] = [];
    const unknown: number[] = [];
    const smalltalk: number[] = [];
    for (const c of suite.cases) {
      const hits = kb.semanticSearch("t", semantic(vectors, c, "both"), 1000);
      if (c.expect === null) (c.tags.includes("smalltalk") ? smalltalk : unknown).push(hits[0].score);
      else right.push(Math.max(...hits.filter((h) => c.expect!.includes(pathOf(h.chunk.url))).map((h) => h.score)));
    }
    console.log(`${suite.name.padEnd(10)} right page   ${quantiles(right)}`);
    console.log(`${"".padEnd(10)} unknown best ${quantiles(unknown)}`);
    if (smalltalk.length) console.log(`${"".padEnd(10)} small talk   ${quantiles(smalltalk)}`);
  }

  const run = (minSimilarity: number, nearTop: number, mode: FollowupMode, semanticOn = true): Summary[] =>
    prepared.map(({ suite, kb, vectors }) =>
      summarize(
        suite.cases.map((c) => {
          const lexical = [{ text: c.q, weight: 1 }];
          if (c.prev) lexical.push({ text: c.prev, weight: PRODUCTION_SETTINGS.previousWeight });
          const ranked = kb.hybridSearch("t", { lexical, semantic: semanticOn ? semantic(vectors, c, mode) : null });
          const used = relevantHybridHits(ranked, { minScore: PRODUCTION_SETTINGS.minScore, minSimilarity, nearTop }, PRODUCTION_SETTINGS.confidence);
          return scoreCase(c, ranked.slice(0, PRODUCTION_SETTINGS.topK), used.slice(0, PRODUCTION_SETTINGS.topK));
        }),
      ),
    );
  const line = (summaries: Summary[]) =>
    summaries.map((s, i) => `${prepared[i].suite.name} pass ${pct(s.passRate)} ctx ${pct(s.contextRecall)} abst ${pct(s.abstainAccuracy)} r@k ${pct(s.recallAtK)}`).join(" | ");

  console.log(`\n${"lexical only (RRF ranks)".padEnd(34)}${line(run(2, 0, "message", false))}`);
  for (const mode of ["message", "joined", "both"] as const) console.log(`${`floor 0, window 1, ${mode}`.padEnd(34)}${line(run(0, 1, mode))}`);
  for (const nearTop of [0.05, 0.08, 0.12, 0.2]) {
    for (let floor = 0.4; floor <= 0.701; floor += 0.025) {
      console.log(`${`floor ${floor.toFixed(3)}, window ${nearTop}, both`.padEnd(34)}${line(run(floor, nearTop, "both"))}`);
    }
  }
}
