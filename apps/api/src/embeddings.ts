// Semantic search in the chat API (docs/adr/0002-hybrid-retrieval.md). A bot's chunks are embedded
// in the background whenever its knowledge loads, keyed by text hash so unchanged pages are never
// embedded twice; each visitor message is embedded on the chat path under a short timeout. Every
// failure leaves lexical search in place: semantic search only ever adds to it.
import { chunkHash, embeddingText, embedderDims, vectorFromBytes, vectorToBytes, type Embedder } from "@apex/knowledge/embed";
import { log } from "./log.ts";
import { maskPII } from "./pii.ts";
import type { ChunkInput, KnowledgeBase, SemanticQuery } from "./retrieval.ts";

export interface StoredVector {
  hash: Uint8Array;
  vector: Uint8Array;
}

/** Where chunk vectors persist: app.knowledge_embeddings for dashboard bots, memory for the demo tenant. */
export interface VectorStore {
  load(tenantId: string, embedder: string, hashes: Uint8Array[]): Promise<StoredVector[]>;
  save(tenantId: string, embedder: string, vectors: StoredVector[]): Promise<void>;
  /** Drops the tenant's vectors that no current chunk uses (and other embedders' vectors). */
  prune(tenantId: string, embedder: string, keep: Uint8Array[]): Promise<number>;
}

const hex = (bytes: Uint8Array) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("hex");

export function memoryVectorStore(): VectorStore {
  const rows = new Map<string, Map<string, Uint8Array>>();
  const bucket = (tenantId: string, embedder: string) => {
    const key = `${tenantId}\0${embedder}`;
    return rows.get(key) ?? rows.set(key, new Map()).get(key)!;
  };
  return {
    async load(tenantId, embedder, hashes) {
      const b = bucket(tenantId, embedder);
      return hashes.flatMap((hash) => (b.has(hex(hash)) ? [{ hash, vector: b.get(hex(hash))! }] : []));
    },
    async save(tenantId, embedder, vectors) {
      const b = bucket(tenantId, embedder);
      for (const v of vectors) if (!b.has(hex(v.hash))) b.set(hex(v.hash), v.vector);
    },
    async prune(tenantId, embedder, keep) {
      const kept = new Set(keep.map(hex));
      let removed = 0;
      for (const [key, b] of rows) {
        if (!key.startsWith(`${tenantId}\0`)) continue;
        for (const h of [...b.keys()]) {
          if (key === `${tenantId}\0${embedder}` && kept.has(h)) continue;
          b.delete(h);
          removed++;
        }
      }
      return removed;
    },
  };
}

export interface IndexerOptions {
  /** Texts per embedding request and per save, so a rate limit mid-way keeps the progress made. */
  batchSize?: number;
  /** Wait before trying a failed bot again (while its knowledge hasn't changed meanwhile). */
  retryMs?: number;
}

/**
 * Embeds tenants' chunks in the background, one tenant at a time (a restart re-reads stored
 * vectors and embeds nothing; a new site embeds once, then only what changed).
 */
export interface IndexerStats {
  model: string;
  /** Jobs queued or running (one per knowledge load). */
  pending: number;
  /** The tenant being embedded now. */
  active: string | null;
  lastDoneAt: string | null;
  /** The last failed job: it is retried later, lexical search serves meanwhile. */
  lastError: { tenant: string; at: string; error: string } | null;
}

export class ChunkIndexer {
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private active: string | null = null;
  private lastDoneAt: Date | null = null;
  private lastError: IndexerStats["lastError"] = null;
  private readonly dims: number;
  private readonly batchSize: number;
  private readonly retryMs: number;

  constructor(
    private readonly knowledge: KnowledgeBase,
    private readonly embedder: Embedder,
    private readonly store: VectorStore,
    options: IndexerOptions = {},
  ) {
    const dims = embedderDims(embedder.id);
    if (!dims) throw new Error(`embedder id "${embedder.id}" has no dimensions`);
    this.dims = dims;
    this.batchSize = options.batchSize ?? 50;
    this.retryMs = options.retryMs ?? 5 * 60_000;
  }

  get id(): string {
    return this.embedder.id;
  }

  /** Queues the tenant's chunks as loaded at `generation`; resolves (never rejects) once that job has run. */
  index(tenantId: string, generation: number, chunks: ChunkInput[]): Promise<void> {
    this.pending++;
    this.queue = this.queue
      .then(() => {
        this.active = tenantId;
        return this.run(tenantId, generation, chunks);
      })
      .catch((error) => log("error", "knowledge embedding job crashed", { tenant: tenantId, error }))
      .finally(() => {
        this.pending--;
        this.active = null;
        this.lastDoneAt = new Date();
      });
    return this.queue;
  }

  /** The queue as the admin health details show it. */
  stats(): IndexerStats {
    return { model: this.embedder.id, pending: this.pending, active: this.active, lastDoneAt: this.lastDoneAt?.toISOString() ?? null, lastError: this.lastError };
  }

