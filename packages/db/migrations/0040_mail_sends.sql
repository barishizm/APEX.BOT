-- Append-only record of mail the platform sends to addresses a customer chose (workspace invitations,
-- hand-off confirmation codes). The daily caps count here instead of in rows that revoking an
-- invitation or deleting a website removes, so create-send-delete loops can't reset them.
-- scope is the workspace id on purpose without a foreign key: deleting things must not erase the count.
create table app.mail_sends (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('invite', 'handoff_code')),
  scope      uuid not null,
  created_at timestamptz not null default now()
);
create index mail_sends_scope_idx on app.mail_sends (kind, scope, created_at);

alter table app.mail_sends enable row level security;
