// Would semantic retrieval beat BM25 on the golden suites? Reproduces docs/adr/0001-retrieval-embeddings.md.
//
//   npm run experiment:embeddings -w @apex/evals [-- gemini:gemini-embedding-2@768 ...]
//
// Ranking is BM25 and cosine fused with reciprocal rank fusion. Each "I don't know" gate is swept
// over its threshold and reported at its best combined pass rate. That tunes on the test set, so
// treat the numbers as an upper bound: a gate that can't beat BM25 even here won't in production.
import { KnowledgeBase, relevantHits, type Hit } from "@apex/knowledge/retrieval";
import { createEmbedder, dot, embeddingText } from "../embed.ts";
import { EmbeddingCache } from "../embeddings.ts";
import { scoreCase, summarize, type Summary } from "../metrics.ts";
import { PRODUCTION_SETTINGS, loadSuites, runSuite } from "../suite.ts";

const specs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (specs.length === 0) specs.push("gemini:gemini-embedding-001@768", "gemini:gemini-embedding-2@768");

const RRF_K = 60;
const CANDIDATES = 10;
/** Chunks within this cosine of the best one are passed to the model with it. */
const NEAR_TOP = 0.08;

const suites = loadSuites();
const queryText = (q: string, prev?: string) => (prev ? `${prev}\n${q}` : q);

interface Signals {
  /** The production BM25 floor would let something through. */
  lexical: boolean;
  /** Best cosine similarity. */
  top: number;
  /** Best cosine minus the mean over the tenant's chunks: how much one page stands out. */
  margin: number;
}
type Gate = (s: Signals) => boolean;

const line = (summaries: Summary[]) =>
  summaries.map((s, i) => `${suites[i].name}: pass ${s.passRate.toFixed(3)} ctx ${s.contextRecall.toFixed(3)} abstain ${s.abstainAccuracy.toFixed(3)} hit@1 ${s.hitAt1.toFixed(3)}`).join("  |  ");

console.log(`${"bm25 (production)".padEnd(48)}${line(suites.map((s) => runSuite(s).summary))}`);

for (const spec of specs) {
  const cache = new EmbeddingCache(spec, createEmbedder(spec, { openai: process.env.OPENAI_API_KEY, gemini: process.env.GEMINI_API_KEY }, { retries: 6, batchSize: 20 }));
  const data: { suite: (typeof suites)[number]; kb: KnowledgeBase; docs: Float32Array[]; queries: Float32Array[] }[] = [];
  for (const suite of suites) {
    const kb = new KnowledgeBase();
    kb.load("t", suite.corpus);
    const docs = await cache.get(suite.corpus.map(embeddingText), "document");
    const queries = await cache.get(suite.cases.map((c) => queryText(c.q, c.prev)), "query");
    cache.save();
    data.push({ suite, kb, docs, queries });
  }

  const run = (gate: Gate) =>
    data.map(({ suite, kb, docs, queries }) =>
      summarize(
        suite.cases.map((c, ci) => {
          const sims = docs.map((d) => dot(d, queries[ci]));
          const query = [{ text: c.q, weight: 1 }];
          if (c.prev) query.push({ text: c.prev, weight: PRODUCTION_SETTINGS.previousWeight });
          const lexical = kb.search("t", query, CANDIDATES);
          const fused = new Map<number, number>();
          const add = (i: number, rank: number) => fused.set(i, (fused.get(i) ?? 0) + 1 / (RRF_K + rank));
          sims
            .map((sim, i) => ({ i, sim }))
            .sort((a, b) => b.sim - a.sim)
            .slice(0, CANDIDATES)
            .forEach((r, rank) => add(r.i, rank));
          lexical.forEach((h, rank) => add(Number(h.chunk.id.split(":")[1]), rank));
          const ranked = [...fused]
            .sort((a, b) => b[1] - a[1])
            .slice(0, PRODUCTION_SETTINGS.topK)
            .map(([i, score]) => ({ i, score, sim: sims[i] }));
          const top = Math.max(...sims);
          const signals = {
            lexical: relevantHits(lexical.slice(0, PRODUCTION_SETTINGS.topK), PRODUCTION_SETTINGS.minScore).length > 0,
            top,
            margin: top - sims.reduce((a, b) => a + b, 0) / sims.length,
          };
          const used = gate(signals) ? ranked.filter((r) => r.sim >= top - NEAR_TOP) : [];
          const hits = (rs: typeof ranked): Hit[] => rs.map((r) => ({ chunk: { id: String(r.i), tenantId: "t", ...suite.corpus[r.i] }, score: r.score }));
          return scoreCase(c, hits(ranked), hits(used));
        }),
      ),
    );

  const sweep = (name: string, gate: (t: number) => Gate, from: number, to: number) => {
    let best = { t: from, total: -1, summaries: [] as Summary[] };
    for (let t = from; t <= to + 1e-9; t += 0.005) {
      const summaries = run(gate(t));
      const total = summaries.reduce((sum, s) => sum + s.passRate, 0);
      if (total > best.total + 1e-9) best = { t, total, summaries };
    }
    console.log(`${`${spec.split(":")[1]} ${name} t=${best.t.toFixed(3)}`.padEnd(48)}${line(best.summaries)}`);
  };

  console.log(`${`${spec.split(":")[1]} rrf, bm25 gate`.padEnd(48)}${line(run((s) => s.lexical))}`);
  sweep("cosine>=t", (t) => (s) => s.top >= t, 0.4, 0.9);
  sweep("bm25 or cosine>=t", (t) => (s) => s.lexical || s.top >= t, 0.4, 0.9);
  sweep("margin>=t", (t) => (s) => s.margin >= t, 0, 0.4);
  sweep("bm25 and margin>=t", (t) => (s) => s.lexical && s.margin >= t, 0, 0.4);
}
