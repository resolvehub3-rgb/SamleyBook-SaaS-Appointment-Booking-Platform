import React, { useMemo, useState } from 'react';
import {
  Building2,
  CalendarDays,
  CreditCard,
  Clock,
  MessageSquare,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Activity,
  ExternalLink,
  ShieldCheck,
  PieChart,
} from 'lucide-react';
import {
  AdminAppointmentRecord,
  AdminAuditRecord,
  AdminBusinessRecord,
  AdminPaymentRecord,
  AdminPeriod,
  AdminSmsRecord,
  AdminSubscriptionRecord,
  buildAppointmentStatusBreakdown,
  buildAppointmentTrendSeries,
  buildBusinessCategoryDistribution,
  buildBusinessGrowthSeries,
  buildChronologicalActivityFeed,
  buildSubscriptionRevenueSeries,
  computeExecutiveKPIs,
  getEffectiveRegistrationStatus,
  isSubscriptionPayment,
} from '../../utils/admin-analytics';
import { formatTimeRange12h } from '../../utils/dashboard-analytics';
import {
  AdminBarChart,
  AdminLineAreaChart,
  AdminStatusDonut,
  PeriodSwitcher,
} from './AdminCharts';
import {
  ADMIN_CARD,
  APPOINTMENT_STATUS_BADGES,
  AdminSectionId,
  PAYMENT_STATUS_BADGES,
  REGISTRATION_STATUS_BADGES,
  formatAdminDate,
  formatAdminDateTime,
  formatCurrencyGhs,
} from './AdminTokens';

export interface SystemHealthCheckItem {
  key: string;
  label: string;
  status: 'healthy' | 'degraded' | 'unconfigured' | 'unknown';
  detail: string;
}

interface ExecutiveDashboardViewProps {
  businesses: AdminBusinessRecord[];
  appointments: AdminAppointmentRecord[];
  subscriptions: AdminSubscriptionRecord[];
  payments: AdminPaymentRecord[];
  smsNotifications: AdminSmsRecord[];
  auditLogs: AdminAuditRecord[];
  healthChecks: SystemHealthCheckItem[];
  healthError: string | null;
  onNavigateSection: (section: AdminSectionId) => void;
  onInspectBusiness: (businessId: string) => void;
  onInspectAppointment: (appointment: AdminAppointmentRecord) => void;
}

