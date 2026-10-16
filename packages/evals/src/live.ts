// Live evals: the golden questions and the red-team suite through the real prompt and model.
// Not part of CI (needs ANTHROPIC_API_KEY, costs tokens, and model output varies run to run).
//
//   npm run eval:live -w @apex/evals                  (reads ../../apps/api/.env)
//   npm run eval:live -w @apex/evals -- --only=redteam
//
// Golden cases check the "I don't know" signal end to end: an unanswerable question must end up
// unanswered (no relevant chunk, or the model's NO_ANSWER marker), an answerable one must not.
// Red-team cases check the answer text against must/mustNot patterns.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "@apex/api/src/config.ts";
import { ClaudeChatModel } from "@apex/api/src/model.ts";
import { NoAnswerFilter, buildMessages, buildSystem } from "@apex/api/src/prompt.ts";
import type { StoredMessage } from "@apex/api/src/store.ts";
import type { Tenant } from "@apex/api/src/tenants.ts";
import { KnowledgeBase, relevantHits, type ChunkInput } from "@apex/knowledge/retrieval";
import { DATA_DIR, PRODUCTION_SETTINGS, loadSuites, type Suite } from "./suite.ts";

interface RedTeamCase {
  id: string;
  q: string;
  inject?: ChunkInput;
  must?: string[];
  mustNot?: string[];
}

interface Outcome {
  suite: string;
  id: string;
  kind: "golden" | "redteam";
  pass: boolean;
  why: string;
  answer: string;
}

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const CONCURRENCY = 4;

const demoTenant = (JSON.parse(readFileSync(resolve(DATA_DIR, "../../../apps/api/data/tenants.json"), "utf8")) as Tenant[])[0];
const tenantFor = (suite: string): Tenant =>
  suite === "coffee"
    ? demoTenant
    : {
        ...demoTenant,
        id: `eval_${suite}`,
        name: "Taskline",
        settings: { ...demoTenant.settings, defaultLang: "en", blockedTopics: [] },
      };

const config = loadConfig();
const model = new ClaudeChatModel({ ...config, fallbacks: false });

async function answer(tenant: Tenant, corpus: ChunkInput[], q: string, prev?: string) {
  const kb = new KnowledgeBase();
  kb.load(tenant.id, corpus);
  const query = [{ text: q, weight: 1 }];
  if (prev) query.push({ text: prev, weight: PRODUCTION_SETTINGS.previousWeight });
  const ranked = kb.search(tenant.id, query, PRODUCTION_SETTINGS.topK);
  const hits = relevantHits(ranked, PRODUCTION_SETTINGS.minScore, PRODUCTION_SETTINGS.confidence);
  // A follow-up carries the earlier question; its answer isn't known here, so only the question is replayed.
  const history: StoredMessage[] = prev ? [{ id: "p", role: "user", content: prev, createdAt: 0 }] : [];
  const filter = new NoAnswerFilter();
  let text = "";
  for await (const event of model.stream({ system: buildSystem(tenant), messages: buildMessages(history, q, hits) })) {
    if (event.type === "text") text += filter.push(event.text);
  }
  text += filter.flush();
  return { text: text.trim(), hits, marked: filter.found };
}

async function golden(suite: Suite): Promise<Outcome[]> {
  const tenant = tenantFor(suite.name);
  return pool(suite.cases, async (c) => {
    const { text, hits, marked } = await answer(tenant, suite.corpus, c.q, c.prev);
    const unanswered = hits.length === 0 || marked;
    const pass = c.expect === null ? unanswered : !unanswered;
    const why = c.expect === null ? (pass ? "abstained" : "answered an unanswerable question") : pass ? "answered" : marked ? "model said it doesn't know" : "retrieval abstained";
    return { suite: suite.name, id: c.id, kind: "golden", pass, why, answer: text };
  });
}

async function redteam(suites: Suite[]): Promise<Outcome[]> {
  const spec = JSON.parse(readFileSync(resolve(DATA_DIR, "redteam.json"), "utf8")) as { suite: string; cases: RedTeamCase[] };
  const suite = suites.find((s) => s.name === spec.suite)!;
  const tenant = tenantFor(suite.name);
  return pool(spec.cases, async (c) => {
    const { text } = await answer(tenant, c.inject ? [...suite.corpus, c.inject] : suite.corpus, c.q);
    const broken = (c.mustNot ?? []).filter((p) => new RegExp(p, "i").test(text));
    const missing = (c.must ?? []).filter((p) => !new RegExp(p, "i").test(text));
    const why = [...broken.map((p) => `contains /${p}/`), ...missing.map((p) => `lacks /${p}/`)].join("; ");
    return { suite: "redteam", id: c.id, kind: "redteam", pass: !why, why: why || "held", answer: text };
  });
}

async function pool<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const suites = loadSuites();
const outcomes: Outcome[] = [];
if (!only || only === "golden") for (const s of suites) outcomes.push(...(await golden(s)));
if (!only || only === "redteam") outcomes.push(...(await redteam(suites)));

for (const name of [...new Set(outcomes.map((o) => o.suite))]) {
  const list = outcomes.filter((o) => o.suite === name);
  const passed = list.filter((o) => o.pass).length;
  console.log(`\n${name}: ${passed}/${list.length} (${((passed / list.length) * 100).toFixed(1)}%)`);
  for (const o of list.filter((o) => !o.pass)) console.log(`  ✗ ${o.id.padEnd(28)} ${o.why}\n      ${o.answer.replace(/\s+/g, " ").slice(0, 160)}`);
}

const dir = resolve(DATA_DIR, "../results");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "live-latest.json"), `${JSON.stringify({ model: config.model, at: new Date().toISOString(), outcomes }, null, 2)}\n`);
console.log(`\nModel ${config.model}. Full answers: packages/evals/results/live-latest.json`);
process.exit(outcomes.every((o) => o.pass) ? 0 : 1);
