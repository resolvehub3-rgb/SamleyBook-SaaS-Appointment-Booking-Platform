import { getServiceSupabase } from '../supabase.js';
import { readJson, readRawBody } from '../http.js';
import { verifyWebhookSignature } from '../sms.js';
import {
  verifyAndActivateSubscriptionPayment,
  verifyWebhookSecretIfConfigured,
} from '../moolre.js';

const TERMINAL_STATUSES = new Set(['delivered', 'failed', 'expired']);

function statusRank(status: string): number {
  switch (status) {
    case 'queued':
      return 0;
    case 'sent':
      return 1;
    case 'delivered':
      return 2;
    case 'failed':
      return 3;
    case 'expired':
      return 4;
    default:
      return 0;
  }
}

export async function handleSasuSyncWebhook(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const secret = process.env.SASUSYNC_WEBHOOK_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Missing SASUSYNC_WEBHOOK_SECRET' });
    return;
  }

  const rawBody = await readRawBody(req);
  const signature =
    (req.headers['x-webhook-signature'] as string | undefined) ||
    (req.headers['X-Webhook-Signature'] as string | undefined);

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const messageId =
    payload?.data?.message_id || payload?.message_id || payload?.messageId || null;
  const taskId =
    payload?.task_id || payload?.taskId || payload?.data?.task_id || null;
  const incomingStatus = String(
    payload?.status || payload?.event || payload?.delivery_status || ''
  ).toLowerCase();

  if (!messageId && !taskId) {
    res.status(400).json({ error: 'Missing message_id/task_id' });
    return;
  }

  const supabase = getServiceSupabase();

  let record: { id: string; delivery_status: string | null } | null = null;
  if (messageId) {
    const { data } = await supabase
      .from('sms_notifications')
      .select('id, delivery_status')
      .eq('sasusync_message_id', messageId)
      .maybeSingle();
    record = data;
  }
  if (!record && taskId) {
    const { data } = await supabase
      .from('sms_notifications')
      .select('id, delivery_status')
      .eq('sasusync_task_id', taskId)
      .maybeSingle();
    record = data;
  }

  if (!record) {
    // Acknowledge to avoid retries for unknown records
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  const current = record.delivery_status || 'queued';
  const next = incomingStatus || current;

  // Handle duplicates / out-of-order: don't overwrite terminal success with failure
  if (TERMINAL_STATUSES.has(current) && current === 'delivered' && (next === 'failed' || next === 'expired')) {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  // Allow progression; ignore stale lower-rank events
  if (statusRank(next) < statusRank(current) && !(next === 'delivered')) {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  const mapped =
    next === 'sent' || next === 'delivered' || next === 'failed' || next === 'expired'
      ? next
      : current;

  await supabase
    .from('sms_notifications')
    .update({
      delivery_status: mapped,
      updated_at: new Date().toISOString(),
    })
    .eq('id', record.id);

  res.status(200).json({ ok: true });
}

export async function handleMoolreWebhook(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!verifyWebhookSecretIfConfigured(req)) {
    res.status(401).json({ error: 'Invalid webhook secret' });
    return;
  }

  let payload: any = {};
  try {
    payload = await readJson(req);
  } catch {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  const externalRef = String(
    payload?.data?.externalref || payload?.externalref || ''
  ).trim();

  if (!externalRef) {
    res.status(400).json({ error: 'Missing externalref in Moolre webhook payload' });
    return;
  }

  const supabase = getServiceSupabase();
  const { data: payment } = await supabase
    .from('payment_transactions')
    .select(
      'id, business_id, appointment_id, subscription_id, plan_id, amount, currency, status, moolre_reference'
    )
    .eq('moolre_reference', externalRef)
    .is('appointment_id', null)
    .maybeSingle();

  if (!payment) {
    // Acknowledge unknown externalref to prevent infinite gateway retries
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  if (payment.status === 'successful') {
    res.status(200).json({ ok: true, alreadyVerified: true });
    return;
  }

  // Never trust webhook body alone — independently verify transaction via Moolre status API
  const result = await verifyAndActivateSubscriptionPayment({
    supabase,
    payment,
  });

  res.status(200).json({
    ok: true,
    status: result.status,
    activated: Boolean(result.activated),
    alreadyVerified: Boolean(result.alreadyVerified),
    message: result.message,
  });
}
