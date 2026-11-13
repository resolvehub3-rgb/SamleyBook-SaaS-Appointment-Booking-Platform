import type {
  NotificationCategory,
  NotificationPreferences,
  OwnerNotification,
  PushPlatform,
} from '../types/database';
import type { SubscriptionAccessEvaluation } from './subscription-access';

export const DEFAULT_BUSINESS_TIMEZONE = 'Africa/Accra';
export const POST_LOGIN_REDIRECT_STORAGE_KEY = 'samley_post_login_redirect';
export const NOTIFICATION_PROMPT_DISMISS_KEY = 'samley_notif_prompt_dismissed_until';
export const PUSH_DEVICE_ID_KEY = 'samley_push_device_id';

export type AppointmentReminderType = '24h' | '1h' | '30m';

export interface ReminderScheduleItem {
  appointmentId: string;
  businessId: string;
  ownerId: string;
  reminderType: AppointmentReminderType;
  appointmentStartUtcIso: string;
  scheduledForIso: string;
  idempotencyKey: string;
}

export interface PushNotificationPayload {
  notificationId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  icon: string;
  badge: string;
  tag: string;
  renotify: boolean;
  requireInteraction: boolean;
  url: string;
  unreadCount?: number;
  businessId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  timestamp: number;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: Omit<NotificationPreferences, 'user_id'> = {
  new_booking: true,
  cancellation: true,
  reschedule: true,
  reminders_enabled: true,
  reminder_24h: true,
  reminder_1h: true,
  reminder_30m: true,
  feedback: true,
  subscription: true,
  security: true,
  hide_lockscreen_details: false,
};

export function normalizeNotificationPreferences(
  userId: string,
  row?: Partial<NotificationPreferences> | null
): NotificationPreferences {
  return {
    user_id: userId,
    new_booking: row?.new_booking ?? true,
    cancellation: row?.cancellation ?? true,
    reschedule: row?.reschedule ?? true,
    reminders_enabled: row?.reminders_enabled ?? true,
    reminder_24h: row?.reminder_24h ?? true,
    reminder_1h: row?.reminder_1h ?? true,
    reminder_30m: row?.reminder_30m ?? true,
    feedback: row?.feedback ?? true,
    subscription: row?.subscription ?? true,
    security: row?.security ?? true,
    hide_lockscreen_details: row?.hide_lockscreen_details ?? false,
    updated_at: row?.updated_at,
  };
}

export function isPushEnabledForCategory(
  prefs: Partial<NotificationPreferences> | null | undefined,
  category: NotificationCategory
): boolean {
  const p = prefs || DEFAULT_NOTIFICATION_PREFERENCES;
  switch (category) {
    case 'new_booking':
      return p.new_booking !== false;
    case 'cancellation':
      return p.cancellation !== false;
    case 'reschedule':
      return p.reschedule !== false;
    case 'reminder_24h':
      return p.reminders_enabled !== false && p.reminder_24h !== false;
    case 'reminder_1h':
      return p.reminders_enabled !== false && p.reminder_1h !== false;
    case 'reminder_30m':
      return p.reminders_enabled !== false && p.reminder_30m !== false;
    case 'feedback':
      return p.feedback !== false;
    case 'subscription':
      return p.subscription !== false;
    case 'security':
      return p.security !== false;
    default:
      return true;
  }
}

export function formatTimeDisplay12h(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  const parts = String(timeStr).trim().split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return String(timeStr);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * Converts a local wall-clock date/time (`YYYY-MM-DD`, `HH:mm[:ss]`) in an IANA
 * timezone (defaulting to `Africa/Accra`) into an exact UTC Date instance.
 */
export function parseAppointmentStartUtc(
  appointmentDate: string,
  appointmentTime: string,
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE
): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(appointmentDate || '').trim());
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(appointmentTime || '').trim());
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] || 0);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  const utcGuessMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const tz = (timeZone || DEFAULT_BUSINESS_TIMEZONE).trim() || DEFAULT_BUSINESS_TIMEZONE;

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const getOffsetMs = (ms: number) => {
      const parts = formatter.formatToParts(new Date(ms));
      const map: Record<string, number> = {};
      for (const p of parts) {
        if (p.type !== 'literal') {
          map[p.type] = Number(p.value);
        }
      }
      const hVal = map.hour === 24 ? 0 : map.hour;
      const zonedAsUtc = Date.UTC(map.year, map.month - 1, map.day, hVal, map.minute, map.second);
      return zonedAsUtc - ms;
    };

    const offset1 = getOffsetMs(utcGuessMs);
    const candidateMs = utcGuessMs - offset1;
    const offset2 = getOffsetMs(candidateMs);
    return new Date(utcGuessMs - offset2);
  } catch {
    // Fallback to UTC (Africa/Accra is UTC+0)
    return new Date(utcGuessMs);
  }
}

