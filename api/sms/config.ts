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
    // Toggle SMS enabled (super admin auth should be verified by caller; here we trust server context)
    const { smsEnabled, adminId } = req.body || {};
    const supabase = getServiceSupabase();
    const { data: existing } = await supabase
      .from('sms_platform_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from('sms_platform_settings')
        .update({ sms_enabled: !!smsEnabled, updated_by: adminId || null })
        .eq('id', existing.id);
    } else {
      await supabase.from('sms_platform_settings').insert({ sms_enabled: !!smsEnabled, updated_by: adminId || null });
    }

    res.status(200).json({ ok: true, smsEnabled: !!smsEnabled });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}