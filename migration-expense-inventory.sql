-- Expense -> inventory: when an expense is a stock order, record what was
-- ordered, how many, and when it should arrive. The Inventory tab lists these
-- as incoming and "Mark received" folds the qty into on-hand stock.
alter table public.expenses add column if not exists inv_item text;
alter table public.expenses add column if not exists inv_qty numeric;
alter table public.expenses add column if not exists arrival_date date;
alter table public.expenses add column if not exists received boolean not null default false;
alter table public.expenses add column if not exists received_date date;
notify pgrst, 'reload schema';
