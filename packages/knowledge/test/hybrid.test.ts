import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chunkHash, embedderDims, normalize, vectorFromBytes, vectorToBytes } from "../src/embed.ts";
import {
  DEFAULT_RETRIEVAL,
  KnowledgeBase,
  relevantHits,
  relevantHybridHits,
  retrieve,
  semanticQueryTexts,
  type ChunkInput,
  type RetrievalSettings,
} from "../src/retrieval.ts";

const EMB = "test:concepts@3";
const v = (...xs: number[]) => normalize(Float32Array.from(xs));

// three "concepts": work, shipping, refunds
const corpus: ChunkInput[] = [
  { url: "https://x.example/about", title: "About", text: "AI Engineer Intern at Interip, student at VILNIUS TECH." },
  { url: "https://x.example/kargo", title: "Kargo", text: "Kargo 1-3 iş günü sürer, 750 TL üzeri ücretsizdir." },
  { url: "https://x.example/iade", title: "İade", text: "Açılmamış ürünleri 14 gün içinde iade edebilirsiniz." },
];
const vectors = [v(1, 0, 0), v(0, 1, 0.1), v(0, 0.1, 1)];

const settings: RetrievalSettings = { ...DEFAULT_RETRIEVAL, topK: 4, minScore: 0.3, confidence: "balanced" };

function kb(withVectors = true) {
  const k = new KnowledgeBase();
  const generation = k.load("t", corpus);
  if (withVectors) assert.equal(k.attachVectors("t", generation, EMB, vectors), true);
  return k;
}

