-- =====================================================================
-- SamleyBook: Subscription Expiry Enforcement, Hardened RLS & Idempotent Activation
-- =====================================================================

-- 1. Standardize the single platform offering to "SamleyBook Premium" (GH₵120 / 30 days)
UPDATE public.subscription_plans
SET
  name = 'SamleyBook Premium',
  description = 'Complete appointment booking, dashboard, SMS notifications, and customer management for your business.',
  price_ghs = 120.00,
  billing_cycle = 'monthly',
  is_active = true
WHERE code = 'premium';

INSERT INTO public.subscription_plans (name, code, description, price_ghs, billing_cycle, features, is_active)
VALUES (
  'SamleyBook Premium',
  'premium',
  'Complete appointment booking, dashboard, SMS notifications, and customer management for your business.',
  120.00,
  'monthly',
  '["Online appointment booking", "Business dashboard", "Service management", "Customer management", "Appointment management", "Business booking page and QR code", "Customer feedback management", "7-day free trial"]'::jsonb,
  true
)
ON CONFLICT (code) DO NOTHING;

-- 2. Payment Transaction Idempotency & Verification Tracking
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_moolre_ref_unique
  ON public.payment_transactions (moolre_reference)
  WHERE moolre_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_business_subscriptions_biz_created
  ON public.business_subscriptions (business_id, created_at DESC);

