import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseInline, parseMarkdown } from "../src/markdown.ts";
import { createSSEParser } from "../src/sse.ts";

describe("SSE parser", () => {
  it("handles events split across chunks and CRLF", () => {
    const seen: [string, string][] = [];
    const feed = createSSEParser((event, data) => seen.push([event, data]));
    feed('event: meta\ndata: {"a":1}\n\nevent: del');
    feed('ta\r\ndata: {"text":"Mer"}\r\n\r\n: keep-alive\n\n');
    feed("data: line1\ndata: line2\n\n");
    assert.deepEqual(seen, [
      ["meta", '{"a":1}'],
      ["delta", '{"text":"Mer"}'],
      ["message", "line1\nline2"],
    ]);
  });
});

describe("markdown", () => {
  it("parses paragraphs and lists", () => {
    const blocks = parseMarkdown("Merhaba\nikinci satır\n\n- bir\n- iki\n  devam\n1. üç");
    assert.deepEqual(blocks.map((b) => b.t), ["p", "ul", "ol"]);
    assert.deepEqual(blocks[1], { t: "ul", items: [[{ t: "text", v: "bir" }], [{ t: "text", v: "iki devam" }]] });
  });

  it("parses inline formatting and safe links", () => {
    assert.deepEqual(parseInline("**14 gün** içinde *ücretsiz*, `kod` [iade](https://x.example/iade)"), [
      { t: "b", v: "14 gün" },
      { t: "text", v: " içinde " },
      { t: "i", v: "ücretsiz" },
      { t: "text", v: ", " },
      { t: "code", v: "kod" },
      { t: "text", v: " " },
      { t: "a", v: "iade", href: "https://x.example/iade" },
    ]);
  });

  it("drops unsafe link targets", () => {
    const nodes = parseInline("[tıkla](javascript:alert(1))");
    assert.equal(nodes.some((n) => n.t === "a"), false);
  });

  it("autolinks bare URLs without trailing punctuation", () => {
    assert.deepEqual(parseInline("Bakınız https://x.example/a."), [
      { t: "text", v: "Bakınız " },
      { t: "a", v: "https://x.example/a", href: "https://x.example/a" },
      { t: "text", v: "." },
    ]);
  });

  it("keeps raw HTML as text", () => {
    assert.deepEqual(parseInline('<img src=x onerror="alert(1)">'), [{ t: "text", v: '<img src=x onerror="alert(1)">' }]);
  });
});
