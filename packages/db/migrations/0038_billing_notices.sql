-- Billing emails to workspace owners and the end of a failed payment's grace (docs/adr/0003-billing.md
-- (c), (f)). /api/cron/billing-notices runs daily: it first moves every workspace whose grace ran out
-- to Free (expireGrace, recorded in grace_expired_at), then sends the emails that are due. Each email
-- goes out once per workspace, kind and period (app.billing_notices); the period names what it is
-- about: a subscription, one of its billing periods, a grace, or a reply window.

-- set by expireGrace when the grace of a past_due subscription ran out; cleared when it leaves past_due
alter table app.subscriptions add column grace_expired_at timestamptz;

-- the language the user last used the dashboard in, for mail sent without a request (the cron)
alter table app.users add column locale text check (locale is null or locale in ('en', 'tr', 'lt', 'lv', 'et'));

create table app.billing_notices (
  organization_id uuid not null references app.organizations (id) on delete cascade,
  kind            text not null check (kind in (
                    'payment_failed', 'grace_reminder', 'grace_last_call', 'downgraded',
                    'subscription_started', 'subscription_renewed', 'cancel_confirmed',
                    'quota_80', 'quota_100')),
  period          text not null check (length(period) between 1 and 300),
  -- owners it reached; 0 for a notice recorded without an email (see below, and claimed alongside another)
  recipients      int not null default 0 check (recipients >= 0),
  sent_at         timestamptz not null default now(),
  primary key (organization_id, kind, period)
);

alter table app.billing_notices enable row level security;

-- what happened before these emails existed isn't announced now
insert into app.billing_notices (organization_id, kind, period)
  select organization_id, 'subscription_started', provider_subscription_id from app.subscriptions
  union all
  select organization_id, 'cancel_confirmed', provider_subscription_id from app.subscriptions
   where cancel_at_period_end or scheduled_change ->> 'action' = 'cancel'
  union all
  select s.organization_id, 'downgraded', s.provider_subscription_id
    from app.subscriptions s join app.organizations o on o.id = s.organization_id
   where o.plan = 'free';
