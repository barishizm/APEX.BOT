// Hybrid search in the chat API: background chunk embedding, the query embedder's fallbacks,
// and /v1/chat finding content by meaning.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalize, type EmbedKind, type Embedder } from "@apex/knowledge/embed";
import type { AppDeps } from "../src/app.ts";
import { ChunkIndexer, QueryEmbedder, memoryVectorStore } from "../src/embeddings.ts";
import { KnowledgeBase, type ChunkInput } from "../src/retrieval.ts";
import { A, headers, readSSE, setup } from "./helpers.ts";

// A stand-in embedding model over three concepts, so tests can say what "means" what.
const CONCEPTS = [/job|work|intern|engineer|iş/i, /ship|kargo|deliver/i, /refund|iade|return/i];
class ConceptEmbedder implements Embedder {
  readonly id = "test:concepts@3";
  calls: { texts: string[]; kind: EmbedKind }[] = [];
  fail = false;
  /** Fail after this many successful calls (null: never). */
  failAfter: number | null = null;
  hang = false;

  async embed(texts: string[], kind: EmbedKind, signal?: AbortSignal): Promise<Float32Array[]> {
    this.calls.push({ texts, kind });
    if (this.hang) {
      // a real request holds a socket open; without that, AbortSignal.timeout's unref'd timer lets the test process exit first
      const alive = setInterval(() => {}, 1000);
      await new Promise((_, reject) =>
        signal?.addEventListener("abort", () => {
          clearInterval(alive);
          reject(new Error("aborted"));
        }),
      );
    }
    if (this.fail || (this.failAfter !== null && this.calls.length > this.failAfter)) throw new Error("HTTP 429");
    return texts.map((t) => normalize(Float32Array.from(CONCEPTS.map((c) => (c.test(t) ? 1 : 0.05)))));
  }
}

const chunks: ChunkInput[] = [
  { url: "https://alpha.example/about", title: "About", text: "AI Engineer Intern at Interip, student at VILNIUS TECH." },
  { url: "https://alpha.example/kargo", title: "Kargo", text: "Kargo 1-3 gün sürer." },
  { url: "https://alpha.example/iade", title: "İade", text: "14 gün içinde iade." },
];
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("ChunkIndexer", () => {
  it("embeds a tenant's chunks once, then reuses stored vectors after a reload", async () => {
    const knowledge = new KnowledgeBase();
    const embedder = new ConceptEmbedder();
    const store = memoryVectorStore();
    const indexer = new ChunkIndexer(knowledge, embedder, store, { batchSize: 2 });

    await indexer.index("t", knowledge.load("t", chunks), chunks);
    assert.deepEqual(knowledge.coverage("t"), { chunks: 3, embedded: 3, embedder: embedder.id });
    assert.deepEqual(embedder.calls.map((c) => [c.kind, c.texts.length]), [["document", 2], ["document", 1]]);

    // a restart, or a website re-sync with one page changed: only the new text is embedded
    const changed = [...chunks.slice(0, 2), { ...chunks[2], text: "30 gün içinde iade." }];
    const fresh = new KnowledgeBase();
    await new ChunkIndexer(fresh, embedder, store).index("t", fresh.load("t", changed), changed);
    assert.equal(fresh.coverage("t").embedded, 3);
    assert.deepEqual(embedder.calls.at(-1)!.texts, ["İade\n30 gün içinde iade."]);
    assert.equal(embedder.calls.length, 3);
  });

  it("reports its queue while jobs wait", async () => {
    const knowledge = new KnowledgeBase();
    const indexer = new ChunkIndexer(knowledge, new ConceptEmbedder(), memoryVectorStore());
    assert.deepEqual(indexer.stats(), { model: "test:concepts@3", pending: 0, active: null, lastDoneAt: null, lastError: null });
    const first = indexer.index("a", knowledge.load("a", chunks), chunks);
    void indexer.index("b", knowledge.load("b", chunks), chunks);
    assert.equal(indexer.stats().pending, 2);
    await first;
    await settle();
    const done = indexer.stats();
    assert.equal(done.pending, 0);
    assert.equal(done.active, null);
    assert.ok(done.lastDoneAt);
  });

  it("drops work for a load that has been replaced", async () => {
    const knowledge = new KnowledgeBase();
    const embedder = new ConceptEmbedder();
    const indexer = new ChunkIndexer(knowledge, embedder, memoryVectorStore());
    const old = knowledge.load("t", chunks);
    knowledge.load("t", chunks.slice(0, 1));
    await indexer.index("t", old, chunks);
    assert.equal(embedder.calls.length, 0);
    assert.equal(knowledge.coverage("t").embedded, 0);
  });

  it("keeps lexical search and the progress made when embedding fails, and retries later", async () => {
    const knowledge = new KnowledgeBase();
    const embedder = new ConceptEmbedder();
    embedder.failAfter = 1;
    const indexer = new ChunkIndexer(knowledge, embedder, memoryVectorStore(), { batchSize: 2, retryMs: 5 });
    await indexer.index("t", knowledge.load("t", chunks), chunks);
    assert.equal(knowledge.coverage("t").embedded, 2, "the first batch stays attached");
    const failed = indexer.stats();
    assert.equal(failed.pending, 0);
    assert.equal(failed.lastError?.tenant, "t");
    assert.match(failed.lastError!.error, /./);
    assert.equal(knowledge.search("t", [{ text: "iade", weight: 1 }], 3)[0].chunk.title, "İade");

    embedder.failAfter = null;
    await new Promise((r) => setTimeout(r, 30));
    await settle();
    assert.equal(knowledge.coverage("t").embedded, 3);
    assert.deepEqual(embedder.calls.at(-1)!.texts, ["İade\n14 gün içinde iade."], "only the missing chunk is embedded on retry");
  });

  it("prunes vectors no chunk uses any more", async () => {
    const knowledge = new KnowledgeBase();
    const store = memoryVectorStore();
    const indexer = new ChunkIndexer(knowledge, new ConceptEmbedder(), store);
    await indexer.index("t", knowledge.load("t", chunks), chunks);
    await indexer.index("t", knowledge.load("t", chunks.slice(0, 1)), chunks.slice(0, 1));
    const { chunkHash } = await import("@apex/knowledge/embed");
    assert.equal((await store.load("t", "test:concepts@3", chunks.map(chunkHash))).length, 1);
  });
});

