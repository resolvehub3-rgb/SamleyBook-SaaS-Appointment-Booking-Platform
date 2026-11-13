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
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useBusiness } from '../../context/BusinessContext';
import { getSupabase } from '../../lib/supabase';
import {
  formatGHS,
  formatDurationMinutes,
  calculateEndTime,
} from '../../utils/booking-logic';
import {
  addDays,
  computeAppointmentKpis,
  computeCalendarEventLayout,
  assignDayEventColumns,
  formatShortDateRange,
  formatTime12h,
  formatTimeRange12h,
  getWeekDays,
  parseIsoDateLocal,
  toIsoDateStr,
} from '../../utils/dashboard-analytics';
import { Appointment, AppointmentStatus } from '../../types/database';
import { KpiSparklineCard } from './ui/KpiSparklineCard';
import { NewAppointmentModal } from './ui/NewAppointmentModal';
import { PRIMARY_ORANGE_BTN, SURFACE_CARD } from './ui/DashboardTokens';

export const AppointmentsView: React.FC = () => {
  const { currentBusiness, appointments, services, refreshBusinessData } = useBusiness();
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

  // Reschedule & Payment breakdown states inside details panel
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

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
    const openMode = localStorage.getItem('samley_appt_open_mode');
    if (openMode) {
      applyOpenMode(openMode);
    } else {
      const saved = localStorage.getItem('samley_appt_view');
      if (saved === 'list' || saved === 'calendar') setViewMode(saved);
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

  // Keep selectedAppt synchronized when appointments refresh
  useEffect(() => {
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

  // Dynamic hourly window covering 8:00 AM - 5:00 PM (expanding if any booking starts earlier or ends later)
  const { startHour, endHour, hourSlots } = useMemo(() => {
    let minH = 8;
    let maxH = 18;
    if (viewMode === 'calendar' && calMode === 'week') {
      const weekDates = new Set(weekDays.map((d) => d.dateStr));
      filteredAppointments
        .filter((a) => weekDates.has(a.appointment_date))
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
  }, [filteredAppointments, weekDays, viewMode, calMode]);

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
      {/* 1. Five Pastel Gradient KPI Cards with Sparklines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {kpis.map((metric) => {
          const targetStatus = metric.key === 'total' ? 'all' : metric.key;
          return (
            <KpiSparklineCard
              key={metric.key}
              metric={metric}
              totalCount={appointments.length}
              active={filterStatus === targetStatus}
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
            onClick={() => setNewModalOpen(true)}
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

      {/* 3. Main Workspace Split: Left Calendar/List + Right Appointment Details */}
      <div className="flex flex-col xl:flex-row gap-5 items-start">
        {/* LEFT / CENTER WORKSPACE */}
        <div className="flex-1 min-w-0 w-full">
          {viewMode === 'calendar' ? (
            <div className={`${SURFACE_CARD} overflow-hidden`}>
              {/* Calendar Control Bar */}
              <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCalendarPrevNext(-1)}
                    aria-label="Previous period"
                    className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCalendarPrevNext(1)}
                    aria-label="Next period"
                    className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleTodayClick}
                    className="px-3.5 py-1.5 rounded-full bg-[#FFF3EC] border border-[#FED7AA] text-[#EA580C] text-xs font-bold hover:bg-[#FFE4D1] transition"
                  >
                    Today
                  </button>
                </div>

                <div className="flex items-center gap-2 text-center">
                  <Calendar className="w-4 h-4 text-slate-700 hidden sm:block" />
                  <div>
                    <p className="text-sm font-extrabold text-[#111827] leading-tight">
                      {activeToolbarLabel}
                    </p>
                    <p className="text-[10.5px] font-semibold text-slate-400">
                      {calMode === 'week'
                        ? 'This Week'
                        : calMode === 'month'
                        ? 'Monthly Overview'
                        : 'Daily Schedule'}
                    </p>
                  </div>
                </div>

                {/* Business-wide Service Filter */}
                <div className="relative flex items-center">
                  <Filter className="w-3.5 h-3.5 text-slate-500 absolute left-3 pointer-events-none" />
                  <select
                    value={filterServiceId}
                    onChange={(e) => setFilterServiceId(e.target.value)}
                    aria-label="Filter by service"
                    className="pl-8 pr-7 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F95700]"
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

              {/* WEEK VIEW (Matches Reference Time-Grid) */}
              {calMode === 'week' && (
                <div className="overflow-x-auto">
                  <div className="min-w-[760px]">
                    {/* Day Columns Header */}
                    <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] border-b border-slate-100">
                      <div className="p-2" />
                      {weekDays.map((day) => (
                        <button
                          key={day.dateStr}
                          type="button"
                          onClick={() => setSelectedDate(day.dateStr)}
                          className={`py-2.5 px-2 text-center transition border-l border-slate-100 ${
                            day.isToday
                              ? 'bg-[#F95700] text-white rounded-t-xl shadow-xs'
                              : selectedDate === day.dateStr
                              ? 'bg-orange-50/70 text-[#111827]'
                              : 'hover:bg-slate-50 text-[#111827]'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1.5">
                            <span
                              className={`text-xs font-extrabold ${
                                day.isToday ? 'text-white' : 'text-[#111827]'
                              }`}
                            >
                              {day.dayShort}
                            </span>
                            {day.count > 0 && (
                              <span
                                className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold inline-flex items-center justify-center ${
                                  day.isToday
                                    ? 'bg-white text-[#F95700]'
                                    : 'bg-[#F95700] text-white'
                                }`}
                              >
                                {day.count}
                              </span>
                            )}
                          </div>
                          <p
                            className={`text-[11px] font-semibold mt-0.5 ${
                              day.isToday ? 'text-orange-100' : 'text-slate-500'
                            }`}
                          >
                            {day.dateLabel}
                          </p>
                        </button>
                      ))}
                    </div>

                    {/* Hourly Time Grid */}
                    <div
                      className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] relative"
                      style={{ height: `${hourSlots.length * 56}px` }}
                    >
                      {/* Left Time Axis */}
                      <div className="relative border-r border-slate-100 bg-white">
                        {hourSlots.map((h) => (
                          <div
                            key={h}
                            className="h-[56px] pr-2.5 pt-1 text-right text-[11px] font-semibold text-slate-500 border-b border-slate-100/70"
                          >
                            {formatTime12h(`${h}:00`)}
                          </div>
                        ))}
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
                              day.isToday ? 'bg-[#FFF5EE]/65' : 'bg-white'
                            }`}
                          >
                            {/* Hour gridlines */}
                            {hourSlots.map((h) => (
                              <div
                                key={h}
                                className="h-[56px] border-b border-slate-100/80"
                              />
                            ))}

                            {/* Positioned Appointment Cards (side-by-side on overlap) */}
                            {positioned.map(({ appointment: appt, topPct, heightPct, leftPct, widthPct, theme }) => {
                              const isSelected = selectedAppt?.id === appt.id;
                              return (
                                <button
                                  key={appt.id}
                                  type="button"
                                  onClick={() => setSelectedAppt(appt)}
                                  style={{
                                    top: `${topPct}%`,
                                    height: `${heightPct}%`,
                                    left: `calc(${leftPct}% + 3px)`,
                                    width: `calc(${widthPct}% - 6px)`,
                                  }}
                                  className={`absolute rounded-xl border-l-4 px-2 py-1 text-left overflow-hidden transition-all shadow-xs hover:shadow-md z-10 ${
                                    theme.bg
                                  } ${theme.border} ${
                                    isSelected
                                      ? 'ring-2 ring-[#F95700] ring-offset-1 z-20'
                                      : ''
                                  } ${appt.status === 'cancelled' ? 'opacity-50 line-through' : ''}`}
                                >
                                  <p
                                    className={`text-[11px] font-extrabold leading-tight truncate ${theme.titleText}`}
                                  >
                                    {appt.customer_name}
                                  </p>
                                  <p
                                    className={`text-[10px] font-semibold leading-tight truncate mt-0.5 ${theme.subText}`}
                                  >
                                    {appt.service?.name || 'Service'}
                                  </p>
                                  <p
                                    className={`text-[9.5px] font-medium leading-tight truncate mt-0.5 ${theme.subText}`}
                                  >
                                    {formatTimeRange12h(appt.appointment_time, appt.end_time)}
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
              )}

              {/* MONTH VIEW */}
              {calMode === 'month' && (
                <div className="p-4 sm:p-5 space-y-4">
                  <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                      <div key={d} className="py-1">
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {(() => {
                      const year = calMonth.getFullYear();
                      const month = calMonth.getMonth();
                      const firstDay = new Date(year, month, 1).getDay();
                      const daysInMonth = new Date(year, month + 1, 0).getDate();
                      const todayStr = toIsoDateStr(new Date());
                      const cells: (number | null)[] = [];
                      for (let i = 0; i < firstDay; i++) cells.push(null);
                      for (let d = 1; d <= daysInMonth; d++) cells.push(d);

                      return cells.map((day, idx) => {
                        if (day === null) return <div key={idx} className="min-h-[82px]" />;
                        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(
                          day
                        ).padStart(2, '0')}`;
                        const dayAppts = filteredAppointments.filter(
                          (a) => a.appointment_date === dateStr
                        );
                        const isSelected = selectedDate === dateStr;
                        const isToday = dateStr === todayStr;

                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setSelectedDate(dateStr);
                              if (dayAppts.length > 0) setSelectedAppt(dayAppts[0]);
                            }}
                            className={`min-h-[82px] p-2 rounded-xl border text-left flex flex-col justify-between transition ${
                              isSelected
                                ? 'border-[#F95700] bg-[#FFF5EE] ring-1 ring-[#F95700]'
                                : isToday
                                ? 'border-orange-300 bg-orange-50/40'
                                : 'border-slate-200/70 bg-white hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span
                                className={`text-xs font-extrabold ${
                                  isToday
                                    ? 'px-1.5 py-0.5 rounded-md bg-[#F95700] text-white'
                                    : 'text-[#111827]'
                                }`}
                              >
                                {day}
                              </span>
                              {dayAppts.length > 0 && (
                                <span className="px-1.5 py-0.5 rounded-full bg-[#F95700]/15 text-[#F95700] text-[10px] font-extrabold">
                                  {dayAppts.length}
                                </span>
                              )}
                            </div>

                            <div className="space-y-0.5 mt-1 w-full">
                              {dayAppts.slice(0, 2).map((a) => (
                                <p
                                  key={a.id}
                                  className="text-[10px] font-semibold truncate px-1.5 py-0.5 rounded bg-blue-50 text-blue-800"
                                >
                                  {a.appointment_time.slice(0, 5)} {a.customer_name}
                                </p>
                              ))}
                              {dayAppts.length > 2 && (
                                <p className="text-[9.5px] font-bold text-slate-400 px-1">
                                  +{dayAppts.length - 2} more
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      });
                    })()}
                  </div>

                  {/* Selected Day Appointments List */}
                  <div className="pt-3 border-t border-slate-100">
                    <h4 className="text-xs font-extrabold text-[#111827] mb-2">
                      Appointments on {selectedDate}
                    </h4>
                    {filteredAppointments.filter((a) => a.appointment_date === selectedDate)
                      .length === 0 ? (
                      <p className="text-xs text-slate-500">No appointments scheduled for this date.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {filteredAppointments
                          .filter((a) => a.appointment_date === selectedDate)
                          .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time))
                          .map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => setSelectedAppt(a)}
                              className={`p-3 rounded-xl border text-left transition ${
                                selectedAppt?.id === a.id
                                  ? 'border-[#F95700] bg-[#FFF5EE]'
                                  : 'border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <p className="text-xs font-extrabold text-[#111827]">
                                {formatTimeRange12h(a.appointment_time, a.end_time)} &bull;{' '}
                                {a.customer_name}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {a.service?.name || 'Service'} &bull; {formatGHS(a.service_price)}
                              </p>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* DAY VIEW */}
              {calMode === 'day' && (
                <div className="p-5 space-y-3">
                  {filteredAppointments.filter((a) => a.appointment_date === selectedDate).length ===
                  0 ? (
                    <div className="py-12 text-center space-y-2">
                      <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-sm font-bold text-[#111827]">
                        No appointments for {selectedDate}
                      </p>
                      <p className="text-xs text-slate-500">
                        Use + New Appointment to schedule a booking for this day.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {filteredAppointments
                        .filter((a) => a.appointment_date === selectedDate)
                        .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time))
                        .map((a) => {
                          const { theme } = computeCalendarEventLayout(a, 8, 18);
                          const isSelected = selectedAppt?.id === a.id;
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => setSelectedAppt(a)}
                              className={`w-full text-left p-4 rounded-2xl border-l-4 transition flex items-center justify-between gap-4 ${
                                theme.bg
                              } ${theme.border} ${
                                isSelected ? 'ring-2 ring-[#F95700]' : 'hover:shadow-sm'
                              }`}
                            >
                              <div>
                                <p className={`text-sm font-extrabold ${theme.titleText}`}>
                                  {a.customer_name}
                                </p>
                                <p className={`text-xs font-semibold mt-0.5 ${theme.subText}`}>
                                  {a.service?.name || 'Service'} &bull;{' '}
                                  {formatTimeRange12h(a.appointment_time, a.end_time)}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`text-xs font-extrabold ${theme.titleText}`}>
                                  {formatGHS(a.service_price)}
                                </p>
                                <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-white/80 text-[10px] font-bold capitalize text-slate-700">
                                  {a.status}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
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
        <div className="w-full xl:w-[320px] shrink-0 xl:sticky xl:top-4">
          {renderDetailsPanel()}
        </div>
      </div>

      {/* New Appointment Modal */}
      <NewAppointmentModal
        isOpen={newModalOpen}
        defaultDate={selectedDate}
        onClose={() => setNewModalOpen(false)}
      />
    </div>
  );
};
