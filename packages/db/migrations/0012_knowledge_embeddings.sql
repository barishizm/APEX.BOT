-- Embeddings of knowledge chunks for semantic search (docs/adr/0002-hybrid-retrieval.md).
-- Keyed by a hash of the embedded text, not by chunk: a website sync deletes and re-inserts every
-- chunk, and the pages that didn't change keep their vectors instead of being embedded again.
-- The chat API computes them in the background and searches them in memory, so this is plain
-- PostgreSQL (no pgvector): the vector is float32 little-endian bytes, L2-normalised.

create table app.knowledge_embeddings (
  bot_id     uuid not null references app.bots (id) on delete cascade,
  -- "provider:model@dims"; vectors from different models are never compared
  model      text not null check (length(model) between 1 and 100),
  -- sha256 of the embedded text (chunk title + text)
  hash       bytea not null check (length(hash) = 32),
  vector     bytea not null check (length(vector) between 4 and 16384),
  created_at timestamptz not null default now(),
  primary key (bot_id, model, hash)
);

alter table app.knowledge_embeddings enable row level security;
