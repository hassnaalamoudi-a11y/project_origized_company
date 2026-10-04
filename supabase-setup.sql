-- ============================================================
-- مؤسسة بايوني للحلول الأمنية — إعداد قاعدة Supabase
-- قم بتشغيل هذا الكود في Supabase SQL Editor
-- ============================================================

-- ========================
-- 1. جدول المشاريع
-- ========================
CREATE TABLE IF NOT EXISTS public.projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  num         TEXT NOT NULL,
  client      TEXT DEFAULT '',
  start_date  TEXT DEFAULT '',
  end_date    TEXT DEFAULT '',
  months      INTEGER DEFAULT 0,
  warranty_months INTEGER DEFAULT 0,
  before_tax  NUMERIC(15,2) DEFAULT 0,
  tax_rate    NUMERIC(5,2) DEFAULT 15,
  after_tax   NUMERIC(15,2) DEFAULT 0,
  cycle       TEXT DEFAULT 'شهري',
  monthly     NUMERIC(15,2) DEFAULT 0,
  collect     TEXT DEFAULT 'تحويل بنكي',
  status      TEXT DEFAULT 'تحت العمل',
  service_type TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- 2. جدول حركات/فواتير المشاريع
-- ========================
CREATE TABLE IF NOT EXISTS public.moves (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  type              TEXT DEFAULT 'فاتورة',
  inv               TEXT DEFAULT '',
  amount            NUMERIC(15,2) DEFAULT 0,
  due_amount        NUMERIC(15,2) DEFAULT 0,
  issue_date        TEXT DEFAULT '',
  due_date          TEXT DEFAULT '',
  inv_due           TEXT DEFAULT 'غير مستحقة',
  money             TEXT DEFAULT 'غير مستحق',
  month             TEXT DEFAULT '',
  collect           TEXT DEFAULT 'تحويل بنكي',
  description       TEXT DEFAULT '',
  period_key        TEXT DEFAULT '',
  receivable_logged BOOLEAN DEFAULT FALSE,
  bank              TEXT DEFAULT '',
  transfer_date     TEXT DEFAULT '',
  receivable_note   TEXT DEFAULT '',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- 3. جدول المصاريف
-- ========================
CREATE TABLE IF NOT EXISTS public.expenses (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  move_id     TEXT DEFAULT '',
  category    TEXT DEFAULT 'أخرى',
  amount      NUMERIC(15,2) DEFAULT 0,
  expense_date TEXT DEFAULT '',
  description TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- 4. جدول المستخدمين
-- ========================
CREATE TABLE IF NOT EXISTS public.app_users (
  id          SERIAL PRIMARY KEY,
  no          INTEGER UNIQUE NOT NULL,
  username    TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  role        TEXT DEFAULT 'user',
  perms       JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- 5. جدول سجل العمليات
-- ========================
CREATE TABLE IF NOT EXISTS public.op_log (
  id          SERIAL PRIMARY KEY,
  timestamp   TEXT NOT NULL,
  username    TEXT DEFAULT '—',
  action      TEXT NOT NULL,
  details     TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- 6. جدول النسخ الاحتياطية
-- ========================
CREATE TABLE IF NOT EXISTS public.backups (
  id          SERIAL PRIMARY KEY,
  timestamp   TEXT NOT NULL,
  reason      TEXT DEFAULT 'تلقائية',
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- 7. جدول أنواع الخدمات
-- ========================
CREATE TABLE IF NOT EXISTS public.service_types (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  is_default  BOOLEAN DEFAULT FALSE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- إضافة عمود نوع الخدمة في جدول المشاريع (إن لم يكن موجوداً)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'service_type'
  ) THEN
    ALTER TABLE public.projects ADD COLUMN service_type TEXT DEFAULT '';
  END IF;
END $$;

-- إدراج أنواع الخدمات الافتراضية (مطابقة لأسماء التطبيق) إن لم تكن موجودة
INSERT INTO public.service_types (id, name, is_default, sort_order)
VALUES
  ('svc_maintenance', 'خدمة صيانة', TRUE, 1),
  ('svc_installation', 'خدمة تركيب', TRUE, 2),
  ('svc_both', 'خدمة صيانة وتركيب', TRUE, 3)
ON CONFLICT (id) DO NOTHING;

-- توحيد الأسماء القديمة
UPDATE public.service_types SET name = 'خدمة صيانة' WHERE name = 'خدمي صيانة';
UPDATE public.service_types SET name = 'خدمة تركيب' WHERE name = 'خدمي تركيب';
UPDATE public.projects SET service_type = 'خدمة صيانة' WHERE service_type IN ('', 'خدمي صيانة');
UPDATE public.projects SET service_type = 'خدمة تركيب' WHERE service_type = 'خدمي تركيب';

-- ========================
-- 8. تفعيل RLS (Row Level Security) — أمان على مستوى الصف
-- ========================
ALTER TABLE public.projects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moves       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.op_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;

-- ========================
-- 9. سياسات الوصول (نستخدم anon key مع API Key الخاص بالتطبيق)
-- ========================
-- منح الصلاحيات لدور anon و authenticated
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- إسقاط أي سياسات سابقة لتجنب تكرار الأسماء
DROP POLICY IF EXISTS "allow_all_projects"       ON public.projects;
DROP POLICY IF EXISTS "allow_all_moves"          ON public.moves;
DROP POLICY IF EXISTS "allow_all_expenses"       ON public.expenses;
DROP POLICY IF EXISTS "allow_all_app_users"      ON public.app_users;
DROP POLICY IF EXISTS "allow_all_op_log"         ON public.op_log;
DROP POLICY IF EXISTS "allow_all_backups"        ON public.backups;
DROP POLICY IF EXISTS "allow_all_service_types"  ON public.service_types;

-- السماح لجميع العمليات عبر anon key و authenticated
CREATE POLICY "allow_all_projects"       ON public.projects       FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_moves"          ON public.moves           FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_expenses"       ON public.expenses        FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_app_users"      ON public.app_users       FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_op_log"         ON public.op_log          FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_backups"        ON public.backups         FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_service_types"  ON public.service_types   FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ========================
-- 10. Indexes لتحسين الأداء
-- ========================
CREATE INDEX IF NOT EXISTS idx_moves_project_id    ON public.moves(project_id);
CREATE INDEX IF NOT EXISTS idx_expenses_project_id ON public.expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_moves_period_key    ON public.moves(period_key);
CREATE INDEX IF NOT EXISTS idx_op_log_created      ON public.op_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_types_order ON public.service_types(sort_order ASC);

-- ========================
-- 11. Function لتحديث updated_at تلقائياً
-- ========================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_projects_updated_at       ON public.projects;
DROP TRIGGER IF EXISTS update_moves_updated_at          ON public.moves;
DROP TRIGGER IF EXISTS update_expenses_updated_at       ON public.expenses;
DROP TRIGGER IF EXISTS update_app_users_updated_at      ON public.app_users;
DROP TRIGGER IF EXISTS update_service_types_updated_at  ON public.service_types;

CREATE TRIGGER update_projects_updated_at       BEFORE UPDATE ON public.projects       FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_moves_updated_at          BEFORE UPDATE ON public.moves           FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_expenses_updated_at       BEFORE UPDATE ON public.expenses        FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_app_users_updated_at      BEFORE UPDATE ON public.app_users       FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_service_types_updated_at  BEFORE UPDATE ON public.service_types   FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ========================
-- 12. تحديث ذاكرة API (schema cache) ليرى الجدول/العمود الجديد فوراً
-- ========================
NOTIFY pgrst, 'reload schema';