describe("QueryEmbedder", () => {
  it("caches message embeddings", async () => {
    const embedder = new ConceptEmbedder();
    const q = new QueryEmbedder(embedder);
    await q.embed("t", ["iade?"]);
    const again = await q.embed("t", ["iade?", "kargo?"]);
    assert.equal(again!.vectors.length, 2);
    assert.deepEqual(embedder.calls.map((c) => c.texts), [["iade?"], ["kargo?"]]);
    assert.equal(embedder.calls[0].kind, "query");
    // another tenant's identical message is not a cache hit (no timing signal across sites)
    await q.embed("u", ["iade?"]);
    assert.deepEqual(embedder.calls.at(-1)!.texts, ["iade?"]);
  });

  it("returns a cached text even when the cache is full", async () => {
    const q = new QueryEmbedder(new ConceptEmbedder(), { cacheSize: 1 });
    await q.embed("t", ["a"]);
    const both = await q.embed("t", ["a", "b"]);
    assert.equal(both!.vectors.length, 2);
  });

  it("gives up after the timeout instead of holding the answer", async () => {
    const embedder = new ConceptEmbedder();
    embedder.hang = true;
    const started = Date.now();
    assert.equal(await new QueryEmbedder(embedder, { timeoutMs: 20 }).embed("t", ["iade?"]), null);
    assert.ok(Date.now() - started < 1000);
  });

  it("pauses after repeated failures, then tries again", async () => {
    let now = 0;
    const embedder = new ConceptEmbedder();
    embedder.fail = true;
    const q = new QueryEmbedder(embedder, { failureLimit: 2, pauseMs: 1000, now: () => now });
    assert.equal(await q.embed("t", ["a"]), null);
    assert.equal(await q.embed("t", ["b"]), null);
    assert.equal(q.status(), "paused");
    assert.equal(await q.embed("t", ["c"]), null);
    assert.equal(embedder.calls.length, 2, "no request while paused");
    now = 1001;
    embedder.fail = false;
    assert.ok(await q.embed("t", ["d"]));
    assert.equal(q.status(), "ok");
  });
});

describe("POST /v1/chat with hybrid search", () => {
  const chat = (app: ReturnType<typeof setup>["app"], message: string) =>
    app.request("/v1/chat", { method: "POST", headers: headers(A), body: JSON.stringify({ message }) });

  async function hybridSetup(deps: Partial<AppDeps> = {}) {
    const embedder = new ConceptEmbedder();
    const ctx = setup({}, { embedder: new QueryEmbedder(embedder), ...deps });
    const indexer = new ChunkIndexer(ctx.knowledge, embedder, memoryVectorStore());
    await indexer.index("tn_a", ctx.knowledge.load("tn_a", chunks), chunks);
    embedder.calls = [];
    return { ...ctx, embedder };
  }

  it("answers from a page that shares no word with the question", async () => {
    const { app, model, embedder } = await hybridSetup();
    model.reply = ["He is an AI Engineer Intern. [[used: 1]]"];
    const done = (await readSSE(await chat(app, "What is his job?"))).at(-1)!.data;
    assert.match(model.requests[0].messages.at(-1)!.content as string, /index="1" title="About"/);
    assert.deepEqual(done.sources, [{ url: "https://alpha.example/about", title: "About" }]);
    assert.deepEqual(embedder.calls, [{ texts: ["What is his job?"], kind: "query" }]);
  });

  it("falls back to lexical search when the embedding provider is down", async () => {
    const { app, model, embedder } = await hybridSetup();
    embedder.fail = true;
    const res = await chat(app, "İade kaç gün?");
    assert.equal(res.status, 200);
    await readSSE(res);
    assert.match(model.requests[0].messages.at(-1)!.content as string, /title="İade"/);
  });

  it("stays lexical while staff turned the hybrid_search flag off", async () => {
    const asked: string[] = [];
    const { app, model, embedder } = await hybridSetup({
      featureEnabled: async (flag, tenant) => {
        asked.push(`${flag}:${tenant.id}`);
        return false;
      },
    });
    await readSSE(await chat(app, "İade kaç gün?"));
    assert.deepEqual(asked, ["hybrid_search:tn_a"]);
    assert.equal(embedder.calls.length, 0);
    assert.match(model.requests[0].messages.at(-1)!.content as string, /title="İade"/);
  });

  it("doesn't embed messages for a tenant whose chunks have no vectors", async () => {
    const { app, embedder } = await hybridSetup();
    await readSSE(
      await app.request("/v1/chat", { method: "POST", headers: headers({ key: "apex_pk_beta", origin: "https://beta.example" }), body: JSON.stringify({ message: "fiyat?" }) }),
    );
    assert.equal(embedder.calls.length, 0);
  });
});
