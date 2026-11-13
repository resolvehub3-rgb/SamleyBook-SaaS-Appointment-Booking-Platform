-- =====================================================================
-- SamleyBook: Super Admin Command Centre & Audit Extensions
-- Idempotent migration for registration workflow, audit logs & settings
-- =====================================================================

-- 1. Optional business registration status columns (existing active businesses default to approved)
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS registration_status TEXT DEFAULT 'approved' CHECK (registration_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

UPDATE public.businesses
SET registration_status = 'approved'
WHERE registration_status IS NULL;

-- 2. Unified immutable Super Admin Audit Logs
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity ON public.admin_audit_logs(entity_type, entity_id);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admins can view admin audit logs" ON public.admin_audit_logs;
CREATE POLICY "Super Admins can view admin audit logs"
  ON public.admin_audit_logs FOR SELECT
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "Super Admins can insert admin audit logs" ON public.admin_audit_logs;
CREATE POLICY "Super Admins can insert admin audit logs"
  ON public.admin_audit_logs FOR INSERT
  WITH CHECK (public.is_super_admin());

-- Audit logs are strictly immutable: no UPDATE or DELETE policies are granted.

-- 3. Non-secret Global Platform Settings singleton table
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name TEXT NOT NULL DEFAULT 'SamleyBook',
  tagline TEXT NOT NULL DEFAULT 'Book • Manage • Grow',
  allow_new_registrations BOOLEAN NOT NULL DEFAULT true,
  require_registration_approval BOOLEAN NOT NULL DEFAULT false,
  default_trial_days INTEGER NOT NULL DEFAULT 7,
  subscription_price_ghs NUMERIC(10, 2) NOT NULL DEFAULT 120.00,
  subscription_period_days INTEGER NOT NULL DEFAULT 30,
  timezone TEXT NOT NULL DEFAULT 'Africa/Accra',
  currency TEXT NOT NULL DEFAULT 'GHS',
  email_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.platform_settings (
  platform_name,
  tagline,
  allow_new_registrations,
  require_registration_approval,
  default_trial_days,
  subscription_price_ghs,
  subscription_period_days,
  timezone,
  currency,
  email_alerts_enabled
)
SELECT
  'SamleyBook',
  'Book • Manage • Grow',
  true,
  false,
  7,
  120.00,
  30,
  'Africa/Accra',
  'GHS',
  true
WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read platform settings" ON public.platform_settings;
CREATE POLICY "Public can read platform settings"
  ON public.platform_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Super Admins can update platform settings" ON public.platform_settings;
CREATE POLICY "Super Admins can update platform settings"
  ON public.platform_settings FOR UPDATE
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "Super Admins can insert platform settings" ON public.platform_settings;
CREATE POLICY "Super Admins can insert platform settings"
  ON public.platform_settings FOR INSERT
  WITH CHECK (public.is_super_admin());

-- 4. Enable Realtime on Super Admin operational tables idempotently
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='business_subscriptions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.business_subscriptions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sms_notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_notifications;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='admin_audit_logs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_audit_logs;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='platform_settings') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_settings;
  END IF;
END $$;
