// Hybrid retrieval over each tenant's chunks: lexical (BM25) plus, once the chunks are embedded,
// semantic (cosine) search, fused by reciprocal rank. Indexes are kept per tenant, so a search can
// only ever see one tenant's content and cannot run without a tenant id. See
// docs/adr/0002-hybrid-retrieval.md for why the index lives in memory rather than in pgvector.
import { dot } from "./embed.ts";
import { LOOSE, tokenize } from "./text.ts";

export interface ChunkInput {
  url: string;
  title: string;
  text: string;
}

export interface Chunk extends ChunkInput {
  id: string;
  tenantId: string;
}

export interface Hit {
  chunk: Chunk;
  score: number;
}

interface TenantIndex {
  /** Bumped on every load, so vectors computed for an older load are never attached to a newer one. */
  generation: number;
  chunks: Chunk[];
  termFreqs: Map<string, number>[];
  lengths: number[];
  avgLength: number;
  docFreq: Map<string, number>;
  /** The embedder ("provider:model@dims") the vectors came from; null until any are attached. */
  embedder: string | null;
  /** Per chunk, in chunk order; null for a chunk not embedded (yet). */
  vectors: (Float32Array | null)[];
  embedded: number;
}

/** A query's terms with weights: the previous message adds context to a follow-up at a lower weight. */
export type LexicalQuery = { text: string; weight: number }[];

export interface SemanticQuery {
  /** Must match the index's embedder; vectors from another model aren't comparable. */
  embedder: string;
  /** Similarity is the best over these (e.g. the message alone, and with the previous one). */
  vectors: Float32Array[];
}

/** A hybrid result: `score` is the fused rank score; the per-retriever scores say why it matched. */
export interface HybridHit extends Hit {
  /** BM25 score, when the chunk was among the lexical candidates. */
  lexical: number | null;
  /** Cosine similarity, when the chunk was among the semantic candidates. */
  semantic: number | null;
}

const K1 = 1.2;
const B = 0.75;

export class KnowledgeBase {
  private indexes = new Map<string, TenantIndex>();
  private generations = 0;

