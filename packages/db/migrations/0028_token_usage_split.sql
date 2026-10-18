-- Input and output tokens apart, so /admin/usage can price them at their own rates. `tokens`
-- stays the total the daily budget reads. Rows counted before this migration (or by an API
-- that predates it) have input_tokens + output_tokens < tokens; that remainder is split at an
-- assumed ratio and shown as an estimate.
alter table app.token_usage
  add column input_tokens  bigint not null default 0 check (input_tokens >= 0),
  add column output_tokens bigint not null default 0 check (output_tokens >= 0);
