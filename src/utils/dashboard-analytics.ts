import { Appointment, AppointmentStatus, Service } from '../types/database';
import { timeToMinutes } from './booking-logic';

export type KpiMetricKey = 'total' | 'confirmed' | 'pending' | 'completed' | 'cancelled';

export interface KpiMetricSummary {
  key: KpiMetricKey;
  label: string;
  count: number;
  /** Week-over-week percentage change based on real records, or null when previous period has 0 records */
  deltaPct: number | null;
  /** 7-day daily counts for sparkline rendering */
  sparkline: number[];
}

export interface DailyChartPoint {
  date: string;
  label: string;
  bookings: number;
  revenue: number;
  confirmed: number;
  completed: number;
  cancelled: number;
}

export interface StatusBreakdownItem {
  status: AppointmentStatus;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

export interface ServicePerformanceItem {
  serviceId: string;
  name: string;
  bookings: number;
  revenue: number;
}

export interface WeekDayColumn {
  dateStr: string;
  dayShort: string;
  dateLabel: string;
  isToday: boolean;
  count: number;
}

export interface MonthCalendarCell {
  dateStr: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
}

export interface CalendarEventColorTheme {
  name: string;
  bg: string;
  border: string;
  borderAll: string;
  titleText: string;
  subText: string;
  pill: string;
  dot: string;
  accentHex: string;
  gradientHeader: string;
}

export const CALENDAR_EVENT_THEMES: CalendarEventColorTheme[] = [
  {
    name: 'Sapphire Blue',
    bg: 'bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE]',
    border: 'border-l-[#2563EB]',
    borderAll: 'border-[#93C5FD]/80',
    titleText: 'text-[#1E3A8A]',
    subText: 'text-[#1D4ED8]',
    pill: 'bg-white/85 text-[#1E40AF] border-[#BFDBFE]',
    dot: 'bg-[#2563EB]',
    accentHex: '#2563EB',
    gradientHeader: 'from-blue-500 via-blue-600 to-indigo-600',
  },
  {
    name: 'Emerald Mint',
    bg: 'bg-gradient-to-br from-[#ECFDF5] to-[#D1FAE5]',
    border: 'border-l-[#059669]',
    borderAll: 'border-[#6EE7B7]/80',
    titleText: 'text-[#064E3B]',
    subText: 'text-[#047857]',
    pill: 'bg-white/85 text-[#065F46] border-[#A7F3D0]',
    dot: 'bg-[#059669]',
    accentHex: '#059669',
    gradientHeader: 'from-emerald-500 via-emerald-600 to-teal-600',
  },
  {
    name: 'Tangerine Orange',
    bg: 'bg-gradient-to-br from-[#FFF7ED] to-[#FFEDD5]',
    border: 'border-l-[#EA580C]',
    borderAll: 'border-[#FDBA74]/85',
    titleText: 'text-[#7C2D12]',
    subText: 'text-[#C2410C]',
    pill: 'bg-white/85 text-[#9A3412] border-[#FED7AA]',
    dot: 'bg-[#EA580C]',
    accentHex: '#EA580C',
    gradientHeader: 'from-orange-500 via-orange-600 to-amber-500',
  },
  {
    name: 'Royal Violet',
    bg: 'bg-gradient-to-br from-[#F5F3FF] to-[#EDE9FE]',
    border: 'border-l-[#7C3AED]',
    borderAll: 'border-[#C4B5FD]/85',
    titleText: 'text-[#4C1D95]',
    subText: 'text-[#6D28D9]',
    pill: 'bg-white/85 text-[#5B21B6] border-[#DDD6FE]',
    dot: 'bg-[#7C3AED]',
    accentHex: '#7C3AED',
    gradientHeader: 'from-violet-500 via-violet-600 to-purple-600',
  },
  {
    name: 'Rose Coral',
    bg: 'bg-gradient-to-br from-[#FFF1F2] to-[#FFE4E6]',
    border: 'border-l-[#E11D48]',
    borderAll: 'border-[#FDA4AF]/85',
    titleText: 'text-[#881337]',
    subText: 'text-[#BE123C]',
    pill: 'bg-white/85 text-[#9F1239] border-[#FECDD3]',
    dot: 'bg-[#E11D48]',
    accentHex: '#E11D48',
    gradientHeader: 'from-rose-500 via-rose-600 to-pink-600',
  },
  {
    name: 'Teal Lagoon',
    bg: 'bg-gradient-to-br from-[#F0FDFA] to-[#CCFBF1]',
    border: 'border-l-[#0D9488]',
    borderAll: 'border-[#5EEAD4]/85',
    titleText: 'text-[#134E4A]',
    subText: 'text-[#0F766E]',
    pill: 'bg-white/85 text-[#115E59] border-[#99F6E4]',
    dot: 'bg-[#0D9488]',
    accentHex: '#0D9488',
    gradientHeader: 'from-teal-500 via-teal-600 to-cyan-600',
  },
  {
    name: 'Golden Amber',
    bg: 'bg-gradient-to-br from-[#FFFBEB] to-[#FEF3C7]',
    border: 'border-l-[#D97706]',
    borderAll: 'border-[#FCD34D]/90',
    titleText: 'text-[#78350F]',
    subText: 'text-[#B45309]',
    pill: 'bg-white/85 text-[#92400E] border-[#FDE68A]',
    dot: 'bg-[#D97706]',
    accentHex: '#D97706',
    gradientHeader: 'from-amber-500 via-amber-600 to-orange-500',
  },
  {
    name: 'Deep Indigo',
    bg: 'bg-gradient-to-br from-[#EEF2FF] to-[#E0E7FF]',
    border: 'border-l-[#4F46E5]',
    borderAll: 'border-[#A5B4FC]/85',
    titleText: 'text-[#312E81]',
    subText: 'text-[#4338CA]',
    pill: 'bg-white/85 text-[#3730A3] border-[#C7D2FE]',
    dot: 'bg-[#4F46E5]',
    accentHex: '#4F46E5',
    gradientHeader: 'from-indigo-500 via-indigo-600 to-blue-700',
  },
  {
    name: 'Magenta Fuchsia',
    bg: 'bg-gradient-to-br from-[#FDF4FF] to-[#FAE8FF]',
    border: 'border-l-[#C026D3]',
    borderAll: 'border-[#F0ABFC]/85',
    titleText: 'text-[#701A75]',
    subText: 'text-[#A21CAF]',
    pill: 'bg-white/85 text-[#86198F] border-[#F5D0FE]',
    dot: 'bg-[#C026D3]',
    accentHex: '#C026D3',
    gradientHeader: 'from-fuchsia-500 via-fuchsia-600 to-purple-600',
  },
  {
    name: 'Sky Azure',
    bg: 'bg-gradient-to-br from-[#F0F9FF] to-[#E0F2FE]',
    border: 'border-l-[#0284C7]',
    borderAll: 'border-[#7DD3FC]/85',
    titleText: 'text-[#0C4A6E]',
    subText: 'text-[#0369A1]',
    pill: 'bg-white/85 text-[#075985] border-[#BAE6FD]',
    dot: 'bg-[#0284C7]',
    accentHex: '#0284C7',
    gradientHeader: 'from-sky-500 via-sky-600 to-blue-600',
  },
  {
    name: 'Berry Pink',
    bg: 'bg-gradient-to-br from-[#FDF2F8] to-[#FCE7F3]',
    border: 'border-l-[#DB2777]',
    borderAll: 'border-[#F9A8D4]/85',
    titleText: 'text-[#831843]',
    subText: 'text-[#BE185D]',
    pill: 'bg-white/85 text-[#9D174D] border-[#FBCFE8]',
    dot: 'bg-[#DB2777]',
    accentHex: '#DB2777',
    gradientHeader: 'from-pink-500 via-pink-600 to-rose-500',
  },
  {
    name: 'Cyan Aqua',
    bg: 'bg-gradient-to-br from-[#ECFEFF] to-[#CFFAFE]',
    border: 'border-l-[#0891B2]',
    borderAll: 'border-[#67E8F9]/85',
    titleText: 'text-[#164E63]',
    subText: 'text-[#0E7490]',
    pill: 'bg-white/85 text-[#155E75] border-[#A5F3FC]',
    dot: 'bg-[#0891B2]',
    accentHex: '#0891B2',
    gradientHeader: 'from-cyan-500 via-cyan-600 to-teal-600',
  },
];

export function hashCalendarSeed(seedStr: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    hash ^= seedStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export function getCalendarThemeBySeed(seedStr: string): CalendarEventColorTheme {
  const hash = hashCalendarSeed(seedStr || 'default');
  return CALENDAR_EVENT_THEMES[hash % CALENDAR_EVENT_THEMES.length];
}

export function getAppointmentThemeSeed(appointment: Pick<Appointment, 'id' | 'customer_name' | 'customer_phone' | 'service_id' | 'appointment_time'>): string {
  return appointment.id
    ? `${appointment.id}:${appointment.customer_name || ''}:${appointment.service_id || ''}`
    : `${appointment.customer_name || ''}:${appointment.customer_phone || ''}:${appointment.service_id || ''}:${appointment.appointment_time || ''}`;
}

/**
 * Assigns distinct, non-colliding color themes across same-day appointments (cycling cleanly up to 12 distinct colors per day).
 */
export function buildDayColorMap<T extends Pick<Appointment, 'id' | 'customer_name' | 'customer_phone' | 'service_id' | 'appointment_time'>>(
  dayAppointments: T[]
): Map<string, CalendarEventColorTheme> {
  const map = new Map<string, CalendarEventColorTheme>();
  const usedIndices = new Set<number>();
  const sorted = [...dayAppointments].sort((a, b) =>
    (a.appointment_time || '').localeCompare(b.appointment_time || '') ||
    (a.id || '').localeCompare(b.id || '')
  );

  for (const appt of sorted) {
    const seed = getAppointmentThemeSeed(appt);
    let idx = hashCalendarSeed(seed) % CALENDAR_EVENT_THEMES.length;
    if (usedIndices.size < CALENDAR_EVENT_THEMES.length) {
      let guard = 0;
      while (usedIndices.has(idx) && guard < CALENDAR_EVENT_THEMES.length) {
        idx = (idx + 1) % CALENDAR_EVENT_THEMES.length;
        guard += 1;
      }
      usedIndices.add(idx);
    }
    const key = appt.id || seed;
    map.set(key, CALENDAR_EVENT_THEMES[idx]);
  }
  return map;
}

export function toIsoDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(date: Date, delta: number): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + delta);
  return copy;
}

