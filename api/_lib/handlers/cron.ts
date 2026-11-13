import { getServiceSupabase } from '../supabase.js';
import {
  sendSasuSyncSms,
  normalizePhone,
  appointmentReminderMessage,
} from '../sms.js';
import {
  createAndDispatchOwnerNotification,
  processDueOwnerAppointmentReminders,
  processSubscriptionExpiryAlerts,
} from '../push.js';
import { buildDeepLinkDestination, buildInAppNotificationCopy } from '../../../src/utils/notifications.js';

function verifyCronAuthorization(req: any, res: any): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
  }
  return true;
}

export async function handleCronProcessReminders(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!verifyCronAuthorization(req, res)) return;

  const supabase = getServiceSupabase();

  // Always process due owner push appointment reminders (24h, 1h, 30m) independently of SMS toggle
  const ownerReminderStats = await processDueOwnerAppointmentReminders(supabase, new Date());

  // Respect global SMS toggle for customer SMS reminders
  const { data: settings } = await supabase
    .from('sms_platform_settings')
    .select('sms_enabled')
    .limit(1)
    .maybeSingle();
  if (settings && settings.sms_enabled === false) {
    res.status(200).json({
      ok: true,
      processed: 0,
      skipped: 0,
      reason: 'SMS disabled',
      ownerReminders: ownerReminderStats,
    });
    return;
  }

  // Load reminder template
  const { data: template } = await supabase
    .from('sms_templates')
    .select('content, is_enabled')
    .eq('template_key', 'appointment_reminder')
    .maybeSingle();

  // Process pending SMS reminder records that are due
  const nowIso = new Date().toISOString();
  const { data: reminders, error } = await supabase
    .from('sms_notifications')
    .select(
      'id, business_id, appointment_id, recipient, message, idempotency_key, submission_status, delivery_status, metadata, scheduled_for, retry_count, next_retry_at'
    )
    .eq('notification_type', 'appointment_reminder')
    .in('submission_status', ['pending', 'failed'])
    .lte('scheduled_for', nowIso)
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .limit(10);

  if (error) {
    res.status(500).json({ error: error.message, ownerReminders: ownerReminderStats });
    return;
  }

  let processed = 0;
  let skipped = 0;

  for (const reminder of reminders || []) {
    if (!reminder.appointment_id) {
      skipped++;
      continue;
    }

    if ((reminder.retry_count || 0) >= 3) {
      skipped++;
      continue;
    }

    const { data: appointment } = await supabase
      .from('appointments')
      .select('id, business_id, customer_name, customer_phone, appointment_date, appointment_time, status, business:businesses(name)')
      .eq('id', reminder.appointment_id)
      .single();

    if (
      !appointment ||
      appointment.status === 'cancelled' ||
      appointment.status === 'canceled' ||
      appointment.status === 'completed'
    ) {
      await supabase
        .from('sms_notifications')
        .update({
          submission_status: 'failed',
          delivery_status: 'failed',
          error_details: 'Appointment cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', reminder.id);
      skipped++;
      continue;
    }

    const recipient = normalizePhone(reminder.recipient || appointment.customer_phone || '');
    if (!recipient) {
      await supabase
        .from('sms_notifications')
        .update({
          submission_status: 'failed',
          delivery_status: 'failed',
          error_details: 'Invalid recipient',
          updated_at: new Date().toISOString(),
        })
        .eq('id', reminder.id);
      skipped++;
      continue;
    }

    const businessName = (appointment as any).business?.name || 'your business';
    let message =
      reminder.message && reminder.message !== 'PENDING'
        ? reminder.message
        : null;
    if (!message && template && template.is_enabled) {
      message = template.content
        .replace(/\\[Customer Name\\]/g, appointment.customer_name || '')
        .replace(/\\[Business Name\\]/g, businessName)
        .replace(/\\[Appointment Date\\]/g, appointment.appointment_date || '')
        .replace(/\\[Appointment Time\\]/g, appointment.appointment_time || '');
    }
    if (!message) {
      message = appointmentReminderMessage({
        businessName,
        customerName: appointment.customer_name,
        date: appointment.appointment_date,
        time: appointment.appointment_time,
      });
    }

    const result = await sendSasuSyncSms({
      sender: process.env.SASUSYNC_SENDER_ID || 'SamleyBook',
      recipients: recipient,
      message,
      metadata: { appointmentId: appointment.id, type: 'appointment_reminder' },
      idempotencyKey: reminder.idempotency_key,
    });

    await supabase
      .from('sms_notifications')
      .update({
        recipient,
        message,
        submission_status: result.ok ? 'accepted' : 'failed',
        delivery_status: result.ok ? 'queued' : 'failed',
        sasusync_task_id: result.taskId,
        error_details: result.error,
        retry_count: result.ok ? reminder.retry_count : (reminder.retry_count || 0) + 1,
        next_retry_at: result.ok ? null : new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', reminder.id);

    if (result.ok) processed++;
    else skipped++;
  }

  res.status(200).json({ ok: true, processed, skipped, ownerReminders: ownerReminderStats });
}

export async function handleCronExpireSubscriptions(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!verifyCronAuthorization(req, res)) return;

  const supabase = getServiceSupabase();
  const now = new Date();
  const nowIso = now.toISOString();

  // 1. Expire active/past_due subscriptions past current_period_end
  const { data: expiredActive, error: activeErr } = await supabase
    .from('business_subscriptions')
    .update({ status: 'expired', payment_status: 'none', updated_at: nowIso })
    .in('status', ['active', 'past_due'])
    .lt('current_period_end', nowIso)
    .select('id, business_id');

  if (activeErr) {
    res.status(500).json({ error: activeErr.message });
    return;
  }

  // 2. Expire trialing subscriptions past either trial_end or current_period_end
  const { data: expiredTrials, error: trialErr } = await supabase
    .from('business_subscriptions')
    .update({ status: 'expired', payment_status: 'none', updated_at: nowIso })
    .eq('status', 'trialing')
    .or(`trial_end.lt.${nowIso},current_period_end.lt.${nowIso}`)
    .select('id, business_id');

  if (trialErr) {
    res.status(500).json({ error: trialErr.message });
    return;
  }

  const newlyExpired = [...(expiredActive || []), ...(expiredTrials || [])];
  for (const row of newlyExpired) {
    try {
      const { data: biz } = await supabase
        .from('businesses')
        .select('id, name, owner_id')
        .eq('id', row.business_id)
        .maybeSingle();
      if (!biz?.owner_id) continue;
      const copy = buildInAppNotificationCopy({
        category: 'subscription',
        businessName: biz.name,
        subscriptionExpired: true,
      });
      await createAndDispatchOwnerNotification(supabase, {
        userId: biz.owner_id,
        businessId: biz.id,
        category: 'subscription',
        title: copy.title,
        body: copy.body,
        entityType: 'subscription',
        entityId: row.id,
        destinationUrl: buildDeepLinkDestination({ category: 'subscription' }),
        metadata: { tier: 'expired', business_name: biz.name },
        idempotencyKey: `subscription:${biz.id}:expired:${nowIso.slice(0, 10)}`,
      });
    } catch (notifErr) {
      console.error('Subscription expired push error:', notifErr);
    }
  }

  // Also check 3-day and 1-day approaching expiry alerts
  const alertStats = await processSubscriptionExpiryAlerts(supabase, now);

  res.status(200).json({
    ok: true,
    expired: newlyExpired.length,
    subscriptionNotificationsSent: alertStats.notificationsSent,
  });
}
