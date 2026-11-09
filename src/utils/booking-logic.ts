/**
 * Pure business calculation and scheduling rules for SamleyBook SaaS
 */

export interface OperatingDayHours {
  open: string; // e.g. "08:00"
  close: string; // e.g. "18:00"
  isOpen: boolean;
}

export type OperatingHoursMap = Record<string, OperatingDayHours>;

export interface BookedSlot {
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  status: string; // 'pending' | 'confirmed' | 'completed' | 'cancelled'
}

/**
 * Calculate payment amount required at booking time based on payment configuration
 */
export function calculateRequiredPayment(
  servicePrice: number,
  paymentType: 'full' | 'deposit',
  depositType: 'percentage' | 'fixed' = 'percentage',
  depositPercentage: number = 50,
  depositFixedAmount: number = 0
): number {
  if (servicePrice <= 0) return 0;
  if (paymentType === 'full') {
    return Number(servicePrice.toFixed(2));
  }

  if (depositType === 'fixed') {
    const fixed = Math.min(depositFixedAmount, servicePrice);
    return Number(Math.max(0, fixed).toFixed(2));
  }

  // percentage
  const pct = Math.min(100, Math.max(0, depositPercentage));
  const amount = (servicePrice * pct) / 100;
  return Number(amount.toFixed(2));
}

/**
 * Format GHS currency
 */
export function formatGHS(amount: number | string | null | undefined): string {
  const num = typeof amount === 'number' ? amount : Number(amount || 0);
  if (isNaN(num)) return 'GHS 0.00';
  return `GHS ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a duration in minutes as "X hour(s) Y minute(s)".
 * e.g. 30 -> "30 minutes", 60 -> "1 hour", 100 -> "1 hour 40 minutes"
 */
export function formatDurationMinutes(minutes: number | string | null | undefined): string {
  const num = typeof minutes === 'number' ? minutes : Number(minutes || 0);
  if (isNaN(num) || num <= 0) return '0 minutes';
  const hours = Math.floor(num / 60);
  const mins = Math.round(num % 60);
  const hourLabel = hours === 1 ? 'hour' : 'hours';
  const minLabel = mins === 1 ? 'minute' : 'minutes';
  if (hours === 0) return `${mins} ${minLabel}`;
  if (mins === 0) return `${hours} ${hourLabel}`;
  return `${hours} ${hourLabel} ${mins} ${minLabel}`;
}

/**
 * Converts "HH:MM" to minutes from midnight
 */
export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Converts minutes from midnight back to "HH:MM"
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Calculates end time given start time string "HH:MM" and duration in minutes
 */
export function calculateEndTime(startTimeStr: string, durationMinutes: number): string {
  const startMin = timeToMinutes(startTimeStr);
  const endMin = startMin + durationMinutes;
  return minutesToTime(endMin);
}

/**
 * Generates available appointment slots for a specific date given business hours and existing bookings
 */
export function generateAvailableSlots(
  dateStr: string,
  dayOfWeek: string, // 'monday', 'tuesday', etc.
  operatingHours: OperatingHoursMap | null | undefined,
  serviceDurationMinutes: number,
  existingBookings: BookedSlot[],
  slotIntervalMinutes: number = 30
): string[] {
  if (!operatingHours) return [];
  const daySchedule = operatingHours[dayOfWeek.toLowerCase()];
  if (!daySchedule || !daySchedule.isOpen) {
    return [];
  }

  const openMinutes = timeToMinutes(daySchedule.open);
  const closeMinutes = timeToMinutes(daySchedule.close);

  if (closeMinutes <= openMinutes || serviceDurationMinutes <= 0) {
    return [];
  }

  // Active bookings on this day (ignoring cancelled)
  const activeBookings = existingBookings.filter(
    (b) => b.date === dateStr && b.status !== 'cancelled'
  );

  const bookedIntervals = activeBookings.map((b) => ({
    start: timeToMinutes(b.startTime),
    end: timeToMinutes(b.endTime),
  }));

  const slots: string[] = [];

  for (let current = openMinutes; current + serviceDurationMinutes <= closeMinutes; current += slotIntervalMinutes) {
    const slotEnd = current + serviceDurationMinutes;

    // Check collision with any existing booking: (start < b.end) and (end > b.start)
    const hasConflict = bookedIntervals.some(
      (b) => current < b.end && slotEnd > b.start
    );

    if (!hasConflict) {
      slots.push(minutesToTime(current));
    }
  }

  return slots;
}

/**
 * Calculates remaining days in a trial period given a server trial_end timestamp
 */
export function calculateTrialRemainingDays(trialEndIso: string, referenceNow: Date = new Date()): {
  daysRemaining: number;
  isExpired: boolean;
  hoursRemaining: number;
} {
  const endDate = new Date(trialEndIso);
  const diffMs = endDate.getTime() - referenceNow.getTime();

  if (diffMs <= 0) {
    return { daysRemaining: 0, hoursRemaining: 0, isExpired: true };
  }

  const hoursRemaining = Math.floor(diffMs / (1000 * 60 * 60));
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return {
    daysRemaining,
    hoursRemaining,
    isExpired: false,
  };
}

/**
 * Validate phone number (Ghanaian formats: 024XXXXXXX, 050XXXXXXX, +233XXXXXXXXX)
 */
export function isValidGhanaPhone(phone: string): boolean {
  if (!phone) return false;
  const clean = phone.replace(/[\s-]/g, '');
  // Matches 02XXXXXXXX, 05XXXXXXXX, 03XXXXXXXX or +2332XXXXXXXX, +2335XXXXXXXX, 233...
  return /^(0[235][0-9]{8}|\+233[235][0-9]{8}|233[235][0-9]{8})$/.test(clean);
}

/**
 * Normalize business slug from business name
 */
export function generateBusinessSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
