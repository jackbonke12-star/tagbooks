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
  google_review_url text,
  notes text,
  created_at timestamptz not null default now()
);

-- Idempotent guard so existing databases pick up the column on re-run.
alter table clients add column if not exists google_review_url text;

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

-- ---------- Inventory ----------
create table inventory (
  id uuid primary key default gen_random_uuid(),
  item text unique not null,
  quantity int not null default 0
);

-- Seed the four tracked items.
insert into inventory (item, quantity) values ('cards', 0) on conflict do nothing;
insert into inventory (item, quantity) values ('stands', 0) on conflict do nothing;
insert into inventory (item, quantity) values ('stickers', 0) on conflict do nothing;
insert into inventory (item, quantity) values ('filament_rolls', 0) on conflict do nothing;

-- ---------- Print queue ----------
create table print_queue (
  id uuid primary key default gen_random_uuid(),
  client text,
  item text not null,
  status text not null default 'waiting' check (status in ('waiting', 'printing', 'done')),
  due_date date,
  created_at timestamptz not null default now()
);

-- ---------- Recurring ----------
create table recurring (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  client_name text,
  product text not null,
  amount numeric(10,2) not null,
  start_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- App requests ----------
-- In-app change/feature requests: partners submit, Jack relays to the developer.
create table requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  detail text,
  submitted_by text,
  status text not null default 'new' check (status in ('new', 'building', 'done')),
  created_at timestamptz not null default now()
);

-- ---------- Prospects (Places: door-to-door hit list) ----------
create table prospects (
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

-- ---------- Indexes ----------
create index sales_date_idx on sales (date);
create index expenses_date_idx on expenses (date);
create index clients_next_followup_idx on clients (next_followup);
create index print_queue_status_idx on print_queue (status);
create index recurring_active_idx on recurring (active);
create index requests_created_at_idx on requests (created_at desc);

-- ---------- Row Level Security ----------
-- Shared workspace: any logged-in (authenticated) user can read and write all rows.
alter table clients enable row level security;
alter table sales enable row level security;
alter table expenses enable row level security;
alter table inventory enable row level security;
alter table print_queue enable row level security;
alter table recurring enable row level security;
alter table requests enable row level security;
alter table prospects enable row level security;

-- Clients policies (select / insert / update / delete for authenticated users).
create policy "clients_select" on clients for select to anon, authenticated using (true);
create policy "clients_insert" on clients for insert to anon, authenticated with check (true);
create policy "clients_update" on clients for update to anon, authenticated using (true) with check (true);
create policy "clients_delete" on clients for delete to anon, authenticated using (true);

-- Sales policies (select / insert / update / delete for authenticated users).
create policy "sales_select" on sales for select to anon, authenticated using (true);
create policy "sales_insert" on sales for insert to anon, authenticated with check (true);
create policy "sales_update" on sales for update to anon, authenticated using (true) with check (true);
create policy "sales_delete" on sales for delete to anon, authenticated using (true);

-- Expenses policies (select / insert / update / delete for authenticated users).
create policy "expenses_select" on expenses for select to anon, authenticated using (true);
create policy "expenses_insert" on expenses for insert to anon, authenticated with check (true);
create policy "expenses_update" on expenses for update to anon, authenticated using (true) with check (true);
create policy "expenses_delete" on expenses for delete to anon, authenticated using (true);

-- Inventory policies (select / insert / update / delete for authenticated users).
create policy "inventory_select" on inventory for select to anon, authenticated using (true);
create policy "inventory_insert" on inventory for insert to anon, authenticated with check (true);
create policy "inventory_update" on inventory for update to anon, authenticated using (true) with check (true);
create policy "inventory_delete" on inventory for delete to anon, authenticated using (true);

-- Print queue policies (select / insert / update / delete for authenticated users).
create policy "print_queue_select" on print_queue for select to anon, authenticated using (true);
create policy "print_queue_insert" on print_queue for insert to anon, authenticated with check (true);
create policy "print_queue_update" on print_queue for update to anon, authenticated using (true) with check (true);
create policy "print_queue_delete" on print_queue for delete to anon, authenticated using (true);

-- Recurring policies (select / insert / update / delete for authenticated users).
create policy "recurring_select" on recurring for select to anon, authenticated using (true);
create policy "recurring_insert" on recurring for insert to anon, authenticated with check (true);
create policy "recurring_update" on recurring for update to anon, authenticated using (true) with check (true);
create policy "recurring_delete" on recurring for delete to anon, authenticated using (true);

-- Requests policies (select / insert / update / delete for authenticated users).
create policy "requests_select" on requests for select to anon, authenticated using (true);
create policy "requests_insert" on requests for insert to anon, authenticated with check (true);
create policy "requests_update" on requests for update to anon, authenticated using (true) with check (true);
create policy "requests_delete" on requests for delete to anon, authenticated using (true);

-- Prospects policies (select / insert / update / delete for authenticated users).
create policy "prospects_select" on prospects for select to anon, authenticated using (true);
create policy "prospects_insert" on prospects for insert to anon, authenticated with check (true);
create policy "prospects_update" on prospects for update to anon, authenticated using (true) with check (true);
create policy "prospects_delete" on prospects for delete to anon, authenticated using (true);

-- ---------- Realtime ----------
-- Supabase Realtime only streams changes for tables in the supabase_realtime
-- publication. Add each table so open devices update live without a refresh.
-- Per-table so a table already in the publication does not abort the whole run.
alter publication supabase_realtime add table sales;
alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table clients;
alter publication supabase_realtime add table inventory;
alter publication supabase_realtime add table print_queue;
alter publication supabase_realtime add table recurring;
alter publication supabase_realtime add table requests;
alter publication supabase_realtime add table prospects;

-- ---------------------------------------------------------------------------
-- Grants: allow the API roles (anon, authenticated) to use the public tables.
-- Required so the app's publishable/anon key can read and write (RLS still
-- governs row access on top of these table-level grants).
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
