# Apex Bot

Apex Bot is a multi-tenant AI assistant for websites. A customer adds a single `<script>` tag to their site, and visitors get a chat widget that answers questions grounded in that site's own content, cites its sources, and hands off to a human by email when it cannot help.

The product is a hosted, commercial SaaS. Models run through cloud APIs; there is no self-hosted or on-premise deployment. The assistant answers in Turkish and English.

> **License:** the source is visible but not open source. It is released under the [Apex Bot Personal Use License](LICENSE): personal, non-commercial use only. All other rights reserved.

## Features

**Visitors**

- Streaming chat widget with Markdown, suggested questions, and thumbs up/down feedback
- Answers in the visitor's language (Turkish or English), with links to the pages each answer is based on
- "Talk to a human" handoff: a contact form that emails the conversation summary to the site owner
- Keyboard navigation and screen-reader labels

**Site owners**

- Knowledge base built from a crawled site (robots.txt respected), uploaded files, or manual FAQs
- Widget studio for theme, position, name, greeting, tone, and off-limits topics
- Conversation history, unanswered-question list, lead capture, and weekly summaries
- Domain allowlist, workspaces, team invitations, and plan-based usage limits
- Billing through Paddle (gated behind a feature flag)
- Data deletion and per-tenant retention controls

**Platform operators**

- `/admin` console for users, workspaces, bots, usage and cost, abuse controls, support requests, announcements, feature flags, and system health
- Role-based access with mandatory 2FA, step-up verification for destructive actions, and an immutable audit log. See the [admin runbook](docs/admin-runbook.md).

## Architecture

```
 Customer site                       Apex backend
┌────────────────┐  HTTPS / SSE  ┌─────────────────────────────┐
│  widget.js     │──────────────►│  apps/api  (chat API)       │
│  (Shadow DOM)  │               │   ├─ origin + rate limiting │
└────────────────┘               │   ├─ hybrid retrieval       │
                                 │   ├─ LLM provider           │
┌────────────────┐               │   └─ conversation store     │
│  apps/web      │──────────────►│                             │
│  site, dashboard, /admin       │  PostgreSQL  (@apex/db)     │
└────────────────┘               └─────────────────────────────┘
```

**Life of a message**

1. The widget posts the message with its public `site_key`.
2. The API checks the `Origin` against the tenant's allowlist and applies rate limits.
3. Retrieval returns the most relevant chunks from that tenant's knowledge base.
4. The system prompt, retrieved chunks, and conversation history go to the model, and the answer streams back over SSE.
5. The model flags answers it cannot support (`[[no-answer]]`) and names the pages it used (`[[used: n]]`); visitors see only the pages actually used as sources.
6. The conversation is stored according to the tenant's retention policy.

**Retrieval.** BM25 and cosine-similarity candidates (`gemini-embedding-2`, 768 dimensions) are merged with reciprocal rank fusion, and the top four chunks are sent to the model. If the embedding provider is unavailable, search falls back to BM25. Indexes are built in memory per tenant, and vectors are cached in PostgreSQL by content hash so re-crawls only re-embed changed pages. See [ADR 0001](docs/adr/0001-retrieval-embeddings.md) and [ADR 0002](docs/adr/0002-hybrid-retrieval.md).

### Repository layout

| Path | Purpose |
|---|---|
| `apps/web` | Next.js app: marketing site, sign-up/login, customer dashboard, and the `/admin` console |
| `apps/api` | Chat API consumed by the widget; syncs bot configuration from the database and records conversations |
| `apps/widget` | Embeddable widget, built to a single `widget.js` served by the API |
| `packages/db` | Schema, migrations, and all database access, including tenant isolation |
| `packages/knowledge` | SSRF-safe crawler, content extraction, chunking, and BM25 retrieval |
| `packages/evals` | Golden question sets, retrieval quality gate, live and red-team evaluations ([README](packages/evals/README.md)) |
| `docs` | Architecture decision records and the admin runbook |

### Technology

TypeScript throughout. Node.js 26 API, Next.js dashboard, vanilla TypeScript widget in Shadow DOM, PostgreSQL (no extensions required), Claude as the default model with OpenAI and Gemini selectable per bot. The API runs on Render and the web app on Vercel.

## Embedding the widget

```html
<script
  src="https://api.apexbot.eu/widget.js"
  data-site-key="apex_pk_xxxxxxxx"
  async
></script>
```

Optional configuration:

```html
<script>
  window.Apex = {
    theme: { primary: "#4f46e5", position: "bottom-right" },
    greeting: "Hi! How can I help?",
    lang: "auto",
    suggestions: ["Pricing", "Refund policy", "Contact"]
  };
</script>
```

The JavaScript API exposes `Apex.open()`, `Apex.close()`, `Apex.send(text)`, `Apex.identify({ name, email })`, and `Apex.on(event, fn)`. Events: `message`, `open`, `close`, `lead`, `handoff`, `reset`, `end`, `delete`.

The `site_key` is public by design and only works on allowlisted origins. Secrets never reach the client.

