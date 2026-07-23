-- TagBooks migration: adds the Google review link column to an existing
-- clients table. Paste into the Supabase SQL editor and run. Idempotent.
alter table clients add column if not exists google_review_url text;