-- 3. Authoritative PostgreSQL UTC subscription activity check
CREATE OR REPLACE FUNCTION public.business_subscription_active(biz_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_sub RECORD;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  SELECT bs.status, bs.trial_end, bs.current_period_end
  INTO v_sub
  FROM public.business_subscriptions bs
  WHERE bs.business_id = biz_id
  ORDER BY bs.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_sub.status = 'trialing' THEN
    RETURN COALESCE(
      LEAST(v_sub.trial_end, v_sub.current_period_end),
      v_sub.current_period_end,
      v_sub.trial_end
    ) > v_now;
  ELSIF v_sub.status = 'active' THEN
    RETURN v_sub.current_period_end > v_now;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 4. Atomic & Idempotent Subscription Activation RPC (service_role only)
CREATE OR REPLACE FUNCTION public.activate_subscription_from_payment(
  p_payment_id UUID,
  p_provider_reference TEXT DEFAULT NULL,
  p_raw_response JSONB DEFAULT NULL,
  p_verified_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  p_period_days INTEGER DEFAULT 30
)
RETURNS JSONB AS $$
DECLARE
  v_payment public.payment_transactions%ROWTYPE;
  v_sub public.business_subscriptions%ROWTYPE;
  v_existing_expiry TIMESTAMPTZ;
  v_new_start TIMESTAMPTZ := COALESCE(p_verified_at, timezone('utc'::text, now()));
  v_new_end TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_payment
  FROM public.payment_transactions
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Payment record not found');
  END IF;

  IF v_payment.appointment_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Payment is not a subscription transaction');
  END IF;

  IF v_payment.status = 'successful' THEN
    SELECT * INTO v_sub
    FROM public.business_subscriptions
    WHERE id = v_payment.subscription_id;

    RETURN jsonb_build_object(
      'ok', true,
      'already_verified', true,
      'subscription_id', v_payment.subscription_id,
      'current_period_end', v_sub.current_period_end
    );
  END IF;

  IF v_payment.subscription_id IS NULL THEN
    SELECT * INTO v_sub
    FROM public.business_subscriptions
    WHERE business_id = v_payment.business_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  ELSE
    SELECT * INTO v_sub
    FROM public.business_subscriptions
    WHERE id = v_payment.subscription_id
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    INSERT INTO public.business_subscriptions (
      business_id,
      plan_id,
      status,
      trial_start,
      trial_end,
      current_period_start,
      current_period_end,
      payment_status
    )
    VALUES (
      v_payment.business_id,
      v_payment.plan_id,
      'active',
      v_new_start,
      v_new_start,
      v_new_start,
      v_new_start + make_interval(days => p_period_days),
      'paid'
    )
    RETURNING * INTO v_sub;
    v_new_end := v_sub.current_period_end;
  ELSE
    IF v_sub.status IN ('active', 'trialing') THEN
      v_existing_expiry := CASE
        WHEN v_sub.status = 'trialing' THEN COALESCE(LEAST(v_sub.trial_end, v_sub.current_period_end), v_sub.current_period_end, v_sub.trial_end)
        ELSE v_sub.current_period_end
      END;
    ELSE
      v_existing_expiry := NULL;
    END IF;

    IF v_existing_expiry IS NOT NULL AND v_existing_expiry > v_new_start THEN
      -- Renewal before expiry: extend from existing expiry + 30 days
      v_new_end := v_existing_expiry + make_interval(days => p_period_days);
    ELSE
      -- Renewal after expiry: 30 days from verified payment timestamp
      v_new_end := v_new_start + make_interval(days => p_period_days);
    END IF;

    UPDATE public.business_subscriptions
    SET
      plan_id = COALESCE(v_payment.plan_id, plan_id),
      status = 'active',
      payment_status = 'paid',
      current_period_start = v_new_start,
      current_period_end = v_new_end,
      updated_at = timezone('utc'::text, now())
    WHERE id = v_sub.id;
  END IF;

  UPDATE public.payment_transactions
  SET
    subscription_id = COALESCE(subscription_id, v_sub.id),
    status = 'successful',
    provider_reference = COALESCE(p_provider_reference, provider_reference),
    raw_response = COALESCE(p_raw_response, raw_response),
    verified_at = v_new_start,
    updated_at = timezone('utc'::text, now())
  WHERE id = v_payment.id;

  RETURN jsonb_build_object(
    'ok', true,
    'activated', true,
    'subscription_id', v_sub.id,
    'current_period_start', v_new_start,
    'current_period_end', v_new_end
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.activate_subscription_from_payment(UUID, TEXT, JSONB, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_subscription_from_payment(UUID, TEXT, JSONB, TIMESTAMPTZ, INTEGER) TO service_role;

-- 5. Hardened Row-Level Security Policies
-- Prevent expired business owners from forging subscriptions, bypassing lockouts,
-- or performing protected business writes directly via Supabase REST.

-- 5A. business_subscriptions: owners can READ their own rows (for lock screen) and INSERT initial trial only.
-- Owners CANNOT update or delete subscription status/dates directly; only super_admin or service_role can.
DROP POLICY IF EXISTS "System and Owners can insert subscription" ON public.business_subscriptions;
CREATE POLICY "System and Owners can insert subscription"
  ON public.business_subscriptions FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = business_subscriptions.business_id AND b.owner_id = auth.uid()
      )
      AND status = 'trialing'
      AND COALESCE(payment_status, 'none') = 'none'
      AND NOT EXISTS (
        SELECT 1 FROM public.business_subscriptions existing
        WHERE existing.business_id = business_subscriptions.business_id
      )
    )
  );

DROP POLICY IF EXISTS "Owners and Admins can update subscription" ON public.business_subscriptions;
CREATE POLICY "Super Admins can update subscription"
  ON public.business_subscriptions FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Super Admins can delete subscription" ON public.business_subscriptions;
CREATE POLICY "Super Admins can delete subscription"
  ON public.business_subscriptions FOR DELETE
  USING (public.is_super_admin());

-- 5B. payment_transactions: owners can view payment history even while locked,
-- but CANNOT directly mark subscription payments successful from the client.
DROP POLICY IF EXISTS "Public can insert payment transaction during booking" ON public.payment_transactions;
CREATE POLICY "Public can insert payment transaction during booking"
  ON public.payment_transactions FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      appointment_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = payment_transactions.business_id AND b.is_active = true
      )
      AND public.business_subscription_active(payment_transactions.business_id)
    )
  );

DROP POLICY IF EXISTS "Owners can update payment transactions" ON public.payment_transactions;
CREATE POLICY "Super Admins can update payment transactions"
  ON public.payment_transactions FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- 5C. businesses: allow first business creation on registration, require active paid sub for extra locations,
