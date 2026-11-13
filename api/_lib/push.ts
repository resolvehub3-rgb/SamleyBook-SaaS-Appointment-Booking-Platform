import * as webpush from 'web-push';
import type {
  NotificationCategory,
  NotificationPreferences,
  OwnerNotification,
  PushSubscriptionRecord,
} from '../../src/types/database.js';
import {
  DEFAULT_BUSINESS_TIMEZONE,
  buildDeepLinkDestination,
  buildInAppNotificationCopy,
  buildPushNotificationPayload,
  evaluateDueReminder,
  evaluateSubscriptionAlertTier,
  isPushEnabledForCategory,
  normalizeNotificationPreferences,
  parseAppointmentStartUtc,
  type AppointmentReminderType,
  type PushNotificationPayload,
} from '../../src/utils/notifications.js';
import { evaluateSubscriptionAccess } from '../../src/utils/subscription-access.js';

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function getVapidConfig(): VapidConfig | null {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const rawSubject = (process.env.VAPID_SUBJECT || '').trim();
  const subject = rawSubject || 'mailto:support@samleybook.com';

  if (!publicKey || !privateKey) {
    return null;
  }

  return { publicKey, privateKey, subject };
}

export function getVapidPublicKey(): string | null {
  const key = (process.env.VAPID_PUBLIC_KEY || '').trim();
  return key || null;
}

export interface WebPushSendResult {
  status: 'accepted' | 'subscription_invalid' | 'failed_permanent' | 'failed_temporary';
  httpStatus: number | null;
  attempts: number;
  errorMessage: string | null;
}

function classifyPushHttpError(statusCode: number | null): WebPushSendResult['status'] {
  if (statusCode === 404 || statusCode === 410) {
    return 'subscription_invalid';
  }
  if (statusCode === 400 || statusCode === 401 || statusCode === 403 || statusCode === 413) {
    return 'failed_permanent';
  }
  return 'failed_temporary';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendWebPushNotification(params: {
  subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
  };
  payload: PushNotificationPayload;
  vapidConfig: VapidConfig;
  ttlSeconds?: number;
  maxRetries?: number;
}): Promise<WebPushSendResult> {
  const maxRetries = params.maxRetries ?? 2;
  const serialized = JSON.stringify(params.payload);

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    try {
      const response = await webpush.sendNotification(
        {
          endpoint: params.subscription.endpoint,
          keys: {
            p256dh: params.subscription.p256dh,
            auth: params.subscription.auth,
          },
        },
        serialized,
        {
          vapidDetails: {
            subject: params.vapidConfig.subject,
            publicKey: params.vapidConfig.publicKey,
            privateKey: params.vapidConfig.privateKey,
          },
          TTL: params.ttlSeconds ?? 3600,
          urgency: 'high',
        }
      );

      return {
        status: 'accepted',
        httpStatus: response?.statusCode || 201,
        attempts: attempt,
        errorMessage: null,
      };
    } catch (err: any) {
      const statusCode =
        typeof err?.statusCode === 'number'
          ? err.statusCode
          : typeof err?.status === 'number'
          ? err.status
          : null;
      const errorMessage = String(err?.body || err?.message || 'Push send failed').slice(0, 500);
      const classified = classifyPushHttpError(statusCode);

      if (classified !== 'failed_temporary' || attempt > maxRetries) {
        return {
          status: classified,
          httpStatus: statusCode,
          attempts: attempt,
          errorMessage,
        };
      }

      await sleep(attempt * 300);
    }
  }

  return {
    status: 'failed_temporary',
    httpStatus: null,
    attempts: maxRetries + 1,
    errorMessage: 'Push delivery exhausted retries',
  };
}

