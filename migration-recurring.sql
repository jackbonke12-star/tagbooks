-- Documents the recurring tables that live in production so a fresh Supabase
-- project rebuilt from these SQL files includes them. `recurring` powers the
-- MRR card + auto-recurring sales; `recurring_expenses` powers the Recurring
-- page's recurring cost list. Open RLS + realtime to match the rest of the app.

create table if not exists public.recurring (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  client_name text,
  product text not null,
  amount numeric not null,
  start_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric not null,
  frequency text not null default 'monthly',
  category text,
  paid_by text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.recurring enable row level security;
alter table public.recurring_expenses enable row level security;

do $$ begin
  create policy recurring_all on public.recurring for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy recurring_expenses_all on public.recurring_expenses for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

grant all on public.recurring to anon, authenticated;
grant all on public.recurring_expenses to anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table public.recurring;
exception when duplicate_object then null; when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.recurring_expenses;
exception when duplicate_object then null; when others then null; end $$;

notify pgrst, 'reload schema';
