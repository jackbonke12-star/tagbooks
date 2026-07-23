-- TagBooks phase-2 migration: adds Inventory, Print Queue, and Recurring to a
-- database where supabase.sql / migration-clients.sql already ran.
-- Paste into the Supabase SQL editor and run.

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
create index print_queue_status_idx on print_queue (status);
create index recurring_active_idx on recurring (active);

-- ---------- Row Level Security ----------
alter table inventory enable row level security;
alter table print_queue enable row level security;
alter table recurring enable row level security;

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
