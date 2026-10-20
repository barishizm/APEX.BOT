-- Billing (docs/adr/0003-billing.md): the payment provider's customers and subscriptions, an inbox of
-- its webhooks, AI reply usage per monthly window, plans staff grant for free, and the owner's
-- overage settings.
--
-- app.organizations.plan stays the column everything else reads (limits, models, retention). From
-- here on it is a cache of the *effective* plan, never the source of it. It is computed from:
--   1. the subscription: trialing and active grant its plan; past_due grants it until grace_until
--      (7 days after the first failed payment); paused and canceled grant nothing; a subscription
--      set to cancel at period end grants nothing once current_period_end has passed;
--   2. plan overrides that are running (starts_at <= now < ends_at, not revoked);
--   3. Free.
-- The highest of these wins. Whatever writes a subscription or an override recomputes the plan and
-- updates app.organizations.plan in the same transaction (refreshEffectivePlan in
-- packages/db/src/billing.ts), so the cache never disagrees with a committed subscription. Rules
-- that turn on time alone (grace or an override running out) are applied by a periodic recompute.
-- A workspace with neither a subscription nor an override keeps the plan it has: those are beta
-- workspaces placed on a plan by hand, and the recompute leaves them alone.

-- The provider's customer record for a workspace. One per workspace, created at its first checkout.
create table app.billing_customers (
  -- the workspace that pays
  organization_id      uuid primary key references app.organizations (id) on delete cascade,
  -- which BillingProvider adapter the ids below belong to
  provider             text not null check (provider in ('paddle', 'iyzico')),
  -- the provider's customer id (Paddle: ctm_...)
  provider_customer_id text not null unique check (length(provider_customer_id) between 1 and 200),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger billing_customers_set_updated_at before update on app.billing_customers
  for each row execute function app.set_updated_at();

-- A workspace's paid subscription, as last reported by the provider. Free never has one. A workspace
-- has at most one row: paying again after a cancellation replaces it with the new subscription.
create table app.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  -- the workspace the subscription pays for
  organization_id          uuid not null unique references app.organizations (id) on delete cascade,
  -- which BillingProvider adapter manages it
  provider                 text not null check (provider in ('paddle', 'iyzico')),
  -- the provider's subscription id (Paddle: sub_...)
  provider_subscription_id text not null unique check (length(provider_subscription_id) between 1 and 200),
  -- the paid plan it is for; never 'free'
  plan                     text not null check (plan in ('starter', 'pro', 'business')),
  -- how often it renews; quota windows are monthly either way (ADR 0003 (b))
  "interval"               text not null check ("interval" in ('month', 'year')),
  -- the provider's status, normalised; see the top of this file for what each one grants
  status                   text not null check (status in ('trialing', 'active', 'past_due', 'paused', 'canceled')),
  -- the paid period running now; its start is the billing anchor quota windows count from
  current_period_start     timestamptz not null,
  current_period_end       timestamptz not null,
  -- the owner canceled: the plan runs to current_period_end, then the workspace drops to Free
  cancel_at_period_end     boolean not null default false,
  -- a change the provider will apply at the period end (a downgrade, a cancellation, a pause):
  -- {"action": "change" | "cancel" | "pause", "plan"?: ..., "interval"?: ..., "effective_at": ...}
  scheduled_change         jsonb check (scheduled_change is null or jsonb_typeof(scheduled_change) = 'object'),
  -- while past_due: the end of the 7-day grace (ADR 0003 (f)), set when the first payment fails
  -- and cleared when the subscription leaves past_due
  grace_until              timestamptz,
  -- when the provider last changed the subscription (Paddle: the event's occurred_at). Webhooks can
  -- arrive out of order or twice; an update older than or as old as this one is ignored.
  provider_updated_at      timestamptz not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (current_period_end > current_period_start),
  check (status <> 'past_due' or grace_until is not null)
);
create trigger subscriptions_set_updated_at before update on app.subscriptions
  for each row execute function app.set_updated_at();

-- Webhooks from the provider, stored before they are processed so that each is handled once and a
-- failed one can be replayed from the admin area.
create table app.billing_events (
  id           bigint generated always as identity primary key,
  -- the adapter that received it
  provider     text not null check (provider in ('paddle', 'iyzico')),
  -- the provider's own event id (Paddle: evt_...); a webhook delivered again carries the same one
  event_id     text not null check (length(event_id) between 1 and 200),
  -- the provider's event name, as sent (Paddle: subscription.updated, transaction.payment_failed, ...)
  event_type   text not null check (length(event_type) between 1 and 200),
  -- when the provider says it happened, not when it reached us
  occurred_at  timestamptz not null,
  -- the verified body, kept for replays and support; plan logic never reads it directly
  payload      jsonb not null,
  -- when it reached us
  received_at  timestamptz not null default now(),
  -- set once it has been applied (or found to need nothing); null while it waits or keeps failing
  processed_at timestamptz,
  -- the last processing error, cleared when it succeeds
  error        text check (error is null or length(error) <= 5000),
  -- how many times processing was started
  attempts     int not null default 0 check (attempts >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (provider, event_id)
);
create index billing_events_pending_idx on app.billing_events (received_at) where processed_at is null;
create trigger billing_events_set_updated_at before update on app.billing_events
  for each row execute function app.set_updated_at();

-- AI replies a workspace used in one monthly window (ADR 0003 (b)). Shared by all its bots.
create table app.reply_usage (
  -- the workspace whose quota it counts against
  organization_id   uuid not null references app.organizations (id) on delete cascade,
  -- the window's start: the subscription's billing anchor for paid plans, the 1st 00:00 UTC on Free
  period_start      timestamptz not null,
  -- replies used, in standard-model replies (fast model ⅕, Opus 2, Fable 5). Always a whole number
  -- of fifths, which one decimal holds exactly.
  units             numeric(12, 1) not null default 0 check (units >= 0 and units * 5 = trunc(units * 5)),
  -- of those, the replies past the plan's allowance, used under overage
  overage_units     numeric(12, 1) not null default 0 check (overage_units >= 0 and overage_units <= units and overage_units * 5 = trunc(overage_units * 5)),
  -- when the window's overage was charged; set once, so a window is never charged twice
  overage_billed_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (organization_id, period_start)
);
create trigger reply_usage_set_updated_at before update on app.reply_usage
  for each row execute function app.set_updated_at();

-- A paid plan staff grant a workspace for free (a comp: a partner, a refund in kind, a beta
-- placement), for a fixed time. It counts toward the effective plan while it runs.
create table app.plan_overrides (
  id              uuid primary key default gen_random_uuid(),
  -- the workspace that gets the plan
  organization_id uuid not null references app.organizations (id) on delete cascade,
  -- the plan granted; Free needs no override
  plan            text not null check (plan in ('starter', 'pro', 'business')),
  -- why it was granted; shown to staff, not to the workspace
  reason          text not null check (length(reason) between 1 and 1000),
  -- when it starts counting
  starts_at       timestamptz not null default now(),
  -- when it stops; every comp ends, so this is required
  ends_at         timestamptz not null,
  -- the staff member who granted it; null once their account is deleted
  granted_by      uuid references app.users (id) on delete set null,
  -- ended early by staff; the row stays as history
  revoked_at      timestamptz,
  revoked_by      uuid references app.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index plan_overrides_organization_idx on app.plan_overrides (organization_id, ends_at);
create trigger plan_overrides_set_updated_at before update on app.plan_overrides
  for each row execute function app.set_updated_at();

alter table app.organizations
  -- the owner allows paid replies past the monthly allowance (paid plans only, ADR 0003 (c))
  add column overage_enabled   boolean not null default false,
  -- the most overage replies a window may use: the owner's dollar cap in blocks of 100 replies ($5 each)
  add column overage_cap_units int check (overage_cap_units is null or (overage_cap_units > 0 and overage_cap_units % 100 = 0)),
  add constraint organizations_overage_cap_check check (not overage_enabled or overage_cap_units is not null);

alter table app.billing_customers enable row level security;
alter table app.subscriptions     enable row level security;
alter table app.billing_events    enable row level security;
alter table app.reply_usage       enable row level security;
alter table app.plan_overrides    enable row level security;
