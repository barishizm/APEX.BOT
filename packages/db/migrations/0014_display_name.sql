-- A free-form name for greeting people ("Welcome back, Mahmut"), separate from the
-- login-style username. Null until the user sets one or a Google/GitHub sign-in supplies it.
alter table app.users add column display_name text
  check (display_name is null or (length(display_name) between 1 and 64 and display_name = btrim(display_name)));
