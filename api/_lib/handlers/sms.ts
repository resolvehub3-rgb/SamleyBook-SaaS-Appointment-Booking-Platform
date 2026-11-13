import crypto from 'node:crypto';
import { getServiceSupabase } from '../supabase.js';
import { readJson } from '../http.js';
import {
  sendSasuSyncSms,
  fetchSasuSyncStatus,
  normalizePhone,
  businessRegistrationMessage,
  bookingConfirmationMessage,
  appointmentReminderMessage,
  feedbackInvitationMessage,
} from '../sms.js';
import {
  getAuthoritativeBusinessSubscription,
  isServerSuperAdmin,
} from '../subscription.js';

interface SendBody {
  type:
    | 'business_registration'
    | 'account_approval'
    | 'booking_confirmation'
    | 'appointment_reminder'
    | 'feedback_invitation'
    | 'test_sms';
  businessId?: string;
  appointmentId?: string;
  recipient?: string;
  variables?: Record<string, string>;
}

async function getTemplate(supabase: any, key: string): Promise<string | null> {
  const { data } = await supabase
    .from('sms_templates')
    .select('content, is_enabled')
    .eq('template_key', key)
    .maybeSingle();
  if (data && data.is_enabled) return data.content;
  return null;
}

function renderTemplate(content: string, vars: Record<string, string>): string {
  let msg = content;
  for (const [k, v] of Object.entries(vars)) {
    msg = msg.replace(new RegExp(`\\\\[${k.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\\\]`, 'g'), v || '');
  }
  return msg;
}

export async function handleSmsConfig(req: any, res: any) {
  if (req.method === 'GET') {
    const supabase = getServiceSupabase();
    const { data: settings } = await supabase
      .from('sms_platform_settings')
      .select('sms_enabled, updated_at')
      .limit(1)
      .maybeSingle();

    res.status(200).json({
      provider: 'SasuSync',
      configured:
        !!process.env.SASUSYNC_API_KEY &&
        !!process.env.SASUSYNC_SENDER_ID &&
        !!process.env.SASUSYNC_BASE_URL &&
        !!process.env.SASUSYNC_WEBHOOK_SECRET,
      senderId: process.env.SASUSYNC_SENDER_ID || null,
      baseUrl: process.env.SASUSYNC_BASE_URL || null,
      smsEnabled: settings?.sms_enabled ?? true,
      updatedAt: settings?.updated_at || null,
      hasApiKey: !!process.env.SASUSYNC_API_KEY,
      hasWebhookSecret: !!process.env.SASUSYNC_WEBHOOK_SECRET,
    });
    return;
  }

  if (req.method === 'POST') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: 'Unauthorized: missing access token' });
      return;
    }

    const supabase = getServiceSupabase();
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) {
      res.status(401).json({ error: 'Unauthorized: invalid session' });
      return;
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileData?.role !== 'super_admin') {
      res.status(403).json({ error: 'Forbidden: Super Admin access required' });
      return;
    }

    let body: any = {};
    try {
      body = await readJson(req);
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }

    const { smsEnabled } = body || {};
    const { data: existing } = await supabase
      .from('sms_platform_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from('sms_platform_settings')
        .update({ sms_enabled: !!smsEnabled, updated_by: user.id })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('sms_platform_settings')
        .insert({ sms_enabled: !!smsEnabled, updated_by: user.id });
    }

    res.status(200).json({ ok: true, smsEnabled: !!smsEnabled });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

