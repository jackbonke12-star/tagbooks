-- TagBooks realtime migration: turn on live cross-device updates.
-- Supabase Realtime only streams changes for tables in the supabase_realtime
-- publication. Run this if your database predates the realtime feature (the
-- statements are also included at the end of supabase.sql for fresh setups).
-- Paste into the Supabase SQL editor and run.
--
-- Per-table so a table already in the publication does not abort the whole run.
alter publication supabase_realtime add table sales;
alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table clients;
alter publication supabase_realtime add table inventory;
alter publication supabase_realtime add table print_queue;
alter publication supabase_realtime add table recurring;
