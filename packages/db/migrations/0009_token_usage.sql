-- Tokens the chat API spent per bot per UTC day, so the daily budget survives API restarts
-- and holds across instances.

create table app.token_usage (
  bot_id uuid not null references app.bots (id) on delete cascade,
  day    date not null,
  tokens bigint not null default 0,
  primary key (bot_id, day)
);

alter table app.token_usage enable row level security;