  private async run(tenantId: string, generation: number, chunks: ChunkInput[]): Promise<void> {
    // knowledge reloaded meanwhile: the newer load has its own job queued
    if (!this.knowledge.isCurrent(tenantId, generation)) return;
    const hashes = chunks.map(chunkHash);
    const keys = hashes.map(hex);
    const unique = new Map(keys.map((k, i) => [k, i]));
    const found = new Map<string, Float32Array>();
    const attach = () =>
      this.knowledge.attachVectors(
        tenantId,
        generation,
        this.embedder.id,
        keys.map((k) => found.get(k) ?? null),
      );

    let embedded = 0;
    try {
      for (const row of await this.store.load(tenantId, this.embedder.id, [...unique.values()].map((i) => hashes[i]))) {
        const vector = vectorFromBytes(row.vector, this.dims);
        if (vector) found.set(hex(row.hash), vector);
      }
      const reused = found.size;
      if (reused) attach();

      const missing = [...unique].filter(([k]) => !found.has(k)).map(([, i]) => i);
      for (let i = 0; i < missing.length; i += this.batchSize) {
        if (!this.knowledge.isCurrent(tenantId, generation)) return;
        const batch = missing.slice(i, i + this.batchSize);
        const vectors = await this.embedder.embed(
          batch.map((j) => embeddingText(chunks[j])),
          "document",
        );
        await this.store.save(
          tenantId,
          this.embedder.id,
          batch.map((j, n) => ({ hash: hashes[j], vector: vectorToBytes(vectors[n]) })),
        );
        batch.forEach((j, n) => found.set(keys[j], vectors[n]));
        embedded += batch.length;
        attach();
      }
      if (!attach()) return;
      const pruned = await this.store.prune(tenantId, this.embedder.id, [...unique.values()].map((i) => hashes[i]));
      log("info", "knowledge embedded", { tenant: tenantId, chunks: chunks.length, reused, embedded, pruned });
    } catch (error) {
      log("warn", "knowledge embedding failed; lexical search stays on", { tenant: tenantId, embedded, error });
      this.lastError = {
        tenant: tenantId,
        at: new Date().toISOString(),
        error: maskPII(error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 300),
      };
      setTimeout(() => {
        if (this.knowledge.isCurrent(tenantId, generation)) void this.index(tenantId, generation, chunks);
      }, this.retryMs).unref();
    }
  }
}

export interface QueryEmbedderOptions {
  /** A message waits at most this long for its embedding before falling back to lexical search. */
  timeoutMs?: number;
  /** Consecutive failures that pause embedding for `pauseMs`, so an outage doesn't slow every message. */
  failureLimit?: number;
  pauseMs?: number;
  cacheSize?: number;
  now?: () => number;
}

/** Embeds visitor messages on the chat path; never throws, null means "lexical only this time". */
export class QueryEmbedder {
  private cache = new Map<string, Float32Array>();
  private failures = 0;
  private pausedUntil = 0;
  private readonly timeoutMs: number;
  private readonly failureLimit: number;
  private readonly pauseMs: number;
  private readonly cacheSize: number;
  private readonly now: () => number;

  constructor(
    private readonly embedder: Embedder,
    options: QueryEmbedderOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 2500;
    this.failureLimit = options.failureLimit ?? 3;
    this.pauseMs = options.pauseMs ?? 60_000;
    this.cacheSize = options.cacheSize ?? 500;
    this.now = options.now ?? Date.now;
  }

  get id(): string {
    return this.embedder.id;
  }

  status(): "ok" | "paused" {
    return this.now() < this.pausedUntil ? "paused" : "ok";
  }

  /**
   * The cache is per tenant: a hit answers faster, and that difference must not tell one site
   * what visitors typed on another.
   */
  async embed(tenantId: string, texts: string[]): Promise<SemanticQuery | null> {
    const key = (t: string) => `${tenantId}\0${t}`;
    const vectors = new Map<string, Float32Array>();
    for (const t of texts) {
      const hit = this.cache.get(key(t));
      if (hit) vectors.set(t, hit);
    }
    const missing = [...new Set(texts.filter((t) => !vectors.has(t)))];
    if (missing.length) {
      if (this.status() === "paused") return null;
      try {
        const fresh = await this.embedder.embed(missing, "query", AbortSignal.timeout(this.timeoutMs));
        missing.forEach((t, i) => vectors.set(t, fresh[i]));
        this.failures = 0;
      } catch (error) {
        if (++this.failures >= this.failureLimit) {
          this.pausedUntil = this.now() + this.pauseMs;
          this.failures = 0;
          log("warn", "query embedding paused after repeated failures", { pauseMs: this.pauseMs, error });
        }
        return null;
      }
    }
    // re-inserting moves each text to the most recently used end (a Map iterates in insertion order)
    for (const [t, v] of vectors) {
      this.cache.delete(key(t));
      this.cache.set(key(t), v);
    }
    while (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value!);
    return { embedder: this.embedder.id, vectors: texts.map((t) => vectors.get(t)!) };
  }
}
