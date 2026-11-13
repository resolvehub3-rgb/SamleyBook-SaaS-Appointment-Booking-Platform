import { getServiceSupabase } from '../_lib/supabase.js';

type HealthState = 'healthy' | 'degraded' | 'unconfigured' | 'unknown';

interface ServiceCheck {
  key: string;
  label: string;
  status: HealthState;
  detail: string;
  checkedAt: string;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const checkedAt = new Date().toISOString();
  const checks: ServiceCheck[] = [];

  // 1. Server-side Supabase & Auth Check
  const hasServerUrl = !!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!hasServerUrl || !hasServiceKey) {
    checks.push({
      key: 'database',
      label: 'Supabase Database (Server)',
      status: 'unconfigured',
      detail: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server environment.',
      checkedAt,
    });
    checks.push({
      key: 'auth',
      label: 'Authentication Service',
      status: 'unknown',
      detail: 'Server service role is unconfigured; client session still uses public anon key.',
      checkedAt,
    });
  } else {
    try {
      const supabase = getServiceSupabase();
      const { error: dbErr } = await supabase.from('businesses').select('id', { count: 'exact', head: true });
      checks.push({
        key: 'database',
        label: 'Supabase Database (Server)',
        status: dbErr ? 'degraded' : 'healthy',
        detail: dbErr ? dbErr.message : 'Connected and responding to queries.',
        checkedAt,
      });

      const { error: authErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
      checks.push({
        key: 'auth',
        label: 'Authentication Service',
        status: authErr ? 'degraded' : 'healthy',
        detail: authErr ? authErr.message : 'Supabase Auth admin endpoint reachable.',
        checkedAt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      checks.push({
        key: 'database',
        label: 'Supabase Database (Server)',
        status: 'degraded',
        detail: msg,
        checkedAt,
      });
      checks.push({
        key: 'auth',
        label: 'Authentication Service',
        status: 'unknown',
        detail: 'Unable to probe auth while database check failed.',
        checkedAt,
      });
    }
  }

  // 2. SasuSync SMS Gateway Environment Readiness
  const smsConfigured =
    !!process.env.SASUSYNC_API_KEY &&
    !!process.env.SASUSYNC_SENDER_ID &&
    !!process.env.SASUSYNC_BASE_URL &&
    !!process.env.SASUSYNC_WEBHOOK_SECRET;

  checks.push({
    key: 'sms_gateway',
    label: 'SasuSync SMS Gateway',
    status: smsConfigured ? 'healthy' : 'unconfigured',
    detail: smsConfigured
      ? `Sender "${process.env.SASUSYNC_SENDER_ID}" configured with webhook signature secret.`
      : 'One or more SasuSync environment variables are not set.',
    checkedAt,
  });

  // 3. Payment Verification (Moolre) Environment Readiness
  const moolreConfigured = !!(
    process.env.MOOLRE_API_USER ||
    process.env.MOOLRE_API_PUBKEY ||
    process.env.MOOLRE_ACCOUNT_NUMBER ||
    process.env.VITE_MOOLRE_API_USER
  );
  checks.push({
    key: 'payments',
    label: 'Moolre Payment Verification',
    status: moolreConfigured ? 'healthy' : 'unconfigured',
    detail: moolreConfigured
      ? 'Payment gateway credentials present.'
      : 'Payment gateway credentials are not configured on this server.',
    checkedAt,
  });

  // 4. Cron Secret / Background Automation Readiness
  const hasCronSecret = !!process.env.CRON_SECRET;
  checks.push({
    key: 'cron',
    label: 'Scheduled Cron Endpoints',
    status: hasCronSecret ? 'healthy' : 'degraded',
    detail: hasCronSecret
      ? 'CRON_SECRET configured for reminder & subscription expiry jobs.'
      : 'CRON_SECRET is unset; verify scheduled job authentication before production.',
    checkedAt,
  });

  res.status(200).json({
    ok: true,
    checkedAt,
    checks,
  });
}
