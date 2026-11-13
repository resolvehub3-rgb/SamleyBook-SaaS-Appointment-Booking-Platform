import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  Phone,
  MessageSquare,
  Search,
  Filter,
  Send,
  ChevronLeft,
  ChevronRight,
  Plus,
  Scissors,
  Hourglass,
  DollarSign,
  CheckCircle2,
  XCircle,
  Eye,
  X,
  FileText,
  CalendarClock,
  Check,
  BarChart3,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useBusiness } from '../../context/BusinessContext';
import { useNotifications } from '../../context/NotificationContext';
import { getSupabase } from '../../lib/supabase';
import {
  formatGHS,
  formatDurationMinutes,
  calculateEndTime,
} from '../../utils/booking-logic';
import {
  addDays,
  buildDayColorMap,
  CALENDAR_EVENT_THEMES,
  computeAppointmentKpis,
  computeCalendarEventLayout,
  assignDayEventColumns,
  formatShortDateRange,
  formatTime12h,
  formatTimeRange12h,
  getMonthCalendarGrid,
  getWeekDays,
  parseIsoDateLocal,
  toIsoDateStr,
} from '../../utils/dashboard-analytics';
import { Appointment, AppointmentStatus } from '../../types/database';
import { KpiSparklineCard } from './ui/KpiSparklineCard';
import { DashboardCharts } from './ui/DashboardCharts';
import { NewAppointmentModal } from './ui/NewAppointmentModal';
import { PRIMARY_ORANGE_BTN, SURFACE_CARD } from './ui/DashboardTokens';