-- and lock owner UPDATE/DELETE when expired.
DROP POLICY IF EXISTS "Owners can insert their own businesses" ON public.businesses;
CREATE POLICY "Owners can insert their own businesses"
  ON public.businesses FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      owner_id = auth.uid()
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.businesses existing WHERE existing.owner_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.businesses existing
          JOIN public.business_subscriptions bs ON bs.business_id = existing.id
          WHERE existing.owner_id = auth.uid()
            AND bs.status = 'active'
            AND bs.payment_status = 'paid'
            AND bs.current_period_end > timezone('utc'::text, now())
        )
      )
    )
  );

DROP POLICY IF EXISTS "Owners can update their own businesses" ON public.businesses;
CREATE POLICY "Owners can update their own businesses"
  ON public.businesses FOR UPDATE
  USING (
    (owner_id = auth.uid() AND public.business_subscription_active(id))
    OR public.is_super_admin()
  )
  WITH CHECK (
    (owner_id = auth.uid() AND public.business_subscription_active(id))
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Owners can delete their own businesses" ON public.businesses;
CREATE POLICY "Owners can delete their own businesses"
  ON public.businesses FOR DELETE
  USING (
    (owner_id = auth.uid() AND public.business_subscription_active(id))
    OR public.is_super_admin()
  );

-- 5D. payment_configurations: require active subscription for owner writes
DROP POLICY IF EXISTS "Owners can update payment configuration" ON public.payment_configurations;
CREATE POLICY "Owners can update payment configuration"
  ON public.payment_configurations FOR ALL
  USING (
    (
      EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = payment_configurations.business_id AND b.owner_id = auth.uid()
      )
      AND public.business_subscription_active(payment_configurations.business_id)
    )
    OR public.is_super_admin()
  )
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = payment_configurations.business_id AND b.owner_id = auth.uid()
      )
      AND public.business_subscription_active(payment_configurations.business_id)
    )
    OR public.is_super_admin()
  );

-- 5E. customers: require active subscription for public booking inserts and owner management
DROP POLICY IF EXISTS "Public booking can insert customers" ON public.customers;
CREATE POLICY "Public booking can insert customers"
  ON public.customers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = customers.business_id AND b.is_active = true
    )
    AND public.business_subscription_active(customers.business_id)
  );

-- 5F. business_closures: ensure active subscription required for owner writes
DROP POLICY IF EXISTS "Public can view closures for active businesses" ON public.business_closures;
CREATE POLICY "Public can view closures for active businesses"
  ON public.business_closures FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_closures.business_id AND b.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_closures.business_id AND b.owner_id = auth.uid()
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Owners can manage business closures" ON public.business_closures;
CREATE POLICY "Owners can manage business closures"
  ON public.business_closures FOR ALL
  USING (
    (
      EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = business_closures.business_id AND b.owner_id = auth.uid()
      )
      AND public.business_subscription_active(business_closures.business_id)
    )
    OR public.is_super_admin()
  );

-- 5G. Ensure customer_feedback & feedback_tokens owner views require active subscription
-- (Existing customer feedback links via /api/feedback/validate and /api/feedback/submit use service_role and stay valid)
DROP POLICY IF EXISTS "Owners view own customer feedback" ON public.customer_feedback;
CREATE POLICY "Owners view own customer feedback"
  ON public.customer_feedback FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = customer_feedback.business_id AND b.owner_id = auth.uid()
    )
    AND public.business_subscription_active(customer_feedback.business_id)
  );

DROP POLICY IF EXISTS "Owners view own feedback tokens" ON public.feedback_tokens;
CREATE POLICY "Owners view own feedback tokens"
  ON public.feedback_tokens FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = feedback_tokens.business_id AND b.owner_id = auth.uid()
    )
    AND public.business_subscription_active(feedback_tokens.business_id)
  );

-- 6. Ensure business_subscriptions is published to Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'business_subscriptions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.business_subscriptions;
  END IF;
END $$;
