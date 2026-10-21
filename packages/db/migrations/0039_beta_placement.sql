-- Moving the beta workspaces onto plans at launch (docs/adr/0003-billing.md (g)). The placement
-- script (npm run billing:beta-placement) grants each one a paid plan for a fixed time as an override
-- of kind 'beta'; staff comps stay 'comp'. The kind decides who gets the beta reminders below and,
-- later, the beta discount at checkout.

-- what the override is: a comp staff granted by hand, or a beta workspace's placement at launch
alter table app.plan_overrides add column kind text not null default 'comp' check (kind in ('comp', 'beta'));
-- a workspace gets one beta placement; running the script again skips it
create unique index plan_overrides_one_beta_idx on app.plan_overrides (organization_id) where kind = 'beta';

-- the owners hear 30 and 7 days before a beta placement ends; the period is the override's id
alter table app.billing_notices drop constraint billing_notices_kind_check;
alter table app.billing_notices add constraint billing_notices_kind_check check (kind in (
  'payment_failed', 'grace_reminder', 'grace_last_call', 'downgraded',
  'subscription_started', 'subscription_renewed', 'cancel_confirmed',
  'quota_80', 'quota_100',
  'beta_ending_30', 'beta_ending_7'));
