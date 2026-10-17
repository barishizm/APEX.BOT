import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EmbedError, createEmbedder, decodeVector, dot, encodeVector, normalize } from "../src/embed.ts";

type Call = { url: string; headers: Record<string, string>; body: any };

function fakeFetch(responses: (call: Call) => Response) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    const call = { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
    calls.push(call);
    return responses(call);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("createEmbedder", () => {
  it("validates the spec and the key", () => {
    assert.throws(() => createEmbedder("openai:text-embedding-3-small", { openai: "k" }), EmbedError);
    assert.throws(() => createEmbedder("cohere:embed@8", { openai: "k" }), EmbedError);
    assert.throws(() => createEmbedder("gemini:gemini-embedding-001@4", { openai: "k" }), /missing API key/);
    assert.equal(createEmbedder(" gemini:gemini-embedding-001@4 ", { gemini: "k" }).id, "gemini:gemini-embedding-001@4");
  });

  it("calls OpenAI, restores input order and normalises", async () => {
    const { fn, calls } = fakeFetch(() =>
      json({
        data: [
          { index: 1, embedding: [0, 2] },
          { index: 0, embedding: [3, 4] },
        ],
      }),
    );
    const embedder = createEmbedder("openai:text-embedding-3-small@2", { openai: "sk" }, { fetch: fn });
    const [a, b] = await embedder.embed(["first", "second"], "document");
    assert.deepEqual([...a], [0.6000000238418579, 0.800000011920929]);
    assert.deepEqual([...b], [0, 1]);
    assert.equal(calls[0].headers.authorization, "Bearer sk");
    assert.deepEqual(calls[0].body, { model: "text-embedding-3-small", input: ["first", "second"], dimensions: 2 });
  });

  it("sends Gemini the task type and batches requests", async () => {
    const { fn, calls } = fakeFetch((call) => json({ embeddings: call.body.requests.map(() => ({ values: [1, 0] })) }));
    const embedder = createEmbedder("gemini:gemini-embedding-001@2", { gemini: "g" }, { fetch: fn, batchSize: 2 });
    const out = await embedder.embed(["a", "b", "c"], "query");
    assert.equal(out.length, 3);
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /gemini-embedding-001:batchEmbedContents$/);
    assert.equal(calls[0].headers["x-goog-api-key"], "g");
    assert.equal(calls[0].body.requests[0].taskType, "RETRIEVAL_QUERY");
    assert.equal(calls[0].body.requests[0].outputDimensionality, 2);
  });

  it("rejects wrong dimensions and keeps provider error bodies out of the message", async () => {
    const wrongDims = createEmbedder("openai:m@3", { openai: "k" }, { fetch: fakeFetch(() => json({ data: [{ index: 0, embedding: [1, 2] }] })).fn });
    await assert.rejects(wrongDims.embed(["x"], "query"), /2 dimensions, expected 3/);
    const failing = createEmbedder("openai:m@3", { openai: "k" }, { fetch: fakeFetch(() => json({ error: { message: "secret visitor text" } }, 400)).fn });
    await assert.rejects(failing.embed(["x"], "query"), (error: EmbedError) => error.status === 400 && !error.message.includes("secret"));
  });

  it("retries 429s after Retry-After only when asked to", async () => {
    let n = 0;
    const flaky = () => (n++ === 0 ? json({}, 429, { "retry-after": "0.01" }) : json({ data: [{ index: 0, embedding: [1] }] }));
    await assert.rejects(createEmbedder("openai:m@1", { openai: "k" }, { fetch: fakeFetch(flaky).fn }).embed(["x"], "query"), /429/);
    n = 0;
    const [v] = await createEmbedder("openai:m@1", { openai: "k" }, { fetch: fakeFetch(flaky).fn, retries: 1 }).embed(["x"], "query");
    assert.deepEqual([...v], [1]);
  });
});

describe("vector helpers", () => {
  it("round-trips through base64 and computes cosine", () => {
    const v = normalize(Float32Array.from([1, 2, 2]));
    assert.deepEqual([...decodeVector(encodeVector(v))], [...v]);
    assert.ok(Math.abs(dot(v, v) - 1) < 1e-6);
  });
});
