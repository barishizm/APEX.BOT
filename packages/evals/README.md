# @apex/evals

Retrieval quality gate. Golden questions are run through the same retrieval path as `POST /v1/chat`
(the same `retrieve()` call: hybrid BM25 + embeddings, top-k, floors and follow-up handling) and scored against
the pages that answer them. CI fails when a metric drops or a case that passed in `baseline.json` fails.

```bash
npm run eval                                   # from the repo root: run and compare with baseline.json
npm run eval -w @apex/evals -- --verbose       # also list failing cases and what reached the model
npm run eval:update -w @apex/evals             # accept the current numbers as the new baseline
npm run eval -w @apex/evals -- --lexical       # BM25 only (production with APEX_EMBEDDINGS=off), for comparison
```

No network or API keys are needed, so CI runs it on every pull request: the embeddings of every corpus chunk and
question are committed in `data/embeddings/`. After adding a case, run once with `GEMINI_API_KEY` in the environment
(`npx tsx --env-file=../../apps/api/.env src/cli.ts`) to embed it, and commit the updated cache file.

Retrieval now passes something for almost every message (a greeting included), so `abstainAccuracy` here is ~0 by
design: whether the excerpts answer the question is the model's call, measured by `eval:live`
([ADR 0002](../../docs/adr/0002-hybrid-retrieval.md)).

Two more runners are not in CI:

```bash
npm run eval:live -w @apex/evals               # golden + red-team suites through the real prompt and model (reads apps/api/.env)
npm run eval:live -w @apex/evals -- --lexical  # the same with BM25 only
npm run experiment:hybrid -w @apex/evals       # calibrates the hybrid floors, see docs/adr/0002-hybrid-retrieval.md
npm run experiment:embeddings -w @apex/evals   # the earlier gate experiment, see docs/adr/0001-retrieval-embeddings.md
```

The live run checks the model's decisions end to end, as `/v1/chat` makes them: an unanswerable question must end
with the `[[no-answer]]` marker, an answerable one must not, and small talk or an off-topic request must have neither
the marker nor cited sources. For answered questions it also reports how often the cited sources (`[[used: n]]`)
include a page that answers it. Then the red-team cases in `data/redteam.json` (prompt leak,
role hijack, injected page content, forged tags, claiming to be human, off-topic work, invented codes) against
`must` / `mustNot` patterns. Answers are written to `results/live-latest.json`.

## Suites

| File | What it covers |
|---|---|
| `data/coffee.golden.json` | The demo tenant (`apps/api/data/knowledge/tn_demo.json`): small TR+EN shop with mirrored pages |
| `data/saas.golden.json` + `saas.corpus.json` | A help centre whose pages share vocabulary (storage vs. attachments, SSO vs. 2FA vs. password, cancel vs. refund) |
| `data/portfolio.golden.json` + `portfolio.corpus.json` | A personal portfolio (barishizm.eu, EN+TR): questions about its owner in pronouns and everyday words the pages never use ("What does he do?") |

Each case is `{ id, q, prev?, expect, tags }`. `expect` lists the URL paths that answer the question (any one is
enough) or is `null` when the site can't answer it, in which case the bot must take the "I don't know" path.
`prev` is the previous visitor message, for follow-ups. Tags group the report: `tr`, `en`, `morph` (Turkish
suffixes, plurals), `synonym` (no shared word with the page), `cross-lingual`, `followup`, `hard-negative`
(shares words with a page that does not answer it), `unknown`, `pronoun` ("he", "his"), and for cases with `expect: null`
that aren't a gap in the site's content, `smalltalk` and `offtopic` (the live run expects no marker and no sources).

## Metrics

| Metric | Over | Meaning |
|---|---|---|
| `passRate` | all | Headline: answerable cases reach the model with a relevant chunk, unanswerable ones abstain |
| `contextRecall` | answerable | A relevant chunk survives the score floor and reaches the model |
| `abstainAccuracy` | unanswerable | The bot correctly takes the "I don't know" path |
| `falseAbstain` | answerable | Wrongly sent down the "I don't know" path (lower is better) |
| `recallAtK`, `hitAt1`, `mrr` | answerable | Ranking quality before the score floor |

## Adding a case

Add it to the suite file, run `npm run eval -w @apex/evals -- --verbose`, and if it changes the numbers on purpose,
`npm run eval:update -w @apex/evals` and commit `baseline.json` with the change that moved it.