export async function handleSmsTest(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const supabase = getServiceSupabase();
  const { data: userData } = await supabase.auth.getUser(token);
  if (!userData?.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profile?.role !== 'super_admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  let body: any = {};
  try {
    body = await readJson(req);
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const { recipient } = body || {};
  const phone = normalizePhone(recipient || '');
  if (!phone) {
    res.status(400).json({ error: 'Invalid recipient phone number' });
    return;
  }

  // Rate limit: max 5 test SMS per 5 minutes
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('sms_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('notification_type', 'test_sms')
    .gte('created_at', fiveMinAgo);

  if ((count || 0) >= 5) {
    res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
    return;
  }

  const message =
    'This is a test message from SamleyBook SMS Management. SasuSync integration is working correctly.';

  const idempotencyKey = `test_sms:${userData.user.id}:${Date.now()}`;

  const { data: record } = await supabase
    .from('sms_notifications')
    .insert({
      notification_type: 'test_sms',
      recipient: phone,
      message,
      idempotency_key: idempotencyKey,
      submission_status: 'pending',
      delivery_status: 'queued',
      metadata: { type: 'test_sms', adminId: userData.user.id },
    })
    .select('id')
    .single();

  const result = await sendSasuSyncSms({
    sender: process.env.SASUSYNC_SENDER_ID || 'SamleyBook',
    recipients: phone,
    message,
    metadata: { type: 'test_sms' },
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
    .eq('id', record!.id);

  // Audit log
  await supabase.from('sms_audit_logs').insert({
    admin_id: userData.user.id,
    action: 'send_test_sms',
    entity_type: 'sms_notification',
    entity_id: record!.id,
    details: { recipient: phone, ok: result.ok },
  });

  res.status(result.ok ? 200 : 502).json({ ok: result.ok, taskId: result.taskId, error: result.error });
}

export async function handleSmsSend(req: any, res: any) {
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

  // Enforce global SMS enable/disable
  const { data: settings } = await supabase
    .from('sms_platform_settings')
    .select('sms_enabled')
    .limit(1)
    .maybeSingle();

  if (settings && settings.sms_enabled === false) {
    await supabase.from('sms_notifications').insert({
      notification_type: type,
      recipient: body.recipient || '',
      message: '',
      idempotency_key: `${type}:disabled:${Date.now()}`,
      submission_status: 'skipped',
      delivery_status: 'disabled',
      metadata: body || {},
    });
    res.status(200).json({ ok: false, skipped: true, reason: 'SMS sending disabled' });
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
    if (type === 'business_registration' || type === 'account_approval') {
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

      const isAdmin = await isServerSuperAdmin(supabase, authUser.id);
      if (!isAdmin) {
        const subCheck = await getAuthoritativeBusinessSubscription(supabase, business.id);
        if (subCheck.evaluation.isExpired) {
          res.status(402).json({
            error: 'Subscription expired. Renew SamleyBook Premium to continue.',
            code: 'SUBSCRIPTION_EXPIRED',
          });
          return;
        }
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

      const template = await getTemplate(supabase, 'business_registration');
      const vars = {
        'Business Name': business.name,
        'Dashboard Link': body.variables?.['Dashboard Link'] || process.env.VITE_APP_URL || '',
      };
      const message = template ? renderTemplate(template, vars) : businessRegistrationMessage(business.name);

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

      const messageId = result.ok && result.taskId ? await fetchSasuSyncStatus(result.taskId) : null;

      await supabase
        .from('sms_notifications')
        .update({
          submission_status: result.ok ? 'accepted' : 'failed',
          delivery_status: result.ok ? 'queued' : 'failed',
          sasusync_task_id: result.taskId,
          sasusync_message_id: messageId,
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
        .select(
          'id, business_id, customer_id, customer_name, customer_phone, appointment_date, appointment_time, status, payment_status, business:businesses(name)'
        )
        .eq('id', body.appointmentId)
        .single();

      if (error || !appointment) {
        res.status(404).json({ error: 'Appointment not found' });
        return;
      }

      const subCheck = await getAuthoritativeBusinessSubscription(supabase, appointment.business_id);
      if (subCheck.evaluation.isExpired) {
        res.status(402).json({
          error: 'Subscription expired. Online booking notifications are disabled until renewed.',
          code: 'SUBSCRIPTION_EXPIRED',
        });
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
      const template = await getTemplate(supabase, 'booking_confirmation');
      const vars = {
        'Customer Name': appointment.customer_name,
        'Business Name': businessName,
        'Appointment Date': appointment.appointment_date,
        'Appointment Time': appointment.appointment_time,
      };
      const message = template
        ? renderTemplate(template, vars)
        : bookingConfirmationMessage({
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

      const messageId = result.ok && result.taskId ? await fetchSasuSyncStatus(result.taskId) : null;

      await supabase
        .from('sms_notifications')
        .update({
          submission_status: result.ok ? 'accepted' : 'failed',
          delivery_status: result.ok ? 'queued' : 'failed',
          sasusync_task_id: result.taskId,
          sasusync_message_id: messageId,
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
      const template = await getTemplate(supabase, 'appointment_reminder');
      const vars = {
        'Customer Name': appointment.customer_name,
        'Business Name': businessName,
        'Appointment Date': appointment.appointment_date,
        'Appointment Time': appointment.appointment_time,
      };
      const message = template
        ? renderTemplate(template, vars)
        : appointmentReminderMessage({
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

      const messageId = result.ok && result.taskId ? await fetchSasuSyncStatus(result.taskId) : null;

      await supabase
        .from('sms_notifications')
        .update({
          submission_status: result.ok ? 'accepted' : 'failed',
          delivery_status: result.ok ? 'queued' : 'failed',
          sasusync_task_id: result.taskId,
          sasusync_message_id: messageId,
          error_details: result.error,
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.id);

      res.status(result.ok ? 200 : 502).json({ ok: result.ok, taskId: result.taskId, error: result.error });
      return;
    }

    if (type === 'feedback_invitation') {
      if (!body.appointmentId) {
        res.status(400).json({ error: 'Missing appointmentId' });
        return;
      }

      const { data: appointment, error } = await supabase
        .from('appointments')
        .select(
          'id, business_id, customer_id, customer_name, customer_phone, status, service_id, service:services(name), business:businesses(name, owner_id)'
        )
        .eq('id', body.appointmentId)
        .single();

      if (error || !appointment) {
        res.status(404).json({ error: 'Appointment not found' });
        return;
      }

      if (appointment.status !== 'completed') {
        res.status(200).json({ ok: true, skipped: true, reason: 'Appointment not completed' });
        return;
      }

      const isAdminCaller = authUser ? await isServerSuperAdmin(supabase, authUser.id) : false;

      // Auth check
      if (authUser && !isAdminCaller) {
        const ownerId = (appointment as any).business?.owner_id;
        if (ownerId && ownerId !== authUser.id) {
          res.status(403).json({ error: 'Access denied' });
          return;
        }
      }

      if (!isAdminCaller) {
        const subCheck = await getAuthoritativeBusinessSubscription(supabase, appointment.business_id);
        if (subCheck.evaluation.isExpired) {
          res.status(402).json({
            error: 'Subscription expired. Renew SamleyBook Premium to send feedback invitations.',
            code: 'SUBSCRIPTION_EXPIRED',
          });
          return;
        }
      }

      const businessName = (appointment as any).business?.name || 'your business';
      const serviceName = (appointment as any).service?.name || 'your service';
      const recipient = normalizePhone(body.recipient || appointment.customer_phone || '');
      if (!recipient) {
        res.status(400).json({ error: 'No valid recipient phone' });
        return;
      }

      const idempotencyKey = `feedback_invitation:${appointment.id}`;

      const { data: existing } = await supabase
        .from('sms_notifications')
        .select('id, submission_status, sasusync_task_id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existing && existing.submission_status === 'accepted') {
        res.status(200).json({ ok: true, duplicate: true, taskId: existing.sasusync_task_id });
        return;
      }

      // Generate or reuse feedback token
      let tokenRow: { token: string } | null = null;
      const { data: existingToken } = await supabase
        .from('feedback_tokens')
        .select('token, used_at, expires_at')
        .eq('appointment_id', appointment.id)
        .maybeSingle();

      if (existingToken && !existingToken.used_at) {
        tokenRow = { token: existingToken.token };
      } else if (!existingToken) {
        const newToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: insertedToken, error: tokenErr } = await supabase
          .from('feedback_tokens')
          .insert({
            token: newToken,
            business_id: appointment.business_id,
            appointment_id: appointment.id,
            customer_id: appointment.customer_id || null,
            expires_at: expiresAt,
          })
          .select('token')
          .single();
        if (tokenErr) {
          // Race: token may have been created concurrently; fetch it
          const { data: raced } = await supabase
            .from('feedback_tokens')
            .select('token, used_at')
            .eq('appointment_id', appointment.id)
            .maybeSingle();
          if (raced && !raced.used_at) {
            tokenRow = { token: raced.token };
          } else if (raced && raced.used_at) {
            res.status(200).json({ ok: true, skipped: true, reason: 'Feedback already submitted' });
            return;
          } else {
            throw tokenErr;
          }
        } else {
          tokenRow = insertedToken as { token: string };
        }
      } else {
        // token used; skip sending another invitation
        res.status(200).json({ ok: true, skipped: true, reason: 'Feedback already submitted' });
        return;
      }

      const rawUrl = process.env.APP_URL || process.env.VITE_APP_URL || '';
      const appUrl = rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;
      const feedbackLink = `${appUrl}/feedback/${tokenRow!.token}`;

      const message = feedbackInvitationMessage({
        customerName: appointment.customer_name,
        businessName,
        service: serviceName,
        feedbackLink,
      });

      const { data: record, error: insertError } = await supabase
        .from('sms_notifications')
        .upsert(
          {
            business_id: appointment.business_id,
            appointment_id: appointment.id,
            customer_id: appointment.customer_id || null,
            notification_type: 'feedback_invitation',
            recipient,
            message,
            idempotency_key: idempotencyKey,
            submission_status: 'pending',
            delivery_status: 'queued',
            metadata: { appointmentId: appointment.id, type, feedbackLink },
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

      res.status(result.ok ? 200 : 502).json({
        ok: result.ok,
        taskId: result.taskId,
        error: result.error,
        feedbackLink,
      });
      return;
    }

    res.status(400).json({ error: 'Unsupported type' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