export function parseIsoDateLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y || 2026, (m || 1) - 1, d || 1);
}

/**
 * Computes the 5 core appointment KPIs + real 7-day sparklines + real week-over-week deltas.
 */
export function computeAppointmentKpis(
  appointments: Appointment[],
  referenceDate: Date = new Date()
): KpiMetricSummary[] {
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());

  const last7Dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    last7Dates.push(toIsoDateStr(addDays(today, -i)));
  }

  const prev7Set = new Set<string>();
  for (let i = 13; i >= 7; i--) {
    prev7Set.add(toIsoDateStr(addDays(today, -i)));
  }
  const last7Set = new Set(last7Dates);

  const defs: { key: KpiMetricKey; label: string; predicate: (a: Appointment) => boolean }[] = [
    { key: 'total', label: 'Total Appointments', predicate: () => true },
    { key: 'confirmed', label: 'Confirmed', predicate: (a) => a.status === 'confirmed' },
    { key: 'pending', label: 'Pending', predicate: (a) => a.status === 'pending' },
    { key: 'completed', label: 'Completed', predicate: (a) => a.status === 'completed' },
    { key: 'cancelled', label: 'Cancelled', predicate: (a) => a.status === 'cancelled' },
  ];

  return defs.map((def) => {
    const matching = appointments.filter(def.predicate);
    const current7Count = matching.filter((a) => last7Set.has(a.appointment_date)).length;
    const prev7Count = matching.filter((a) => prev7Set.has(a.appointment_date)).length;

    let sparklineDates = last7Dates;
    if (current7Count === 0 && matching.length > 0) {
      const latestDateStr = matching
        .map((a) => a.appointment_date)
        .filter(Boolean)
        .sort()
        .pop();
      if (latestDateStr) {
        const latestAnchor = parseIsoDateLocal(latestDateStr);
        sparklineDates = Array.from({ length: 7 }, (_, idx) =>
          toIsoDateStr(addDays(latestAnchor, idx - 6))
        );
      }
    }

    const sparkline = sparklineDates.map(
      (ds) => matching.filter((a) => a.appointment_date === ds).length
    );

    const deltaPct =
      prev7Count > 0 ? Math.round(((current7Count - prev7Count) / prev7Count) * 100) : null;

    return {
      key: def.key,
      label: def.label,
      count: matching.length,
      deltaPct,
      sparkline,
    };
  });
}

