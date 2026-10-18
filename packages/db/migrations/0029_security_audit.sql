-- /admin/security and /admin/audit: where a sign-in came from, staff blocks on an address or an
-- email, resets of the failed-attempt counters, and an audit log nobody can change afterwards.

-- Country of the request (ISO 3166-1 alpha-2) as the hosting edge reports it; null when unknown
-- and on every row from before this migration. 'access_blocked' is a request a block turned away.
alter table app.auth_events add column country text check (country is null or country ~ '^[A-Z]{2}$');
alter table app.auth_events drop constraint auth_events_event_check;
alter table app.auth_events add constraint auth_events_event_check check (event in (
  'register', 'login', 'login_failed', 'logout',
  'code_sent', 'email_verified', 'verify_failed',
  'reset_requested', 'reset_failed', 'password_reset', 'password_changed',
  'sessions_revoked', 'profile_updated', 'account_deleted',
  'two_factor_enabled', 'two_factor_disabled', 'two_factor_failed', 'recovery_codes_created',
  'access_blocked'));
-- the security feed reads newest first, the 24-hour panels by time
create index auth_events_created_at_idx on app.auth_events (created_at);
create index auth_events_event_created_idx on app.auth_events (event, created_at);

-- Temporary blocks staff put on an IP address (or a network, e.g. 203.0.113.0/24) or an email.
-- A blocked caller can't log in, sign up, ask for a password reset or finish a two-step sign-in.
-- Blocks always end: expires_at, or earlier when lifted.
create table app.auth_blocks (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('ip', 'email')),
  ip         inet,
  email      text check (email is null or (email = lower(email) and length(email) <= 254)),
  reason     text not null check (length(reason) between 1 and 1000),
  created_by uuid references app.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  lifted_at  timestamptz,
  lifted_by  uuid references app.users (id) on delete set null,
  check ((kind = 'ip') = (ip is not null) and (kind = 'email') = (email is not null)),
  check (expires_at > created_at and expires_at <= created_at + interval '90 days')
);
create index auth_blocks_ip_idx on app.auth_blocks using gist (ip inet_ops) where kind = 'ip' and lifted_at is null;
create index auth_blocks_email_idx on app.auth_blocks (email) where kind = 'email' and lifted_at is null;
create index auth_blocks_expires_idx on app.auth_blocks (expires_at);

-- "Reset the counters" for a locked-out user: failed attempts before the newest reset of their
-- email (or address) no longer count towards a lock. The events themselves stay in the log.
create table app.throttle_resets (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('ip', 'email')),
  ip         inet,
  email      text check (email is null or email = lower(email)),
  created_by uuid references app.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind = 'ip') = (ip is not null) and (kind = 'email') = (email is not null))
);
create index throttle_resets_email_idx on app.throttle_resets (email, created_at) where kind = 'email';
create index throttle_resets_ip_idx on app.throttle_resets (ip, created_at) where kind = 'ip';

-- The audit log is append-only. The foreign key to the actor goes: its "on delete set null" was an
-- update, and an entry must keep naming who acted after their account is deleted. actor_email is
-- the actor's address when the entry was written.
alter table app.admin_audit_log add column actor_email text;
update app.admin_audit_log l set actor_email = u.email from app.users u where u.id = l.actor_id;
alter table app.admin_audit_log drop constraint if exists admin_audit_log_actor_id_fkey;
create index admin_audit_log_actor_idx on app.admin_audit_log (actor_id, created_at);
create index admin_audit_log_action_idx on app.admin_audit_log (action);

create or replace function app.admin_audit_log_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'app.admin_audit_log is append-only: % is not allowed', tg_op
    using errcode = 'insufficient_privilege';
end
$$;
create trigger admin_audit_log_no_update before update or delete on app.admin_audit_log
  for each row execute function app.admin_audit_log_immutable();
create trigger admin_audit_log_no_truncate before truncate on app.admin_audit_log
  for each statement execute function app.admin_audit_log_immutable();

alter table app.auth_blocks     enable row level security;
alter table app.throttle_resets enable row level security;
