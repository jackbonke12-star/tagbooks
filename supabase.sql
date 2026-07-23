-- TagBooks schema. Paste into the Supabase SQL editor and run.

-- ---------- Clients ----------
create table clients (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name text,
  phone text,
  address text,
  stage text not null default 'lead' check (stage in ('lead', 'pitched', 'sold', 'care_plan')),
  next_followup date,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Sales ----------
create table sales (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  client_name text not null,
  client_id uuid references clients(id) on delete set null,
  product text not null check (product in (
    'basic_kit',
    'custom_logo_kit',
    'website',
    'digital_menu',
    'custom_menu_package',
    'care_plan',
    'site_care',
    'menu_updates',
    'logo_stands',
    'other'
  )),
  amount numeric(10,2) not null,
  type text not null check (type in ('one_time', 'recurring')),
  closed_by text not null check (closed_by in ('jack', 'jackson')),
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Expenses ----------
create table expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  category text not null check (category in (
    'hardware_tags',
    'gas',
    'software',
    'fees',
    'other'
  )),
  amount numeric(10,2) not null,
  paid_by text not null check (paid_by in ('jack', 'jackson')),
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Indexes ----------
create index sales_date_idx on sales (date);
create index expenses_date_idx on expenses (date);
create index clients_next_followup_idx on clients (next_followup);

-- ---------- Row Level Security ----------
-- Shared workspace: any logged-in (authenticated) user can read and write all rows.
alter table clients enable row level security;
alter table sales enable row level security;
alter table expenses enable row level security;

-- Clients policies (select / insert / update / delete for authenticated users).
create policy "clients_select" on clients for select to authenticated using (true);
create policy "clients_insert" on clients for insert to authenticated with check (true);
create policy "clients_update" on clients for update to authenticated using (true) with check (true);
create policy "clients_delete" on clients for delete to authenticated using (true);

-- Sales policies (select / insert / update / delete for authenticated users).
create policy "sales_select" on sales for select to authenticated using (true);
create policy "sales_insert" on sales for insert to authenticated with check (true);
create policy "sales_update" on sales for update to authenticated using (true) with check (true);
create policy "sales_delete" on sales for delete to authenticated using (true);

-- Expenses policies (select / insert / update / delete for authenticated users).
create policy "expenses_select" on expenses for select to authenticated using (true);
create policy "expenses_insert" on expenses for insert to authenticated with check (true);
create policy "expenses_update" on expenses for update to authenticated using (true) with check (true);
create policy "expenses_delete" on expenses for delete to authenticated using (true);