/**
 * Generates an SVG sparkline path, area path, and terminal point normalized cleanly for a viewBox.
 */
export function buildSparklineSvgPaths(
  values: number[],
  width: number = 96,
  height: number = 34,
  paddingY: number = 4
): { linePath: string; areaPath: string; lastPoint: { x: number; y: number } } {
  const safeValues = values.length > 1 ? values : [0, values[0] ?? 0];
  const max = Math.max(...safeValues, 0);
  const min = Math.min(...safeValues, 0);
  const span = max - min;

  const usableH = Math.max(height - paddingY * 2, 4);
  const stepX = width / (safeValues.length - 1);

  const points = safeValues.map((v, i) => {
    const x = Number((i * stepX).toFixed(2));
    const norm = span === 0 ? (max === 0 ? 0 : 0.5) : (v - min) / span;
    const y = Number((height - paddingY - norm * usableH).toFixed(2));
    return { x, y };
  });

  // Smooth cubic bezier curve
  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cx = Number(((p0.x + p1.x) / 2).toFixed(2));
    linePath += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  const last = points[points.length - 1];
  const areaPath = `${linePath} L ${last.x} ${height} L ${points[0].x} ${height} Z`;
  return { linePath, areaPath, lastPoint: last };
}

/**
 * Computes real-data chart series for Bookings/Revenue over time, Status breakdown, and Service breakdown.
 */
