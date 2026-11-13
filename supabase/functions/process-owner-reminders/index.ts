// Supabase Edge Function: process-owner-reminders
// Designed for 1-minute pg_cron execution to deliver 24h, 1h, and 30m owner push reminders,
// recent trigger-created notifications, and subscription expiry alerts.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const MAX_LATE_MS: Record<string, number> = {
  '24h': 18 * 60 * 60 * 1000,
  '1h': 45 * 60 * 1000,
  '30m': 25 * 60 * 1000,
};

const CATEGORY_MAP: Record<string, string> = {
  '24h': 'reminder_24h',
  '1h': 'reminder_1h',
  '30m': 'reminder_30m',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function formatTime12h(timeStr: string): string {
  const parts = String(timeStr || '').split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return timeStr;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function isPushEnabled(prefs: any, category: string): boolean {
  if (!prefs) return true;
  if (category === 'reminder_24h') return prefs.reminders_enabled !== false && prefs.reminder_24h !== false;
  if (category === 'reminder_1h') return prefs.reminders_enabled !== false && prefs.reminder_1h !== false;
  if (category === 'reminder_30m') return prefs.reminders_enabled !== false && prefs.reminder_30m !== false;
  if (category === 'subscription') return prefs.subscription !== false;
  return prefs[category] !== false;
}

async function dispatchNotificationDevices(params: {
  supabase: any;
  notification: any;
  vapidPublic: string;
  vapidPrivate: string;
  vapidSubject: string;
}) {
  const { supabase, notification, vapidPublic, vapidPrivate, vapidSubject } = params;
  if (!vapidPublic || !vapidPrivate) return 0;

  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', notification.user_id)
    .maybeSingle();

  if (!isPushEnabled(prefs, notification.category)) {
    await supabase.from('push_delivery_attempts').insert({
      notification_id: notification.id,
      status: 'skipped_preference',
      error_message: `Push disabled for ${notification.category}`,
    });
    return 0;
  }

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', notification.user_id)
    .eq('is_active', true);

  if (!subs || subs.length === 0) return 0;

  const { count: unreadCount } = await supabase
    .from('owner_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', notification.user_id)
    .is('read_at', null);

  const payload = JSON.stringify({
    notificationId: notification.id,
    category: notification.category,
    title: prefs?.hide_lockscreen_details ? 'SamleyBook: Workspace Update' : notification.title,
    body: prefs?.hide_lockscreen_details ? 'Open SamleyBook to view details.' : notification.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: `samley-${notification.id}`,
    renotify: true,
    requireInteraction: ['new_booking', 'reminder_30m', 'subscription'].includes(notification.category),
    url: notification.destination_url || '/app/dashboard',
    unreadCount: typeof unreadCount === 'number' ? unreadCount : undefined,
    businessId: notification.business_id,
    entityType: notification.entity_type,
    entityId: notification.entity_id,
    timestamp: Date.now(),
  });

  const nowIso = new Date().toISOString();
  let sent = 0;

  await Promise.all(
    subs.map(async (sub: any) => {
      try {
        const resp = await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          {
            vapidDetails: { subject: vapidSubject, publicKey: vapidPublic, privateKey: vapidPrivate },
            TTL: 3600,
            urgency: 'high',
          }
        );
        sent += 1;
        await supabase.from('push_delivery_attempts').insert({
          notification_id: notification.id,
          push_subscription_id: sub.id,
          status: 'accepted',
          http_status: resp?.statusCode || 201,
        });
        await supabase
          .from('push_subscriptions')
          .update({ last_success_at: nowIso, last_failure_reason: null, updated_at: nowIso })
          .eq('id', sub.id);
      } catch (err: any) {
        const statusCode = Number(err?.statusCode || err?.status || 0) || null;
        const invalid = statusCode === 404 || statusCode === 410;
        const msg = String(err?.body || err?.message || 'Push failed').slice(0, 500);
        await supabase.from('push_delivery_attempts').insert({
          notification_id: notification.id,
          push_subscription_id: sub.id,
          status: invalid ? 'subscription_invalid' : 'failed_temporary',
          http_status: statusCode,
          error_message: msg,
        });
        if (invalid) {
          await supabase
            .from('push_subscriptions')
            .update({ is_active: false, last_failure_at: nowIso, last_failure_reason: msg, updated_at: nowIso })
            .eq('id', sub.id);
        }
      }
    })
  );

  return sent;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const cronSecret = Deno.env.get('CRON_SECRET') || '';
  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  const validTokens = [cronSecret, serviceKey].filter(Boolean);
  if (validTokens.length === 0 || !validTokens.includes(bearer)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const vapidPublic = (Deno.env.get('VAPID_PUBLIC_KEY') || '').trim();
  const vapidPrivate = (Deno.env.get('VAPID_PRIVATE_KEY') || '').trim();
  const vapidSubject = (Deno.env.get('VAPID_SUBJECT') || '').trim() || 'mailto:support@samleybook.com';

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date();
  const nowIso = now.toISOString();

  const { data: dueReminders } = await supabase
    .from('appointment_owner_reminders')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(50);

  let sentReminders = 0;
  let cancelledReminders = 0;
  let skippedLate = 0;

  for (const rem of dueReminders || []) {
    const { data: appt } = await supabase
      .from('appointments')
      .select('id, business_id, customer_name, appointment_date, appointment_time, status, service:services(name), business:businesses(name, owner_id)')
      .eq('id', rem.appointment_id)
      .maybeSingle();

    if (!appt || ['cancelled', 'canceled', 'completed'].includes(String(appt.status).toLowerCase())) {
      await supabase
        .from('appointment_owner_reminders')
        .update({ status: 'cancelled', processed_at: nowIso, updated_at: nowIso })
        .eq('id', rem.id);
      cancelledReminders += 1;
      continue;
    }

    const startMs = Date.parse(rem.appointment_start_utc);
    const schedMs = Date.parse(rem.scheduled_for);
    const maxLate = MAX_LATE_MS[rem.reminder_type] || 25 * 60 * 1000;

    if (now.getTime() >= startMs || now.getTime() - schedMs > maxLate) {
      await supabase
        .from('appointment_owner_reminders')
        .update({ status: 'skipped_late', processed_at: nowIso, updated_at: nowIso })
        .eq('id', rem.id);
      skippedLate += 1;
      continue;
    }

    const category = CATEGORY_MAP[rem.reminder_type] || 'reminder_30m';
    const businessName = appt.business?.name || 'your business';
    const serviceName = appt.service?.name || 'Service';
    const timeLabel = formatTime12h(appt.appointment_time);

    const title =
      rem.reminder_type === '24h'
        ? `Upcoming Tomorrow: ${appt.customer_name}`
        : rem.reminder_type === '1h'
        ? `Appointment in 1 Hour: ${appt.customer_name}`
        : `Starting in 30 Mins: ${appt.customer_name}`;

    const body = `${serviceName} on ${appt.appointment_date} at ${timeLabel} (${businessName}).`;

    const { data: existingNotif } = await supabase
      .from('owner_notifications')
      .select('*')
      .eq('idempotency_key', rem.idempotency_key)
      .maybeSingle();

    let notification = existingNotif;
    if (!notification) {
      const { data: created } = await supabase
        .from('owner_notifications')
        .insert({
          user_id: rem.owner_id,
          business_id: rem.business_id,
          category,
          title,
          body,
          entity_type: 'appointment',
          entity_id: appt.id,
          destination_url: `/app/appointments?appointmentId=${appt.id}`,
          metadata: { appointment_id: appt.id, reminder_type: rem.reminder_type },
          idempotency_key: rem.idempotency_key,
        })
        .select('*')
        .maybeSingle();
      notification = created;
    }

    if (notification) {
      await dispatchNotificationDevices({ supabase, notification, vapidPublic, vapidPrivate, vapidSubject });
      await supabase
        .from('appointment_owner_reminders')
        .update({ status: 'sent', notification_id: notification.id, processed_at: nowIso, updated_at: nowIso })
        .eq('id', rem.id);
      sentReminders += 1;
    }
  }

  // Sweep recent trigger notifications lacking push delivery attempts
  const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const { data: recentNotifs } = await supabase
    .from('owner_notifications')
    .select('*')
    .gte('created_at', fifteenMinsAgo)
    .order('created_at', { ascending: false })
    .limit(40);

  let sweptPushes = 0;
  if (recentNotifs && recentNotifs.length > 0) {
    const { data: attempts } = await supabase
      .from('push_delivery_attempts')
      .select('notification_id')
      .in('notification_id', recentNotifs.map((n: any) => n.id));
    const seen = new Set((attempts || []).map((a: any) => String(a.notification_id)));
    for (const notif of recentNotifs) {
      if (seen.has(notif.id)) continue;
      sweptPushes += await dispatchNotificationDevices({
        supabase,
        notification: notif,
        vapidPublic,
        vapidPrivate,
        vapidSubject,
      });
    }
  }

  return jsonResponse({
    ok: true,
    sentReminders,
    cancelledReminders,
    skippedLate,
    sweptPushes,
  });
});
