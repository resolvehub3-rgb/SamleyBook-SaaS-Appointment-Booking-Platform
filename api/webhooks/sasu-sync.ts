import crypto from 'node:crypto';
import { getServiceSupabase } from '../_lib/supabase.js';
import { verifyWebhookSignature } from '../_lib/sms.js';

async function readRawBody(req: any): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

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

export default async function handler(req: any, res: any) {
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

  const taskId =
    payload?.task_id || payload?.taskId || payload?.data?.task_id || null;
  const incomingStatus = String(
    payload?.status || payload?.event || payload?.delivery_status || ''
  ).toLowerCase();

  if (!taskId) {
    res.status(400).json({ error: 'Missing task_id' });
    return;
  }

  const supabase = getServiceSupabase();

  const { data: record } = await supabase
    .from('sms_notifications')
    .select('id, delivery_status')
    .eq('sasusync_task_id', taskId)
    .maybeSingle();

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