import {
  CALENDAR_EVENT_THEMES,
  hashCalendarSeed,
} from '../../utils/dashboard-analytics';

export type AdminSectionId =
  | 'dashboard'
  | 'businesses'
  | 'registrations'
  | 'appointments'
  | 'subscriptions'
  | 'payments'
  | 'sms'
  | 'settings'
  | 'audit'
  | 'monitoring';

export const ADMIN_SECTION_META: Record<
  AdminSectionId,
  { title: string; subtitle: string }
> = {
  dashboard: {
    title: 'Executive Platform Dashboard',
    subtitle: 'Real-time overview across businesses, appointments, subscriptions, and communications',
  },
  businesses: {
    title: 'Business Overview',
    subtitle: 'Directory, service catalog inspection, and operational status for all registered tenants',
  },
  registrations: {
    title: 'Business Registrations',
    subtitle: 'Review pending onboarding requests, approval decisions, and registration history',
  },
  appointments: {
    title: 'Appointment Management',
    subtitle: 'Platform-wide booking monitoring, calendar timeline, and audited interventions',
  },
  subscriptions: {
    title: 'Business Subscriptions',
    subtitle: 'Book Premium plan tracking (GH₵120 / 30 days · 7-day free trial)',
  },
  payments: {
    title: 'Payment Records',
    subtitle: 'Verified Moolre subscription settlements and service-booking transaction audit',
  },
  sms: {
    title: 'SMS Management',
    subtitle: 'SasuSync gateway controls, templates, delivery tracking, and per-business usage',
  },
  settings: {
    title: 'Platform Settings',
    subtitle: 'Global onboarding, trial defaults, and database setup controls',
  },
  audit: {
    title: 'Security & Audit Logs',
    subtitle: 'Immutable trail of Super Admin interventions, approvals, and configuration changes',
  },
  monitoring: {
    title: 'System Monitoring',
    subtitle: 'Live server health probes, connectivity readiness, and error indicators',
  },
};

export const ADMIN_CARD = 'rounded-2xl bg-white border border-slate-200/80 shadow-xs';

export const APPOINTMENT_STATUS_BADGES: Record<string, string> = {
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

export const PAYMENT_STATUS_BADGES: Record<string, string> = {
  successful: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  deposit_paid: 'bg-blue-50 text-blue-700 border-blue-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  refunded: 'bg-slate-100 text-slate-700 border-slate-200',
};

export const SUBSCRIPTION_STATUS_BADGES: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  trialing: 'bg-amber-50 text-amber-700 border-amber-200',
  past_due: 'bg-orange-50 text-orange-700 border-orange-200',
  expired: 'bg-red-50 text-red-700 border-red-200',
  canceled: 'bg-slate-100 text-slate-700 border-slate-200',
};

export const REGISTRATION_STATUS_BADGES: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};


export interface AdminCalendarColorTheme {
  name: string;
  bg: string;
  border: string;
  borderAll: string;
  text: string;
  subText: string;
  pill: string;
  dot: string;
  accentHex: string;
}

export const BUSINESS_COLOR_PALETTE: AdminCalendarColorTheme[] = CALENDAR_EVENT_THEMES.map(
  (t) => ({
    name: t.name,
    bg: t.bg,
    border: t.border,
    borderAll: t.borderAll,
    text: t.titleText,
    subText: t.subText,
    pill: t.pill,
    dot: t.dot,
    accentHex: t.accentHex,
  })
);

export function getBusinessColor(businessId: string): AdminCalendarColorTheme {
  const hash = hashCalendarSeed(businessId || 'business');
  return BUSINESS_COLOR_PALETTE[hash % BUSINESS_COLOR_PALETTE.length];
}


export function formatCurrencyGhs(amount: number): string {
  return `GH₵${Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatAdminDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatAdminDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
