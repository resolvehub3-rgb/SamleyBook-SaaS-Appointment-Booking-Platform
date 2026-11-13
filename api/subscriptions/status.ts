import { getServiceSupabase } from '../_lib/supabase.js';
import {
  getAuthoritativeBusinessSubscription,
  isServerSuperAdmin,
} from '../_lib/subscription.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const businessId = String(req.query?.businessId || '').trim();
  if (!businessId) {
    res.status(400).json({ error: 'Missing businessId' });
    return;
  }

  const supabase = getServiceSupabase();
  const { data: userData } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id, owner_id')
    .eq('id', businessId)
    .maybeSingle();

  const isAdmin = await isServerSuperAdmin(supabase, user.id, user.email);
  if (!business || (!isAdmin && business.owner_id !== user.id)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const { subscription, evaluation } = await getAuthoritativeBusinessSubscription(
    supabase,
    businessId
  );

  res.status(200).json({
    ok: true,
    serverNowUtc: new Date().toISOString(),
    subscription,
    evaluation,
  });
}
