-- The admin bot pages (/admin/bots): staff can override a bot's daily token budget for a while,
-- without touching the owner's own setting. The chat API applies it until it expires.
alter table app.bots
  add column token_budget_override       bigint check (token_budget_override is null or token_budget_override >= 0),
  add column token_budget_override_until timestamptz,
  add constraint bots_token_budget_override_pair check ((token_budget_override is null) = (token_budget_override_until is null));
