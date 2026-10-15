-- Hand-off addresses must be confirmed before the chat API will mail them. Without this, a
-- customer could point hand-offs at someone else's inbox and use apexbot.eu as the sender.
-- The address on the account (a verified workspace owner or admin) counts as confirmed.

alter table app.bots add column handoff_verified_email text;

-- Addresses that were already in use and belong to a verified owner/admin keep working
update app.bots b set handoff_verified_email = lower(b.settings -> 'handoff' ->> 'email')
 where exists (
   select 1
     from app.organization_members m
     join app.users u on u.id = m.user_id
    where m.organization_id = b.organization_id
      and m.role in ('owner', 'admin')
      and u.email_verified_at is not null
      and lower(u.email) = lower(b.settings -> 'handoff' ->> 'email'));

-- One pending confirmation per bot: the code goes to the address being confirmed
create table app.handoff_verifications (
  bot_id       uuid primary key references app.bots (id) on delete cascade,
  email        text not null,
  code_hash    bytea not null,
  attempts     smallint not null default 0,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  -- daily cap on codes sent for this bot, whatever the address
  window_start timestamptz not null default now(),
  sends        smallint not null default 1
);

alter table app.handoff_verifications enable row level security;
