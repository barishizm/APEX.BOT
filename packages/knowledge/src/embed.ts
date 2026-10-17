// Text embeddings over plain fetch (no SDKs), for hybrid retrieval (docs/adr/0002-hybrid-retrieval.md)
// and the evals. Vectors come back L2-normalised, so cosine similarity is a dot product.
import { createHash } from "node:crypto";

export type EmbedKind = "query" | "document";

export interface Embedder {
  /** "provider:model@dims", stored next to each vector so a model change is detectable. */
  readonly id: string;
  embed(texts: string[], kind: EmbedKind, signal?: AbortSignal): Promise<Float32Array[]>;
}

export interface EmbedderKeys {
  openai?: string;
  gemini?: string;
}

export class EmbedError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "EmbedError";
  }
}

type Fetch = typeof fetch;

export interface EmbedderOptions {
  fetch?: Fetch;
  /**
   * Retries after HTTP 429/5xx, honouring Retry-After. Keep 0 on the chat path (a slow answer is
   * worse than a lexical one); bulk indexing can afford to wait out a per-minute quota.
   */
  retries?: number;
  /** Inputs per request; free tiers count each input against a per-minute quota. */
  batchSize?: number;
}

const TIMEOUT_MS = 15_000;
const MAX_RETRY_DELAY_MS = 60_000;

/** Parses "openai:text-embedding-3-small@512" or "gemini:gemini-embedding-001@768". */
export function createEmbedder(spec: string, keys: EmbedderKeys, options: EmbedderOptions = {}): Embedder {
  const { fetch: fetchFn = fetch, retries = 0, batchSize = 96 } = options;
  const match = /^(openai|gemini):([\w.-]+)@(\d+)$/.exec(spec.trim());
  if (!match) throw new EmbedError(`invalid embedder spec "${spec}" (expected provider:model@dims)`);
  const [, provider, model, dimsRaw] = match;
  const dims = Number(dimsRaw);
  const key = provider === "openai" ? keys.openai : keys.gemini;
  if (!key) throw new EmbedError(`missing API key for ${provider}`);
  const call = provider === "openai" ? openaiBatch : geminiBatch;
  return {
    id: `${provider}:${model}@${dims}`,
    async embed(texts, kind, signal) {
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize).map((t) => t.slice(0, 8000) || " ");
        const vectors = await withRetries(retries, signal, () => {
          const timeout = AbortSignal.timeout(TIMEOUT_MS);
          return call(fetchFn, key, model, dims, batch, kind, signal ? AbortSignal.any([signal, timeout]) : timeout);
        });
        if (vectors.length !== batch.length) throw new EmbedError(`${provider} returned ${vectors.length} vectors for ${batch.length} inputs`);
        for (const v of vectors) {
          if (v.length !== dims) throw new EmbedError(`${provider} returned ${v.length} dimensions, expected ${dims}`);
          out.push(normalize(Float32Array.from(v)));
        }
      }
      return out;
    },
  };
}

async function withRetries<T>(retries: number, signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const retryable = error instanceof EmbedError && (error.status === 429 || (error.status ?? 0) >= 500);
      if (!retryable || attempt >= retries || signal?.aborted) throw error;
      const delay = Math.min(error.retryAfterMs ?? 1000 * 2 ** attempt, MAX_RETRY_DELAY_MS);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function post(fetchFn: Fetch, url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal): Promise<any> {
  const res = await fetchFn(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal });
  if (!res.ok) {
    // The body can echo input text; keep only the status in the error.
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new EmbedError(`embedding request failed with HTTP ${res.status}`, res.status, retryAfter > 0 ? retryAfter * 1000 : undefined);
  }
  return res.json();
}

async function openaiBatch(fetchFn: Fetch, key: string, model: string, dims: number, input: string[], _kind: EmbedKind, signal: AbortSignal) {
  const json = await post(fetchFn, "https://api.openai.com/v1/embeddings", { authorization: `Bearer ${key}` }, { model, input, dimensions: dims }, signal);
  return (json.data as { index: number; embedding: number[] }[]).sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

async function geminiBatch(fetchFn: Fetch, key: string, model: string, dims: number, texts: string[], kind: EmbedKind, signal: AbortSignal) {
  const taskType = kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT";
  const requests = texts.map((text) => ({ model: `models/${model}`, content: { parts: [{ text }] }, taskType, outputDimensionality: dims }));
  const json = await post(
    fetchFn,
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`,
    { "x-goog-api-key": key },
    { requests },
    signal,
  );
  return (json.embeddings as { values: number[] }[]).map((e) => e.values);
}

export function normalize(v: Float32Array): Float32Array {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

/** Cosine similarity of two normalised vectors. */
export function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** The text a chunk is embedded as: its title carries the topic when the body doesn't repeat it. */
export const embeddingText = (chunk: { title: string; text: string }) => `${chunk.title}\n${chunk.text}`;

/** What a chunk's stored vector is keyed by: sha256 of its embedding text, so equal text shares a vector. */
export const chunkHash = (chunk: { title: string; text: string }): Uint8Array => new Uint8Array(createHash("sha256").update(embeddingText(chunk)).digest());

/** Dimensions from an embedder id ("gemini:gemini-embedding-2@768" -> 768); null if malformed. */
export function embedderDims(id: string): number | null {
  const match = /@(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
}

/** Storage bytes of a vector: float32, little-endian (the byte order of every platform Node runs on here). */
export const vectorToBytes = (v: Float32Array): Uint8Array => new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));

/** A stored vector back, or null when its length doesn't fit `dims` (a row from a different model). */
export function vectorFromBytes(bytes: Uint8Array, dims: number): Float32Array | null {
  if (bytes.byteLength !== dims * 4) return null;
  // copied out: a driver's Buffer can sit at an unaligned offset of a shared pool
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

/** Compact storage form (base64 of the float32 bytes): ~4/3 bytes per byte, versus ~10 for JSON numbers. */
export const encodeVector = (v: Float32Array): string => Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64");

export function decodeVector(s: string): Float32Array {
  const bytes = Buffer.from(s, "base64");
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

/**
 * The embedder hybrid retrieval was calibrated with (docs/adr/0002-hybrid-retrieval.md): best
 * ranking of the models measured, Turkish included, and 768 dimensions keep a full bot (5000
 * chunks) at about 15 MB in memory.
 */
export const DEFAULT_EMBEDDER = "gemini:gemini-embedding-2@768";
