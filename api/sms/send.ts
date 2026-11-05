import { getServiceSupabase } from '../_lib/supabase.js';
import {
  sendSasuSyncSms,
  normalizePhone,
  businessRegistrationMessage,
  bookingConfirmationMessage,
  appointmentReminderMessage,
} from '../_lib/sms.js';

interface SendBody {
  type: 'business_registration' | 'booking_confirmation' | 'appointment_reminder';
  businessId?: string;
  appointmentId?: string;
  recipient?: string;
  variables?: Record<string, string>;
}

async function readJson(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabase = getServiceSupabase();

  let body: SendBody;
  try {
    body = await readJson(req);
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const { type } = body;
  if (!type) {
    res.status(400).json({ error: 'Missing type' });
    return;
  }

  // Determine auth context (optional for public booking confirmation)
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  let authUser: { id: string } | null = null;
  if (token) {
    const { data } = await supabase.auth.getUser(token);
    if (data?.user) authUser = { id: data.user.id };
  }

  try {
    if (type === 'business_registration') {
      if (!authUser) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      if (!body.businessId) {
        res.status(400).json({ error: 'Missing businessId' });
        return;
      }

      const { data: business, error } = await supabase
        .from('businesses')
        .select('id, name, phone, email, owner_id')
        .eq('id', body.businessId)
        .single();

      if (error || !business || business.owner_id !== authUser.id) {
        res.status(403).json({ error: 'Business not found or access denied' });
        return;
      }

      const recipient = normalizePhone(body.recipient || business.phone || '');
      if (!recipient) {
        res.status(400).json({ error: 'No valid recipient phone' });
        return;
      }

      const idempotencyKey = `business_registration:${business.id}`;

      const { data: existing } = await supabase
        .from('sms_notifications')
        .select('id, submission_status, sasusync_task_id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existing && existing.submission_status === 'accepted') {
        res.status(200).json({ ok: true, duplicate: true, taskId: existing.sasusync_task_id });
        return;
      }

      const message = businessRegistrationMessage(business.name);

      const { data: record, error: insertError } = await supabase
        .from('sms_notifications')
        .upsert(
          {
            business_id: business.id,
            notification_type: 'business_registration',
            recipient,
            message,
            idempotency_key: idempotencyKey,
            submission_status: 'pending',
            delivery_status: 'queued',
            metadata: { businessId: business.id },
          },
          { onConflict: 'idempotency_key' }
        )
        .select('id')
        .single();

      if (insertError) throw insertError;

      const result = await sendSasuSyncSms({
        sender: process.env.SASUSYNC_SENDER_ID || 'SamleyBook',
        recipients: recipient,
        message,
        metadata: { businessId: business.id, type },
        idempotencyKey,
      });

      await supabase
        .from('sms_notifications')
        .update({
          submission_status: result.ok ? 'accepted' : 'failed',
          delivery_status: result.ok ? 'queued' : 'failed',
          sasusync_task_id: result.taskId,
          error_details: result.error,
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.id);

      res.status(result.ok ? 200 : 502).json({ ok: result.ok, taskId: result.taskId, error: result.error });
      return;
    }

    if (type === 'booking_confirmation') {
      if (!body.appointmentId) {
        res.status(400).json({ error: 'Missing appointmentId' });
        return;
      }

      const { data: appointment, error } = await supabase
        .from('appointments')
        .select('id, business_id, customer_id, customer_name, customer_phone, appointment_date, appointment_time, status, payment_status, business:businesses(name)')
        .eq('id', body.appointmentId)
        .single();

      if (error || !appointment) {
        res.status(404).json({ error: 'Appointment not found' });
        return;
      }

      // Do not send confirmed-booking message while payment verification is pending
      if (appointment.payment_status === 'pending' || appointment.payment_status === 'none') {
        res.status(200).json({ ok: true, skipped: true, reason: 'Payment not verified' });
        return;
      }

      const recipient = normalizePhone(body.recipient || appointment.customer_phone || '');
      if (!recipient) {
        res.status(400).json({ error: 'No valid recipient phone' });
        return;
      }

      const idempotencyKey = `booking_confirmation:${appointment.id}`;

      const { data: existing } = await supabase
        .from('sms_notifications')
        .select('id, submission_status, sasusync_task_id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existing && existing.submission_status === 'accepted') {
        res.status(200).json({ ok: true, duplicate: true, taskId: existing.sasusync_task_id });
        return;
      }

      const businessName = (appointment as any).business?.name || 'your business';
      const message = bookingConfirmationMessage({
        businessName,
        customerName: appointment.customer_name,
        date: appointment.appointment_date,
        time: appointment.appointment_time,
      });

      const { data: record, error: insertError } = await supabase
        .from('sms_notifications')
        .upsert(
          {
            business_id: appointment.business_id,
            appointment_id: appointment.id,
            customer_id: appointment.customer_id || null,
            notification_type: 'booking_confirmation',
            recipient,
            message,
            idempotency_key: idempotencyKey,
            submission_status: 'pending',
            delivery_status: 'queued',
            metadata: { appointmentId: appointment.id, type },
          },
          { onConflict: 'idempotency_key' }
        )
        .select('id')
        .single();

      if (insertError) throw insertError;

      const result = await sendSasuSyncSms({
        sender: process.env.SASUSYNC_SENDER_ID || 'SamleyBook',
        recipients: recipient,
        message,
        metadata: { appointmentId: appointment.id, type },
        idempotencyKey,
      });

      await supabase
        .from('sms_notifications')
        .update({
          submission_status: result.ok ? 'accepted' : 'failed',
          delivery_status: result.ok ? 'queued' : 'failed',
          sasusync_task_id: result.taskId,
          error_details: result.error,
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.id);

      res.status(result.ok ? 200 : 502).json({ ok: result.ok, taskId: result.taskId, error: result.error });
      return;
    }

    if (type === 'appointment_reminder') {
      if (!body.appointmentId) {
        res.status(400).json({ error: 'Missing appointmentId' });
        return;
      }
      // Reuse booking_confirmation-style lookup but reminder template
      const { data: appointment, error } = await supabase
        .from('appointments')
        .select('id, business_id, customer_name, customer_phone, appointment_date, appointment_time, status, business:businesses(name)')
        .eq('id', body.appointmentId)
        .single();

      if (error || !appointment) {
        res.status(404).json({ error: 'Appointment not found' });
        return;
      }

      if (appointment.status === 'cancelled' || appointment.status === 'canceled') {
        res.status(200).json({ ok: true, skipped: true, reason: 'Appointment cancelled' });
        return;
      }

      const recipient = normalizePhone(body.recipient || appointment.customer_phone || '');
      if (!recipient) {
        res.status(400).json({ error: 'No valid recipient phone' });
        return;
      }

      const idempotencyKey = `appointment_reminder:${appointment.id}`;

      const { data: existing } = await supabase
        .from('sms_notifications')
        .select('id, submission_status, sasusync_task_id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existing && existing.submission_status === 'accepted') {
        res.status(200).json({ ok: true, duplicate: true, taskId: existing.sasusync_task_id });
        return;
      }

      const businessName = (appointment as any).business?.name || 'your business';
      const message = appointmentReminderMessage({
        businessName,
        customerName: appointment.customer_name,
        date: appointment.appointment_date,
        time: appointment.appointment_time,
      });

      const { data: record, error: insertError } = await supabase
        .from('sms_notifications')
        .upsert(
          {
            business_id: appointment.business_id,
            appointment_id: appointment.id,
            notification_type: 'appointment_reminder',
            recipient,
            message,
            idempotency_key: idempotencyKey,
            submission_status: 'pending',
            delivery_status: 'queued',
            metadata: { appointmentId: appointment.id, type },
          },
          { onConflict: 'idempotency_key' }
        )
        .select('id')
        .single();

      if (insertError) throw insertError;

      const result = await sendSasuSyncSms({
        sender: process.env.SASUSYNC_SENDER_ID || 'SamleyBook',
        recipients: recipient,
        message,
        metadata: { appointmentId: appointment.id, type },
        idempotencyKey,
      });

      await supabase
        .from('sms_notifications')
        .update({
          submission_status: result.ok ? 'accepted' : 'failed',
          delivery_status: result.ok ? 'queued' : 'failed',
          sasusync_task_id: result.taskId,
          error_details: result.error,
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.id);

      res.status(result.ok ? 200 : 502).json({ ok: result.ok, taskId: result.taskId, error: result.error });
      return;
    }

    res.status(400).json({ error: 'Unsupported type' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}