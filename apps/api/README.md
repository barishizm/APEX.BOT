# @apex/api

Widget backend: `POST /v1/chat` (SSE), widget config, feedback, email handoff and conversation erasure.

```bash
npm run build:widget                      # once, so /widget.js exists
APEX_MODEL=echo npm run dev:api           # no API key needed
ANTHROPIC_API_KEY=... npm run dev:api     # real answers from Claude
open http://localhost:8787/demo
npm test                                  # api + widget
```

| Method | Path | Notes |
|---|---|---|
| `GET` | `/v1/widget/config?site_key=` | Public tenant settings (name, colors, greeting, suggestions) |
| `POST` | `/v1/chat` | `{ message, conversationId? }` → SSE `meta`, `delta`*, `done` \| `error` |
| `POST` | `/v1/feedback` | `{ conversationId, messageId, rating: "up" \| "down" }` |
| `POST` | `/v1/handoff` | `{ conversationId?, email, name?, message? }` → emails the transcript to the tenant |
| `GET` / `DELETE` | `/v1/conversations/:id` | Visitor's own history / KVKK erasure |

Every `/v1` request needs the site key (`x-apex-site-key` header or `site_key` query) and an `Origin` on that tenant's allowlist.
Error codes the widget localizes: `unknown_site`, `origin_not_allowed`, `rate_limited`, `budget_exhausted`, `message_too_long`, `conversation_full`, `not_found`, `upstream`, `refused`.

Tenants live in `data/tenants.json` and their content in `data/knowledge/<tenant id>.json`.

Not production-ready yet (each marked `shortcut:` in the code): conversations, rate limits and token budgets are in memory;
retrieval is lexical BM25 rather than pgvector hybrid search; handoff emails go to an in-memory outbox until an email provider is chosen.
