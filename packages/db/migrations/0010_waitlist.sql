-- Emails collected while sign-ups are closed, so everyone on the list can be told once they open.

create table app.waitlist (
  id         uuid primary key default gen_random_uuid(),
  -- stored lowercased, so a plain unique constraint is case-insensitive
  email      text not null unique
             check (email = lower(email) and length(email) <= 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  locale     text not null default 'en',
  created_at timestamptz not null default now()
);

alter table app.waitlist enable row level security;
