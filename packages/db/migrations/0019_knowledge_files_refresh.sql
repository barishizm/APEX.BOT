-- Uploaded files (PDF, Word, plain text) are a third kind of source. Their text is extracted
-- once, on upload, and stored in `content` like pasted text, so they are edited the same way.
alter table app.knowledge_sources drop constraint knowledge_sources_kind_check;
alter table app.knowledge_sources add constraint knowledge_sources_kind_check check (kind in ('website', 'text', 'file'));
alter table app.knowledge_sources drop constraint knowledge_sources_check;
alter table app.knowledge_sources add constraint knowledge_sources_check check (
  (kind = 'website' and url is not null) or (kind in ('text', 'file') and content is not null));

-- How often a website is read again on its own (a daily job picks the ones that are due).
-- Only websites use it.
alter table app.knowledge_sources add column refresh text not null default 'weekly' check (refresh in ('off', 'daily', 'weekly'));
create index knowledge_sources_refresh_idx on app.knowledge_sources (synced_at) where kind = 'website' and refresh <> 'off';
