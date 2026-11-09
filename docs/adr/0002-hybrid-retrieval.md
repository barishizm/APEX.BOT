# ADR 0002: Hybrid retrieval (BM25 + embeddings); the model cites its sources

- **Status:** accepted, 2026-10-17. Supersedes decision 1 of [ADR 0001](0001-retrieval-embeddings.md) ("no embeddings
  in production for now"); its decisions 2 and 3 (the model decides "I don't know", the server fixes the reply language)
  stand and this design depends on them.
- **Reproduce:** `npm run eval -w @apex/evals [-- --lexical]`, `npm run experiment:hybrid -w @apex/evals`,
  `npm run eval:live -w @apex/evals [-- --lexical]`

## Context

ADR 0001 listed what would reopen the question: "synonym or cross-lingual failures show up in real" use. They did.
A personal site (barishizm.eu, 28 pages EN+TR) put the widget live, and visitors asking about its owner were told the
site doesn't say:

> **What does he do?** → "I don't really know, my team can help you."
> **what is his job?** → "The documents don't say what Barış does for a living. They only explain what AI agents are."

The crawler had read every page. Retrieval never got the right ones to the model:

- `what`, `does`, `he`, `do`, `his`, `is` are stopwords, so "What does he do?" has **no search terms at all**.
- The site never says "job"; it says "AI Engineer Intern", "student", "GPA". The only page with "job" is the blog post
  on AI agents, so every job question was answered from it.
- "Who is Barış?" retrieved nothing: the name is in every page title, so its IDF is ~0 and nothing clears the floor.

A golden suite for this site (`portfolio`, 36 cases, mostly pronoun and everyday-word questions) puts numbers on it:
BM25 got a right excerpt to the model for **51.8%** of answerable questions; end to end, the bot passed **63.9%**.

## Decision

1. **Hybrid retrieval.** Each tenant's chunks are embedded (`gemini:gemini-embedding-2@768`, the best of the models
   ADR 0001 measured). A message's lexical (BM25, unchanged) and semantic (cosine) candidates, 20 each, are fused by
   reciprocal rank (k = 60). A hit is kept when it clears **either** floor: the existing BM25 floor, or a cosine floor
   of 0.50 with the hit within 0.08 of the best similarity. The top 4 go to the model, as before. One function,
   `retrieve()` in `@apex/knowledge`, is used by `/v1/chat`, the dashboard's "Try a question" and both evals, so they
   can't drift apart.
2. **The cosine floor only removes content that is about something else.** It is set just under the lowest similarity
   of a right page across the three suites (0.554). It cannot decide "I don't know": on the portfolio site, "hi" and
   "Merhaba" score **0.615–0.648** against the closest page, higher than some answerable questions. This is ADR 0001's
   finding again (no gate separates answerable from unanswerable), so retrieval now almost always passes something and
   the model's `[[no-answer]]` marker alone marks a turn unanswered.
3. **The model cites what it used.** Because retrieval passes excerpts for greetings too, "show the top three retrieved
   pages as sources" would put unrelated links under "Hi!". The prompt asks the model to end a reply that used excerpts
   with `[[used: 1, 3]]`; `ReplyMarkerFilter` strips it from the stream (like `[[no-answer]]`, wherever a delta splits
   it) and only those pages are shown. No marker means no sources: a missing link is a smaller failure than a wrong one.
   This also fixes a quirk: a greeting that BM25 matched nothing to used to be logged as an unanswered question and
   offered the hand-off.
