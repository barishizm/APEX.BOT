-- A workspace's subscription plan; it sets limits such as how many pages of a website are read.
-- There is no billing yet: everyone starts on Free and a plan is changed by hand.
alter table app.organizations add column plan text not null default 'free' check (plan in ('free', 'starter', 'pro', 'business'));
