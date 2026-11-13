import React, { useState } from 'react';
import { BarChart3, PieChart } from 'lucide-react';
import { AdminPeriod, TrendBucket } from '../../utils/admin-analytics';
import { formatCurrencyGhs } from './AdminTokens';

interface PeriodSwitcherProps {
  value: AdminPeriod;
  onChange: (p: AdminPeriod) => void;
}

export const PeriodSwitcher: React.FC<PeriodSwitcherProps> = ({ value, onChange }) => (
  <div
    className="inline-flex items-center p-0.5 rounded-xl bg-[#F5F6F8] border border-slate-200/80 shrink-0"
    role="group"
    aria-label="Timeframe filter"
  >
    {(['daily', 'weekly', 'monthly'] as AdminPeriod[]).map((p) => (
      <button
        key={p}
        type="button"
        onClick={() => onChange(p)}
        className={`px-2.5 py-1 rounded-[9px] text-[11px] font-bold capitalize whitespace-nowrap shrink-0 transition-all duration-150 ${
          value === p
            ? 'bg-white text-[#14243B] shadow-xs'
            : 'text-slate-500 hover:text-[#14243B]'
        }`}
      >
        {p}
      </button>
    ))}
  </div>
);

interface LineAreaChartProps {
  data: TrendBucket[];
  accentColor?: string;
  secondaryLabel?: string;
  valueFormatter?: (v: number) => string;
  axisFormatter?: (v: number) => string;
  emptyText: string;
}

function buildSmoothCurvePath(points: { x: number; y: number }[], baselineY: number): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const tension = 0.2;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = Math.min(baselineY, Math.max(8, p1.y + (p2.y - p0.y) * tension));
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = Math.min(baselineY, Math.max(8, p2.y - (p3.y - p1.y) * tension));

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export const AdminLineAreaChart: React.FC<LineAreaChartProps> = ({
  data,
  accentColor = '#E87936',
  secondaryLabel = 'Records',
  valueFormatter = (v) => String(v),
  axisFormatter,
  emptyText,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const yLabelFormatter = axisFormatter || valueFormatter;

  if (data.length === 0 || total === 0) {
    return (
      <div className="h-52 flex flex-col items-center justify-center gap-2 rounded-xl bg-[#F5F6F8]/70 border border-dashed border-slate-200 text-xs font-medium text-slate-500 px-5 text-center">
        <div className="w-9 h-9 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center text-slate-400">
          <BarChart3 className="w-4 h-4" />
        </div>
        <p className="max-w-[240px] leading-relaxed">{emptyText}</p>
      </div>
    );
  }

  // Calibrated viewBox for 3-column desktop cards (~340-390px wide) so 10-11px labels remain crisp
  const width = 380;
  const height = 196;
  const padL = 44;
  const padR = 14;
  const padT = 16;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const baselineY = padT + plotH;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const niceMax = maxVal <= 4 ? 4 : Math.ceil(maxVal * 1.15);

  const coords = data.map((d, i) => {
    const x = padL + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
    const y = padT + plotH - (d.value / niceMax) * plotH;
    return { x, y, item: d };
  });

  const linePath = buildSmoothCurvePath(coords, baselineY);
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${baselineY.toFixed(2)} L ${coords[0].x.toFixed(2)} ${baselineY.toFixed(2)} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: padT + plotH - t * plotH,
    label: yLabelFormatter(Math.round(niceMax * t)),
  }));

  const gradId = `admin-grad-${accentColor.replace('#', '')}`;
  const labelStride = data.length > 10 ? 3 : data.length > 6 ? 2 : 1;

  return (
    <div className="relative select-none">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-52 overflow-visible">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.26" />
            <stop offset="70%" stopColor={accentColor} stopOpacity="0.06" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {yTicks.map((tick, idx) => (
          <g key={idx}>
            <line
              x1={padL}
              y1={tick.y}
              x2={width - padR}
              y2={tick.y}
              stroke={idx === 0 ? '#CBD5E1' : '#E2E8F0'}
              strokeDasharray={idx === 0 ? undefined : '3 3'}
              strokeWidth="1"
            />
            <text
              x={padL - 8}
              y={tick.y + 3.5}
              textAnchor="end"
              className="fill-slate-400 text-[10px] font-semibold tabular-nums"
            >
              {tick.label}
            </text>
          </g>
        ))}

        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={accentColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {hoveredIdx !== null && coords[hoveredIdx] && (
          <line
            x1={coords[hoveredIdx].x}
            y1={padT}
            x2={coords[hoveredIdx].x}
            y2={baselineY}
            stroke={accentColor}
            strokeOpacity="0.35"
            strokeDasharray="3 3"
            strokeWidth="1.25"
          />
        )}

        {coords.map((c, idx) => {
          const showLabel = idx === 0 || idx === data.length - 1 || idx % labelStride === 0;
          const isHovered = hoveredIdx === idx;
          return (
            <g key={c.item.key}>
              {showLabel && (
                <text
                  x={c.x}
                  y={height - 8}
                  textAnchor={idx === 0 ? 'start' : idx === data.length - 1 ? 'end' : 'middle'}
                  className={`text-[10px] font-medium ${
                    isHovered ? 'fill-[#14243B] font-bold' : 'fill-slate-400'
                  }`}
                >
                  {c.item.label}
                </text>
              )}
              {isHovered && (
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={8}
                  fill={accentColor}
                  fillOpacity="0.18"
                />
              )}
              <circle
                cx={c.x}
                cy={c.y}
                r={isHovered ? 4.5 : 3}
                fill={isHovered ? accentColor : '#FFFFFF'}
                stroke={accentColor}
                strokeWidth="2.2"
              />
              <rect
                x={c.x - Math.max(plotW / data.length / 2, 10)}
                y={padT}
                width={Math.max(plotW / data.length, 20)}
                height={plotH + padB}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            </g>
          );
        })}
      </svg>

      {hoveredIdx !== null && coords[hoveredIdx] && (
        <div className="pointer-events-none absolute top-1 right-2 px-3 py-2 rounded-xl bg-[#14243B] text-white text-xs shadow-lg border border-white/10 z-10">
          <p className="font-bold text-[11px]">{coords[hoveredIdx].item.label}</p>
          <p className="text-[11px] text-slate-200 tabular-nums mt-0.5">
            {valueFormatter(coords[hoveredIdx].item.value)}
            {coords[hoveredIdx].item.secondaryValue !== undefined
              ? ` · ${coords[hoveredIdx].item.secondaryValue} ${secondaryLabel}`
              : ''}
          </p>
        </div>
      )}
    </div>
  );
};

