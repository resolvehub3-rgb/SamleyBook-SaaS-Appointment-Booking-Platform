import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Phone,
  Mail,
  MessageSquare,
  Search,
  Filter,
  Check,
  Send,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { getSupabase } from '../../lib/supabase';
import { formatGHS } from '../../utils/booking-logic';
import { Appointment, AppointmentStatus } from '../../types/database';

export const AppointmentsView: React.FC = () => {
  const { currentBusiness, appointments, refreshBusinessData } = useBusiness();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [smsActionLoading, setSmsActionLoading] = useState(false);
  const [smsActionMsg, setSmsActionMsg] = useState<string | null>(null);

  const filteredAppointments = appointments.filter((a) => {
    const matchesStatus = filterStatus === 'all' || a.status === filterStatus;
    const matchesSearch =
      a.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.customer_phone.includes(searchQuery) ||
      (a.service?.name && a.service.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

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
        alert(`Error updating appointment: ${error.message}`);
      } else {
        await refreshBusinessData();
        if (selectedAppt?.id === apptId) {
          setSelectedAppt((prev) => (prev ? { ...prev, status: newStatus } : null));
        }

        // Trigger feedback invitation SMS when marked completed
        if (newStatus === 'completed' && oldStatus !== 'completed') {
          try {
            const { data: { session } } = await supabase.auth.getSession();
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
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const handleSendReminderSms = async (appt: Appointment) => {
    if (!currentBusiness) return;
    setSmsActionLoading(true);
    setSmsActionMsg(null);

    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const { data: { session } } = await supabase.auth.getSession();
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
        setSmsActionMsg(`SMS reminder sent to ${appt.customer_phone}.`);
      } else {
        setSmsActionMsg(data.error || 'Failed to send reminder.');
      }
      setTimeout(() => setSmsActionMsg(null), 4000);
    } catch (err) {
      setSmsActionMsg(err instanceof Error ? err.message : 'SMS send error');
    } finally {
      setSmsActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-zinc-900 tracking-tight">Appointments & Bookings</h2>
          <p className="text-xs text-zinc-500">
            Real-time appointments received from your public QR code and booking page
          </p>
        </div>

        {/* Filter Badges */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {['all', 'pending', 'confirmed', 'completed', 'cancelled'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition shrink-0 ${
                filterStatus === st
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
        <input
          type="text"
          placeholder="Search by customer name, phone number, or service..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
        />
      </div>

      {/* Appointments List */}
      {filteredAppointments.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-zinc-200/80 shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
            <Calendar className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-zinc-900">No Appointments Found</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            {searchQuery || filterStatus !== 'all'
              ? 'No appointments match your search filter.'
              : 'Your booking schedule is currently empty. Direct customers to your QR code to fill your schedule.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-100 text-zinc-400 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-6">Customer</th>
                  <th className="py-3.5 px-6">Service</th>
                  <th className="py-3.5 px-6">Date & Slot</th>
                  <th className="py-3.5 px-6">Financials</th>
                  <th className="py-3.5 px-6">Booking Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredAppointments.map((appt) => (
                  <tr key={appt.id} className="hover:bg-zinc-50/50 transition">
                    <td className="py-4 px-6">
                      <p className="font-bold text-zinc-900">{appt.customer_name}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500">
                        <span className="font-mono">{appt.customer_phone}</span>
                        {appt.customer_email && <span>&bull; {appt.customer_email}</span>}
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      <p className="font-bold text-zinc-800">{appt.service?.name || 'Service'}</p>
                      <p className="text-[11px] text-zinc-400">
                        {appt.service?.duration_minutes || 30} mins
                      </p>
                    </td>

                    <td className="py-4 px-6">
                      <p className="font-bold text-zinc-900">{appt.appointment_date}</p>
                      <div className="flex items-center gap-1 text-[11px] text-zinc-500 mt-0.5">
                        <Clock className="w-3 h-3 text-orange-600" />
                        <span>
                          {appt.appointment_time} - {appt.end_time}
                        </span>
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      <p className="font-bold text-zinc-900">{formatGHS(appt.service_price)}</p>
                      <span
                        className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          appt.payment_status === 'paid'
                            ? 'bg-emerald-50 text-emerald-700'
                            : appt.payment_status === 'deposit_paid'
                            ? 'bg-purple-50 text-purple-700'
                            : 'bg-zinc-100 text-zinc-500'
                        }`}
                      >
                        {appt.payment_status.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="py-4 px-6">
                      <select
                        value={appt.status}
                        onChange={(e) =>
                          handleUpdateStatus(appt.id, e.target.value as AppointmentStatus)
                        }
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border focus:outline-none ${
                          appt.status === 'confirmed'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : appt.status === 'pending'
                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : appt.status === 'completed'
                            ? 'bg-blue-50 border-blue-200 text-blue-800'
                            : 'bg-zinc-100 border-zinc-200 text-zinc-600'
                        }`}
                      >
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>

                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleSendReminderSms(appt)}
                          disabled={smsActionLoading}
                          title="Send SMS reminder to customer"
                          className="p-1.5 rounded-lg border border-zinc-200 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50 text-zinc-500 transition"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setSelectedAppt(appt)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition"
                        >
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SMS notification toast */}
      {smsActionMsg && (
        <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-xs text-orange-900 font-semibold flex items-center gap-2">
          <Send className="w-4 h-4 text-orange-600" />
          <span>{smsActionMsg}</span>
        </div>
      )}

      {/* APPOINTMENT DETAIL MODAL */}
      {selectedAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-zinc-100 space-y-4 text-left">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="text-base font-bold text-zinc-900">Appointment Details</h3>
              <button
                onClick={() => setSelectedAppt(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-600">
              <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-100 space-y-1">
                <p className="text-[10px] font-bold uppercase text-zinc-400">Customer</p>
                <p className="text-sm font-bold text-zinc-900">{selectedAppt.customer_name}</p>
                <p className="font-mono">{selectedAppt.customer_phone}</p>
                {selectedAppt.customer_email && <p>{selectedAppt.customer_email}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">Date & Time</p>
                  <p className="font-bold text-zinc-900">{selectedAppt.appointment_date}</p>
                  <p>
                    {selectedAppt.appointment_time} - {selectedAppt.end_time}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">Service</p>
                  <p className="font-bold text-zinc-900">{selectedAppt.service?.name}</p>
                  <p>{formatGHS(selectedAppt.service_price)}</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                <p className="text-[10px] font-bold uppercase text-zinc-400">Payment Breakdown</p>
                <div className="flex justify-between py-1 border-b border-zinc-200/50">
                  <span>Total Service Price:</span>
                  <span className="font-bold">{formatGHS(selectedAppt.service_price)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-200/50">
                  <span>Required Upfront:</span>
                  <span className="font-bold">{formatGHS(selectedAppt.payment_required)}</span>
                </div>
                <div className="flex justify-between py-1 text-emerald-700 font-bold">
                  <span>Payment Status:</span>
                  <span>{selectedAppt.payment_status}</span>
                </div>
              </div>

              {selectedAppt.notes && (
                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">Customer Notes</p>
                  <p className="mt-0.5">{selectedAppt.notes}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                onClick={() => setSelectedAppt(null)}
                className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
