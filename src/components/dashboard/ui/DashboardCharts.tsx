import React, { useMemo, useState } from 'react';
import { BarChart3, TrendingUp, PieChart, Scissors } from 'lucide-react';
import { Appointment, Service } from '../../../types/database';
import { computeDashboardCharts } from '../../../utils/dashboard-analytics';
import { formatGHS } from '../../../utils/booking-logic';
import { SURFACE_CARD } from './DashboardTokens';

interface Props {
  appointments: Appointment[];
  services: Service[];
  onNavigateTab?: (tab: 'appointments' | 'services' | 'payments') => void;
}

export const DashboardCharts: React.FC<Props> = ({
  appointments,
  services,
  onNavigateTab,
}) => {
  const [range, setRange] = useState<7 | 30 | 'all'>(7);
  const [metricMode, setMetricMode] = useState<'bookings' | 'revenue'>('bookings');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const { dailySeries, statusBreakdown, servicePerformance } = useMemo(
    () => computeDashboardCharts(appointments, services, range),
    [appointments, services, range]
  );

  const maxVal = useMemo(() => {
    const vals = dailySeries.map((d) =>
      metricMode === 'bookings' ? d.bookings : d.revenue
    );
    return Math.max(...vals, 1);
  }, [dailySeries, metricMode]);

  const totalAppointments = appointments.length;

  // Build SVG polyline & area for trend chart
  const chartW = 560;
  const chartH = 180;
  const padX = 24;
  const padY = 18;
  const usableW = chartW - padX * 2;
  const usableH = chartH - padY * 2;

  const points = useMemo(() => {
    if (dailySeries.length === 0) return [];
    const step = dailySeries.length > 1 ? usableW / (dailySeries.length - 1) : 0;
    return dailySeries.map((d, i) => {
      const val = metricMode === 'bookings' ? d.bookings : d.revenue;
      const x = dailySeries.length === 1 ? chartW / 2 : padX + i * step;
      const y = padY + usableH - (val / maxVal) * usableH;
      return { x, y, val, item: d };
    });
  }, [dailySeries, metricMode, maxVal, usableW, usableH]);

  const linePath = useMemo(() => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cx = (p0.x + p1.x) / 2;
      path += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return path;
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length < 2) return '';
    const last = points[points.length - 1];
    return `${linePath} L ${last.x} ${chartH - padY} L ${points[0].x} ${chartH - padY} Z`;
  }, [linePath, points]);

  // SVG Donut segments for status breakdown
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      {/* Main Trend Chart */}
      <div className={`${SURFACE_CARD} xl:col-span-7 p-5 md:p-6 flex flex-col justify-between`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-[#111827]">
                {metricMode === 'bookings' ? 'Appointment Volume Trend' : 'Revenue Collected Trend'}
              </h3>
              <p className="text-[11px] text-slate-500">
                Real-time daily analytics from your Supabase booking records
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Metric Toggle */}
            <div className="inline-flex bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setMetricMode('bookings')}
                className={`px-2.5 py-1 rounded-md transition ${
                  metricMode === 'bookings'
                    ? 'bg-white text-[#111827] shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Bookings
              </button>
              <button
                type="button"
                onClick={() => setMetricMode('revenue')}
                className={`px-2.5 py-1 rounded-md transition ${
                  metricMode === 'revenue'
                    ? 'bg-white text-[#111827] shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Revenue
              </button>
            </div>

            {/* Date Range Filter */}
            <div className="inline-flex bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold">
              {([
                { id: 7, label: '7D' },
                { id: 30, label: '30D' },
                { id: 'all', label: 'All' },
              ] as const).map((r) => (
                <button
                  key={String(r.id)}
                  type="button"
                  onClick={() => setRange(r.id)}
                  className={`px-2.5 py-1 rounded-md transition ${
                    range === r.id
                      ? 'bg-[#F95700] text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {appointments.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <div className="w-11 h-11 rounded-2xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center mx-auto">
              <BarChart3 className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-slate-800">No appointment data available yet</p>
            <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
              Create an appointment or share your booking link to see real-time booking and revenue analytics.
            </p>
          </div>
        ) : (
          <div className="pt-4 relative">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-48 overflow-visible">
              <defs>
                <linearGradient id="samleyTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={metricMode === 'bookings' ? '#F95700' : '#16A34A'}
                    stopOpacity="0.22"
                  />
                  <stop
                    offset="100%"
                    stopColor={metricMode === 'bookings' ? '#F95700' : '#16A34A'}
                    stopOpacity="0.01"
                  />
                </linearGradient>
              </defs>

              {/* Horizontal gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((frac, idx) => {
                const y = padY + usableH * (1 - frac);
                const labelVal = Math.round(maxVal * frac);
                return (
                  <g key={idx}>
                    <line
                      x1={padX}
                      x2={chartW - padX}
                      y1={y}
                      y2={y}
                      stroke="#E2E8F0"
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                    <text
                      x={padX - 6}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-slate-400 text-[9px] font-semibold"
                    >
                      {metricMode === 'revenue' ? `${labelVal}` : labelVal}
                    </text>
                  </g>
                );
              })}

              {areaPath && <path d={areaPath} fill="url(#samleyTrendFill)" />}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke={metricMode === 'bookings' ? '#F95700' : '#16A34A'}
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Data points & hover targets */}
              {points.map((pt, idx) => {
                const isHovered = hoveredIdx === idx;
                return (
                  <g
                    key={pt.item.date}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 5.5 : 3.5}
                      fill="#FFFFFF"
                      stroke={metricMode === 'bookings' ? '#F95700' : '#16A34A'}
                      strokeWidth={isHovered ? 3 : 2}
                    />
                    <rect
                      x={pt.x - 14}
                      y={0}
                      width={28}
                      height={chartH}
                      fill="transparent"
                    />
                  </g>
                );
              })}
            </svg>

            {/* X-axis labels */}
            <div className="flex items-center justify-between px-4 pt-1 text-[10px] font-semibold text-slate-400">
              {dailySeries
                .filter((_, idx) =>
                  dailySeries.length <= 8
                    ? true
                    : idx === 0 ||
                      idx === Math.floor(dailySeries.length / 2) ||
                      idx === dailySeries.length - 1
                )
                .map((d) => (
                  <span key={d.date}>{d.label}</span>
                ))}
            </div>

            {/* Interactive Hover Tooltip */}
            {hoveredIdx !== null && points[hoveredIdx] && (
              <div className="mt-2 px-3 py-2 rounded-xl bg-[#0E1733] text-white text-[11px] flex items-center justify-between">
                <span className="font-bold">{points[hoveredIdx].item.label}</span>
                <span className="font-semibold text-orange-300">
                  {points[hoveredIdx].item.bookings} booking
                  {points[hoveredIdx].item.bookings !== 1 ? 's' : ''} &bull;{' '}
                  {formatGHS(points[hoveredIdx].item.revenue)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Column: Status Breakdown Donut + Top Services */}
      <div className="xl:col-span-5 space-y-5">
        {/* Status Breakdown */}
        <div className={`${SURFACE_CARD} p-5`}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <PieChart className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#111827]">Status Breakdown</h3>
                <p className="text-[11px] text-slate-500">Live distribution across all bookings</p>
              </div>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('appointments')}
                className="text-[11px] font-bold text-[#F95700] hover:underline"
              >
                View All
              </button>
            )}
          </div>

          {totalAppointments === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              No appointment status data yet.
            </p>
          ) : (
            <div className="pt-4 flex flex-col sm:flex-row items-center gap-5">
              <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 132 132" className="w-full h-full -rotate-90">
                  <circle
                    cx="66"
                    cy="66"
                    r={radius}
                    fill="none"
                    stroke="#F1F5F9"
                    strokeWidth="16"
                  />
                  {statusBreakdown
                    .filter((s) => s.count > 0)
                    .map((seg) => {
                      const dashLen = (seg.count / totalAppointments) * circumference;
                      const dashOffset = -cumulativeOffset;
                      cumulativeOffset += dashLen;
                      return (
                        <circle
                          key={seg.status}
                          cx="66"
                          cy="66"
                          r={radius}
                          fill="none"
                          stroke={seg.color}
                          strokeWidth="16"
                          strokeDasharray={`${dashLen} ${circumference}`}
                          strokeDashoffset={dashOffset}
                          strokeLinecap="butt"
                        />
                      );
                    })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-black text-[#111827]">{totalAppointments}</span>
                  <span className="text-[10px] font-semibold text-slate-400">Total</span>
                </div>
              </div>

              <div className="flex-1 w-full space-y-2">
                {statusBreakdown.map((item) => (
                  <div key={item.status} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-semibold text-slate-700">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-[#111827]">{item.count}</span>
                      <span className="text-[10px] font-semibold text-slate-400 w-8 text-right">
                        {item.percentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Service Performance */}
        <div className={`${SURFACE_CARD} p-5`}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Scissors className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#111827]">Top Booked Services</h3>
                <p className="text-[11px] text-slate-500">Ranked by real customer bookings</p>
              </div>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('services')}
                className="text-[11px] font-bold text-[#F95700] hover:underline"
              >
                Services
              </button>
            )}
          </div>

          {servicePerformance.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              Service performance will appear once customers book your services.
            </p>
          ) : (
            <div className="pt-3 space-y-3">
              {servicePerformance.slice(0, 4).map((svc, idx) => {
                const maxBookings = servicePerformance[0]?.bookings || 1;
                const widthPct = Math.max(Math.round((svc.bookings / maxBookings) * 100), 8);
                const barColors = ['bg-[#F95700]', 'bg-[#2563EB]', 'bg-[#16A34A]', 'bg-[#8B5CF6]'];
                return (
                  <div key={svc.serviceId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 truncate pr-2">{svc.name}</span>
                      <span className="text-[11px] font-bold text-slate-600 shrink-0">
                        {svc.bookings} booking{svc.bookings !== 1 ? 's' : ''} &bull;{' '}
                        {formatGHS(svc.revenue)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColors[idx % barColors.length]}`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
