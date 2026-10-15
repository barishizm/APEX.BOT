-- What a bot answers from. A source is a website (crawled) or a pasted text; its chunks are
-- what retrieval searches. Every chunk carries bot_id, so a query can't cross tenants.

create table app.knowledge_sources (
  id          uuid primary key default gen_random_uuid(),
  bot_id      uuid not null references app.bots (id) on delete cascade,
  kind        text not null check (kind in ('website', 'text')),
  title       text not null check (length(title) between 1 and 200),
  -- website: the address to start from; text: null
  url         text check (url is null or length(url) <= 2048),
  -- text: the pasted content; website: null
  content     text check (content is null or length(content) <= 100000),
  status      text not null default 'pending' check (status in ('pending', 'syncing', 'ready', 'failed')),
  error       text,
  pages       integer not null default 0,
  chunks      integer not null default 0,
  created_by  uuid references app.users (id) on delete set null,
  synced_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((kind = 'website' and url is not null) or (kind = 'text' and content is not null))
);
create index knowledge_sources_bot_id_idx on app.knowledge_sources (bot_id, created_at);
create trigger knowledge_sources_set_updated_at before update on app.knowledge_sources
  for each row execute function app.set_updated_at();

create table app.knowledge_chunks (
  id        bigint generated always as identity primary key,
  source_id uuid not null references app.knowledge_sources (id) on delete cascade,
  bot_id    uuid not null references app.bots (id) on delete cascade,
  url       text not null,
  title     text not null,
  text      text not null,
  position  integer not null
);
create index knowledge_chunks_bot_id_idx on app.knowledge_chunks (bot_id, source_id, position);

-- Bumped whenever a bot's chunks change, so the chat API reloads them (and only them).
alter table app.bots add column knowledge_version integer not null default 0;

alter table app.knowledge_sources enable row level security;
alter table app.knowledge_chunks  enable row level security;
