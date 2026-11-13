export type AdminPeriod = 'daily' | 'weekly' | 'monthly';

export interface AdminBusinessRecord {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  category: string;
  phone: string;
  email?: string | null;
  address: string;
  is_active: boolean;
  registration_status?: 'pending' | 'approved' | 'rejected' | null;
  rejection_reason?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface AdminAppointmentRecord {
  id: string;
  business_id: string;
  service_id: string;
  customer_id?: string | null;
  customer_name: string;
  customer_phone: string;
  // Intentionally ignored in Super Admin UI per privacy rule
  customer_email?: string | null;
  appointment_date: string; // YYYY-MM-DD
  appointment_time: string; // HH:MM or HH:MM:SS
  end_time: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  payment_status: 'pending' | 'paid' | 'deposit_paid' | 'failed' | 'refunded';
  service_price: number;
  payment_required: number;
  payment_received: number;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
  service?: { id?: string; name?: string; duration_minutes?: number; price?: number } | null;
  business?: { id?: string; name?: string; category?: string; slug?: string } | null;
}

export interface AdminSubscriptionRecord {
  id: string;
  business_id: string;
  plan_id?: string | null;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  trial_start?: string;
  trial_end?: string;
  current_period_start?: string;
  current_period_end: string;
  payment_status: 'none' | 'pending' | 'paid' | 'failed';
  created_at: string;
  updated_at?: string;
  business?: { id?: string; name?: string; category?: string; slug?: string } | null;
  plan?: { name?: string; price_ghs?: number; billing_cycle?: string } | null;
}

export interface AdminPaymentRecord {
  id: string;
  business_id: string;
  appointment_id?: string | null;
  subscription_id?: string | null;
  plan_id?: string | null;
  currency?: string;
  customer_phone?: string | null;
  amount: number;
  payment_provider: string;
  moolre_reference?: string | null;
  provider_reference?: string | null;
  status: 'pending' | 'successful' | 'failed';
  raw_response?: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string;
  business?: { id?: string; name?: string } | null;
}

export interface AdminSmsRecord {
  id: string;
  business_id?: string | null;
  notification_type: string;
  recipient: string;
  submission_status: string;
  delivery_status: string;
  error_details?: string | null;
  sasusync_task_id?: string | null;
  created_at: string;
}

export interface AdminAuditRecord {
  id: string;
  admin_id?: string | null;
  admin_email?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
  source?: 'admin' | 'sms';
}

export interface ExecutiveKpiSummary {
  totalBusinesses: number;
  activeBusinesses: number;
  businessGrowthPct: number | null;
  totalAppointments: number;
  appointmentsInPeriod: number;
  appointmentGrowthPct: number | null;
  verifiedSubscriptionRevenue: number;
  subscriptionRevenueInPeriod: number;
  subscriptionRevenueGrowthPct: number | null;
  activeSubscriptions: number;
  trialBusinesses: number;
  expiredSubscriptions: number;
  smsProcessedInPeriod: number;
  smsDeliveredInPeriod: number;
  smsFailedInPeriod: number;
  smsPendingInPeriod: number;
  pendingRegistrations: number;
}

export interface TrendBucket {
  key: string;
  label: string;
  value: number;
  secondaryValue?: number;
}

export interface AppointmentAdminFilters {
  search: string;
  businessId: string;
  status: string;
  serviceOrCategory: string;
  dateFrom: string;
  dateTo: string;
}

export interface ActivityFeedItem {
  id: string;
  kind: 'business' | 'appointment' | 'payment' | 'sms' | 'admin';
  title: string;
  description: string;
  timestamp: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}

export function isSubscriptionPayment(payment: Pick<AdminPaymentRecord, 'subscription_id' | 'appointment_id'>): boolean {
  return Boolean(payment.subscription_id) || !payment.appointment_id;
}

export function isVerifiedSubscriptionPayment(payment: Pick<AdminPaymentRecord, 'subscription_id' | 'appointment_id' | 'status'>): boolean {
  return isSubscriptionPayment(payment) && payment.status === 'successful';
}

export function getEffectiveRegistrationStatus(
  business: Pick<AdminBusinessRecord, 'registration_status' | 'is_active'>
): 'pending' | 'approved' | 'rejected' {
  if (business.registration_status === 'pending' || business.registration_status === 'rejected' || business.registration_status === 'approved') {
    return business.registration_status;
  }
  return 'approved';
}

export function computePeriodGrowth(current: number, previous: number): number | null {
  if (previous <= 0) {
    return current === 0 ? 0 : null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function getWindowBounds(now: Date, days: number): { currentStart: Date; previousStart: Date } {
  const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const previousStart = new Date(currentStart.getTime() - days * 24 * 60 * 60 * 1000);
  return { currentStart, previousStart };
}

export function computeExecutiveKPIs(
  params: {
    businesses: AdminBusinessRecord[];
    appointments: AdminAppointmentRecord[];
    subscriptions: AdminSubscriptionRecord[];
    payments: AdminPaymentRecord[];
    smsNotifications: AdminSmsRecord[];
  },
  periodDays = 30,
  now: Date = new Date()
): ExecutiveKpiSummary {
  const { businesses, appointments, subscriptions, payments, smsNotifications } = params;
  const { currentStart, previousStart } = getWindowBounds(now, periodDays);

  const bizCurrent = businesses.filter((b) => new Date(b.created_at) >= currentStart).length;
  const bizPrevious = businesses.filter((b) => {
    const d = new Date(b.created_at);
    return d >= previousStart && d < currentStart;
  }).length;

  const apptCurrent = appointments.filter((a) => new Date(a.created_at) >= currentStart).length;
  const apptPrevious = appointments.filter((a) => {
    const d = new Date(a.created_at);
    return d >= previousStart && d < currentStart;
  }).length;

  const verifiedSubPayments = payments.filter(isVerifiedSubscriptionPayment);
  const verifiedSubscriptionRevenue = verifiedSubPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const revCurrent = verifiedSubPayments
    .filter((p) => new Date(p.created_at) >= currentStart)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const revPrevious = verifiedSubPayments
    .filter((p) => {
      const d = new Date(p.created_at);
      return d >= previousStart && d < currentStart;
    })
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const smsInPeriod = smsNotifications.filter((s) => new Date(s.created_at) >= currentStart);
  const smsDeliveredInPeriod = smsInPeriod.filter((s) => s.delivery_status === 'delivered').length;
  const smsFailedInPeriod = smsInPeriod.filter(
    (s) => s.delivery_status === 'failed' || s.delivery_status === 'expired'
  ).length;
  const smsPendingInPeriod = smsInPeriod.filter(
    (s) => s.delivery_status === 'queued' || s.delivery_status === 'sent' || s.delivery_status === 'pending'
  ).length;

  return {
    totalBusinesses: businesses.length,
    activeBusinesses: businesses.filter((b) => b.is_active).length,
    businessGrowthPct: computePeriodGrowth(bizCurrent, bizPrevious),
    totalAppointments: appointments.length,
    appointmentsInPeriod: apptCurrent,
    appointmentGrowthPct: computePeriodGrowth(apptCurrent, apptPrevious),
    verifiedSubscriptionRevenue,
    subscriptionRevenueInPeriod: revCurrent,
    subscriptionRevenueGrowthPct: computePeriodGrowth(revCurrent, revPrevious),
    activeSubscriptions: subscriptions.filter((s) => s.status === 'active').length,
    trialBusinesses: subscriptions.filter((s) => s.status === 'trialing').length,
    expiredSubscriptions: subscriptions.filter((s) => s.status === 'expired' || s.status === 'canceled').length,
    smsProcessedInPeriod: smsInPeriod.length,
    smsDeliveredInPeriod,
    smsFailedInPeriod,
    smsPendingInPeriod,
    pendingRegistrations: businesses.filter((b) => getEffectiveRegistrationStatus(b) === 'pending').length,
  };
}

function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMondayStart(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function buildTimeBuckets(period: AdminPeriod, now: Date): { key: string; label: string; start: Date; end: Date }[] {
  const buckets: { key: string; label: string; start: Date; end: Date }[] = [];
  if (period === 'daily') {
    for (let i = 13; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
      const label = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      buckets.push({ key: toLocalYmd(start), label, start, end });
    }
    return buckets;
  }

  if (period === 'weekly') {
    const thisMonday = getMondayStart(now);
    for (let i = 7; i >= 0; i--) {
      const start = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - i * 7);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      const label = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      buckets.push({ key: toLocalYmd(start), label: `Wk ${label}`, start, end });
    }
    return buckets;
  }

  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const label = start.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    buckets.push({ key, label, start, end });
  }
  return buckets;
}

export function buildAppointmentTrendSeries(
  appointments: AdminAppointmentRecord[],
  period: AdminPeriod,
  now: Date = new Date()
): TrendBucket[] {
  const buckets = buildTimeBuckets(period, now);
  return buckets.map((bucket) => {
    const matching = appointments.filter((a) => {
      const parts = a.appointment_date.split('-').map(Number);
      if (parts.length !== 3 || parts.some(Number.isNaN)) return false;
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return d >= bucket.start && d < bucket.end;
    });
    return {
      key: bucket.key,
      label: bucket.label,
      value: matching.length,
      secondaryValue: matching.filter((m) => m.status === 'completed' || m.status === 'confirmed').length,
    };
  });
}

export function buildAppointmentStatusBreakdown(appointments: AdminAppointmentRecord[]): {
  status: AdminAppointmentRecord['status'];
  label: string;
  count: number;
  percentage: number;
}[] {
  const total = appointments.length;
  const statuses: { status: AdminAppointmentRecord['status']; label: string }[] = [
    { status: 'confirmed', label: 'Confirmed' },
    { status: 'pending', label: 'Pending' },
    { status: 'completed', label: 'Completed' },
    { status: 'cancelled', label: 'Cancelled' },
  ];
  return statuses.map((item) => {
    const count = appointments.filter((a) => a.status === item.status).length;
    return {
      ...item,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });
}

export function buildSubscriptionRevenueSeries(
  payments: AdminPaymentRecord[],
  period: AdminPeriod,
  now: Date = new Date()
): TrendBucket[] {
  const verified = payments.filter(isVerifiedSubscriptionPayment);
  const buckets = buildTimeBuckets(period, now);
  return buckets.map((bucket) => {
    const matching = verified.filter((p) => {
      const d = new Date(p.created_at);
      return d >= bucket.start && d < bucket.end;
    });
    return {
      key: bucket.key,
      label: bucket.label,
      value: Number(matching.reduce((sum, p) => sum + Number(p.amount || 0), 0).toFixed(2)),
      secondaryValue: matching.length,
    };
  });
}

export function buildBusinessGrowthSeries(
  businesses: AdminBusinessRecord[],
  period: AdminPeriod,
  now: Date = new Date()
): TrendBucket[] {
  const buckets = buildTimeBuckets(period, now);
  return buckets.map((bucket) => {
    const newCount = businesses.filter((b) => {
      const d = new Date(b.created_at);
      return d >= bucket.start && d < bucket.end;
    }).length;
    const cumulative = businesses.filter((b) => new Date(b.created_at) < bucket.end).length;
    return {
      key: bucket.key,
      label: bucket.label,
      value: newCount,
      secondaryValue: cumulative,
    };
  });
}

export function buildBusinessCategoryDistribution(businesses: AdminBusinessRecord[]): {
  category: string;
  count: number;
  percentage: number;
}[] {
  const total = businesses.length;
  if (total === 0) return [];
  const counts = new Map<string, number>();
  for (const b of businesses) {
    const cat = (b.category || 'Uncategorized').trim() || 'Uncategorized';
    counts.set(cat, (counts.get(cat) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({
      category,
      count,
      percentage: Math.round((count / total) * 100),
    }));
}

export function formatBookingRef(appointmentId: string): string {
  const compact = (appointmentId || '').replace(/-/g, '').toUpperCase();
  return `SB-${compact.slice(0, 6) || '000000'}`;
}

export function filterAdminAppointments(
  appointments: AdminAppointmentRecord[],
  filters: AppointmentAdminFilters
): AdminAppointmentRecord[] {
  const q = filters.search.trim().toLowerCase();
  const catOrSvc = filters.serviceOrCategory.trim().toLowerCase();

  return appointments.filter((a) => {
    if (filters.businessId && filters.businessId !== 'all' && a.business_id !== filters.businessId) {
      return false;
    }
    if (filters.status && filters.status !== 'all' && a.status !== filters.status) {
      return false;
    }
    if (catOrSvc && catOrSvc !== 'all') {
      const svcName = (a.service?.name || '').toLowerCase();
      const bizCat = (a.business?.category || '').toLowerCase();
      if (svcName !== catOrSvc && bizCat !== catOrSvc && !svcName.includes(catOrSvc) && !bizCat.includes(catOrSvc)) {
        return false;
      }
    }
    if (filters.dateFrom && a.appointment_date < filters.dateFrom) {
      return false;
    }
    if (filters.dateTo && a.appointment_date > filters.dateTo) {
      return false;
    }
    if (q) {
      const ref = formatBookingRef(a.id).toLowerCase();
      const fields = [
        a.customer_name || '',
        a.customer_phone || '',
        a.business?.name || '',
        a.service?.name || '',
        a.id || '',
        ref,
      ];
      if (!fields.some((f) => f.toLowerCase().includes(q))) {
        return false;
      }
    }
    return true;
  });
}

export function computeAppointmentAdminSummary(
  appointments: AdminAppointmentRecord[],
  now: Date = new Date()
) {
  const todayStr = toLocalYmd(now);
  const todaysAppointments = appointments.filter((a) => a.appointment_date === todayStr);
  return {
    total: appointments.length,
    confirmed: appointments.filter((a) => a.status === 'confirmed').length,
    pending: appointments.filter((a) => a.status === 'pending').length,
    completed: appointments.filter((a) => a.status === 'completed').length,
    cancelled: appointments.filter((a) => a.status === 'cancelled').length,
    todayCount: todaysAppointments.length,
    businessesWithBookingsToday: new Set(todaysAppointments.map((a) => a.business_id)).size,
  };
}

export function canTransitionAppointmentStatus(
  currentStatus: AdminAppointmentRecord['status'],
  nextStatus: AdminAppointmentRecord['status']
): { allowed: boolean; reason?: string } {
  if (currentStatus === nextStatus) {
    return { allowed: false, reason: `Appointment is already ${currentStatus}.` };
  }
  if (currentStatus === 'completed') {
    return { allowed: false, reason: 'Completed appointments cannot be reverted or cancelled.' };
  }
  if (currentStatus === 'cancelled') {
    return { allowed: false, reason: 'Cancelled appointments are preserved as archived records and cannot change status.' };
  }
  if (currentStatus === 'pending') {
    if (nextStatus === 'confirmed' || nextStatus === 'completed' || nextStatus === 'cancelled') {
      return { allowed: true };
    }
  }
  if (currentStatus === 'confirmed') {
    if (nextStatus === 'completed' || nextStatus === 'cancelled') {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Confirmed appointments cannot return to pending.' };
  }
  return { allowed: false, reason: 'Unsupported appointment status transition.' };
}

export function canRescheduleAppointment(
  currentStatus: AdminAppointmentRecord['status']
): { allowed: boolean; reason?: string } {
  if (currentStatus === 'completed' || currentStatus === 'cancelled') {
    return { allowed: false, reason: `Cannot reschedule a ${currentStatus} appointment.` };
  }
  return { allowed: true };
}

export function isExpiringSoon(sub: Pick<AdminSubscriptionRecord, 'status' | 'current_period_end'>, now: Date = new Date(), days = 3): boolean {
  if (sub.status !== 'active' && sub.status !== 'trialing') return false;
  const end = new Date(sub.current_period_end);
  const diffMs = end.getTime() - now.getTime();
  return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000;
}

export function buildChronologicalActivityFeed(
  params: {
    businesses: AdminBusinessRecord[];
    appointments: AdminAppointmentRecord[];
    payments: AdminPaymentRecord[];
    smsNotifications: AdminSmsRecord[];
    auditLogs: AdminAuditRecord[];
  },
  limit = 16
): ActivityFeedItem[] {
  const items: ActivityFeedItem[] = [];

  for (const b of params.businesses.slice(0, 20)) {
    const regStatus = getEffectiveRegistrationStatus(b);
    items.push({
      id: `biz-${b.id}`,
      kind: 'business',
      title: regStatus === 'pending' ? `New business registration: ${b.name}` : `Business onboarded: ${b.name}`,
      description: `${b.category} · ${b.address || b.phone}`,
      timestamp: b.created_at,
      tone: regStatus === 'pending' ? 'warning' : regStatus === 'rejected' ? 'danger' : 'info',
    });
  }

  for (const a of params.appointments.slice(0, 20)) {
    items.push({
      id: `appt-${a.id}`,
      kind: 'appointment',
      title: `Appointment ${a.status}: ${a.customer_name}`,
      description: `${a.business?.name || 'Business'} · ${a.service?.name || 'Service'} (${a.appointment_date})`,
      timestamp: a.updated_at || a.created_at,
      tone:
        a.status === 'completed'
          ? 'success'
          : a.status === 'cancelled'
          ? 'danger'
          : a.status === 'confirmed'
          ? 'info'
          : 'warning',
    });
  }

  for (const p of params.payments.slice(0, 20)) {
    const isSub = isSubscriptionPayment(p);
    items.push({
      id: `pay-${p.id}`,
      kind: 'payment',
      title: `${isSub ? 'Subscription' : 'Booking'} payment ${p.status}: GH₵${Number(p.amount || 0).toFixed(2)}`,
      description: `${p.business?.name || 'Business'} · ${p.moolre_reference || p.provider_reference || p.payment_provider}`,
      timestamp: p.created_at,
      tone: p.status === 'successful' ? 'success' : p.status === 'failed' ? 'danger' : 'warning',
    });
  }

  for (const s of params.smsNotifications.filter((x) => x.delivery_status === 'failed' || x.delivery_status === 'delivered').slice(0, 15)) {
    items.push({
      id: `sms-${s.id}`,
      kind: 'sms',
      title: `SMS ${s.delivery_status}: ${s.notification_type.replace(/_/g, ' ')}`,
      description: `Recipient ${s.recipient}${s.error_details ? ` · ${s.error_details}` : ''}`,
      timestamp: s.created_at,
      tone: s.delivery_status === 'delivered' ? 'success' : 'danger',
    });
  }

  for (const log of params.auditLogs.slice(0, 20)) {
    items.push({
      id: `audit-${log.id}`,
      kind: 'admin',
      title: `Admin action: ${log.action.replace(/_/g, ' ')}`,
      description: `${log.entity_type}${log.admin_email ? ` · by ${log.admin_email}` : ''}`,
      timestamp: log.created_at,
      tone: 'neutral',
    });
  }

  return items
    .filter((i) => i.timestamp)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}
