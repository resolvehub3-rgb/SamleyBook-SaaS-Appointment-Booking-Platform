import React from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Users,
  CreditCard,
  QrCode,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { formatGHS } from '../../utils/booking-logic';
import { DashboardTab } from './DashboardLayout';

interface Props {
  onSelectTab: (tab: DashboardTab) => void;
}

export const OverviewView: React.FC<Props> = ({ onSelectTab }) => {
  const { currentBusiness, appointments, customers, services } = useBusiness();

  // Real calculations
  const totalAppointments = appointments.length;
  const todayStr = new Date().toISOString().split('T')[0];

  const upcomingAppointments = appointments.filter(
    (a) => (a.status === 'confirmed' || a.status === 'pending') && a.appointment_date >= todayStr
  );
  const completedAppointments = appointments.filter((a) => a.status === 'completed');
  const pendingAppointments = appointments.filter((a) => a.status === 'pending');
  const cancelledAppointments = appointments.filter((a) => a.status === 'cancelled');

  const totalRevenue = appointments.reduce((sum, a) => sum + Number(a.payment_received || 0), 0);
  const recentBookings = appointments.slice(0, 5);

  if (!currentBusiness) {
    return (
      <div className="p-8 text-center bg-white rounded-3xl border border-zinc-200">
        <h3 className="text-base font-bold text-zinc-900">No Business Selected</h3>
        <p className="text-xs text-zinc-500 mt-1">Please select or register a business to view your overview.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome & Quick Action Banner */}
      <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-r from-orange-600 to-orange-700 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-md">
        <div className="space-y-1">
          <span className="text-xs font-bold uppercase tracking-wider text-orange-200">
            {currentBusiness.category}
          </span>
          <h2 className="text-2xl font-black tracking-tight">{currentBusiness.name}</h2>
          <p className="text-xs text-orange-100 max-w-xl">
            Public booking link: <code className="bg-orange-800/40 px-2 py-0.5 rounded font-mono text-[11px] text-white">/b/{currentBusiness.slug}</code>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onSelectTab('booking-page')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-orange-700 text-xs font-bold shadow-xs hover:bg-orange-50 transition"
          >
            <QrCode className="w-4 h-4 text-orange-600" />
            <span>View QR Code</span>
          </button>
          <button
            onClick={() => onSelectTab('services')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-800/60 hover:bg-orange-800 text-white text-xs font-bold transition"
          >
            <span>Manage Services</span>
          </button>
        </div>
      </div>

      {/* Real Statistics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          {
            label: 'Total Bookings',
            value: totalAppointments,
            icon: Calendar,
            color: 'text-zinc-900',
            bg: 'bg-zinc-100',
          },
          {
            label: 'Upcoming',
            value: upcomingAppointments.length,
            icon: Clock,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
          },
          {
            label: 'Pending Approval',
            value: pendingAppointments.length,
            icon: TrendingUp,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
          },
          {
            label: 'Completed',
            value: completedAppointments.length,
            icon: CheckCircle2,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
          },
          {
            label: 'Cancelled',
            value: cancelledAppointments.length,
            icon: XCircle,
            color: 'text-zinc-400',
            bg: 'bg-zinc-100',
          },
          {
            label: 'Total Customers',
            value: customers.length,
            icon: Users,
            color: 'text-purple-600',
            bg: 'bg-purple-50',
          },
        ].map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-white border border-zinc-200/80 shadow-xs space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                  {stat.label}
                </span>
                <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <p className="text-2xl font-black text-zinc-900">{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* Revenue Card & Quick Services Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="p-6 rounded-3xl bg-white border border-zinc-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Total Revenue Received
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-zinc-900">{formatGHS(totalRevenue)}</p>
          <p className="text-xs text-zinc-500">
            Calculated from verified customer payments and deposits recorded in Supabase.
          </p>
          <div className="pt-2">
            <button
              onClick={() => onSelectTab('payments')}
              className="text-xs font-bold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1"
            >
              <span>View Payment Records</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="p-6 rounded-3xl bg-white border border-zinc-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Active Services
            </span>
            <span className="text-xs font-bold text-orange-600">{services.filter((s) => s.is_active).length} Active</span>
          </div>
          <p className="text-3xl font-black text-zinc-900">{services.length}</p>
          <p className="text-xs text-zinc-500">
            {services.length === 0
              ? 'No services configured yet. Add your services so customers can book.'
              : `${services.length} services available on your public booking page.`}
          </p>
          <div className="pt-2">
            <button
              onClick={() => onSelectTab('services')}
              className="text-xs font-bold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1"
            >
              <span>Add or Edit Services</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="p-6 rounded-3xl bg-white border border-zinc-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              QR Code Booking Link
            </span>
            <QrCode className="w-4 h-4 text-orange-600" />
          </div>
          <p className="text-xs font-medium text-zinc-600">
            Customers simply point their camera to book appointments instantly.
          </p>
          <button
            onClick={() => onSelectTab('booking-page')}
            className="w-full py-2.5 rounded-xl border border-zinc-200 text-zinc-800 text-xs font-bold hover:bg-zinc-50 transition"
          >
            Download / Print QR Code
          </button>
        </div>
      </div>

      {/* Recent Bookings Table */}
      <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-zinc-900">Recent Bookings</h3>
            <p className="text-xs text-zinc-500">Live incoming customer appointments from Supabase Realtime</p>
          </div>
          {appointments.length > 0 && (
            <button
              onClick={() => onSelectTab('appointments')}
              className="text-xs font-bold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1"
            >
              <span>View All ({appointments.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {recentBookings.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
              <Calendar className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-zinc-900">No appointments yet</h4>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Share your business QR code or booking link to receive appointments from your clients.
            </p>
            <button
              onClick={() => onSelectTab('booking-page')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 transition"
            >
              <QrCode className="w-4 h-4" />
              <span>Get Booking Link & QR Code</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-100 text-zinc-400 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-6">Customer</th>
                  <th className="py-3 px-6">Service</th>
                  <th className="py-3 px-6">Date & Time</th>
                  <th className="py-3 px-6">Price</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {recentBookings.map((appt) => (
                  <tr key={appt.id} className="hover:bg-zinc-50/50 transition">
                    <td className="py-3.5 px-6">
                      <p className="font-bold text-zinc-900">{appt.customer_name}</p>
                      <p className="text-[11px] text-zinc-400 font-mono">{appt.customer_phone}</p>
                    </td>
                    <td className="py-3.5 px-6 font-medium text-zinc-800">
                      {appt.service?.name || 'Service'}
                    </td>
                    <td className="py-3.5 px-6">
                      <p className="font-semibold text-zinc-900">{appt.appointment_date}</p>
                      <p className="text-[11px] text-zinc-400">
                        {appt.appointment_time} - {appt.end_time}
                      </p>
                    </td>
                    <td className="py-3.5 px-6 font-bold text-zinc-900">
                      {formatGHS(appt.service_price)}
                    </td>
                    <td className="py-3.5 px-6">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          appt.status === 'confirmed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : appt.status === 'pending'
                            ? 'bg-amber-50 text-amber-700'
                            : appt.status === 'completed'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-zinc-100 text-zinc-500'
                        }`}
                      >
                        {appt.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-6">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
