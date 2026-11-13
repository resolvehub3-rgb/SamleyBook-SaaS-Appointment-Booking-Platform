import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as webpush from 'web-push';

import {
  applyNotificationFilter,
  buildDeepLinkDestination,
  buildInAppNotificationCopy,
  buildPushNotificationPayload,
  computeOwnerReminderSchedule,
  computeUnreadCount,
  detectClientPlatformAndName,
  evaluateDueReminder,
  evaluatePushEnvironment,
  evaluateSubscriptionAlertTier,
  extractInternalNotificationRedirect,
  isPushEnabledForCategory,
  isSafeInternalAppRoute,
  markAllNotificationsReadOptimistic,
  markSingleNotificationReadOptimistic,
  normalizeNotificationPreferences,
  parseAppointmentStartUtc,
  resolvePostLoginDestination,
} from './notifications';
import type { OwnerNotification } from '../types/database';
import { evaluateSubscriptionAccess } from './subscription-access';

test('parseAppointmentStartUtc converts Africa/Accra and timezone-offset local times accurately', () => {
  const accra = parseAppointmentStartUtc('2026-11-20', '14:30:00', 'Africa/Accra');
  assert.ok(accra);
  assert.equal(accra.toISOString(), '2026-11-20T14:30:00.000Z');

  const lagos = parseAppointmentStartUtc('2026-11-20', '14:30', 'Africa/Lagos');
  assert.ok(lagos);
  assert.equal(lagos.toISOString(), '2026-11-20T13:30:00.000Z');

  assert.equal(parseAppointmentStartUtc('invalid', '14:30'), null);
});

test('computeOwnerReminderSchedule generates 24h, 1h, and 30m windows and skips past slots', () => {
  const nowFar = new Date('2026-11-18T10:00:00.000Z');
  const fullSchedule = computeOwnerReminderSchedule({
    appointmentId: 'appt-1',
    businessId: 'biz-1',
    ownerId: 'owner-1',
    appointmentDate: '2026-11-20',
    appointmentTime: '14:00:00',
    timeZone: 'Africa/Accra',
    now: nowFar,
  });

  assert.equal(fullSchedule.length, 3);
  assert.deepEqual(
    fullSchedule.map((r) => [r.reminderType, r.scheduledForIso]),
    [
      ['24h', '2026-11-19T14:00:00.000Z'],
      ['1h', '2026-11-20T13:00:00.000Z'],
      ['30m', '2026-11-20T13:30:00.000Z'],
    ]
  );

  // When booked only 2 hours ahead, 24h reminder is already past -> only 1h and 30m are scheduled
  const nowTwoHours = new Date('2026-11-20T12:00:00.000Z');
  const nearSchedule = computeOwnerReminderSchedule({
    appointmentId: 'appt-2',
    businessId: 'biz-1',
    ownerId: 'owner-1',
    appointmentDate: '2026-11-20',
    appointmentTime: '14:00:00',
    timeZone: 'Africa/Accra',
    now: nowTwoHours,
  });
  assert.deepEqual(
    nearSchedule.map((r) => r.reminderType),
    ['1h', '30m']
  );
});

test('evaluateDueReminder cancels on cancelled/completed and skips late/expired reminders', () => {
  const startUtc = new Date('2026-11-20T14:00:00.000Z');
  const sched1h = new Date('2026-11-20T13:00:00.000Z');

  assert.equal(
    evaluateDueReminder({
      appointmentStatus: 'confirmed',
      appointmentStartUtc: startUtc,
      reminderType: '1h',
      scheduledFor: sched1h,
      now: new Date('2026-11-20T13:02:00.000Z'),
    }).action,
    'send'
  );

  assert.equal(
    evaluateDueReminder({
      appointmentStatus: 'cancelled',
      appointmentStartUtc: startUtc,
      reminderType: '1h',
      scheduledFor: sched1h,
      now: new Date('2026-11-20T13:02:00.000Z'),
    }).action,
    'cancel'
  );

  assert.equal(
    evaluateDueReminder({
      appointmentStatus: 'completed',
      appointmentStartUtc: startUtc,
      reminderType: '30m',
      scheduledFor: new Date('2026-11-20T13:30:00.000Z'),
      now: new Date('2026-11-20T13:31:00.000Z'),
    }).action,
    'cancel'
  );

  // Stale reminder past start time must never send
  assert.equal(
    evaluateDueReminder({
      appointmentStatus: 'confirmed',
      appointmentStartUtc: startUtc,
      reminderType: '30m',
      scheduledFor: new Date('2026-11-20T13:30:00.000Z'),
      now: new Date('2026-11-20T14:05:00.000Z'),
    }).action,
    'skip_late'
  );
});

