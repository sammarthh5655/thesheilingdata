-- =====================================================================
-- TheSheilingData — exam type, worksheet number, and multi-page files
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
--
-- All four columns are optional additions to public.files, so every file
-- already uploaded keeps working exactly as before (page_count defaults
-- to 1 and storage_path still holds the first/only page).
-- =====================================================================

ALTER TABLE public.files
  -- Which examination this paper belongs to: 'assignment_1', 'assignment_2',
  -- 'po_1', 'po_2', 'half_yearly', 'finals'. Question papers only.
  ADD COLUMN IF NOT EXISTS exam_type TEXT,

  -- The number printed in the worksheet header ("WORKSHEET No - 2").
  ADD COLUMN IF NOT EXISTS worksheet_no TEXT,

  -- How many pages this entry holds. 1 for a normal single upload.
  ADD COLUMN IF NOT EXISTS page_count INT NOT NULL DEFAULT 1,

  -- Every page, in order: [{"path": "...", "name": "...", "size": 123}, ...]
  -- Left NULL for single-page files, which use storage_path as before.
  ADD COLUMN IF NOT EXISTS pages JSONB;

-- Browsing the Question Bank filters by exam within a class/subject/year.
CREATE INDEX IF NOT EXISTS idx_files_exam_type
  ON public.files(exam_type, class_num, subject);
