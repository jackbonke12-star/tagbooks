-- TagBooks migration: overhauls Notes with color coding, per-note images, and
-- pinning. Run after migration-notes.sql. Paste into the Supabase SQL editor.
-- Idempotent: safe to re-run.

-- ---------- New columns ----------
alter table notes add column if not exists color text;
alter table notes add column if not exists images jsonb not null default '[]'::jsonb;
alter table notes add column if not exists pinned boolean not null default false;

-- ---------- Index: pinned first, then newest ----------
create index if not exists notes_pinned_created_idx
  on notes (pinned desc, created_at desc);

-- Existing RLS policies and grants from migration-notes.sql already cover these
-- columns (they operate at the row level). Note images reuse the existing
-- public `request-files` storage bucket, so no new bucket is required.
