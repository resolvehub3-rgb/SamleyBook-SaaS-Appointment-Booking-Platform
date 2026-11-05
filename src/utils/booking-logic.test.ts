import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRequiredPayment,
  formatGHS,
  calculateEndTime,
  generateAvailableSlots,
  calculateTrialRemainingDays,
  isValidGhanaPhone,
  generateBusinessSlug,
  OperatingHoursMap,
} from './booking-logic';

test('calculateRequiredPayment: full payment requires 100% price', () => {
  assert.equal(calculateRequiredPayment(150, 'full'), 150);
  assert.equal(calculateRequiredPayment(250.5, 'full'), 250.5);
});

test('calculateRequiredPayment: percentage deposit calculates correctly', () => {
  // 50% of 200 = 100
  assert.equal(calculateRequiredPayment(200, 'deposit', 'percentage', 50), 100);
  // 30% of 150 = 45
  assert.equal(calculateRequiredPayment(150, 'deposit', 'percentage', 30), 45);
  // clamped at 100%
  assert.equal(calculateRequiredPayment(100, 'deposit', 'percentage', 150), 100);
});

test('calculateRequiredPayment: fixed deposit calculates correctly and caps at price', () => {
  assert.equal(calculateRequiredPayment(200, 'deposit', 'fixed', 0, 50), 50);
  // Fixed deposit higher than service price caps at service price
  assert.equal(calculateRequiredPayment(80, 'deposit', 'fixed', 0, 100), 80);
});

test('formatGHS: formats amount properly', () => {
  assert.equal(formatGHS(150), 'GHS 150.00');
  assert.equal(formatGHS(0), 'GHS 0.00');
  assert.equal(formatGHS(null), 'GHS 0.00');
});

test('calculateEndTime: adds duration in minutes', () => {
  assert.equal(calculateEndTime('09:00', 45), '09:45');
  assert.equal(calculateEndTime('11:30', 60), '12:30');
  assert.equal(calculateEndTime('14:45', 30), '15:15');
});

test('generateAvailableSlots: generates non-conflicting time slots', () => {
  const operatingHours: OperatingHoursMap = {
    monday: { open: '09:00', close: '12:00', isOpen: true },
    sunday: { open: '10:00', close: '14:00', isOpen: false },
  };

  // With no bookings: 09:00, 09:30, 10:00, 10:30, 11:00, 11:30 (for 30 min duration up to 12:00)
  const slotsNoBookings = generateAvailableSlots(
    '2026-11-09',
    'monday',
    operatingHours,
    30,
    []
  );
  assert.deepEqual(slotsNoBookings, ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30']);

  // Sunday is closed
  const slotsSunday = generateAvailableSlots(
    '2026-11-08',
    'sunday',
    operatingHours,
    30,
    []
  );
  assert.deepEqual(slotsSunday, []);

  // With a booking from 09:30 to 10:00, 09:30 should be unavailable
  const slotsWithBooking = generateAvailableSlots(
    '2026-11-09',
    'monday',
    operatingHours,
    30,
    [
      {
        date: '2026-11-09',
        startTime: '09:30',
        endTime: '10:00',
        status: 'confirmed',
      },
    ]
  );
  assert.ok(!slotsWithBooking.includes('09:30'));
  assert.ok(slotsWithBooking.includes('09:00'));
  assert.ok(slotsWithBooking.includes('10:00'));
});

test('calculateTrialRemainingDays: correctly evaluates remaining days and expiration', () => {
  const ref = new Date('2026-11-05T00:00:00Z');
  // 5 days remaining
  const trialEnd5Days = '2026-11-10T00:00:00Z';
  const result = calculateTrialRemainingDays(trialEnd5Days, ref);
  assert.equal(result.isExpired, false);
  assert.equal(result.daysRemaining, 5);

  // Past date -> expired
  const trialEndPast = '2026-11-01T00:00:00Z';
  const resultPast = calculateTrialRemainingDays(trialEndPast, ref);
  assert.equal(resultPast.isExpired, true);
  assert.equal(resultPast.daysRemaining, 0);
});

test('isValidGhanaPhone: checks phone formats', () => {
  assert.equal(isValidGhanaPhone('0244123456'), true);
  assert.equal(isValidGhanaPhone('0501234567'), true);
  assert.equal(isValidGhanaPhone('+233244123456'), true);
  assert.equal(isValidGhanaPhone('0123456789'), false); // invalid prefix
  assert.equal(isValidGhanaPhone('12345'), false);
});

test('generateBusinessSlug: creates clean URL slugs', () => {
  assert.equal(generateBusinessSlug('Royal Cuts & Grooming Bar'), 'royal-cuts-grooming-bar');
  assert.equal(generateBusinessSlug('Serene Spa  Lounge!'), 'serene-spa-lounge');
});
