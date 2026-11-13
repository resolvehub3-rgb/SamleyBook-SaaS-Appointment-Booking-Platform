-- =====================================================================
-- SamleyBook: Multi-Device Background Web Push & Owner Notification System
-- Idempotent Migration (Safe to run multiple times in Supabase SQL Editor)
-- =====================================================================

-- 1. OWNER NOTIFICATIONS (Authoritative in-app history + push source)
CREATE TABLE IF NOT EXISTS public.owner_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (
    category IN (
      'new_booking',
      'cancellation',
      'reschedule',
      'reminder_24h',
      'reminder_1h',
      'reminder_30m',
      'feedback',
      'subscription',
      'security'
    )
  ),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  destination_url TEXT NOT NULL DEFAULT '/app/dashboard',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT UNIQUE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_owner_notifications_user_created
  ON public.owner_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_owner_notifications_user_unread
  ON public.owner_notifications (user_id, read_at)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_owner_notifications_business_created
  ON public.owner_notifications (business_id, created_at DESC);

ALTER TABLE public.owner_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.owner_notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.owner_notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_super_admin());

DROP POLICY IF EXISTS "Users can mark their own notifications read" ON public.owner_notifications;
CREATE POLICY "Users can mark their own notifications read"
  ON public.owner_notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Protect immutable notification fields when authenticated users mark read_at
CREATE OR REPLACE FUNCTION public.protect_owner_notification_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('role', true) IN ('authenticated', 'anon') THEN
    NEW.id := OLD.id;
    NEW.user_id := OLD.user_id;
    NEW.business_id := OLD.business_id;
    NEW.category := OLD.category;
    NEW.title := OLD.title;
    NEW.body := OLD.body;
    NEW.entity_type := OLD.entity_type;
    NEW.entity_id := OLD.entity_id;
    NEW.destination_url := OLD.destination_url;
    NEW.metadata := OLD.metadata;
    NEW.idempotency_key := OLD.idempotency_key;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_owner_notification_fields ON public.owner_notifications;
CREATE TRIGGER trg_protect_owner_notification_fields
  BEFORE UPDATE ON public.owner_notifications
  FOR EACH ROW EXECUTE FUNCTION public.protect_owner_notification_fields();

-- 2. MULTI-DEVICE WEB PUSH SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL DEFAULT 'Web Browser',
  platform TEXT NOT NULL DEFAULT 'web' CHECK (
    platform IN ('android', 'ios', 'windows', 'macos', 'linux', 'web')
  ),
  user_agent TEXT,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_user_push_endpoint UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_active
  ON public.push_subscriptions (user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
  ON public.push_subscriptions (endpoint);

DROP TRIGGER IF EXISTS set_push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER set_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users manage their own push subscriptions"
  ON public.push_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.is_super_admin())
  WITH CHECK (auth.uid() = user_id);

-- 3. NOTIFICATION PREFERENCES (Synced across user devices)
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  new_booking BOOLEAN NOT NULL DEFAULT true,
  cancellation BOOLEAN NOT NULL DEFAULT true,
  reschedule BOOLEAN NOT NULL DEFAULT true,
  reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  reminder_24h BOOLEAN NOT NULL DEFAULT true,
  reminder_1h BOOLEAN NOT NULL DEFAULT true,
  reminder_30m BOOLEAN NOT NULL DEFAULT true,
  feedback BOOLEAN NOT NULL DEFAULT true,
  subscription BOOLEAN NOT NULL DEFAULT true,
  security BOOLEAN NOT NULL DEFAULT true,
  hide_lockscreen_details BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DROP TRIGGER IF EXISTS set_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER set_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users manage their own notification preferences"
  ON public.notification_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. PUSH DELIVERY ATTEMPTS (Audit log per device)
CREATE TABLE IF NOT EXISTS public.push_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.owner_notifications(id) ON DELETE CASCADE,
  push_subscription_id UUID REFERENCES public.push_subscriptions(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'attempted',
      'accepted',
      'failed_temporary',
      'failed_permanent',
      'subscription_invalid',
      'skipped_preference'
    )
  ),
  http_status INTEGER,
  error_message TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_push_delivery_attempts_notification
  ON public.push_delivery_attempts (notification_id, created_at DESC);

