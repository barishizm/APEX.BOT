-- Platform administration: staff roles, suspending accounts/workspaces/bots, an audit log of
-- every staff action, and platform-wide settings (feature flags).

-- Staff of the platform itself, unrelated to workspace roles. Null for every customer.
-- 'superadmin' is only ever set by the one-time bootstrap (npm run admin:bootstrap), never from the UI.
alter table app.users
  add column platform_role    text check (platform_role in ('superadmin', 'support')),
  -- a suspended user can't sign in; the reason is shown to staff, not to the user
  add column suspended_at     timestamptz,
  add column suspended_reason text check (suspended_reason is null or length(suspended_reason) <= 1000);
create index users_platform_role_idx on app.users (platform_role) where platform_role is not null;

alter table app.organizations
  add column suspended_at     timestamptz,
  add column suspended_reason text check (suspended_reason is null or length(suspended_reason) <= 1000),
  -- internal note staff keep on a workspace; never shown to its members
  add column admin_note       text check (admin_note is null or length(admin_note) <= 5000);

-- A disabled bot answers nothing; its settings and knowledge stay as they are.
alter table app.bots
  add column disabled_at     timestamptz,
  add column disabled_reason text check (disabled_reason is null or length(disabled_reason) <= 1000);

-- Every action staff take, with the state before and after. Rows are only ever inserted.
create table app.admin_audit_log (
  id          bigint generated always as identity primary key,
  -- null once the staff account is deleted; the entry itself stays
  actor_id    uuid references app.users (id) on delete set null,
  action      text not null check (length(action) between 1 and 100),
  target_type text not null check (length(target_type) between 1 and 50),
  target_id   text check (length(target_id) <= 200),
  reason      text check (length(reason) <= 1000),
  before      jsonb,
  after       jsonb,
  ip          inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index admin_audit_log_target_idx on app.admin_audit_log (target_type, target_id);
create index admin_audit_log_created_at_idx on app.admin_audit_log (created_at);

-- Platform-wide settings, mainly feature flags, keyed by name.
create table app.platform_settings (
  key        text primary key check (key ~ '^[a-z0-9_.:-]{1,100}$'),
  value      jsonb not null,
  updated_by uuid references app.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger platform_settings_set_updated_at before update on app.platform_settings
  for each row execute function app.set_updated_at();

alter table app.admin_audit_log   enable row level security;
alter table app.platform_settings enable row level security;
