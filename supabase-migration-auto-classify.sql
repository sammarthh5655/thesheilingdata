-- =====================================================================
-- TheSheilingData — Auto-classification learning store
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
--
-- Holds every human-verified (file -> class/subject/category) example.
-- These are fed back into the classifier prompt as few-shot examples, so
-- the detection improves from real corrections instead of needing any
-- model retraining.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.classification_examples (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was looked at
  file_name    TEXT NOT NULL,
  file_kind    TEXT,
  -- Short text fingerprint the model read off the page (header/title line).
  header_text  TEXT,

  -- What the AI predicted (null when the guess was skipped)
  ai_class     INT,
  ai_subject   TEXT,
  ai_category  TEXT,

  -- Ground truth the human confirmed — this is what we teach from
  final_class    INT  NOT NULL,
  final_subject  TEXT NOT NULL,
  final_category TEXT NOT NULL DEFAULT 'worksheet',
  final_chapter  TEXT,

  -- true when the human overrode the AI (the most valuable examples)
  corrected    BOOLEAN NOT NULL DEFAULT FALSE,
  -- 'upload'  = captured live at upload time
  -- 'library' = seeded from files already in the library
  source       TEXT NOT NULL DEFAULT 'upload',

  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Corrections first, then most recent — matches the retrieval order.
CREATE INDEX IF NOT EXISTS idx_class_examples_pick
  ON public.classification_examples(corrected DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_class_examples_subject
  ON public.classification_examples(final_class, final_subject);

-- Lets the library seed run repeatedly without creating duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_class_examples_unique_lib
  ON public.classification_examples(file_name, source)
  WHERE source = 'library';

ALTER TABLE public.classification_examples ENABLE ROW LEVEL SECURITY;

-- Any signed-in user may read the examples (they are only file labels) and
-- add new ones. Nobody may edit or delete another person's rows.
DROP POLICY IF EXISTS class_examples_select ON public.classification_examples;
CREATE POLICY class_examples_select ON public.classification_examples
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS class_examples_insert ON public.classification_examples;
CREATE POLICY class_examples_insert ON public.classification_examples
  FOR INSERT TO authenticated WITH CHECK (TRUE);

DROP POLICY IF EXISTS class_examples_delete ON public.classification_examples;
CREATE POLICY class_examples_delete ON public.classification_examples
  FOR DELETE TO authenticated USING (created_by = auth.uid());