export function computeDashboardCharts(
  appointments: Appointment[],
  services: Service[],
  rangeDays: 7 | 30 | 'all' = 7,
  referenceDate: Date = new Date()
): {
  dailySeries: DailyChartPoint[];
  statusBreakdown: StatusBreakdownItem[];
  servicePerformance: ServicePerformanceItem[];
} {
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());

  let dateBuckets: string[] = [];
  if (rangeDays === 'all') {
    const distinctDates = Array.from(new Set(appointments.map((a) => a.appointment_date))).sort();
    dateBuckets = distinctDates.slice(-14);
  } else {
    for (let i = rangeDays - 1; i >= 0; i--) {
      dateBuckets.push(toIsoDateStr(addDays(today, -i)));
    }
  }

  const dailySeries: DailyChartPoint[] = dateBuckets.map((ds) => {
    const dayAppts = appointments.filter((a) => a.appointment_date === ds);
    const d = parseIsoDateLocal(ds);
    return {
      date: ds,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      bookings: dayAppts.length,
      revenue: dayAppts.reduce((sum, a) => sum + Number(a.payment_received || 0), 0),
      confirmed: dayAppts.filter((a) => a.status === 'confirmed').length,
      completed: dayAppts.filter((a) => a.status === 'completed').length,
      cancelled: dayAppts.filter((a) => a.status === 'cancelled').length,
    };
  });

  const total = appointments.length;
  const statusDefs: { status: AppointmentStatus; label: string; color: string }[] = [
    { status: 'confirmed', label: 'Confirmed', color: '#2563EB' },
    { status: 'pending', label: 'Pending', color: '#D97706' },
    { status: 'completed', label: 'Completed', color: '#16A34A' },
    { status: 'cancelled', label: 'Cancelled', color: '#DC2626' },
  ];

  const statusBreakdown: StatusBreakdownItem[] = statusDefs.map((s) => {
    const count = appointments.filter((a) => a.status === s.status).length;
    return {
      status: s.status,
      label: s.label,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      color: s.color,
    };
  });

  // Aggregate by service
  const svcMap = new Map<string, ServicePerformanceItem>();
  services.forEach((svc) => {
    svcMap.set(svc.id, {
      serviceId: svc.id,
      name: svc.name,
      bookings: 0,
      revenue: 0,
    });
  });

  appointments.forEach((appt) => {
    const sid = appt.service_id || 'unknown';
    const existing = svcMap.get(sid) || {
      serviceId: sid,
      name: appt.service?.name || 'Service',
      bookings: 0,
      revenue: 0,
    };
    existing.bookings += 1;
    existing.revenue += Number(appt.payment_received || 0);
    svcMap.set(sid, existing);
  });

  const servicePerformance = Array.from(svcMap.values())
    .filter((s) => s.bookings > 0)
    .sort((a, b) => b.bookings - a.bookings || b.revenue - a.revenue);

  return {
    dailySeries,
    statusBreakdown,
    servicePerformance,
  };
}

