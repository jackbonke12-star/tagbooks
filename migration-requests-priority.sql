-- TagBooks migration: adds priority + type to the App Requests board on a
-- database where requests already exists. Paste into the Supabase SQL editor
-- and run. Idempotent: safe to re-run.

-- ---------- Columns ----------
alter table requests add column if not exists priority text default 'medium' check (priority in ('high', 'medium', 'low'));
alter table requests add column if not exists req_type text;
