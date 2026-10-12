-- Accounts, sessions and email verification for register / log in.
--
-- Plain PostgreSQL 13+ only: no Supabase Auth, no extensions, no auth.* schema.
-- The same file runs unchanged on Supabase and on a self-hosted server.
-- Everything lives in the "app" schema: Supabase only exposes "public" over its
-- REST API, and RLS (enabled below, no policies) denies every role except the
-- table owner that the server connects as.

create schema if not exists app;

create or replace function app.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create table app.users (
  id                uuid primary key default gen_random_uuid(),
  -- stored lowercased, so a plain unique constraint is case-insensitive
  email             text not null unique
                    check (email = lower(email) and length(email) <= 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  username          text not null
                    check (username ~ '^[A-Za-z0-9_.-]{3,32}$'),
  -- "scrypt$<logN>$<r>$<p>$<salt>$<hash>"; null for Google/GitHub-only accounts
  password_hash     text,
  account_type      text not null check (account_type in ('personal', 'business')),
  email_verified_at timestamptz,
  terms_accepted_at timestamptz not null,
  terms_version     text not null,
  allow_training    boolean not null default false,
  last_login_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index users_username_lower_key on app.users (lower(username));
create trigger users_set_updated_at before update on app.users
  for each row execute function app.set_updated_at();

-- Workspace that will own bots/tenants. Every account gets one at sign-up;
-- business accounts carry the company name and size from the register form.
create table app.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) between 1 and 120),
  size       text check (size in ('1-50', '51-200', '201-1000', '1000+')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_set_updated_at before update on app.organizations
  for each row execute function app.set_updated_at();

create table app.organization_members (
  organization_id uuid not null references app.organizations (id) on delete cascade,
  user_id         uuid not null references app.users (id) on delete cascade,
  role            text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_id_idx on app.organization_members (user_id);

-- Opaque session tokens: the cookie holds the token, the table only its SHA-256.
create table app.sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references app.users (id) on delete cascade,
  token_hash   bytea not null unique,
  -- "Keep me signed in": persistent cookie and the long lifetime
  persistent   boolean not null default false,
  expires_at   timestamptz not null,
  ip           inet,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index sessions_user_id_idx on app.sessions (user_id);
create index sessions_expires_at_idx on app.sessions (expires_at);

-- Short-lived 6-digit codes (email verification now, password reset later).
create table app.verification_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app.users (id) on delete cascade,
  purpose     text not null check (purpose in ('email_verify', 'password_reset')),
  -- the address the code was sent to; verifying it may change users.email
  email       text not null,
  code_hash   bytea not null,
  attempts    smallint not null default 0,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
-- at most one live code per user and purpose; issuing a new one consumes the old
create unique index verification_codes_live_key on app.verification_codes (user_id, purpose)
  where consumed_at is null;

-- "Sign up with Google / GitHub" links. Table is ready; the OAuth flow is not wired yet.
create table app.oauth_accounts (
  provider            text not null check (provider in ('google', 'github')),
  provider_account_id text not null,
  user_id             uuid not null references app.users (id) on delete cascade,
  email               text,
  created_at          timestamptz not null default now(),
  primary key (provider, provider_account_id)
);
create index oauth_accounts_user_id_idx on app.oauth_accounts (user_id);

-- Security log; failed log-ins are also counted here for throttling.
create table app.auth_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references app.users (id) on delete set null,
  email      text,
  event      text not null check (event in (
               'register', 'login', 'login_failed', 'logout',
               'code_sent', 'email_verified', 'verify_failed')),
  ip         inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index auth_events_failed_email_idx on app.auth_events (email, created_at)
  where event = 'login_failed';
create index auth_events_failed_ip_idx on app.auth_events (ip, created_at)
  where event = 'login_failed';
create index auth_events_user_id_idx on app.auth_events (user_id);

alter table app.users                enable row level security;
alter table app.organizations        enable row level security;
alter table app.organization_members enable row level security;
alter table app.sessions             enable row level security;
alter table app.verification_codes   enable row level security;
alter table app.oauth_accounts       enable row level security;
alter table app.auth_events          enable row level security;

-- Supabase's API roles: make sure they can't reach the schema even if granted later
-- by a dashboard click. The roles don't exist on a plain server, hence the guard.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on schema app from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on schema app from authenticated;
  end if;
end
$$;