/**
 * Returns the Monday-Sunday 7 columns for the week containing anchorDate.
 */
export function getWeekDays(
  anchorDateStr: string,
  appointments: Appointment[] = [],
  todayDate: Date = new Date()
): WeekDayColumn[] {
  const anchor = parseIsoDateLocal(anchorDateStr);
  // JS getDay(): Sun=0, Mon=1..Sat=6 -> shift so Mon=0..Sun=6
  const mondayOffset = (anchor.getDay() + 6) % 7;
  const monday = addDays(anchor, -mondayOffset);
  const todayStr = toIsoDateStr(todayDate);

  return Array.from({ length: 7 }).map((_, i) => {
    const d = addDays(monday, i);
    const dateStr = toIsoDateStr(d);
    const count = appointments.filter(
      (a) => a.appointment_date === dateStr && a.status !== 'cancelled'
    ).length;

    return {
      dateStr,
      dayShort: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      isToday: dateStr === todayStr,
      count,
    };
  });
}

/**
 * Generates a complete Sun-Sat monthly calendar grid (35 or 42 cells)
 * including leading/trailing days from adjacent months.
 */
export function getMonthCalendarGrid(
  year: number,
  monthIndex: number,
  todayDate: Date = new Date()
): MonthCalendarCell[] {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const lastOfMonth = new Date(year, monthIndex + 1, 0);
  const startOffset = firstOfMonth.getDay(); // 0=Sun..6=Sat
  const daysInMonth = lastOfMonth.getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const gridStart = addDays(firstOfMonth, -startOffset);
  const todayStr = toIsoDateStr(todayDate);

  return Array.from({ length: totalCells }).map((_, idx) => {
    const d = addDays(gridStart, idx);
    const dateStr = toIsoDateStr(d);
    const dow = d.getDay();
    return {
      dateStr,
      dayNumber: d.getDate(),
      isCurrentMonth: d.getMonth() === monthIndex && d.getFullYear() === year,
      isToday: dateStr === todayStr,
      isWeekend: dow === 0 || dow === 6,
    };
  });
}

