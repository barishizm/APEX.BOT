-- Staff never see a customer's conversations by default. Two audited, short-lived exceptions:
--
-- Support access: a staff member opens a window on one bot, with a reason (and a ticket number when
-- there is one), to read its conversations for 60 minutes. The workspace owners get an email.
--
-- Impersonation: a superadmin views the app as a customer, read-only, for at most 30 minutes. It is a
-- session of its own, tied to the staff member's real session: ending either ends it, and the real
-- session is never changed.

create table app.support_access_grants (
  id         uuid primary key default gen_random_uuid(),
  bot_id     uuid not null references app.bots (id) on delete cascade,
  admin_id   uuid not null references app.users (id) on delete cascade,
  reason     text not null check (length(reason) between 1 and 1000),
  ticket_ref text check (ticket_ref is null or length(ticket_ref) between 1 and 100),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- closed early by the staff member
  ended_at   timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '60 minutes')
);
create index support_access_grants_admin_bot_idx on app.support_access_grants (admin_id, bot_id, expires_at desc);
create index support_access_grants_bot_idx on app.support_access_grants (bot_id);

create table app.impersonation_sessions (
  id               uuid primary key default gen_random_uuid(),
  token_hash       bytea not null unique,
  admin_id         uuid not null references app.users (id) on delete cascade,
  -- the staff member's own session; signing out of it ends the impersonation too
  admin_session_id uuid not null references app.sessions (id) on delete cascade,
  target_user_id   uuid not null references app.users (id) on delete cascade,
  reason           text not null check (length(reason) between 1 and 1000),
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  ended_at         timestamptz,
  check (admin_id <> target_user_id),
  check (expires_at > created_at and expires_at <= created_at + interval '30 minutes')
);
create index impersonation_sessions_admin_session_idx on app.impersonation_sessions (admin_session_id);
create index impersonation_sessions_target_idx on app.impersonation_sessions (target_user_id);

alter table app.support_access_grants  enable row level security;
alter table app.impersonation_sessions enable row level security;
