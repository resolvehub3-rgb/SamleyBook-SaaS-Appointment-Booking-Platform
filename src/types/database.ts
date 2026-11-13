/**
 * Database schema type definitions for SamleyBook SaaS
 */

export type UserRole = 'super_admin' | 'business_owner';

export interface Profile {
  id: string; // references auth.users(id)
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessOperatingHours {
  open: string;
  close: string;
  isOpen: boolean;
}

export type BusinessOperatingHoursWeekly = Record<
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday',
  BusinessOperatingHours
>;

export interface Business {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  category: string;
  description?: string | null;
  phone: string;
  email?: string | null;
  address: string;
  logo_url?: string | null;
  operating_hours: BusinessOperatingHoursWeekly;
  is_active: boolean;
  registration_status?: 'pending' | 'approved' | 'rejected' | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminAuditLog {
  id: string;
  admin_id?: string | null;
  admin_email?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
}

export interface PlatformSettings {
  id: string;
  platform_name: string;
  tagline: string;
  allow_new_registrations: boolean;
  require_registration_approval: boolean;
  default_trial_days: number;
  subscription_price_ghs: number;
  subscription_period_days: number;
  timezone: string;
  currency: string;
  email_alerts_enabled: boolean;
  updated_at: string;
  updated_by?: string | null;
}

export interface Service {
  id: string;
  business_id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  price: number;
  duration_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  price_ghs: number;
  billing_cycle: 'monthly' | 'yearly';
  features: string[];
  is_active: boolean;
  created_at: string;
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';

export interface BusinessSubscription {
  id: string;
  business_id: string;
  plan_id?: string | null;
  plan?: SubscriptionPlan | null;
  status: SubscriptionStatus;
  trial_start: string;
  trial_end: string;
  current_period_start: string;
  current_period_end: string;
  payment_status: 'none' | 'pending' | 'paid' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface PaymentConfiguration {
  id: string;
  business_id: string;
  payment_type: 'full' | 'deposit';
  deposit_type: 'percentage' | 'fixed';
  deposit_percentage: number;
  deposit_fixed_amount: number;
  mobile_money_number?: string | null;
  mobile_money_provider: 'MTN MoMo' | 'Telecel Cash' | 'AT Money';
  direct_settlement_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  business_id: string;
  full_name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  total_bookings?: number;
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'deposit_paid' | 'failed' | 'refunded';

export interface Appointment {
  id: string;
  business_id: string;
  service_id: string;
  customer_id?: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  appointment_date: string;
  appointment_time: string;
  end_time: string;
  status: AppointmentStatus;
  payment_status: PaymentStatus;
  service_price: number;
  payment_required: number;
  payment_received: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  service?: Service | null;
  business?: Business | null;
}

export interface PaymentTransaction {
  id: string;
  business_id: string;
  appointment_id?: string | null;
  customer_phone: string;
  amount: number;
  payment_provider: string; // 'Moolre'
  moolre_reference?: string | null;
  provider_reference?: string | null;
  status: 'pending' | 'successful' | 'failed';
  raw_response?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface SmsLog {
  id: string;
  business_id?: string | null;
  recipient_phone: string;
  message_type: 'registration' | 'booking_confirmation' | 'reminder_24h' | 'cancellation';
  message_text: string;
  delivery_status: 'sent' | 'pending' | 'failed';
  provider_reference?: string | null;
  error_message?: string | null;
  sent_at: string;
}

export interface EmailLog {
  id: string;
  business_id?: string | null;
  recipient_email: string;
  subject: string;
  message_type: 'registration' | 'booking_confirmation' | 'cancellation';
  delivery_status: 'sent' | 'pending' | 'failed';
  sent_at: string;
}