export function formatShortDateRange(startStr: string, endStr: string): string {
  const start = parseIsoDateLocal(startStr);
  const end = parseIsoDateLocal(endStr);

  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const endYear = end.getFullYear();

  if (start.getFullYear() === end.getFullYear() && startMonth === endMonth) {
    return `${startMonth} ${startDay} – ${endDay}, ${endYear}`;
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${endYear}`;
  }
  return `${startMonth} ${startDay}, ${start.getFullYear()} – ${endMonth} ${endDay}, ${endYear}`;
}

export function formatTime12h(timeStr: string): string {
  const [hRaw, mRaw] = (timeStr || '09:00').split(':');
  const h = Number(hRaw || 0);
  const m = Number(mRaw || 0);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatTimeRange12h(startTime: string, endTime: string): string {
  return `${formatTime12h(startTime)} – ${formatTime12h(endTime)}`;
}

/**
 * Computes vertical placement inside an hourly calendar grid (e.g. 08:00 to 18:00).
 */
export function computeCalendarEventLayout(
  appointment: Appointment,
  startHour: number = 8,
  endHour: number = 18
): { topPct: number; heightPct: number; theme: CalendarEventColorTheme } {
  const gridStartMin = startHour * 60;
  const gridEndMin = endHour * 60;
  const totalSpan = Math.max(gridEndMin - gridStartMin, 60);

  const apptStart = timeToMinutes(appointment.appointment_time || '09:00');
  const durationFallback = appointment.service?.duration_minutes || 60;
  const apptEndRaw = appointment.end_time
    ? timeToMinutes(appointment.end_time)
    : apptStart + durationFallback;
  const apptEnd = Math.max(apptEndRaw, apptStart + 30);

  const clampedStart = Math.max(gridStartMin, Math.min(apptStart, gridEndMin - 30));
  const clampedEnd = Math.min(gridEndMin, Math.max(apptEnd, clampedStart + 30));

  const topPct = ((clampedStart - gridStartMin) / totalSpan) * 100;
  const heightPct = Math.max(((clampedEnd - clampedStart) / totalSpan) * 100, 6);

  const theme = getCalendarThemeBySeed(getAppointmentThemeSeed(appointment));

  return { topPct, heightPct, theme };
}

export interface PositionedCalendarEvent {
  appointment: Appointment;
  topPct: number;
  heightPct: number;
  leftPct: number;
  widthPct: number;
  theme: CalendarEventColorTheme;
}

/**
 * Packs same-day appointments into side-by-side lanes when their times overlap,
 * and assigns distinct, non-colliding vibrant colors for every booking on that day.
 */
export function assignDayEventColumns(
  dayAppointments: Appointment[],
  startHour: number = 8,
  endHour: number = 18
): PositionedCalendarEvent[] {
  if (dayAppointments.length === 0) return [];

  const dayColorMap = buildDayColorMap(dayAppointments);

  const items = dayAppointments
    .map((appt) => {
      const startMin = timeToMinutes(appt.appointment_time || '09:00');
      const fallbackDur = appt.service?.duration_minutes || 60;
      const endMinRaw = appt.end_time ? timeToMinutes(appt.end_time) : startMin + fallbackDur;
      const endMin = Math.max(endMinRaw, startMin + 30);
      return { appt, startMin, endMin };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  // Build connected overlap clusters
  const clusters: typeof items[] = [];
  let currentCluster: typeof items = [];
  let clusterMaxEnd = -1;

  for (const item of items) {
    if (currentCluster.length === 0 || item.startMin < clusterMaxEnd) {
      currentCluster.push(item);
      clusterMaxEnd = Math.max(clusterMaxEnd, item.endMin);
    } else {
      clusters.push(currentCluster);
      currentCluster = [item];
      clusterMaxEnd = item.endMin;
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster);

  const results: PositionedCalendarEvent[] = [];

  for (const cluster of clusters) {
    const laneEnds: number[] = [];
    const assigned: { item: (typeof items)[number]; col: number }[] = [];

    for (const item of cluster) {
      let placedCol = laneEnds.findIndex((end) => end <= item.startMin);
      if (placedCol === -1) {
        placedCol = laneEnds.length;
        laneEnds.push(item.endMin);
      } else {
        laneEnds[placedCol] = item.endMin;
      }
      assigned.push({ item, col: placedCol });
    }

    const totalCols = Math.max(laneEnds.length, 1);
    const widthPct = 100 / totalCols;

    for (const { item, col } of assigned) {
      const base = computeCalendarEventLayout(item.appt, startHour, endHour);
      const distinctTheme =
        dayColorMap.get(item.appt.id || getAppointmentThemeSeed(item.appt)) || base.theme;
      results.push({
        appointment: item.appt,
        topPct: base.topPct,
        heightPct: base.heightPct,
        leftPct: col * widthPct,
        widthPct,
        theme: distinctTheme,
      });
    }
  }

  return results;
}

