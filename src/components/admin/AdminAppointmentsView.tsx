import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  List as ListIcon,
  Search,
  Filter,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Phone,
  Building2,
  Clock,
  Scissors,
  CheckCircle2,
  XCircle,
  CalendarClock,
  FileText,
  X,
  ExternalLink,
} from 'lucide-react';
import {
  AdminAppointmentRecord,
  AdminBusinessRecord,
  AppointmentAdminFilters,
  canRescheduleAppointment,
  canTransitionAppointmentStatus,
  computeAppointmentAdminSummary,
  filterAdminAppointments,
  formatBookingRef,
} from '../../utils/admin-analytics';
import {
  addDays,
  assignDayEventColumns,
  formatShortDateRange,
  formatTime12h,
  formatTimeRange12h,
  getMonthCalendarGrid,
  getWeekDays,
  parseIsoDateLocal,
  toIsoDateStr,
} from '../../utils/dashboard-analytics';
import { Appointment } from '../../types/database';
import { AdminConfirmConfig } from './AdminConfirmationModal';
import {
  ADMIN_CARD,
  APPOINTMENT_STATUS_BADGES,
  PAYMENT_STATUS_BADGES,
  formatCurrencyGhs,
  getBusinessColor,
} from './AdminTokens';

interface AdminAppointmentsViewProps {
  appointments: AdminAppointmentRecord[];
  businesses: AdminBusinessRecord[];
  selectedAppointmentId: string | null;
  onSelectAppointmentId: (id: string | null) => void;
  onRequestConfirm: (config: AdminConfirmConfig) => void;
  onUpdateAppointmentStatus: (
    appointment: AdminAppointmentRecord,
    nextStatus: 'confirmed' | 'completed' | 'cancelled',
    reason?: string
  ) => Promise<void>;
  onRescheduleAppointment: (
    appointment: AdminAppointmentRecord,
    newDate: string,
    newTime: string,
    reason?: string
  ) => Promise<void>;
  onViewBusiness: (businessId: string) => void;
  initialSearch?: string;
}

const DEFAULT_FILTERS: AppointmentAdminFilters = {
  search: '',
  businessId: 'all',
  status: 'all',
  serviceOrCategory: 'all',
  dateFrom: '',
  dateTo: '',
};

const HOURS = Array.from({ length: 13 }, (_, idx) => 7 + idx); // 7 AM - 7 PM
const ROW_HEIGHT_PX = 60;