## Chat API

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/chat` | Send a message; the answer streams back over SSE |
| `GET` | `/v1/widget/config` | Public widget configuration for a site key |
| `GET` | `/v1/conversations/:id` | Conversation history |
| `DELETE` | `/v1/conversations/:id` | Delete a conversation (visitor data deletion) |
| `POST` | `/v1/feedback` | Message feedback |
| `POST` | `/v1/handoff` | Hand a conversation off to a human by email |
| `POST` | `/v1/lead` | Submit lead contact details |
| `GET` | `/widget.js` | The widget bundle |
| `GET` | `/health` | Liveness check |

## Security and privacy

- **Tenant isolation.** Every query is scoped by tenant inside `@apex/db`; retrieval cannot run without a tenant filter, and tests enforce it.
- **Prompt injection.** Retrieved site content and visitor messages are treated as data, never as instructions. The assistant has no side-effecting tools.
- **Abuse protection.** Per-IP and per-site rate limits, message length limits, origin allowlists with strict CORS, and daily token budgets.
- **Crawler safety.** The crawler blocks requests to private and internal addresses (SSRF protection).
- **Personal data.** Emails, phone numbers, and card numbers are masked in logs. Retention is configurable per tenant, and visitors and owners can delete conversations.
- **Transparency.** Visitors can see they are talking to an AI.
- **Admin console.** 2FA is required, writes need a justification, destructive actions need a fresh step-up code, and every action is written to an immutable audit record in the same transaction as the change. A test verifies that every `/api/admin` route uses these guards.

## Quality and evaluation

`packages/evals` holds golden question sets for three domains (coffee shop, portfolio, SaaS) in Turkish and English.

- **Retrieval gate.** Runs offline on every pull request and fails on regression against `baseline.json`. Metrics include hit@k, context precision, and abstain accuracy.
- **Live evaluation.** End-to-end runs against a real model, validating answer markers and citations.
- **Red-team suite.** Prompt injection, jailbreak, and off-topic scenarios.

## Getting started

Requirements: Node.js 26 (see `.nvmrc`) and PostgreSQL 13+ (Supabase, Neon, or self-managed; see [packages/db/README.md](packages/db/README.md)).

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # set DATABASE_URL and the rest
cp apps/api/.env.example apps/api/.env          # same DATABASE_URL + model keys
npm run db:migrate                              # create or update the schema (idempotent)
npm run build:widget                            # widget.js, served by the API
npm run dev:api                                 # chat API on http://localhost:8787
npm run dev:web                                 # site and dashboard on http://localhost:3000
npm run admin:bootstrap -- you@example.com      # one-time: promote a verified account to superadmin
```

To try it without installing PostgreSQL, `npm run db:local` starts an embedded PGlite server on `127.0.0.1:5433` (see the [admin runbook](docs/admin-runbook.md)). Set `APEX_MODEL=echo` to run without any model API key.

**Checks**, all run in CI on every pull request:

```bash
npm run typecheck
npm test        # database tests run against embedded PostgreSQL; no network needed
npm run eval    # retrieval quality gate
```

## Configuration

Core variables. Each app ships an `.env.example` with the full list.

| Variable | App | Description |
|---|---|---|
| `DATABASE_URL`, `DATABASE_SSL` | web, api | PostgreSQL connection (identical in both) |
| `DATABASE_POOL_MAX` | web, api | Pool size (default 5; use `1` with PGlite) |
| `TRUST_PROXY` | web, api | Number of proxies in front of the app (`1` on Vercel and Render); IP-based limits depend on it |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` | api | Model provider keys |
| `APEX_MODEL` | api | Default model; `echo` for keyless local development |
| `APEX_EMBEDDINGS` | api, web | `gemini:gemini-embedding-2@768` enables hybrid search; empty or `off` means BM25 only. Content and visitor messages are sent to the provider, so use a paid key in production |
| `APEX_MIN_RETRIEVAL_SCORE` | api, web | BM25 threshold; the dashboard's test tool must use the same value |
| `TOTP_ENCRYPTION_KEY` | web | Encrypts 2FA secrets. Required, and must not change once set |
| `APEX_HEALTH_TOKEN` | web, api | Shared secret letting `/admin/system` read the API's `/health/details` |
| `SIGNUPS_MODE` | web | Default sign-up mode: `open`, `invite_only`, or `closed` (overridden by `/admin/settings`) |
| `RESEND_API_KEY`, `MAIL_FROM` | web, api | Transactional email; logged to the console if unset in development |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APEX_API_URL` | web | Public URLs of the site and the chat API |
| `NEXT_PUBLIC_CONTACT_EMAIL` | web | Contact address shown on the site and legal pages |
| `GOOGLE_*`, `GITHUB_*` | web | OAuth sign-in |

**Billing** uses Paddle (merchant of record; see [ADR 0003](docs/adr/0003-billing.md)). Set `PADDLE_ENV` (`sandbox` or `production`), `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, the six `PADDLE_PRICE_{STARTER,PRO,BUSINESS}_{MONTH,YEAR}` price IDs, and optionally `PADDLE_PRICE_OVERAGE`. All keys and price IDs must come from the same environment. If anything is missing or mismatched, billing stays disabled, the app keeps running, and `/admin/system` shows what is wrong. Even with a valid configuration, plans go on sale only when the `billing` feature flag is enabled; see the [go-live checklist](docs/admin-runbook.md#faturalamayı-canlıya-alma).

## Internationalization

The site, dashboard, API errors, and emails are fully available in English and Turkish. English is the default and has no URL prefix (`/pricing`); other locales are prefixed (`/tr/pricing`). Dashboard URLs carry no prefix, and the language comes from the `NEXT_LOCALE` cookie or the browser. Every page emits locale-specific metadata, `hreflang` alternates, Open Graph tags, and sitemap entries.

To add a locale, extend `apps/web/lib/i18n/config.ts`, add a dictionary and long-form content for the new language, and translate the dashboard namespaces, error messages, and email templates. `npm run typecheck` reports anything missing.

## Documentation

- [Admin runbook](docs/admin-runbook.md): roles, first admin, 2FA recovery, billing go-live, local end-to-end setup
- [ADR 0001](docs/adr/0001-retrieval-embeddings.md): embedding model selection
- [ADR 0002](docs/adr/0002-hybrid-retrieval.md): hybrid retrieval and answer-quality gate
- [ADR 0003](docs/adr/0003-billing.md): billing design
- [Evals](packages/evals/README.md): evaluation suites and metrics
