// Embedding cache for the embeddings experiment. Vectors are fetched once into data/embeddings
// (gitignored), so threshold sweeps rerun offline in seconds and free-tier quotas are hit once.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { decodeVector, encodeVector, type EmbedKind, type Embedder } from "./embed.ts";
import { DATA_DIR } from "./suite.ts";

export const cachePath = (embedderId: string) => resolve(DATA_DIR, "embeddings", `${embedderId.replace(/[^\w.@-]+/g, "_")}.json`);

const keyOf = (kind: EmbedKind, text: string) => createHash("sha256").update(`${kind}\0${text}`).digest("hex").slice(0, 24);

export class EmbeddingCache {
  private vectors: Record<string, string>;
  private dirty = false;

  constructor(
    readonly embedderId: string,
    private embedder?: Embedder,
  ) {
    const file = cachePath(embedderId);
    this.vectors = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).vectors : {};
  }

  async get(texts: string[], kind: EmbedKind): Promise<Float32Array[]> {
    const missing = [...new Set(texts.filter((t) => !this.vectors[keyOf(kind, t)]))];
    if (missing.length > 0) {
      if (!this.embedder) throw new Error(`${missing.length} ${kind} embeddings missing from ${cachePath(this.embedderId)}; rerun with the provider's API key to fill the cache`);
      const fresh = await this.embedder.embed(missing, kind);
      missing.forEach((t, i) => (this.vectors[keyOf(kind, t)] = encodeVector(fresh[i])));
      this.dirty = true;
    }
    return texts.map((t) => decodeVector(this.vectors[keyOf(kind, t)]));
  }

  save(): void {
    if (!this.dirty) return;
    const file = cachePath(this.embedderId);
    mkdirSync(dirname(file), { recursive: true });
    // Sorted keys keep diffs small when a case is added.
    const vectors = Object.fromEntries(Object.entries(this.vectors).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(file, `${JSON.stringify({ embedder: this.embedderId, vectors }, null, 1)}\n`);
    this.dirty = false;
  }
}
