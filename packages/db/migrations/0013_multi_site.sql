-- Several bots per workspace: one per website, each with its own site key, settings,
-- knowledge and conversations. `name` is the dashboard's label for the site; visitors never see it.

alter table app.bots drop constraint bots_organization_id_key;
create index bots_organization_id_idx on app.bots (organization_id, created_at);

alter table app.bots add column name text not null default 'My website' check (length(name) between 1 and 80);

-- Existing bots are named after the first website they're allowed on, else the workspace
update app.bots b set name = left(coalesce(
    nullif(regexp_replace(b.settings -> 'security' -> 'allowedOrigins' ->> 0, '^[a-z]+://', ''), ''),
    o.name), 80)
  from app.organizations o where o.id = b.organization_id;
