-- A topic label on each visitor message ("Shipping costs", "Returns"), written in batches by
-- the API's background labeler (a small Claude model) and grouped by the analytics page.
-- null: not labeled yet; '': labeled, but names no topic (a greeting, thanks, just a name).
alter table app.messages add column topic text check (topic is null or length(topic) <= 60);

-- the labeler's queue: recent visitor messages still without a label
create index messages_unlabeled_idx on app.messages (created_at desc) where role = 'user' and topic is null;
