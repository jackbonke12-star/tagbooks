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

-- ---------- Indexes ----------
create index sales_date_idx on sales (date);
create index expenses_date_idx on expenses (date);
create index clients_next_followup_idx on clients (next_followup);
create index print_queue_status_idx on print_queue (status);
create index recurring_active_idx on recurring (active);

-- ---------- Row Level Security ----------
-- Shared workspace: any logged-in (authenticated) user can read and write all rows.
alter table clients enable row level security;
alter table sales enable row level security;
alter table expenses enable row level security;
alter table inventory enable row level security;
alter table print_queue enable row level security;
alter table recurring enable row level security;

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

-- Inventory policies (select / insert / update / delete for authenticated users).
create policy "inventory_select" on inventory for select to authenticated using (true);
create policy "inventory_insert" on inventory for insert to authenticated with check (true);
create policy "inventory_update" on inventory for update to authenticated using (true) with check (true);
create policy "inventory_delete" on inventory for delete to authenticated using (true);

-- Print queue policies (select / insert / update / delete for authenticated users).
create policy "print_queue_select" on print_queue for select to authenticated using (true);
create policy "print_queue_insert" on print_queue for insert to authenticated with check (true);
create policy "print_queue_update" on print_queue for update to authenticated using (true) with check (true);
create policy "print_queue_delete" on print_queue for delete to authenticated using (true);

-- Recurring policies (select / insert / update / delete for authenticated users).
create policy "recurring_select" on recurring for select to authenticated using (true);
create policy "recurring_insert" on recurring for insert to authenticated with check (true);
create policy "recurring_update" on recurring for update to authenticated using (true) with check (true);
create policy "recurring_delete" on recurring for delete to authenticated using (true);
