-- Where a conversation started, for the inbox: page path and title, browser language, the
-- country of the browser's time zone and the kind of device. Written once, when the API
-- creates the conversation; older conversations keep '{}'.
alter table app.conversations add column context jsonb not null default '{}'::jsonb
  check (jsonb_typeof(context) = 'object' and pg_column_size(context) <= 2000);
