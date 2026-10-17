// npm run eval -w @apex/evals              runs every golden suite and compares with baseline.json
// npm run eval -w @apex/evals -- --verbose  also lists every failing case with what was retrieved
// npm run eval:update -w @apex/evals        accepts the current numbers as the new baseline
// Exits 1 when a gated metric drops or a case that passed in the baseline now fails.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { GATED, lowerIsBetter, type Summary } from "./metrics.ts";
import { DATA_DIR, PRODUCTION_SETTINGS, loadSuites, runSuite, type SuiteResult } from "./suite.ts";

const BASELINE = resolve(DATA_DIR, "../baseline.json");

interface Baseline {
  suites: Record<string, { summary: Omit<Summary, "byTag">; passing: string[] }>;
}

const args = new Set(process.argv.slice(2));
// --lexical runs retrieval without embeddings (production with APEX_EMBEDDINGS=off)
const results = await Promise.all(loadSuites().map((s) => runSuite(s, args.has("--lexical") ? { ...PRODUCTION_SETTINGS, embedder: null } : PRODUCTION_SETTINGS)));

const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);
const fmt = (metric: string, x: number) => (metric === "mrr" ? x.toFixed(3).padStart(6) : pct(x));

function report(r: SuiteResult) {
  const s = r.summary;
  console.log(`\n${r.name}  (${s.cases} cases: ${s.answerable} answerable, ${s.unknown} unanswerable)`);
  for (const m of GATED) console.log(`  ${m.padEnd(16)}${fmt(m, s[m])}`);
  console.log(`  by tag: ${Object.entries(s.byTag).map(([t, v]) => `${t} ${pct(v.passRate).trim()} (${v.cases})`).join(" · ")}`);
  const failing = r.cases.filter((c) => !c.pass);
  if (args.has("--verbose") && failing.length > 0) {
    console.log("  failing:");
    for (const c of failing) {
      const why = c.answerable ? (c.abstained ? "abstained" : c.rank ? `relevant at #${c.rank} but cut` : "not retrieved") : "answered";
      console.log(`    ✗ ${c.id.padEnd(28)} ${why.padEnd(22)} used: ${c.used.join(", ") || "-"}`);
    }
  }
}

results.forEach(report);

const baseline: Baseline | null = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : null;

if (args.has("--update-baseline")) {
  const next: Baseline = { suites: {} };
  for (const r of results) {
    const { byTag: _, ...summary } = r.summary;
    next.suites[r.name] = { summary, passing: r.cases.filter((c) => c.pass).map((c) => c.id).sort() };
  }
  writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`\nBaseline updated: ${BASELINE}`);
  process.exit(0);
}

if (!baseline) {
  console.log("\nNo baseline.json yet; run `npm run eval:update -w @apex/evals` to create one.");
  process.exit(0);
}

const regressions: string[] = [];
const improvements: string[] = [];
for (const r of results) {
  const base = baseline.suites[r.name];
  if (!base) {
    improvements.push(`${r.name}: new suite (not in baseline)`);
    continue;
  }
  for (const m of GATED) {
    const delta = r.summary[m] - base.summary[m];
    if (Math.abs(delta) < 1e-9) continue;
    const better = lowerIsBetter(m) ? delta < 0 : delta > 0;
    (better ? improvements : regressions).push(`${r.name}: ${m} ${fmt(m, base.summary[m]).trim()} → ${fmt(m, r.summary[m]).trim()}`);
  }
  const was = new Set(base.passing);
  for (const c of r.cases) {
    if (was.has(c.id) && !c.pass) regressions.push(`${r.name}/${c.id}: passed in baseline, fails now (used: ${c.used.join(", ") || "-"})`);
    if (!was.has(c.id) && c.pass) improvements.push(`${r.name}/${c.id}: now passes`);
  }
}

if (improvements.length > 0) console.log(`\nImprovements:\n${improvements.map((l) => `  + ${l}`).join("\n")}`);
if (regressions.length > 0) {
  console.log(`\nRegressions:\n${regressions.map((l) => `  - ${l}`).join("\n")}`);
  process.exit(1);
}
console.log(improvements.length > 0 ? "\nNo regressions. Run eval:update to lock in the improvements." : "\nNo change from baseline.");