  /** Replaces a tenant's whole index (without vectors); returns its generation for attachVectors. */
  load(tenantId: string, inputs: ChunkInput[]): number {
    requireTenant(tenantId);
    const chunks = inputs.map((c, i) => ({ ...c, id: `${tenantId}:${i}`, tenantId }));
    const termFreqs: Map<string, number>[] = [];
    const lengths: number[] = [];
    const docFreq = new Map<string, number>();
    for (const chunk of chunks) {
      // The title is repeated so headings weigh a little more than body text.
      const tokens = tokenize(`${chunk.title} ${chunk.title} ${chunk.text}`);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
      termFreqs.push(tf);
      lengths.push(tokens.length);
    }
    const avgLength = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);
    const generation = ++this.generations;
    this.indexes.set(tenantId, { generation, chunks, termFreqs, lengths, avgLength, docFreq, embedder: null, vectors: chunks.map(() => null), embedded: 0 });
    return generation;
  }

  /**
   * Attaches chunk vectors (in the order the chunks were loaded; null = not embedded). Ignored, and
   * false, when the tenant's index has been reloaded since `generation`.
   */
  attachVectors(tenantId: string, generation: number, embedder: string, vectors: (Float32Array | null)[]): boolean {
    requireTenant(tenantId);
    const index = this.indexes.get(tenantId);
    if (!index || index.generation !== generation) return false;
    if (vectors.length !== index.chunks.length) throw new Error("one vector (or null) per chunk is required");
    index.embedder = embedder;
    index.vectors = vectors;
    index.embedded = vectors.filter(Boolean).length;
    return true;
  }

  /** Whether `generation` is still the tenant's loaded index (a background job's work isn't stale). */
  isCurrent(tenantId: string, generation: number): boolean {
    return this.indexes.get(tenantId)?.generation === generation;
  }

  /** How many of the tenant's chunks can be found by meaning, for logs and health checks. */
  coverage(tenantId: string): { chunks: number; embedded: number; embedder: string | null } {
    const index = this.indexes.get(tenantId);
    if (!index) return { chunks: 0, embedded: 0, embedder: null };
    return { chunks: index.chunks.length, embedded: index.embedded, embedder: index.embedder };
  }

  /**
   * Weighted query terms let the previous question add context to a follow-up
   * ("ya kargo?") without outranking the current one.
   */
  search(tenantId: string, query: LexicalQuery, k: number): Hit[] {
    requireTenant(tenantId);
    const index = this.indexes.get(tenantId);
    if (!index || index.chunks.length === 0) return [];

    const weights = new Map<string, number>();
    for (const part of query) {
      for (const t of new Set(tokenize(part.text))) {
        const weight = t.startsWith(LOOSE) ? part.weight / 2 : part.weight;
        weights.set(t, Math.max(weights.get(t) ?? 0, weight));
      }
    }
    if (weights.size === 0) return [];

    const n = index.chunks.length;
    const hits: Hit[] = [];
    index.termFreqs.forEach((tf, i) => {
      let score = 0;
      for (const [term, weight] of weights) {
        const f = tf.get(term);
        if (!f) continue;
        const df = index.docFreq.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += weight * idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * index.lengths[i]) / index.avgLength)));
      }
      if (score > 0) hits.push({ chunk: index.chunks[i], score });
    });
    return hits.sort((a, b) => b.score - a.score).slice(0, k);
  }

  /** Chunks by cosine similarity to the query; empty when the index has no vectors from that embedder. */
  semanticSearch(tenantId: string, query: SemanticQuery, k: number): Hit[] {
    requireTenant(tenantId);
    const index = this.indexes.get(tenantId);
    if (!index || index.embedder !== query.embedder || query.vectors.length === 0) return [];
    const hits: Hit[] = [];
    index.vectors.forEach((v, i) => {
      if (!v) return;
      let score = -1;
      for (const q of query.vectors) if (q.length === v.length) score = Math.max(score, dot(q, v));
      if (score > -1) hits.push({ chunk: index.chunks[i], score });
    });
    return hits.sort((a, b) => b.score - a.score).slice(0, k);
  }

  /**
   * Lexical and semantic candidates (up to `candidates` from each) fused by reciprocal rank (RRF),
   * best first. Without a semantic query (no embedder, or the query embedding failed) this is the
   * lexical ranking with RRF scores. Pick from the whole list with relevantHybridHits, then cut to k.
   */
  hybridSearch(tenantId: string, query: { lexical: LexicalQuery; semantic?: SemanticQuery | null }, candidates = CANDIDATES): HybridHit[] {
    const lists = [this.search(tenantId, query.lexical, candidates), query.semantic ? this.semanticSearch(tenantId, query.semantic, candidates) : []];
    const fused = new Map<string, HybridHit>();
    lists.forEach((list, which) =>
      list.forEach((hit, rank) => {
        const entry = fused.get(hit.chunk.id) ?? { chunk: hit.chunk, score: 0, lexical: null, semantic: null };
        entry.score += 1 / (RRF_K + rank + 1);
        if (which === 0) entry.lexical = hit.score;
        else entry.semantic = hit.score;
        fused.set(hit.chunk.id, entry);
      }),
    );
    return [...fused.values()].sort((a, b) => b.score - a.score);
  }
}

/** The usual RRF constant: damps the difference between neighbouring ranks. */
const RRF_K = 60;
/** Candidates each retriever contributes to the fusion. */
const CANDIDATES = 20;

function requireTenant(tenantId: string): void {
  if (typeof tenantId !== "string" || tenantId.length === 0) throw new Error("tenantId is required");
}

/** Retrieval floor multiplier per "answer confidence" setting. */
export const CONFIDENCE = { strict: 1.5, balanced: 1, lenient: 0.6 } as const;
export type Confidence = keyof typeof CONFIDENCE;

/**
 * The hits an answer may use: an absolute floor for the "I don't know" path, plus a relative
 * cut so weak extras don't show up as sources. Empty means "I don't know".
 */
export function relevantHits(ranked: Hit[], minScore: number, confidence: Confidence = "balanced"): Hit[] {
  const floor = Math.max(minScore * CONFIDENCE[confidence], (ranked[0]?.score ?? 0) * 0.5);
  return ranked.filter((h) => h.score >= floor);
}

