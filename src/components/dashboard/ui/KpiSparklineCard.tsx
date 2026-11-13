import React, { useId } from 'react';
import { Calendar, Check, Clock, X, ArrowUp, ArrowDown, LucideIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { buildSparklineSvgPaths, KpiMetricSummary } from '../../../utils/dashboard-analytics';
import { KPI_CARD_THEMES } from './DashboardTokens';

interface Props {
  metric: KpiMetricSummary;
  active?: boolean;
  onClick?: () => void;
  totalCount?: number;
}

const ICON_MAP: Record<KpiMetricSummary['key'], LucideIcon> = {
  total: Calendar,
  confirmed: Check,
  pending: Clock,
  completed: Check,
  cancelled: X,
};

export const KpiSparklineCard: React.FC<Props> = ({
  metric,
  active = false,
  onClick,
  totalCount,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const gradId = useId();
  const theme = KPI_CARD_THEMES[metric.key];
  const Icon = ICON_MAP[metric.key];
  const { linePath, areaPath } = buildSparklineSvgPaths(metric.sparkline, 96, 34, 4);

  // Format real delta percentage or real share of total when no previous 7-day baseline exists
  const shareOfTotal =
    totalCount && totalCount > 0 && metric.key !== 'total'
      ? Math.round((metric.count / totalCount) * 100)
      : null;

  const isNegative = metric.deltaPct !== null && metric.deltaPct < 0;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={shouldReduceMotion ? undefined : { y: -2 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
      transition={{ duration: 0.16 }}
      className={`w-full text-left rounded-2xl border px-4 py-3.5 transition-shadow relative overflow-hidden ${
        theme.cardBg
      } ${theme.border} ${
        active
          ? 'ring-2 ring-[#F95700] shadow-md'
          : 'shadow-[0_2px_8px_rgba(15,23,42,0.03)] hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${theme.iconBg}`}
          >
            <Icon className="w-4 h-4 stroke-[2.5]" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-slate-700 truncate">
              {metric.label}
            </p>
            <p className="text-[26px] font-extrabold text-[#111827] leading-tight tracking-tight mt-0.5">
              {metric.count}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div className="flex items-center gap-1 text-[11px] font-bold">
          {metric.deltaPct !== null ? (
            <span
              className={`inline-flex items-center gap-0.5 ${
                isNegative ? 'text-[#DC2626]' : theme.deltaPositive
              }`}
            >
              {isNegative ? (
                <ArrowDown className="w-3 h-3 stroke-[2.5]" />
              ) : (
                <ArrowUp className="w-3 h-3 stroke-[2.5]" />
              )}
              <span>
                {metric.deltaPct >= 0 ? `+${metric.deltaPct}%` : `${metric.deltaPct}%`}
              </span>
            </span>
          ) : shareOfTotal !== null ? (
            <span className={theme.deltaPositive}>{shareOfTotal}% of total</span>
          ) : (
            <span className="text-slate-500 font-semibold">
              {metric.count === 0 ? 'No records' : '7-day live'}
            </span>
          )}
        </div>

        {/* Real-data Sparkline SVG */}
        <svg
          viewBox="0 0 96 34"
          className="w-24 h-8 shrink-0 overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.stroke} stopOpacity="0.28" />
              <stop offset="100%" stopColor={theme.stroke} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradId})`} />
          <path
            d={linePath}
            fill="none"
            stroke={theme.stroke}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </motion.button>
  );
};
