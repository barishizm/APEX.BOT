-- Pin the trigger function's search_path (Supabase linter: "Function Search Path Mutable").
-- It only calls now(), which lives in pg_catalog.
alter function app.set_updated_at() set search_path = pg_catalog;
