-- TagBooks migration: adds the Places (door-to-door prospecting) feature to a
-- database where the original supabase.sql already ran. Paste into the Supabase
-- SQL editor and run. All statements are idempotent / safe to re-run.

-- ---------- Prospects (places to hit) ----------
create table if not exists prospects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_type text,
  city text,
  address text,
  priority text default 'medium' check (priority in ('high', 'medium', 'low')),
  status text default 'to_visit' check (status in ('to_visit', 'visited', 'pitched', 'won', 'skip')),
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------
alter table prospects enable row level security;

drop policy if exists "prospects_select" on prospects;
drop policy if exists "prospects_insert" on prospects;
drop policy if exists "prospects_update" on prospects;
drop policy if exists "prospects_delete" on prospects;

create policy "prospects_select" on prospects for select to anon, authenticated using (true);
create policy "prospects_insert" on prospects for insert to anon, authenticated with check (true);
create policy "prospects_update" on prospects for update to anon, authenticated using (true) with check (true);
create policy "prospects_delete" on prospects for delete to anon, authenticated using (true);

-- ---------- Grants ----------
grant all on prospects to anon, authenticated;

-- ---------- Realtime ----------
alter publication supabase_realtime add table prospects;