function renderGrowthPill(pct: number | null, suffix = 'vs prior 30d') {
  if (pct === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
        <TrendingUp className="w-3 h-3" />
        New activity
      </span>
    );
  }
  const positive = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums ${
        positive ? 'text-emerald-700' : 'text-red-600'
      }`}
    >
      {positive ? `+${pct}%` : `${pct}%`} {suffix}
    </span>
  );
}

export const ExecutiveDashboardView: React.FC<ExecutiveDashboardViewProps> = ({
  businesses,
  appointments,
  subscriptions,
  payments,
  smsNotifications,
  auditLogs,
  healthChecks,
  healthError,
  onNavigateSection,
  onInspectBusiness,
  onInspectAppointment,
}) => {
  const [apptPeriod, setApptPeriod] = useState<AdminPeriod>('daily');
  const [revPeriod, setRevPeriod] = useState<AdminPeriod>('monthly');
  const [bizPeriod, setBizPeriod] = useState<AdminPeriod>('monthly');

  const kpis = useMemo(
    () =>
      computeExecutiveKPIs(
        { businesses, appointments, subscriptions, payments, smsNotifications },
        30
      ),
    [businesses, appointments, subscriptions, payments, smsNotifications]
  );

  const apptTrendSeries = useMemo(
    () => buildAppointmentTrendSeries(appointments, apptPeriod),
    [appointments, apptPeriod]
  );
  const statusBreakdown = useMemo(
    () => buildAppointmentStatusBreakdown(appointments),
    [appointments]
  );
  const revenueSeries = useMemo(
    () => buildSubscriptionRevenueSeries(payments, revPeriod),
    [payments, revPeriod]
  );
  const bizGrowthSeries = useMemo(
    () => buildBusinessGrowthSeries(businesses, bizPeriod),
    [businesses, bizPeriod]
  );
  const categoryDist = useMemo(
    () => buildBusinessCategoryDistribution(businesses),
    [businesses]
  );
  const activityFeed = useMemo(
    () =>
      buildChronologicalActivityFeed(
        { businesses, appointments, payments, smsNotifications, auditLogs },
        10
      ),
    [businesses, appointments, payments, smsNotifications, auditLogs]
  );

  const recentBusinesses = useMemo(
    () =>
      [...businesses]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5),
    [businesses]
  );

  const recentAppointments = useMemo(
    () =>
      [...appointments]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 6),
    [appointments]
  );

  const recentPayments = useMemo(
    () =>
      [...payments]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 6),
    [payments]
  );

  const kpiCards = [
    {
      label: 'Total Businesses',
      value: String(kpis.totalBusinesses),
      sub: `${kpis.activeBusinesses} active · ${kpis.pendingRegistrations} pending`,
      footer: renderGrowthPill(kpis.businessGrowthPct),
      icon: Building2,
      iconBg: 'bg-blue-50 text-blue-600',
      onClick: () => onNavigateSection('businesses'),
    },
    {
      label: 'Total Appointments',
      value: String(kpis.totalAppointments),
      sub: `${kpis.appointmentsInPeriod} booked in last 30d`,
      footer: renderGrowthPill(kpis.appointmentGrowthPct),
      icon: CalendarDays,
      iconBg: 'bg-orange-50 text-[#E87936]',
      onClick: () => onNavigateSection('appointments'),
    },
    {
      label: 'Subscription Revenue',
      value: formatCurrencyGhs(kpis.verifiedSubscriptionRevenue),
      sub: `${formatCurrencyGhs(kpis.subscriptionRevenueInPeriod)} verified in 30d`,
      footer: renderGrowthPill(kpis.subscriptionRevenueGrowthPct),
      icon: CreditCard,
      iconBg: 'bg-emerald-50 text-emerald-600',
      onClick: () => onNavigateSection('payments'),
    },
    {
      label: 'Active Subscriptions',
      value: String(kpis.activeSubscriptions),
      sub: `${kpis.expiredSubscriptions} expired / inactive`,
      footer: (
        <span className="text-[11px] font-semibold text-slate-500">GH₵120 / 30d plan</span>
      ),
      icon: ShieldCheck,
      iconBg: 'bg-emerald-50 text-emerald-700',
      onClick: () => onNavigateSection('subscriptions'),
    },
    {
      label: 'Trial Businesses',
      value: String(kpis.trialBusinesses),
      sub: '7-day free trial active',
      footer: (
        <span className="text-[11px] font-semibold text-amber-700">Monitoring conversion</span>
      ),
      icon: Clock,
      iconBg: 'bg-amber-50 text-amber-600',
      onClick: () => onNavigateSection('subscriptions'),
    },
    {
      label: 'SMS Processed (30d)',
      value: String(kpis.smsProcessedInPeriod),
      sub: `${kpis.smsDeliveredInPeriod} delivered · ${kpis.smsFailedInPeriod} failed`,
      footer: (
        <span className="text-[11px] font-semibold text-slate-500">
          {kpis.smsPendingInPeriod} queued / pending
        </span>
      ),
      icon: MessageSquare,
      iconBg: 'bg-slate-100 text-[#14243B]',
      onClick: () => onNavigateSection('sms'),
    },
  ];

  const apptSeriesTotal = useMemo(
    () => apptTrendSeries.reduce((sum, b) => sum + b.value, 0),
    [apptTrendSeries]
  );
  const apptSeriesActiveTotal = useMemo(
    () => apptTrendSeries.reduce((sum, b) => sum + (b.secondaryValue || 0), 0),
    [apptTrendSeries]
  );
  const apptPeakBucket = useMemo(() => {
    if (apptTrendSeries.length === 0) return null;
    const peak = apptTrendSeries.reduce((best, curr) => (curr.value > best.value ? curr : best), apptTrendSeries[0]);
    return peak.value > 0 ? peak : null;
  }, [apptTrendSeries]);

  const confirmedCount = statusBreakdown.find((s) => s.status === 'confirmed')?.count || 0;
  const completedCount = statusBreakdown.find((s) => s.status === 'completed')?.count || 0;
  const pendingCount = statusBreakdown.find((s) => s.status === 'pending')?.count || 0;
  const fulfilmentRatePct =
    appointments.length > 0
      ? Math.round(((confirmedCount + completedCount) / appointments.length) * 100)
      : 0;

  const revenueSeriesTotal = useMemo(
    () => revenueSeries.reduce((sum, b) => sum + b.value, 0),
    [revenueSeries]
  );
  const revenueSeriesPaymentCount = useMemo(
    () => revenueSeries.reduce((sum, b) => sum + (b.secondaryValue || 0), 0),
    [revenueSeries]
  );

  const periodWindowLabel = (p: AdminPeriod) =>
    p === 'daily' ? 'Last 14 days' : p === 'weekly' ? 'Last 8 weeks' : 'Last 6 months';

  const formatCompactGhsAxis = (val: number) => {
    if (val === 0) return '₵0';
    if (val >= 1000) return `₵${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`;
    return `₵${val}`;
  };

  return (
    <div className="space-y-6">
      {/* 6 Executive KPI Cards */}
      <section aria-label="Executive Key Metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={card.onClick}
              className={`${ADMIN_CARD} p-4 text-left hover:border-slate-300 hover:shadow-md transition-all flex flex-col justify-between gap-3 group`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 leading-snug">
                  {card.label}
                </span>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${card.iconBg}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-extrabold text-[#14243B] tracking-tight tabular-nums">
                  {card.value}
                </p>
                <p className="text-[11px] text-slate-500 mt-1 truncate">{card.sub}</p>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                {card.footer}
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#E87936] transition shrink-0" />
              </div>
            </button>
          );
        })}
      </section>

      {/* Primary 3-Column Analytics Grid: Appointment Trends, Status Breakdown & Subscription Revenue */}
      <section
        aria-label="Platform Analytics Overview"
        className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch"
      >
        {/* Column 1: Appointment Trends */}
        <div className={`${ADMIN_CARD} p-5 flex flex-col gap-4 h-full`}>
          <div className="flex flex-wrap items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#E87936] flex items-center justify-center shrink-0 mt-0.5">
                <CalendarDays className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-[#14243B] leading-snug">Appointment Trends</h2>
                <p className="text-[11px] text-slate-500 truncate">Scheduled bookings across platform</p>
              </div>
            </div>
            <PeriodSwitcher value={apptPeriod} onChange={setApptPeriod} />
          </div>

          <div className="flex items-baseline justify-between gap-2 px-1">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-xl font-extrabold text-[#14243B] tabular-nums tracking-tight">
                {apptSeriesTotal}
              </span>
              <span className="text-[11px] font-medium text-slate-500 truncate">
                bookings · {apptSeriesActiveTotal} active/done
              </span>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <AdminLineAreaChart
              data={apptTrendSeries}
              accentColor="#E87936"
              secondaryLabel="confirmed/completed"
              emptyText="No appointments scheduled in this timeframe yet."
            />
          </div>

          <div className="pt-3 mt-auto border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>{periodWindowLabel(apptPeriod)}</span>
            <span className="font-semibold text-[#14243B] tabular-nums truncate">
              {apptPeakBucket ? `Peak: ${apptPeakBucket.label} (${apptPeakBucket.value})` : 'No peak yet'}
            </span>
          </div>
        </div>

        {/* Column 2: Appointment Status Breakdown */}
        <div className={`${ADMIN_CARD} p-5 flex flex-col gap-4 h-full`}>
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                <PieChart className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-[#14243B] leading-snug">
                  Appointment Status Breakdown
                </h2>
                <p className="text-[11px] text-slate-500 truncate">
                  Live distribution across all bookings
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-2 px-1">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-xl font-extrabold text-[#14243B] tabular-nums tracking-tight">
                {fulfilmentRatePct}%
              </span>
              <span className="text-[11px] font-medium text-slate-500 truncate">
                confirmed/completed rate
              </span>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <AdminStatusDonut items={statusBreakdown} total={appointments.length} />
          </div>

          <div className="pt-3 mt-auto border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-500 tabular-nums">
            <span>Confirmed & done: {confirmedCount + completedCount}</span>
            <span className="font-semibold text-[#14243B]">Pending: {pendingCount}</span>
          </div>
        </div>

        {/* Column 3: Subscription Revenue Analytics */}
        <div className={`${ADMIN_CARD} p-5 flex flex-col gap-4 h-full`}>
          <div className="flex flex-wrap items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                <CreditCard className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-[#14243B] leading-snug">
                  Subscription Revenue Analytics
                </h2>
                <p className="text-[11px] text-slate-500 truncate">
                  Verified SamleyBook settlements (GH₵)
                </p>
              </div>
            </div>
            <PeriodSwitcher value={revPeriod} onChange={setRevPeriod} />
          </div>

          <div className="flex items-baseline justify-between gap-2 px-1">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-xl font-extrabold text-emerald-700 tabular-nums tracking-tight">
                {formatCurrencyGhs(revenueSeriesTotal)}
              </span>
              <span className="text-[11px] font-medium text-slate-500 truncate tabular-nums">
                in series · {formatCurrencyGhs(kpis.verifiedSubscriptionRevenue)} all-time
              </span>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <AdminLineAreaChart
              data={revenueSeries}
              accentColor="#16A34A"
              secondaryLabel="verified payments"
              valueFormatter={(v) => formatCurrencyGhs(v)}
              axisFormatter={formatCompactGhsAxis}
              emptyText="No verified subscription payments recorded in this timeframe yet."
            />
          </div>

          <div className="pt-3 mt-auto border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>{periodWindowLabel(revPeriod)} · Verified only</span>
            <span className="font-semibold text-[#14243B] tabular-nums">
              {revenueSeriesPaymentCount} {revenueSeriesPaymentCount === 1 ? 'settlement' : 'settlements'}
            </span>
          </div>
        </div>
      </section>

      {/* Secondary Analytics Row: Business Growth & Category Distribution */}
      <section className={`${ADMIN_CARD} p-5 space-y-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-[#14243B] flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#14243B]">Business Growth & Categories</h2>
              <p className="text-xs text-slate-500">Newly onboarded tenants and active category share</p>
            </div>
          </div>
          <PeriodSwitcher value={bizPeriod} onChange={setBizPeriod} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7">
            <AdminBarChart
              data={bizGrowthSeries}
              barColor="#14243B"
              emptyText="No new business registrations recorded in this timeframe."
            />
          </div>

          <div className="lg:col-span-5 lg:border-l lg:border-slate-100 lg:pl-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Category Share
              </h3>
              <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                {businesses.length} {businesses.length === 1 ? 'business' : 'businesses'}
              </span>
            </div>
            {categoryDist.length === 0 ? (
              <div className="py-10 text-center rounded-xl bg-[#F5F6F8]/70 border border-dashed border-slate-200 text-xs text-slate-500">
                No registered business categories yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {categoryDist.slice(0, 6).map((cat) => (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-semibold text-[#14243B] truncate">{cat.category}</span>
                      <span className="font-bold text-[#14243B] tabular-nums shrink-0">
                        {cat.count} <span className="text-slate-400 font-medium">({cat.percentage}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#14243B]"
                        style={{ width: `${cat.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Operational Tables Row: Recent Business Registrations + Recent Platform Appointments */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Recent Business Registrations */}
        <div className={`${ADMIN_CARD} xl:col-span-5 overflow-hidden flex flex-col`}>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[#14243B]">Recent Business Registrations</h2>
              <p className="text-xs text-slate-500">Latest businesses onboarded to SamleyBook</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('registrations')}
              className="text-xs font-bold text-[#E87936] hover:underline flex items-center gap-1 shrink-0"
            >
              <span>Review Queue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-slate-100 flex-1">
            {recentBusinesses.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No businesses registered yet.</div>
            ) : (
              recentBusinesses.map((b) => {
                const reg = getEffectiveRegistrationStatus(b);
                return (
                  <div key={b.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-[#14243B] truncate">{b.name}</p>
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${
                            REGISTRATION_STATUS_BADGES[reg] || REGISTRATION_STATUS_BADGES.approved
                          }`}
                        >
                          {reg}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {b.category} · Registered {formatAdminDate(b.created_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onInspectBusiness(b.id)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-[#14243B] hover:border-[#E87936] hover:text-[#E87936] transition shrink-0"
                    >
                      View Details
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Platform Appointments */}
        <div className={`${ADMIN_CARD} xl:col-span-7 overflow-hidden flex flex-col`}>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[#14243B]">Recent Platform Appointments</h2>
              <p className="text-xs text-slate-500">Latest bookings across all businesses</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('appointments')}
              className="text-xs font-bold text-[#E87936] hover:underline flex items-center gap-1 shrink-0"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F5F6F8] text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200/80">
                <tr>
                  <th className="py-2.5 px-4">Customer</th>
                  <th className="py-2.5 px-4">Business</th>
                  <th className="py-2.5 px-4">Schedule</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentAppointments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-500 text-xs">
                      No platform appointments recorded yet.
                    </td>
                  </tr>
                ) : (
                  recentAppointments.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <p className="font-bold text-[#14243B]">{a.customer_name}</p>
                        <p className="text-[11px] text-slate-500 tabular-nums">{a.customer_phone}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-[#14243B] truncate max-w-[160px]">
                          {a.business?.name || 'Business'}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate max-w-[160px]">
                          {a.service?.name || 'Service'}
                        </p>
                      </td>
                      <td className="py-3 px-4 tabular-nums">
                        <p className="font-semibold text-[#14243B]">{a.appointment_date}</p>
                        <p className="text-[11px] text-slate-500">
                          {formatTimeRange12h(a.appointment_time, a.end_time)}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${
                            APPOINTMENT_STATUS_BADGES[a.status] || APPOINTMENT_STATUS_BADGES.pending
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onInspectAppointment(a)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-bold text-[#14243B] hover:border-[#E87936] hover:text-[#E87936] transition"
                        >
                          <span>Inspect</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Bottom Row: Recent Payment Activity, Real Chronological Feed & Compact System Health */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Recent Payment Activity */}
        <div className={`${ADMIN_CARD} xl:col-span-5 overflow-hidden`}>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[#14243B]">Recent Payment Activity</h2>
              <p className="text-xs text-slate-500">Verified Moolre settlements & status audit</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('payments')}
              className="text-xs font-bold text-[#E87936] hover:underline flex items-center gap-1 shrink-0"
            >
              <span>All Records</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {recentPayments.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No payment transactions recorded yet.</div>
            ) : (
              recentPayments.map((p) => {
                const isSub = isSubscriptionPayment(p);
                return (
                  <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-[#14243B] truncate">
                          {p.business?.name || 'Business'}
                        </p>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                          {isSub ? 'Subscription' : 'Booking'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate tabular-nums">
                        {p.moolre_reference || p.provider_reference || p.payment_provider} ·{' '}
                        {formatAdminDateTime(p.created_at)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-extrabold text-[#14243B] tabular-nums">
                        {formatCurrencyGhs(p.amount)}
                      </p>
                      <span
                        className={`inline-flex mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${
                          PAYMENT_STATUS_BADGES[p.status] || PAYMENT_STATUS_BADGES.pending
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Chronological Platform Activity Feed */}
        <div className={`${ADMIN_CARD} xl:col-span-4 overflow-hidden flex flex-col`}>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[#14243B]">Platform Activity Feed</h2>
              <p className="text-xs text-slate-500">Chronological events from live records</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('audit')}
              className="text-xs font-bold text-[#E87936] hover:underline flex items-center gap-1 shrink-0"
            >
              <span>Audit Logs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="p-4 space-y-3 flex-1 max-h-80 overflow-y-auto">
            {activityFeed.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">No recorded platform events yet.</div>
            ) : (
              activityFeed.map((item) => (
                <div key={item.id} className="flex items-start gap-2.5 text-xs">
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                      item.tone === 'success'
                        ? 'bg-emerald-500'
                        : item.tone === 'danger'
                        ? 'bg-red-500'
                        : item.tone === 'warning'
                        ? 'bg-amber-500'
                        : item.tone === 'info'
                        ? 'bg-blue-500'
                        : 'bg-slate-400'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#14243B] leading-snug">{item.title}</p>
                    <p className="text-[11px] text-slate-500 truncate">{item.description}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                      {formatAdminDateTime(item.timestamp)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Compact System Health Status Overview */}
        <div className={`${ADMIN_CARD} xl:col-span-3 overflow-hidden flex flex-col`}>
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#E87936]" />
              <h2 className="text-sm font-bold text-[#14243B]">System Health</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('monitoring')}
              className="text-xs font-bold text-[#E87936] hover:underline shrink-0"
            >
              Details
            </button>
          </div>
          <div className="p-4 space-y-2.5 flex-1">
            {healthError ? (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <p className="font-bold">Health probe unavailable</p>
                <p className="text-[11px] mt-0.5">{healthError}</p>
              </div>
            ) : healthChecks.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                Awaiting live health check...
              </div>
            ) : (
              healthChecks.map((chk) => (
                <div
                  key={chk.key}
                  className="p-3 rounded-xl bg-[#F5F6F8] border border-slate-200/70 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#14243B] truncate">{chk.label}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{chk.detail}</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize shrink-0 ${
                      chk.status === 'healthy'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : chk.status === 'degraded'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : chk.status === 'unconfigured'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {chk.status === 'healthy' ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <AlertTriangle className="w-3 h-3" />
                    )}
                    {chk.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
