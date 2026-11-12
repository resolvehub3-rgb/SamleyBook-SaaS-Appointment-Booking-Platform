import { getServiceSupabase } from '../_lib/supabase.js';
import crypto from 'node:crypto';

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
  const user = userData?.user;
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  let body: any = {};
  try {
    if (req.body && typeof req.body === 'object') body = req.body;
    else {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const raw = Buffer.concat(chunks).toString('utf8');
      body = raw ? JSON.parse(raw) : {};
    }
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const { businessId, planCode } = body;
  if (!businessId || !planCode) {
    res.status(400).json({ error: 'Missing businessId or planCode' });
    return;
  }

  // Verify ownership
  const { data: business } = await supabase
    .from('businesses')
    .select('id, owner_id')
    .eq('id', businessId)
    .single();
  if (!business || business.owner_id !== user.id) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('id, price_ghs, billing_cycle')
    .eq('code', planCode)
    .single();
  if (!plan) {
    res.status(404).json({ error: 'Plan not found' });
    return;
  }

  // Find or create subscription
  let { data: sub } = await supabase
    .from('business_subscriptions')
    .select('id')
    .eq('business_id', businessId)
    .maybeSingle();
  if (!sub) {
    const { data: newSub } = await supabase
      .from('business_subscriptions')
      .insert({ business_id: businessId, plan_id: plan.id, status: 'expired', payment_status: 'none' })
      .select('id')
      .single();
    sub = newSub;
  } else {
    await supabase.from('business_subscriptions').update({ plan_id: plan.id }).eq('id', sub.id);
  }

  const reference = `SUB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  const { data: payment, error: payErr } = await supabase
    .from('payment_transactions')
    .insert({
      business_id: businessId,
      subscription_id: sub?.id || null,
      plan_id: plan.id,
      amount: plan.price_ghs,
      currency: 'GHS',
      payment_provider: 'Moolre',
      moolre_reference: reference,
      payment_status: 'pending',
      status: 'pending',
    })
    .select('id')
    .single();

  if (payErr) {
    res.status(500).json({ error: payErr.message });
    return;
  }

  res.status(200).json({
    ok: true,
    paymentId: payment.id,
    reference,
    amount: plan.price_ghs,
    currency: 'GHS',
    planCode,
  });
}