interface BarChartProps {
  data: TrendBucket[];
  barColor?: string;
  valueFormatter?: (v: number) => string;
  emptyText: string;
}

export const AdminBarChart: React.FC<BarChartProps> = ({
  data,
  barColor = '#14243B',
  valueFormatter = (v) => String(v),
  emptyText,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (data.length === 0 || total === 0) {
    return (
      <div className="h-52 flex items-center justify-center rounded-xl bg-[#F5F6F8]/70 border border-dashed border-slate-200 text-xs font-medium text-slate-500 px-4 text-center">
        {emptyText}
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="relative">
      <div className="h-52 flex items-end gap-2 sm:gap-3 pt-8 pb-7 px-2 border-b border-slate-200">
        {data.map((bucket, idx) => {
          const pct = Math.max((bucket.value / maxVal) * 100, bucket.value > 0 ? 6 : 0);
          return (
            <div
              key={bucket.key}
              className="flex-1 flex flex-col items-center justify-end h-full relative group"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {hoveredIdx === idx && (
                <div className="absolute -top-7 px-2 py-1 rounded-lg bg-[#14243B] text-white text-[10px] font-bold whitespace-nowrap shadow-md tabular-nums z-10">
                  {valueFormatter(bucket.value)}
                </div>
              )}
              <div
                className="w-full max-w-[36px] rounded-t-lg transition-all duration-150"
                style={{
                  height: `${pct}%`,
                  backgroundColor: hoveredIdx === idx ? '#E87936' : barColor,
                }}
              />
              <span className="mt-2 text-[10px] font-medium text-slate-500 truncate max-w-full">
                {bucket.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between pt-2.5 text-[11px] text-slate-500">
        <span>Total in series</span>
        <span className="font-bold text-[#14243B] tabular-nums">{valueFormatter(total)}</span>
      </div>
    </div>
  );
};

interface StatusBreakdownItem {
  status: string;
  label: string;
  count: number;
  percentage: number;
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: '#2563EB',
  pending: '#D97706',
  completed: '#16A34A',
  cancelled: '#DC2626',
};

export const AdminStatusDonut: React.FC<{
  items: StatusBreakdownItem[];
  total: number;
}> = ({ items, total }) => {
  const [hoveredStatus, setHoveredStatus] = useState<string | null>(null);

  if (total === 0) {
    return (
      <div className="h-52 flex flex-col items-center justify-center gap-2 rounded-xl bg-[#F5F6F8]/70 border border-dashed border-slate-200 text-xs font-medium text-slate-500 px-5 text-center">
        <div className="w-9 h-9 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center text-slate-400">
          <PieChart className="w-4 h-4" />
        </div>
        <p className="max-w-[240px] leading-relaxed">
          No appointments recorded yet to calculate status distribution.
        </p>
      </div>
    );
  }

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  const activeItem = hoveredStatus ? items.find((i) => i.status === hoveredStatus) : null;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="15" />
          {items.map((item) => {
            const frac = total > 0 ? item.count / total : 0;
            const dash = frac * circumference;
            const offset = -accumulated * circumference;
            accumulated += frac;
            if (item.count === 0) return null;
            const isActive = hoveredStatus === item.status;
            const isDimmed = hoveredStatus !== null && !isActive;
            return (
              <circle
                key={item.status}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={STATUS_COLORS[item.status] || '#64748B'}
                strokeWidth={isActive ? 18 : 15}
                strokeDasharray={`${dash} ${circumference}`}
                strokeDashoffset={offset}
                strokeOpacity={isDimmed ? 0.32 : 1}
                className="cursor-pointer transition-all duration-150"
                onMouseEnter={() => setHoveredStatus(item.status)}
                onMouseLeave={() => setHoveredStatus(null)}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-3">
          {activeItem ? (
            <>
              <span className="text-xl font-extrabold text-[#14243B] tabular-nums leading-none">
                {activeItem.percentage}%
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1 truncate max-w-full">
                {activeItem.label}
              </span>
            </>
          ) : (
            <>
              <span className="text-2xl font-extrabold text-[#14243B] tabular-nums leading-none">
                {total}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">
                Bookings
              </span>
            </>
          )}
        </div>
      </div>

      <div className="w-full grid grid-cols-1 gap-2">
        {items.map((item) => {
          const isActive = hoveredStatus === item.status;
          return (
            <div
              key={item.status}
              onMouseEnter={() => setHoveredStatus(item.status)}
              onMouseLeave={() => setHoveredStatus(null)}
              className={`space-y-1 rounded-lg px-2 py-1 -mx-2 transition-colors cursor-default ${
                isActive ? 'bg-slate-50' : ''
              }`}
            >
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="flex items-center gap-2 font-semibold text-[#14243B] min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[item.status] || '#64748B' }}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="font-bold text-[#14243B] tabular-nums shrink-0">
                  {item.count}{' '}
                  <span className="text-slate-400 font-medium">({item.percentage}%)</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-200"
                  style={{
                    width: `${item.percentage}%`,
                    backgroundColor: STATUS_COLORS[item.status] || '#64748B',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const SubscriptionRevenueSummaryFooter: React.FC<{
  verifiedTotal: number;
  periodTotal: number;
}> = ({ verifiedTotal, periodTotal }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-2 border-t border-slate-100 text-xs">
    <span className="text-slate-500">
      Verified subscription revenue only (excludes pending/failed & booking fees)
    </span>
    <div className="flex items-center gap-4 tabular-nums">
      <span className="text-slate-600">
        Series: <strong className="text-[#14243B]">{formatCurrencyGhs(periodTotal)}</strong>
      </span>
      <span className="text-slate-600">
        All-time: <strong className="text-emerald-700">{formatCurrencyGhs(verifiedTotal)}</strong>
      </span>
    </div>
  </div>
);

