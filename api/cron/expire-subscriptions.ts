import { getServiceSupabase } from '../_lib/supabase.js';

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
  const nowIso = new Date().toISOString();

  // Expire trialing/active subscriptions past current_period_end
  const { data: expired, error } = await supabase
    .from('business_subscriptions')
    .update({ status: 'expired', payment_status: 'none' })
    .in('status', ['trialing', 'active', 'past_due'])
    .lt('current_period_end', nowIso)
    .select('id, business_id');

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ ok: true, expired: expired?.length || 0 });
}