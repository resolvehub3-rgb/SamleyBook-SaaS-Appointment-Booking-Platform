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

export type NotificationCategory =
  | 'new_booking'
  | 'cancellation'
  | 'reschedule'
  | 'reminder_24h'
  | 'reminder_1h'
  | 'reminder_30m'
  | 'feedback'
  | 'subscription'
  | 'security';

export interface OwnerNotification {
  id: string;
  user_id: string;
  business_id?: string | null;
  category: NotificationCategory;
  title: string;
  body: string;
  entity_type?: string | null;
  entity_id?: string | null;
  destination_url: string;
  metadata?: Record<string, unknown> | null;
  idempotency_key?: string | null;
  read_at?: string | null;
  created_at: string;
}

export type PushPlatform = 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'web';

export interface PushSubscriptionRecord {
  id: string;
  user_id: string;
  business_id?: string | null;
  device_id: string;
  device_name: string;
  platform: PushPlatform;
  user_agent?: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  is_active: boolean;
  last_success_at?: string | null;
  last_failure_at?: string | null;
  last_failure_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationPreferences {
  user_id: string;
  new_booking: boolean;
  cancellation: boolean;
  reschedule: boolean;
  reminders_enabled: boolean;
  reminder_24h: boolean;
  reminder_1h: boolean;
  reminder_30m: boolean;
  feedback: boolean;
  subscription: boolean;
  security: boolean;
  hide_lockscreen_details: boolean;
  updated_at?: string;
}

export interface PushDeliveryAttempt {
  id: string;
  notification_id: string;
  push_subscription_id?: string | null;
  status:
    | 'attempted'
    | 'accepted'
    | 'failed_temporary'
    | 'failed_permanent'
    | 'subscription_invalid'
    | 'skipped_preference';
  http_status?: number | null;
  error_message?: string | null;
  attempt_number: number;
  created_at: string;
}

export interface AppointmentOwnerReminder {
  id: string;
  appointment_id: string;
  business_id: string;
  owner_id: string;
  reminder_type: '24h' | '1h' | '30m';
  appointment_start_utc: string;
  scheduled_for: string;
  status: 'pending' | 'sent' | 'cancelled' | 'superseded' | 'skipped_late' | 'failed';
  idempotency_key: string;
  notification_id?: string | null;
  retry_count: number;
  next_retry_at?: string | null;
  processed_at?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}
