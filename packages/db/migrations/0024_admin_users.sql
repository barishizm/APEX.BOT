-- The admin user detail page (/admin/users/[id]): notes staff keep on an account, and the
-- indexes its lists read. Notes are internal; the user never sees them.
create table app.admin_user_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app.users (id) on delete cascade,
  -- null once the staff account is deleted; the note itself stays
  author_id  uuid references app.users (id) on delete set null,
  body       text not null check (length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index admin_user_notes_user_idx on app.admin_user_notes (user_id, created_at desc);

-- "Recent auth events" on the detail page; the existing index on user_id alone can't order them
create index auth_events_user_created_idx on app.auth_events (user_id, created_at desc);

alter table app.admin_user_notes enable row level security;