test('Option A read behavior: clicking one notification marks only that item read; tabs filter cleanly', () => {
  const items: OwnerNotification[] = [
    {
      id: 'n1',
      user_id: 'u1',
      business_id: 'b1',
      category: 'new_booking',
      title: 'New Booking',
      body: 'Ama booked Braids',
      destination_url: '/app/appointments?appointmentId=a1',
      read_at: null,
      created_at: '2026-11-20T10:00:00.000Z',
    },
    {
      id: 'n2',
      user_id: 'u1',
      business_id: 'b1',
      category: 'feedback',
      title: 'New Feedback',
      body: 'Loved the service',
      destination_url: '/app/feedback?feedbackId=f1',
      read_at: null,
      created_at: '2026-11-20T09:00:00.000Z',
    },
  ];

  assert.equal(computeUnreadCount(items), 2);

  const afterOne = markSingleNotificationReadOptimistic(items, 'n1', '2026-11-20T10:05:00.000Z');
  assert.equal(computeUnreadCount(afterOne), 1);
  assert.ok(afterOne[0].read_at);
  assert.equal(afterOne[1].read_at, null);
  assert.equal(applyNotificationFilter(afterOne, 'unread').length, 1);
  assert.equal(applyNotificationFilter(afterOne, 'read').length, 1);
  assert.equal(applyNotificationFilter(afterOne, 'all').length, 2);

  const afterAll = markAllNotificationsReadOptimistic(afterOne, '2026-11-20T10:06:00.000Z');
  assert.equal(computeUnreadCount(afterAll), 0);
});

test('Push preferences and lock-screen privacy masking work across categories and reminder windows', () => {
  const prefs = normalizeNotificationPreferences('u1', {
    reminders_enabled: true,
    reminder_24h: false,
    reminder_1h: true,
    hide_lockscreen_details: true,
  });

  assert.equal(isPushEnabledForCategory(prefs, 'new_booking'), true);
  assert.equal(isPushEnabledForCategory(prefs, 'reminder_24h'), false);
  assert.equal(isPushEnabledForCategory(prefs, 'reminder_1h'), true);
  assert.equal(isPushEnabledForCategory(prefs, 'reminder_30m'), true);

  const allRemindersOff = normalizeNotificationPreferences('u1', {
    reminders_enabled: false,
    reminder_1h: true,
  });
  assert.equal(isPushEnabledForCategory(allRemindersOff, 'reminder_1h'), false);

  const copy = buildInAppNotificationCopy({
    category: 'new_booking',
    businessName: 'Glow Studio',
    customerName: 'Kwame Boateng',
    serviceName: 'Classic Fade',
    appointmentDate: '2026-11-22',
    appointmentTime: '15:30',
  });
  assert.match(copy.title, /Kwame Boateng/);

  const maskedPayload = buildPushNotificationPayload({
    notificationId: 'notif-1',
    category: 'new_booking',
    title: copy.title,
    body: copy.body,
    destinationUrl: buildDeepLinkDestination({ category: 'new_booking', appointmentId: 'appt-9' }),
    hideLockscreenDetails: true,
    unreadCount: 3,
  });

  assert.equal(maskedPayload.title, 'SamleyBook: New Booking');
  assert.equal(maskedPayload.body.includes('Kwame'), false);
  assert.equal(maskedPayload.url, '/app/appointments?appointmentId=appt-9');
  assert.equal(maskedPayload.unreadCount, 3);
});