const REMINDER_OFFSETS_MS: Record<AppointmentReminderType, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '30m': 30 * 60 * 1000,
};

const REMINDER_MAX_LATE_MS: Record<AppointmentReminderType, number> = {
  '24h': 18 * 60 * 60 * 1000,
  '1h': 45 * 60 * 1000,
  '30m': 25 * 60 * 1000,
};

/**
 * Generates future reminder schedule entries (24h, 1h, 30m before appointment start).
 * Past reminder windows relative to `now` are omitted so stale alerts do not fire.
 */
export function computeOwnerReminderSchedule(params: {
  appointmentId: string;
  businessId: string;
  ownerId: string;
  appointmentDate: string;
  appointmentTime: string;
  timeZone?: string;
  now?: Date;
}): ReminderScheduleItem[] {
  const now = params.now || new Date();
  const startUtc = parseAppointmentStartUtc(
    params.appointmentDate,
    params.appointmentTime,
    params.timeZone || DEFAULT_BUSINESS_TIMEZONE
  );
  if (!startUtc || startUtc.getTime() <= now.getTime()) {
    return [];
  }

  const startIso = startUtc.toISOString();
  const items: ReminderScheduleItem[] = [];

  (['24h', '1h', '30m'] as AppointmentReminderType[]).forEach((reminderType) => {
    const scheduledMs = startUtc.getTime() - REMINDER_OFFSETS_MS[reminderType];
    if (scheduledMs > now.getTime()) {
      const scheduledForIso = new Date(scheduledMs).toISOString();
      items.push({
        appointmentId: params.appointmentId,
        businessId: params.businessId,
        ownerId: params.ownerId,
        reminderType,
        appointmentStartUtcIso: startIso,
        scheduledForIso,
        idempotencyKey: `owner_reminder:${params.appointmentId}:${reminderType}:${startIso.replace(/\.\d{3}Z$/, 'Z')}`,
      });
    }
  });

  return items;
}

/**
 * Authoritatively evaluates whether a due reminder should still be sent, cancelled, or skipped as stale/late.
 */
export function evaluateDueReminder(params: {
  appointmentStatus: string;
  appointmentStartUtc: Date;
  reminderType: AppointmentReminderType;
  scheduledFor: Date;
  now?: Date;
}): { action: 'send' | 'cancel' | 'skip_late'; reason?: string } {
  const now = params.now || new Date();
  const normalizedStatus = String(params.appointmentStatus || '').toLowerCase().trim();

  if (normalizedStatus === 'cancelled' || normalizedStatus === 'canceled' || normalizedStatus === 'completed') {
    return { action: 'cancel', reason: `Appointment is ${normalizedStatus}` };
  }

  if (now.getTime() >= params.appointmentStartUtc.getTime()) {
    return { action: 'skip_late', reason: 'Appointment start time has already passed' };
  }

  const latenessMs = now.getTime() - params.scheduledFor.getTime();
  const maxLateMs = REMINDER_MAX_LATE_MS[params.reminderType];
  if (latenessMs > maxLateMs) {
    return { action: 'skip_late', reason: `Reminder window expired (${Math.round(latenessMs / 60000)}m late)` };
  }

  return { action: 'send' };
}

