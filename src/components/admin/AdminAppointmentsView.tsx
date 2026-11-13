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
import { motion, useReducedMotion } from 'motion/react';
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
  buildDayColorMap,
  CALENDAR_EVENT_THEMES,
  computeCalendarEventLayout,
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

const DEFAULT_HOURS = Array.from({ length: 13 }, (_, idx) => 7 + idx); // 7 AM - 7 PM
const ROW_HEIGHT_PX = 68;

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
  const shouldReduceMotion = useReducedMotion();
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
    daysList: { dateStr: string; dayShort: string; dateLabel: string; isToday: boolean }[],
    isDayScale: boolean = false
  ) => {
    const startHour = DEFAULT_HOURS[0];
    const endHour = DEFAULT_HOURS[DEFAULT_HOURS.length - 1] + 1;
    const gridTotalHeightPx = DEFAULT_HOURS.length * ROW_HEIGHT_PX;

    const now = new Date();
    const curMin = now.getHours() * 60 + now.getMinutes();
    const minGridMin = startHour * 60;
    const maxGridMin = endHour * 60;
    const nowPct =
      curMin >= minGridMin && curMin <= maxGridMin
        ? ((curMin - minGridMin) / Math.max(maxGridMin - minGridMin, 60)) * 100
        : null;
    const nowLabel = formatTime12h(
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    );

    return (
      <div className="overflow-x-auto">
        <div className={isDayScale ? 'min-w-[460px]' : 'min-w-[740px]'}>
          {/* Header Row */}
          <div
            className="grid border-b border-slate-200/80 bg-gradient-to-r from-[#F5F6F8] via-white to-orange-50/35"
            style={{ gridTemplateColumns: `72px repeat(${daysList.length}, minmax(0, 1fr))` }}
          >
            <div className="p-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-end justify-end">
              GMT
            </div>
            {daysList.map((day) => {
              const dayList = appointmentsByDay.get(day.dateStr) || [];
              const activeCount = dayList.filter((a) => a.status !== 'cancelled').length;
              const dateNum = day.dateLabel.replace(/^\D+\s*/, '');
              return (
                <div
                  key={day.dateStr}
                  className={`py-2.5 px-2 text-center border-l border-slate-200/70 flex flex-col items-center gap-1 ${
                    day.isToday ? 'bg-[#FFF5EE]' : ''
                  }`}
                >
                  <p
                    className={`text-[10.5px] font-extrabold uppercase tracking-wider ${
                      day.isToday ? 'text-[#E87936]' : 'text-slate-400'
                    }`}
                  >
                    {day.dayShort}
                  </p>
                  <div className="flex items-center justify-center gap-1.5">
                    <span
                      className={`w-7 h-7 rounded-full text-xs font-extrabold tabular-nums inline-flex items-center justify-center ${
                        day.isToday
                          ? 'bg-[#E87936] text-white shadow-[0_2px_8px_rgba(232,121,54,0.35)]'
                          : 'text-[#14243B]'
                      }`}
                    >
                      {dateNum || day.dateLabel}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold tabular-nums px-2 py-0.2 rounded-full ${
                      activeCount > 0
                        ? day.isToday
                          ? 'bg-orange-100 text-[#C2410C]'
                          : 'bg-slate-100 text-[#14243B]'
                        : 'text-slate-300'
                    }`}
                  >
                    {activeCount > 0
                      ? `${activeCount} ${activeCount === 1 ? 'booking' : 'bookings'}`
                      : 'Open'}
                  </span>
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
            <div className="relative divide-y divide-slate-100 bg-white">
              {DEFAULT_HOURS.map((hr) => (
                <div
                  key={hr}
                  style={{ height: `${ROW_HEIGHT_PX}px` }}
                  className="pr-2.5 pt-1 text-right text-[10px] font-semibold text-slate-400 tabular-nums"
                >
                  {formatTime12h(`${String(hr).padStart(2, '0')}:00`)}
                </div>
              ))}
              {nowPct !== null && (
                <div
                  aria-hidden="true"
                  style={{ top: `${nowPct}%` }}
                  className="pointer-events-none absolute right-1 -translate-y-1/2 z-30 px-1.5 py-0.5 rounded-md bg-[#E87936] text-white text-[9px] font-extrabold tabular-nums shadow-xs whitespace-nowrap"
                >
                  {nowLabel}
                </div>
              )}
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
                  className={`relative border-l border-slate-200/75 ${
                    day.isToday ? 'bg-[#FFF9F5]/65' : 'bg-white'
                  }`}
                >
                  {DEFAULT_HOURS.map((hr) => (
                    <div
                      key={hr}
                      style={{ height: `${ROW_HEIGHT_PX}px` }}
                      className="relative border-b border-slate-200/70"
                    >
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-slate-100"
                      />
                    </div>
                  ))}

                  {/* Live Current-Time Line */}
                  {day.isToday && nowPct !== null && (
                    <div
                      aria-hidden="true"
                      style={{ top: `${nowPct}%` }}
                      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                    >
                      <span className="w-2.5 h-2.5 -ml-1.5 rounded-full bg-[#E87936] ring-2 ring-white shadow-xs" />
                      <span className="flex-1 h-[2px] bg-[#E87936]" />
                    </div>
                  )}

                  {placed.map((ev) => {
                    const appt = ev.appointment as unknown as AdminAppointmentRecord;
                    const theme = ev.theme;
                    const bizColor = getBusinessColor(appt.business_id);
                    const isSelected = appt.id === selectedAppointmentId;
                    const statusBadgeCls =
                      appt.status === 'completed'
                        ? 'bg-emerald-600 text-white'
                        : appt.status === 'confirmed'
                        ? 'bg-blue-600 text-white'
                        : appt.status === 'pending'
                        ? 'bg-amber-500 text-white'
                        : 'bg-rose-600 text-white';

                    return (
                      <motion.button
                        key={appt.id}
                        type="button"
                        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.16 }}
                        onClick={() => onSelectAppointmentId(appt.id)}
                        title={`${appt.business?.name || 'Business'} • ${appt.customer_name} • ${
                          appt.service?.name || 'Service'
                        } (${formatTimeRange12h(appt.appointment_time, appt.end_time)})`}
                        style={{
                          top: `calc(${ev.topPct}% + 2px)`,
                          height: `calc(${ev.heightPct}% - 4px)`,
                          minHeight: isDayScale ? '62px' : '54px',
                          left: `calc(${ev.leftPct}% + ${isDayScale ? '8px' : '3px'})`,
                          width: `calc(${ev.widthPct}% - ${isDayScale ? '16px' : '6px'})`,
                        }}
                        className={`absolute rounded-xl border ${theme.borderAll} border-l-4 px-2.5 py-1.5 text-left overflow-hidden shadow-[0_2px_8px_rgba(15,23,42,0.08)] hover:shadow-lg hover:-translate-y-0.5 transition-all flex flex-col justify-between ${
                          theme.bg
                        } ${theme.border} ${
                          isSelected ? 'ring-2 ring-[#E87936] ring-offset-1 z-20' : 'z-10'
                        } ${appt.status === 'cancelled' ? 'opacity-60' : ''}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="inline-flex items-center gap-1 max-w-[75%] truncate px-1.5 py-0.2 rounded-md bg-white/85 border border-black/[0.06] text-[9.5px] font-extrabold text-[#14243B]">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${bizColor.dot}`} />
                              <span className="truncate">{appt.business?.name || 'Business'}</span>
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded-full text-[8.5px] font-extrabold capitalize shrink-0 ${statusBadgeCls}`}
                            >
                              {appt.status}
                            </span>
                          </div>
                          <p
                            className={`text-[11px] font-extrabold truncate leading-tight mt-0.5 ${theme.titleText} ${
                              appt.status === 'cancelled' ? 'line-through' : ''
                            }`}
                          >
                            {appt.customer_name}
                          </p>
                          <p className={`text-[10px] font-semibold truncate leading-tight ${theme.subText}`}>
                            {appt.service?.name || 'Service'}
                          </p>
                        </div>

                        <div className="flex items-center justify-between gap-1 pt-0.5 border-t border-black/[0.05]">
                          <span className={`text-[9.5px] font-bold tabular-nums truncate ${theme.subText}`}>
                            {isDayScale
                              ? formatTimeRange12h(appt.appointment_time, appt.end_time)
                              : formatTime12h(appt.appointment_time)}
                          </span>
                          <span className={`text-[9.5px] font-extrabold tabular-nums shrink-0 ${theme.titleText}`}>
                            {formatCurrencyGhs(appt.service_price)}
                          </span>
                        </div>
                      </motion.button>
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
              <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigateCalendar(-1)}
                    className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-[#14243B] transition"
                    aria-label="Previous period"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnchorDate(new Date())}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-[#E87936] hover:bg-orange-50 transition"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateCalendar(1)}
                    className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-[#14243B] transition"
                    aria-label="Next period"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <h3 className="text-sm font-extrabold text-[#14243B] ml-2">{calendarTitle}</h3>
                </div>

                <div className="inline-flex p-0.5 rounded-xl bg-[#F5F6F8] border border-slate-200">
                  {(['month', 'week', 'day'] as const).map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      onClick={() => setCalendarScale(scale)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold capitalize transition ${
                        calendarScale === scale
                          ? 'bg-[#E87936] text-white shadow-xs'
                          : 'text-slate-600 hover:text-[#14243B]'
                      }`}
                    >
                      {scale}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interactive Status & Multi-Color Palette Legend */}
              <div className="px-4 py-2.5 bg-gradient-to-r from-[#F5F6F8] via-white to-orange-50/40 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { key: 'confirmed', label: 'Confirmed', dot: 'bg-blue-500', activeCls: 'bg-blue-50 border-blue-200 text-blue-700' },
                      { key: 'pending', label: 'Pending', dot: 'bg-amber-500', activeCls: 'bg-amber-50 border-amber-200 text-amber-700' },
                      { key: 'completed', label: 'Completed', dot: 'bg-emerald-500', activeCls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                      { key: 'cancelled', label: 'Cancelled', dot: 'bg-rose-500', activeCls: 'bg-rose-50 border-rose-200 text-rose-700' },
                    ] as const
                  ).map((st) => {
                    const isActive = filters.status === st.key;
                    return (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() => {
                          setFilters((f) => ({
                            ...f,
                            status: f.status === st.key ? 'all' : st.key,
                          }));
                          setPage(0);
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border font-bold transition ${
                          isActive
                            ? `${st.activeCls} shadow-2xs`
                            : 'bg-white border-slate-200/80 text-slate-600 hover:border-slate-300 hover:text-[#14243B]'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                        <span>{st.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white border border-slate-200/80 text-[10px] font-bold text-slate-600">
                  <span className="flex items-center -space-x-1">
                    {CALENDAR_EVENT_THEMES.slice(0, 6).map((t) => (
                      <span
                        key={t.name}
                        className={`w-2.5 h-2.5 rounded-full ring-1 ring-white ${t.dot}`}
                      />
                    ))}
                  </span>
                  <span>Multi-color customer bookings</span>
                </div>
              </div>

              {/* Calendar Body */}
              {calendarScale === 'week' && renderWeekOrDayGrid(weekDays, false)}
              {calendarScale === 'day' &&
                renderWeekOrDayGrid(
                  [
                    {
                      dateStr: anchorIso,
                      dayShort: anchorDate.toLocaleDateString('en-US', { weekday: 'short' }),
                      dateLabel: anchorDate.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      }),
                      isToday: anchorIso === toIsoDateStr(new Date()),
                    },
                  ],
                  true
                )}
              {calendarScale === 'month' && (() => {
                const selectedMonthAppts = (appointmentsByDay.get(anchorIso) || [])
                  .slice()
                  .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
                const selectedMonthColorMap = buildDayColorMap(
                  selectedMonthAppts as unknown as Appointment[]
                );
                const selectedMonthRevenue = selectedMonthAppts
                  .filter((a) => a.status !== 'cancelled')
                  .reduce((sum, a) => sum + Number(a.service_price || 0), 0);

                return (
                  <div className="p-4 sm:p-5 space-y-5">
                    <div className="rounded-2xl border border-slate-200/85 overflow-hidden bg-white shadow-2xs">
                      <div className="grid grid-cols-7 border-b border-slate-200/80 bg-gradient-to-r from-[#F5F6F8] via-white to-orange-50/40">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, idx) => (
                          <div
                            key={d}
                            className={`py-2.5 px-2 text-center text-[11px] font-extrabold uppercase tracking-wider border-r border-slate-200/70 last:border-r-0 ${
                              idx === 0 || idx === 6 ? 'text-[#E87936]' : 'text-slate-600'
                            }`}
                          >
                            {d}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7">
                        {monthGrid.map((cell) => {
                          const dayAppts = (appointmentsByDay.get(cell.dateStr) || [])
                            .slice()
                            .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
                          const dayColorMap = buildDayColorMap(
                            dayAppts as unknown as Appointment[]
                          );
                          const isSelectedDay = anchorIso === cell.dateStr;

                          return (
                            <div
                              key={cell.dateStr}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                setAnchorDate(parseIsoDateLocal(cell.dateStr));
                                if (dayAppts.length > 0) onSelectAppointmentId(dayAppts[0].id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setAnchorDate(parseIsoDateLocal(cell.dateStr));
                                }
                              }}
                              className={`min-h-[116px] p-2 border-b border-r border-slate-200/70 [&:nth-child(7n)]:border-r-0 text-left flex flex-col justify-between transition cursor-pointer ${
                                isSelectedDay
                                  ? 'bg-[#FFF5EE]'
                                  : !cell.isCurrentMonth
                                  ? 'bg-slate-50/70'
                                  : cell.isWeekend
                                  ? 'bg-slate-50/35 hover:bg-orange-50/30'
                                  : 'bg-white hover:bg-orange-50/25'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <span
                                  className={`w-7 h-7 rounded-full text-xs font-extrabold tabular-nums flex items-center justify-center transition ${
                                    cell.isToday
                                      ? 'bg-[#E87936] text-white shadow-[0_2px_8px_rgba(232,121,54,0.35)]'
                                      : isSelectedDay
                                      ? 'bg-[#14243B] text-white'
                                      : cell.isCurrentMonth
                                      ? 'text-[#14243B]'
                                      : 'text-slate-300'
                                  }`}
                                >
                                  {cell.dayNumber}
                                </span>
                                {dayAppts.length > 0 && (
                                  <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-[10px] font-extrabold text-[#14243B] tabular-nums">
                                    {dayAppts.length}
                                  </span>
                                )}
                              </div>
                              <div className="space-y-1">
                                {dayAppts.slice(0, 3).map((appt) => {
                                  const theme =
                                    dayColorMap.get(appt.id) ||
                                    computeCalendarEventLayout(appt as unknown as Appointment, 7, 20)
                                      .theme;
                                  const dotColor =
                                    appt.status === 'completed'
                                      ? 'bg-emerald-500'
                                      : appt.status === 'confirmed'
                                      ? 'bg-blue-600'
                                      : appt.status === 'pending'
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500';
                                  return (
                                    <button
                                      key={appt.id}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setAnchorDate(parseIsoDateLocal(cell.dateStr));
                                        onSelectAppointmentId(appt.id);
                                      }}
                                      className={`w-full text-left flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-bold truncate border ${theme.borderAll} border-l-[3px] ${theme.border} ${theme.bg} ${theme.titleText} ${
                                        appt.id === selectedAppointmentId
                                          ? 'ring-1 ring-[#E87936] shadow-xs'
                                          : 'hover:brightness-97'
                                      } ${appt.status === 'cancelled' ? 'opacity-60 line-through' : ''}`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                                      <span className="tabular-nums shrink-0 font-extrabold">
                                        {formatTime12h(appt.appointment_time)
                                          .replace(':00 ', '')
                                          .replace(' ', '')}
                                      </span>
                                      <span className="truncate">{appt.customer_name}</span>
                                    </button>
                                  );
                                })}
                                {dayAppts.length > 3 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAnchorDate(parseIsoDateLocal(cell.dateStr));
                                      setCalendarScale('day');
                                    }}
                                    className="w-full text-left px-1 text-[10px] font-extrabold text-[#E87936] hover:underline"
                                  >
                                    +{dayAppts.length - 3} more bookings
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Selected Day Organized Agenda */}
                    <div className="pt-1">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div>
                          <h4 className="text-xs font-extrabold text-[#14243B]">
                            {parseIsoDateLocal(anchorIso).toLocaleDateString('en-US', {
                              weekday: 'long',
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </h4>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            {selectedMonthAppts.length} booking
                            {selectedMonthAppts.length === 1 ? '' : 's'}
                            {selectedMonthRevenue > 0
                              ? ` · ${formatCurrencyGhs(selectedMonthRevenue)} total value`
                              : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCalendarScale('day')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFF3EC] text-[#E87936] text-[11px] font-extrabold hover:bg-[#FFE4D1] transition"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Open Day Timeline</span>
                        </button>
                      </div>

                      {selectedMonthAppts.length === 0 ? (
                        <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-[#F5F6F8]/60 text-xs text-slate-500">
                          No appointments scheduled across any business on this date.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {selectedMonthAppts.map((appt) => {
                            const theme =
                              selectedMonthColorMap.get(appt.id) ||
                              computeCalendarEventLayout(appt as unknown as Appointment, 7, 20).theme;
                            const bizColor = getBusinessColor(appt.business_id);
                            const statusPill =
                              appt.status === 'confirmed'
                                ? 'bg-blue-600 text-white'
                                : appt.status === 'completed'
                                ? 'bg-emerald-600 text-white'
                                : appt.status === 'pending'
                                ? 'bg-amber-500 text-white'
                                : 'bg-rose-600 text-white';

                            return (
                              <button
                                key={appt.id}
                                type="button"
                                onClick={() => onSelectAppointmentId(appt.id)}
                                className={`p-3.5 rounded-2xl border ${theme.borderAll} border-l-4 text-left transition-all shadow-2xs hover:shadow-md ${
                                  theme.bg
                                } ${theme.border} ${
                                  appt.id === selectedAppointmentId
                                    ? 'ring-2 ring-[#E87936] shadow-md'
                                    : ''
                                } ${appt.status === 'cancelled' ? 'opacity-65' : ''}`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/85 border border-black/[0.06] text-[10px] font-extrabold text-[#14243B] truncate max-w-[65%]">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${bizColor.dot}`} />
                                    <span className="truncate">
                                      {appt.business?.name || 'Business'}
                                    </span>
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[9.5px] font-extrabold capitalize shrink-0 ${statusPill}`}
                                  >
                                    {appt.status}
                                  </span>
                                </div>
                                <p className={`text-sm font-extrabold truncate ${theme.titleText}`}>
                                  {appt.customer_name}
                                </p>
                                <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-black/[0.06]">
                                  <span className={`text-[11px] font-bold truncate ${theme.subText}`}>
                                    {appt.service?.name || 'Service'} &bull;{' '}
                                    <span className="tabular-nums">
                                      {formatTimeRange12h(appt.appointment_time, appt.end_time)}
                                    </span>
                                  </span>
                                  <span
                                    className={`text-xs font-extrabold tabular-nums shrink-0 ${theme.titleText}`}
                                  >
                                    {formatCurrencyGhs(appt.service_price)}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
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
