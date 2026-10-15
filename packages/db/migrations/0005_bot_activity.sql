-- When and where the widget was last loaded, written by the chat API. Kept apart from
-- app.bots so frequent writes don't bump bots.updated_at (which drives the API's sync).

create table app.bot_activity (
  bot_id             uuid primary key references app.bots (id) on delete cascade,
  widget_seen_at     timestamptz,
  widget_seen_origin text check (widget_seen_origin is null or length(widget_seen_origin) <= 300)
);

alter table app.bot_activity enable row level security;
