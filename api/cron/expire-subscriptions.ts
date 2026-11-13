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

  // 1. Expire active/past_due subscriptions past current_period_end
  const { data: expiredActive, error: activeErr } = await supabase
    .from('business_subscriptions')
    .update({ status: 'expired', payment_status: 'none', updated_at: nowIso })
    .in('status', ['active', 'past_due'])
    .lt('current_period_end', nowIso)
    .select('id, business_id');

  if (activeErr) {
    res.status(500).json({ error: activeErr.message });
    return;
  }

  // 2. Expire trialing subscriptions past either trial_end or current_period_end
  const { data: expiredTrials, error: trialErr } = await supabase
    .from('business_subscriptions')
    .update({ status: 'expired', payment_status: 'none', updated_at: nowIso })
    .eq('status', 'trialing')
    .or(`trial_end.lt.${nowIso},current_period_end.lt.${nowIso}`)
    .select('id, business_id');

  if (trialErr) {
    res.status(500).json({ error: trialErr.message });
    return;
  }

  const totalExpired = (expiredActive?.length || 0) + (expiredTrials?.length || 0);
  res.status(200).json({ ok: true, expired: totalExpired });
}