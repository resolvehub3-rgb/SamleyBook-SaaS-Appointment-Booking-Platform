import { getServiceSupabase } from '../_lib/supabase.js';
import {
  verifyAndActivateSubscriptionPayment,
  verifyWebhookSecretIfConfigured,
} from '../_lib/moolre.js';

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
