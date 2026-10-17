-- Guards for the admin area: a recent second-factor check per session ("step-up") and a
-- fixed-window request counter for rate limits that must hold across serverless instances.

-- When this session last confirmed an authenticator code. Destructive staff actions need it
-- to be recent (see STEP_UP_TTL_MS); signing in with a code counts.
alter table app.sessions add column step_up_at timestamptz;

-- One row per key and window; older windows of a key are deleted as new ones start.
create table app.rate_limits (
  key          text not null check (length(key) between 1 and 200),
  window_start timestamptz not null,
  hits         integer not null default 1,
  primary key (key, window_start)
);

alter table app.rate_limits enable row level security;
