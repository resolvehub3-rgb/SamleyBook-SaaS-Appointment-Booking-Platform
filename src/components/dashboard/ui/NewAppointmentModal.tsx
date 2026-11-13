import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, User, Phone, Scissors, AlertCircle, Check, RefreshCw } from 'lucide-react';
import { useBusiness } from '../../../context/BusinessContext';
import { getSupabase } from '../../../lib/supabase';
import { calculateEndTime, formatGHS, isValidGhanaPhone } from '../../../utils/booking-logic';
import { PRIMARY_ORANGE_BTN } from './DashboardTokens';

interface Props {
  isOpen: boolean;
  defaultDate?: string;
  defaultTime?: string;
  onClose: () => void;
  onCreated?: () => void;
}

export const NewAppointmentModal: React.FC<Props> = ({
  isOpen,
  defaultDate,
  defaultTime,
  onClose,
  onCreated,
}) => {
  const { currentBusiness, services, appointments, refreshBusinessData } = useBusiness();

  const activeServices = services.filter((s) => s.is_active);
  const [serviceId, setServiceId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [date, setDate] = useState(defaultDate || new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(defaultTime || '09:00');
  const [status, setStatus] = useState<'confirmed' | 'pending'>('confirmed');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending'>('pending');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setServiceId(activeServices[0]?.id || services[0]?.id || '');
      setDate(defaultDate || new Date().toISOString().split('T')[0]);
      setCustomerName('');
      setCustomerPhone('');
      setTime(defaultTime || '09:00');
      setStatus('confirmed');
      setPaymentStatus('pending');
      setNotes('');
      setErrorMsg(null);
    }
  }, [isOpen, defaultDate, defaultTime]);

  if (!isOpen) return null;

  const selectedService = services.find((s) => s.id === serviceId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBusiness) return;
    setErrorMsg(null);

    if (!selectedService) {
      setErrorMsg('Please select a service first (or add a service in Services).');
      return;
    }
    if (!customerName.trim()) {
      setErrorMsg('Customer name is required.');
      return;
    }
    if (!customerPhone.trim() || !isValidGhanaPhone(customerPhone)) {
      setErrorMsg('Please enter a valid Ghanaian phone number (e.g. 024XXXXXXX).');
      return;
    }

    const endTime = calculateEndTime(time, selectedService.duration_minutes || 30);

    // Check overlap with non-cancelled bookings on same date
    const conflict = appointments.find(
      (a) =>
        a.appointment_date === date &&
        a.status !== 'cancelled' &&
        time < (a.end_time || '23:59') &&
        endTime > a.appointment_time
    );

    if (conflict) {
      setErrorMsg(
        `Time conflict with ${conflict.customer_name} (${conflict.appointment_time} – ${conflict.end_time}). Please choose another time.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase client is not configured');

      // Upsert customer record for this business
      let customerId: string | null = null;
      const { data: custData } = await supabase
        .from('customers')
        .upsert(
          {
            business_id: currentBusiness.id,
            full_name: customerName.trim(),
            phone: customerPhone.trim(),
          },
          { onConflict: 'business_id,phone' }
        )
        .select('id')
        .maybeSingle();

      if (custData?.id) {
        customerId = custData.id;
      }

      const price = Number(selectedService.price || 0);
      const { data: inserted, error } = await supabase
        .from('appointments')
        .insert({
          business_id: currentBusiness.id,
          service_id: selectedService.id,
          customer_id: customerId,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          appointment_date: date,
          appointment_time: time,
          end_time: endTime,
          status,
          payment_status: paymentStatus,
          service_price: price,
          payment_required: price,
          payment_received: paymentStatus === 'paid' ? price : 0,
          notes: notes.trim() || null,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Trigger booking confirmation SMS if confirmed
      if (inserted?.id && status === 'confirmed') {
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
              type: 'booking_confirmation',
              appointmentId: inserted.id,
            }),
          });
        } catch {
          // Non-blocking SMS notification
        }
      }

      await refreshBusinessData();
      onCreated?.();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create appointment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden text-left my-8">
        <div className="bg-gradient-to-r from-[#FF6B1A] to-[#EA580C] px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5">
            <Calendar className="w-5 h-5" />
            <div>
              <h3 className="text-sm font-extrabold">New Appointment</h3>
              <p className="text-[11px] text-orange-100">
                Schedule a walk-in or phone booking for {currentBusiness?.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Service</label>
            <div className="relative">
              <Scissors className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#F95700]"
              >
                {services.length === 0 ? (
                  <option value="">No services created yet</option>
                ) : (
                  services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({formatGHS(s.price)} • {s.duration_minutes} mins)
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Customer Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Kwame Mensah"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F95700]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="tel"
                  required
                  placeholder="024XXXXXXX"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-[#F95700]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F95700]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Start Time</label>
              <div className="relative">
                <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-[#F95700]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Booking Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'confirmed' | 'pending')}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#F95700]"
              >
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Payment Status</label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as 'paid' | 'pending')}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#F95700]"
              >
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Customer Note (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Special preferences or arrival note..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F95700]"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || services.length === 0}
              className={`${PRIMARY_ORANGE_BTN} px-5 py-2.5 text-xs`}
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Create Appointment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
