import { getServiceSupabase } from '../supabase.js';
import { readJson } from '../http.js';
import { isServerSuperAdmin } from '../subscription.js';
import {
  createAndDispatchOwnerNotification,
  dispatchExistingNotificationPush,
  getVapidConfig,
  getVapidPublicKey,
  processDueOwnerAppointmentReminders,
  processSubscriptionExpiryAlerts,
} from '../push.js';
import {
  buildDeepLinkDestination,
  buildInAppNotificationCopy,
  detectClientPlatformAndName,
} from '../../../src/utils/notifications.js';

function getBearerToken(req: any): string | null {
  const authHeader = String(req.headers?.authorization || '');
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
}

async function requireAuthenticatedUser(req: any, res: any) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: missing access token' });
    return null;
  }

  const supabase = getServiceSupabase();
  const { data: userData } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (!user) {
    res.status(401).json({ error: 'Unauthorized: invalid session' });
    return null;
  }

  return { supabase, user };
}

export async function handleNotificationsConfig(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const publicKey = getVapidPublicKey();
  const fullConfig = getVapidConfig();

  res.status(200).json({
    ok: true,
    configured: Boolean(fullConfig),
    publicKey: fullConfig ? publicKey : null,
  });
}

export async function handleNotificationsSubscribe(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = await requireAuthenticatedUser(req, res);
  if (!auth) return;

  let body: any = {};
  try {
    body = await readJson(req);
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const subscription = body.subscription || body;
  const endpoint = String(subscription?.endpoint || '').trim();
  const p256dh = String(subscription?.keys?.p256dh || body.p256dh || '').trim();
  const authSecret = String(subscription?.keys?.auth || body.auth || '').trim();

  if (!endpoint || !p256dh || !authSecret) {
    res.status(400).json({ error: 'Missing required push subscription fields (endpoint, keys.p256dh, keys.auth).' });
    return;
  }

  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:') {
      res.status(400).json({ error: 'Push subscription endpoint must use HTTPS.' });
      return;
    }
  } catch {
    res.status(400).json({ error: 'Invalid push subscription endpoint URL.' });
    return;
  }

  const { supabase, user } = auth;
  const userAgent = String(body.userAgent || req.headers['user-agent'] || '').slice(0, 500);
  const detected = detectClientPlatformAndName(userAgent);
  const deviceId = String(body.deviceId || endpoint).slice(0, 128);
  const deviceName = String(body.deviceName || detected.deviceName).slice(0, 120);
  const platform = ['android', 'ios', 'windows', 'macos', 'linux', 'web'].includes(String(body.platform))
    ? String(body.platform)
    : detected.platform;

  let businessId: string | null = body.businessId ? String(body.businessId) : null;
  if (businessId) {
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, owner_id')
      .eq('id', businessId)
      .maybeSingle();
    const isAdmin = await isServerSuperAdmin(supabase, user.id, user.email);
    if (!biz || (!isAdmin && biz.owner_id !== user.id)) {
      businessId = null;
    }
  }

  const { data: existingBefore } = await supabase
    .from('push_subscriptions')
    .select('id, is_active')
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)
    .maybeSingle();

  const nowIso = new Date().toISOString();

  const { data: savedSub, error: upsertErr } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        business_id: businessId,
        device_id: deviceId,
        device_name: deviceName,
        platform,
        user_agent: userAgent,
        endpoint,
        p256dh,
        auth: authSecret,
        is_active: true,
        last_failure_reason: null,
        updated_at: nowIso,
      },
      { onConflict: 'user_id,endpoint' }
    )
    .select('*')
    .single();

  if (upsertErr || !savedSub) {
    res.status(500).json({ error: upsertErr?.message || 'Failed to save push subscription.' });
    return;
  }

  // Ensure notification_preferences row exists for user (all categories enabled by default)
  await supabase
    .from('notification_preferences')
    .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });

  // Emit a security notification only when a genuinely new device is registered
  if (!existingBefore && body.notifySecurity !== false) {
    const copy = buildInAppNotificationCopy({
      category: 'security',
      securityEvent: 'new_device_registered',
      deviceName,
    });

    await createAndDispatchOwnerNotification(supabase, {
      userId: user.id,
      businessId,
      category: 'security',
      title: copy.title,
      body: copy.body,
      entityType: 'device',
      entityId: savedSub.id,
      destinationUrl: buildDeepLinkDestination({ category: 'security' }),
      metadata: {
        security_event: 'new_device_registered',
        device_id: deviceId,
        device_name: deviceName,
        platform,
      },
      idempotencyKey: `security:device_added:${savedSub.id}`,
    });
  }

  res.status(200).json({
    ok: true,
    subscription: savedSub,
  });
}

