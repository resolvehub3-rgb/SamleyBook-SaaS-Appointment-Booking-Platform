import React, { useId, useState } from 'react';
import { BarChart3, PieChart } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AdminPeriod, TrendBucket } from '../../utils/admin-analytics';
import { formatCurrencyGhs } from './AdminTokens';

interface PeriodSwitcherProps {
  value: AdminPeriod;
  onChange: (p: AdminPeriod) => void;
}

export const PeriodSwitcher: React.FC<PeriodSwitcherProps> = ({ value, onChange }) => {
  const uid = useId();
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      className="inline-flex items-center p-0.5 rounded-xl bg-slate-100/90 border border-slate-200/80 shrink-0"
      role="group"
      aria-label="Timeframe filter"
    >
      {(['daily', 'weekly', 'monthly'] as AdminPeriod[]).map((p) => {
        const isActive = value === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`relative px-2.5 py-1 rounded-[9px] text-[11px] font-bold capitalize whitespace-nowrap shrink-0 transition-colors duration-150 ${
              isActive ? 'text-[#14243B]' : 'text-slate-500 hover:text-[#14243B]'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId={`period-pill-${uid}`}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 460, damping: 34 }
                }
                className="absolute inset-0 rounded-[9px] bg-white shadow-xs border border-slate-200/60"
              />
            )}
            <span className="relative z-10">{p}</span>
          </button>
        );
      })}
    </div>
  );
};

interface LineAreaChartProps {
  data: TrendBucket[];
  accentColor?: string;
  secondaryColor?: string;
  showSecondaryLine?: boolean;
  primaryLabel?: string;
  secondaryLabel?: string;
  valueFormatter?: (v: number) => string;
  axisFormatter?: (v: number) => string;
  emptyText: string;
  animationKey?: string;
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
  secondaryColor = '#14243B',
  showSecondaryLine = false,
  primaryLabel = 'Total',
  secondaryLabel = 'Records',
  valueFormatter = (v) => String(v),
  axisFormatter,
  emptyText,
  animationKey,
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const shouldReduceMotion = useReducedMotion();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const yLabelFormatter = axisFormatter || valueFormatter;
  const activeIdx = hoveredIdx !== null ? hoveredIdx : pinnedIdx;

  if (data.length === 0 || total === 0) {
    return (
      <div className="relative h-52 flex flex-col items-center justify-center gap-2.5 rounded-xl bg-gradient-to-b from-slate-50/90 to-slate-100/50 border border-dashed border-slate-200/90 text-xs font-medium text-slate-500 px-5 text-center overflow-hidden">
        <svg
          viewBox="0 0 320 90"
          className="absolute inset-x-0 bottom-0 w-full h-24 opacity-35 pointer-events-none"
          aria-hidden="true"
        >
          <path
            d="M0 72 Q 65 55, 130 62 T 240 44 T 320 52 L 320 90 L 0 90 Z"
            fill={accentColor}
            fillOpacity="0.14"
          />
          <path
            d="M0 72 Q 65 55, 130 62 T 240 44 T 320 52"
            fill="none"
            stroke={accentColor}
            strokeOpacity="0.35"
            strokeDasharray="4 4"
            strokeWidth="1.5"
          />
        </svg>
        <div className="relative z-10 w-9 h-9 rounded-xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-400">
          <BarChart3 className="w-4 h-4" />
        </div>
        <p className="relative z-10 max-w-[235px] leading-relaxed">{emptyText}</p>
      </div>
    );
  }

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
    const sy =
      d.secondaryValue !== undefined
        ? padT + plotH - (Math.min(d.secondaryValue, niceMax) / niceMax) * plotH
        : y;
    return { x, y, sy, item: d };
  });

  const linePath = buildSmoothCurvePath(coords, baselineY);
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${baselineY.toFixed(2)} L ${coords[0].x.toFixed(2)} ${baselineY.toFixed(2)} Z`;

  const secondaryCoords = coords.map((c) => ({ x: c.x, y: c.sy }));
  const secondaryPath = showSecondaryLine ? buildSmoothCurvePath(secondaryCoords, baselineY) : '';

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: padT + plotH - t * plotH,
    label: yLabelFormatter(Math.round(niceMax * t)),
  }));

  const gradId = `admin-grad-${uid}`;
  const glowId = `admin-glow-${uid}`;
  const labelStride = data.length > 10 ? 3 : data.length > 6 ? 2 : 1;
  const animKey = `${animationKey || 'series'}-${data.length}-${total}`;

  return (
    <div className="relative select-none">
      {showSecondaryLine && (
        <div className="flex items-center justify-end gap-3.5 mb-1 px-1 text-[10.5px] font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 rounded-full" style={{ backgroundColor: accentColor }} />
            <span>{primaryLabel}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-3 border-t-2 border-dashed"
              style={{ borderColor: secondaryColor }}
            />
            <span>Active / Done</span>
          </span>
        </div>
      )}

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48 overflow-visible">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.28" />
            <stop offset="65%" stopColor={accentColor} stopOpacity="0.07" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0.0" />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor={accentColor} floodOpacity="0.28" />
          </filter>
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

        <motion.path
          key={`area-${animKey}`}
          d={areaPath}
          fill={`url(#${gradId})`}
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.55, delay: 0.12 }}
        />

        {showSecondaryLine && secondaryPath && (
          <motion.path
            key={`sec-${animKey}`}
            d={secondaryPath}
            fill="none"
            stroke={secondaryColor}
            strokeOpacity="0.55"
            strokeWidth="1.75"
            strokeDasharray="4 3"
            strokeLinecap="round"
            initial={shouldReduceMotion ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.75, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          />
        )}

        <motion.path
          key={`line-${animKey}`}
          d={linePath}
          fill="none"
          stroke={accentColor}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${glowId})`}
          initial={shouldReduceMotion ? false : { pathLength: 0, opacity: 0.3 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        />

        {activeIdx !== null && coords[activeIdx] && (
          <line
            x1={coords[activeIdx].x}
            y1={padT}
            x2={coords[activeIdx].x}
            y2={baselineY}
            stroke={accentColor}
            strokeOpacity="0.4"
            strokeDasharray="3 3"
            strokeWidth="1.25"
          />
        )}

        {coords.map((c, idx) => {
          const showLabel = idx === 0 || idx === data.length - 1 || idx % labelStride === 0;
          const isActive = activeIdx === idx;
          return (
            <g key={c.item.key}>
              {showLabel && (
                <text
                  x={c.x}
                  y={height - 8}
                  textAnchor={idx === 0 ? 'start' : idx === data.length - 1 ? 'end' : 'middle'}
                  className={`text-[10px] font-medium transition-colors ${
                    isActive ? 'fill-[#14243B] font-bold' : 'fill-slate-400'
                  }`}
                >
                  {c.item.label}
                </text>
              )}
              {isActive && (
                <motion.circle
                  cx={c.x}
                  cy={c.y}
                  r={9}
                  fill={accentColor}
                  fillOpacity="0.18"
                  initial={shouldReduceMotion ? false : { scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.18 }}
                />
              )}
              <motion.circle
                cx={c.x}
                cy={c.y}
                r={isActive ? 4.8 : 3}
                fill={isActive ? accentColor : '#FFFFFF'}
                stroke={accentColor}
                strokeWidth={isActive ? 2.4 : 2.1}
                initial={shouldReduceMotion ? false : { scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  duration: 0.28,
                  delay: shouldReduceMotion ? 0 : Math.min(idx * 0.035, 0.45),
                }}
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
                onClick={() => setPinnedIdx((prev) => (prev === idx ? null : idx))}
              />
            </g>
          );
        })}
      </svg>

      <AnimatePresence>
        {activeIdx !== null && coords[activeIdx] && (
          <motion.div
            key={coords[activeIdx].item.key}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: 2, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="pointer-events-none absolute top-1 right-2 px-3 py-2 rounded-xl bg-[#14243B] text-white text-xs shadow-lg border border-white/10 z-10"
          >
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: accentColor }}
              />
              <p className="font-bold text-[11px]">{coords[activeIdx].item.label}</p>
              {pinnedIdx === activeIdx && hoveredIdx === null && (
                <span className="text-[9px] uppercase tracking-wider text-slate-300 font-semibold ml-1">
                  Pinned
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-200 tabular-nums mt-0.5">
              <strong className="text-white">{valueFormatter(coords[activeIdx].item.value)}</strong>
              {coords[activeIdx].item.secondaryValue !== undefined
                ? ` · ${coords[activeIdx].item.secondaryValue} ${secondaryLabel}`
                : ''}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
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
  const shouldReduceMotion = useReducedMotion();
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
          const isHovered = hoveredIdx === idx;
          return (
            <div
              key={bucket.key}
              className="flex-1 flex flex-col items-center justify-end h-full relative group cursor-pointer"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <AnimatePresence>
                {isHovered && (
                  <motion.div
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? undefined : { opacity: 0, y: 2 }}
                    transition={{ duration: 0.12 }}
                    className="absolute -top-7 px-2 py-1 rounded-lg bg-[#14243B] text-white text-[10px] font-bold whitespace-nowrap shadow-md tabular-nums z-10"
                  >
                    {valueFormatter(bucket.value)}
                  </motion.div>
                )}
              </AnimatePresence>
              <motion.div
                className="w-full max-w-[36px] rounded-t-lg transition-colors duration-150"
                initial={shouldReduceMotion ? false : { height: '0%' }}
                animate={{ height: `${pct}%` }}
                transition={{
                  duration: 0.5,
                  delay: shouldReduceMotion ? 0 : idx * 0.035,
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{
                  background: isHovered
                    ? 'linear-gradient(180deg, #E87936 0%, #D96520 100%)'
                    : `linear-gradient(180deg, ${barColor} 0%, #243C60 100%)`,
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

export interface StatusBreakdownItem {
  status: string;
  label: string;
  count: number;
  percentage: number;
}

const STATUS_META: Record<
  string,
  { color: string; softBg: string }
> = {
  confirmed: {
    color: '#2563EB',
    softBg: 'bg-blue-50/80 ring-1 ring-blue-200/70',
  },
  pending: {
    color: '#D97706',
    softBg: 'bg-amber-50/80 ring-1 ring-amber-200/70',
  },
  completed: {
    color: '#059669',
    softBg: 'bg-emerald-50/80 ring-1 ring-emerald-200/70',
  },
  cancelled: {
    color: '#DC2626',
    softBg: 'bg-red-50/80 ring-1 ring-red-200/70',
  },
};

export const AdminStatusDonut: React.FC<{
  items: StatusBreakdownItem[];
  total: number;
  selectedStatus?: string | null;
  onSelectStatus?: (status: string | null) => void;
}> = ({ items, total, selectedStatus, onSelectStatus }) => {
  const shouldReduceMotion = useReducedMotion();
  const [hoveredStatus, setHoveredStatus] = useState<string | null>(null);
  const [internalSelected, setInternalSelected] = useState<string | null>(null);

  const lockedStatus = selectedStatus !== undefined ? selectedStatus : internalSelected;
  const activeStatus = hoveredStatus ?? lockedStatus;

  const toggleStatus = (status: string) => {
    const next = lockedStatus === status ? null : status;
    if (onSelectStatus) {
      onSelectStatus(next);
    } else {
      setInternalSelected(next);
    }
  };

  if (total === 0) {
    return (
      <div className="relative h-52 flex flex-col items-center justify-center gap-2.5 rounded-xl bg-gradient-to-b from-slate-50/90 to-slate-100/50 border border-dashed border-slate-200/90 text-xs font-medium text-slate-500 px-5 text-center overflow-hidden">
        <div className="w-9 h-9 rounded-xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-400">
          <PieChart className="w-4 h-4" />
        </div>
        <p className="max-w-[235px] leading-relaxed">
          No appointments recorded yet to calculate status distribution.
        </p>
      </div>
    );
  }

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  const activeItem = activeStatus ? items.find((i) => i.status === activeStatus) : null;

  return (
    <div className="flex flex-col items-center gap-3.5">
      <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90 overflow-visible">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="15" />
          {items.map((item, idx) => {
            const frac = total > 0 ? item.count / total : 0;
            const dash = frac * circumference;
            const offset = -accumulated * circumference;
            accumulated += frac;
            if (item.count === 0) return null;
            const isActive = activeStatus === item.status;
            const isDimmed = activeStatus !== null && !isActive;
            const color = STATUS_META[item.status]?.color || '#64748B';
            return (
              <motion.circle
                key={item.status}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={isActive ? 19 : 15}
                strokeDashoffset={offset}
                strokeOpacity={isDimmed ? 0.28 : 1}
                initial={
                  shouldReduceMotion
                    ? { strokeDasharray: `${dash} ${circumference}` }
                    : { strokeDasharray: `0 ${circumference}` }
                }
                animate={{ strokeDasharray: `${dash} ${circumference}` }}
                transition={{
                  duration: 0.65,
                  delay: shouldReduceMotion ? 0 : idx * 0.08,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="cursor-pointer transition-[stroke-width,stroke-opacity] duration-150"
                onMouseEnter={() => setHoveredStatus(item.status)}
                onMouseLeave={() => setHoveredStatus(null)}
                onClick={() => toggleStatus(item.status)}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-3">
          <AnimatePresence mode="wait">
            {activeItem ? (
              <motion.div
                key={activeItem.status}
                initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.14 }}
                className="flex flex-col items-center"
              >
                <span
                  className="text-xl font-extrabold tabular-nums leading-none"
                  style={{ color: STATUS_META[activeItem.status]?.color || '#14243B' }}
                >
                  {activeItem.percentage}%
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1 truncate max-w-full">
                  {activeItem.label}
                </span>
              </motion.div>
            ) : (
              <motion.div
                key="total"
                initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.14 }}
                className="flex flex-col items-center"
              >
                <span className="text-2xl font-extrabold text-[#14243B] tabular-nums leading-none">
                  {total}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">
                  Bookings
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="w-full grid grid-cols-1 gap-1.5">
        {items.map((item, idx) => {
          const isActive = activeStatus === item.status;
          const meta = STATUS_META[item.status] || {
            color: '#64748B',
            softBg: 'bg-slate-50 ring-1 ring-slate-200',
          };
          return (
            <button
              key={item.status}
              type="button"
              onMouseEnter={() => setHoveredStatus(item.status)}
              onMouseLeave={() => setHoveredStatus(null)}
              onClick={() => toggleStatus(item.status)}
              className={`w-full text-left space-y-1 rounded-xl px-2.5 py-1.5 transition-all duration-150 ${
                isActive ? meta.softBg : 'hover:bg-slate-50/90'
              }`}
            >
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="flex items-center gap-2 font-semibold text-[#14243B] min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform duration-150"
                    style={{
                      backgroundColor: meta.color,
                      transform: isActive ? 'scale(1.2)' : 'scale(1)',
                    }}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="font-bold text-[#14243B] tabular-nums shrink-0">
                  {item.count}{' '}
                  <span className="text-slate-400 font-medium">({item.percentage}%)</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  initial={shouldReduceMotion ? { width: `${item.percentage}%` } : { width: '0%' }}
                  animate={{ width: `${item.percentage}%` }}
                  transition={{
                    duration: 0.6,
                    delay: shouldReduceMotion ? 0 : idx * 0.06,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  style={{ backgroundColor: meta.color }}
                />
              </div>
            </button>
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
