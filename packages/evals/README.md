# @apex/evals

Retrieval quality gate. Golden questions are run through the same retrieval path as `POST /v1/chat`
(same top-k, score floor and follow-up weighting, read from `apps/api/src/config.ts`) and scored against
the pages that answer them. CI fails when a metric drops or a case that passed in `baseline.json` fails.

```bash
npm run eval                                   # from the repo root: run and compare with baseline.json
npm run eval -w @apex/evals -- --verbose       # also list failing cases and what reached the model
npm run eval:update -w @apex/evals             # accept the current numbers as the new baseline
```

No network or API keys are needed, so CI runs it on every pull request.

Two more runners are not in CI:

```bash
npm run eval:live -w @apex/evals               # golden + red-team suites through the real prompt and model (reads apps/api/.env)
npm run experiment:embeddings -w @apex/evals   # BM25 vs. Gemini embeddings, see docs/adr/0001-retrieval-embeddings.md
```

The live run checks the "I don't know" signal end to end (an unanswerable question must end unanswered, through
retrieval or the model's `[[no-answer]]` marker) and the red-team cases in `data/redteam.json` (prompt leak,
role hijack, injected page content, forged tags, claiming to be human, off-topic work, invented codes) against
`must` / `mustNot` patterns. Answers are written to `results/live-latest.json`.

## Suites

| File | What it covers |
|---|---|
| `data/coffee.golden.json` | The demo tenant (`apps/api/data/knowledge/tn_demo.json`): small TR+EN shop with mirrored pages |
| `data/saas.golden.json` + `saas.corpus.json` | A help centre whose pages share vocabulary (storage vs. attachments, SSO vs. 2FA vs. password, cancel vs. refund) |

Each case is `{ id, q, prev?, expect, tags }`. `expect` lists the URL paths that answer the question (any one is
enough) or is `null` when the site can't answer it, in which case the bot must take the "I don't know" path.
`prev` is the previous visitor message, for follow-ups. Tags group the report: `tr`, `en`, `morph` (Turkish
suffixes, plurals), `synonym` (no shared word with the page), `cross-lingual`, `followup`, `hard-negative`
(shares words with a page that does not answer it), `unknown`.

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