test('Deep link sanitization and post-login redirect resolution reject unsafe or cross-role routes', () => {
  assert.equal(isSafeInternalAppRoute('/app/appointments?appointmentId=123'), true);
  assert.equal(isSafeInternalAppRoute('https://evil.example/app/appointments'), false);
  assert.equal(isSafeInternalAppRoute('//evil.example/app/appointments'), false);
  assert.equal(
    extractInternalNotificationRedirect('https://samleybook.app/app/feedback?feedbackId=f9'),
    '/app/feedback?feedbackId=f9'
  );

  assert.equal(
    resolvePostLoginDestination('/app/appointments?appointmentId=123', '/app/dashboard'),
    '/app/appointments?appointmentId=123'
  );
  assert.equal(
    resolvePostLoginDestination('/app/admin', '/app/dashboard'),
    '/app/dashboard'
  );
  assert.equal(
    resolvePostLoginDestination('/app/login', '/app/dashboard'),
    '/app/dashboard'
  );
});

test('Subscription alert tiers and device capability states evaluate accurately', () => {
  const now = new Date('2026-11-20T12:00:00.000Z');
  const eval3d = evaluateSubscriptionAccess(
    {
      status: 'active',
      current_period_end: '2026-11-23T06:00:00.000Z',
      payment_status: 'paid',
    },
    now
  );
  assert.equal(evaluateSubscriptionAlertTier(eval3d, now).tier, 'expiring_3d');

  const eval1d = evaluateSubscriptionAccess(
    {
      status: 'trialing',
      trial_end: '2026-11-21T06:00:00.000Z',
      current_period_end: '2026-11-21T06:00:00.000Z',
    },
    now
  );
  assert.equal(evaluateSubscriptionAlertTier(eval1d, now).tier, 'expiring_1d');

  const evalExpired = evaluateSubscriptionAccess(
    {
      status: 'active',
      current_period_end: '2026-11-19T12:00:00.000Z',
    },
    now
  );
  assert.equal(evaluateSubscriptionAlertTier(evalExpired, now).tier, 'expired');

  assert.equal(
    evaluatePushEnvironment({
      hasNotificationApi: true,
      hasServiceWorker: true,
      hasPushManager: true,
      permission: 'default',
      isIOS: true,
      isStandalone: false,
      vapidConfigured: true,
      hasActiveCurrentDeviceSubscription: false,
    }),
    'ios_install_required'
  );

  assert.equal(
    evaluatePushEnvironment({
      hasNotificationApi: true,
      hasServiceWorker: true,
      hasPushManager: true,
      permission: 'denied',
      isIOS: false,
      isStandalone: false,
      vapidConfigured: true,
      hasActiveCurrentDeviceSubscription: false,
    }),
    'denied'
  );

  assert.equal(
    evaluatePushEnvironment({
      hasNotificationApi: true,
      hasServiceWorker: true,
      hasPushManager: true,
      permission: 'granted',
      isIOS: false,
      isStandalone: true,
      vapidConfigured: true,
      hasActiveCurrentDeviceSubscription: true,
    }),
    'subscribed'
  );

  const iosInfo = detectClientPlatformAndName(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'
  );
  assert.equal(iosInfo.platform, 'ios');
  assert.equal(iosInfo.deviceName, 'Safari on iPhone');
});

test('web-push builds valid encrypted RFC 8291 push request with real VAPID keys', () => {
  const vapidKeys = webpush.generateVAPIDKeys();
  const clientEcdh = crypto.createECDH('prime256v1');
  const p256dh = clientEcdh.generateKeys('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const auth = crypto.randomBytes(16).toString('base64url');

  const payload = JSON.stringify(
    buildPushNotificationPayload({
      notificationId: 'notif-crypto-1',
      category: 'new_booking',
      title: 'New Appointment: Akosua',
      body: 'Braids • 2026-11-25 at 10:00 AM',
      destinationUrl: '/app/appointments?appointmentId=appt-crypto-1',
      unreadCount: 1,
    })
  );

  const details = webpush.generateRequestDetails(
    {
      endpoint: 'https://fcm.googleapis.com/fcm/send/example-test-endpoint',
      keys: { p256dh, auth },
    },
    payload,
    {
      vapidDetails: {
        subject: 'mailto:support@samleybook.com',
        publicKey: vapidKeys.publicKey,
        privateKey: vapidKeys.privateKey,
      },
      TTL: 3600,
    }
  );

  assert.equal(details.method, 'POST');
  assert.ok(details.body instanceof Buffer && details.body.length > 0);
  assert.match(String(details.headers.Authorization), /^vapid t=.*k=/i);
  assert.equal(details.headers['Content-Encoding'], 'aes128gcm');
});
