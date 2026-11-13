import React, { useMemo } from 'react';
import {
  Calendar,
  CreditCard,
  QrCode,
  ArrowRight,
  Scissors,
  Users,
  ExternalLink,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { formatGHS } from '../../utils/booking-logic';
import { computeAppointmentKpis, formatTime12h } from '../../utils/dashboard-analytics';
import { DashboardTab } from './DashboardLayout';
import { KpiSparklineCard } from './ui/KpiSparklineCard';
import { DashboardCharts } from './ui/DashboardCharts';
import { PRIMARY_ORANGE_BTN, SURFACE_CARD } from './ui/DashboardTokens';

interface Props {
  onSelectTab: (tab: DashboardTab) => void;
}

export const DashboardView: React.FC<Props> = ({ onSelectTab }) => {
  const { currentBusiness, appointments, customers, services } = useBusiness();

  const kpis = useMemo(() => computeAppointmentKpis(appointments), [appointments]);
  const totalRevenue = useMemo(
    () => appointments.reduce((sum, a) => sum + Number(a.payment_received || 0), 0),
    [appointments]
  );

  const todayStr = new Date().toISOString().split('T')[0];
  const upcomingAppointments = useMemo(
    () =>
      appointments
        .filter((a) => (a.status === 'confirmed' || a.status === 'pending') && a.appointment_date >= todayStr)
        .sort((a, b) =>
          `${a.appointment_date} ${a.appointment_time}`.localeCompare(
            `${b.appointment_date} ${b.appointment_time}`
          )
        ),
    [appointments, todayStr]
  );

  if (!currentBusiness) {
    return (
      <div className={`${SURFACE_CARD} p-10 text-center`}>
        <h3 className="text-base font-extrabold text-[#111827]">No Business Selected</h3>
        <p className="text-xs text-slate-500 mt-1">
          Please select or register a business to view your dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top 5 Pastel Gradient KPI Cards with Real Sparklines */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
        {kpis.map((metric) => (
          <KpiSparklineCard
            key={metric.key}
            metric={metric}
            totalCount={appointments.length}
            className={metric.key === 'total' ? 'col-span-2 lg:col-span-1' : ''}
            onClick={() => onSelectTab('appointments')}
          />
        ))}
      </div>

      {/* Real-Data Interactive Charts Row */}
      <DashboardCharts
        appointments={appointments}
        services={services}
        onNavigateTab={(tab) => onSelectTab(tab)}
      />

      {/* Business Quick Summary & Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className={`${SURFACE_CARD} p-5 flex flex-col justify-between space-y-4`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Revenue Collected
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-[#111827]">{formatGHS(totalRevenue)}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              From verified bookings in {currentBusiness.name}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelectTab('payments')}
            className="text-xs font-bold text-[#F95700] hover:underline inline-flex items-center gap-1"
          >
            <span>View Payment Records</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className={`${SURFACE_CARD} p-5 flex flex-col justify-between space-y-4`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Services & Customers
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] font-bold uppercase text-slate-400">Active Services</p>
              <p className="text-xl font-black text-[#111827] mt-0.5">
                {services.filter((s) => s.is_active).length}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] font-bold uppercase text-slate-400">Customers</p>
              <p className="text-xl font-black text-[#111827] mt-0.5">{customers.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onSelectTab('services')}
              className="text-xs font-bold text-[#F95700] hover:underline inline-flex items-center gap-1"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Manage Services</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('customers')}
              className="text-xs font-bold text-slate-600 hover:text-[#111827]"
            >
              View Customers
            </button>
          </div>
        </div>

        <div className={`${SURFACE_CARD} p-5 flex flex-col justify-between space-y-4`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Public Booking Access
            </span>
            <div className="w-9 h-9 rounded-xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-[#111827] truncate">/b/{currentBusiness.slug}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Share your QR code standee or booking link with customers.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectTab('booking-page')}
              className={`${PRIMARY_ORANGE_BTN} flex-1 py-2 text-xs`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>QR Code</span>
            </button>
            <a
              href={`/b/${currentBusiness.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
            >
              <span>Open</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Upcoming Schedule Table */}
      <div className={`${SURFACE_CARD} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-[#111827]">Upcoming Appointments</h3>
            <p className="text-[11px] text-slate-500">
              Live scheduled appointments synced via Supabase Realtime
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelectTab('appointments')}
            className="text-xs font-bold text-[#F95700] hover:underline inline-flex items-center gap-1"
          >
            <span>Open Calendar</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {upcomingAppointments.length === 0 ? (
          <div className="p-10 text-center space-y-2.5">
            <div className="w-11 h-11 rounded-2xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center mx-auto">
              <Calendar className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-[#111827]">No upcoming appointments yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              New bookings from your public booking page or manual schedule will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-6">Customer</th>
                  <th className="py-3 px-6">Service</th>
                  <th className="py-3 px-6">Date & Time</th>
                  <th className="py-3 px-6">Amount</th>
                  <th className="py-3 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {upcomingAppointments.slice(0, 6).map((appt) => (
                  <tr
                    key={appt.id}
                    onClick={() => onSelectTab('appointments')}
                    className="hover:bg-slate-50/70 transition cursor-pointer"
                  >
                    <td className="py-3.5 px-6">
                      <p className="font-bold text-[#111827]">{appt.customer_name}</p>
                      <p className="text-[11px] text-slate-500 font-mono">{appt.customer_phone}</p>
                    </td>
                    <td className="py-3.5 px-6 font-semibold text-slate-700">
                      {appt.service?.name || 'Service'}
                    </td>
                    <td className="py-3.5 px-6">
                      <p className="font-bold text-[#111827]">{appt.appointment_date}</p>
                      <p className="text-[11px] text-slate-500">
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
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {appt.status}
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
