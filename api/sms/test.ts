import { getServiceSupabase } from '../_lib/supabase.js';
import { sendSasuSyncSms, normalizePhone } from '../_lib/sms.js';

export default async function handler(req: any, res: any) {
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

  const { recipient } = req.body || {};
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

  const message = 'This is a test message from SamleyBook SMS Management. SasuSync integration is working correctly.';

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