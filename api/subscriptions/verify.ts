import { getServiceSupabase } from '../_lib/supabase.js';
import { verifyAndActivateSubscriptionPayment } from '../_lib/moolre.js';
import { isServerSuperAdmin } from '../_lib/subscription.js';

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

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: missing access token' });
    return;
  }

  const supabase = getServiceSupabase();
  const { data: userData } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (!user) {
    res.status(401).json({ error: 'Unauthorized: invalid session' });
    return;
  }

  let body: any = {};
  try {
    body = await readJson(req);
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const { reference } = body;
  if (!reference || typeof reference !== 'string') {
    res.status(400).json({ error: 'Missing payment reference' });
    return;
  }

  const { data: payment } = await supabase
    .from('payment_transactions')
    .select(
      'id, business_id, appointment_id, subscription_id, plan_id, amount, currency, status, moolre_reference'
    )
    .eq('moolre_reference', reference.trim())
    .is('appointment_id', null)
    .maybeSingle();

  if (!payment) {
    res.status(404).json({ error: 'Subscription payment transaction not found' });
    return;
  }

  // Verify ownership or Super Admin authorization
  const { data: business } = await supabase
    .from('businesses')
    .select('id, owner_id')
    .eq('id', payment.business_id)
    .maybeSingle();

  const isAdmin = await isServerSuperAdmin(supabase, user.id, user.email);
  if (!business || (!isAdmin && business.owner_id !== user.id)) {
    res.status(403).json({ error: 'Forbidden: access denied for this business' });
    return;
  }

  const result = await verifyAndActivateSubscriptionPayment({
    supabase,
    payment,
  });

  if (result.status === 'pending') {
    res.status(200).json({
      ok: false,
      status: 'pending',
      message: result.message,
    });
    return;
  }

  if (result.status === 'failed' || !result.ok) {
    res.status(402).json({
      ok: false,
      status: 'failed',
      error: result.message,
    });
    return;
  }

  res.status(200).json({
    ok: true,
    status: 'successful',
    alreadyVerified: Boolean(result.alreadyVerified),
    activated: Boolean(result.activated),
    subscription: result.subscription || null,
    message: result.message,
  });
}