export const AppointmentsView: React.FC = () => {
  const { currentBusiness, appointments, services, refreshBusinessData } = useBusiness();
  const { dispatchNotificationEvent } = useNotifications();
  const shouldReduceMotion = useReducedMotion();

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterServiceId, setFilterServiceId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');
  const [calMode, setCalMode] = useState<'month' | 'week' | 'day'>('week');
  const [selectedDate, setSelectedDate] = useState<string>(() => toIsoDateStr(new Date()));
  const [calMonth, setCalMonth] = useState<Date>(() => new Date());
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [smsActionLoading, setSmsActionLoading] = useState(false);
  const [smsActionMsg, setSmsActionMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [modalDefaultDate, setModalDefaultDate] = useState<string | undefined>(undefined);
  const [modalDefaultTime, setModalDefaultTime] = useState<string | undefined>(undefined);

  // Reschedule & Payment breakdown states inside details panel
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const openNewBookingAt = (dateStr?: string, timeStr?: string) => {
    setModalDefaultDate(dateStr || selectedDate);
    setModalDefaultTime(timeStr || '09:00');
    setNewModalOpen(true);
  };

  const applyOpenMode = (openMode: string | null) => {
    if (openMode === 'list') {
      setViewMode('list');
      setUpcomingOnly(false);
    } else if (openMode === 'calendar-month') {
      setViewMode('calendar');
      setCalMode('month');
      setUpcomingOnly(false);
    } else if (openMode === 'calendar-week') {
      setViewMode('calendar');
      setCalMode('week');
      setUpcomingOnly(false);
    } else if (openMode === 'calendar-day') {
      setViewMode('calendar');
      setCalMode('day');
      setUpcomingOnly(false);
    } else if (openMode === 'upcoming') {
      setViewMode('list');
      setUpcomingOnly(true);
    }
  };

  useEffect(() => {
    try {
      const openMode = localStorage.getItem('samley_appt_open_mode');
      if (openMode) {
        applyOpenMode(openMode);
      } else {
        const saved = localStorage.getItem('samley_appt_view');
        if (saved === 'list' || saved === 'calendar') setViewMode(saved);
      }

      const presetStatus = localStorage.getItem('samley_appt_status_filter');
      if (presetStatus) {
        setFilterStatus(presetStatus);
        localStorage.removeItem('samley_appt_status_filter');
      }
      const presetService = localStorage.getItem('samley_appt_service_filter');
      if (presetService) {
        setFilterServiceId(presetService);
        localStorage.removeItem('samley_appt_service_filter');
      }
      const presetDate = localStorage.getItem('samley_appt_focus_date');
      if (presetDate) {
        setSelectedDate(presetDate);
        setCalMonth(parseIsoDateLocal(presetDate));
        setViewMode('calendar');
        localStorage.removeItem('samley_appt_focus_date');
      }
    } catch {
      // ignore
    }

    const onModeEvent = (e: Event) => {
      const custom = e as CustomEvent<string>;
      applyOpenMode(custom.detail || localStorage.getItem('samley_appt_open_mode'));
    };
    window.addEventListener('samley_appt_mode_change', onModeEvent);
    return () => window.removeEventListener('samley_appt_mode_change', onModeEvent);
  }, []);

  useEffect(() => {
    localStorage.setItem('samley_appt_view', viewMode);
  }, [viewMode]);

  // Focus deep-linked ?appointmentId=... from push notification or in-app notification centre
  useEffect(() => {
    const applyDeepLink = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const targetId = params.get('appointmentId');
        if (!targetId) return;
        const match = appointments.find((a) => a.id === targetId);
        if (match) {
          setFilterStatus('all');
          setFilterServiceId('all');
          setUpcomingOnly(false);
          setSelectedDate(match.appointment_date);
          setCalMonth(parseIsoDateLocal(match.appointment_date));
          setSelectedAppt(match);
        }
      } catch {
        // ignore URL parse error
      }
    };

    applyDeepLink();
    window.addEventListener('samley_location_change', applyDeepLink);
    window.addEventListener('popstate', applyDeepLink);
    return () => {
      window.removeEventListener('samley_location_change', applyDeepLink);
      window.removeEventListener('popstate', applyDeepLink);
    };
  }, [appointments]);

  // Keep selectedAppt synchronized when appointments refresh
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deepLinkId = params.get('appointmentId');
    if (deepLinkId) {
      const target = appointments.find((a) => a.id === deepLinkId);
      if (target) {
        setSelectedAppt(target);
        return;
      }
    }

    if (selectedAppt) {
      const updated = appointments.find((a) => a.id === selectedAppt.id);
      if (updated) {
        setSelectedAppt(updated);
      } else {
        setSelectedAppt(null);
      }
    } else if (appointments.length > 0 && window.innerWidth >= 1280) {
      // Auto-select nearest upcoming or most recent appointment on desktop
      const todayStr = toIsoDateStr(new Date());
      const upcoming = appointments.find(
        (a) => a.appointment_date >= todayStr && a.status !== 'cancelled'
      );
      setSelectedAppt(upcoming || appointments[0]);
    }
  }, [appointments]);

  // Reset reschedule panel when switching selected appointment
  useEffect(() => {
    if (selectedAppt) {
      setRescheduleDate(selectedAppt.appointment_date);
      setRescheduleTime((selectedAppt.appointment_time || '09:00').slice(0, 5));
      setRescheduleOpen(false);
      setShowBreakdown(false);
    }
  }, [selectedAppt?.id]);

  const kpis = useMemo(() => computeAppointmentKpis(appointments), [appointments]);

  const filteredAppointments = useMemo(() => {
    const todayStr = toIsoDateStr(new Date());
    const q = searchQuery.toLowerCase().trim();
    return appointments.filter((a) => {
      const matchesStatus = filterStatus === 'all' || a.status === filterStatus;
      const matchesService = filterServiceId === 'all' || a.service_id === filterServiceId;
      const matchesSearch =
        !q ||
        a.customer_name.toLowerCase().includes(q) ||
        a.customer_phone.includes(q) ||
        (a.service?.name && a.service.name.toLowerCase().includes(q));
      const isUpcomingAppt =
        (a.status === 'confirmed' || a.status === 'pending') && a.appointment_date >= todayStr;
      return matchesStatus && matchesService && matchesSearch && (!upcomingOnly || isUpcomingAppt);
    });
  }, [appointments, filterStatus, filterServiceId, searchQuery, upcomingOnly]);

  const weekDays = useMemo(
    () => getWeekDays(selectedDate, filteredAppointments),
    [selectedDate, filteredAppointments]
  );

  const weekRangeLabel = useMemo(() => {
    if (weekDays.length < 7) return '';
    return formatShortDateRange(weekDays[0].dateStr, weekDays[6].dateStr);
  }, [weekDays]);

  // Dynamic hourly window covering 8:00 AM - 6:00 PM (expanding if any booking starts earlier or ends later)
  const { startHour, endHour, hourSlots } = useMemo(() => {
    let minH = 8;
    let maxH = 18;
    if (viewMode === 'calendar' && (calMode === 'week' || calMode === 'day')) {
      const targetDates =
        calMode === 'week'
          ? new Set(weekDays.map((d) => d.dateStr))
          : new Set([selectedDate]);
      filteredAppointments
        .filter((a) => targetDates.has(a.appointment_date))
        .forEach((a) => {
          const sh = Number((a.appointment_time || '08:00').split(':')[0]);
          const eh = Number((a.end_time || '17:00').split(':')[0]);
          if (!isNaN(sh)) minH = Math.min(minH, sh);
          if (!isNaN(eh)) maxH = Math.max(maxH, eh + 1);
        });
    }
    const clampedMin = Math.max(6, minH);
    const clampedMax = Math.min(22, Math.max(clampedMin + 8, maxH));
    const slots: number[] = [];
    for (let h = clampedMin; h < clampedMax; h++) {
      slots.push(h);
    }
    return { startHour: clampedMin, endHour: clampedMax, hourSlots: slots };
  }, [filteredAppointments, weekDays, viewMode, calMode, selectedDate]);

  // Live current-time indicator inside hourly grid when current time falls inside [startHour, endHour]
  const { nowIndicatorPct, nowTimeLabel } = useMemo(() => {
    const now = new Date();
    const curMin = now.getHours() * 60 + now.getMinutes();
    const minGrid = startHour * 60;
    const maxGrid = endHour * 60;
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    if (curMin < minGrid || curMin > maxGrid) {
      return { nowIndicatorPct: null, nowTimeLabel: formatTime12h(`${hh}:${mm}`) };
    }
    return {
      nowIndicatorPct: ((curMin - minGrid) / Math.max(maxGrid - minGrid, 60)) * 100,
      nowTimeLabel: formatTime12h(`${hh}:${mm}`),
    };
  }, [startHour, endHour]);

  const handleUpdateStatus = async (apptId: string, newStatus: AppointmentStatus) => {
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const oldStatus = appointments.find((a) => a.id === apptId)?.status;

      const { error } = await supabase
        .from('appointments')
        .update({ status: newStatus })
        .eq('id', apptId);

      if (error) {
        setSmsActionMsg({ ok: false, text: `Error updating appointment: ${error.message}` });
        setTimeout(() => setSmsActionMsg(null), 4000);
        return;
      }

      await refreshBusinessData();
      if (selectedAppt?.id === apptId) {
        setSelectedAppt((prev) => (prev ? { ...prev, status: newStatus } : null));
      }

      if (newStatus === 'cancelled' && oldStatus !== 'cancelled') {
        void dispatchNotificationEvent({
          type: 'appointment_cancelled',
          appointmentId: apptId,
        });
      }

      if (newStatus === 'completed' && oldStatus !== 'completed') {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          await fetch('/api/sms/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({
              type: 'feedback_invitation',
              appointmentId: apptId,
            }),
          });
        } catch (smsErr) {
          console.warn('Feedback invitation SMS trigger failed:', smsErr);
        }
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const handleRescheduleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppt || !rescheduleDate || !rescheduleTime) return;

    const prevDate = selectedAppt.appointment_date;
    const prevTime = selectedAppt.appointment_time;

    setRescheduleSaving(true);
    try {
      const supabase = getSupabase();
      if (!supabase) return;
      const duration = selectedAppt.service?.duration_minutes || 30;
      const newEndTime = calculateEndTime(rescheduleTime, duration);

      const { error } = await supabase
        .from('appointments')
        .update({
          appointment_date: rescheduleDate,
          appointment_time: rescheduleTime,
          end_time: newEndTime,
        })
        .eq('id', selectedAppt.id);

      if (error) {
        setSmsActionMsg({ ok: false, text: `Reschedule failed: ${error.message}` });
      } else {
        setSmsActionMsg({
          ok: true,
          text: `Rescheduled ${selectedAppt.customer_name} to ${rescheduleDate} at ${formatTime12h(
            rescheduleTime
          )}.`,
        });
        setRescheduleOpen(false);
        void dispatchNotificationEvent({
          type: 'appointment_rescheduled',
          appointmentId: selectedAppt.id,
          previousDate: prevDate,
          previousTime: prevTime,
        });
        await refreshBusinessData();
      }
      setTimeout(() => setSmsActionMsg(null), 4000);
    } catch (err) {
      setSmsActionMsg({
        ok: false,
        text: err instanceof Error ? err.message : 'Reschedule error',
      });
    } finally {
      setRescheduleSaving(false);
    }
  };

  const handleSendReminderSms = async (appt: Appointment) => {
    if (!currentBusiness) return;
    setSmsActionLoading(true);
    setSmsActionMsg(null);

    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          type: 'appointment_reminder',
          appointmentId: appt.id,
          recipient: appt.customer_phone,
        }),
      });
      const data = await res.json();
      if (data.ok || data.skipped || data.duplicate) {
        setSmsActionMsg({ ok: true, text: `SMS reminder sent to ${appt.customer_phone}.` });
      } else {
        setSmsActionMsg({ ok: false, text: data.error || 'Failed to send reminder.' });
      }
      setTimeout(() => setSmsActionMsg(null), 4000);
    } catch (err) {
      setSmsActionMsg({
        ok: false,
        text: err instanceof Error ? err.message : 'SMS send error',
      });
    } finally {
      setSmsActionLoading(false);
    }
  };

  const handleCalendarPrevNext = (direction: -1 | 1) => {
    if (calMode === 'month') {
      const d = new Date(calMonth);
      d.setMonth(d.getMonth() + direction);
      setCalMonth(d);
    } else if (calMode === 'week') {
      const next = addDays(parseIsoDateLocal(selectedDate), direction * 7);
      setSelectedDate(toIsoDateStr(next));
      setCalMonth(next);
    } else {
      const next = addDays(parseIsoDateLocal(selectedDate), direction);
      setSelectedDate(toIsoDateStr(next));
      setCalMonth(next);
    }
  };

  const handleTodayClick = () => {
    const now = new Date();
    setSelectedDate(toIsoDateStr(now));
    setCalMonth(now);
  };

  const activeToolbarLabel =
    calMode === 'month'
      ? calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : calMode === 'day'
      ? parseIsoDateLocal(selectedDate).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : weekRangeLabel;

  const renderDetailsPanel = (isModalMobile = false) => {
    if (!selectedAppt) {
      if (isModalMobile) return null;
      return (
        <div className={`${SURFACE_CARD} overflow-hidden h-full flex flex-col`}>
          <div className="bg-gradient-to-r from-[#FF6514] to-[#E64D00] px-5 py-3.5 text-white flex items-center justify-between">
            <h3 className="text-sm font-extrabold">Appointment Details</h3>
          </div>
          <div className="p-8 text-center flex-1 flex flex-col items-center justify-center space-y-2.5">
            <div className="w-11 h-11 rounded-2xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <p className="text-xs font-extrabold text-[#111827]">No Appointment Selected</p>
            <p className="text-[11px] text-slate-500 max-w-[220px]">
              Click any appointment card on the calendar or row in the list to inspect details and take action.
            </p>
          </div>
        </div>
      );
    }

    const durationMins = selectedAppt.service?.duration_minutes || 60;
    const formattedDate = parseIsoDateLocal(selectedAppt.appointment_date).toLocaleDateString(
      'en-US',
      {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }
    );

    const statusBadge =
      selectedAppt.status === 'confirmed'
        ? { bg: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Confirmed', icon: CheckCircle2 }
        : selectedAppt.status === 'completed'
        ? {
            bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            label: 'Completed',
            icon: CheckCircle2,
          }
        : selectedAppt.status === 'pending'
        ? { bg: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Pending', icon: Clock }
        : { bg: 'bg-rose-50 text-rose-700 border-rose-200', label: 'Cancelled', icon: XCircle };

    const payBadge =
      selectedAppt.payment_status === 'paid'
        ? { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Paid' }
        : selectedAppt.payment_status === 'deposit_paid'
        ? { bg: 'bg-purple-50 text-purple-700 border-purple-200', label: 'Deposit Paid' }
        : { bg: 'bg-slate-100 text-slate-600 border-slate-200', label: selectedAppt.payment_status };

    const StatusIcon = statusBadge.icon;

    return (
      <motion.div
        key={selectedAppt.id}
        initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.16 }}
        className={`${SURFACE_CARD} overflow-hidden text-left`}
      >
        {/* Orange Header */}
        <div className="bg-gradient-to-r from-[#FF6514] to-[#E64D00] px-5 py-3.5 text-white flex items-center justify-between">
          <h3 className="text-[15px] font-extrabold tracking-tight">Appointment Details</h3>
          <button
            type="button"
            onClick={() => setSelectedAppt(null)}
            aria-label="Close appointment details"
            className="p-1 rounded-lg text-white/85 hover:text-white hover:bg-white/15 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Customer Name & Phone ONLY (no email, no avatar) */}
          <div className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between gap-2">
              <p className="text-base font-extrabold text-[#111827] truncate">
                {selectedAppt.customer_name}
              </p>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">
                #{selectedAppt.id.substring(0, 6).toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-semibold font-mono">{selectedAppt.customer_phone}</span>
            </div>
          </div>

          {/* Key-Value Rows */}
          <div className="space-y-3 text-xs">
            <div className="flex items-start gap-3">
              <Scissors className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10.5px] font-semibold text-slate-400">Service</p>
                <p className="font-extrabold text-[#111827] mt-0.5">
                  {selectedAppt.service?.name || 'Service'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10.5px] font-semibold text-slate-400">Date</p>
                <p className="font-extrabold text-[#111827] mt-0.5">{formattedDate}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10.5px] font-semibold text-slate-400">Time</p>
                <p className="font-extrabold text-[#111827] mt-0.5">
                  {formatTimeRange12h(selectedAppt.appointment_time, selectedAppt.end_time)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Hourglass className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10.5px] font-semibold text-slate-400">Duration</p>
                <p className="font-extrabold text-[#111827] mt-0.5">
                  {formatDurationMinutes(durationMins)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <DollarSign className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10.5px] font-semibold text-slate-400">Amount</p>
                <p className="font-extrabold text-[#111827] mt-0.5">
                  {formatGHS(selectedAppt.service_price)}
                </p>
              </div>
            </div>
          </div>

          {/* Booking Status & Payment Status Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border ${statusBadge.bg}`}
            >
              <StatusIcon className="w-3.5 h-3.5" />
              <span>{statusBadge.label}</span>
            </span>

            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border capitalize ${payBadge.bg}`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>{payBadge.label}</span>
            </span>
          </div>

          {/* Customer Note Box */}
          {selectedAppt.notes && (
            <div className="p-3.5 rounded-xl bg-[#FEF9E7] border border-[#FDE68A] flex items-start gap-2.5">
              <FileText className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-extrabold text-[#111827]">Customer Note:</p>
                <p className="text-slate-700 mt-0.5 leading-relaxed">{selectedAppt.notes}</p>
              </div>
            </div>
          )}

          {/* Inline Reschedule Form */}
          {rescheduleOpen && (
            <form
              onSubmit={handleRescheduleSave}
              className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2.5"
            >
              <p className="text-[11px] font-extrabold text-blue-900">Reschedule Appointment</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  required
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-blue-200 bg-white text-[11px] font-semibold"
                />
                <input
                  type="time"
                  required
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-blue-200 bg-white text-[11px] font-mono font-semibold"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRescheduleOpen(false)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rescheduleSaving}
                  className="px-3 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 disabled:opacity-50"
                >
                  {rescheduleSaving ? 'Saving...' : 'Save Time'}
                </button>
              </div>
            </form>
          )}

          {/* Expanded Payment Breakdown */}
          {showBreakdown && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5 text-[11px]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Payment Breakdown
              </p>
              <div className="flex justify-between">
                <span className="text-slate-600">Service Price:</span>
                <span className="font-bold text-[#111827]">
                  {formatGHS(selectedAppt.service_price)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Required Upfront:</span>
                <span className="font-bold text-[#111827]">
                  {formatGHS(selectedAppt.payment_required)}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200/70">
                <span className="text-slate-600">Amount Received:</span>
                <span className="font-extrabold text-emerald-700">
                  {formatGHS(selectedAppt.payment_received)}
                </span>
              </div>
            </div>
          )}

          {/* Actions Stack */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <p className="text-xs font-extrabold text-[#111827] mb-2">Actions</p>

            <button
              type="button"
              onClick={() => setRescheduleOpen((v) => !v)}
              className="w-full py-2 px-3 rounded-xl border border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-bold flex items-center justify-center gap-2 transition"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              <span>Reschedule</span>
            </button>

            {selectedAppt.status === 'pending' && (
              <button
                type="button"
                onClick={() => handleUpdateStatus(selectedAppt.id, 'confirmed')}
                className="w-full py-2 px-3 rounded-xl border border-blue-200 bg-blue-50/50 text-blue-700 hover:bg-blue-100 text-xs font-bold flex items-center justify-center gap-2 transition"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm Booking</span>
              </button>
            )}

            {selectedAppt.status !== 'completed' && selectedAppt.status !== 'cancelled' && (
              <button
                type="button"
                onClick={() => handleUpdateStatus(selectedAppt.id, 'completed')}
                className="w-full py-2 px-3 rounded-xl border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs font-bold flex items-center justify-center gap-2 transition"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mark Completed</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSendReminderSms(selectedAppt)}
              disabled={smsActionLoading}
              className="w-full py-2 px-3 rounded-xl border border-orange-200 text-[#EA580C] hover:bg-orange-50 text-xs font-bold flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{smsActionLoading ? 'Sending SMS...' : 'Send SMS Reminder'}</span>
            </button>

            {selectedAppt.status !== 'cancelled' && (
              <button
                type="button"
                onClick={() => handleUpdateStatus(selectedAppt.id, 'cancelled')}
                className="w-full py-2 px-3 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold flex items-center justify-center gap-2 transition"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Cancel Booking</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowBreakdown((v) => !v)}
              className="w-full py-2 px-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold flex items-center justify-center gap-2 transition"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{showBreakdown ? 'Hide Details' : 'View Details'}</span>
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-5 text-left">
      {/* 1. Five Pastel Gradient KPI Cards with Sparklines (2 grid cols on mobile, 5 cols on desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
        {kpis.map((metric) => {
          const targetStatus = metric.key === 'total' ? 'all' : metric.key;
          return (
            <KpiSparklineCard
              key={metric.key}
              metric={metric}
              totalCount={appointments.length}
              active={filterStatus === targetStatus}
              className={metric.key === 'total' ? 'col-span-2 lg:col-span-1' : ''}
              onClick={() =>
                setFilterStatus((prev) =>
                  prev === targetStatus && targetStatus !== 'all' ? 'all' : targetStatus
                )
              }
            />
          );
        })}
      </div>

      {/* 2. Search, Date Range, View Switcher, + New Appointment Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by customer name, phone or service..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-200/80 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.03)] focus:outline-none focus:ring-2 focus:ring-[#F95700]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Date Picker Pill */}
          <label className="relative inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200/80 shadow-[0_2px_8px_rgba(15,23,42,0.03)] text-xs font-bold text-[#111827] cursor-pointer hover:border-orange-300 transition">
            <Calendar className="w-4 h-4 text-slate-600" />
            <span>{activeToolbarLabel || selectedDate}</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedDate(e.target.value);
                  setCalMonth(parseIsoDateLocal(e.target.value));
                }
              }}
              aria-label="Select reference date"
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>

          {/* View Switcher: List | Month | Week | Day */}
          <div className="inline-flex items-center bg-white border border-slate-200/80 rounded-xl p-1 shadow-[0_2px_8px_rgba(15,23,42,0.03)]">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'list'
                  ? 'bg-[#F95700] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              List
            </button>
            {(['month', 'week', 'day'] as const).map((m) => {
              const active = viewMode === 'calendar' && calMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setViewMode('calendar');
                    setCalMode(m);
                    setUpcomingOnly(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition ${
                    active
                      ? 'bg-[#F95700] text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>

          {/* Primary CTA: + New Appointment */}
          <button
            type="button"
            onClick={() => openNewBookingAt(selectedDate, '09:00')}
            className={`${PRIMARY_ORANGE_BTN} px-4 py-2.5 text-xs`}
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Appointment</span>
          </button>
        </div>
      </div>

      {/* Status Filter Pills Row (Preserving status filters & Upcoming toggle) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['all', 'pending', 'confirmed', 'completed', 'cancelled'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold capitalize transition shrink-0 ${
                filterStatus === st
                  ? 'bg-[#0E1733] text-white shadow-xs'
                  : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {st}
            </button>
          ))}
          {upcomingOnly && (
            <button
              type="button"
              onClick={() => setUpcomingOnly(false)}
              className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-[#FFF3EC] text-[#F95700] border border-[#FED7AA] inline-flex items-center gap-1 shrink-0"
            >
              <span>Upcoming Only</span>
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Analytics Charts Toggle */}
          <button
            type="button"
            onClick={() => setShowAnalytics((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition shrink-0 ${
              showAnalytics
                ? 'bg-[#FFF3EC] text-[#F95700] border border-[#FED7AA]'
                : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{showAnalytics ? 'Hide Charts' : 'Analytics Charts'}</span>
          </button>

          {/* SMS Feedback Toast */}
          {smsActionMsg && (
            <div
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                smsActionMsg.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>{smsActionMsg.text}</span>
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Live Analytics Charts Row */}
      {showAnalytics && (
        <DashboardCharts appointments={appointments} services={services} />
      )}

      {/* 3. Main Workspace Split: Left Calendar/List + Right Appointment Details */}
      <div className="flex flex-col xl:flex-row gap-5 items-start">
        {/* LEFT / CENTER WORKSPACE */}
        <div className="flex-1 min-w-0 w-full">
          {viewMode === 'calendar' ? (
            <div className={`${SURFACE_CARD} overflow-hidden`}>
              {/* Real Calendar Control Header */}
              <div className="px-4 sm:px-5 py-3.5 bg-white border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
                {/* Left Segmented Prev / Today / Next */}
                <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white divide-x divide-slate-200 shadow-2xs overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleCalendarPrevNext(-1)}
                    aria-label="Previous period"
                    className="px-2.5 py-1.5 text-slate-600 hover:text-[#F95700] hover:bg-orange-50/70 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleTodayClick}
                    className="px-3.5 py-1.5 text-xs font-extrabold text-[#111827] hover:text-[#F95700] hover:bg-orange-50/70 transition"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCalendarPrevNext(1)}
                    aria-label="Next period"
                    className="px-2.5 py-1.5 text-slate-600 hover:text-[#F95700] hover:bg-orange-50/70 transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Center Real Calendar Title & Live Metrics */}
                <div className="text-left sm:text-center">
                  <p className="text-[15px] font-extrabold text-[#111827] tracking-tight leading-tight">
                    {activeToolbarLabel}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-500 tabular-nums mt-0.5">
                    {calMode === 'week'
                      ? `Week Schedule · ${weekDays.reduce((s, d) => s + d.count, 0)} active booking${
                          weekDays.reduce((s, d) => s + d.count, 0) === 1 ? '' : 's'
                        }`
                      : calMode === 'month'
                      ? `Monthly Overview · ${
                          filteredAppointments.filter((a) => {
                            const ym = `${calMonth.getFullYear()}-${String(
                              calMonth.getMonth() + 1
                            ).padStart(2, '0')}`;
                            return a.appointment_date.startsWith(ym) && a.status !== 'cancelled';
                          }).length
                        } bookings this month`
                      : `Daily Schedule · ${
                          filteredAppointments.filter(
                            (a) => a.appointment_date === selectedDate && a.status !== 'cancelled'
                          ).length
                        } active booking${
                          filteredAppointments.filter(
                            (a) => a.appointment_date === selectedDate && a.status !== 'cancelled'
                          ).length === 1
                            ? ''
                            : 's'
                        }`}
                  </p>
                </div>

                {/* Right Service Filter */}
                <div className="flex items-center gap-2">
                  {filterServiceId !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setFilterServiceId('all')}
                      className="text-[11px] font-bold text-[#F95700] hover:underline"
                    >
                      Clear
                    </button>
                  )}
                  <div className="relative flex items-center">
                    <Filter className="w-3.5 h-3.5 text-slate-500 absolute left-3 pointer-events-none" />
                    <select
                      value={filterServiceId}
                      onChange={(e) => setFilterServiceId(e.target.value)}
                      aria-label="Filter by service"
                      className="pl-8 pr-7 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:border-orange-200 focus:outline-none focus:ring-2 focus:ring-[#F95700]"
                    >
                      <option value="all">All Services</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Interactive Status & Multi-Color Booking Legend Bar */}
              <div className="px-4 sm:px-5 py-2.5 bg-gradient-to-r from-slate-50 via-white to-orange-50/40 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2.5 text-[11px]">
                <div className="flex flex-wrap items-center gap-3">
                  {(
                    [
                      { key: 'confirmed', label: 'Confirmed', dot: 'bg-blue-500', pill: 'bg-blue-50 border-blue-200 text-blue-700' },
                      { key: 'pending', label: 'Pending', dot: 'bg-amber-500', pill: 'bg-amber-50 border-amber-200 text-amber-700' },
                      { key: 'completed', label: 'Completed', dot: 'bg-emerald-500', pill: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                      { key: 'cancelled', label: 'Cancelled', dot: 'bg-rose-500', pill: 'bg-rose-50 border-rose-200 text-rose-700' },
                    ] as const
                  ).map((st) => {
                    const active = filterStatus === st.key;
                    return (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() =>
                          setFilterStatus((prev) => (prev === st.key ? 'all' : st.key))
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border font-bold transition ${
                          active
                            ? `${st.pill} shadow-2xs`
                            : 'bg-white border-slate-200/80 text-slate-600 hover:border-slate-300 hover:text-[#111827]'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                        <span>{st.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white border border-slate-200/80 text-[10px] font-bold text-slate-600">
                    <span className="flex items-center -space-x-1">
                      {CALENDAR_EVENT_THEMES.slice(0, 6).map((t) => (
                        <span
                          key={t.name}
                          className={`w-2.5 h-2.5 rounded-full ring-1 ring-white ${t.dot}`}
                        />
                      ))}
                    </span>
                    <span>Distinct per-booking colors</span>
                  </div>
                  <span className="text-[10.5px] font-medium text-slate-400 hidden sm:inline">
                    Click any empty slot to create a booking
                  </span>
                </div>
              </div>

              {/* WEEK VIEW (Real Calendar Time-Grid) */}
              {calMode === 'week' && (
                <div className="overflow-x-auto">
                  <div className="min-w-[740px]">
                    {/* Day Columns Header */}
                    <div className="grid grid-cols-[68px_repeat(7,minmax(0,1fr))] border-b border-slate-200/80 bg-white">
                      <div className="sticky left-0 z-30 bg-white border-r border-slate-200/80 p-2 flex items-end justify-end pr-2 pb-2.5">
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">
                          GMT
                        </span>
                      </div>
                      {weekDays.map((day) => {
                        const dateNum = day.dateLabel.replace(/^\D+\s*/, '');
                        const isSelectedDay = selectedDate === day.dateStr;
                        return (
                          <button
                            key={day.dateStr}
                            type="button"
                            onClick={() => setSelectedDate(day.dateStr)}
                            className={`py-2.5 px-2 text-center transition border-l border-slate-100 flex flex-col items-center gap-1 ${
                              day.isToday
                                ? 'bg-[#FFF9F5]'
                                : isSelectedDay
                                ? 'bg-slate-50/90'
                                : 'hover:bg-slate-50/60'
                            }`}
                          >
                            <span
                              className={`text-[10.5px] font-extrabold uppercase tracking-wider ${
                                day.isToday ? 'text-[#F95700]' : 'text-slate-400'
                              }`}
                            >
                              {day.dayShort}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-8 h-8 rounded-full text-sm font-extrabold tabular-nums inline-flex items-center justify-center transition ${
                                  day.isToday
                                    ? 'bg-[#F95700] text-white shadow-[0_3px_10px_rgba(249,87,0,0.3)]'
                                    : isSelectedDay
                                    ? 'bg-[#0E1733] text-white'
                                    : 'text-[#111827]'
                                }`}
                              >
                                {dateNum}
                              </span>
                            </div>
                            <span
                              className={`text-[10px] font-semibold tabular-nums ${
                                day.count > 0
                                  ? day.isToday
                                    ? 'text-[#F95700]'
                                    : 'text-slate-500'
                                  : 'text-slate-300'
                              }`}
                            >
                              {day.count > 0
                                ? `${day.count} ${day.count === 1 ? 'appt' : 'appts'}`
                                : 'Open'}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Hourly Time Grid (72px per hour) */}
                    <div
                      className="grid grid-cols-[68px_repeat(7,minmax(0,1fr))] relative"
                      style={{ height: `${hourSlots.length * 72}px` }}
                    >
                      {/* Sticky Left Time Axis */}
                      <div className="relative sticky left-0 z-30 border-r border-slate-200/80 bg-white">
                        {hourSlots.map((h, i) => (
                          <div
                            key={h}
                            className="h-[72px] pr-2 text-right border-b border-transparent relative"
                          >
                            <span
                              className={`inline-block whitespace-nowrap text-[10.5px] font-semibold tabular-nums text-slate-400 bg-white pr-0.5 ${
                                i === 0 ? 'pt-1' : '-translate-y-2'
                              }`}
                            >
                              {formatTime12h(`${h}:00`)}
                            </span>
                          </div>
                        ))}
                        {nowIndicatorPct !== null && (
                          <div
                            aria-hidden="true"
                            style={{ top: `${nowIndicatorPct}%` }}
                            className="pointer-events-none absolute right-1 -translate-y-1/2 z-40 px-1.5 py-0.5 rounded-md bg-[#F95700] text-white text-[9px] font-extrabold tabular-nums shadow-xs whitespace-nowrap"
                          >
                            {nowTimeLabel}
                          </div>
                        )}
                      </div>

                      {/* 7 Day Columns */}
                      {weekDays.map((day) => {
                        const dayAppts = filteredAppointments
                          .filter((a) => a.appointment_date === day.dateStr)
                          .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
                        const positioned = assignDayEventColumns(dayAppts, startHour, endHour);

                        return (
                          <div
                            key={day.dateStr}
                            className={`relative border-l border-slate-100 ${
                              day.isToday ? 'bg-[#FFF9F5]/55' : 'bg-white'
                            }`}
                          >
                            {/* Interactive Empty Hour Cells with Half-Hour Dashed Guides */}
                            {hourSlots.map((h) => {
                              const slotTime = `${String(h).padStart(2, '0')}:00`;
                              return (
                                <button
                                  key={h}
                                  type="button"
                                  onClick={() => openNewBookingAt(day.dateStr, slotTime)}
                                  title={`Book at ${formatTime12h(slotTime)} on ${day.dateLabel}`}
                                  className="group relative block w-full h-[72px] border-b border-slate-200/70 hover:bg-orange-50/45 transition-colors text-left"
                                >
                                  <span
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-slate-100"
                                  />
                                  <span className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute right-1.5 top-1.5 px-1.5 py-0.5 rounded-md bg-white border border-orange-200 text-[9.5px] font-bold text-[#F95700] shadow-2xs tabular-nums">
                                    + {formatTime12h(slotTime)}
                                  </span>
                                </button>
                              );
                            })}

                            {/* Live Current-Time Line across Today */}
                            {day.isToday && nowIndicatorPct !== null && (
                              <div
                                aria-hidden="true"
                                style={{ top: `${nowIndicatorPct}%` }}
                                className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                              >
                                <span className="w-2.5 h-2.5 -ml-1.5 rounded-full bg-[#F95700] ring-2 ring-white shadow-xs" />
                                <span className="flex-1 h-[2px] bg-[#F95700]" />
                              </div>
                            )}

                            {/* Positioned Appointment Cards (side-by-side on overlap, distinct vibrant colors) */}
                            {positioned.map(
                              ({ appointment: appt, topPct, heightPct, leftPct, widthPct, theme }) => {
                                const isSelected = selectedAppt?.id === appt.id;
                                const dotColor =
                                  appt.status === 'completed'
                                    ? 'bg-emerald-500'
                                    : appt.status === 'confirmed'
                                    ? 'bg-blue-600'
                                    : appt.status === 'pending'
                                    ? 'bg-amber-500'
                                    : 'bg-rose-500';
                                return (
                                  <motion.button
                                    key={appt.id}
                                    type="button"
                                    initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.96 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.16 }}
                                    title={`${appt.customer_name} • ${
                                      appt.service?.name || 'Service'
                                    } (${formatTimeRange12h(
                                      appt.appointment_time,
                                      appt.end_time
                                    )}) • ${formatGHS(appt.service_price)}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedAppt(appt);
                                    }}
                                    style={{
                                      top: `calc(${topPct}% + 2px)`,
                                      height: `calc(${heightPct}% - 4px)`,
                                      minHeight: '50px',
                                      left: `calc(${leftPct}% + 2px)`,
                                      width: `calc(${widthPct}% - 4px)`,
                                    }}
                                    className={`absolute rounded-xl border ${theme.borderAll} border-l-4 px-2 py-1.5 text-left overflow-hidden transition-all shadow-[0_2px_8px_rgba(15,23,42,0.07)] hover:shadow-lg hover:-translate-y-0.5 z-10 flex flex-col justify-between ${
                                      theme.bg
                                    } ${theme.border} ${
                                      isSelected
                                        ? 'ring-2 ring-[#F95700] ring-offset-1 shadow-lg z-20'
                                        : ''
                                    } ${appt.status === 'cancelled' ? 'opacity-60' : ''}`}
                                  >
                                    <div className="min-w-0">
                                      <div className="flex items-center justify-between gap-1">
                                        <p
                                          className={`text-[11px] font-extrabold leading-tight truncate ${theme.titleText} ${
                                            appt.status === 'cancelled' ? 'line-through' : ''
                                          }`}
                                        >
                                          {appt.customer_name}
                                        </p>
                                        <span
                                          className={`w-2 h-2 rounded-full shrink-0 ring-1 ring-white ${dotColor}`}
                                          title={`Status: ${appt.status}`}
                                        />
                                      </div>
                                      <div className="mt-0.5 flex items-center gap-1 min-w-0">
                                        <span
                                          className={`inline-block max-w-full truncate px-1.5 py-0.2 rounded-md border text-[9.5px] font-bold ${theme.pill}`}
                                        >
                                          {appt.service?.name || 'Service'}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-1 mt-0.5 pt-0.5 border-t border-black/[0.05]">
                                      <span
                                        className={`text-[9.5px] font-bold tabular-nums leading-tight truncate ${theme.subText}`}
                                      >
                                        {formatTime12h(appt.appointment_time)}
                                      </span>
                                      <span
                                        className={`text-[9.5px] font-extrabold tabular-nums shrink-0 ${theme.titleText}`}
                                      >
                                        {formatGHS(appt.service_price)}
                                      </span>
                                    </div>
                                  </motion.button>
                                );
                              }
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* MONTH VIEW (Real Connected Monthly Calendar Grid) */}
              {calMode === 'month' && (() => {
                const monthCells = getMonthCalendarGrid(
                  calMonth.getFullYear(),
                  calMonth.getMonth()
                );
                const selectedDayAppts = filteredAppointments
                  .filter((a) => a.appointment_date === selectedDate)
                  .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
                const selectedDayRevenue = selectedDayAppts
                  .filter((a) => a.status !== 'cancelled')
                  .reduce((sum, a) => sum + Number(a.service_price || 0), 0);

                const selectedDayColorMap = buildDayColorMap(selectedDayAppts);

                return (
                  <div className="p-4 sm:p-5 space-y-5">
                    <div className="rounded-2xl border border-slate-200/85 overflow-hidden bg-white shadow-2xs">
                      {/* Weekday Header Bar */}
                      <div className="grid grid-cols-7 border-b border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-orange-50/40">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, idx) => (
                          <div
                            key={d}
                            className={`py-2.5 text-center text-[11px] font-extrabold uppercase tracking-wider border-r last:border-r-0 border-slate-200/70 ${
                              idx === 0 || idx === 6 ? 'text-orange-600/80' : 'text-slate-600'
                            }`}
                          >
                            {d}
                          </div>
                        ))}
                      </div>

                      {/* Connected 7-Column Calendar Cells */}
                      <div className="grid grid-cols-7">
                        {monthCells.map((cell) => {
                          const dayAppts = filteredAppointments
                            .filter((a) => a.appointment_date === cell.dateStr)
                            .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
                          const dayColorMap = buildDayColorMap(dayAppts);
                          const isSelected = selectedDate === cell.dateStr;

                          return (
                            <div
                              key={cell.dateStr}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                setSelectedDate(cell.dateStr);
                                if (!cell.isCurrentMonth) {
                                  setCalMonth(parseIsoDateLocal(cell.dateStr));
                                }
                                if (dayAppts.length > 0) setSelectedAppt(dayAppts[0]);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setSelectedDate(cell.dateStr);
                                  if (!cell.isCurrentMonth) {
                                    setCalMonth(parseIsoDateLocal(cell.dateStr));
                                  }
                                }
                              }}
                              className={`group min-h-[120px] p-2 border-r border-b border-slate-200/70 [&:nth-child(7n)]:border-r-0 text-left flex flex-col justify-between transition cursor-pointer ${
                                isSelected
                                  ? 'bg-[#FFF5EE]'
                                  : !cell.isCurrentMonth
                                  ? 'bg-slate-50/60'
                                  : cell.isWeekend
                                  ? 'bg-slate-50/35 hover:bg-orange-50/30'
                                  : 'bg-white hover:bg-orange-50/25'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span
                                  className={`w-7 h-7 rounded-full text-xs font-extrabold tabular-nums inline-flex items-center justify-center transition ${
                                    cell.isToday
                                      ? 'bg-[#F95700] text-white shadow-[0_2px_8px_rgba(249,87,0,0.3)]'
                                      : isSelected
                                      ? 'bg-[#0E1733] text-white'
                                      : cell.isCurrentMonth
                                      ? 'text-[#111827]'
                                      : 'text-slate-300'
                                  }`}
                                >
                                  {cell.dayNumber}
                                </span>

                                <div className="flex items-center gap-1">
                                  {dayAppts.length > 0 && (
                                    <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-[10px] font-extrabold tabular-nums text-slate-700">
                                      {dayAppts.length}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openNewBookingAt(cell.dateStr, '09:00');
                                    }}
                                    title={`New booking on ${cell.dateStr}`}
                                    aria-label={`New booking on ${cell.dateStr}`}
                                    className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-md bg-white border border-slate-200 text-[#F95700] hover:border-orange-300 flex items-center justify-center transition"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-1 mt-1.5 w-full">
                                {dayAppts.slice(0, 3).map((a) => {
                                  const theme =
                                    dayColorMap.get(a.id) || computeCalendarEventLayout(a, 8, 18).theme;
                                  const dotColor =
                                    a.status === 'completed'
                                      ? 'bg-emerald-500'
                                      : a.status === 'confirmed'
                                      ? 'bg-blue-600'
                                      : a.status === 'pending'
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500';
                                  return (
                                    <button
                                      key={a.id}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDate(cell.dateStr);
                                        setSelectedAppt(a);
                                      }}
                                      className={`w-full text-left flex items-center justify-between gap-1 text-[10px] font-bold truncate px-1.5 py-1 rounded-md border ${theme.borderAll} border-l-[3px] ${theme.border} transition ${
                                        theme.bg
                                      } ${theme.titleText} ${
                                        selectedAppt?.id === a.id
                                          ? 'ring-1 ring-[#F95700] shadow-xs'
                                          : 'hover:brightness-97'
                                      } ${a.status === 'cancelled' ? 'opacity-55 line-through' : ''}`}
                                    >
                                      <span className="flex items-center gap-1 min-w-0">
                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                                        <span className="tabular-nums shrink-0 font-extrabold">
                                          {formatTime12h(a.appointment_time).replace(':00 ', '').replace(' ', '')}
                                        </span>
                                        <span className="truncate">{a.customer_name}</span>
                                      </span>
                                    </button>
                                  );
                                })}
                                {dayAppts.length > 3 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedDate(cell.dateStr);
                                      setCalMode('day');
                                    }}
                                    className="text-[10px] font-extrabold text-[#F95700] hover:underline px-1"
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

                    {/* Selected Day Agenda Bar */}
                    <div className="pt-1">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div>
                          <h4 className="text-xs font-extrabold text-[#111827]">
                            {parseIsoDateLocal(selectedDate).toLocaleDateString('en-US', {
                              weekday: 'long',
                              month: 'long',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </h4>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            {selectedDayAppts.length} booking{selectedDayAppts.length === 1 ? '' : 's'}
                            {selectedDayRevenue > 0 ? ` · ${formatGHS(selectedDayRevenue)} value` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openNewBookingAt(selectedDate, '09:00')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFF3EC] text-[#EA580C] text-[11px] font-extrabold hover:bg-[#FFE4D1] transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>New Booking for Day</span>
                        </button>
                      </div>

                      {selectedDayAppts.length === 0 ? (
                        <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-xs text-slate-500">
                          No appointments scheduled for this date. Click New Booking for Day to add one.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {selectedDayAppts.map((a) => {
                            const theme =
                              selectedDayColorMap.get(a.id) || computeCalendarEventLayout(a, 8, 18).theme;
                            const statusPill =
                              a.status === 'confirmed'
                                ? 'bg-blue-600 text-white'
                                : a.status === 'completed'
                                ? 'bg-emerald-600 text-white'
                                : a.status === 'pending'
                                ? 'bg-amber-500 text-white'
                                : 'bg-rose-600 text-white';
                            return (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => setSelectedAppt(a)}
                                className={`p-3.5 rounded-2xl border ${theme.borderAll} border-l-4 text-left transition-all shadow-2xs hover:shadow-md ${
                                  theme.bg
                                } ${theme.border} ${
                                  selectedAppt?.id === a.id
                                    ? 'ring-2 ring-[#F95700] shadow-md'
                                    : ''
                                } ${a.status === 'cancelled' ? 'opacity-65' : ''}`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-extrabold tabular-nums ${theme.pill}`}
                                  >
                                    <Clock className="w-3 h-3" />
                                    {formatTimeRange12h(a.appointment_time, a.end_time)}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[9.5px] font-extrabold capitalize ${statusPill}`}
                                  >
                                    {a.status}
                                  </span>
                                </div>
                                <p className={`text-sm font-extrabold truncate ${theme.titleText}`}>
                                  {a.customer_name}
                                </p>
                                <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-black/[0.06]">
                                  <span className={`text-[11px] font-bold truncate ${theme.subText}`}>
                                    {a.service?.name || 'Service'}
                                  </span>
                                  <span className={`text-xs font-extrabold tabular-nums shrink-0 ${theme.titleText}`}>
                                    {formatGHS(a.service_price)}
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

              {/* DAY VIEW (Executive Daily Schedule Timeline) */}
              {calMode === 'day' && (() => {
                const dayAppts = filteredAppointments
                  .filter((a) => a.appointment_date === selectedDate)
                  .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
                const positioned = assignDayEventColumns(dayAppts, startHour, endHour);
                const isTodaySelected = selectedDate === toIsoDateStr(new Date());
                const dayRevenue = dayAppts
                  .filter((a) => a.status !== 'cancelled')
                  .reduce((sum, a) => sum + Number(a.service_price || 0), 0);

                return (
                  <div className="overflow-hidden">
                    {/* Day Context Sub-Header */}
                    <div className="px-4 sm:px-5 py-3 bg-[#FFF9F5]/60 border-b border-slate-200/70 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-extrabold ${
                            isTodaySelected
                              ? 'bg-[#F95700] text-white'
                              : 'bg-white border border-slate-200 text-[#111827]'
                          }`}
                        >
                          {parseIsoDateLocal(selectedDate).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        <span className="text-xs font-semibold text-slate-600 tabular-nums">
                          {dayAppts.length} booking{dayAppts.length === 1 ? '' : 's'}
                          {dayRevenue > 0 ? ` · ${formatGHS(dayRevenue)} scheduled` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openNewBookingAt(selectedDate, '09:00')}
                        className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#F95700] hover:underline"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Slot</span>
                      </button>
                    </div>

                    <div
                      className="grid grid-cols-[72px_1fr] relative"
                      style={{ height: `${hourSlots.length * 72}px` }}
                    >
                      {/* Left Time Axis */}
                      <div className="relative border-r border-slate-200/80 bg-white">
                        {hourSlots.map((h, i) => (
                          <div
                            key={h}
                            className="h-[72px] pr-2.5 text-right border-b border-transparent relative"
                          >
                            <span
                              className={`inline-block whitespace-nowrap text-[10.5px] font-semibold tabular-nums text-slate-400 bg-white pr-0.5 ${
                                i === 0 ? 'pt-1' : '-translate-y-2'
                              }`}
                            >
                              {formatTime12h(`${h}:00`)}
                            </span>
                          </div>
                        ))}
                        {isTodaySelected && nowIndicatorPct !== null && (
                          <div
                            aria-hidden="true"
                            style={{ top: `${nowIndicatorPct}%` }}
                            className="pointer-events-none absolute right-1 -translate-y-1/2 z-30 px-1.5 py-0.5 rounded-md bg-[#F95700] text-white text-[9px] font-extrabold tabular-nums shadow-xs whitespace-nowrap"
                          >
                            {nowTimeLabel}
                          </div>
                        )}
                      </div>

                      {/* Single Day Timeline Column */}
                      <div
                        className={`relative ${
                          isTodaySelected ? 'bg-[#FFF9F5]/55' : 'bg-white'
                        }`}
                      >
                        {hourSlots.map((h) => {
                          const slotTime = `${String(h).padStart(2, '0')}:00`;
                          return (
                            <button
                              key={h}
                              type="button"
                              onClick={() => openNewBookingAt(selectedDate, slotTime)}
                              className="group relative block w-full h-[72px] border-b border-slate-200/70 hover:bg-orange-50/45 transition-colors text-left"
                            >
                              <span
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-slate-100"
                              />
                              <span className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute right-3 top-2 px-2 py-0.5 rounded-lg bg-white border border-orange-200 text-[10px] font-bold text-[#F95700] shadow-2xs tabular-nums">
                                + Book {formatTime12h(slotTime)}
                              </span>
                            </button>
                          );
                        })}

                        {isTodaySelected && nowIndicatorPct !== null && (
                          <div
                            aria-hidden="true"
                            style={{ top: `${nowIndicatorPct}%` }}
                            className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                          >
                            <span className="w-2.5 h-2.5 -ml-1.5 rounded-full bg-[#F95700] ring-2 ring-white shadow-xs" />
                            <span className="flex-1 h-[2px] bg-[#F95700]" />
                          </div>
                        )}

                        {positioned.map(
                          ({ appointment: appt, topPct, heightPct, leftPct, widthPct, theme }) => {
                            const isSelected = selectedAppt?.id === appt.id;
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
                                initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.18 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAppt(appt);
                                }}
                                style={{
                                  top: `calc(${topPct}% + 2px)`,
                                  height: `calc(${heightPct}% - 4px)`,
                                  minHeight: '62px',
                                  left: `calc(${leftPct}% + 8px)`,
                                  width: `calc(${widthPct}% - 16px)`,
                                }}
                                className={`absolute rounded-2xl border ${theme.borderAll} border-l-4 px-4 py-2.5 text-left flex items-center justify-between gap-3 overflow-hidden transition-all shadow-[0_3px_10px_rgba(15,23,42,0.07)] hover:shadow-lg z-10 ${
                                  theme.bg
                                } ${theme.border} ${
                                  isSelected ? 'ring-2 ring-[#F95700] ring-offset-1 z-20' : ''
                                } ${appt.status === 'cancelled' ? 'opacity-60' : ''}`}
                              >
                                <div className="min-w-0 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${theme.dot}`} />
                                    <p
                                      className={`text-sm font-extrabold truncate ${theme.titleText} ${
                                        appt.status === 'cancelled' ? 'line-through' : ''
                                      }`}
                                    >
                                      {appt.customer_name}
                                    </p>
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[9.5px] font-extrabold capitalize shrink-0 ${statusBadgeCls}`}
                                    >
                                      {appt.status}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                                    <span className={`px-2 py-0.5 rounded-md border ${theme.pill}`}>
                                      {appt.service?.name || 'Service'}
                                    </span>
                                    <span className={`tabular-nums ${theme.subText}`}>
                                      {formatTimeRange12h(appt.appointment_time, appt.end_time)}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className={`text-sm font-extrabold tabular-nums ${theme.titleText}`}>
                                    {formatGHS(appt.service_price)}
                                  </p>
                                  <span
                                    className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold capitalize border ${theme.pill}`}
                                  >
                                    {appt.payment_status.replace('_', ' ')}
                                  </span>
                                </div>
                              </motion.button>
                            );
                          }
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            /* LIST VIEW */
            <>
              {filteredAppointments.length === 0 ? (
                <div className={`${SURFACE_CARD} p-12 text-center space-y-3`}>
                  <div className="w-12 h-12 rounded-2xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center mx-auto">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-extrabold text-[#111827]">No Appointments Found</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {searchQuery || filterStatus !== 'all' || filterServiceId !== 'all'
                      ? 'No appointments match your current search or filter.'
                      : 'Your booking schedule is currently empty. Share your QR code or create a booking to get started.'}
                  </p>
                </div>
              ) : (
                <div className={`${SURFACE_CARD} overflow-hidden`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/90 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="py-3.5 px-5">Customer</th>
                          <th className="py-3.5 px-5">Service</th>
                          <th className="py-3.5 px-5">Date & Slot</th>
                          <th className="py-3.5 px-5">Financials</th>
                          <th className="py-3.5 px-5">Booking Status</th>
                          <th className="py-3.5 px-5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredAppointments.map((appt) => {
                          const isSelected = selectedAppt?.id === appt.id;
                          return (
                            <tr
                              key={appt.id}
                              onClick={() => setSelectedAppt(appt)}
                              className={`cursor-pointer transition ${
                                isSelected ? 'bg-[#FFF5EE]/70' : 'hover:bg-slate-50/70'
                              }`}
                            >
                              <td className="py-3.5 px-5">
                                <p className="font-extrabold text-[#111827]">{appt.customer_name}</p>
                                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                                  {appt.customer_phone}
                                </p>
                              </td>
                              <td className="py-3.5 px-5">
                                <p className="font-bold text-slate-800">
                                  {appt.service?.name || 'Service'}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {formatDurationMinutes(appt.service?.duration_minutes || 30)}
                                </p>
                              </td>
                              <td className="py-3.5 px-5">
                                <p className="font-bold text-[#111827]">{appt.appointment_date}</p>
                                <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                                  <Clock className="w-3 h-3 text-[#F95700]" />
                                  <span>
                                    {formatTimeRange12h(appt.appointment_time, appt.end_time)}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3.5 px-5">
                                <p className="font-extrabold text-[#111827]">
                                  {formatGHS(appt.service_price)}
                                </p>
                                <span
                                  className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                                    appt.payment_status === 'paid'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : appt.payment_status === 'deposit_paid'
                                      ? 'bg-purple-50 text-purple-700'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {appt.payment_status.replace('_', ' ')}
                                </span>
                              </td>
                              <td
                                className="py-3.5 px-5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <select
                                  value={appt.status}
                                  onChange={(e) =>
                                    handleUpdateStatus(appt.id, e.target.value as AppointmentStatus)
                                  }
                                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border focus:outline-none ${
                                    appt.status === 'confirmed'
                                      ? 'bg-blue-50 border-blue-200 text-blue-800'
                                      : appt.status === 'pending'
                                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                                      : appt.status === 'completed'
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                      : 'bg-rose-50 border-rose-200 text-rose-700'
                                  }`}
                                >
                                  <option value="pending">Pending</option>
                                  <option value="confirmed">Confirmed</option>
                                  <option value="completed">Completed</option>
                                  <option value="cancelled">Cancelled</option>
                                </select>
                              </td>
                              <td
                                className="py-3.5 px-5 text-right"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleSendReminderSms(appt)}
                                    disabled={smsActionLoading}
                                    title="Send SMS reminder"
                                    className="p-1.5 rounded-lg border border-slate-200 hover:border-orange-300 hover:text-[#F95700] hover:bg-orange-50 text-slate-500 transition"
                                  >
                                    <MessageSquare className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedAppt(appt)}
                                    className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                                  >
                                    Details
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT SIDE: APPOINTMENT DETAILS PANEL (Desktop sticky column, Mobile below/card) */}
        <div className="w-full xl:w-[300px] shrink-0 xl:sticky xl:top-4">
          {renderDetailsPanel()}
        </div>
      </div>

      {/* New Appointment Modal */}
      <NewAppointmentModal
        isOpen={newModalOpen}
        defaultDate={modalDefaultDate || selectedDate}
        defaultTime={modalDefaultTime || '09:00'}
        onClose={() => setNewModalOpen(false)}
      />
    </div>
  );
};
