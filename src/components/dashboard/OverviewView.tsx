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
import { formatTime12h } from '../../utils/dashboard-analytics';
import { DashboardTab } from './DashboardLayout';
import { DashboardCharts } from './ui/DashboardCharts';
import { SURFACE_CARD } from './ui/DashboardTokens';

interface Props {
  onSelectTab: (tab: DashboardTab) => void;
}

export const OverviewView: React.FC<Props> = ({ onSelectTab }) => {
  const { currentBusiness, appointments, customers, services } = useBusiness();

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
      <div className={`${SURFACE_CARD} p-8 text-center`}>
        <h3 className="text-base font-extrabold text-[#111827]">No Business Selected</h3>
        <p className="text-xs text-slate-500 mt-1">
          Please select or register a business to view your overview.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome & Quick Action Banner */}
      <div className="p-6 md:p-7 rounded-2xl bg-gradient-to-r from-[#FF6514] to-[#E64D00] text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 shadow-[0_6px_20px_rgba(249,87,0,0.22)]">
        <div className="space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-orange-100">
            {currentBusiness.category}
          </span>
          <h2 className="text-2xl font-black tracking-tight">{currentBusiness.name}</h2>
          <p className="text-xs text-orange-100 max-w-xl">
            Public booking link:{' '}
            <code className="bg-black/20 px-2 py-0.5 rounded-md font-mono text-[11px] text-white">
              /b/{currentBusiness.slug}
            </code>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onSelectTab('booking-page')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-[#EA580C] text-xs font-extrabold shadow-xs hover:bg-orange-50 transition"
          >
            <QrCode className="w-4 h-4 text-[#F95700]" />
            <span>View QR Code</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('services')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition"
          >
            <span>Manage Services</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('appointments')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-[#EA580C] text-xs font-extrabold shadow-xs hover:bg-orange-50 transition"
          >
            <Calendar className="w-4 h-4 text-[#F95700]" />
            <span>Upcoming Appointments</span>
            {upcomingAppointments.length > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-[#F95700] text-white text-[10px] font-extrabold">
                {upcomingAppointments.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Real Statistics 6-Card Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {[
          {
            label: 'Total Bookings',
            value: totalAppointments,
            icon: Calendar,
            card: 'from-[#FFF6EE] to-[#FFE7D4] border-[#FADAC1]',
            iconBg: 'bg-[#F95700] text-white',
          },
          {
            label: 'Upcoming',
            value: upcomingAppointments.length,
            icon: Clock,
            card: 'from-[#F2F7FF] to-[#DCEBFF] border-[#C7DDFC]',
            iconBg: 'bg-[#2563EB] text-white',
          },
          {
            label: 'Pending Approval',
            value: pendingAppointments.length,
            icon: TrendingUp,
            card: 'from-[#FFFBEB] to-[#FDEEC2] border-[#FDE293]',
            iconBg: 'bg-[#F59E0B] text-white',
          },
          {
            label: 'Completed',
            value: completedAppointments.length,
            icon: CheckCircle2,
            card: 'from-[#ECFDF5] to-[#CEFAE0] border-[#A7F3D0]',
            iconBg: 'bg-[#16A34A] text-white',
          },
          {
            label: 'Cancelled',
            value: cancelledAppointments.length,
            icon: XCircle,
            card: 'from-[#FFF1F2] to-[#FFDADB] border-[#FECDD3]',
            iconBg: 'bg-[#EF4444] text-white',
          },
          {
            label: 'Total Customers',
            value: customers.length,
            icon: Users,
            card: 'from-[#F5F3FF] to-[#EDE9FE] border-[#DDD6FE]',
            iconBg: 'bg-[#7C3AED] text-white',
          },
        ].map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div
              key={idx}
              className={`p-4 rounded-2xl bg-gradient-to-br border shadow-[0_2px_8px_rgba(15,23,42,0.03)] space-y-2 ${stat.card}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-600 truncate">
                  {stat.label}
                </span>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${stat.iconBg}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <p className="text-2xl font-black text-[#111827]">{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* Revenue Card & Quick Services Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className={`${SURFACE_CARD} p-6 space-y-3`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Total Revenue Received
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-[#111827]">{formatGHS(totalRevenue)}</p>
          <p className="text-xs text-slate-500">
            Calculated from verified customer payments and deposits recorded in Supabase.
          </p>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => onSelectTab('payments')}
              className="text-xs font-bold text-[#F95700] hover:underline inline-flex items-center gap-1"
            >
              <span>View Payment Records</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className={`${SURFACE_CARD} p-6 space-y-3`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Active Services
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-orange-50 text-[#F95700] text-[11px] font-bold">
              {services.filter((s) => s.is_active).length} Active
            </span>
          </div>
          <p className="text-3xl font-black text-[#111827]">{services.length}</p>
          <p className="text-xs text-slate-500">
            {services.length === 0
              ? 'No services configured yet. Add your services so customers can book.'
              : `${services.length} services available on your public booking page.`}
          </p>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => onSelectTab('services')}
              className="text-xs font-bold text-[#F95700] hover:underline inline-flex items-center gap-1"
            >
              <span>Add or Edit Services</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className={`${SURFACE_CARD} p-6 space-y-3 flex flex-col justify-between`}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                QR Code Booking Link
              </span>
              <div className="w-9 h-9 rounded-xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center">
                <QrCode className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xs font-medium text-slate-600 leading-relaxed">
              Customers simply point their camera to book appointments instantly without signing in.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelectTab('booking-page')}
            className="w-full py-2.5 rounded-xl border border-slate-200 text-[#111827] text-xs font-bold hover:bg-slate-50 transition"
          >
            Download / Print QR Code
          </button>
        </div>
      </div>

      {/* Interactive Analytics Charts */}
      <DashboardCharts
        appointments={appointments}
        services={services}
        onNavigateTab={(tab) => onSelectTab(tab)}
      />

      {/* Recent Bookings Table */}
      <div className={`${SURFACE_CARD} overflow-hidden`}>
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-[#111827]">Recent Bookings</h3>
            <p className="text-xs text-slate-500">
              Live incoming customer appointments from Supabase Realtime
            </p>
          </div>
          {appointments.length > 0 && (
            <button
              type="button"
              onClick={() => onSelectTab('appointments')}
              className="text-xs font-bold text-[#F95700] hover:underline inline-flex items-center gap-1"
            >
              <span>View All ({appointments.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {recentBookings.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center mx-auto">
              <Calendar className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-extrabold text-[#111827]">No appointments yet</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Share your business QR code or booking link to receive appointments from your clients.
            </p>
            <button
              type="button"
              onClick={() => onSelectTab('booking-page')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#F95700] text-white text-xs font-bold hover:bg-[#E04D00] transition"
            >
              <QrCode className="w-4 h-4" />
              <span>Get Booking Link & QR Code</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-6">Customer</th>
                  <th className="py-3 px-6">Service</th>
                  <th className="py-3 px-6">Date & Time</th>
                  <th className="py-3 px-6">Price</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentBookings.map((appt) => (
                  <tr key={appt.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3.5 px-6">
                      <p className="font-bold text-[#111827]">{appt.customer_name}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{appt.customer_phone}</p>
                    </td>
                    <td className="py-3.5 px-6 font-semibold text-slate-800">
                      {appt.service?.name || 'Service'}
                    </td>
                    <td className="py-3.5 px-6">
                      <p className="font-bold text-[#111827]">{appt.appointment_date}</p>
                      <p className="text-[11px] text-slate-400">
                        {formatTime12h(appt.appointment_time)} – {formatTime12h(appt.end_time)}
                      </p>
                    </td>
                    <td className="py-3.5 px-6 font-extrabold text-[#111827]">
                      {formatGHS(appt.service_price)}
                    </td>
                    <td className="py-3.5 px-6">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                          appt.status === 'confirmed'
                            ? 'bg-blue-50 text-blue-700'
                            : appt.status === 'pending'
                            ? 'bg-amber-50 text-amber-700'
                            : appt.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {appt.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-6">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${
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