export interface CreateAndDispatchNotificationParams {
  userId: string;
  businessId?: string | null;
  category: NotificationCategory;
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
  destinationUrl: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface DispatchOutcome {
  notification: OwnerNotification | null;
  sent: number;
  failed: number;
  deactivated: number;
  skippedReason?: string;
}

async function insertOrGetNotification(
  supabase: any,
  params: CreateAndDispatchNotificationParams
): Promise<OwnerNotification | null> {
  const rowToInsert = {
    user_id: params.userId,
    business_id: params.businessId ?? null,
    category: params.category,
    title: params.title,
    body: params.body,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    destination_url: params.destinationUrl || '/app/dashboard',
    metadata: params.metadata || {},
    idempotency_key: params.idempotencyKey || null,
  };

  if (params.idempotencyKey) {
    const { data: existing } = await supabase
      .from('owner_notifications')
      .select('*')
      .eq('idempotency_key', params.idempotencyKey)
      .maybeSingle();

    if (existing) {
      return existing as OwnerNotification;
    }
  }

  const { data: inserted, error } = await supabase
    .from('owner_notifications')
    .insert(rowToInsert)
    .select('*')
    .maybeSingle();

  if (!error && inserted) {
    return inserted as OwnerNotification;
  }

  if (error?.code === '23505' && params.idempotencyKey) {
    const { data: conflictRow } = await supabase
      .from('owner_notifications')
      .select('*')
      .eq('idempotency_key', params.idempotencyKey)
      .maybeSingle();
    return (conflictRow as OwnerNotification) || null;
  }

  return null;
}

async function getUnreadCountForUser(supabase: any, userId: string): Promise<number> {
  const { count } = await supabase
    .from('owner_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);

  return typeof count === 'number' ? count : 0;
}

export async function dispatchExistingNotificationPush(
  supabase: any,
  notification: OwnerNotification,
  prefsInput?: NotificationPreferences | null,
  unreadCountInput?: number
): Promise<DispatchOutcome> {
  const prefs =
    prefsInput ||
    normalizeNotificationPreferences(
      notification.user_id,
      (
        await supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', notification.user_id)
          .maybeSingle()
      ).data
    );

  if (!isPushEnabledForCategory(prefs, notification.category)) {
    const { data: existingSkipped } = await supabase
      .from('push_delivery_attempts')
      .select('id')
      .eq('notification_id', notification.id)
      .eq('status', 'skipped_preference')
      .limit(1);

    if (!existingSkipped || existingSkipped.length === 0) {
      await supabase.from('push_delivery_attempts').insert({
        notification_id: notification.id,
        push_subscription_id: null,
        status: 'skipped_preference',
        http_status: null,
        error_message: `Push preference disabled for ${notification.category}`,
        attempt_number: 1,
      });
    }

    return {
      notification,
      sent: 0,
      failed: 0,
      deactivated: 0,
      skippedReason: 'preference_disabled',
    };
  }

  const vapidConfig = getVapidConfig();
  if (!vapidConfig) {
    return {
      notification,
      sent: 0,
      failed: 0,
      deactivated: 0,
      skippedReason: 'vapid_unconfigured',
    };
  }

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', notification.user_id)
    .eq('is_active', true);

  const activeSubs = (subs || []) as PushSubscriptionRecord[];
  if (activeSubs.length === 0) {
    return {
      notification,
      sent: 0,
      failed: 0,
      deactivated: 0,
      skippedReason: 'no_active_devices',
    };
  }

  const { data: priorAttempts } = await supabase
    .from('push_delivery_attempts')
    .select('push_subscription_id, status')
    .eq('notification_id', notification.id);

  const alreadyHandledSubs = new Set<string>(
    (priorAttempts || [])
      .filter((a: any) => a.push_subscription_id && a.status === 'accepted')
      .map((a: any) => String(a.push_subscription_id))
  );

  const pendingSubs = activeSubs.filter((s) => !alreadyHandledSubs.has(s.id));
  if (pendingSubs.length === 0) {
    return {
      notification,
      sent: 0,
      failed: 0,
      deactivated: 0,
      skippedReason: 'already_dispatched',
    };
  }

  const unreadCount =
    typeof unreadCountInput === 'number'
      ? unreadCountInput
      : await getUnreadCountForUser(supabase, notification.user_id);

  const payload = buildPushNotificationPayload({
    notificationId: notification.id,
    category: notification.category,
    title: notification.title,
    body: notification.body,
    destinationUrl: notification.destination_url,
    unreadCount,
    businessId: notification.business_id,
    entityType: notification.entity_type,
    entityId: notification.entity_id,
    hideLockscreenDetails: prefs.hide_lockscreen_details,
  });

  const nowIso = new Date().toISOString();
  let sent = 0;
  let failed = 0;
  let deactivated = 0;

  await Promise.all(
    pendingSubs.map(async (sub) => {
      const result = await sendWebPushNotification({
        subscription: {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
        payload,
        vapidConfig,
      });

      await supabase.from('push_delivery_attempts').insert({
        notification_id: notification.id,
        push_subscription_id: sub.id,
        status: result.status,
        http_status: result.httpStatus,
        error_message: result.errorMessage,
        attempt_number: result.attempts,
      });

      if (result.status === 'accepted') {
        sent += 1;
        await supabase
          .from('push_subscriptions')
          .update({
            last_success_at: nowIso,
            last_failure_reason: null,
            updated_at: nowIso,
          })
          .eq('id', sub.id);
      } else if (result.status === 'subscription_invalid') {
        failed += 1;
        deactivated += 1;
        await supabase
          .from('push_subscriptions')
          .update({
            is_active: false,
            last_failure_at: nowIso,
            last_failure_reason: result.errorMessage || `HTTP ${result.httpStatus}`,
            updated_at: nowIso,
          })
          .eq('id', sub.id);
      } else {
        failed += 1;
        await supabase
          .from('push_subscriptions')
          .update({
            last_failure_at: nowIso,
            last_failure_reason: result.errorMessage || `HTTP ${result.httpStatus ?? 'err'}`,
            updated_at: nowIso,
          })
          .eq('id', sub.id);
      }
    })
  );

  return {
    notification,
    sent,
    failed,
    deactivated,
  };
}

export async function createAndDispatchOwnerNotification(
  supabase: any,
  params: CreateAndDispatchNotificationParams
): Promise<DispatchOutcome> {
  const notification = await insertOrGetNotification(supabase, params);
  if (!notification) {
    return {
      notification: null,
      sent: 0,
      failed: 0,
      deactivated: 0,
      skippedReason: 'insert_failed',
    };
  }

  return dispatchExistingNotificationPush(supabase, notification);
}

const REMINDER_CATEGORY_MAP: Record<AppointmentReminderType, NotificationCategory> = {
  '24h': 'reminder_24h',
  '1h': 'reminder_1h',
  '30m': 'reminder_30m',
};

export async function processDueOwnerAppointmentReminders(
  supabase: any,
  now: Date = new Date()
): Promise<{
  remindersProcessed: number;
  remindersSent: number;
  remindersCancelled: number;
  remindersSkippedLate: number;
  pendingTriggerPushesDispatched: number;
}> {
  const nowIso = now.toISOString();

  const { data: platformRow } = await supabase
    .from('platform_settings')
    .select('timezone')
    .limit(1)
    .maybeSingle();
  const timeZone = platformRow?.timezone || DEFAULT_BUSINESS_TIMEZONE;

  const { data: dueReminders } = await supabase
    .from('appointment_owner_reminders')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(50);

  let remindersProcessed = 0;
  let remindersSent = 0;
  let remindersCancelled = 0;
  let remindersSkippedLate = 0;

  for (const rem of dueReminders || []) {
    remindersProcessed += 1;

    const { data: appt } = await supabase
      .from('appointments')
      .select('id, business_id, customer_name, appointment_date, appointment_time, status, service:services(name), business:businesses(name, owner_id)')
      .eq('id', rem.appointment_id)
      .maybeSingle();

    if (!appt) {
      await supabase
        .from('appointment_owner_reminders')
        .update({
          status: 'cancelled',
          processed_at: nowIso,
          error_message: 'Appointment record not found',
          updated_at: nowIso,
        })
        .eq('id', rem.id);
      remindersCancelled += 1;
      continue;
    }

    const startUtc =
      parseAppointmentStartUtc(appt.appointment_date, appt.appointment_time, timeZone) ||
      new Date(rem.appointment_start_utc);

    const decision = evaluateDueReminder({
      appointmentStatus: appt.status,
      appointmentStartUtc: startUtc,
      reminderType: rem.reminder_type as AppointmentReminderType,
      scheduledFor: new Date(rem.scheduled_for),
      now,
    });

    if (decision.action === 'cancel') {
      await supabase
        .from('appointment_owner_reminders')
        .update({
          status: 'cancelled',
          processed_at: nowIso,
          error_message: decision.reason || null,
          updated_at: nowIso,
        })
        .eq('id', rem.id);
      remindersCancelled += 1;
      continue;
    }

    if (decision.action === 'skip_late') {
      await supabase
        .from('appointment_owner_reminders')
        .update({
          status: 'skipped_late',
          processed_at: nowIso,
          error_message: decision.reason || null,
          updated_at: nowIso,
        })
        .eq('id', rem.id);
      remindersSkippedLate += 1;
      continue;
    }

    const category = REMINDER_CATEGORY_MAP[rem.reminder_type as AppointmentReminderType];
    const businessName = (appt as any).business?.name || 'your business';
    const serviceName = (appt as any).service?.name || 'Appointment Service';
    const copy = buildInAppNotificationCopy({
      category,
      businessName,
      customerName: appt.customer_name,
      serviceName,
      appointmentDate: appt.appointment_date,
      appointmentTime: appt.appointment_time,
      appointmentRef: String(appt.id).slice(0, 8).toUpperCase(),
    });

    const outcome = await createAndDispatchOwnerNotification(supabase, {
      userId: rem.owner_id,
      businessId: rem.business_id,
      category,
      title: copy.title,
      body: copy.body,
      entityType: 'appointment',
      entityId: appt.id,
      destinationUrl: buildDeepLinkDestination({ category, appointmentId: appt.id }),
      metadata: {
        appointment_id: appt.id,
        reminder_type: rem.reminder_type,
        appointment_date: appt.appointment_date,
        appointment_time: appt.appointment_time,
        business_name: businessName,
        customer_name: appt.customer_name,
        service_name: serviceName,
      },
      idempotencyKey: rem.idempotency_key,
    });

    await supabase
      .from('appointment_owner_reminders')
      .update({
        status: 'sent',
        notification_id: outcome.notification?.id || null,
        processed_at: nowIso,
        error_message: null,
        updated_at: nowIso,
      })
      .eq('id', rem.id);

    remindersSent += 1;
  }

  // Sweep recent trigger-created notifications that have no push attempt yet (last 15 minutes)
  const fifteenMinsAgoIso = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const { data: recentNotifs } = await supabase
    .from('owner_notifications')
    .select('*')
    .gte('created_at', fifteenMinsAgoIso)
    .order('created_at', { ascending: false })
    .limit(40);

  let pendingTriggerPushesDispatched = 0;

  if (recentNotifs && recentNotifs.length > 0) {
    const notifIds = recentNotifs.map((n: any) => n.id);
    const { data: attempts } = await supabase
      .from('push_delivery_attempts')
      .select('notification_id')
      .in('notification_id', notifIds);

    const hasAttemptSet = new Set((attempts || []).map((a: any) => String(a.notification_id)));

    for (const notif of recentNotifs as OwnerNotification[]) {
      if (hasAttemptSet.has(notif.id)) continue;
      const outcome = await dispatchExistingNotificationPush(supabase, notif);
      if (outcome.sent > 0) {
        pendingTriggerPushesDispatched += 1;
      }
    }
  }

  return {
    remindersProcessed,
    remindersSent,
    remindersCancelled,
    remindersSkippedLate,
    pendingTriggerPushesDispatched,
  };
}

export async function processSubscriptionExpiryAlerts(
  supabase: any,
  now: Date = new Date()
): Promise<{ notificationsSent: number }> {
  const { data: subs } = await supabase
    .from('business_subscriptions')
    .select('id, business_id, status, trial_start, trial_end, current_period_start, current_period_end, payment_status, created_at, business:businesses(id, name, owner_id)')
    .in('status', ['trialing', 'active', 'expired'])
    .order('created_at', { ascending: false });

  if (!subs || subs.length === 0) {
    return { notificationsSent: 0 };
  }

  // Evaluate only latest subscription record per business
  const latestByBusiness = new Map<string, any>();
  for (const sub of subs) {
    if (!latestByBusiness.has(sub.business_id)) {
      latestByBusiness.set(sub.business_id, sub);
    }
  }

  let notificationsSent = 0;

  for (const sub of latestByBusiness.values()) {
    const business = (sub as any).business;
    if (!business?.owner_id) continue;

    const evaluation = evaluateSubscriptionAccess(sub, now);
    const tierInfo = evaluateSubscriptionAlertTier(evaluation, now);
    if (!tierInfo.tier) continue;

    // Only emit expired notifications for businesses expired within the last 7 days
    if (tierInfo.tier === 'expired' && evaluation.expiryTimestampMs !== null) {
      const daysSinceExpiry = (now.getTime() - evaluation.expiryTimestampMs) / (24 * 60 * 60 * 1000);
      if (daysSinceExpiry > 7) continue;
    }

    const idempotencyKey = `subscription:${business.id}:${tierInfo.periodKey}`;
    const copy = buildInAppNotificationCopy({
      category: 'subscription',
      businessName: business.name,
      subscriptionDaysLeft: evaluation.daysRemaining,
      subscriptionExpired: tierInfo.tier === 'expired',
    });

    const outcome = await createAndDispatchOwnerNotification(supabase, {
      userId: business.owner_id,
      businessId: business.id,
      category: 'subscription',
      title: copy.title,
      body: copy.body,
      entityType: 'subscription',
      entityId: sub.id,
      destinationUrl: buildDeepLinkDestination({ category: 'subscription' }),
      metadata: {
        tier: tierInfo.tier,
        expiry_iso: evaluation.expiryIso,
        days_remaining: evaluation.daysRemaining,
        business_name: business.name,
      },
      idempotencyKey,
    });

    if (outcome.notification) {
      notificationsSent += 1;
    }
  }

  return { notificationsSent };
}