export function buildDeepLinkDestination(params: {
  category: NotificationCategory;
  appointmentId?: string | null;
  feedbackId?: string | null;
}): string {
  switch (params.category) {
    case 'new_booking':
    case 'cancellation':
    case 'reschedule':
    case 'reminder_24h':
    case 'reminder_1h':
    case 'reminder_30m':
      return params.appointmentId
        ? `/app/appointments?appointmentId=${encodeURIComponent(params.appointmentId)}`
        : '/app/appointments';
    case 'feedback':
      return params.feedbackId
        ? `/app/feedback?feedbackId=${encodeURIComponent(params.feedbackId)}`
        : '/app/feedback';
    case 'subscription':
      return '/app/subscription';
    case 'security':
      return '/app/settings?section=notifications';
    default:
      return '/app/dashboard';
  }
}

export function buildInAppNotificationCopy(params: {
  category: NotificationCategory;
  businessName?: string | null;
  customerName?: string | null;
  serviceName?: string | null;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  previousDate?: string | null;
  previousTime?: string | null;
  appointmentRef?: string | null;
  feedbackPreview?: string | null;
  subscriptionDaysLeft?: number | null;
  subscriptionExpired?: boolean;
  securityEvent?: 'new_device_registered' | 'password_changed' | 'session_revoked' | string;
  deviceName?: string | null;
}): { title: string; body: string } {
  const biz = (params.businessName || 'your business').trim();
  const customer = (params.customerName || 'Customer').trim();
  const service = (params.serviceName || 'Service').trim();
  const date = params.appointmentDate || '';
  const time = formatTimeDisplay12h(params.appointmentTime);
  const prevDate = params.previousDate || '';
  const prevTime = formatTimeDisplay12h(params.previousTime);
  const refSuffix = params.appointmentRef ? ` • Ref #${params.appointmentRef}` : '';

  switch (params.category) {
    case 'new_booking':
      return {
        title: `New Appointment: ${customer}`,
        body: `${service} • ${date} at ${time} (${biz})${refSuffix}`,
      };
    case 'cancellation':
      return {
        title: `Appointment Cancelled: ${customer}`,
        body: `${service} on ${date} at ${time} (${biz}) was cancelled${refSuffix}.`,
      };
    case 'reschedule':
      return {
        title: `Appointment Rescheduled: ${customer}`,
        body: `${service} moved from ${prevDate} ${prevTime} to ${date} at ${time} (${biz}).`,
      };
    case 'reminder_24h':
      return {
        title: `Upcoming Tomorrow: ${customer}`,
        body: `In 24 hours: ${service} on ${date} at ${time} (${biz}).`,
      };
    case 'reminder_1h':
      return {
        title: `Appointment in 1 Hour: ${customer}`,
        body: `${service} today at ${time} (${biz})${refSuffix}.`,
      };
    case 'reminder_30m':
      return {
        title: `Starting in 30 Mins: ${customer}`,
        body: `${service} at ${time} (${biz})${refSuffix}.`,
      };
    case 'feedback': {
      const preview = (params.feedbackPreview || '').trim();
      const snippet = preview.length > 100 ? `${preview.slice(0, 97)}...` : preview;
      return {
        title: `New Customer Feedback: ${customer}`,
        body: snippet
          ? `"${snippet}" (${service})`
          : `${customer} submitted verified feedback for ${service} (${biz}).`,
      };
    }
    case 'subscription':
      if (params.subscriptionExpired) {
        return {
          title: `Subscription Expired: ${biz}`,
          body: 'Your SamleyBook Premium access has expired. Renew (GH₵120 / 30 days) to unlock your workspace.',
        };
      }
      return {
        title: `Subscription Renewal Reminder (${biz})`,
        body:
          typeof params.subscriptionDaysLeft === 'number' && params.subscriptionDaysLeft <= 1
            ? 'Your SamleyBook subscription expires within 24 hours. Renew now to avoid service interruption.'
            : `Your SamleyBook subscription expires in ${params.subscriptionDaysLeft ?? 3} days. Renew early to extend seamlessly.`,
      };
    case 'security':
      if (params.securityEvent === 'password_changed') {
        return {
          title: 'Account Password Updated',
          body: 'Your SamleyBook account password was updated. Review your account security settings if needed.',
        };
      }
      return {
        title: 'New Notification Device Added',
        body: `${params.deviceName || 'A new device'} was registered for SamleyBook background notifications.`,
      };
    default:
      return {
        title: 'SamleyBook Update',
        body: 'You have a new workspace update.',
      };
  }
}

