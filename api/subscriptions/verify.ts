import { getServiceSupabase } from '../_lib/supabase.js';

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

  const { reference } = body;
  if (!reference) {
    res.status(400).json({ error: 'Missing reference' });
    return;
  }

  const { data: payment } = await supabase
    .from('payment_transactions')
    .select('id, business_id, subscription_id, plan_id, amount, status, moolre_reference')
    .eq('moolre_reference', reference)
    .maybeSingle();

  if (!payment) {
    res.status(404).json({ error: 'Payment not found' });
    return;
  }

  // Verify ownership
  const { data: business } = await supabase
    .from('businesses')
    .select('id, owner_id')
    .eq('id', payment.business_id)
    .single();
  if (!business || business.owner_id !== user.id) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  if (payment.status === 'successful') {
    res.status(200).json({ ok: true, alreadyVerified: true });
    return;
  }

  // Mark payment successful (in real implementation, verify with Moolre here)
  await supabase
    .from('payment_transactions')
    .update({ status: 'successful', raw_response: { verified_at: new Date().toISOString() } })
    .eq('id', payment.id);

  // Activate subscription
  if (payment.subscription_id) {
    const { data: plan } = await supabase
      .from('subscription_plans')
      .select('billing_cycle')
      .eq('id', payment.plan_id)
      .single();
    const months = plan?.billing_cycle === 'yearly' ? 12 : 1;
    const newEnd = new Date();
    newEnd.setMonth(newEnd.getMonth() + months);

    await supabase
      .from('business_subscriptions')
      .update({
        status: 'active',
        payment_status: 'paid',
        current_period_start: new Date().toISOString(),
        current_period_end: newEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.subscription_id);
  }

  res.status(200).json({ ok: true, activated: true });
}