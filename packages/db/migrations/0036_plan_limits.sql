-- Plan limits on the server (docs/adr/0003-billing.md (e), packages/db/src/entitlements.ts). A
-- downgrade deletes nothing: settings above the plan are kept and simply not applied, and websites
-- over the plan's limit are paused instead of removed.

-- Which websites stay active when a workspace has more than its plan allows. They are ranked by
-- (standby, created_at, id) and the first `websites` of them answer; the rest are paused (the widget
-- offers the hand-off form only). Nobody chooses by default, so the oldest ones stay active. The
-- owner's choice of active websites sets standby on every other one. Upgrading lifts every pause,
-- whatever standby says.
alter table app.bots add column standby boolean not null default false;

-- The longest retention the workspace's plan allowed when the conversation started; null when plan
-- limits were off. The sweep keeps a conversation for the bot's retention setting, never longer than
-- this, so a shorter window after a downgrade applies to new conversations only.
alter table app.conversations add column retention_cap_days int check (retention_cap_days is null or retention_cap_days > 0);
