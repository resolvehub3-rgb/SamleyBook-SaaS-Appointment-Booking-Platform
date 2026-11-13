import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAppointmentKpis,
  buildSparklineSvgPaths,
  computeDashboardCharts,
  getWeekDays,
  formatShortDateRange,
  formatTime12h,
  computeCalendarEventLayout,
  assignDayEventColumns,
} from './dashboard-analytics';
import { Appointment, Service } from '../types/database';

function makeAppt(overrides: Partial<Appointment>): Appointment {
  return {
    id: 'appt-1',
    business_id: 'biz-1',
    service_id: 'svc-1',
    customer_name: 'Albert',
    customer_phone: '0594345678',
    appointment_date: '2026-11-12',
    appointment_time: '09:00',
    end_time: '10:00',
    status: 'confirmed',
    payment_status: 'paid',
    service_price: 50,
    payment_required: 50,
    payment_received: 50,
    created_at: '2026-11-10T10:00:00Z',
    updated_at: '2026-11-10T10:00:00Z',
    ...overrides,
  };
}

test('computeAppointmentKpis: calculates real counts, sparklines, and deltas without mock numbers', () => {
  const ref = new Date(2026, 10, 12); // Nov 12, 2026
  const appts: Appointment[] = [
    makeAppt({ id: '1', status: 'confirmed', appointment_date: '2026-11-12' }),
    makeAppt({ id: '2', status: 'confirmed', appointment_date: '2026-11-11' }),
    makeAppt({ id: '3', status: 'pending', appointment_date: '2026-11-12' }),
    makeAppt({ id: '4', status: 'completed', appointment_date: '2026-11-10' }),
    makeAppt({ id: '5', status: 'cancelled', appointment_date: '2026-11-04' }), // prev 7 days
  ];

  const kpis = computeAppointmentKpis(appts, ref);
  assert.equal(kpis.length, 5);

  const total = kpis.find((k) => k.key === 'total')!;
  assert.equal(total.count, 5);
  // 4 in last 7 days vs 1 in prev 7 days -> +300%
  assert.equal(total.deltaPct, 300);
  assert.equal(total.sparkline.length, 7);
  // Nov 12 is index 6 (2 appts: id 1 and 3)
  assert.equal(total.sparkline[6], 2);

  // Empty appointments yields all zeros and null deltaPct
  const emptyKpis = computeAppointmentKpis([], ref);
  assert.equal(emptyKpis[0].count, 0);
  assert.equal(emptyKpis[0].deltaPct, null);
  assert.deepEqual(emptyKpis[0].sparkline, [0, 0, 0, 0, 0, 0, 0]);
});

test('buildSparklineSvgPaths: returns valid SVG line and area paths for zero and non-zero series', () => {
  const zeroPaths = buildSparklineSvgPaths([0, 0, 0, 0, 0, 0, 0]);
  assert.ok(zeroPaths.linePath.startsWith('M 0 '));
  assert.ok(zeroPaths.areaPath.endsWith('Z'));

  const dataPaths = buildSparklineSvgPaths([1, 3, 2, 5, 4, 6, 8]);
  assert.ok(dataPaths.linePath.includes('C '));
  assert.ok(dataPaths.areaPath.endsWith('Z'));
});

test('computeDashboardCharts: computes daily series, status breakdown, and service performance from real records', () => {
  const ref = new Date(2026, 10, 12);
  const services: Service[] = [
    {
      id: 'svc-1',
      business_id: 'biz-1',
      name: 'Haircut',
      price: 50,
      duration_minutes: 60,
      is_active: true,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'svc-2',
      business_id: 'biz-1',
      name: 'Pedicure',
      price: 80,
      duration_minutes: 60,
      is_active: true,
      created_at: '',
      updated_at: '',
    },
  ];
  const appts: Appointment[] = [
    makeAppt({ id: '1', service_id: 'svc-1', status: 'confirmed', payment_received: 50, appointment_date: '2026-11-12' }),
    makeAppt({ id: '2', service_id: 'svc-2', status: 'completed', payment_received: 80, appointment_date: '2026-11-12' }),
  ];

  const charts = computeDashboardCharts(appts, services, 7, ref);
  assert.equal(charts.dailySeries.length, 7);
  assert.equal(charts.dailySeries[6].bookings, 2);
  assert.equal(charts.dailySeries[6].revenue, 130);

  const confirmedStatus = charts.statusBreakdown.find((s) => s.status === 'confirmed')!;
  assert.equal(confirmedStatus.percentage, 50);
  assert.equal(charts.servicePerformance.length, 2);
});

test('getWeekDays & formatShortDateRange: builds Mon-Sun columns and marks today accurately', () => {
  const today = new Date(2026, 10, 12); // Thu Nov 12, 2026
  const appts = [
    makeAppt({ id: '1', appointment_date: '2026-11-12', status: 'confirmed' }),
    makeAppt({ id: '2', appointment_date: '2026-11-12', status: 'cancelled' }), // excluded from active day count
  ];
  const cols = getWeekDays('2026-11-12', appts, today);
  assert.equal(cols.length, 7);
  assert.equal(cols[0].dayShort, 'Mon');
  assert.equal(cols[0].dateStr, '2026-11-09');
  assert.equal(cols[3].dayShort, 'Thu');
  assert.equal(cols[3].isToday, true);
  assert.equal(cols[3].count, 1);
  assert.equal(cols[6].dayShort, 'Sun');
  assert.equal(cols[6].dateStr, '2026-11-15');

  assert.equal(formatShortDateRange(cols[0].dateStr, cols[6].dateStr), 'Nov 9 – 15, 2026');
});

test('computeCalendarEventLayout & assignDayEventColumns: splits overlapping same-day appointments into side-by-side columns', () => {
  assert.equal(formatTime12h('08:30'), '8:30 AM');
  assert.equal(formatTime12h('13:00'), '1:00 PM');

  // 08:00 to 18:00 is 10 hours (600 min). 13:00-14:00 is 50% top, 10% height.
  const layout = computeCalendarEventLayout(
    makeAppt({ appointment_time: '13:00', end_time: '14:00' }),
    8,
    18
  );
  assert.equal(layout.topPct, 50);
  assert.equal(layout.heightPct, 10);

  const positioned = assignDayEventColumns([
    makeAppt({ id: 'a1', appointment_time: '08:30', end_time: '09:30' }),
    makeAppt({ id: 'a2', appointment_time: '09:00', end_time: '10:00' }),
    makeAppt({ id: 'a3', appointment_time: '13:00', end_time: '14:00' }),
  ]);
  assert.equal(positioned.length, 3);
  assert.equal(positioned[0].widthPct, 50);
  assert.equal(positioned[0].leftPct, 0);
  assert.equal(positioned[1].widthPct, 50);
  assert.equal(positioned[1].leftPct, 50);
  assert.equal(positioned[2].widthPct, 100);
});
