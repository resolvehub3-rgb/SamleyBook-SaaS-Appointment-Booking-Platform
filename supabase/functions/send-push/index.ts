// Supabase Edge Function: send-push
// Dispatches real Web Push notifications via VAPID to all active devices for a user.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isPushEnabled(prefs: any, category: string): boolean {
  if (!prefs) return true;
  switch (category) {
    case 'new_booking':
      return prefs.new_booking !== false;
    case 'cancellation':
      return prefs.cancellation !== false;
    case 'reschedule':
      return prefs.reschedule !== false;
    case 'reminder_24h':
      return prefs.reminders_enabled !== false && prefs.reminder_24h !== false;
    case 'reminder_1h':
      return prefs.reminders_enabled !== false && prefs.reminder_1h !== false;
    case 'reminder_30m':
      return prefs.reminders_enabled !== false && prefs.reminder_30m !== false;
    case 'feedback':
      return prefs.feedback !== false;
    case 'subscription':
      return prefs.subscription !== false;
    case 'security':
      return prefs.security !== false;
    default:
      return true;
  }
}

function maskLockscreenCopy(category: string, title: string, body: string) {
  switch (category) {
    case 'new_booking':
      return { title: 'SamleyBook: New Booking', body: 'You have a new customer appointment. Tap to view details.' };
    case 'cancellation':
      return { title: 'SamleyBook: Appointment Cancelled', body: 'An appointment status was updated. Tap to open SamleyBook.' };
    case 'reschedule':
      return { title: 'SamleyBook: Appointment Rescheduled', body: 'An appointment time was updated. Tap to view the new schedule.' };
    case 'reminder_24h':
    case 'reminder_1h':
    case 'reminder_30m':
      return { title: 'SamleyBook: Upcoming Appointment', body: 'You have an upcoming scheduled appointment. Tap to review.' };
    case 'feedback':
      return { title: 'SamleyBook: New Customer Feedback', body: 'A customer left verified feedback. Tap to read it.' };
    default:
      return { title, body };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const expectedSecrets = [
    Deno.env.get('PUSH_WEBHOOK_SECRET'),
    Deno.env.get('CRON_SECRET'),
    serviceKey,
  ].filter(Boolean);

  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (expectedSecrets.length === 0 || !expectedSecrets.includes(bearer)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const vapidPublic = (Deno.env.get('VAPID_PUBLIC_KEY') || '').trim();
  const vapidPrivate = (Deno.env.get('VAPID_PRIVATE_KEY') || '').trim();
  const vapidSubject = (Deno.env.get('VAPID_SUBJECT') || '').trim() || 'mailto:support@samleybook.com';

  if (!vapidPublic || !vapidPrivate) {
    return jsonResponse({ error: 'VAPID keys are not configured in Edge Function secrets' }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = await req.json().catch(() => ({}));
  const notificationId = String(body.notificationId || '').trim();
  if (!notificationId) {
    return jsonResponse({ error: 'Missing notificationId' }, 400);
  }

  const { data: notification } = await supabase
    .from('owner_notifications')
    .select('*')
    .eq('id', notificationId)
    .maybeSingle();

  if (!notification) {
    return jsonResponse({ error: 'Notification not found' }, 404);
  }

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
    return jsonResponse({ ok: true, sent: 0, skipped: 'preference_disabled' });
  }

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', notification.user_id)
    .eq('is_active', true);

  if (!subs || subs.length === 0) {
    return jsonResponse({ ok: true, sent: 0, skipped: 'no_active_devices' });
  }

  const { count: unreadCount } = await supabase
    .from('owner_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', notification.user_id)
    .is('read_at', null);

  const copy = prefs?.hide_lockscreen_details
    ? maskLockscreenCopy(notification.category, notification.title, notification.body)
    : { title: notification.title, body: notification.body };

  const payload = JSON.stringify({
    notificationId: notification.id,
    category: notification.category,
    title: copy.title,
    body: copy.body,
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
  let deactivated = 0;

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
          status: invalid ? 'subscription_invalid' : 'failed_permanent',
          http_status: statusCode,
          error_message: msg,
        });
        if (invalid) {
          deactivated += 1;
          await supabase
            .from('push_subscriptions')
            .update({ is_active: false, last_failure_at: nowIso, last_failure_reason: msg, updated_at: nowIso })
            .eq('id', sub.id);
        }
      }
    })
  );

  return jsonResponse({ ok: true, sent, deactivated });
});