export function buildPushNotificationPayload(params: {
  notificationId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  destinationUrl: string;
  unreadCount?: number;
  businessId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  hideLockscreenDetails?: boolean;
}): PushNotificationPayload {
  const safeUrl = isSafeInternalAppRoute(params.destinationUrl)
    ? params.destinationUrl
    : '/app/dashboard';

  let title = params.title;
  let body = params.body;

  if (params.hideLockscreenDetails) {
    switch (params.category) {
      case 'new_booking':
        title = 'SamleyBook: New Booking';
        body = 'You have a new customer appointment. Tap to view details.';
        break;
      case 'cancellation':
        title = 'SamleyBook: Appointment Cancelled';
        body = 'An appointment status was updated. Tap to open SamleyBook.';
        break;
      case 'reschedule':
        title = 'SamleyBook: Appointment Rescheduled';
        body = 'An appointment time was updated. Tap to view the new schedule.';
        break;
      case 'reminder_24h':
      case 'reminder_1h':
      case 'reminder_30m':
        title = 'SamleyBook: Upcoming Appointment';
        body = 'You have an upcoming scheduled appointment. Tap to review.';
        break;
      case 'feedback':
        title = 'SamleyBook: New Customer Feedback';
        body = 'A customer left verified feedback. Tap to read it.';
        break;
      default:
        break;
    }
  }

  return {
    notificationId: params.notificationId,
    category: params.category,
    title,
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag:
      params.entityId && params.category !== 'reschedule'
        ? `samley-${params.category}-${params.entityId}`
        : `samley-${params.notificationId}`,
    renotify: true,
    requireInteraction:
      params.category === 'new_booking' ||
      params.category === 'reminder_30m' ||
      params.category === 'subscription',
    url: safeUrl,
    unreadCount: typeof params.unreadCount === 'number' ? Math.max(0, params.unreadCount) : undefined,
    businessId: params.businessId ?? null,
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
    timestamp: Date.now(),
  };
}

export function applyNotificationFilter(
  notifications: OwnerNotification[],
  filter: 'all' | 'unread' | 'read'
): OwnerNotification[] {
  if (filter === 'unread') {
    return notifications.filter((n) => !n.read_at);
  }
  if (filter === 'read') {
    return notifications.filter((n) => Boolean(n.read_at));
  }
  return notifications;
}

export function computeUnreadCount(notifications: OwnerNotification[]): number {
  return notifications.reduce((acc, n) => (n.read_at ? acc : acc + 1), 0);
}

/**
 * Option A read behavior: opening the notification centre does NOT mark items read.
 * Clicking an individual notification marks ONLY that notification read.
 */
export function markSingleNotificationReadOptimistic(
  notifications: OwnerNotification[],
  notificationId: string,
  readAtIso: string = new Date().toISOString()
): OwnerNotification[] {
  return notifications.map((n) =>
    n.id === notificationId && !n.read_at ? { ...n, read_at: readAtIso } : n
  );
}

export function markAllNotificationsReadOptimistic(
  notifications: OwnerNotification[],
  readAtIso: string = new Date().toISOString()
): OwnerNotification[] {
  return notifications.map((n) => (n.read_at ? n : { ...n, read_at: readAtIso }));
}

export function isSafeInternalAppRoute(rawUrl: string | null | undefined): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('/app')) return false;
  if (trimmed.startsWith('//') || trimmed.includes('\\')) return false;
  if (/^\/app($|\/|\?)/.test(trimmed)) return true;
  return false;
}

