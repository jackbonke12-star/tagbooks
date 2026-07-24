-- Places prospecting pipeline: add a per-prospect follow-up date so the Places
-- tab can surface a "who to call back today" queue and let you schedule callbacks.
-- The status funnel already exists (to_visit -> visited -> pitched -> won, plus skip).

alter table public.prospects add column if not exists followup_date date;
alter table public.prospects alter column status set default 'to_visit';

-- Make sure realtime is publishing prospect changes (safe if already added).
do $$
begin
  begin
    alter publication supabase_realtime add table public.prospects;
  exception
    when duplicate_object then null;
    when others then null;
  end;
end $$;

notify pgrst, 'reload schema';
