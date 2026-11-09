// Loads golden suites and runs them through retrieval exactly the way /v1/chat does: the same
// retrieve() call, top-k, floors, confidence cut and follow-up handling. Embeddings come from the
// committed cache in data/embeddings, so this runs offline (and in CI) without an API key.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultLimits } from "@apex/api/src/config.ts";
import { DEFAULT_EMBEDDER, createEmbedder, embeddingText } from "@apex/knowledge/embed";
import { DEFAULT_RETRIEVAL, KnowledgeBase, retrieve, semanticQueryTexts, type ChunkInput, type RetrievalSettings, type SemanticQuery } from "@apex/knowledge/retrieval";
import { EmbeddingCache } from "./embeddings.ts";
import { scoreCase, summarize, type CaseResult, type GoldenCase, type Summary } from "./metrics.ts";

export const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../data");

export interface Suite {
  name: string;
  description: string;
  corpus: ChunkInput[];
  cases: GoldenCase[];
}

export interface EvalSettings extends RetrievalSettings {
  /** Embedder spec, or null for lexical-only retrieval (production without APEX_EMBEDDINGS). */
  embedder: string | null;
}

/** Mirrors apps/api/src/app.ts (POST /v1/chat) with a tenant on default settings. */
export const PRODUCTION_SETTINGS: EvalSettings = {
  ...DEFAULT_RETRIEVAL,
  topK: defaultLimits.retrievalTopK,
  minScore: defaultLimits.minRetrievalScore,
  confidence: "balanced",
  embedder: DEFAULT_EMBEDDER,
};

/**
 * Embeddings for a suite's corpus and questions. Reads the committed cache; with the provider's API
 * key in the environment, fills what's missing (a new case) and saves it, to be committed.
 */
export async function suiteEmbeddings(suite: Suite, embedder: string) {
  const keys = { openai: process.env.OPENAI_API_KEY, gemini: process.env.GEMINI_API_KEY };
  const live = keys.openai || keys.gemini ? createEmbedder(embedder, keys, { retries: 6, batchSize: 20 }) : undefined;
  const cache = new EmbeddingCache(embedder, live);
  const docs = await cache.get(suite.corpus.map(embeddingText), "document");
  const texts = [...new Set(suite.cases.flatMap((c) => semanticQueryTexts(c.q, c.prev)))];
  const vectors = await cache.get(texts, "query");
  cache.save();
  const byText = new Map(texts.map((t, i) => [t, vectors[i]]));
  return {
    docs,
    query: (q: string, prev?: string): SemanticQuery => ({ embedder, vectors: semanticQueryTexts(q, prev).map((t) => byText.get(t)!) }),
  };
}

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

/** Tags that mark a case the site can't answer; every unanswerable case carries one. */
const UNANSWERABLE_TAGS = ["unknown", "smalltalk", "offtopic"];

/**
 * A typo in an expected path would silently turn a case into an unwinnable one; a missing language
 * tag drops it from the per-language numbers; a repeated question weighs twice.
 */
export function validate(name: string, cases: GoldenCase[], corpus: ChunkInput[]): void {
  const paths = new Set(corpus.map((c) => new URL(c.url).pathname));
  const ids = new Set<string>();
  const questions = new Map<string, string>();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`${name}: duplicate case id ${c.id}`);
    ids.add(c.id);
    const question = `${c.prev ?? ""}\n${c.q.trim().toLowerCase()}`;
    const twin = questions.get(question);
    if (twin) throw new Error(`${name}/${c.id}: same question as ${twin}`);
    questions.set(question, c.id);
    if (c.tags.includes("en") === c.tags.includes("tr")) throw new Error(`${name}/${c.id}: needs exactly one of the tags en, tr`);
    if (c.expect === null) {
      if (!c.tags.some((t) => UNANSWERABLE_TAGS.includes(t))) throw new Error(`${name}/${c.id}: unanswerable, so needs one of the tags ${UNANSWERABLE_TAGS.join(", ")}`);
      continue;
    }
    if (c.expect.length === 0) throw new Error(`${name}/${c.id}: expect lists no page; use null for an unanswerable case`);
    for (const p of c.expect) {
      if (!paths.has(p)) throw new Error(`${name}/${c.id}: expected path ${p} is not in the corpus`);
    }
  }
}

export async function runSuite(suite: Suite, settings: EvalSettings = PRODUCTION_SETTINGS): Promise<SuiteResult> {
  const kb = new KnowledgeBase();
  const tenant = `eval_${suite.name}`;
  const generation = kb.load(tenant, suite.corpus);
  const embeddings = settings.embedder ? await suiteEmbeddings(suite, settings.embedder) : null;
  if (embeddings) kb.attachVectors(tenant, generation, settings.embedder!, embeddings.docs);
  const cases = suite.cases.map((c) => {
    const { ranked, hits } = retrieve(kb, tenant, { message: c.q, previous: c.prev, semantic: embeddings?.query(c.q, c.prev) }, settings);
    return scoreCase(c, ranked, hits);
  });
  return { name: suite.name, summary: summarize(cases), cases };
}
