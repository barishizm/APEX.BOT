// Live evals: the golden questions and the red-team suite through the real prompt and model.
// Not part of CI (needs ANTHROPIC_API_KEY, costs tokens, and model output varies run to run).
//
//   npm run eval:live -w @apex/evals                  (reads ../../apps/api/.env)
//   npm run eval:live -w @apex/evals -- --only=redteam
//
// Golden cases run the production path (hybrid retrieval, prompt, markers) and check what the model
// decides: an unanswerable question must end up unanswered (its NO_ANSWER marker), an answerable one
// must not, and small talk must be neither unanswered nor cite sources. For answered questions the
// report also counts how often the cited sources ([[used: n]]) include a page that answers it.
// Red-team cases check the answer text against must/mustNot patterns.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "@apex/api/src/config.ts";
import { ClaudeChatModel } from "@apex/api/src/model.ts";
import { ReplyMarkerFilter, buildMessages, buildSystem } from "@apex/api/src/prompt.ts";
import type { StoredMessage } from "@apex/api/src/store.ts";
import type { Tenant } from "@apex/api/src/tenants.ts";
import { createEmbedder, embeddingText } from "@apex/knowledge/embed";
import { KnowledgeBase, retrieve, semanticQueryTexts, type ChunkInput } from "@apex/knowledge/retrieval";
import { EmbeddingCache } from "./embeddings.ts";
import { pathOf } from "./metrics.ts";
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
  /** Answered golden cases: whether a cited source answers the question (null when nothing to judge). */
  citedRight?: boolean | null;
}

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const CONCURRENCY = 4;

const demoTenant = (JSON.parse(readFileSync(resolve(DATA_DIR, "../../../apps/api/data/tenants.json"), "utf8")) as Tenant[])[0];
const SITE_NAMES: Record<string, string> = { saas: "Taskline", portfolio: "Barış Akıntı" };
const tenantFor = (suite: string): Tenant =>
  suite === "coffee"
    ? demoTenant
    : {
        ...demoTenant,
        id: `eval_${suite}`,
        name: SITE_NAMES[suite] ?? suite,
        settings: { ...demoTenant.settings, defaultLang: "en", blockedTopics: [] },
      };

const config = loadConfig();
const model = new ClaudeChatModel({ ...config, fallbacks: false });
const lexicalOnly = process.argv.includes("--lexical");
const embedder = PRODUCTION_SETTINGS.embedder;
// red-team cases inject chunks that aren't in the committed cache, so this one may call the provider;
// it isn't saved, to keep the committed cache to the golden suites
const cache =
  embedder && !lexicalOnly
    ? new EmbeddingCache(embedder, createEmbedder(embedder, { openai: process.env.OPENAI_API_KEY, gemini: process.env.GEMINI_API_KEY }, { retries: 6, batchSize: 20 }))
    : null;

async function answer(tenant: Tenant, corpus: ChunkInput[], q: string, prev?: string) {
  const kb = new KnowledgeBase();
  const generation = kb.load(tenant.id, corpus);
  if (cache) kb.attachVectors(tenant.id, generation, embedder!, await cache.get(corpus.map(embeddingText), "document"));
  const semantic = cache ? { embedder: embedder!, vectors: await cache.get(semanticQueryTexts(q, prev), "query") } : null;
  const { hits } = retrieve(kb, tenant.id, { message: q, previous: prev, semantic }, PRODUCTION_SETTINGS);
  // A follow-up carries the earlier question; its answer isn't known here, so only the question is replayed.
  const history: StoredMessage[] = prev ? [{ id: "p", role: "user", content: prev, createdAt: 0 }] : [];
  const filter = new ReplyMarkerFilter();
  let text = "";
  for await (const event of model.stream({ system: buildSystem(tenant), messages: buildMessages(history, q, hits) })) {
    if (event.type === "text") text += filter.push(event.text);
  }
  text += filter.flush();
  const cited = filter.used.flatMap((n) => (hits[n - 1] ? [pathOf(hits[n - 1].chunk.url)] : []));
  return { text: text.trim(), hits, marked: filter.noAnswer, cited };
}

async function golden(suite: Suite): Promise<Outcome[]> {
  const tenant = tenantFor(suite.name);
  return pool(suite.cases, async (c) => {
    const { text, marked, cited } = await answer(tenant, suite.corpus, c.q, c.prev);
    // as in /v1/chat: only the model's marker makes a turn unanswered
    let pass: boolean;
    let why: string;
    let citedRight: boolean | null = null;
    if (c.tags.includes("smalltalk") || c.tags.includes("offtopic")) {
      // not a gap in the site's content: no marker (the prompt's rule for small talk and declined topics), no sources
      pass = !marked && cited.length === 0;
      why = marked ? "marked unanswered" : cited.length ? `cited ${cited.join(", ")}` : "no marker, no sources";
    } else if (c.expect === null) {
      pass = marked;
      why = pass ? "abstained" : `answered an unanswerable question${cited.length ? ` (cited ${cited.join(", ")})` : ""}`;
    } else {
      pass = !marked;
      citedRight = cited.some((p) => c.expect!.includes(p));
      why = !pass ? "model said it doesn't know" : citedRight ? "answered" : cited.length ? `answered, cited ${cited.join(", ")}` : "answered, cited nothing";
    }
    return { suite: suite.name, id: c.id, kind: "golden", pass, why, answer: text, citedRight };
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
  const answered = list.filter((o) => o.citedRight != null);
  const right = answered.filter((o) => o.citedRight).length;
  const sources = answered.length ? `; answered with a right source cited: ${right}/${answered.length}` : "";
  console.log(`\n${name}: ${passed}/${list.length} (${((passed / list.length) * 100).toFixed(1)}%)${sources}`);
  for (const o of list.filter((o) => !o.pass || o.citedRight === false)) console.log(`  ${o.pass ? "~" : "✗"} ${o.id.padEnd(28)} ${o.why}\n      ${o.answer.replace(/\s+/g, " ").slice(0, 160)}`);
}

const dir = resolve(DATA_DIR, "../results");
mkdirSync(dir, { recursive: true });
writeFileSync(
  resolve(dir, "live-latest.json"),
  `${JSON.stringify({ model: config.model, retrieval: lexicalOnly ? "lexical" : embedder, at: new Date().toISOString(), outcomes }, null, 2)}\n`,
);
console.log(`\nModel ${config.model}. Full answers: packages/evals/results/live-latest.json`);
process.exit(outcomes.every((o) => o.pass) ? 0 : 1);
