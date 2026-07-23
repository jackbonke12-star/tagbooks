-- TagBooks migration: adds the Notes dev-log / progress board to a database
-- where the original supabase.sql already ran. Paste into the Supabase SQL
-- editor and run. Idempotent: safe to re-run.

-- ---------- Notes ----------
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  author text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Index ----------
create index if not exists notes_created_at_idx on notes (created_at desc);

-- ---------- Row Level Security ----------
alter table notes enable row level security;

drop policy if exists "notes_select" on notes;
drop policy if exists "notes_insert" on notes;
drop policy if exists "notes_update" on notes;
drop policy if exists "notes_delete" on notes;

create policy "notes_select" on notes for select to anon, authenticated using (true);
create policy "notes_insert" on notes for insert to anon, authenticated with check (true);
create policy "notes_update" on notes for update to anon, authenticated using (true) with check (true);
create policy "notes_delete" on notes for delete to anon, authenticated using (true);

-- ---------- Grants ----------
grant all on table notes to anon, authenticated;

-- ---------- Realtime ----------
-- Add to the publication so open devices update live. Guarded so a re-run does
-- not abort when the table is already a member of the publication.
do $$
begin
  alter publication supabase_realtime add table notes;
exception
  when duplicate_object then null;
end $$;
