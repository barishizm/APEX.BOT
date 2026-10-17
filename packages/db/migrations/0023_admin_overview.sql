-- The admin overview (/admin): platform-wide counts by time range and the "needs attention" list.
-- Every query there filters on these columns across all tenants, which the per-bot indexes
-- (leading with bot_id) can't serve. Also the support-ticket table the overview and the
-- support section read.

create index users_created_at_idx         on app.users (created_at);
create index users_unverified_idx         on app.users (created_at) where email_verified_at is null;
create index organizations_created_at_idx on app.organizations (created_at);
create index conversations_created_at_idx on app.conversations (created_at);
create index messages_created_at_idx      on app.messages (created_at);
create index token_usage_day_idx          on app.token_usage (day);
create index bot_activity_widget_seen_idx on app.bot_activity (widget_seen_at);
create index knowledge_sources_failed_idx on app.knowledge_sources (updated_at desc) where status = 'failed';
-- the existing login_failed indexes lead with email / ip; this one serves "the last 24 hours"
create index auth_events_failed_created_idx on app.auth_events (created_at) where event = 'login_failed';

-- Support requests from customers. Staff answer them in /admin/support; sla_due_at is when the
-- first answer is owed, set by whoever opens the ticket.
create table app.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references app.organizations (id) on delete set null,
  requester_id    uuid references app.users (id) on delete set null,
  subject         text not null check (length(subject) between 1 and 200),
  status          text not null default 'open' check (status in ('open', 'pending', 'closed')),
  sla_due_at      timestamptz,
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((status = 'closed') = (closed_at is not null))
);
create index support_tickets_open_idx on app.support_tickets (sla_due_at) where status <> 'closed';
create index support_tickets_organization_idx on app.support_tickets (organization_id, created_at);
create trigger support_tickets_set_updated_at before update on app.support_tickets
  for each row execute function app.set_updated_at();

alter table app.support_tickets enable row level security;
