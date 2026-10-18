-- Support tickets: customers report a problem from the dashboard (/dashboard/support), staff work
-- the queue in the admin area (/admin/support).
--
-- A ticket belongs to the workspace it was filed from and, when the customer was looking at one,
-- to a site. `number` is what people quote ("#1042"), also as the ticket number when staff open
-- support access to the site's conversations. `context` is what the dashboard attached on its own
-- (page, browser, the last error it saw), shown to staff only as reported data.
--
-- sla_due_at is when staff owe the customer an answer: set when the customer writes and nobody has
-- answered yet, cleared by a staff reply or when the ticket waits on the customer or is done.
--
-- 0023 created a placeholder support_tickets table that nothing ever wrote to. It is replaced; should
-- it hold rows after all, the migration stops rather than drop them.

do $$
begin
  if exists (select 1 from app.support_tickets) then
    raise exception 'app.support_tickets has rows; move them to the new layout by hand before running 0030';
  end if;
end $$;
drop table app.support_tickets;

create table app.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  number          bigint generated always as identity (start with 1001) unique,
  organization_id uuid not null references app.organizations (id) on delete cascade,
  -- who filed it; the ticket outlives a deleted account so the history stays readable
  user_id         uuid references app.users (id) on delete set null,
  bot_id          uuid references app.bots (id) on delete set null,
  subject         text not null check (length(subject) between 1 and 200),
  category        text not null check (category in ('bug', 'billing', 'knowledge', 'widget', 'account', 'other')),
  priority        text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status          text not null default 'open' check (status in ('open', 'pending_user', 'in_progress', 'resolved', 'closed')),
  assignee_id     uuid references app.users (id) on delete set null,
  sla_due_at      timestamptz,
  -- the language the customer wrote in; emails to them use it
  locale          text not null default 'en' check (locale in ('en', 'tr', 'lt', 'lv', 'et')),
  context         jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index support_tickets_user_idx on app.support_tickets (user_id, updated_at desc);
create index support_tickets_status_idx on app.support_tickets (status, updated_at desc);
create index support_tickets_assignee_idx on app.support_tickets (assignee_id) where assignee_id is not null;
create index support_tickets_sla_idx on app.support_tickets (sla_due_at) where sla_due_at is not null;
create trigger support_tickets_set_updated_at before update on app.support_tickets
  for each row execute function app.set_updated_at();

create table app.support_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references app.support_tickets (id) on delete cascade,
  author_id   uuid references app.users (id) on delete set null,
  -- written by platform staff; kept on the row since a role can be taken away later
  from_staff  boolean not null default false,
  body        text not null check (length(body) between 1 and 10000),
  -- staff-only note: never shown to the customer, never emailed
  internal    boolean not null default false,
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  created_at  timestamptz not null default now(),
  check (not internal or from_staff)
);
create index support_messages_ticket_idx on app.support_messages (ticket_id, created_at);

alter table app.support_tickets  enable row level security;
alter table app.support_messages enable row level security;
