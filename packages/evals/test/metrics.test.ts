import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Hit } from "@apex/knowledge/retrieval";
import { pathOf, scoreCase, summarize, type GoldenCase } from "../src/metrics.ts";
import { loadSuites, runSuite } from "../src/suite.ts";

const hit = (path: string, score: number): Hit => ({
  chunk: { id: path, tenantId: "t", url: `https://site.example${path}`, title: path, text: "" },
  score,
});
const answerable: GoldenCase = { id: "a", q: "?", expect: ["/b", "/b2"], tags: ["en"] };
const unknown: GoldenCase = { id: "u", q: "?", expect: null, tags: ["en", "unknown"] };

describe("scoreCase", () => {
  it("passes an answerable case only when a relevant chunk reaches the model", () => {
    const ranked = [hit("/a", 5), hit("/b", 4)];
    assert.deepEqual(scoreCase(answerable, ranked, ranked), {
      id: "a",
      tags: ["en"],
      answerable: true,
      rank: 2,
      abstained: false,
      pass: true,
      used: ["/a", "/b"],
    });
    // retrieved, but cut by the score floor
    const cut = scoreCase(answerable, ranked, ranked.slice(0, 1));
    assert.equal(cut.rank, 2);
    assert.equal(cut.pass, false);
    // any of the expected pages counts
    assert.equal(scoreCase(answerable, [hit("/b2", 1)], [hit("/b2", 1)]).pass, true);
  });

  it("passes an unanswerable case only when the bot abstains", () => {
    assert.equal(scoreCase(unknown, [hit("/a", 1)], []).pass, true);
    assert.equal(scoreCase(unknown, [hit("/a", 9)], [hit("/a", 9)]).pass, false);
  });
});

describe("summarize", () => {
  it("computes rank metrics over answerable cases and abstention over unanswerable ones", () => {
    const s = summarize([
      scoreCase(answerable, [hit("/b", 3)], [hit("/b", 3)]), // rank 1, pass
      scoreCase({ ...answerable, id: "a2" }, [hit("/x", 3), hit("/b", 2)], [hit("/x", 3)]), // rank 2, cut
      scoreCase({ ...answerable, id: "a3" }, [], []), // missed, abstained
      scoreCase(unknown, [], []), // abstained: pass
    ]);
    assert.equal(s.cases, 4);
    assert.equal(s.hitAt1, 0.3333);
    assert.equal(s.recallAtK, 0.6667);
    assert.equal(s.mrr, 0.5);
    assert.equal(s.contextRecall, 0.3333);
    assert.equal(s.falseAbstain, 0.3333);
    assert.equal(s.abstainAccuracy, 1);
    assert.equal(s.passRate, 0.5);
    assert.deepEqual(s.byTag.unknown, { cases: 1, passRate: 1 });
  });

  it("keeps non-URL sources (pasted text) comparable", () => {
    assert.equal(pathOf("https://a.example/x?y=1"), "/x");
    assert.equal(pathOf(""), "");
  });
});

describe("golden suites", () => {
  it("load, validate and run deterministically", async () => {
    const suites = loadSuites();
    assert.ok(suites.length >= 2);
    for (const suite of suites) {
      assert.ok(suite.cases.some((c) => c.expect === null), `${suite.name} needs unanswerable cases`);
      assert.deepEqual(await runSuite(suite), await runSuite(suite));
    }
  });
});
