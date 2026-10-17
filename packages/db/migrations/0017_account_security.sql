-- Two-step sign-in with an authenticator app, and team invitations.

-- The authenticator secret (base32). Set while setting up, live once totp_enabled_at is set.
-- totp_last_step is the last 30-second step a code was accepted for, so a code works once.
alter table app.users
  add column totp_secret     text check (totp_secret is null or totp_secret ~ '^[A-Z2-7]{32}$'),
  add column totp_enabled_at timestamptz,
  add column totp_last_step  bigint,
  -- the workspace the dashboard shows when the user belongs to several; null means the default
  add column active_organization_id uuid references app.organizations (id) on delete set null;

-- One-time backup codes for when the authenticator is lost. Only their SHA-256 is stored.
create table app.recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app.users (id) on delete cascade,
  code_hash  bytea not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index recovery_codes_user_id_idx on app.recovery_codes (user_id);

-- A password (or Google/GitHub) check passed, the second step hasn't yet. The browser holds the
-- token in a short-lived cookie; the session is only created once the code is right.
create table app.login_challenges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app.users (id) on delete cascade,
  token_hash bytea not null unique,
  persistent boolean not null,
  attempts   smallint not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index login_challenges_user_id_idx on app.login_challenges (user_id);

-- Invitations to join a workspace. The link carries the token; only its SHA-256 is stored.
create table app.organization_invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations (id) on delete cascade,
  email           text not null check (email = lower(email) and length(email) <= 254),
  role            text not null check (role in ('admin', 'member')),
  token_hash      bytea not null unique,
  invited_by      uuid references app.users (id) on delete set null,
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  created_at      timestamptz not null default now()
);
-- one open invitation per address and workspace; sending again replaces it
create unique index organization_invitations_open_key on app.organization_invitations (organization_id, email)
  where accepted_at is null;
create index organization_invitations_org_created_idx on app.organization_invitations (organization_id, created_at);

alter table app.auth_events drop constraint auth_events_event_check;
alter table app.auth_events add constraint auth_events_event_check check (event in (
  'register', 'login', 'login_failed', 'logout',
  'code_sent', 'email_verified', 'verify_failed',
  'reset_requested', 'reset_failed', 'password_reset', 'password_changed',
  'sessions_revoked', 'profile_updated', 'account_deleted',
  'two_factor_enabled', 'two_factor_disabled', 'two_factor_failed', 'recovery_codes_created'));

alter table app.recovery_codes           enable row level security;
alter table app.login_challenges         enable row level security;
alter table app.organization_invitations enable row level security;
