-- Analytics: reads a bot's messages by time range, and lets the dashboard close out
-- unanswered questions (answered into the knowledge base, or dismissed).

-- When an unanswered question was dealt with; null while it still needs an answer
alter table app.messages add column resolved_at timestamptz;

create index messages_bot_created_idx on app.messages (bot_id, created_at);
create index messages_open_unanswered_idx on app.messages (bot_id, created_at desc)
  where unanswered and resolved_at is null;

-- The text source "Add to knowledge base" appends answers to: at most one per bot. If the
-- customer deletes it, the next answer starts a new one.
alter table app.knowledge_sources add column managed boolean not null default false;
create unique index knowledge_sources_one_managed_idx on app.knowledge_sources (bot_id) where managed;
