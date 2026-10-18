-- Runs of the scheduled jobs (the daily knowledge refresh, …), so staff can see when one last ran
-- and what it did (/admin/knowledge). A run is inserted when it starts and closed when it ends; one
-- that never closes died with its function call. Rows older than 90 days are pruned on insert.
create table app.job_runs (
  id          bigint generated always as identity primary key,
  job         text not null check (job ~ '^[a-z0-9_.:-]{1,100}$'),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  result      jsonb,
  error       text check (error is null or length(error) <= 1000)
);
create index job_runs_job_started_at_idx on app.job_runs (job, started_at desc);

alter table app.job_runs enable row level security;
