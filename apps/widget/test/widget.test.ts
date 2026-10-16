import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseInline, parseMarkdown } from "../src/markdown.ts";
import { createSSEParser } from "../src/sse.ts";
import { LANGS, pickLang, strings } from "../src/i18n.ts";

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

describe("languages", () => {
  it("picks a supported language from a preference, else the fallback", () => {
    assert.equal(pickLang("lt-LT", "en"), "lt");
    assert.equal(pickLang("lv", "en"), "lv");
    assert.equal(pickLang("ET", "en"), "et");
    assert.equal(pickLang("de-DE", "lv"), "lv");
  });

  it("has every string in every language", () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v).map((s) => `${k}.${s}`) : [k]));
    for (const lang of LANGS) {
      assert.deepEqual(keys(strings[lang]), keys(strings.en), lang);
      for (const key of keys(strings[lang])) {
        const value = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], strings[lang]);
        assert.ok(typeof value === "string" && value.trim(), `${lang}.${key} is empty`);
      }
    }
  });
});
