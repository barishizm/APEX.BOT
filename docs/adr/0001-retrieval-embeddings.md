# ADR 0001: Keep lexical retrieval; detect "I don't know" in the model

- **Status:** accepted, 2026-10-16; decision 1 superseded by [ADR 0002](0002-hybrid-retrieval.md) (2026-10-17)
- **Reproduce:** `npm run eval -w @apex/evals -- --verbose`, `npm run experiment:embeddings -w @apex/evals`, `npm run eval:live -w @apex/evals`

## Context

The roadmap had "semantic search with embeddings" and "hybrid search + reranker" as the next retrieval steps.
Before building them we added a golden-question eval (`packages/evals`): 108 cases over two corpora (the demo
coffee shop, TR+EN; and a SaaS help centre whose pages share vocabulary), including 21 questions the sites
can't answer.

The production BM25 retrieval with its absolute score floor scored:

| | pass | context recall | correct "I don't know" | hit@1 |
|---|---|---|---|---|
| coffee | 87.5% | 91.7% | 75.0% | 88.9% |
| saas | 90.0% | 100% | **33.3%** | 90.2% |

Ranking was already good (recall@4 is 94–100%). The real weakness was the "I don't know" path: on the SaaS
corpus two in three unanswerable questions ("Who founded Taskline?", "Are you HIPAA compliant?") still
retrieved something, because a brand name or a shared word stem clears the score floor. In
`apps/api/src/app.ts` an answer counted as unanswered only when retrieval returned nothing, so those
questions never reached the dashboard's unanswered list, never offered the hand-off, and showed unrelated
source links under the model's "I don't have that information".

## Options measured

Gemini `gemini-embedding-001` and `gemini-embedding-2` (768 dimensions), fused with BM25 by reciprocal rank
fusion, with several "I don't know" gates, each swept over its threshold *on the test set itself* (an upper
bound). OpenAI embeddings could not be measured: the account has no credit.

| gemini-embedding-2, best threshold | coffee pass | saas pass | saas "I don't know" |
|---|---|---|---|
| BM25 gate (ranking only changes) | 87.5% | 90.0% | 33.3% |
| cosine ≥ 0.595 | 85.4% | 86.7% | 11.1% |
| BM25 or cosine ≥ 0.655 | 91.7% | 88.3% | 22.2% |
| top cosine − mean ≥ 0.045 | **97.9%** | 86.7% | 11.1% |

Embeddings lift hit@1 (coffee 88.9% → 100%, saas 90.2% → 96.1%) and rescue some synonym questions, but no
gate separates answerable from unanswerable questions on both corpora: a threshold that suits a narrow site
(where every question is "about coffee") breaks the help centre, and vice versa. Lexical query coverage
(share of the query's IDF matched) was also tried and overlaps the same way.

## Decision

1. **No embeddings in production for now.** The measured gain is ranking inside a top 4 that the model
   already sees in full; the cost is a new sub-processor for every customer's content, an extra network call
   on each message, a new failure mode and an index to keep in sync.
2. **The model decides "I don't know".** It sees the excerpts and can tell when they don't answer. The
   system prompt asks it to end such replies with `[[no-answer]]`; `NoAnswerFilter` strips the marker from
   the stream (also when split across deltas) and the API marks the turn unanswered, offers the hand-off and
   drops the sources.
3. **The server fixes the reply language** with `<reply_language>` from `detectLang`. The live eval found
   that on a Turkish-default site Haiku narrated its reasoning to English-speaking visitors ("The visitor
   wrote in English, so I reply in English. No documents matched…") in 6 of 6 tries; a prompt rule alone
   brought it to 3 of 10, the hint to 0 of 10.

## Result (live eval, claude-haiku-5-5)

| | before (retrieval only) | after |
|---|---|---|
| coffee: unanswerable questions marked unanswered | 75.0% | 100% |
| saas: unanswerable questions marked unanswered | 33.3% | 100% |
| saas: all cases | 90.0% | 100% |
| red team (injection, prompt leak, role hijack, forged tags) | – | 7/7 |

The three remaining coffee failures are retrieval misses that need semantic matching: a synonym ("Paramı ne
zaman geri alırım?"), a question about a page that exists only in Turkish, and "Which coffees do you sell?"
where "coffee" is on every page.

## Revisit when

- Customers' corpora are large enough that the right chunk falls outside the top 4 (watch `recallAtK`).
- Synonym or cross-lingual failures show up in real unanswered-question reports.
- A reranker or a per-tenant calibrated gate is on the table: add cases to the golden suites first, then rerun
  `experiment:embeddings`.