ALTER TABLE public.push_delivery_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view delivery attempts for own notifications" ON public.push_delivery_attempts;
CREATE POLICY "Users can view delivery attempts for own notifications"
  ON public.push_delivery_attempts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.owner_notifications n
      WHERE n.id = push_delivery_attempts.notification_id
        AND n.user_id = auth.uid()
    )
    OR public.is_super_admin()
  );

-- 5. APPOINTMENT OWNER REMINDERS (24h, 1h, 30m backend queue)
CREATE TABLE IF NOT EXISTS public.appointment_owner_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('24h', '1h', '30m')),
  appointment_start_utc TIMESTAMPTZ NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sent', 'cancelled', 'superseded', 'skipped_late', 'failed')
  ),
  idempotency_key TEXT NOT NULL UNIQUE,
  notification_id UUID REFERENCES public.owner_notifications(id) ON DELETE SET NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_appointment_owner_reminders_due
  ON public.appointment_owner_reminders (status, scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_appointment_owner_reminders_appt
  ON public.appointment_owner_reminders (appointment_id, status);

DROP TRIGGER IF EXISTS set_appointment_owner_reminders_updated_at ON public.appointment_owner_reminders;
CREATE TRIGGER set_appointment_owner_reminders_updated_at
  BEFORE UPDATE ON public.appointment_owner_reminders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.appointment_owner_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners view own appointment reminders" ON public.appointment_owner_reminders;
CREATE POLICY "Owners view own appointment reminders"
  ON public.appointment_owner_reminders FOR SELECT TO authenticated
  USING (auth.uid() = owner_id OR public.is_super_admin());

-- 6. DATABASE HELPER: Compute appointment start UTC from platform timezone
CREATE OR REPLACE FUNCTION public.compute_appointment_start_utc(
  p_date DATE,
  p_time TIME
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_tz TEXT;
  v_local TIMESTAMP;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(timezone), ''), 'Africa/Accra')
  INTO v_tz
  FROM public.platform_settings
  LIMIT 1;

  IF v_tz IS NULL OR v_tz = '' THEN
    v_tz := 'Africa/Accra';
  END IF;

  v_local := (p_date::text || ' ' || p_time::text)::timestamp;
  RETURN v_local AT TIME ZONE v_tz;
EXCEPTION
  WHEN OTHERS THEN
    RETURN ((p_date::text || ' ' || p_time::text)::timestamp AT TIME ZONE 'Africa/Accra');
END;
$$ LANGUAGE plpgsql STABLE;

