-- =====================================================================
-- TheSheilingData — Supabase schema
-- Run this whole file in: Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================

-- ---------- USERS (profile rows; id matches Supabase Auth user id) ----
CREATE TABLE public.users (
  id UUID PRIMARY KEY,               -- equals auth.users.id
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  status TEXT NOT NULL DEFAULT 'active',
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- ---------- LOGIN / SIGNUP LOGS ---------------------------------------
CREATE TABLE public.login_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email TEXT,
  type TEXT,                          -- 'login' | 'signup'
  success BOOLEAN,
  device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- FILES -----------------------------------------------------
CREATE TABLE public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_num INT NOT NULL,
  subject TEXT NOT NULL,
  chapter TEXT,
  category TEXT NOT NULL DEFAULT 'worksheet',  -- 'worksheet' | 'question_paper'
  paper_year TEXT,                             -- e.g. '2025-26' (question papers only)
  file_name TEXT NOT NULL,
  file_type TEXT,
  size BIGINT,
  storage_path TEXT NOT NULL,
  uploaded_by_user_id UUID,
  uploader_name TEXT,
  view_count INT NOT NULL DEFAULT 0,
  download_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- BOOKMARKS -------------------------------------------------
CREATE TABLE public.bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, file_id)
);

-- ---------- REPORTS / FLAGS -------------------------------------------
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID,
  file_name TEXT,
  class_num INT,
  subject TEXT,
  reported_by_user_id UUID,
  reporter_name TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open',  -- open | dismissed | resolved
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- ADMIN AUDIT LOG -------------------------------------------
CREATE TABLE public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID,
  admin_name TEXT,
  action TEXT,
  target_user_id UUID,
  target_file_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- INDEXES ---------------------------------------------------
CREATE INDEX idx_files_class_subject ON public.files(class_num, subject);
CREATE INDEX idx_files_uploader ON public.files(uploaded_by_user_id);
CREATE INDEX idx_login_logs_user ON public.login_logs(user_id);
CREATE INDEX idx_bookmarks_user ON public.bookmarks(user_id);
CREATE INDEX idx_reports_status ON public.reports(status);

-- =====================================================================
-- ROW LEVEL SECURITY
-- The app runs as a static site with the publishable (anon) key, so the
-- signed-in user's JWT is what these policies see. Role enforcement for
-- uploads/admin is done in the app; these policies keep data readable
-- where it must be and writable only by authenticated users.
-- =====================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- USERS: any signed-in user can read profiles (needed for teacher pages,
-- uploader names, and the admin user list). Insert your own row on signup.
-- Updates allowed to signed-in users (admin role changes / self edits).
CREATE POLICY users_read   ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY users_insert ON public.users FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY users_update ON public.users FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY users_delete ON public.users FOR DELETE TO authenticated USING (true);

-- LOGIN LOGS: readable by signed-in users (admin panel). Insert allowed
-- to everyone (failed pre-auth attempts must still record); no edits.
CREATE POLICY logs_read   ON public.login_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY logs_insert ON public.login_logs FOR INSERT TO anon, authenticated WITH CHECK (true);

-- FILES: readable by signed-in users; insert/update/delete by signed-in.
CREATE POLICY files_read   ON public.files FOR SELECT TO authenticated USING (true);
CREATE POLICY files_insert ON public.files FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY files_update ON public.files FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY files_delete ON public.files FOR DELETE TO authenticated USING (true);

-- BOOKMARKS: each user only sees and edits their own.
CREATE POLICY bm_read   ON public.bookmarks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY bm_insert ON public.bookmarks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY bm_delete ON public.bookmarks FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- REPORTS: signed-in users can create; read/update (admin) for signed-in.
CREATE POLICY rep_read   ON public.reports FOR SELECT TO authenticated USING (true);
CREATE POLICY rep_insert ON public.reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reported_by_user_id);
CREATE POLICY rep_update ON public.reports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- AUDIT LOG: readable + insertable by signed-in users (admin actions).
CREATE POLICY audit_read   ON public.admin_audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY audit_insert ON public.admin_audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- =====================================================================
-- STORAGE — create the "worksheets" bucket and its access policies
-- =====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('worksheets', 'worksheets', true)
ON CONFLICT (id) DO NOTHING;

-- Public read (bucket is public so files preview/download via URL).
CREATE POLICY storage_read ON storage.objects
  FOR SELECT USING (bucket_id = 'worksheets');

-- Signed-in users can upload (app checks teacher/admin role first).
CREATE POLICY storage_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'worksheets');

-- Signed-in users can delete (admin delete/replace).
CREATE POLICY storage_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'worksheets');

-- =====================================================================
-- Atomic view/download counter (optional but recommended)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.increment_file_counter(p_file_id UUID, p_column TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_column = 'view_count' THEN
    UPDATE public.files SET view_count = view_count + 1 WHERE id = p_file_id;
  ELSIF p_column = 'download_count' THEN
    UPDATE public.files SET download_count = download_count + 1 WHERE id = p_file_id;
  END IF;
END;
$$;