4. **"Related facts aren't a partial answer."** With semantic retrieval the model sees near-topic pages, and in the
   first live run it answered two unanswerable SaaS questions with them ("No HIPAA information, but data is stored in
   the EU…") without the marker, so the owner never saw the gap. The rule now says related facts that don't answer what
   was asked don't make a reply partial.
5. **The index stays in memory; vectors persist in Postgres as `bytea`, not pgvector.** The chat API already holds each
   tenant's chunks in memory for BM25 (capped at 5000 per bot "to keep the index small"); exact cosine over 5000 × 768
   floats takes a few milliseconds and ~15 MB. Keeping both retrievers in one process keeps fusion simple, adds no
   database round trip per message, and keeps the schema plain PostgreSQL (no extension), as `packages/db` promises.
   Vectors live in `app.knowledge_embeddings`, keyed by `(bot_id, model, sha256(title + text))`: a website re-sync
   deletes and re-inserts every chunk, and unchanged pages keep their vectors. Move to pgvector when a tenant's corpus no
   longer fits the per-bot cap or the API's memory.
6. **Failure leaves lexical search in place.**
   - Chunks are embedded by a background job when a bot's knowledge loads (`ChunkIndexer`): stored vectors attach at
     once, missing ones are embedded in batches of 50, saved after each batch, and a failure is retried after 5 minutes.
     Vectors computed for a superseded load are never attached (generation check).
   - A message is embedded on the chat path with a 2.5 s timeout, no retries, and a breaker that pauses for a minute
     after three consecutive failures (`QueryEmbedder`). Tenants with no vectors make no embedding call.
   - The query cache is per tenant: a cache hit answers faster, and that must not reveal to one site what visitors
     typed on another.
7. **Opt-in per deployment.** `APEX_EMBEDDINGS=gemini:gemini-embedding-2@768` turns it on; unset or `off` is exactly
   the previous lexical behaviour (a unit test checks `retrieve()` without a semantic query returns the old hits).

## Results

Offline (retrieval only, committed embedding cache, no network):

| context recall (a right excerpt reaches the model) | coffee | saas | portfolio |
|---|---|---|---|
| BM25 | 91.7% | 100% | 51.8% |
| hybrid | **100%** | 100% | **96.3%** |
| hit@1, BM25 → hybrid | 88.9% → 100% | 90.2% → 96.1% | 40.7% → 63.0% |

Retrieval-level `abstainAccuracy` falls to 0%, by design (decision 2); the gate that matters is the live one below.

Live (`claude-haiku-5-5`, real prompt, every golden and red-team case):

| | coffee | saas | portfolio | red team |
|---|---|---|---|---|
| BM25 (new prompt, before decision 4) | 44/48 | 60/60 | **23/36** | – |
| hybrid, before decision 4 | 47/48 | 58/60 | 35/36 | 7/7 |
| hybrid, final (two runs, identical) | **48/48** | **60/60** | **36/36** | **7/7** |

Answered questions that cited a right page: 36/36, 51/51 and 26/27 (one ambiguous case, below).

The BM25 portfolio run reproduces the original report word for word ("I don't have information about Barış Akıntı's
job. The site's posts I can see cover AI agents…"). Hybrid, final: "Barış is currently an AI Engineer Intern at
INTERIP NETWORKS B.V. (remote, since June 2026)… He is also a BSc student in Artificial Intelligence Systems at
VILNIUS TECH."

Eval changes made with this ADR: the `portfolio` suite; `smalltalk`/`offtopic` tags (two existing greetings, and
"What's the weather like today?", were tagged `unknown` and only passed because BM25 found nothing; by the prompt's
existing rule a greeting or a declined topic isn't a content gap); the live eval now scores the marker alone, as the
API does, and reports citations.

## Also tried, rejected

- **The site's name in front of the query** ("Barış Akıntı\nNe iş yapıyor?") to resolve "he/it/you" to the site's
  subject: portfolio context recall 96.3% → 81.5%. The name's Turkish letters pull English questions to the `/tr/`
  pages. Follow-ups keep their context by embedding the message both alone and joined to the previous one (best of the
  two), which costs nothing extra (one request).

- **Fusion tweaks, measured 2026-11-09** (offline, all three suites; portfolio is the only one with room, hit@1 63.0%,
  MRR 0.728). One chunk per page in the ranking: MRR 0.744, hit@1 unchanged. Lexical-only candidates below the BM25
  floor getting no RRF credit: hit@1 drops to 51.8% (floor at 1×) or 59.3% (0.5×). Lexical weight 0.5–0.7: context recall
  drops to 92.6% at 0.5, nothing gained at 0.7. RRF k 10–30: no change. A penalty for chunks in another language than the
  message (0.95–0.6×): every suite worse (coffee hit@1 97.2%, saas 92.2%, portfolio context recall down to 88.9%), since
  cross-lingual cases and short messages lose. The best combination (one chunk per page, the lexical gate, lexical
  weight 0.7) gains one portfolio case: too little evidence on 27 answerable cases to change production. The misses are
  near-ties in cosine (0.62 vs 0.63 for "What does he do?": the AI-agents post vs /about); a larger portfolio suite
  or a reranker would be the next thing to try.

## Known gaps

- "Ne iş yapıyor?" (no subject: "what does he/it do?") ranks the AI-agents post (0.617) just above the home page
  (0.603). The model's reply is reasonable either way, but the right page isn't cited.
- Language detection took any Turkish-only letter as conclusive, so "Who is Barış?" got a Turkish reply. Fixed here:
  a capitalised word inside a sentence is a name and no longer decides the language.

## Consequences

- **A new sub-processor.** Every tenant's site content and every visitor message go to Google's embedding API once
  `APEX_EMBEDDINGS` is set. Use a paid (billing-enabled) Gemini key in production: on the free tier Google may use the
  data to improve its products. List the sub-processor in the privacy policy and DPA.
- An extra network call per message before the first token: measured 350–560 ms (median ~440 ms) from a home
  connection, likely less from the Frankfurt server; skipped for tenants without vectors, and for a message already in
  the per-tenant cache.
- Indexing cost is negligible (a 50-page site is ~150 chunks, embedded once; re-syncs embed only changed pages).
- The dashboard's "Try a question" needs the same `APEX_EMBEDDINGS` and key in the web app's environment to show
  matches by meaning; without them it stays a keyword preview.

## Revisit when

- A tenant's corpus approaches the 5000-chunk cap, or the API's memory (move vectors to pgvector, or quantise).
- Another embedder is considered: add it to `SEMANTIC_FLOORS` only after `experiment:hybrid` calibrates its floor.
- Unanswered-question reports show partial answers hiding gaps again (decision 4).
