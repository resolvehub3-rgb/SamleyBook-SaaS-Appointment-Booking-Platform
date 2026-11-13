import { getServiceSupabase } from '../_lib/supabase.js';

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    const supabase = getServiceSupabase();
    const { data: settings } = await supabase
      .from('sms_platform_settings')
      .select('sms_enabled, updated_at')
      .limit(1)
      .maybeSingle();

    res.status(200).json({
      provider: 'SasuSync',
      configured: !!process.env.SASUSYNC_API_KEY && !!process.env.SASUSYNC_SENDER_ID && !!process.env.SASUSYNC_BASE_URL && !!process.env.SASUSYNC_WEBHOOK_SECRET,
      senderId: process.env.SASUSYNC_SENDER_ID || null,
      baseUrl: process.env.SASUSYNC_BASE_URL || null,
      smsEnabled: settings?.sms_enabled ?? true,
      updatedAt: settings?.updated_at || null,
      hasApiKey: !!process.env.SASUSYNC_API_KEY,
      hasWebhookSecret: !!process.env.SASUSYNC_WEBHOOK_SECRET,
    });
    return;
  }

  if (req.method === 'POST') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: 'Unauthorized: missing access token' });
      return;
    }

    const supabase = getServiceSupabase();
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) {
      res.status(401).json({ error: 'Unauthorized: invalid session' });
      return;
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileData?.role !== 'super_admin') {
      res.status(403).json({ error: 'Forbidden: Super Admin access required' });
      return;
    }

    const { smsEnabled } = req.body || {};
    const { data: existing } = await supabase
      .from('sms_platform_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from('sms_platform_settings')
        .update({ sms_enabled: !!smsEnabled, updated_by: user.id })
        .eq('id', existing.id);
    } else {
      await supabase.from('sms_platform_settings').insert({ sms_enabled: !!smsEnabled, updated_by: user.id });
    }

    res.status(200).json({ ok: true, smsEnabled: !!smsEnabled });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}