export function extractInternalNotificationRedirect(
  rawUrl: string | null | undefined
): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (isSafeInternalAppRoute(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    const candidate = `${parsed.pathname}${parsed.search}`;
    return isSafeInternalAppRoute(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function resolvePostLoginDestination(
  pendingRedirect: string | null | undefined,
  defaultHome: '/app/admin' | '/app/dashboard'
): string {
  const safe = extractInternalNotificationRedirect(pendingRedirect);
  if (!safe) return defaultHome;
  if (safe === '/app' || safe === '/app/login' || safe === '/app/register') {
    return defaultHome;
  }
  if (defaultHome === '/app/dashboard' && safe.startsWith('/app/admin')) {
    return defaultHome;
  }
  return safe;
}

export function evaluateSubscriptionAlertTier(
  evaluation: SubscriptionAccessEvaluation,
  now: Date = new Date()
): { tier: 'expiring_3d' | 'expiring_1d' | 'expired' | null; periodKey: string } {
  const expiryKey = evaluation.expiryIso
    ? evaluation.expiryIso.slice(0, 10)
    : now.toISOString().slice(0, 10);

  if (evaluation.isExpired) {
    return { tier: 'expired', periodKey: `expired:${expiryKey}` };
  }

  if (evaluation.hoursRemaining <= 24 && evaluation.hoursRemaining > 0) {
    return { tier: 'expiring_1d', periodKey: `expiring_1d:${expiryKey}` };
  }

  if (evaluation.daysRemaining <= 3 && evaluation.daysRemaining > 0) {
    return { tier: 'expiring_3d', periodKey: `expiring_3d:${expiryKey}` };
  }

  return { tier: null, periodKey: '' };
}

export function detectClientPlatformAndName(userAgent: string = ''): {
  platform: PushPlatform;
  deviceName: string;
} {
  const ua = userAgent.toLowerCase();
  let platform: PushPlatform = 'web';
  let osLabel = 'Browser';

  if (/iphone|ipad|ipod/.test(ua)) {
    platform = 'ios';
    osLabel = /ipad/.test(ua) ? 'iPad' : 'iPhone';
  } else if (/android/.test(ua)) {
    platform = 'android';
    osLabel = 'Android';
  } else if (/windows/.test(ua)) {
    platform = 'windows';
    osLabel = 'Windows';
  } else if (/macintosh|mac os x/.test(ua)) {
    platform = 'macos';
    osLabel = 'Mac';
  } else if (/linux/.test(ua)) {
    platform = 'linux';
    osLabel = 'Linux';
  }

  let browserLabel = 'Browser';
  if (/edg\//.test(ua)) browserLabel = 'Edge';
  else if (/opr\/|opera/.test(ua)) browserLabel = 'Opera';
  else if (/chrome|crios/.test(ua) && !/edg\//.test(ua)) browserLabel = 'Chrome';
  else if (/firefox|fxios/.test(ua)) browserLabel = 'Firefox';
  else if (/safari/.test(ua) && !/chrome|crios/.test(ua)) browserLabel = 'Safari';

  return {
    platform,
    deviceName: `${browserLabel} on ${osLabel}`,
  };
}

export type PushCapabilityStatus =
  | 'subscribed'
  | 'needs_permission'
  | 'ready_to_subscribe'
  | 'denied'
  | 'ios_install_required'
  | 'unsupported'
  | 'server_unconfigured';

export function evaluatePushEnvironment(params: {
  hasNotificationApi: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  permission: NotificationPermission | 'unsupported';
  isIOS: boolean;
  isStandalone: boolean;
  vapidConfigured: boolean;
  hasActiveCurrentDeviceSubscription: boolean;
}): PushCapabilityStatus {
  if (!params.hasServiceWorker || !params.hasPushManager || !params.hasNotificationApi) {
    if (params.isIOS && !params.isStandalone) {
      return 'ios_install_required';
    }
    return 'unsupported';
  }

  if (params.isIOS && !params.isStandalone) {
    return 'ios_install_required';
  }

  if (!params.vapidConfigured) {
    return 'server_unconfigured';
  }

  if (params.permission === 'denied') {
    return 'denied';
  }

  if (params.hasActiveCurrentDeviceSubscription && params.permission === 'granted') {
    return 'subscribed';
  }

  if (params.permission === 'granted') {
    return 'ready_to_subscribe';
  }

  return 'needs_permission';
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
