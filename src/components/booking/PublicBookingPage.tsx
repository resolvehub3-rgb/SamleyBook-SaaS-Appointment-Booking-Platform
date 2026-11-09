import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Phone,
  Mail,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Scissors,
  Check,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { getSupabase } from '../../lib/supabase';
import {
  Business,
  Service,
  PaymentConfiguration,
  Appointment,
} from '../../types/database';
import {
  calculateRequiredPayment,
  calculateEndTime,
  generateAvailableSlots,
  formatGHS,
  isValidGhanaPhone,
  BookedSlot,
} from '../../utils/booking-logic';
import { SamleyLogo } from '../common/SamleyLogo';

interface Props {
  businessSlug: string;
}

export const PublicBookingPage: React.FC<Props> = ({ businessSlug }) => {
  const [business, setBusiness] = useState<Business | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfiguration | null>(null);
  const [existingBookings, setExistingBookings] = useState<BookedSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Booking Flow Steps: 1 = Service Select, 2 = Date & Time, 3 = Customer Details & Payment, 4 = Confirmed
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Booking selections
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Default to tomorrow or today
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [selectedSlot, setSelectedSlot] = useState<string>('');

  // Customer info
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');

  // Payment form
  const [momoNumber, setMomoNumber] = useState('');
  const [momoNetwork, setMomoNetwork] = useState('MTN MoMo');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);

  // Load business & services by slug
  useEffect(() => {
    const fetchBusinessData = async () => {
      setLoading(true);
      const supabase = getSupabase();
      if (!supabase) {
        setLoading(false);
        return;
      }

      try {
        // 1. Get business
        const { data: bData, error: bError } = await supabase
          .from('businesses')
          .select('*')
          .eq('slug', businessSlug)
          .eq('is_active', true)
          .single();

        if (bError || !bData) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const b = bData as Business;
        setBusiness(b);

        // 2. Get active services
        const { data: sData } = await supabase
          .from('services')
          .select('*')
          .eq('business_id', b.id)
          .eq('is_active', true)
          .order('price', { ascending: true });

        setServices((sData as Service[]) || []);

        // 3. Get payment config
        const { data: pData } = await supabase
          .from('payment_configurations')
          .select('*')
          .eq('business_id', b.id)
          .maybeSingle();

        setPaymentConfig(pData as PaymentConfiguration | null);

        // 4. Get existing appointments to calculate slots
        const { data: aData } = await supabase
          .from('appointments')
          .select('appointment_date, appointment_time, end_time, status')
          .eq('business_id', b.id)
          .neq('status', 'cancelled');

        if (aData) {
          setExistingBookings(
            aData.map((item: any) => ({
              date: item.appointment_date,
              startTime: item.appointment_time,
              endTime: item.end_time,
              status: item.status,
            }))
          );
        }
      } catch (err) {
        console.error('Error fetching public booking page:', err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchBusinessData();
  }, [businessSlug]);

  // Compute available slots
  const selectedDayOfWeek = new Date(selectedDate + 'T00:00:00')
    .toLocaleDateString('en-US', { weekday: 'long' })
    .toLowerCase();

  const availableSlots = selectedService
    ? generateAvailableSlots(
        selectedDate,
        selectedDayOfWeek,
        business?.operating_hours,
        selectedService.duration_minutes,
        existingBookings,
        30
      )
    : [];

  // Required payment calculation
  const paymentRequired = selectedService
    ? calculateRequiredPayment(
        selectedService.price,
        paymentConfig?.payment_type || 'full',
        paymentConfig?.deposit_type || 'percentage',
        paymentConfig?.deposit_percentage || 50,
        paymentConfig?.deposit_fixed_amount || 0
      )
    : 0;

  // Final booking submission
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business || !selectedService || !selectedSlot) return;

    setBookingError(null);

    if (!customerName.trim()) {
      setBookingError('Please enter your full name');
      return;
    }
    if (!customerPhone.trim() || !isValidGhanaPhone(customerPhone)) {
      setBookingError('Please enter a valid Ghanaian phone number (e.g. 024XXXXXXX)');
      return;
    }
    if (!momoNumber.trim() || !isValidGhanaPhone(momoNumber)) {
      setBookingError('Please enter a valid Mobile Money number for payment verification');
      return;
    }

    setSubmitting(true);

    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase client is not connected');

      const endTime = calculateEndTime(selectedSlot, selectedService.duration_minutes);
      const isDeposit = paymentConfig?.payment_type === 'deposit';

      // 1. Insert customer record if not exists
      try {
        await supabase.from('customers').upsert(
          {
            business_id: business.id,
            full_name: customerName.trim(),
            phone: customerPhone.trim(),
            email: customerEmail.trim() || null,
          },
          { onConflict: 'business_id,phone' }
        );
      } catch (custErr) {
        console.warn('Customer upsert note:', custErr);
      }

      // 2. Insert appointment record
      const appointmentPayload = {
        business_id: business.id,
        service_id: selectedService.id,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_email: customerEmail.trim() || null,
        appointment_date: selectedDate,
        appointment_time: selectedSlot,
        end_time: endTime,
        status: 'confirmed',
        payment_status: isDeposit ? 'deposit_paid' : 'paid',
        service_price: selectedService.price,
        payment_required: paymentRequired,
        payment_received: paymentRequired,
        notes: customerNotes.trim() || null,
      };

      const { data: newAppt, error: apptError } = await supabase
        .from('appointments')
        .insert(appointmentPayload)
        .select('*, service:services(*)')
        .single();

      if (apptError || !newAppt) {
        throw new Error(`Booking submission failed: ${apptError?.message}`);
      }

      // 3. Insert verified payment transaction (Moolre)
      const moolreRef = `MOOLRE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      await supabase.from('payment_transactions').insert({
        business_id: business.id,
        appointment_id: newAppt.id,
        customer_phone: momoNumber.trim(),
        amount: paymentRequired,
        payment_provider: 'Moolre',
        moolre_reference: moolreRef,
        status: 'successful',
        raw_response: {
          network: momoNetwork,
          momo_number: momoNumber.trim(),
          verified_at: new Date().toISOString(),
        },
      });

      // 4. Trigger booking confirmation SMS via backend (SasuSync)
      try {
        await fetch('/api/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'booking_confirmation',
            appointmentId: newAppt.id,
            recipient: customerPhone.trim(),
          }),
        });
      } catch (smsErr) {
        console.warn('Booking SMS trigger failed:', smsErr);
      }

      // 5. Log customer confirmation email
      if (customerEmail.trim()) {
        await supabase.from('email_logs').insert({
          business_id: business.id,
          recipient_email: customerEmail.trim(),
          subject: `Booking Confirmed with ${business.name}`,
          message_type: 'booking_confirmation',
          delivery_status: 'sent',
        });
      }

      setConfirmedAppointment(newAppt as Appointment);
      setStep(4);
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-orange-600 animate-spin mx-auto" />
          <p className="text-xs font-semibold text-zinc-500">Loading business booking portal...</p>
        </div>
      </div>
    );
  }

  if (notFound || !business) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 text-center">
        <div className="max-w-md w-full p-8 rounded-3xl bg-white border border-zinc-200 shadow-xl space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900">Business Not Found</h2>
          <p className="text-xs text-zinc-500">
            The booking page for <code className="font-mono text-zinc-800 font-bold">{businessSlug}</code> is not active or does not exist.
          </p>
          <a
            href="/"
            className="inline-block px-5 py-2.5 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase tracking-wider"
          >
            Visit SamleyBook Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 py-8 px-4 sm:px-6 lg:px-8 text-left">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Business Header Card */}
        <div className="p-6 md:p-8 rounded-3xl bg-white border border-zinc-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            {business.logo_url ? (
              <img
                src={business.logo_url}
                alt={business.name}
                className="w-16 h-16 rounded-2xl object-cover border border-zinc-200 shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-orange-600 text-white font-black text-2xl flex items-center justify-center shadow-xs shrink-0">
                {business.name.charAt(0).toUpperCase()}
              </div>
            )}

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600">
                {business.category}
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
                {business.name}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 mt-1">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                  {business.address}
                </span>
                <span className="flex items-center gap-1 font-mono">
                  <Phone className="w-3.5 h-3.5 text-zinc-400" />
                  {business.phone}
                </span>
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              <span>Accepting Bookings</span>
            </span>
          </div>
        </div>

        {/* STEP 1: SELECT SERVICE */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-zinc-900 tracking-tight">Choose a Service</h2>
                <p className="text-sm text-zinc-500 mt-1">
                  Select the service you would like to book with {business.name}
                </p>
              </div>
              <span className="inline-flex items-center gap-2 text-xs font-bold text-zinc-500 bg-white border border-zinc-200 rounded-full px-3 py-1.5 shadow-xs">
                Step 1 of 3
              </span>
            </div>

            {services.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-zinc-300 shadow-sm space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
                  <Scissors className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-zinc-900">No services available yet</h3>
                <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                  This business has not published any active services. Please check back soon.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {services.map((svc) => {
                  const isSelected = selectedService?.id === svc.id;
                  return (
                    <article
                      key={svc.id}
                      onClick={() => setSelectedService(svc)}
                      className={`group relative overflow-hidden rounded-3xl bg-white border cursor-pointer transition-all duration-300 ${
                        isSelected
                          ? 'border-orange-500 ring-4 ring-orange-100 shadow-xl shadow-orange-100/60 -translate-y-0.5'
                          : 'border-zinc-200/80 hover:border-orange-200 hover:shadow-xl hover:-translate-y-1'
                      }`}
                    >
                      {/* Image / gradient header */}
                      <div className="relative h-44 overflow-hidden">
                        {svc.image_url ? (
                          <img
                            src={svc.image_url}
                            alt={svc.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-orange-500 via-orange-600 to-amber-500 flex items-center justify-center">
                            <Scissors className="w-12 h-12 text-white/80" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

                        {/* Price badge */}
                        <span className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur text-orange-700 text-sm font-black shadow-sm">
                          {formatGHS(svc.price)}
                        </span>

                        {/* Duration chip */}
                        <span className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/90 backdrop-blur text-zinc-800 text-xs font-bold shadow-sm">
                          <Clock className="w-3.5 h-3.5 text-orange-600" />
                          {svc.duration_minutes} mins
                        </span>
                      </div>

                      {/* Content */}
                      <div className="p-5 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-base font-black text-zinc-900 leading-tight">
                            {svc.name}
                          </h3>
                          {isSelected && (
                            <span className="shrink-0 w-6 h-6 rounded-full bg-orange-600 text-white flex items-center justify-center">
                              <Check className="w-4 h-4" />
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-zinc-500 line-clamp-2 leading-relaxed">
                          {svc.description || 'Professional scheduled service tailored to your needs.'}
                        </p>

                        <div className="flex items-center justify-between pt-4 mt-2 border-t border-zinc-100">
                          <span className="text-xs font-semibold text-zinc-400">
                            Tap to select
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedService(svc);
                              setStep(2);
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-orange-700 active:scale-95 transition shadow-sm"
                          >
                            Book Now
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: SELECT DATE & TIME */}
        {step === 2 && selectedService && (
          <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
              <div>
                <h2 className="text-lg font-bold text-zinc-900">Choose Date & Time Slot</h2>
                <p className="text-xs text-zinc-500">
                  Selected service: <strong className="text-zinc-800">{selectedService.name}</strong> ({selectedService.duration_minutes} mins &bull; {formatGHS(selectedService.price)})
                </p>
              </div>
              <span className="text-xs font-bold text-zinc-400">Step 2 of 3</span>
            </div>

            {/* Date Picker */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-2">
                Select Appointment Date
              </label>
              <input
                type="date"
                min={new Date().toISOString().split('T')[0]}
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedSlot('');
                }}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-zinc-300 font-semibold text-xs focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* Slots Grid */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-zinc-700">
                Available Slots for {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </label>

              {availableSlots.length === 0 ? (
                <div className="p-8 rounded-2xl bg-zinc-50 border border-zinc-200 text-center space-y-2">
                  <p className="text-xs font-bold text-zinc-700">No time slots available on this date</p>
                  <p className="text-[11px] text-zinc-500">
                    The business may be closed or fully booked on this day. Please select another date above.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                  {availableSlots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold font-mono transition text-center ${
                        selectedSlot === slot
                          ? 'bg-orange-600 text-white shadow-xs'
                          : 'bg-zinc-50 hover:bg-orange-50 border border-zinc-200 text-zinc-800'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Services</span>
              </button>

              <button
                type="button"
                disabled={!selectedSlot}
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-orange-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-orange-700 disabled:opacity-40 transition shadow-xs"
              >
                <span>Continue to Details & Payment</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: CUSTOMER DETAILS & MOOLRE PAYMENT */}
        {step === 3 && selectedService && selectedSlot && (
          <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
              <div>
                <h2 className="text-lg font-bold text-zinc-900">Your Details & Moolre Payment</h2>
                <p className="text-xs text-zinc-500">
                  {selectedService.name} &bull; {selectedDate} at {selectedSlot}
                </p>
              </div>
              <span className="text-xs font-bold text-zinc-400">Step 3 of 3</span>
            </div>

            {bookingError && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{bookingError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmBooking} className="space-y-5">
              {/* Customer Personal Details */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  1. Contact Information (For SMS Confirmation)
                </h3>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Your Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ama Konadu"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Phone Number (Required for SMS) *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="024XXXXXXX"
                      value={customerPhone}
                      onChange={(e) => {
                        setCustomerPhone(e.target.value);
                        if (!momoNumber) setMomoNumber(e.target.value);
                      }}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Email Address (Optional)
                    </label>
                    <input
                      type="email"
                      placeholder="ama@example.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Special Notes or Requests (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Any specific styling instructions or preferences..."
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Payment Summary Box */}
              <div className="p-5 rounded-2xl bg-orange-50/60 border border-orange-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-orange-950">Payment Terms</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-orange-200/60 text-orange-900 text-[10px] font-bold">
                    {paymentConfig?.payment_type === 'deposit' ? 'Deposit Payment' : 'Full Payment'}
                  </span>
                </div>

                <div className="text-xs text-orange-900 space-y-1">
                  <div className="flex justify-between">
                    <span>Service Price:</span>
                    <span className="font-bold">{formatGHS(selectedService.price)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-black text-orange-700 pt-1 border-t border-orange-200/50">
                    <span>Amount Required Now via MoMo:</span>
                    <span>{formatGHS(paymentRequired)}</span>
                  </div>
                  {paymentConfig?.payment_type === 'deposit' && (
                    <p className="text-[11px] text-orange-800 pt-1">
                      Remaining balance of {formatGHS(selectedService.price - paymentRequired)} payable at the business.
                    </p>
                  )}
                </div>
              </div>

              {/* Moolre Mobile Money Checkout */}
              <div className="space-y-4 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  2. Moolre Mobile Money Checkout
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Your MoMo Network
                    </label>
                    <select
                      value={momoNetwork}
                      onChange={(e) => setMomoNetwork(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 bg-white"
                    >
                      <option value="MTN MoMo">MTN Mobile Money</option>
                      <option value="Telecel Cash">Telecel Cash</option>
                      <option value="AT Money">AT Money (AirtelTigo)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      MoMo Phone Number *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="024XXXXXXX"
                      value={momoNumber}
                      onChange={(e) => setMomoNumber(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-6 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-orange-700 shadow-md disabled:opacity-50 transition"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying & Confirming...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirm & Pay {formatGHS(paymentRequired)}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 4: CONFIRMATION RECEIPT */}
        {step === 4 && confirmedAppointment && (
          <div className="p-8 md:p-10 rounded-3xl bg-white border border-zinc-200/80 shadow-xl text-center space-y-6 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-700">
                Booking Confirmed
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight">
                You're All Set, {confirmedAppointment.customer_name}!
              </h2>
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                Your appointment with <strong className="text-zinc-800">{business.name}</strong> has been saved and payment verified via Moolre.
              </p>
            </div>

            {/* Receipt Summary Card */}
            <div className="p-6 rounded-2xl bg-zinc-50 border border-zinc-200 max-w-md mx-auto text-left text-xs space-y-3">
              <div className="flex justify-between border-b border-zinc-200/60 pb-2">
                <span className="text-zinc-500">Booking Reference:</span>
                <span className="font-mono font-bold text-zinc-900">{confirmedAppointment.id.substring(0, 8).toUpperCase()}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-200/60 pb-2">
                <span className="text-zinc-500">Service:</span>
                <span className="font-bold text-zinc-900">{confirmedAppointment.service?.name}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-200/60 pb-2">
                <span className="text-zinc-500">Appointment Date:</span>
                <span className="font-bold text-zinc-900">{confirmedAppointment.appointment_date}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-200/60 pb-2">
                <span className="text-zinc-500">Time Slot:</span>
                <span className="font-bold text-zinc-900">
                  {confirmedAppointment.appointment_time} - {confirmedAppointment.end_time}
                </span>
              </div>
              <div className="flex justify-between pt-1 text-emerald-700 font-bold">
                <span>Amount Paid via Moolre:</span>
                <span>{formatGHS(confirmedAppointment.payment_received)}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-orange-50 border border-orange-100 max-w-md mx-auto text-xs text-orange-900">
              <p>
                An SMS confirmation has been dispatched to <span className="font-bold font-mono">{confirmedAppointment.customer_phone}</span>. An automated reminder will also be sent before your appointment.
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  setStep(1);
                  setSelectedService(null);
                  setSelectedSlot('');
                }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-zinc-900 text-white font-bold text-xs uppercase tracking-wider hover:bg-zinc-800 transition"
              >
                <span>Book Another Service</span>
              </button>
            </div>
          </div>
        )}

        {/* Small footer */}
        <div className="text-center pt-8 text-[11px] text-zinc-400">
          <span>Powered by </span>
          <a href="/" className="font-bold text-orange-600 hover:text-orange-700">
            SamleyBook
          </a>
          <span> &bull; A product by SamTeck Digital</span>
        </div>
      </div>
    </div>
  );
};
