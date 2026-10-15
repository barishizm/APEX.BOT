// Lexical (BM25) retrieval over each tenant's chunks. Indexes are kept per tenant,
// so a search can only ever see one tenant's content and cannot run without a tenant id.
// shortcut: in-memory BM25 until the pgvector + full-text hybrid search from the README lands.
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
  chunks: Chunk[];
  termFreqs: Map<string, number>[];
  lengths: number[];
  avgLength: number;
  docFreq: Map<string, number>;
}

const K1 = 1.2;
const B = 0.75;

export class KnowledgeBase {
  private indexes = new Map<string, TenantIndex>();

  /** Replaces a tenant's whole index. */
  load(tenantId: string, inputs: ChunkInput[]): void {
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
    this.indexes.set(tenantId, { chunks, termFreqs, lengths, avgLength, docFreq });
  }

  /**
   * Weighted query terms let the previous question add context to a follow-up
   * ("ya kargo?") without outranking the current one.
   */
  search(tenantId: string, query: { text: string; weight: number }[], k: number): Hit[] {
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
}

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
