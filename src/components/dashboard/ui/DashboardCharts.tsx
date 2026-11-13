import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart,
  Scissors,
  ArrowUpRight,
  Calendar,
} from 'lucide-react';
import { Appointment, AppointmentStatus, Service } from '../../../types/database';
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
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);
  const [focusedStatus, setFocusedStatus] = useState<AppointmentStatus | null>(null);
  const [serviceSort, setServiceSort] = useState<'bookings' | 'revenue'>('bookings');

  const { dailySeries, statusBreakdown, servicePerformance } = useMemo(
    () => computeDashboardCharts(appointments, services, range),
    [appointments, services, range]
  );

  const sortedServices = useMemo(() => {
    const copy = [...servicePerformance];
    if (serviceSort === 'revenue') {
      return copy.sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings);
    }
    return copy.sort((a, b) => b.bookings - a.bookings || b.revenue - a.revenue);
  }, [servicePerformance, serviceSort]);

  const maxVal = useMemo(() => {
    const vals = dailySeries.map((d) =>
      metricMode === 'bookings' ? d.bookings : d.revenue
    );
    return Math.max(...vals, 1);
  }, [dailySeries, metricMode]);

  const rangeTotals = useMemo(() => {
    return dailySeries.reduce(
      (acc, d) => {
        acc.bookings += d.bookings;
        acc.revenue += d.revenue;
        return acc;
      },
      { bookings: 0, revenue: 0 }
    );
  }, [dailySeries]);

  const totalAppointments = appointments.length;
  const activeTrendIdx = hoveredIdx !== null ? hoveredIdx : pinnedIdx;

  // Compact SVG canvas sized cleanly for 1/3 grid card
  const chartW = 380;
  const chartH = 165;
  const padX = 36;
  const padY = 16;
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

  const openFilteredAppointments = (opts: { status?: AppointmentStatus; serviceId?: string; date?: string }) => {
    try {
      if (opts.status) {
        localStorage.setItem('samley_appt_status_filter', opts.status);
      }
      if (opts.serviceId) {
        localStorage.setItem('samley_appt_service_filter', opts.serviceId);
      }
      if (opts.date) {
        localStorage.setItem('samley_appt_focus_date', opts.date);
      }
    } catch {
      // ignore storage errors
    }
    if (onNavigateTab) onNavigateTab('appointments');
  };

  // SVG Donut math
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  const focusedStatusItem = focusedStatus
    ? statusBreakdown.find((s) => s.status === focusedStatus) || null
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
      {/* CARD 1: Appointment Volume Trend */}
      <div className={`${SURFACE_CARD} p-5 flex flex-col justify-between`}>
        <div>
          <div className="flex items-start justify-between gap-2 pb-3.5 border-b border-slate-100">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[13.5px] font-extrabold text-[#111827] truncate">
                  Appointment Volume Trend
                </h3>
                <p className="text-[11px] text-slate-500 truncate">
                  {metricMode === 'bookings'
                    ? `${rangeTotals.bookings} booking${rangeTotals.bookings !== 1 ? 's' : ''} in window`
                    : `${formatGHS(rangeTotals.revenue)} collected`}
                </p>
              </div>
            </div>
          </div>

          {/* Interactive Controls Row */}
          <div className="flex items-center justify-between gap-2 pt-3 flex-wrap">
            <div className="inline-flex bg-slate-100 p-0.5 rounded-lg text-[10.5px] font-bold">
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

            <div className="inline-flex bg-slate-100 p-0.5 rounded-lg text-[10.5px] font-bold">
              {([
                { id: 7, label: '7D' },
                { id: 30, label: '30D' },
                { id: 'all', label: 'All' },
              ] as const).map((r) => (
                <button
                  key={String(r.id)}
                  type="button"
                  onClick={() => {
                    setRange(r.id);
                    setPinnedIdx(null);
                  }}
                  className={`px-2 py-1 rounded-md transition ${
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
          <div className="py-10 text-center space-y-2 flex-1 flex flex-col items-center justify-center">
            <div className="w-10 h-10 rounded-2xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-[#111827]">No appointment data yet</p>
            <p className="text-[11px] text-slate-500 max-w-[220px]">
              Bookings and revenue trends populate automatically from live records.
            </p>
          </div>
        ) : (
          <div className="pt-3 flex-1 flex flex-col justify-end">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-40 overflow-visible">
              <defs>
                <linearGradient id="samleyTrendFill3" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={metricMode === 'bookings' ? '#F95700' : '#16A34A'}
                    stopOpacity="0.24"
                  />
                  <stop
                    offset="100%"
                    stopColor={metricMode === 'bookings' ? '#F95700' : '#16A34A'}
                    stopOpacity="0.01"
                  />
                </linearGradient>
              </defs>

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
                      {labelVal >= 1000 ? `${(labelVal / 1000).toFixed(1)}k` : labelVal}
                    </text>
                  </g>
                );
              })}

              {areaPath && <path d={areaPath} fill="url(#samleyTrendFill3)" />}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke={metricMode === 'bookings' ? '#F95700' : '#16A34A'}
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {points.map((pt, idx) => {
                const isActive = activeTrendIdx === idx;
                return (
                  <g
                    key={pt.item.date}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onClick={() => setPinnedIdx((prev) => (prev === idx ? null : idx))}
                    className="cursor-pointer"
                  >
                    {isActive && (
                      <line
                        x1={pt.x}
                        x2={pt.x}
                        y1={padY}
                        y2={chartH - padY}
                        stroke={metricMode === 'bookings' ? '#F95700' : '#16A34A'}
                        strokeDasharray="2 2"
                        strokeOpacity="0.4"
                      />
                    )}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isActive ? 5 : 3.2}
                      fill="#FFFFFF"
                      stroke={metricMode === 'bookings' ? '#F95700' : '#16A34A'}
                      strokeWidth={isActive ? 2.8 : 2}
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

            <div className="flex items-center justify-between px-4 pt-1 text-[10px] font-semibold text-slate-400">
              {dailySeries
                .filter((_, idx) =>
                  dailySeries.length <= 7
                    ? idx === 0 || idx === 3 || idx === dailySeries.length - 1
                    : idx === 0 ||
                      idx === Math.floor(dailySeries.length / 2) ||
                      idx === dailySeries.length - 1
                )
                .map((d) => (
                  <span key={d.date}>{d.label}</span>
                ))}
            </div>

            {/* Interactive Selected/Hovered Day Footer */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
              {activeTrendIdx !== null && points[activeTrendIdx] ? (
                <>
                  <span className="font-bold text-[#111827] truncate">
                    {points[activeTrendIdx].item.label}:{' '}
                    <span className="text-[#F95700]">
                      {points[activeTrendIdx].item.bookings} booking
                      {points[activeTrendIdx].item.bookings !== 1 ? 's' : ''}
                    </span>{' '}
                    ({formatGHS(points[activeTrendIdx].item.revenue)})
                  </span>
                  {onNavigateTab && (
                    <button
                      type="button"
                      onClick={() =>
                        openFilteredAppointments({ date: points[activeTrendIdx].item.date })
                      }
                      className="text-[#F95700] font-bold hover:underline inline-flex items-center gap-0.5 shrink-0"
                    >
                      <Calendar className="w-3 h-3" />
                      <span>Open</span>
                    </button>
                  )}
                </>
              ) : (
                <span className="text-slate-400 font-medium">
                  Hover or click any point for daily details
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CARD 2: Status Breakdown */}
      <div className={`${SURFACE_CARD} p-5 flex flex-col justify-between`}>
        <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <PieChart className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[13.5px] font-extrabold text-[#111827] truncate">
                Status Breakdown
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                Click a status to inspect or filter
              </p>
            </div>
          </div>
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => openFilteredAppointments({ status: focusedStatus || undefined })}
              className="text-[11px] font-bold text-[#F95700] hover:underline shrink-0"
            >
              View All
            </button>
          )}
        </div>

        {totalAppointments === 0 ? (
          <div className="py-10 text-center space-y-2 flex-1 flex flex-col items-center justify-center">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center">
              <PieChart className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-[#111827]">No appointment status data yet</p>
            <p className="text-[11px] text-slate-500 max-w-[220px]">
              Confirmed, pending, completed, and cancelled shares appear here.
            </p>
          </div>
        ) : (
          <div className="pt-4 flex-1 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-center gap-5">
              <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                  <circle
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke="#F1F5F9"
                    strokeWidth="14"
                  />
                  {statusBreakdown
                    .filter((s) => s.count > 0)
                    .map((seg) => {
                      const dashLen = (seg.count / totalAppointments) * circumference;
                      const dashOffset = -cumulativeOffset;
                      cumulativeOffset += dashLen;
                      const isDimmed = focusedStatus !== null && focusedStatus !== seg.status;
                      return (
                        <circle
                          key={seg.status}
                          cx="60"
                          cy="60"
                          r={radius}
                          fill="none"
                          stroke={seg.color}
                          strokeWidth={focusedStatus === seg.status ? 17 : 14}
                          strokeDasharray={`${dashLen} ${circumference}`}
                          strokeDashoffset={dashOffset}
                          strokeLinecap="butt"
                          opacity={isDimmed ? 0.3 : 1}
                          className="cursor-pointer transition-all"
                          onClick={() =>
                            setFocusedStatus((prev) =>
                              prev === seg.status ? null : seg.status
                            )
                          }
                        />
                      );
                    })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-lg font-black text-[#111827]">
                    {focusedStatusItem ? focusedStatusItem.count : totalAppointments}
                  </span>
                  <span className="text-[9.5px] font-bold text-slate-400">
                    {focusedStatusItem
                      ? `${focusedStatusItem.percentage}% ${focusedStatusItem.label}`
                      : 'Total'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              {statusBreakdown.map((item) => {
                const isFocused = focusedStatus === item.status;
                return (
                  <button
                    key={item.status}
                    type="button"
                    onClick={() =>
                      setFocusedStatus((prev) => (prev === item.status ? null : item.status))
                    }
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition ${
                      isFocused
                        ? 'bg-slate-100 ring-1 ring-slate-200'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-bold text-slate-700">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-[#111827]">{item.count}</span>
                      <span className="text-[10.5px] font-semibold text-slate-400 w-8 text-right">
                        {item.percentage}%
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {onNavigateTab && (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-medium truncate">
                  {focusedStatusItem
                    ? `${focusedStatusItem.label}: ${focusedStatusItem.count} record${focusedStatusItem.count !== 1 ? 's' : ''}`
                    : 'All booking statuses'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    openFilteredAppointments({ status: focusedStatus || undefined })
                  }
                  className="text-[#F95700] font-bold hover:underline inline-flex items-center gap-0.5 shrink-0"
                >
                  <span>{focusedStatusItem ? `Filter ${focusedStatusItem.label}` : 'Open List'}</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CARD 3: Top Booked Services */}
      <div className={`${SURFACE_CARD} p-5 flex flex-col justify-between`}>
        <div>
          <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-slate-100">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Scissors className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[13.5px] font-extrabold text-[#111827] truncate">
                  Top Booked Services
                </h3>
                <p className="text-[11px] text-slate-500 truncate">
                  Ranked by real customer bookings
                </p>
              </div>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('services')}
                className="text-[11px] font-bold text-[#F95700] hover:underline shrink-0"
              >
                Services
              </button>
            )}
          </div>

          {/* Sort Mode Toggle */}
          {sortedServices.length > 0 && (
            <div className="flex items-center justify-between pt-3">
              <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">
                Rank by
              </span>
              <div className="inline-flex bg-slate-100 p-0.5 rounded-lg text-[10.5px] font-bold">
                <button
                  type="button"
                  onClick={() => setServiceSort('bookings')}
                  className={`px-2.5 py-1 rounded-md transition ${
                    serviceSort === 'bookings'
                      ? 'bg-white text-[#111827] shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Bookings
                </button>
                <button
                  type="button"
                  onClick={() => setServiceSort('revenue')}
                  className={`px-2.5 py-1 rounded-md transition ${
                    serviceSort === 'revenue'
                      ? 'bg-white text-[#111827] shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Revenue
                </button>
              </div>
            </div>
          )}
        </div>

        {sortedServices.length === 0 ? (
          <div className="py-10 text-center space-y-2 flex-1 flex flex-col items-center justify-center">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
              <Scissors className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-[#111827]">No booked services yet</p>
            <p className="text-[11px] text-slate-500 max-w-[220px]">
              Service ranking will appear once customers book your services.
            </p>
          </div>
        ) : (
          <div className="pt-3 flex-1 flex flex-col justify-between gap-3">
            <div className="space-y-2.5">
              {sortedServices.slice(0, 4).map((svc, idx) => {
                const maxMetric =
                  serviceSort === 'revenue'
                    ? Math.max(...sortedServices.map((s) => s.revenue), 1)
                    : Math.max(...sortedServices.map((s) => s.bookings), 1);
                const val = serviceSort === 'revenue' ? svc.revenue : svc.bookings;
                const widthPct = Math.max(Math.round((val / maxMetric) * 100), 8);
                const barColors = [
                  'bg-[#F95700]',
                  'bg-[#2563EB]',
                  'bg-[#16A34A]',
                  'bg-[#8B5CF6]',
                ];

                return (
                  <button
                    key={svc.serviceId}
                    type="button"
                    onClick={() =>
                      openFilteredAppointments({ serviceId: svc.serviceId })
                    }
                    className="w-full text-left p-2 rounded-xl hover:bg-slate-50 transition space-y-1.5 group"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-md bg-slate-100 text-[10px] font-extrabold text-slate-600 flex items-center justify-center shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="font-bold text-[#111827] truncate group-hover:text-[#F95700] transition">
                          {svc.name}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-slate-600 shrink-0">
                        {svc.bookings} &bull; {formatGHS(svc.revenue)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          barColors[idx % barColors.length]
                        }`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-medium">
                {services.filter((s) => s.is_active).length} active service
                {services.filter((s) => s.is_active).length !== 1 ? 's' : ''}
              </span>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('services')}
                  className="text-[#F95700] font-bold hover:underline inline-flex items-center gap-0.5"
                >
                  <span>Manage Services</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
