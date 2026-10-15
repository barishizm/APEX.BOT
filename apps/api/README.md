# @apex/api

Widget backend: `POST /v1/chat` (SSE), widget config, feedback, email handoff and conversation erasure.

```bash
npm run build:widget                      # once, so /widget.js exists
APEX_MODEL=echo npm run dev:api           # no API key needed
npm run dev:api                           # real answers: put ANTHROPIC_API_KEY in apps/api/.env (copy .env.example)
open http://localhost:8787/demo
npm test                                  # api + widget
```

| Method | Path | Notes |
|---|---|---|
| `GET` | `/v1/widget/config?site_key=` | Public tenant settings (name, colors, greeting, suggestions) |
| `POST` | `/v1/chat` | `{ message, conversationId? }` → SSE `meta`, `delta`*, `done` \| `error` |
| `POST` | `/v1/feedback` | `{ conversationId, messageId, rating: "up" \| "down" }` |
| `POST` | `/v1/handoff` | `{ conversationId?, email, name?, message? }` → emails the transcript to the tenant (404 when hand-off is off) |
| `POST` | `/v1/lead` | `{ conversationId?, email, name?, phone? }` → attaches the lead form to a conversation and emails the team |
| `GET` / `DELETE` | `/v1/conversations/:id` | Visitor's own history / KVKK erasure |

Every `/v1` request needs the site key (`x-apex-site-key` header or `site_key` query) and an `Origin` on that tenant's allowlist.
Error codes the widget localizes: `unknown_site`, `origin_not_allowed`, `rate_limited`, `budget_exhausted`, `message_too_long`, `conversation_full`, `not_found`, `upstream`, `refused`.

The demo tenant lives in `data/tenants.json` (only loaded when `NODE_ENV` is not `production`, or `APEX_DEMO_TENANT=1`) and its content in `data/knowledge/<tenant id>.json`.
With `DATABASE_URL` set, bots configured in the dashboard (`/dashboard/widget`, table `app.bots`) are synced
every 30 s as well: their model (Anthropic, OpenAI or Google, with an optional fallback), persona, limits and
widget look all come from there. Each provider needs its key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`).

Not production-ready yet (each marked `shortcut:` in the code): conversations, rate limits and token budgets are in memory;
retrieval is lexical BM25 rather than pgvector hybrid search; handoff emails go to an in-memory outbox until an email provider is chosen.

## Abuse and cost limits

The origin allowlist only protects against other websites using a tenant's key: `Origin` is trivially forged outside a browser and the site key is public. What actually bounds cost is:

- **Daily token budget** per tenant, stored in Postgres (`app.token_usage`) so it survives restarts and holds across instances. Without `DATABASE_URL` it falls back to memory.
- **`APEX_MAX_DAILY_TOKENS`** (default 20,000,000): platform ceiling applied on top of whatever budget a tenant sets.
- Per-IP, per-tenant, hand-off and mail rate limits. These are in-memory fixed windows, so a restart resets them (and each instance counts separately); the token budget above is the durable backstop.
