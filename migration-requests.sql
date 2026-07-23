-- TagBooks migration: adds the App Requests board to a database where the
-- original supabase.sql already ran. Paste into the Supabase SQL editor and run.
-- Idempotent: safe to re-run.

-- ---------- App requests ----------
-- In-app change/feature requests: partners submit, Jack relays to the developer.
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  detail text,
  submitted_by text,
  status text not null default 'new' check (status in ('new', 'building', 'done')),
  created_at timestamptz not null default now()
);

-- ---------- Index ----------
create index if not exists requests_created_at_idx on requests (created_at desc);

-- ---------- Row Level Security ----------
alter table requests enable row level security;

drop policy if exists "requests_select" on requests;
drop policy if exists "requests_insert" on requests;
drop policy if exists "requests_update" on requests;
drop policy if exists "requests_delete" on requests;

create policy "requests_select" on requests for select to anon, authenticated using (true);
create policy "requests_insert" on requests for insert to anon, authenticated with check (true);
create policy "requests_update" on requests for update to anon, authenticated using (true) with check (true);
create policy "requests_delete" on requests for delete to anon, authenticated using (true);

-- ---------- Grants ----------
grant all on table requests to anon, authenticated;

-- ---------- Realtime ----------
-- Add to the publication so open devices update live. Guarded so a re-run does
-- not abort when the table is already a member of the publication.
do $$
begin
  alter publication supabase_realtime add table requests;
exception
  when duplicate_object then null;
end $$;
