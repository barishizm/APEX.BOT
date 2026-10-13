-- Chatbots. One per workspace for now; settings is the BotSettings document from
-- src/bot-settings.ts, validated by the app before every write (so new settings
-- don't need a migration). site_key is public: it goes in the embed snippet.

create table app.bots (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references app.organizations (id) on delete cascade,
  site_key        text not null unique check (site_key ~ '^apex_pk_[A-Za-z0-9]{16,64}$'),
  settings        jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  -- bumped on every save so the chat API can pick up changes incrementally
  version         integer not null default 1,
  updated_by      uuid references app.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index bots_updated_at_idx on app.bots (updated_at);
create trigger bots_set_updated_at before update on app.bots
  for each row execute function app.set_updated_at();

alter table app.bots enable row level security;
