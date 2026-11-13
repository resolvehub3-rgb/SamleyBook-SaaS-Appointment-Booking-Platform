-- =====================================================================
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
    ('Book Premium', 'premium', 'One complete appointment management platform for your business.', 120.00, 'monthly', '["Online appointment booking", "Business dashboard", "Service management", "Customer management", "Appointment management", "Business booking page and QR code", "Customer feedback management", "7-day free trial"]'::jsonb, true)
ON CONFLICT (code) DO NOTHING;

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
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_business ON public.payment_transactions(business_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_appointment ON public.payment_transactions(appointment_id);

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
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.business_subscriptions bs
    WHERE bs.business_id = biz_id
      AND bs.status IN ('trialing', 'active')
      AND bs.current_period_end >= now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id OR public.is_super_admin());

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Businesses Policies
DROP POLICY IF EXISTS "Public can view active businesses for booking" ON public.businesses;
CREATE POLICY "Public can view active businesses for booking"
    ON public.businesses FOR SELECT
    USING (is_active = true OR owner_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "Owners can insert their own businesses" ON public.businesses;
CREATE POLICY "Owners can insert their own businesses"
    ON public.businesses FOR INSERT
    WITH CHECK (owner_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "Owners can update their own businesses" ON public.businesses;
CREATE POLICY "Owners can update their own businesses"
    ON public.businesses FOR UPDATE
    USING (
        (owner_id = auth.uid() AND public.business_subscription_active(id))
        OR public.is_super_admin()
    );

DROP POLICY IF EXISTS "Owners can delete their own businesses" ON public.businesses;
CREATE POLICY "Owners can delete their own businesses"
    ON public.businesses FOR DELETE
    USING (owner_id = auth.uid() OR public.is_super_admin());

-- Services Policies
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
CREATE POLICY "Everyone can view active plans"
    ON public.subscription_plans FOR SELECT
    USING (is_active = true OR public.is_super_admin());

DROP POLICY IF EXISTS "Super Admins can manage plans" ON public.subscription_plans;
CREATE POLICY "Super Admins can manage plans"
    ON public.subscription_plans FOR ALL
    USING (public.is_super_admin());

-- Business Subscriptions Policies
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
        EXISTS (
            SELECT 1 FROM public.businesses b WHERE b.id = business_subscriptions.business_id AND b.owner_id = auth.uid()
        )
        OR public.is_super_admin()
    );

DROP POLICY IF EXISTS "Owners and Admins can update subscription" ON public.business_subscriptions;
CREATE POLICY "Owners and Admins can update subscription"
    ON public.business_subscriptions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.businesses b WHERE b.id = business_subscriptions.business_id AND b.owner_id = auth.uid()
        )
        OR public.is_super_admin()
    );

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
        EXISTS (
            SELECT 1 FROM public.businesses b WHERE b.id = payment_configurations.business_id AND b.owner_id = auth.uid()
        )
        OR public.is_super_admin()
    );

-- Customers Policies
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
        EXISTS (
            SELECT 1 FROM public.businesses b WHERE b.id = payment_transactions.business_id AND b.is_active = true
        )
    );

DROP POLICY IF EXISTS "Owners can update payment transactions" ON public.payment_transactions;
CREATE POLICY "Owners can update payment transactions"
    ON public.payment_transactions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.businesses b WHERE b.id = payment_transactions.business_id AND b.owner_id = auth.uid()
        )
        OR public.is_super_admin()
    );

-- SMS and Email Logs Policies
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
CREATE POLICY "System can insert SMS logs"
    ON public.sms_logs FOR INSERT
    WITH CHECK (true);

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
CREATE POLICY "Public can view business assets"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'business-assets');

-- Storage RLS: Authenticated users can upload assets
DROP POLICY IF EXISTS "Authenticated users can upload business assets" ON storage.objects;
CREATE POLICY "Authenticated users can upload business assets"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'business-assets' AND auth.role() = 'authenticated');

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
