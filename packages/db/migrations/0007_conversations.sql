-- Widget conversations of dashboard bots, written by the chat API. Deleted automatically
-- after the bot's retention period; visitors can delete their own.

create table app.conversations (
  id               uuid primary key,
  bot_id           uuid not null references app.bots (id) on delete cascade,
  origin           text check (origin is null or length(origin) <= 300),
  -- first visitor message, for the list view
  preview          text not null default '',
  message_count    integer not null default 0,
  unanswered_count integer not null default 0,
  negative_count   integer not null default 0,
  visitor_email    text,
  visitor_name     text,
  visitor_phone    text,
  handoff_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index conversations_bot_updated_idx on app.conversations (bot_id, updated_at desc);

create table app.messages (
  id              uuid primary key,
  conversation_id uuid not null references app.conversations (id) on delete cascade,
  bot_id          uuid not null references app.bots (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  sources         jsonb not null default '[]'::jsonb,
  unanswered      boolean not null default false,
  feedback        text check (feedback in ('up', 'down')),
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on app.messages (conversation_id, created_at);

alter table app.conversations enable row level security;
alter table app.messages      enable row level security;