export const AdminAppointmentsView: React.FC<AdminAppointmentsViewProps> = ({
  appointments,
  businesses,
  selectedAppointmentId,
  onSelectAppointmentId,
  onRequestConfirm,
  onUpdateAppointmentStatus,
  onRescheduleAppointment,
  onViewBusiness,
  initialSearch = '',
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarScale, setCalendarScale] = useState<'month' | 'week' | 'day'>('week');
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  const [filters, setFilters] = useState<AppointmentAdminFilters>({
    ...DEFAULT_FILTERS,
    search: initialSearch,
  });
  const [page, setPage] = useState(0);

  const summary = useMemo(() => computeAppointmentAdminSummary(appointments), [appointments]);

  const serviceAndCategoryOptions = useMemo(() => {
    const set = new Set<string>();
    businesses.forEach((b) => {
      if (b.category) set.add(b.category);
    });
    appointments.forEach((a) => {
      if (a.service?.name) set.add(a.service.name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [businesses, appointments]);

  const filtered = useMemo(() => {
    const list = filterAdminAppointments(appointments, filters);
    return [...list].sort((a, b) => {
      const d = b.appointment_date.localeCompare(a.appointment_date);
      if (d !== 0) return d;
      return b.appointment_time.localeCompare(a.appointment_time);
    });
  }, [appointments, filters]);

  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pagedList = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const selectedAppointment = useMemo(
    () => appointments.find((a) => a.id === selectedAppointmentId) || null,
    [appointments, selectedAppointmentId]
  );

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setPage(0);
  };

  const hasActiveFilters =
    filters.search !== '' ||
    filters.businessId !== 'all' ||
    filters.status !== 'all' ||
    filters.serviceOrCategory !== 'all' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '';

  // Calendar helpers
  const anchorIso = toIsoDateStr(anchorDate);
  const weekDays = useMemo(() => getWeekDays(anchorIso), [anchorIso]);
  const monthGrid = useMemo(
    () => getMonthCalendarGrid(anchorDate.getFullYear(), anchorDate.getMonth()),
    [anchorDate]
  );

  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, AdminAppointmentRecord[]>();
    for (const a of filtered) {
      const list = map.get(a.appointment_date) || [];
      list.push(a);
      map.set(a.appointment_date, list);
    }
    return map;
  }, [filtered]);

  const navigateCalendar = (dir: -1 | 1) => {
    if (calendarScale === 'day') {
      setAnchorDate((d) => addDays(d, dir));
    } else if (calendarScale === 'week') {
      setAnchorDate((d) => addDays(d, dir * 7));
    } else {
      setAnchorDate((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
    }
  };

  const calendarTitle = useMemo(() => {
    if (calendarScale === 'day') {
      return anchorDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    if (calendarScale === 'week') {
      return formatShortDateRange(weekDays[0].dateStr, weekDays[6].dateStr);
    }
    return anchorDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [calendarScale, anchorDate, weekDays]);

  const handleStatusAction = (
    appt: AdminAppointmentRecord,
    nextStatus: 'confirmed' | 'completed' | 'cancelled'
  ) => {
    const check = canTransitionAppointmentStatus(appt.status, nextStatus);
    if (!check.allowed) return;

    const actionLabels = {
      confirmed: {
        title: 'Confirm Appointment',
        desc: `Confirm ${appt.customer_name}'s booking at ${appt.business?.name || 'Business'} (${formatBookingRef(appt.id)})? No duplicate SMS will be sent.`,
        btn: 'Confirm Booking',
        tone: 'primary' as const,
      },
      completed: {
        title: 'Mark Appointment Completed',
        desc: `Mark ${appt.customer_name}'s appointment (${formatBookingRef(appt.id)}) as completed?`,
        btn: 'Mark Completed',
        tone: 'success' as const,
      },
      cancelled: {
        title: 'Cancel Appointment (Preserved)',
        desc: `Cancel booking ${formatBookingRef(appt.id)} for ${appt.customer_name}? The record will remain preserved in platform history and audit logs.`,
        btn: 'Cancel Booking',
        tone: 'danger' as const,
      },
    }[nextStatus];

    onRequestConfirm({
      title: actionLabels.title,
      description: actionLabels.desc,
      confirmLabel: actionLabels.btn,
      tone: actionLabels.tone,
      requireReason: nextStatus === 'cancelled',
      reasonLabel: nextStatus === 'cancelled' ? 'Cancellation Reason' : 'Admin Audit Note',
      reasonPlaceholder:
        nextStatus === 'cancelled'
          ? 'Explain why Super Admin cancelled this booking...'
          : 'Optional context for the audit trail...',
      onConfirm: async ({ reason }) => {
        await onUpdateAppointmentStatus(appt, nextStatus, reason);
      },
    });
  };

  const handleRescheduleAction = (appt: AdminAppointmentRecord) => {
    const check = canRescheduleAppointment(appt.status);
    if (!check.allowed) return;

    onRequestConfirm({
      title: `Reschedule ${formatBookingRef(appt.id)}`,
      description: `Select a new date and start time for ${appt.customer_name} at ${appt.business?.name || 'Business'}. Duration stays ${appt.service?.duration_minutes || 60} mins.`,
      confirmLabel: 'Save New Schedule',
      tone: 'primary',
      requireReason: false,
      reasonLabel: 'Reschedule Note',
      reasonPlaceholder: 'Reason for schedule adjustment...',
      rescheduleFields: {
        initialDate: appt.appointment_date,
        initialTime: appt.appointment_time,
      },
      onConfirm: async ({ date, time, reason }) => {
        if (date && time) {
          await onRescheduleAppointment(appt, date, time, reason);
        }
      },
    });
  };

  const renderDetailsPanel = (appt: AdminAppointmentRecord) => {
    const confirmAllowed = canTransitionAppointmentStatus(appt.status, 'confirmed').allowed;
    const completeAllowed = canTransitionAppointmentStatus(appt.status, 'completed').allowed;
    const cancelAllowed = canTransitionAppointmentStatus(appt.status, 'cancelled').allowed;
    const rescheduleAllowed = canRescheduleAppointment(appt.status).allowed;

    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="px-5 py-4 bg-[#14243B] text-white flex items-center justify-between gap-3 shrink-0">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#E87936]">
              Appointment Details
            </p>
            <h3 className="text-sm font-bold tracking-tight tabular-nums mt-0.5">
              {formatBookingRef(appt.id)}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onSelectAppointmentId(null)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
            aria-label="Close appointment details"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Status Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold border capitalize ${
                APPOINTMENT_STATUS_BADGES[appt.status] || APPOINTMENT_STATUS_BADGES.pending
              }`}
            >
              Status: {appt.status}
            </span>
            <span
              className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold border capitalize ${
                PAYMENT_STATUS_BADGES[appt.payment_status] || PAYMENT_STATUS_BADGES.pending
              }`}
            >
              Payment: {appt.payment_status.replace('_', ' ')}
            </span>
          </div>

          {/* Customer (Name & Phone ONLY - No Email or Photo per Platform Policy) */}
          <div className="p-4 rounded-xl bg-[#F5F6F8] border border-slate-200/80 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer</p>
            <p className="text-sm font-bold text-[#14243B]">{appt.customer_name}</p>
            <p className="text-xs font-semibold text-slate-600 flex items-center gap-2 tabular-nums">
              <Phone className="w-3.5 h-3.5 text-[#E87936]" />
              {appt.customer_phone}
            </p>
          </div>

          {/* Business Context */}
          <div className="p-4 rounded-xl bg-white border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Business</p>
              <button
                type="button"
                onClick={() => onViewBusiness(appt.business_id)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#E87936] hover:underline"
              >
                <span>View Business</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <p className="text-xs font-bold text-[#14243B] flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              {appt.business?.name || 'Unknown Business'}
            </p>
            {appt.business?.category && (
              <p className="text-[11px] text-slate-500 pl-5">{appt.business.category}</p>
            )}
          </div>

          {/* Service & Schedule */}
          <div className="space-y-3 text-xs border-t border-slate-100 pt-4">
            <div className="flex items-start justify-between gap-3">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Scissors className="w-3.5 h-3.5" /> Service
              </span>
              <span className="font-bold text-[#14243B] text-right">
                {appt.service?.name || 'Service'}
                {appt.service?.duration_minutes ? ` (${appt.service.duration_minutes}m)` : ''}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-slate-500 flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5" /> Date
              </span>
              <span className="font-bold text-[#14243B] tabular-nums">{appt.appointment_date}</span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Time
              </span>
              <span className="font-bold text-[#14243B] tabular-nums">
                {formatTimeRange12h(appt.appointment_time, appt.end_time)}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-slate-500">Service Price</span>
              <span className="font-bold text-[#14243B] tabular-nums">
                {formatCurrencyGhs(appt.service_price)}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-slate-500">Amount Received</span>
              <span className="font-bold text-emerald-700 tabular-nums">
                {formatCurrencyGhs(appt.payment_received)}
              </span>
            </div>
          </div>

          {appt.notes && (
            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Booking Notes
              </p>
              <p className="text-xs text-amber-950 leading-relaxed">{appt.notes}</p>
            </div>
          )}

          {/* Audited Admin Actions */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Administrative Actions (Audited)
            </p>
            {confirmAllowed && (
              <button
                type="button"
                onClick={() => handleStatusAction(appt, 'confirmed')}
                className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm Booking</span>
              </button>
            )}
            {completeAllowed && (
              <button
                type="button"
                onClick={() => handleStatusAction(appt, 'completed')}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mark Completed</span>
              </button>
            )}
            {rescheduleAllowed && (
              <button
                type="button"
                onClick={() => handleRescheduleAction(appt)}
                className="w-full py-2.5 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[#14243B] text-xs font-bold flex items-center justify-center gap-2 transition"
              >
                <CalendarClock className="w-3.5 h-3.5 text-[#E87936]" />
                <span>Reschedule Date & Time</span>
              </button>
            )}
            {cancelAllowed && (
              <button
                type="button"
                onClick={() => handleStatusAction(appt, 'cancelled')}
                className="w-full py-2.5 px-3 rounded-xl border border-red-200 bg-red-50/70 hover:bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center gap-2 transition"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Cancel Booking</span>
              </button>
            )}
            {!confirmAllowed && !completeAllowed && !cancelAllowed && !rescheduleAllowed && (
              <p className="text-[11px] text-slate-500 text-center py-2 bg-[#F5F6F8] rounded-xl">
                This {appt.status} appointment is finalized and preserved as an audit record.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderWeekOrDayGrid = (
    daysList: { dateStr: string; dayShort: string; dateLabel: string; isToday: boolean }[]
  ) => {
    const startHour = HOURS[0];
    const endHour = HOURS[HOURS.length - 1] + 1;
    const gridTotalHeightPx = HOURS.length * ROW_HEIGHT_PX;

    return (
      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          {/* Header Row */}
          <div
            className="grid border-b border-slate-200 bg-[#F5F6F8]"
            style={{ gridTemplateColumns: `72px repeat(${daysList.length}, minmax(0, 1fr))` }}
          >
            <div className="p-3 text-[10px] font-bold uppercase text-slate-400">Time</div>
            {daysList.map((day) => {
              const count = (appointmentsByDay.get(day.dateStr) || []).length;
              return (
                <div
                  key={day.dateStr}
                  className={`p-3 text-center border-l border-slate-200 ${
                    day.isToday ? 'bg-[#E87936]/10' : ''
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase text-slate-500">{day.dayShort}</p>
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    <span
                      className={`text-xs font-extrabold tabular-nums ${
                        day.isToday ? 'text-[#E87936]' : 'text-[#14243B]'
                      }`}
                    >
                      {day.dateLabel}
                    </span>
                    {count > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-[#14243B] text-white text-[10px] font-bold tabular-nums">
                        {count}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time Grid */}
          <div
            className="grid relative"
            style={{ gridTemplateColumns: `72px repeat(${daysList.length}, minmax(0, 1fr))` }}
          >
            {/* Hour labels */}
            <div className="divide-y divide-slate-100">
              {HOURS.map((hr) => (
                <div
                  key={hr}
                  style={{ height: `${ROW_HEIGHT_PX}px` }}
                  className="pr-2 pt-1 text-right text-[10px] font-semibold text-slate-400 tabular-nums"
                >
                  {formatTime12h(`${String(hr).padStart(2, '0')}:00`)}
                </div>
              ))}
            </div>

            {/* Day Columns */}
            {daysList.map((day) => {
              const dayAppts = appointmentsByDay.get(day.dateStr) || [];
              const placed = assignDayEventColumns(
                dayAppts as unknown as Appointment[],
                startHour,
                endHour
              );

              return (
                <div
                  key={day.dateStr}
                  style={{ height: `${gridTotalHeightPx}px` }}
                  className={`relative border-l border-slate-200 ${
                    day.isToday ? 'bg-orange-50/20' : 'bg-white'
                  }`}
                >
                  {HOURS.map((hr) => (
                    <div
                      key={hr}
                      style={{ height: `${ROW_HEIGHT_PX}px` }}
                      className="border-b border-slate-100"
                    />
                  ))}

                  {placed.map((ev) => {
                    const appt = ev.appointment as unknown as AdminAppointmentRecord;
                    const bizColor = getBusinessColor(appt.business_id);
                    const isSelected = appt.id === selectedAppointmentId;

                    return (
                      <button
                        key={appt.id}
                        type="button"
                        onClick={() => onSelectAppointmentId(appt.id)}
                        style={{
                          top: `calc(${ev.topPct}% + 2px)`,
                          height: `calc(${ev.heightPct}% - 4px)`,
                          minHeight: '34px',
                          left: `calc(${ev.leftPct}% + 3px)`,
                          width: `calc(${ev.widthPct}% - 6px)`,
                        }}
                        className={`absolute rounded-lg border-l-4 px-2 py-1 text-left overflow-hidden shadow-xs transition ${
                          bizColor.bg
                        } ${bizColor.border} ${bizColor.text} ${
                          isSelected ? 'ring-2 ring-[#E87936] z-20' : 'hover:shadow-md z-10'
                        }`}
                      >
                        <p className="text-[10px] font-extrabold truncate leading-tight">
                          {appt.business?.name || 'Business'}
                        </p>
                        <p className="text-[10px] font-semibold truncate leading-tight">
                          {appt.customer_name} · {appt.service?.name || 'Service'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200/80 shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                viewMode === 'list'
                  ? 'bg-[#14243B] text-white'
                  : 'text-slate-600 hover:text-[#14243B]'
              }`}
            >
              <ListIcon className="w-3.5 h-3.5" />
              <span>List View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                viewMode === 'calendar'
                  ? 'bg-[#14243B] text-white'
                  : 'text-slate-600 hover:text-[#14243B]'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Calendar View</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-500 font-medium tabular-nums">
          Showing <strong className="text-[#14243B]">{filtered.length}</strong> of{' '}
          <strong className="text-[#14243B]">{appointments.length}</strong> appointments across{' '}
          <strong className="text-[#14243B]">{summary.businessesWithBookingsToday}</strong> businesses today
        </p>
      </div>

      {/* 6 Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Bookings', value: summary.total, tone: 'text-[#14243B]' },
          { label: 'Confirmed', value: summary.confirmed, tone: 'text-blue-700' },
          { label: 'Pending', value: summary.pending, tone: 'text-amber-700' },
          { label: 'Completed', value: summary.completed, tone: 'text-emerald-700' },
          { label: 'Cancelled', value: summary.cancelled, tone: 'text-red-700' },
          { label: "Today's Bookings", value: summary.todayCount, tone: 'text-[#E87936]' },
        ].map((card) => (
          <div key={card.label} className={`${ADMIN_CARD} p-4`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{card.label}</p>
            <p className={`text-2xl font-extrabold mt-1 tabular-nums ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Search & Filter Bar */}
      <div className={`${ADMIN_CARD} p-4 space-y-3`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          <div className="relative sm:col-span-2 lg:col-span-4">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => {
                setFilters((f) => ({ ...f, search: e.target.value }));
                setPage(0);
              }}
              placeholder="Search customer, phone, ref, business..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-[#F5F6F8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E87936]/30 focus:border-[#E87936]"
            />
          </div>

          <select
            value={filters.businessId}
            onChange={(e) => {
              setFilters((f) => ({ ...f, businessId: e.target.value }));
              setPage(0);
            }}
            aria-label="Filter by business"
            className="lg:col-span-3 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-[#14243B] min-w-0"
          >
            <option value="all">All Businesses</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(e) => {
              setFilters((f) => ({ ...f, status: e.target.value }));
              setPage(0);
            }}
            aria-label="Filter by status"
            className="lg:col-span-2 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-[#14243B] min-w-0"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={filters.serviceOrCategory}
            onChange={(e) => {
              setFilters((f) => ({ ...f, serviceOrCategory: e.target.value }));
              setPage(0);
            }}
            aria-label="Filter by service or category"
            className="lg:col-span-3 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-[#14243B] min-w-0"
          >
            <option value="all">All Services & Categories</option>
            {serviceAndCategoryOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[11px] font-semibold text-slate-500">Date Range:</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => {
                setFilters((f) => ({ ...f, dateFrom: e.target.value }));
                setPage(0);
              }}
              aria-label="Date from"
              className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white text-[#14243B]"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => {
                setFilters((f) => ({ ...f, dateTo: e.target.value }));
                setPage(0);
              }}
              aria-label="Date to"
              className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white text-[#14243B]"
            />
          </div>

          {hasActiveFilters && (
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                <Filter className="w-3 h-3 text-[#E87936]" /> Filters active
              </span>
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#E87936] hover:underline"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filters</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content + Right Details Panel Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className={selectedAppointment ? 'xl:col-span-8' : 'xl:col-span-12'}>
          {viewMode === 'list' ? (
            <div className={`${ADMIN_CARD} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F5F6F8] text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200/80">
                    <tr>
                      <th className="py-3 px-4">Ref</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Business</th>
                      <th className="py-3 px-4">Service</th>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-14 text-center text-slate-500 text-xs">
                          No appointments match your current filters.
                        </td>
                      </tr>
                    ) : (
                      pagedList.map((a) => {
                        const isSelected = a.id === selectedAppointmentId;
                        return (
                          <tr
                            key={a.id}
                            onClick={() => onSelectAppointmentId(a.id)}
                            className={`cursor-pointer transition ${
                              isSelected ? 'bg-orange-50/70' : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <td className="py-3 px-4 font-mono text-[11px] font-bold text-[#14243B] whitespace-nowrap">
                              {formatBookingRef(a.id)}
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-bold text-[#14243B]">{a.customer_name}</p>
                              <p className="text-[11px] text-slate-500 tabular-nums">{a.customer_phone}</p>
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-semibold text-[#14243B]">{a.business?.name || 'Business'}</p>
                              <p className="text-[11px] text-slate-400">{a.business?.category || '—'}</p>
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-medium text-[#14243B]">{a.service?.name || 'Service'}</p>
                              <p className="text-[11px] text-slate-500 tabular-nums">
                                {formatCurrencyGhs(a.service_price)}
                              </p>
                            </td>
                            <td className="py-3 px-4 tabular-nums whitespace-nowrap">
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
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${
                                  PAYMENT_STATUS_BADGES[a.payment_status] || PAYMENT_STATUS_BADGES.pending
                                }`}
                              >
                                {a.payment_status.replace('_', ' ')}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    disabled={safePage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold text-[#14243B] disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-slate-500 font-medium tabular-nums">
                    Page {safePage + 1} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold text-[#14243B] disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className={`${ADMIN_CARD} overflow-hidden`}>
              {/* Calendar Controls */}
              <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigateCalendar(-1)}
                    className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-[#14243B]"
                    aria-label="Previous period"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnchorDate(new Date())}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-[#E87936] hover:bg-orange-50"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateCalendar(1)}
                    className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-[#14243B]"
                    aria-label="Next period"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <h3 className="text-sm font-bold text-[#14243B] ml-2">{calendarTitle}</h3>
                </div>

                <div className="inline-flex p-0.5 rounded-xl bg-[#F5F6F8] border border-slate-200">
                  {(['month', 'week', 'day'] as const).map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      onClick={() => setCalendarScale(scale)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition ${
                        calendarScale === scale
                          ? 'bg-[#E87936] text-white'
                          : 'text-slate-600 hover:text-[#14243B]'
                      }`}
                    >
                      {scale}
                    </button>
                  ))}
                </div>
              </div>

              {/* Calendar Body */}
              {calendarScale === 'week' && renderWeekOrDayGrid(weekDays)}
              {calendarScale === 'day' &&
                renderWeekOrDayGrid([
                  {
                    dateStr: anchorIso,
                    dayShort: anchorDate.toLocaleDateString('en-US', { weekday: 'short' }),
                    dateLabel: anchorDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    isToday: anchorIso === toIsoDateStr(new Date()),
                  },
                ])}
              {calendarScale === 'month' && (
                <div className="grid grid-cols-7 border-t border-slate-100">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <div
                      key={d}
                      className="py-2 px-2 text-center text-[10px] font-bold uppercase text-slate-400 bg-[#F5F6F8] border-b border-r border-slate-100 last:border-r-0"
                    >
                      {d}
                    </div>
                  ))}
                  {monthGrid.map((cell) => {
                    const dayAppts = appointmentsByDay.get(cell.dateStr) || [];
                    return (
                      <div
                        key={cell.dateStr}
                        className={`min-h-[104px] p-1.5 border-b border-r border-slate-100 ${
                          cell.isCurrentMonth ? 'bg-white' : 'bg-slate-50/70'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <button
                            type="button"
                            onClick={() => {
                              setAnchorDate(parseIsoDateLocal(cell.dateStr));
                              setCalendarScale('day');
                            }}
                            className={`w-6 h-6 rounded-full text-[11px] font-bold tabular-nums flex items-center justify-center ${
                              cell.isToday
                                ? 'bg-[#E87936] text-white'
                                : cell.isCurrentMonth
                                ? 'text-[#14243B] hover:bg-slate-100'
                                : 'text-slate-400'
                            }`}
                          >
                            {cell.dayNumber}
                          </button>
                          {dayAppts.length > 0 && (
                            <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                              {dayAppts.length}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1">
                          {dayAppts.slice(0, 3).map((appt) => {
                            const bizColor = getBusinessColor(appt.business_id);
                            return (
                              <button
                                key={appt.id}
                                type="button"
                                onClick={() => onSelectAppointmentId(appt.id)}
                                className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-semibold truncate border-l-2 ${bizColor.bg} ${bizColor.border} ${bizColor.text}`}
                              >
                                {formatTime12h(appt.appointment_time)} {appt.customer_name}
                              </button>
                            );
                          })}
                          {dayAppts.length > 3 && (
                            <button
                              type="button"
                              onClick={() => {
                                setAnchorDate(parseIsoDateLocal(cell.dateStr));
                                setCalendarScale('day');
                              }}
                              className="w-full text-left px-1 text-[10px] font-bold text-[#E87936] hover:underline"
                            >
                              +{dayAppts.length - 3} more
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desktop Right-Side Details Panel */}
        {selectedAppointment && (
          <aside className={`${ADMIN_CARD} hidden xl:flex xl:flex-col xl:col-span-4 overflow-hidden sticky top-20 h-[calc(100vh-6.25rem)]`}>
            {renderDetailsPanel(selectedAppointment)}
          </aside>
        )}
      </div>

      {/* Mobile / Tablet Modal Details Drawer */}
      {selectedAppointment && (
        <div className="fixed inset-0 z-50 xl:hidden bg-[#14243B]/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-2xl overflow-hidden flex flex-col">
            {renderDetailsPanel(selectedAppointment)}
          </div>
        </div>
      )}
    </div>
  );
};