/** Cosine floor shift per "answer confidence" setting (cosine isn't a scale a multiplier suits). */
export const SEMANTIC_CONFIDENCE = { strict: 0.04, balanced: 0, lenient: -0.04 } as const;

export interface HybridFloors {
  /** BM25 floor, as in relevantHits. */
  minScore: number;
  /** Cosine floor for this embedder: below it nothing is "about" the site's content. */
  minSimilarity: number;
  /** Semantic hits must also be within this of the best one, so weak extras stay out. */
  nearTop: number;
}

/**
 * The hybrid hits an answer may use, in fused order: a hit stays when its BM25 score clears the
 * lexical floor (as in relevantHits) or its similarity clears the semantic one. Empty means nothing
 * on the site is close to the message (greetings, off-topic); whether the kept excerpts actually
 * answer it is the model's call (the [[no-answer]] marker, docs/adr/0001-retrieval-embeddings.md).
 */
export function relevantHybridHits(ranked: HybridHit[], floors: HybridFloors, confidence: Confidence = "balanced"): HybridHit[] {
  const lexicalFloor = Math.max(floors.minScore * CONFIDENCE[confidence], Math.max(0, ...ranked.map((h) => h.lexical ?? 0)) * 0.5);
  const bestSemantic = Math.max(-1, ...ranked.map((h) => h.semantic ?? -1));
  const semanticFloor = Math.max(floors.minSimilarity + SEMANTIC_CONFIDENCE[confidence], bestSemantic - floors.nearTop);
  return ranked.filter((h) => (h.lexical !== null && h.lexical >= lexicalFloor) || (h.semantic !== null && h.semantic >= semanticFloor));
}

/**
 * Cosine floors measured per embedder with `npm run experiment:hybrid -w @apex/evals`: just under
 * the lowest similarity of a right page across the golden suites, so it only drops content that is
 * about something else entirely. An embedder not listed here gets no floor (top-k still applies).
 */
export const SEMANTIC_FLOORS: Readonly<Record<string, number>> = {
  "gemini:gemini-embedding-2@768": 0.5,
  "gemini:gemini-embedding-001@768": 0.5,
};

export interface RetrievalSettings {
  topK: number;
  /** BM25 floor (APEX_MIN_RETRIEVAL_SCORE). */
  minScore: number;
  confidence: Confidence;
  /** Weight of the previous visitor message in a follow-up's lexical query. */
  previousWeight: number;
  /** Semantic hits must be within this of the best similarity. */
  nearTop: number;
}

export const DEFAULT_RETRIEVAL: Omit<RetrievalSettings, "topK" | "minScore" | "confidence"> = { previousWeight: 0.5, nearTop: 0.08 };

/**
 * What gets embedded for a message: the message alone, and for a follow-up also joined to the
 * previous one ("what is his job?" after "What does he do?"). Similarity is the best of the two,
 * so the earlier turn adds context without outweighing a change of subject. One request either way.
 */
export const semanticQueryTexts = (message: string, previous?: string): string[] =>
  previous ? [message, `${previous}\n${message}`] : [message];

/**
 * The one retrieval path: /v1/chat, the dashboard's "Try a question" and the evals all call this.
 * `ranked` is the fused top k (for display and ranking metrics); `hits` is what reaches the model.
 */
export function retrieve(
  kb: KnowledgeBase,
  tenantId: string,
  input: { message: string; previous?: string; semantic?: SemanticQuery | null },
  settings: RetrievalSettings,
): { ranked: HybridHit[]; hits: HybridHit[] } {
  const lexical: LexicalQuery = [{ text: input.message, weight: 1 }];
  if (input.previous) lexical.push({ text: input.previous, weight: settings.previousWeight });
  const all = kb.hybridSearch(tenantId, { lexical, semantic: input.semantic });
  const minSimilarity = input.semantic ? (SEMANTIC_FLOORS[input.semantic.embedder] ?? 0) : 0;
  const hits = relevantHybridHits(all, { minScore: settings.minScore, minSimilarity, nearTop: settings.nearTop }, settings.confidence);
  return { ranked: all.slice(0, settings.topK), hits: hits.slice(0, settings.topK) };
}
