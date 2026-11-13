import React, { useState } from 'react';
import { AdminPeriod, TrendBucket } from '../../utils/admin-analytics';
import { formatCurrencyGhs } from './AdminTokens';

interface PeriodSwitcherProps {
  value: AdminPeriod;
  onChange: (p: AdminPeriod) => void;
}

export const PeriodSwitcher: React.FC<PeriodSwitcherProps> = ({ value, onChange }) => (
  <div className="inline-flex items-center p-0.5 rounded-xl bg-[#F5F6F8] border border-slate-200/80">
    {(['daily', 'weekly', 'monthly'] as AdminPeriod[]).map((p) => (
      <button
        key={p}
        type="button"
        onClick={() => onChange(p)}
        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition ${
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
  emptyText: string;
}

export const AdminLineAreaChart: React.FC<LineAreaChartProps> = ({
  data,
  accentColor = '#E87936',
  secondaryLabel = 'Records',
  valueFormatter = (v) => String(v),
  emptyText,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (data.length === 0 || total === 0) {
    return (
      <div className="h-56 flex items-center justify-center rounded-xl bg-[#F5F6F8]/70 border border-dashed border-slate-200 text-xs font-medium text-slate-500 px-4 text-center">
        {emptyText}
      </div>
    );
  }

  const width = 560;
  const height = 210;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const niceMax = maxVal <= 4 ? 4 : Math.ceil(maxVal * 1.15);

  const coords = data.map((d, i) => {
    const x = padL + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
    const y = padT + plotH - (d.value / niceMax) * plotH;
    return { x, y, item: d };
  });

  const linePath = coords.map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${padT + plotH} L ${coords[0].x} ${padT + plotH} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: padT + plotH - t * plotH,
    label: valueFormatter(Math.round(niceMax * t)),
  }));

  const gradId = `admin-grad-${accentColor.replace('#', '')}`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56 overflow-visible">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {yTicks.map((tick, idx) => (
          <g key={idx}>
            <line
              x1={padL}
              y1={tick.y}
              x2={width - padR}
              y2={tick.y}
              stroke="#E2E8F0"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            <text
              x={padL - 8}
              y={tick.y + 3}
              textAnchor="end"
              className="fill-slate-400 text-[10px] font-medium tabular-nums"
            >
              {tick.label}
            </text>
          </g>
        ))}

        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {coords.map((c, idx) => {
          const showLabel = data.length <= 8 || idx % 2 === 0 || idx === data.length - 1;
          const isHovered = hoveredIdx === idx;
          return (
            <g key={c.item.key}>
              {showLabel && (
                <text
                  x={c.x}
                  y={height - 10}
                  textAnchor="middle"
                  className="fill-slate-500 text-[10px] font-medium"
                >
                  {c.item.label}
                </text>
              )}
              <circle
                cx={c.x}
                cy={c.y}
                r={isHovered ? 5.5 : 3.5}
                fill={isHovered ? accentColor : '#FFFFFF'}
                stroke={accentColor}
                strokeWidth="2.2"
              />
              <rect
                x={c.x - Math.max(plotW / data.length / 2, 12)}
                y={padT}
                width={Math.max(plotW / data.length, 24)}
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
        <div
          className="pointer-events-none absolute top-2 right-3 px-3 py-2 rounded-xl bg-[#14243B] text-white text-xs shadow-lg"
        >
          <p className="font-bold">{coords[hoveredIdx].item.label}</p>
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
      <div className="h-56 flex items-center justify-center rounded-xl bg-[#F5F6F8]/70 border border-dashed border-slate-200 text-xs font-medium text-slate-500 px-4 text-center">
        {emptyText}
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="relative">
      <div className="h-56 flex items-end gap-2 sm:gap-3 pt-8 pb-7 px-2 border-b border-slate-200">
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
                className="w-full max-w-[36px] rounded-t-lg transition-all duration-200"
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
      <div className="flex items-center justify-between pt-2 text-[11px] text-slate-500">
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
  if (total === 0) {
    return (
      <div className="h-56 flex items-center justify-center rounded-xl bg-[#F5F6F8]/70 border border-dashed border-slate-200 text-xs font-medium text-slate-500 px-4 text-center">
        No appointments recorded yet to calculate status distribution.
      </div>
    );
  }

  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 py-2">
      <div className="relative w-40 h-40 shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 150 150" className="w-full h-full -rotate-90">
          <circle cx="75" cy="75" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="18" />
          {items.map((item) => {
            const frac = total > 0 ? item.count / total : 0;
            const dash = frac * circumference;
            const offset = -accumulated * circumference;
            accumulated += frac;
            if (item.count === 0) return null;
            return (
              <circle
                key={item.status}
                cx="75"
                cy="75"
                r={radius}
                fill="none"
                stroke={STATUS_COLORS[item.status] || '#64748B'}
                strokeWidth="18"
                strokeDasharray={`${dash} ${circumference}`}
                strokeDashoffset={offset}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-extrabold text-[#14243B] tabular-nums">{total}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Total</span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2.5">
        {items.map((item) => (
          <div key={item.status} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-semibold text-[#14243B]">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[item.status] || '#64748B' }}
                />
                {item.label}
              </span>
              <span className="font-bold text-[#14243B] tabular-nums">
                {item.count} <span className="text-slate-400 font-medium">({item.percentage}%)</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${item.percentage}%`,
                  backgroundColor: STATUS_COLORS[item.status] || '#64748B',
                }}
              />
            </div>
          </div>
        ))}
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