export async function handleNotificationsUnsubscribe(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = await requireAuthenticatedUser(req, res);
  if (!auth) return;

  let body: any = {};
  try {
    body = await readJson(req);
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const endpoint = body.endpoint ? String(body.endpoint).trim() : null;
  const subscriptionId = body.subscriptionId ? String(body.subscriptionId).trim() : null;
  const deviceId = body.deviceId ? String(body.deviceId).trim() : null;

  if (!endpoint && !subscriptionId && !deviceId) {
    res.status(400).json({ error: 'Provide endpoint, subscriptionId, or deviceId to unsubscribe.' });
    return;
  }

  const { supabase, user } = auth;
  const nowIso = new Date().toISOString();

  let query = supabase
    .from('push_subscriptions')
    .update({ is_active: false, updated_at: nowIso })
    .eq('user_id', user.id);

  if (subscriptionId) {
    query = query.eq('id', subscriptionId);
  } else if (endpoint) {
    query = query.eq('endpoint', endpoint);
  } else if (deviceId) {
    query = query.eq('device_id', deviceId);
  }

  const { error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ ok: true });
}

export async function handleNotificationsTest(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = await requireAuthenticatedUser(req, res);
  if (!auth) return;

  const vapidConfig = getVapidConfig();
  if (!vapidConfig) {
    res.status(503).json({
      error: 'Web Push VAPID keys are not configured on the server.',
      code: 'VAPID_UNCONFIGURED',
    });
    return;
  }

  let body: any = {};
  try {
    body = await readJson(req);
  } catch {
    body = {};
  }

  const { supabase, user } = auth;
  const businessId = body.businessId ? String(body.businessId) : null;

  const outcome = await createAndDispatchOwnerNotification(supabase, {
    userId: user.id,
    businessId,
    category: 'security',
    title: 'Test Push Notification — SamleyBook',
    body: 'Background push delivery is active on this account.',
    entityType: 'test',
    entityId: null,
    destinationUrl: '/app/settings?section=notifications',
    metadata: {
      security_event: 'test_push',
      triggered_at: new Date().toISOString(),
    },
  });

  if (outcome.skippedReason === 'no_active_devices') {
    res.status(400).json({
      error: 'No active registered push devices found for your account.',
      code: 'NO_ACTIVE_DEVICES',
    });
    return;
  }

  if (outcome.skippedReason === 'preference_disabled') {
    res.status(400).json({
      error: 'Security notifications are currently disabled in your preferences.',
      code: 'PREFERENCE_DISABLED',
    });
    return;
  }

  if (outcome.sent === 0) {
    res.status(502).json({
      error: 'Push delivery failed across registered devices.',
      sent: outcome.sent,
      failed: outcome.failed,
      deactivated: outcome.deactivated,
    });
    return;
  }

  res.status(200).json({
    ok: true,
    sent: outcome.sent,
    failed: outcome.failed,
    deactivated: outcome.deactivated,
  });
}

