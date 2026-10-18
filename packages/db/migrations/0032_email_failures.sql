-- Mail the provider (Resend) refused or never got, from the dashboard and the chat API, so staff can
-- see on /admin/system that sign-up codes or hand-off notices aren't going out. Nothing personal is
-- kept: the recipient is stored masked (a***@e***.com) and the error with emails, phone numbers and
-- card numbers replaced. Rows older than 30 days are pruned on insert.
create table app.email_failures (
  id         bigint generated always as identity primary key,
  source     text not null check (source in ('web', 'api')),
  -- which mail it was (verification, handoff, …), never its subject: subjects can carry codes
  kind       text not null check (kind ~ '^[a-z0-9_.-]{1,60}$'),
  recipient  text not null check (length(recipient) <= 200),
  -- the provider's HTTP status; null when it couldn't be reached or isn't configured
  status     int,
  error      text check (error is null or length(error) <= 500),
  created_at timestamptz not null default now()
);
create index email_failures_created_at_idx on app.email_failures (created_at desc);

alter table app.email_failures enable row level security;
