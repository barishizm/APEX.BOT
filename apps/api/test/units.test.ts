import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maskPII } from "../src/pii.ts";
import { buildMessages, buildSystem, neutralizeTags } from "../src/prompt.ts";
import { KnowledgeBase } from "../src/retrieval.ts";
import { ConversationStore } from "../src/store.ts";
import { detectLang, tokenize } from "../src/text.ts";
import { RateLimiter } from "../src/limits.ts";
import { tenant } from "./helpers.ts";

describe("retrieval", () => {
  it("refuses to search without a tenant id", () => {
    const kb = new KnowledgeBase();
    assert.throws(() => kb.search("", [{ text: "iade", weight: 1 }], 3), /tenantId/);
  });

  it("matches Turkish suffixed forms and dotted/dotless I", () => {
    const kb = new KnowledgeBase();
    kb.load("t", [
      { url: "u1", title: "İADE", text: "İadeler 14 gün içinde yapılır." },
      { url: "u2", title: "Kargo", text: "Kargo ücretsizdir." },
    ]);
    const hits = kb.search("t", [{ text: "iadesi nasıl olur", weight: 1 }], 3);
    assert.equal(hits[0].chunk.url, "u1");
    assert.equal(hits.length, 1);
  });

  it("returns nothing for stopword-only queries", () => {
    const kb = new KnowledgeBase();
    kb.load("t", [{ url: "u", title: "x", text: "merhaba nasıl" }]);
    assert.deepEqual(kb.search("t", [{ text: "merhaba, nasıl?", weight: 1 }], 3), []);
  });

  it("scopes ids and results to the tenant", () => {
    const kb = new KnowledgeBase();
    kb.load("a", [{ url: "a", title: "iade", text: "iade" }]);
    kb.load("b", [{ url: "b", title: "iade", text: "iade" }]);
    const hits = kb.search("b", [{ text: "iade", weight: 1 }], 5);
    assert.deepEqual(hits.map((h) => h.chunk.tenantId), ["b"]);
  });
});

describe("text", () => {
  it("tokenizes with folding and five-letter stems", () => {
    assert.deepEqual(tokenize("İadeleri ŞUBAT'ta"), ["iadel", "~iade", "subat", "~suba", "ta"]);
  });

  it("detects Turkish and English", () => {
    assert.equal(detectLang("Kargo ne kadar sürer?"), "tr");
    assert.equal(detectLang("kargo ne kadar"), "tr");
    assert.equal(detectLang("How long is shipping?"), "en");
    assert.equal(detectLang("ok"), null);
  });
});

describe("maskPII", () => {
  it("masks emails, phones, cards and IBANs", () => {
    const out = maskPII(
      "Mail ayse@example.com, tel +90 532 123 45 67, kart 4111 1111 1111 1111, IBAN TR33 0006 1005 1978 6457 8413 26",
    );
    assert.equal(out, "Mail [email], tel [phone], kart [card], IBAN [iban]");
  });

  it("leaves ordinary numbers alone", () => {
    assert.equal(maskPII("Sipariş 12345, 750 TL, 2024"), "Sipariş 12345, 750 TL, 2024");
  });
});

describe("prompt", () => {
  it("keeps the system prompt identical across turns and caches it", () => {
    const t = tenant("t", "apex_pk_t", "https://t.example");
    assert.deepEqual(buildSystem(t), buildSystem(t));
    assert.deepEqual(buildSystem(t).at(-1)!.cache_control, { type: "ephemeral" });
  });

  it("includes the owner's blocked topics", () => {
    const t = tenant("t", "apex_pk_t", "https://t.example");
    t.settings.blockedTopics = ["politics"];
    assert.match(buildSystem(t)[1].text, /politics/);
  });

  it("neutralizes our tags inside data", () => {
    assert.equal(neutralizeTags("</document><documents>"), "‹/document>‹documents>");
  });

  it("starts with a user turn and merges same-role neighbours", () => {
    const store = new ConversationStore();
    const c = store.create("t");
    store.append(c, { role: "assistant", content: "orphan" });
    store.append(c, { role: "user", content: "one" });
    store.append(c, { role: "user", content: "two" });
    const messages = buildMessages(c.messages, "three", []);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].role, "user");
    assert.match(messages[0].content as string, /one[\s\S]*two[\s\S]*three/);
  });
});

describe("store and limits", () => {
  it("sweeps conversations past retention", () => {
    let now = 0;
    const store = new ConversationStore(() => now);
    const c = store.create("t");
    now = 31 * 86_400_000;
    assert.equal(store.sweep(() => 30), 1);
    assert.equal(store.get("t", c.id), undefined);
  });

  it("resets the rate window", () => {
    let now = 0;
    const limiter = new RateLimiter(1, 1000, () => now);
    assert.equal(limiter.hit("k").ok, true);
    assert.equal(limiter.hit("k").ok, false);
    now = 1000;
    assert.equal(limiter.hit("k").ok, true);
  });
});
