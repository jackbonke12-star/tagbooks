-- Before/after review tracking. review_snapshots holds a time series of each
-- client's Google review count; clients.baseline_* is the "before" number set
-- at install (manual, since we can't retro-fetch history). Open RLS + realtime.
create table if not exists public.review_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  review_count integer,
  rating numeric,
  source text not null default 'manual',
  captured_at timestamptz not null default now()
);
alter table public.clients add column if not exists baseline_reviews integer;
alter table public.clients add column if not exists baseline_date date;

alter table public.review_snapshots enable row level security;
do $$ begin
  create policy review_snapshots_all on public.review_snapshots for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
grant all on public.review_snapshots to anon, authenticated;
do $$ begin
  alter publication supabase_realtime add table public.review_snapshots;
exception when duplicate_object then null; when others then null; end $$;
notify pgrst, 'reload schema';