export async function handleNotificationsDispatchEvent(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body: any = {};
  try {
    body = await readJson(req);
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const eventType = String(body.type || '').trim();

  // Public booking submission runs without owner auth: strictly verify appointment exists in DB & construct message from DB
  if (eventType === 'new_booking') {
    const appointmentId = String(body.appointmentId || '').trim();
    if (!appointmentId) {
      res.status(400).json({ error: 'Missing appointmentId' });
      return;
    }

    const supabase = getServiceSupabase();
    const { data: appt } = await supabase
      .from('appointments')
      .select('id, business_id, customer_name, appointment_date, appointment_time, status, created_at, service:services(name), business:businesses(id, name, owner_id)')
      .eq('id', appointmentId)
      .maybeSingle();

    if (!appt || !(appt as any).business?.owner_id) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    // Prevent stale abuse on anonymous endpoint: only dispatch newly created appointments (<15m) unless caller is authenticated owner
    const token = getBearerToken(req);
    const createdAgeMs = Date.now() - Date.parse(appt.created_at);
    if (!token && createdAgeMs > 15 * 60 * 1000) {
      res.status(403).json({ error: 'Appointment creation window expired for unauthenticated dispatch.' });
      return;
    }

    const business = (appt as any).business;
    const serviceName = (appt as any).service?.name || 'Appointment Service';
    const idempotencyKey = `new_booking:${appt.id}`;

    const copy = buildInAppNotificationCopy({
      category: 'new_booking',
      businessName: business.name,
      customerName: appt.customer_name,
      serviceName,
      appointmentDate: appt.appointment_date,
      appointmentTime: appt.appointment_time,
      appointmentRef: String(appt.id).slice(0, 8).toUpperCase(),
    });

    const outcome = await createAndDispatchOwnerNotification(supabase, {
      userId: business.owner_id,
      businessId: appt.business_id,
      category: 'new_booking',
      title: copy.title,
      body: copy.body,
      entityType: 'appointment',
      entityId: appt.id,
      destinationUrl: buildDeepLinkDestination({ category: 'new_booking', appointmentId: appt.id }),
      metadata: {
        appointment_id: appt.id,
        business_name: business.name,
        customer_name: appt.customer_name,
        service_name: serviceName,
        appointment_date: appt.appointment_date,
        appointment_time: appt.appointment_time,
      },
      idempotencyKey,
    });

    res.status(200).json({
      ok: true,
      sent: outcome.sent,
      failed: outcome.failed,
      deactivated: outcome.deactivated,
      skippedReason: outcome.skippedReason || null,
    });
    return;
  }

  // All remaining dispatch-event actions require authenticated owner / super admin JWT
  const auth = await requireAuthenticatedUser(req, res);
  if (!auth) return;
  const { user } = auth;
  const supabase = getServiceSupabase();
  const isAdmin = await isServerSuperAdmin(supabase, user.id, user.email);

  if (eventType === 'appointment_cancelled' || eventType === 'appointment_rescheduled') {
    const appointmentId = String(body.appointmentId || '').trim();
    if (!appointmentId) {
      res.status(400).json({ error: 'Missing appointmentId' });
      return;
    }

    const { data: appt } = await supabase
      .from('appointments')
      .select('id, business_id, customer_name, appointment_date, appointment_time, status, service:services(name), business:businesses(id, name, owner_id)')
      .eq('id', appointmentId)
      .maybeSingle();

    if (!appt || !(appt as any).business?.owner_id) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    const business = (appt as any).business;
    if (!isAdmin && business.owner_id !== user.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const serviceName = (appt as any).service?.name || 'Appointment Service';
    const category = eventType === 'appointment_cancelled' ? 'cancellation' : 'reschedule';

    // Prefer the notification row created by the PostgreSQL trigger (so we never duplicate in-app rows)
    const { data: latestTriggerNotif } = await supabase
      .from('owner_notifications')
      .select('*')
      .eq('user_id', business.owner_id)
      .eq('entity_id', appt.id)
      .eq('category', category)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let outcome;
    if (latestTriggerNotif) {
      outcome = await dispatchExistingNotificationPush(supabase, latestTriggerNotif);
    } else {
      const copy = buildInAppNotificationCopy({
        category,
        businessName: business.name,
        customerName: appt.customer_name,
        serviceName,
        appointmentDate: appt.appointment_date,
        appointmentTime: appt.appointment_time,
        previousDate: body.previousDate || null,
        previousTime: body.previousTime || null,
        appointmentRef: String(appt.id).slice(0, 8).toUpperCase(),
      });

      const idempotencyKey =
        category === 'cancellation'
          ? `cancellation:${appt.id}:${appt.appointment_date}:${appt.appointment_time}`
          : `reschedule:${appt.id}:${body.previousDate || ''}:${body.previousTime || ''}->${appt.appointment_date}:${appt.appointment_time}`;

      outcome = await createAndDispatchOwnerNotification(supabase, {
        userId: business.owner_id,
        businessId: appt.business_id,
        category,
        title: copy.title,
        body: copy.body,
        entityType: 'appointment',
        entityId: appt.id,
        destinationUrl: buildDeepLinkDestination({ category, appointmentId: appt.id }),
        metadata: {
          appointment_id: appt.id,
          business_name: business.name,
          customer_name: appt.customer_name,
          service_name: serviceName,
          appointment_date: appt.appointment_date,
          appointment_time: appt.appointment_time,
        },
        idempotencyKey,
      });
    }

    res.status(200).json({
      ok: true,
      sent: outcome.sent,
      failed: outcome.failed,
      deactivated: outcome.deactivated,
      skippedReason: outcome.skippedReason || null,
    });
    return;
  }

  if (eventType === 'security_alert') {
    const securityEvent = String(body.securityEvent || 'password_changed');
    const copy = buildInAppNotificationCopy({
      category: 'security',
      securityEvent,
      deviceName: body.deviceName || null,
    });

    const outcome = await createAndDispatchOwnerNotification(supabase, {
      userId: user.id,
      businessId: body.businessId || null,
      category: 'security',
      title: copy.title,
      body: copy.body,
      entityType: 'security',
      entityId: user.id,
      destinationUrl: buildDeepLinkDestination({ category: 'security' }),
      metadata: {
        security_event: securityEvent,
      },
    });

    res.status(200).json({
      ok: true,
      sent: outcome.sent,
      failed: outcome.failed,
    });
    return;
  }

  if (eventType === 'subscription_check') {
    const result = await processSubscriptionExpiryAlerts(supabase, new Date());
    res.status(200).json({ ok: true, ...result });
    return;
  }

  res.status(400).json({ error: `Unsupported notification event type: ${eventType}` });
}

export async function handleNotificationsDispatchPending(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const cronSecret = process.env.CRON_SECRET;
  const auth = String(req.headers?.authorization || '');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const supabase = getServiceSupabase();
  const now = new Date();
  const remindersResult = await processDueOwnerAppointmentReminders(supabase, now);
  const subscriptionsResult = await processSubscriptionExpiryAlerts(supabase, now);

  res.status(200).json({
    ok: true,
    ...remindersResult,
    subscriptionNotificationsSent: subscriptionsResult.notificationsSent,
  });
}
