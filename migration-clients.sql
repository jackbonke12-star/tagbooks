-- TagBooks migration: adds the Clients feature to a database where the
-- original supabase.sql already ran. Paste into the Supabase SQL editor and run.

-- ---------- Clients ----------
create table clients (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text,
  phone text,
  address text,
  stage text not null default 'lead' check (stage in ('lead', 'pitched', 'sold', 'care_plan')),
  next_followup date,
  google_review_url text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Index ----------
create index clients_next_followup_idx on clients (next_followup);

-- ---------- Row Level Security ----------
alter table clients enable row level security;

create policy "clients_select" on clients for select to anon, authenticated using (true);
create policy "clients_insert" on clients for insert to anon, authenticated with check (true);
create policy "clients_update" on clients for update to anon, authenticated using (true) with check (true);
create policy "clients_delete" on clients for delete to anon, authenticated using (true);

-- ---------- Link sales to clients ----------
alter table sales add column client_id uuid references clients(id) on delete set null;
