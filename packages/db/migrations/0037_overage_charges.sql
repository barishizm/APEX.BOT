-- Charging overage (docs/adr/0003-billing.md (c)): /api/cron/billing-overage bills each closed reply
-- window's overage once, as a one-time charge on the subscription. What was billed, and why the last
-- attempt failed, are kept on the window: a failed window is retried on the next run and listed on
-- /admin/system until it is billed.
alter table app.reply_usage
  -- blocks of 100 replies billed; set with overage_billed_at
  add column overage_billed_blocks  int check (overage_billed_blocks is null or overage_billed_blocks >= 0),
  -- the provider's transaction for the charge, when it could be found (Paddle: txn_...)
  add column overage_transaction_id text check (overage_transaction_id is null or length(overage_transaction_id) between 1 and 200),
  -- why the last attempt didn't bill; cleared once billed
  add column overage_error          text check (overage_error is null or length(overage_error) <= 1000),
  -- how many runs tried to bill the window
  add column overage_attempts       int not null default 0 check (overage_attempts >= 0),
  add constraint reply_usage_overage_billed_check check (overage_billed_at is null or overage_billed_blocks is not null);

create index reply_usage_overage_unbilled_idx on app.reply_usage (period_start)
  where overage_units > 0 and overage_billed_at is null;
