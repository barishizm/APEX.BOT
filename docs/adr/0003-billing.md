# ADR 0003: Billing through Paddle (merchant of record), behind a provider adapter

- **Status:** accepted, 2026-10-20. Answers open questions 1 (pricing) and 2 (payment provider) in the
  [README](../../README.md#açık-sorular).
- **Sources of truth:** prices and plan limits in `packages/db/src/plans.ts` (`PLAN_PRICES`, `PLAN_LIMITS`,
  `entitlementsFor`); plan copy in the `pricing` dictionaries, which take their numbers from there; models and tiers
  in `packages/db/src/bot-settings.ts`.

## Context

Apex Bot is in closed beta and free. The pricing page already shows the launch plans and promises "we'll tell you well
before anything changes"; the roadmap's "billing of usage quotas and payment" is the last item between the beta and
selling. Two questions were open: how to price (flat plan, usage, or both) and which payment provider to use.

The constraints:

- The company is registered in Turkey and the customers are worldwide (five UI languages, EU visitors).
- Selling software to consumers and businesses abroad means VAT/OSS registration in the EU, sales tax in the US
  states that tax SaaS, and a compliant invoice per sale. A one-person company can't carry that by hand.
- Model cost scales with use and differs ~100× between the cheapest and the dearest model a bot can choose
  (Haiku 5.5 at $0.10/$0.50 per million tokens, Fable 5.1 at $10/$50). A flat price alone can't hold a margin.
- Bots already have a per-bot **daily token budget** (`security.dailyTokenBudget`, staff override, platform ceiling
  `APEX_MAX_DAILY_TOKENS`) that answers `budget_exhausted`. It exists to stop abuse and runaway cost, not to sell.

## Decision

**Paddle Billing is the payment provider and merchant of record.** Paddle sells to the customer, collects and remits
VAT/sales tax, issues the invoice, handles cards, PayPal and local methods, dunning and chargebacks. We invoice Paddle
for the payouts. Paddle is called only through a `BillingProvider` adapter (below), so a second provider can be added
for Turkish lira customers (iyzico) without touching quota or plan logic.

### (a) Plans and prices

As on the pricing page, in USD:

| plan | monthly | annual (per month, billed yearly) | AI replies / month | websites | knowledge pages | models |
|---|---|---|---|---|---|---|
| Free | $0 | – | 100 | 1 | 50 | fast tier only |
| Starter | $29 | $24 ($288/yr) | 600 | 1 | 300 | all tiers |
| Pro | $79 | $65 ($780/yr) | 1,500 | 3 | 1,000 | all tiers, automatic fallback |
| Business | $249 | $199 ($2,388/yr) | 5,000 | 10 | 3,000 | all tiers, automatic fallback |

Feature differences (branding removal, topics to decline, retention up to 365 days, DPA, onboarding call) are as listed
in the dictionaries. Free needs no card and never has a Paddle subscription.

- Each paid plan is one Paddle **product** with two **prices**: a monthly price and an annual price, each with its own
  `price_id`. Overage (c) is a third, non-recurring price. The six recurring `price_id`s and the overage `price_id` live
  in configuration per environment (sandbox and live differ), mapped to `(plan, interval)` in one table in code; nothing
  else reads Paddle ids.
- Prices change only by creating new Paddle prices. Existing subscribers keep their price until we migrate them with
  notice; the margin comment in `plans.ts` must be rechecked against model prices before any change.
- Upgrades take effect immediately and are prorated (Paddle `prorated_immediately`); the new reply allowance applies at
  once, with what was already used carried over. Downgrades take effect at the end of the billing period
  (Paddle scheduled change) and follow (e).
- Enterprise is out of band (sales, custom Paddle prices or invoice).

### (b) The "AI reply" unit and when it resets

An **AI reply** is one assistant answer produced by `/v1/chat` that reached the visitor. Its weight depends on the
model that actually answered (after any fallback):

| model | weight |
|---|---|
| fast tier (`tier: "fast"`: Haiku, GPT-6 Luna, Flash-Lite, …) | ⅕ |
| balanced tier (`tier: "balanced"`: Sonnet 5.5, Gemini 3.8 Flash, …) | 1 |
| Claude Opus 5.5, and every other flagship-tier model | 2 |
| Claude Fable 5.1 | 5 |

- The weight is a property of the model entry in `bot-settings.ts` (default from its tier, Fable overridden), so a new
  model can't ship without one. A flagship whose price is far from Opus's gets its own weight there, checked against
  the margin rule above.
- Usage is stored as an integer count of **fifths** per workspace and window (fast = 1, standard = 5, Opus = 10,
  Fable = 25) so no floating point reaches billing. The UI shows replies with one decimal.
- Counted: every delivered answer, including "I don't know" answers (the model ran). Not counted: requests refused by
  rate limits, the daily budget or the quota; provider errors with no answer; the hand-off form; the dashboard's
  "Try a question" (it is held by the daily token budget instead).
- The quota belongs to the **workspace** (`app.organizations`), shared by all its bots.
- **Reset:** a paid workspace's window starts on its subscription's billing anchor and lasts one month. Monthly
  subscriptions reset at each renewal; annual subscriptions reset on the same day of every month inside the paid year
  (clamped to the month's last day). A Free workspace resets on the 1st of each calendar month, 00:00 UTC. Unused
  replies don't roll over.

### (c) When the quota runs out

- **Default (overage off):** the bot stops calling a model and answers with the hand-off form, as `[[no-answer]]` turns
  do today, with a short "the assistant can't answer right now" line in the visitor's language. Visitors never see
  "quota". The owner gets an email at 80% and at 100% and a banner in the dashboard. No surprise bill.
- **Overage on** (paid plans only, owner's choice in billing settings): replies continue at **$5 per 100 replies**, up
  to a **monthly cap the owner sets** in whole dollars (minimum $5, a multiple of $5). Overage is used in blocks of 100
  replies; a block is billed once it is opened, so the bill is always a multiple of $5 and never above the cap. When
  the cap's last block is used, behaviour falls back to the hand-off form until the window resets or the owner raises
  the cap.
- Overage is billed in arrears at the end of each monthly window, as a one-time charge on the subscription with the
  overage `price_id` and quantity = blocks opened, charged immediately (so annual subscribers are not billed a year
  late). A failed overage charge follows (f).
- Free has no overage; it upgrades instead.

### (d) The daily token budget stays, separate from the quota

The per-bot daily token budget, its staff override and `APEX_MAX_DAILY_TOKENS` stay exactly as they are and are checked
**before** the commercial quota. They protect us and the customer from abuse, loops and scraping within one day; the
quota decides what a customer has paid for in a month. The two never share a counter or a message: a bot out of daily
budget answers `budget_exhausted` and resumes at 00:00 UTC whatever quota is left; a bot out of quota offers the
hand-off form whatever budget is left. Default budgets are set high enough that a normal day on a plan never reaches
them.

### (e) Downgrades never delete data

When a workspace moves to a smaller plan (by choice, at period end, or by (f)):

- **Websites over the limit are paused, not removed.** The owner picks which stay active; until they do, the oldest
  ones stay. A paused bot's widget shows the hand-off form only; its knowledge,
  settings and conversations stay and are readable in the dashboard. Unpausing needs a free slot.
- **Knowledge over the page limit** is kept; the next crawl reads up to the new limit, and pages beyond it stay stored
  but are excluded from retrieval until the plan allows them.
- **Features above the plan become read-only:** a bot on a model its plan doesn't include answers with the plan's
  default model (settings keep the old choice, shown as unavailable); "Powered by Apex Bot" returns; topics to decline
  are kept but not applied; team members over a seat limit keep read access.
- **Retention:** conversations already stored are kept under the retention they were stored with; the shorter window
  applies to new conversations only. Deletion stays the owner's action (KVKK tools) or the retention they chose.
- Upgrading again restores everything as it was.
- Implemented (2026-10-20) behind the `plan_limits` flag (off until launch, (g)): the rules are in
  `packages/db/src/entitlements.ts`. Saves are refused by `saveBotSettings` (a value the bot already has may stay),
  the chat API serves each bot through `effectiveSettings` (`TenantRegistry`), websites are ranked by
  `app.bots.standby` and age (migration 0036, `setActiveSites`), a paused one answers `quota_exhausted` so the widget
  opens the hand-off form, and each new conversation stores its plan's retention cap
  (`conversations.retention_cap_days`).

### (f) Failed payments: 7 days' grace, then Free

- On the first failed renewal Paddle marks the subscription `past_due` and retries. We start a **7-day grace period**
  from that moment: the workspace keeps its plan, the owner gets an email on day 0, 3 and 6 and a dashboard banner
  with Paddle's update-payment link.
- Paddle's payment recovery is configured to cancel the subscription after its last retry within the 7 days. When it
  is canceled, or when our own `grace_until` passes with the subscription still `past_due` (backstop, in case a
  webhook is lost), the workspace drops to Free and (e) applies. Paying later starts a new subscription.
- A failed overage charge gets the same 7 days; until it is paid, overage is switched off for the workspace.
- Cancellation by the owner is not a failure: the plan runs to the end of the paid period, then Free.

### (g) Beta workspaces

- Billing goes live on a **launch date** announced at least **30 days** ahead by email and on the pricing page. Until
  then nothing changes.
- At launch every beta workspace is placed on the **plan that covers its last 30 days of use** (replies by the weights
  above, websites, pages, model tier), free of charge for **60 days**, with no card. The dashboard shows the plan, the
  end date and what Free would mean for this workspace.
- A beta workspace that subscribes before its 60 days end gets **30% off its first 12 months** (a Paddle discount
  restricted to beta workspaces), on any paid plan and interval.
- At the end of the 60 days a workspace without a subscription moves to Free under (e): nothing is deleted.
- Usage counted during the beta is not billed; quota counting starts at launch.

### Adapter and data

```ts
interface BillingProvider {
  id: "paddle" | "iyzico";
  checkoutUrl(input: { organizationId: string; plan: PaidPlan; interval: "month" | "year"; discount?: string }): Promise<string>;
  changePlan(sub: SubscriptionRef, plan: PaidPlan, interval: "month" | "year"): Promise<void>; // up: now, down: period end
  cancel(sub: SubscriptionRef): Promise<void>;                                                  // at period end
  chargeOverage(sub: SubscriptionRef, blocks: number, windowId: string): Promise<void>;          // idempotent per window
  portalUrl(sub: SubscriptionRef): Promise<string>;                                              // payment method, invoices
  parseWebhook(req: Request): Promise<BillingEvent | null>;                                      // verifies the signature
}
```

- `BillingEvent` is our own normalised type (`subscription.activated | renewed | changed | past_due | canceled`,
  `payment.succeeded | failed`). Plan, quota and grace logic read only these and our tables, never provider payloads.
- Webhooks are verified (Paddle's `Paddle-Signature` HMAC), stored by event id before processing (idempotent, replayable
  from the admin area) and processed in a transaction that writes `app.organizations.plan`.
- New tables: `app.subscriptions` (organization, provider, provider subscription and customer ids, plan, interval,
  status, period start/end, `grace_until`, scheduled change, overage on/cap), `app.usage_windows` (organization, window
  start/end, used fifths, overage blocks opened, overage charged at) and `app.billing_events`. All under the same row
  level security as the rest of `app.*`; only the owner role changes billing.
- The usage counter is incremented in the same place the daily token count is recorded, after the answer is delivered,
  and checked before the model call. Like `TokenBudget`, the in-process check is a shortcut until the API runs on more
  than one instance; Postgres holds the authoritative count, and a few replies over the line at a window's edge are
  accepted, never billed.
- Implemented in the chat API (2026-10-20): `ReplyQuota` in `apps/api/src/limits.ts`, `addReplyUsage` and
  `listWorkspaceQuotas` in `packages/db/src/billing.ts`, `replyWindow` in `plans.ts`, `replyFifths` in
  `bot-settings.ts`. A refused request answers `quota_exhausted`; enforcement waits behind the `reply_quota` flag
  until the launch date (g), while counting runs from now on (not billed, per (g)).

## Alternatives not chosen

- **Stripe.** The obvious choice technically, but Stripe does not accept companies registered in Turkey. Using it would
  mean a foreign entity (e.g. Stripe Atlas) and its accounting, and Stripe is not a merchant of record: VAT/OSS, US sales
  tax and invoices would still be ours (Stripe Tax computes, it doesn't file or carry the liability).
- **Lemon Squeezy.** A merchant of record with a simple API, but it was acquired by Stripe and is being folded into
  Stripe's own MoR offering; building on a product in transition, with the same uncertainty about Turkish sellers once it
  moves, is the risk we'd be taking. Paddle is independent and accepts Turkish companies today.
- **iyzico / PayTR (alone).** Good for Turkish cards and TRY, and cheaper per transaction, but they are payment
  processors, not merchants of record: every foreign sale would be ours to tax (EU VAT via OSS or per-country
  registration, other countries' digital-service taxes) and to invoice, alongside Turkish e-Arşiv/e-Fatura and the export
  rules for services. That load is what this decision avoids. iyzico stays the candidate for a **second adapter for
  TRY-paying Turkish customers**, where we are the seller anyway and the tax is domestic.
- **Pure usage pricing (per message or per token).** Hard for a small business to predict and to compare; plans with
  an included allowance and opt-in, capped overage give the predictability the pricing page promises.

## Consequences

- Paddle's fee (5% + $0.50 per transaction at the time of writing) is part of the cost; the $24 annual Starter is the
  plan where it weighs most. Recheck margins with it included.
- Prices are in USD; Paddle may show localized prices, but the USD price is the reference.
- Customers see Paddle on their card statements and invoices; the checkout, terms and privacy notice must say Paddle is
  the reseller.
- Quota enforcement changes the chat path: a regression there either gives away replies or blocks paying customers, so
  it needs the same unit and integration tests as the daily budget (window rollover, weights, fallback model, overage
  cap, grace).

## Revisit when

- Turkish customers ask to pay in TRY or by bank transfer: add the iyzico adapter.
- Model prices move enough that a weight or a plan's allowance breaks the margin rule.
- Paddle's terms for Turkish sellers, its fees or its payout options change.
