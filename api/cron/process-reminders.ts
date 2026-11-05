import { getServiceSupabase } from '../_lib/supabase.js';
import {
  sendSasuSyncSms,
  normalizePhone,
  appointmentReminderMessage,
} from '../_lib/sms.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const supabase = getServiceSupabase();

  // Respect global SMS toggle
  const { data: settings } = await supabase
    .from('sms_platform_settings')
    .select('sms_enabled')
    .limit(1)
    .maybeSingle();
  if (settings && settings.sms_enabled === false) {
    res.status(200).json({ ok: true, processed: 0, skipped: 0, reason: 'SMS disabled' });
    return;
  }

  // Load reminder template
  const { data: template } = await supabase
    .from('sms_templates')
    .select('content, is_enabled')
    .eq('template_key', 'appointment_reminder')
    .maybeSingle();

  // Process pending reminder records that are due
  const { data: reminders, error } = await supabase
    .from('sms_notifications')
    .select('id, business_id, appointment_id, recipient, message, idempotency_key, submission_status, delivery_status, metadata, scheduled_for')
    .eq('notification_type', 'appointment_reminder')
    .eq('submission_status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .limit(50);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  let processed = 0;
  let skipped = 0;

  for (const reminder of reminders || []) {
    if (!reminder.appointment_id) {
      skipped++;
      continue;
    }

    const { data: appointment } = await supabase
      .from('appointments')
      .select('id, business_id, customer_name, customer_phone, appointment_date, appointment_time, status, business:businesses(name)')
      .eq('id', reminder.appointment_id)
      .single();

    if (!appointment || appointment.status === 'cancelled' || appointment.status === 'canceled') {
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
        updated_at: new Date().toISOString(),
      })
      .eq('id', reminder.id);

    if (result.ok) processed++;
    else skipped++;
  }

  res.status(200).json({ ok: true, processed, skipped });
}