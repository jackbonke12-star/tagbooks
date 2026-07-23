-- TagBooks migration: adds the phone and Google review link columns to an
-- existing prospects table (Places page). Paste into the Supabase SQL editor
-- and run. Idempotent.
alter table prospects add column if not exists phone text;
alter table prospects add column if not exists google_review_url text;