describe("hybrid retrieval", () => {
  it("finds a page by meaning when no word matches", () => {
    const k = kb();
    // "What is his job?" shares no searchable word with the About page
    assert.deepEqual(k.search("t", [{ text: "What is his job?", weight: 1 }], 4), []);
    const { hits } = retrieve(k, "t", { message: "What is his job?", semantic: { embedder: EMB, vectors: [v(0.9, 0.1, 0)] } }, settings);
    assert.equal(hits[0].chunk.url, "https://x.example/about");
    assert.equal(hits[0].lexical, null);
    assert.ok(hits[0].semantic! > 0.9);
  });

  it("fuses both lists: a chunk found by both ranks first", () => {
    const k = kb();
    const ranked = k.hybridSearch("t", { lexical: [{ text: "iade", weight: 1 }], semantic: { embedder: EMB, vectors: [v(0, 0.2, 1)] } });
    assert.equal(ranked[0].chunk.url, "https://x.example/iade");
    assert.ok(ranked[0].lexical! > 0 && ranked[0].semantic! > 0.9);
  });

  it("without a semantic query, matches the lexical path exactly", () => {
    const k = kb();
    for (const message of ["iade nasıl", "kargo ücretsiz mi", "Bitcoin?", "merhaba"]) {
      const old = relevantHits(k.search("t", [{ text: message, weight: 1 }], settings.topK), settings.minScore, settings.confidence);
      const { hits } = retrieve(k, "t", { message, semantic: null }, settings);
      assert.deepEqual(hits.map((h) => h.chunk.id), old.map((h) => h.chunk.id), message);
    }
  });

  it("ignores vectors from another embedder", () => {
    const k = kb();
    assert.deepEqual(k.semanticSearch("t", { embedder: "other:model@3", vectors: [v(1, 0, 0)] }, 3), []);
    assert.deepEqual(kb(false).semanticSearch("t", { embedder: EMB, vectors: [v(1, 0, 0)] }, 3), []);
  });

  it("takes the best similarity over the query texts (message, and with the previous one)", () => {
    const k = kb();
    const hits = k.semanticSearch("t", { embedder: EMB, vectors: [v(0, 0, 1), v(1, 0, 0)] }, 3);
    assert.ok(hits[0].score > 0.99 && hits[1].score > 0.99);
    assert.deepEqual(semanticQueryTexts("ya kargo?"), ["ya kargo?"]);
    assert.deepEqual(semanticQueryTexts("ya kargo?", "iade süresi?"), ["ya kargo?", "iade süresi?\nya kargo?"]);
  });

  it("keeps a hit that clears either floor, and drops content close to nothing", () => {
    const k = kb();
    const ranked = k.hybridSearch("t", { lexical: [{ text: "kargo", weight: 1 }], semantic: { embedder: EMB, vectors: [v(0.2, 0.2, 0.2)] } });
    const floors = { minScore: settings.minScore, minSimilarity: 0.7, nearTop: 0.08 };
    // every page is equally (and weakly, ~0.6) similar: only the lexical match survives
    assert.deepEqual(relevantHybridHits(ranked, floors).map((h) => h.chunk.url), ["https://x.example/kargo"]);
    // "strict" confidence raises the similarity floor, "lenient" lowers it
    const close = k.hybridSearch("t", { lexical: [], semantic: { embedder: EMB, vectors: [v(1, 0, 0.34)] } });
    assert.equal(relevantHybridHits(close, { ...floors, minSimilarity: 0.92 }, "lenient").length, 1);
    assert.equal(relevantHybridHits(close, { ...floors, minSimilarity: 0.92 }, "strict").length, 0);
  });

  it("keeps semantic extras only within the near-top window", () => {
    const k = kb();
    const ranked = k.hybridSearch("t", { lexical: [], semantic: { embedder: EMB, vectors: [v(1, 0.5, 0)] } });
    const used = relevantHybridHits(ranked, { minScore: 2, minSimilarity: 0, nearTop: 0.08 });
    assert.deepEqual(used.map((h) => h.chunk.url), ["https://x.example/about"]);
  });

  it("never attaches vectors computed for an older load", () => {
    const k = new KnowledgeBase();
    const first = k.load("t", corpus);
    const second = k.load("t", corpus.slice(0, 2));
    assert.equal(k.isCurrent("t", first), false);
    assert.equal(k.attachVectors("t", first, EMB, vectors), false);
    assert.deepEqual(k.coverage("t"), { chunks: 2, embedded: 0, embedder: null });
    assert.throws(() => k.attachVectors("t", second, EMB, vectors), /one vector/);
    assert.equal(k.attachVectors("t", second, EMB, [vectors[0], null]), true);
    assert.deepEqual(k.coverage("t"), { chunks: 2, embedded: 1, embedder: EMB });
  });

  it("keeps tenants apart", () => {
    const k = kb();
    k.load("u", [{ url: "https://u.example/secret", title: "Secret", text: "Toptan fiyatlar gizlidir." }]);
    const hits = k.hybridSearch("t", { lexical: [{ text: "toptan gizli", weight: 1 }], semantic: { embedder: EMB, vectors: [v(1, 1, 1)] } });
    assert.equal(hits.some((h) => h.chunk.tenantId !== "t"), false);
    assert.throws(() => k.hybridSearch("", { lexical: [] }), /tenantId/);
  });
});

describe("vector storage helpers", () => {
  it("round-trips a vector through bytes, rejecting the wrong size", () => {
    const vec = v(3, 4, 0);
    const bytes = vectorToBytes(vec);
    assert.equal(bytes.byteLength, 12);
    // a driver Buffer can start at an odd offset of a larger pool
    const pooled = new Uint8Array(20);
    pooled.set(bytes, 5);
    assert.deepEqual([...vectorFromBytes(pooled.subarray(5, 17), 3)!], [...vec]);
    assert.equal(vectorFromBytes(bytes, 4), null);
  });

  it("hashes chunks by their embedded text and reads dimensions from the id", () => {
    assert.deepEqual(chunkHash({ title: "A", text: "b" }), chunkHash({ title: "A", text: "b" }));
    assert.notDeepEqual(chunkHash({ title: "A", text: "b" }), chunkHash({ title: "A", text: "c" }));
    assert.equal(chunkHash({ title: "A", text: "b" }).byteLength, 32);
    assert.equal(embedderDims("gemini:gemini-embedding-2@768"), 768);
    assert.equal(embedderDims("nope"), null);
  });
});