-- 7. DATABASE HELPER: Schedule 24h / 1h / 30m owner reminders for an appointment
CREATE OR REPLACE FUNCTION public.schedule_owner_reminders_for_appointment(
  p_appointment_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_appt RECORD;
  v_start_utc TIMESTAMPTZ;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
  v_sched TIMESTAMPTZ;
  v_type TEXT;
  v_offset INTERVAL;
  v_idem TEXT;
BEGIN
  SELECT a.id, a.business_id, a.appointment_date, a.appointment_time, a.status, b.owner_id
  INTO v_appt
  FROM public.appointments a
  JOIN public.businesses b ON b.id = a.business_id
  WHERE a.id = p_appointment_id;

  IF NOT FOUND OR v_appt.owner_id IS NULL THEN
    RETURN;
  END IF;

  IF v_appt.status IN ('cancelled', 'completed') THEN
    RETURN;
  END IF;

  v_start_utc := public.compute_appointment_start_utc(v_appt.appointment_date, v_appt.appointment_time);

  IF v_start_utc <= v_now THEN
    RETURN;
  END IF;

  FOREACH v_type IN ARRAY ARRAY['24h', '1h', '30m'] LOOP
    v_offset := CASE v_type
      WHEN '24h' THEN interval '24 hours'
      WHEN '1h' THEN interval '1 hour'
      ELSE interval '30 minutes'
    END;
    v_sched := v_start_utc - v_offset;

    IF v_sched > v_now THEN
      v_idem := 'owner_reminder:' || v_appt.id::text || ':' || v_type || ':' || to_char(v_start_utc AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
      INSERT INTO public.appointment_owner_reminders (
        appointment_id,
        business_id,
        owner_id,
        reminder_type,
        appointment_start_utc,
        scheduled_for,
        status,
        idempotency_key
      )
      VALUES (
        v_appt.id,
        v_appt.business_id,
        v_appt.owner_id,
        v_type,
        v_start_utc,
        v_sched,
        'pending',
        v_idem
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. APPOINTMENT TRIGGERS (New booking, Cancellation, Reschedule, Reminder lifecycle)
CREATE OR REPLACE FUNCTION public.handle_appointment_owner_notifications()
RETURNS TRIGGER AS $$
DECLARE
  v_biz RECORD;
  v_service_name TEXT;
  v_ref TEXT;
  v_time_label TEXT;
  v_prev_time_label TEXT;
  v_notif_id UUID;
BEGIN
  SELECT id, owner_id, name INTO v_biz
  FROM public.businesses
  WHERE id = NEW.business_id;

  IF NOT FOUND OR v_biz.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_service_name
  FROM public.services
  WHERE id = NEW.service_id;

  v_service_name := COALESCE(v_service_name, 'Appointment Service');
  v_ref := UPPER(SUBSTRING(NEW.id::text FROM 1 FOR 8));
  v_time_label := TO_CHAR(NEW.appointment_time, 'HH12:MI AM');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.owner_notifications (
      user_id,
      business_id,
      category,
      title,
      body,
      entity_type,
      entity_id,
      destination_url,
      metadata,
      idempotency_key
    )
    VALUES (
      v_biz.owner_id,
      v_biz.id,
      'new_booking',
      'New Appointment: ' || NEW.customer_name,
      v_service_name || ' • ' || NEW.appointment_date::text || ' at ' || v_time_label || ' (' || v_biz.name || ')',
      'appointment',
      NEW.id::text,
      '/app/appointments?appointmentId=' || NEW.id::text,
      jsonb_build_object(
        'appointment_id', NEW.id,
        'appointment_ref', v_ref,
        'business_name', v_biz.name,
        'customer_name', NEW.customer_name,
        'service_name', v_service_name,
        'appointment_date', NEW.appointment_date::text,
        'appointment_time', NEW.appointment_time::text
      ),
      'new_booking:' || NEW.id::text
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    PERFORM public.schedule_owner_reminders_for_appointment(NEW.id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Status transitioned to cancelled -> cancel unsent reminders & notify owner once
    IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
      UPDATE public.appointment_owner_reminders
      SET status = 'cancelled',
          updated_at = timezone('utc'::text, now())
      WHERE appointment_id = NEW.id
        AND status IN ('pending', 'failed');

      INSERT INTO public.owner_notifications (
        user_id,
        business_id,
        category,
        title,
        body,
        entity_type,
        entity_id,
        destination_url,
        metadata,
        idempotency_key
      )
      VALUES (
        v_biz.owner_id,
        v_biz.id,
        'cancellation',
        'Appointment Cancelled: ' || NEW.customer_name,
        v_service_name || ' on ' || NEW.appointment_date::text || ' at ' || v_time_label || ' was cancelled.',
        'appointment',
        NEW.id::text,
        '/app/appointments?appointmentId=' || NEW.id::text,
        jsonb_build_object(
          'appointment_id', NEW.id,
          'appointment_ref', v_ref,
          'business_name', v_biz.name,
          'customer_name', NEW.customer_name,
          'service_name', v_service_name,
          'appointment_date', NEW.appointment_date::text,
          'appointment_time', NEW.appointment_time::text
        ),
        'cancellation:' || NEW.id::text || ':' || NEW.appointment_date::text || ':' || NEW.appointment_time::text
      )
      ON CONFLICT (idempotency_key) DO NOTHING;

      RETURN NEW;
    END IF;

    -- Completed -> cancel any remaining pre-appointment reminders
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
      UPDATE public.appointment_owner_reminders
      SET status = 'cancelled',
          updated_at = timezone('utc'::text, now())
      WHERE appointment_id = NEW.id
        AND status = 'pending';
    END IF;

    -- Date or time changed (Rescheduled) -> supersede old pending reminders, reschedule, & notify owner
    IF (NEW.appointment_date IS DISTINCT FROM OLD.appointment_date OR NEW.appointment_time IS DISTINCT FROM OLD.appointment_time)
       AND NEW.status <> 'cancelled' THEN
      v_prev_time_label := TO_CHAR(OLD.appointment_time, 'HH12:MI AM');

      UPDATE public.appointment_owner_reminders
      SET status = 'superseded',
          updated_at = timezone('utc'::text, now())
      WHERE appointment_id = NEW.id
        AND status IN ('pending', 'failed');

      INSERT INTO public.owner_notifications (
        user_id,
        business_id,
        category,
        title,
        body,
        entity_type,
        entity_id,
        destination_url,
        metadata,
        idempotency_key
      )
      VALUES (
        v_biz.owner_id,
        v_biz.id,
        'reschedule',
        'Appointment Rescheduled: ' || NEW.customer_name,
        v_service_name || ' moved from ' || OLD.appointment_date::text || ' ' || v_prev_time_label ||
        ' to ' || NEW.appointment_date::text || ' at ' || v_time_label || '.',
        'appointment',
        NEW.id::text,
        '/app/appointments?appointmentId=' || NEW.id::text,
        jsonb_build_object(
          'appointment_id', NEW.id,
          'appointment_ref', v_ref,
          'business_name', v_biz.name,
          'customer_name', NEW.customer_name,
          'service_name', v_service_name,
          'previous_date', OLD.appointment_date::text,
          'previous_time', OLD.appointment_time::text,
          'appointment_date', NEW.appointment_date::text,
          'appointment_time', NEW.appointment_time::text
        ),
        'reschedule:' || NEW.id::text || ':' || OLD.appointment_date::text || ':' || OLD.appointment_time::text || '->' || NEW.appointment_date::text || ':' || NEW.appointment_time::text
      )
      ON CONFLICT (idempotency_key) DO NOTHING;

      PERFORM public.schedule_owner_reminders_for_appointment(NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_appointment_owner_notifications ON public.appointments;
CREATE TRIGGER trg_appointment_owner_notifications
  AFTER INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.handle_appointment_owner_notifications();

-- 9. CUSTOMER FEEDBACK TRIGGER
CREATE OR REPLACE FUNCTION public.handle_feedback_owner_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_biz RECORD;
  v_service_name TEXT;
  v_preview TEXT;
BEGIN
  SELECT id, owner_id, name INTO v_biz
  FROM public.businesses
  WHERE id = NEW.business_id;

  IF NOT FOUND OR v_biz.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.service_id IS NOT NULL THEN
    SELECT name INTO v_service_name FROM public.services WHERE id = NEW.service_id;
  END IF;

  v_preview := LEFT(TRIM(COALESCE(NEW.feedback, '')), 110);
  IF LENGTH(TRIM(COALESCE(NEW.feedback, ''))) > 110 THEN
    v_preview := v_preview || '...';
  END IF;

  INSERT INTO public.owner_notifications (
    user_id,
    business_id,
    category,
    title,
    body,
    entity_type,
    entity_id,
    destination_url,
    metadata,
    idempotency_key
  )
  VALUES (
    v_biz.owner_id,
    v_biz.id,
    'feedback',
    'New Customer Feedback from ' || NEW.customer_name,
    COALESCE(NULLIF(v_preview, ''), 'A customer submitted verified post-appointment feedback.') ||
    CASE WHEN v_service_name IS NOT NULL THEN ' (' || v_service_name || ')' ELSE '' END,
    'feedback',
    NEW.id::text,
    '/app/feedback?feedbackId=' || NEW.id::text,
    jsonb_build_object(
      'feedback_id', NEW.id,
      'appointment_id', NEW.appointment_id,
      'business_name', v_biz.name,
      'customer_name', NEW.customer_name,
      'service_name', COALESCE(v_service_name, 'Service')
    ),
    'feedback:' || NEW.id::text
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_feedback_owner_notification ON public.customer_feedback;
CREATE TRIGGER trg_feedback_owner_notification
  AFTER INSERT ON public.customer_feedback
  FOR EACH ROW EXECUTE FUNCTION public.handle_feedback_owner_notification();

-- 10. ENABLE SUPABASE REALTIME FOR NOTIFICATIONS, PREFERENCES & DEVICES
ALTER TABLE public.owner_notifications REPLICA IDENTITY FULL;
ALTER TABLE public.notification_preferences REPLICA IDENTITY FULL;
ALTER TABLE public.push_subscriptions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='owner_notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.owner_notifications;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notification_preferences') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_preferences;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='push_subscriptions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.push_subscriptions;
  END IF;
END $$;

-- =====================================================================
-- OPTIONAL PRODUCTION SCHEDULER SETUP (Run after enabling pg_cron & pg_net in Supabase)
-- Replace <PROJECT_REF> and <CRON_SECRET> in Supabase SQL Editor:
--
-- SELECT cron.schedule(
--   'samleybook-process-owner-reminders',
--   '* * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/process-owner-reminders',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <CRON_SECRET>'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
-- =====================================================================
