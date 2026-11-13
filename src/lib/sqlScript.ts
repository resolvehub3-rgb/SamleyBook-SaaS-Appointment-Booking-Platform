// Complete, production-ready Supabase PostgreSQL schema script for SamleyBook SaaS
export const SUPABASE_SQL_SCHEMA = `-- =====================================================================
-- SAMLEYBOOK SaaS — Complete PostgreSQL Database Schema & Security Setup
-- A product by SamTeck Digital
-- Designed for Supabase SQL Editor Execution
-- =====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. HELPER FUNCTION: Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. PROFILES TABLE (Associated with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'business_owner' CHECK (role IN ('super_admin', 'business_owner')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Trigger for profiles
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, phone, role)
    VALUES (
        NEW.id,
        CASE 
            WHEN LOWER(NEW.email) = 'samleybook@gmail.com' THEN 'Super Admin (SamleyBook)'
            ELSE COALESCE(NEW.raw_user_meta_data->>'full_name', 'Business Owner')
        END,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'phone', '+233200000000'),
        CASE 
            WHEN LOWER(NEW.email) = 'samleybook@gmail.com' THEN 'super_admin'
            ELSE COALESCE(NEW.raw_user_meta_data->>'role', 'business_owner')
        END
    )
    ON CONFLICT (id) DO UPDATE
    SET role = CASE 
            WHEN LOWER(EXCLUDED.email) = 'samleybook@gmail.com' THEN 'super_admin'
            ELSE EXCLUDED.role
        END,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-confirm super admin email on signup
CREATE OR REPLACE FUNCTION public.auto_confirm_super_admin()
RETURNS TRIGGER AS $$
BEGIN
    IF LOWER(NEW.email) = 'samleybook@gmail.com' THEN
        NEW.email_confirmed_at = COALESCE(NEW.email_confirmed_at, timezone('utc'::text, now()));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_auto_confirm_super_admin ON auth.users;
CREATE TRIGGER tr_auto_confirm_super_admin
BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_super_admin();

-- 4. BUSINESSES TABLE (Multi-Tenant Core)
CREATE TABLE IF NOT EXISTS public.businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    description TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT NOT NULL,
    logo_url TEXT,
    operating_hours JSONB DEFAULT '{
        "monday": {"open": "08:00", "close": "18:00", "isOpen": true},
        "tuesday": {"open": "08:00", "close": "18:00", "isOpen": true},
        "wednesday": {"open": "08:00", "close": "18:00", "isOpen": true},
        "thursday": {"open": "08:00", "close": "18:00", "isOpen": true},
        "friday": {"open": "08:00", "close": "18:00", "isOpen": true},
        "saturday": {"open": "09:00", "close": "17:00", "isOpen": true},
        "sunday": {"open": "10:00", "close": "14:00", "isOpen": false}
    }'::jsonb NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_businesses_owner_id ON public.businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_businesses_slug ON public.businesses(slug);

DROP TRIGGER IF EXISTS set_businesses_updated_at ON public.businesses;
CREATE TRIGGER set_businesses_updated_at
BEFORE UPDATE ON public.businesses
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. SERVICES TABLE
CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_services_business_id ON public.services(business_id);

DROP TRIGGER IF EXISTS set_services_updated_at ON public.services;
CREATE TRIGGER set_services_updated_at
BEFORE UPDATE ON public.services
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. SUBSCRIPTION PLANS
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    price_ghs NUMERIC(10, 2) NOT NULL,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    features JSONB DEFAULT '[]'::jsonb NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert standard SamleyBook plan if not exists
INSERT INTO public.subscription_plans (name, code, description, price_ghs, billing_cycle, features, is_active)
VALUES
    ('SamleyBook Premium', 'premium', 'Complete appointment booking, dashboard, SMS notifications, and customer management for your business.', 120.00, 'monthly', '["Online appointment booking", "Business dashboard", "Service management", "Customer management", "Appointment management", "Business booking page and QR code", "Customer feedback management", "7-day free trial"]'::jsonb, true)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    price_ghs = EXCLUDED.price_ghs,
    billing_cycle = EXCLUDED.billing_cycle,
    is_active = true;

-- 7. BUSINESS SUBSCRIPTIONS (7-Day Trial Tracking)
CREATE TABLE IF NOT EXISTS public.business_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
    trial_start TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    trial_end TIMESTAMPTZ DEFAULT (timezone('utc'::text, now()) + interval '7 days') NOT NULL,
    current_period_start TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    current_period_end TIMESTAMPTZ DEFAULT (timezone('utc'::text, now()) + interval '7 days') NOT NULL,
    payment_status TEXT DEFAULT 'none' CHECK (payment_status IN ('none', 'pending', 'paid', 'failed')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_business_subscriptions_business ON public.business_subscriptions(business_id);

DROP TRIGGER IF EXISTS set_business_subscriptions_updated_at ON public.business_subscriptions;
CREATE TRIGGER set_business_subscriptions_updated_at
BEFORE UPDATE ON public.business_subscriptions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. PAYMENT CONFIGURATION
CREATE TABLE IF NOT EXISTS public.payment_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE UNIQUE,
    payment_type TEXT NOT NULL DEFAULT 'full' CHECK (payment_type IN ('full', 'deposit')),
    deposit_type TEXT DEFAULT 'percentage' CHECK (deposit_type IN ('percentage', 'fixed')),
    deposit_percentage NUMERIC(5, 2) DEFAULT 50.00 CHECK (deposit_percentage >= 0 AND deposit_percentage <= 100),
    deposit_fixed_amount NUMERIC(10, 2) DEFAULT 0.00 CHECK (deposit_fixed_amount >= 0),
    mobile_money_number TEXT,
    mobile_money_provider TEXT DEFAULT 'MTN MoMo' CHECK (mobile_money_provider IN ('MTN MoMo', 'Telecel Cash', 'AT Money')),
    direct_settlement_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

DROP TRIGGER IF EXISTS set_payment_configurations_updated_at ON public.payment_configurations;
CREATE TRIGGER set_payment_configurations_updated_at
BEFORE UPDATE ON public.payment_configurations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_business_customer_phone UNIQUE (business_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_customers_business ON public.customers(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);

DROP TRIGGER IF EXISTS set_customers_updated_at ON public.customers;
CREATE TRIGGER set_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 10. APPOINTMENTS TABLE
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'deposit_paid', 'failed', 'refunded')),
    service_price NUMERIC(10, 2) NOT NULL,
    payment_required NUMERIC(10, 2) NOT NULL,
    payment_received NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_appointments_business ON public.appointments(business_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);

DROP TRIGGER IF EXISTS set_appointments_updated_at ON public.appointments;
CREATE TRIGGER set_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 11. PAYMENT TRANSACTIONS (Moolre Records)
CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES public.business_subscriptions(id) ON DELETE SET NULL,
    plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
    currency TEXT NOT NULL DEFAULT 'GHS',
    customer_phone TEXT,
    amount NUMERIC(10, 2) NOT NULL,
    payment_provider TEXT NOT NULL DEFAULT 'Moolre',
    moolre_reference TEXT,
    provider_reference TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed')),
    raw_response JSONB,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_business ON public.payment_transactions(business_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_appointment ON public.payment_transactions(appointment_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_moolre_ref_unique ON public.payment_transactions(moolre_reference) WHERE moolre_reference IS NOT NULL;

DROP TRIGGER IF EXISTS set_payment_transactions_updated_at ON public.payment_transactions;
CREATE TRIGGER set_payment_transactions_updated_at
BEFORE UPDATE ON public.payment_transactions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 12. SMS LOGS
CREATE TABLE IF NOT EXISTS public.sms_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    recipient_phone TEXT NOT NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('registration', 'booking_confirmation', 'reminder_24h', 'cancellation')),
    message_text TEXT NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('sent', 'pending', 'failed')),
    provider_reference TEXT,
    error_message TEXT,
    sent_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_business ON public.sms_logs(business_id);

-- 13. EMAIL LOGS
CREATE TABLE IF NOT EXISTS public.email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('registration', 'booking_confirmation', 'cancellation')),
    delivery_status TEXT NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('sent', 'pending', 'failed')),
    sent_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_logs_business ON public.email_logs(business_id);

-- 14. BUSINESS CLOSURES
CREATE TABLE IF NOT EXISTS public.business_closures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    closure_date DATE NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_closures ENABLE ROW LEVEL SECURITY;

-- Helper function: business has active (or trialing) subscription
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

-- Helper function to check if current user is Super Admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'super_admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles Policies
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id OR public.is_super_admin());

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Businesses Policies
DROP POLICY IF EXISTS "Public can view active businesses for booking" ON public.businesses;
DROP POLICY IF EXISTS "Public can view active businesses for booking" ON public.businesses;
CREATE POLICY "Public can view active businesses for booking"
    ON public.businesses FOR SELECT
    USING (is_active = true OR owner_id = auth.uid() OR public.is_super_admin());

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

-- Services Policies
DROP POLICY IF EXISTS "Public can view active services of active businesses" ON public.services;
DROP POLICY IF EXISTS "Public can view active services of active businesses" ON public.services;
CREATE POLICY "Public can view active services of active businesses"
    ON public.services FOR SELECT
    USING (
        (is_active = true AND EXISTS (
            SELECT 1 FROM public.businesses b WHERE b.id = services.business_id AND b.is_active = true
        ))
        OR EXISTS (
            SELECT 1 FROM public.businesses b WHERE b.id = services.business_id AND b.owner_id = auth.uid()
        )
        OR public.is_super_admin()
    );

DROP POLICY IF EXISTS "Owners can manage services of their businesses" ON public.services;
CREATE POLICY "Owners can manage services of their businesses"
    ON public.services FOR ALL
    USING (
        (
            EXISTS (
                SELECT 1 FROM public.businesses b WHERE b.id = services.business_id AND b.owner_id = auth.uid()
            )
            AND public.business_subscription_active(services.business_id)
        )
        OR public.is_super_admin()
    );

-- Subscription Plans Policies
DROP POLICY IF EXISTS "Everyone can view active plans" ON public.subscription_plans;
DROP POLICY IF EXISTS "Everyone can view active plans" ON public.subscription_plans;
CREATE POLICY "Everyone can view active plans"
    ON public.subscription_plans FOR SELECT
    USING (is_active = true OR public.is_super_admin());

DROP POLICY IF EXISTS "Super Admins can manage plans" ON public.subscription_plans;
DROP POLICY IF EXISTS "Super Admins can manage plans" ON public.subscription_plans;
CREATE POLICY "Super Admins can manage plans"
    ON public.subscription_plans FOR ALL
    USING (public.is_super_admin());

-- Business Subscriptions Policies
DROP POLICY IF EXISTS "Owners and Super Admins can view subscriptions" ON public.business_subscriptions;
DROP POLICY IF EXISTS "Owners and Super Admins can view subscriptions" ON public.business_subscriptions;
CREATE POLICY "Owners and Super Admins can view subscriptions"
    ON public.business_subscriptions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.businesses b WHERE b.id = business_subscriptions.business_id AND b.owner_id = auth.uid()
        )
        OR public.is_super_admin()
    );

DROP POLICY IF EXISTS "System and Owners can insert subscription" ON public.business_subscriptions;
CREATE POLICY "System and Owners can insert subscription"
    ON public.business_subscriptions FOR INSERT
    WITH CHECK (
        public.is_super_admin()
        OR (
            EXISTS (
                SELECT 1 FROM public.businesses b WHERE b.id = business_subscriptions.business_id AND b.owner_id = auth.uid()
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
DROP POLICY IF EXISTS "Super Admins can update subscription" ON public.business_subscriptions;
CREATE POLICY "Super Admins can update subscription"
    ON public.business_subscriptions FOR UPDATE
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- Payment Configurations Policies
DROP POLICY IF EXISTS "Owners and Super Admins can view payment configs" ON public.payment_configurations;
CREATE POLICY "Owners and Super Admins can view payment configs"
    ON public.payment_configurations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.businesses b WHERE b.id = payment_configurations.business_id AND b.owner_id = auth.uid()
        )
        OR public.is_super_admin()
    );

DROP POLICY IF EXISTS "Public can view basic payment type for booking calculation" ON public.payment_configurations;
CREATE POLICY "Public can view basic payment type for booking calculation"
    ON public.payment_configurations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.businesses b WHERE b.id = payment_configurations.business_id AND b.is_active = true
        )
    );

DROP POLICY IF EXISTS "Owners can update payment configuration" ON public.payment_configurations;
CREATE POLICY "Owners can update payment configuration"
    ON public.payment_configurations FOR ALL
    USING (
        (
            EXISTS (
                SELECT 1 FROM public.businesses b WHERE b.id = payment_configurations.business_id AND b.owner_id = auth.uid()
            )
            AND public.business_subscription_active(payment_configurations.business_id)
        )
        OR public.is_super_admin()
    )
    WITH CHECK (
        (
            EXISTS (
                SELECT 1 FROM public.businesses b WHERE b.id = payment_configurations.business_id AND b.owner_id = auth.uid()
            )
            AND public.business_subscription_active(payment_configurations.business_id)
        )
        OR public.is_super_admin()
    );

-- Customers Policies
DROP POLICY IF EXISTS "Owners can view and manage their business customers" ON public.customers;
DROP POLICY IF EXISTS "Owners can view and manage their business customers" ON public.customers;
CREATE POLICY "Owners can view and manage their business customers"
    ON public.customers FOR ALL
    USING (
        (
            EXISTS (
                SELECT 1 FROM public.businesses b WHERE b.id = customers.business_id AND b.owner_id = auth.uid()
            )
            AND public.business_subscription_active(customers.business_id)
        )
        OR public.is_super_admin()
    );

DROP POLICY IF EXISTS "Public booking can insert customers" ON public.customers;
CREATE POLICY "Public booking can insert customers"
    ON public.customers FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.businesses b WHERE b.id = customers.business_id AND b.is_active = true
        )
        AND public.business_subscription_active(customers.business_id)
    );

-- Appointments Policies
DROP POLICY IF EXISTS "Public can view appointment slot times to avoid double booking" ON public.appointments;
CREATE POLICY "Public can view appointment slot times to avoid double booking"
    ON public.appointments FOR SELECT
    USING (
        status != 'cancelled'
        OR EXISTS (
            SELECT 1 FROM public.businesses b WHERE b.id = appointments.business_id AND b.owner_id = auth.uid()
        )
        OR public.is_super_admin()
    );

DROP POLICY IF EXISTS "Public can insert bookings for active businesses" ON public.appointments;
CREATE POLICY "Public can insert bookings for active businesses"
    ON public.appointments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.businesses b WHERE b.id = appointments.business_id AND b.is_active = true
        )
        AND public.business_subscription_active(appointments.business_id)
    );

DROP POLICY IF EXISTS "Owners can manage appointments of their business" ON public.appointments;
CREATE POLICY "Owners can manage appointments of their business"
    ON public.appointments FOR ALL
    USING (
        (
            EXISTS (
                SELECT 1 FROM public.businesses b WHERE b.id = appointments.business_id AND b.owner_id = auth.uid()
            )
            AND public.business_subscription_active(appointments.business_id)
        )
        OR public.is_super_admin()
    );

-- Payment Transactions Policies
DROP POLICY IF EXISTS "Owners and Super Admins can view transactions" ON public.payment_transactions;
CREATE POLICY "Owners and Super Admins can view transactions"
    ON public.payment_transactions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.businesses b WHERE b.id = payment_transactions.business_id AND b.owner_id = auth.uid()
        )
        OR public.is_super_admin()
    );

DROP POLICY IF EXISTS "Public can insert payment transaction during booking" ON public.payment_transactions;
CREATE POLICY "Public can insert payment transaction during booking"
    ON public.payment_transactions FOR INSERT
    WITH CHECK (
        public.is_super_admin()
        OR (
            appointment_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.businesses b WHERE b.id = payment_transactions.business_id AND b.is_active = true
            )
            AND public.business_subscription_active(payment_transactions.business_id)
        )
    );

DROP POLICY IF EXISTS "Owners can update payment transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "Super Admins can update payment transactions" ON public.payment_transactions;
CREATE POLICY "Super Admins can update payment transactions"
    ON public.payment_transactions FOR UPDATE
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- SMS and Email Logs Policies
DROP POLICY IF EXISTS "Owners and Super Admins can view logs" ON public.sms_logs;
DROP POLICY IF EXISTS "Owners and Super Admins can view logs" ON public.sms_logs;
CREATE POLICY "Owners and Super Admins can view logs"
    ON public.sms_logs FOR SELECT
    USING (
        business_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.businesses b WHERE b.id = sms_logs.business_id AND b.owner_id = auth.uid()
        )
        OR public.is_super_admin()
    );

DROP POLICY IF EXISTS "System can insert SMS logs" ON public.sms_logs;
DROP POLICY IF EXISTS "System can insert SMS logs" ON public.sms_logs;
CREATE POLICY "System can insert SMS logs"
    ON public.sms_logs FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Owners and Super Admins can view email logs" ON public.email_logs;
DROP POLICY IF EXISTS "Owners and Super Admins can view email logs" ON public.email_logs;
CREATE POLICY "Owners and Super Admins can view email logs"
    ON public.email_logs FOR SELECT
    USING (
        business_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.businesses b WHERE b.id = email_logs.business_id AND b.owner_id = auth.uid()
        )
        OR public.is_super_admin()
    );

DROP POLICY IF EXISTS "System can insert email logs" ON public.email_logs;
DROP POLICY IF EXISTS "System can insert email logs" ON public.email_logs;
CREATE POLICY "System can insert email logs"
    ON public.email_logs FOR INSERT
    WITH CHECK (true);

-- =====================================================================
-- SUPABASE STORAGE BUCKET FOR SERVICE IMAGES AND LOGOS
-- =====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-assets', 'business-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Public can view assets
DROP POLICY IF EXISTS "Public can view business assets" ON storage.objects;
DROP POLICY IF EXISTS "Public can view business assets" ON storage.objects;
CREATE POLICY "Public can view business assets"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'business-assets');

-- Storage RLS: Authenticated users can upload assets
DROP POLICY IF EXISTS "Authenticated users can upload business assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload business assets" ON storage.objects;
CREATE POLICY "Authenticated users can upload business assets"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'business-assets' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update their business assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update their business assets" ON storage.objects;
CREATE POLICY "Authenticated users can update their business assets"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'business-assets' AND auth.role() = 'authenticated');

-- =====================================================================
-- REALTIME SUBSCRIPTIONS
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='appointments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='businesses') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.businesses;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='services') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.services;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='payment_transactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_transactions;
  END IF;
END $$;

-- 8. SUPER ADMIN ROLE & EMAIL CONFIRMATION ENFORCEMENT
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, timezone('utc'::text, now()))
WHERE LOWER(email) = 'samleybook@gmail.com';

UPDATE public.profiles
SET role = 'super_admin'
WHERE LOWER(email) = 'samleybook@gmail.com';

-- =====================================================================
-- SMS FEEDBACK, TOKENS & PER-BUSINESS USAGE (appended)
-- =====================================================================
ALTER TABLE public.sms_notifications
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.feedback_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE UNIQUE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE UNIQUE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  feedback_token_id UUID REFERENCES public.feedback_tokens(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  feedback TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.business_sms_usage (
  business_id UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  total_sent INTEGER NOT NULL DEFAULT 0,
  total_accepted INTEGER NOT NULL DEFAULT 0,
  total_delivered INTEGER NOT NULL DEFAULT 0,
  total_failed INTEGER NOT NULL DEFAULT 0,
  last_sms_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_sms_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage feedback tokens" ON public.feedback_tokens;
DROP POLICY IF EXISTS "Super admins manage feedback tokens" ON public.feedback_tokens;
CREATE POLICY "Super admins manage feedback tokens" ON public.feedback_tokens FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS "Owners view own feedback tokens" ON public.feedback_tokens;
DROP POLICY IF EXISTS "Owners view own feedback tokens" ON public.feedback_tokens;
CREATE POLICY "Owners view own feedback tokens" ON public.feedback_tokens FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = feedback_tokens.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Super admins manage customer feedback" ON public.customer_feedback;
DROP POLICY IF EXISTS "Super admins manage customer feedback" ON public.customer_feedback;
CREATE POLICY "Super admins manage customer feedback" ON public.customer_feedback FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS "Owners view own customer feedback" ON public.customer_feedback;
DROP POLICY IF EXISTS "Owners view own customer feedback" ON public.customer_feedback;
CREATE POLICY "Owners view own customer feedback" ON public.customer_feedback FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = customer_feedback.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Super admins view business sms usage" ON public.business_sms_usage;
DROP POLICY IF EXISTS "Super admins view business sms usage" ON public.business_sms_usage;
CREATE POLICY "Super admins view business sms usage" ON public.business_sms_usage FOR SELECT TO authenticated
  USING (public.is_super_admin());
DROP POLICY IF EXISTS "Owners view own business sms usage" ON public.business_sms_usage;
DROP POLICY IF EXISTS "Owners view own business sms usage" ON public.business_sms_usage;
CREATE POLICY "Owners view own business sms usage" ON public.business_sms_usage FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_sms_usage.business_id AND b.owner_id = auth.uid()));

-- Super Admin Command Centre extensions
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS registration_status TEXT DEFAULT 'approved' CHECK (registration_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

UPDATE public.businesses SET registration_status = 'approved' WHERE registration_status IS NULL;

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

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super Admins can view admin audit logs" ON public.admin_audit_logs;
CREATE POLICY "Super Admins can view admin audit logs" ON public.admin_audit_logs FOR SELECT USING (public.is_super_admin());
DROP POLICY IF EXISTS "Super Admins can insert admin audit logs" ON public.admin_audit_logs;
CREATE POLICY "Super Admins can insert admin audit logs" ON public.admin_audit_logs FOR INSERT WITH CHECK (public.is_super_admin());

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

INSERT INTO public.platform_settings (platform_name, tagline)
SELECT 'SamleyBook', 'Book • Manage • Grow'
WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read platform settings" ON public.platform_settings;
CREATE POLICY "Public can read platform settings" ON public.platform_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Super Admins can update platform settings" ON public.platform_settings;
CREATE POLICY "Super Admins can update platform settings" ON public.platform_settings FOR UPDATE USING (public.is_super_admin());
DROP POLICY IF EXISTS "Super Admins can insert platform settings" ON public.platform_settings;
CREATE POLICY "Super Admins can insert platform settings" ON public.platform_settings FOR INSERT WITH CHECK (public.is_super_admin());

-- =====================================================================
-- MULTI-DEVICE BACKGROUND WEB PUSH & OWNER NOTIFICATION SYSTEM
-- =====================================================================
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
  ON public.owner_notifications (user_id, read_at) WHERE read_at IS NULL;
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
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

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
      WHERE n.id = push_delivery_attempts.notification_id AND n.user_id = auth.uid()
    )
    OR public.is_super_admin()
  );

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
  ON public.appointment_owner_reminders (status, scheduled_for) WHERE status = 'pending';
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
  INTO v_tz FROM public.platform_settings LIMIT 1;

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

  IF NOT FOUND OR v_appt.owner_id IS NULL THEN RETURN; END IF;
  IF v_appt.status IN ('cancelled', 'completed') THEN RETURN; END IF;

  v_start_utc := public.compute_appointment_start_utc(v_appt.appointment_date, v_appt.appointment_time);
  IF v_start_utc <= v_now THEN RETURN; END IF;

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
        appointment_id, business_id, owner_id, reminder_type, appointment_start_utc, scheduled_for, status, idempotency_key
      )
      VALUES (
        v_appt.id, v_appt.business_id, v_appt.owner_id, v_type, v_start_utc, v_sched, 'pending', v_idem
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.handle_appointment_owner_notifications()
RETURNS TRIGGER AS $$
DECLARE
  v_biz RECORD;
  v_service_name TEXT;
  v_ref TEXT;
  v_time_label TEXT;
  v_prev_time_label TEXT;
BEGIN
  SELECT id, owner_id, name INTO v_biz FROM public.businesses WHERE id = NEW.business_id;
  IF NOT FOUND OR v_biz.owner_id IS NULL THEN RETURN NEW; END IF;

  SELECT name INTO v_service_name FROM public.services WHERE id = NEW.service_id;
  v_service_name := COALESCE(v_service_name, 'Appointment Service');
  v_ref := UPPER(SUBSTRING(NEW.id::text FROM 1 FOR 8));
  v_time_label := TO_CHAR(NEW.appointment_time, 'HH12:MI AM');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.owner_notifications (
      user_id, business_id, category, title, body, entity_type, entity_id, destination_url, metadata, idempotency_key
    )
    VALUES (
      v_biz.owner_id, v_biz.id, 'new_booking',
      'New Appointment: ' || NEW.customer_name,
      v_service_name || ' • ' || NEW.appointment_date::text || ' at ' || v_time_label || ' (' || v_biz.name || ')',
      'appointment', NEW.id::text, '/app/appointments?appointmentId=' || NEW.id::text,
      jsonb_build_object(
        'appointment_id', NEW.id, 'appointment_ref', v_ref, 'business_name', v_biz.name,
        'customer_name', NEW.customer_name, 'service_name', v_service_name,
        'appointment_date', NEW.appointment_date::text, 'appointment_time', NEW.appointment_time::text
      ),
      'new_booking:' || NEW.id::text
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    PERFORM public.schedule_owner_reminders_for_appointment(NEW.id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
      UPDATE public.appointment_owner_reminders
      SET status = 'cancelled', updated_at = timezone('utc'::text, now())
      WHERE appointment_id = NEW.id AND status IN ('pending', 'failed');

      INSERT INTO public.owner_notifications (
        user_id, business_id, category, title, body, entity_type, entity_id, destination_url, metadata, idempotency_key
      )
      VALUES (
        v_biz.owner_id, v_biz.id, 'cancellation',
        'Appointment Cancelled: ' || NEW.customer_name,
        v_service_name || ' on ' || NEW.appointment_date::text || ' at ' || v_time_label || ' was cancelled.',
        'appointment', NEW.id::text, '/app/appointments?appointmentId=' || NEW.id::text,
        jsonb_build_object(
          'appointment_id', NEW.id, 'appointment_ref', v_ref, 'business_name', v_biz.name,
          'customer_name', NEW.customer_name, 'service_name', v_service_name,
          'appointment_date', NEW.appointment_date::text, 'appointment_time', NEW.appointment_time::text
        ),
        'cancellation:' || NEW.id::text || ':' || NEW.appointment_date::text || ':' || NEW.appointment_time::text
      ) ON CONFLICT (idempotency_key) DO NOTHING;
      RETURN NEW;
    END IF;

    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
      UPDATE public.appointment_owner_reminders
      SET status = 'cancelled', updated_at = timezone('utc'::text, now())
      WHERE appointment_id = NEW.id AND status = 'pending';
    END IF;

    IF (NEW.appointment_date IS DISTINCT FROM OLD.appointment_date OR NEW.appointment_time IS DISTINCT FROM OLD.appointment_time)
       AND NEW.status <> 'cancelled' THEN
      v_prev_time_label := TO_CHAR(OLD.appointment_time, 'HH12:MI AM');

      UPDATE public.appointment_owner_reminders
      SET status = 'superseded', updated_at = timezone('utc'::text, now())
      WHERE appointment_id = NEW.id AND status IN ('pending', 'failed');

      INSERT INTO public.owner_notifications (
        user_id, business_id, category, title, body, entity_type, entity_id, destination_url, metadata, idempotency_key
      )
      VALUES (
        v_biz.owner_id, v_biz.id, 'reschedule',
        'Appointment Rescheduled: ' || NEW.customer_name,
        v_service_name || ' moved from ' || OLD.appointment_date::text || ' ' || v_prev_time_label ||
        ' to ' || NEW.appointment_date::text || ' at ' || v_time_label || '.',
        'appointment', NEW.id::text, '/app/appointments?appointmentId=' || NEW.id::text,
        jsonb_build_object(
          'appointment_id', NEW.id, 'appointment_ref', v_ref, 'business_name', v_biz.name,
          'customer_name', NEW.customer_name, 'service_name', v_service_name,
          'previous_date', OLD.appointment_date::text, 'previous_time', OLD.appointment_time::text,
          'appointment_date', NEW.appointment_date::text, 'appointment_time', NEW.appointment_time::text
        ),
        'reschedule:' || NEW.id::text || ':' || OLD.appointment_date::text || ':' || OLD.appointment_time::text || '->' || NEW.appointment_date::text || ':' || NEW.appointment_time::text
      ) ON CONFLICT (idempotency_key) DO NOTHING;

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

CREATE OR REPLACE FUNCTION public.handle_feedback_owner_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_biz RECORD;
  v_service_name TEXT;
  v_preview TEXT;
BEGIN
  SELECT id, owner_id, name INTO v_biz FROM public.businesses WHERE id = NEW.business_id;
  IF NOT FOUND OR v_biz.owner_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.service_id IS NOT NULL THEN
    SELECT name INTO v_service_name FROM public.services WHERE id = NEW.service_id;
  END IF;

  v_preview := LEFT(TRIM(COALESCE(NEW.feedback, '')), 110);
  IF LENGTH(TRIM(COALESCE(NEW.feedback, ''))) > 110 THEN
    v_preview := v_preview || '...';
  END IF;

  INSERT INTO public.owner_notifications (
    user_id, business_id, category, title, body, entity_type, entity_id, destination_url, metadata, idempotency_key
  )
  VALUES (
    v_biz.owner_id, v_biz.id, 'feedback',
    'New Customer Feedback from ' || NEW.customer_name,
    COALESCE(NULLIF(v_preview, ''), 'A customer submitted verified post-appointment feedback.') ||
    CASE WHEN v_service_name IS NOT NULL THEN ' (' || v_service_name || ')' ELSE '' END,
    'feedback', NEW.id::text, '/app/feedback?feedbackId=' || NEW.id::text,
    jsonb_build_object(
      'feedback_id', NEW.id, 'appointment_id', NEW.appointment_id, 'business_name', v_biz.name,
      'customer_name', NEW.customer_name, 'service_name', COALESCE(v_service_name, 'Service')
    ),
    'feedback:' || NEW.id::text
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_feedback_owner_notification ON public.customer_feedback;
CREATE TRIGGER trg_feedback_owner_notification
  AFTER INSERT ON public.customer_feedback
  FOR EACH ROW EXECUTE FUNCTION public.handle_feedback_owner_notification();

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
`;

