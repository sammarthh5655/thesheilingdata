-- =====================================================================
-- TheSheilingData — Question Bank migration
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- (Only needed if you already ran supabase-schema.sql before; new
--  installs get these columns from the updated schema file.)
-- =====================================================================
ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'worksheet',
  ADD COLUMN IF NOT EXISTS paper_year TEXT;

CREATE INDEX IF NOT EXISTS idx_files_category
  ON public.files(category, class_num, subject);
