-- Platform controls run from the admin area: inviting people off the waitlist, announcement and
-- maintenance banners, and (in app.platform_settings, no schema change) the sign-up mode and
-- feature flags.

-- Staff invite waitlist entries by email (/admin/waitlist). While sign-ups are invite-only, an
-- invited address may sign up; the row stays so the list shows who was invited and who joined.
alter table app.waitlist
  add column invited_at   timestamptz,
  add column invited_by   uuid references app.users (id) on delete set null,
  add column invite_count int not null default 0 check (invite_count >= 0);
create index waitlist_created_at_idx on app.waitlist (created_at);

-- A banner above the dashboard and, for announcements to everyone, optionally on the public site.
-- `message` holds the text per language ({"en": "...", "tr": "..."}); English is required and is
-- what a language without its own text falls back to. Viewers can close a dismissible banner.
create table app.announcements (
  id               uuid primary key default gen_random_uuid(),
  level            text not null default 'info' check (level in ('info', 'warn', 'critical')),
  message          jsonb not null check (jsonb_typeof(message) = 'object' and message ? 'en'),
  starts_at        timestamptz not null default now(),
  -- null: shown until someone ends it
  ends_at          timestamptz check (ends_at is null or ends_at > starts_at),
  audience         text not null default 'all' check (audience in ('all', 'plan', 'workspace')),
  plans            text[] not null default '{}',
  organization_ids uuid[] not null default '{}',
  marketing        boolean not null default false,
  dismissible      boolean not null default true,
  created_by       uuid references app.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (audience <> 'plan' or cardinality(plans) > 0),
  check (audience <> 'workspace' or cardinality(organization_ids) > 0),
  -- the public site has no signed-in workspace to narrow by
  check (not marketing or audience = 'all')
);
create index announcements_window_idx on app.announcements (starts_at, ends_at);
create trigger announcements_set_updated_at before update on app.announcements
  for each row execute function app.set_updated_at();

alter table app.announcements enable row level security;
