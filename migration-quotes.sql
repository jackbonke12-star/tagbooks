-- On-the-spot quote builder: quotes linked to a client (or a typed business),
-- with line items, totals, and GST. Open RLS + realtime to match the app.
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  business_name text,
  contact_name text,
  phone text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  gst boolean not null default true,
  notes text,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);
alter table public.quotes enable row level security;
do $$ begin
  create policy quotes_all on public.quotes for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
grant all on public.quotes to anon, authenticated;
do $$ begin
  alter publication supabase_realtime add table public.quotes;
exception when duplicate_object then null; when others then null; end $$;
notify pgrst, 'reload schema';
