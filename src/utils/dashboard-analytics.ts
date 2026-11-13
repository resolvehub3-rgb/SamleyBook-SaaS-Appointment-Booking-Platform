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

export interface CalendarEventColorTheme {
  bg: string;
  border: string;
  titleText: string;
  subText: string;
}

export const CALENDAR_EVENT_THEMES: CalendarEventColorTheme[] = [
  {
    bg: 'bg-[#DBEAFE]',
    border: 'border-l-[#3B82F6]',
    titleText: 'text-[#1E3A8A]',
    subText: 'text-[#1D4ED8]',
  },
  {
    bg: 'bg-[#DCFCE7]',
    border: 'border-l-[#22C55E]',
    titleText: 'text-[#14532D]',
    subText: 'text-[#15803D]',
  },
  {
    bg: 'bg-[#FED7AA]/85',
    border: 'border-l-[#F97316]',
    titleText: 'text-[#7C2D12]',
    subText: 'text-[#9A3412]',
  },
  {
    bg: 'bg-[#EDE9FE]',
    border: 'border-l-[#8B5CF6]',
    titleText: 'text-[#4C1D95]',
    subText: 'text-[#6D28D9]',
  },
  {
    bg: 'bg-[#FCE7F3]',
    border: 'border-l-[#EC4899]',
    titleText: 'text-[#831843]',
    subText: 'text-[#BE185D]',
  },
  {
    bg: 'bg-[#CCFBF1]',
    border: 'border-l-[#14B8A6]',
    titleText: 'text-[#134E4A]',
    subText: 'text-[#0F766E]',
  },
];

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
    const sparkline = last7Dates.map(
      (ds) => matching.filter((a) => a.appointment_date === ds).length
    );
    const current7Count = matching.filter((a) => last7Set.has(a.appointment_date)).length;
    const prev7Count = matching.filter((a) => prev7Set.has(a.appointment_date)).length;

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
 * Generates an SVG sparkline path & area path normalized cleanly for a viewBox.
 */
export function buildSparklineSvgPaths(
  values: number[],
  width: number = 96,
  height: number = 34,
  paddingY: number = 4
): { linePath: string; areaPath: string } {
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
  return { linePath, areaPath };
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

  // Deterministic theme based on service_id or customer_name hash so different services stand out cleanly
  const seedStr = appointment.service_id || appointment.service?.name || appointment.id;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  const theme = CALENDAR_EVENT_THEMES[hash % CALENDAR_EVENT_THEMES.length];

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
 * Packs same-day appointments into side-by-side lanes when their times overlap.
 */
export function assignDayEventColumns(
  dayAppointments: Appointment[],
  startHour: number = 8,
  endHour: number = 18
): PositionedCalendarEvent[] {
  if (dayAppointments.length === 0) return [];

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
      results.push({
        appointment: item.appt,
        topPct: base.topPct,
        heightPct: base.heightPct,
        leftPct: col * widthPct,
        widthPct,
        theme: base.theme,
      });
    }
  }

  return results;
}

