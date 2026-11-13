import crypto from 'node:crypto';
import { getServiceSupabase } from '../supabase.js';
import { readJson } from '../http.js';
import {
  initiateMoolreMomoPayment,
  normalizeGhanaMomoPhone,
  verifyAndActivateSubscriptionPayment,
} from '../moolre.js';
import {
  getAuthoritativeBusinessSubscription,
  isServerSuperAdmin,
} from '../subscription.js';
import {
  SAMLEYBOOK_PLAN_CODE,
  SAMLEYBOOK_PLAN_CURRENCY,
  SAMLEYBOOK_PLAN_NAME,
  SAMLEYBOOK_PLAN_PRICE_GHS,
} from '../../../src/utils/subscription-access.js';

export async function handleSubscriptionsInitiate(req: any, res: any) {
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

  const { businessId, payerPhone, network, otpCode } = body;
  if (!businessId) {
    res.status(400).json({ error: 'Missing businessId' });
    return;
  }

  const normalizedPhone = normalizeGhanaMomoPhone(String(payerPhone || ''));
  if (!normalizedPhone) {
    res.status(400).json({
      error: 'Please enter a valid Ghanaian Mobile Money number (e.g. 024XXXXXXX).',
    });
    return;
  }

  // Verify business exists and caller is either its owner or Super Admin
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, owner_id, phone')
    .eq('id', businessId)
    .maybeSingle();

  if (!business) {
    res.status(404).json({ error: 'Business not found' });
    return;
  }

  const isAdmin = await isServerSuperAdmin(supabase, user.id, user.email);
  if (!isAdmin && business.owner_id !== user.id) {
    res.status(403).json({ error: 'Forbidden: you do not own this business' });
    return;
  }

  // Resolve the single SamleyBook Premium plan from DB (authoritative server price GH₵120)
  let { data: plan } = await supabase
    .from('subscription_plans')
    .select('id, name, code, price_ghs, billing_cycle')
    .in('code', [SAMLEYBOOK_PLAN_CODE, 'book-premium', 'starter'])
    .eq('is_active', true)
    .order('price_ghs', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!plan) {
    const { data: createdPlan } = await supabase
      .from('subscription_plans')
      .upsert(
        {
          name: SAMLEYBOOK_PLAN_NAME,
          code: SAMLEYBOOK_PLAN_CODE,
          description:
            'Complete appointment booking, dashboard, SMS notifications, and customer management for your business.',
          price_ghs: SAMLEYBOOK_PLAN_PRICE_GHS,
          billing_cycle: 'monthly',
          is_active: true,
        },
        { onConflict: 'code' }
      )
      .select('id, name, code, price_ghs, billing_cycle')
      .single();
    plan = createdPlan;
  }

  // Authoritative server price is always GH₵120
  const authoritativeAmount = SAMLEYBOOK_PLAN_PRICE_GHS;

  // Locate latest subscription record for this business (or create expired placeholder if missing)
  let { data: sub } = await supabase
    .from('business_subscriptions')
    .select('id, plan_id')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub) {
    const pastIso = new Date(Date.now() - 1000).toISOString();
    const { data: newSub } = await supabase
      .from('business_subscriptions')
      .insert({
        business_id: businessId,
        plan_id: plan?.id || null,
        status: 'expired',
        trial_start: pastIso,
        trial_end: pastIso,
        current_period_start: pastIso,
        current_period_end: pastIso,
        payment_status: 'none',
      })
      .select('id, plan_id')
      .single();
    sub = newSub;
  }

  const reference = `SB-SUB-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(4)
    .toString('hex')
    .toUpperCase()}`;

  // Insert pending payment transaction BEFORE dispatching Moolre prompt
  const { data: payment, error: payErr } = await supabase
    .from('payment_transactions')
    .insert({
      business_id: businessId,
      subscription_id: sub?.id || null,
      plan_id: plan?.id || null,
      customer_phone: normalizedPhone,
      amount: authoritativeAmount,
      currency: SAMLEYBOOK_PLAN_CURRENCY,
      payment_provider: 'Moolre',
      moolre_reference: reference,
      status: 'pending',
      raw_response: {
        network: network || 'MTN MoMo',
        payer_phone: normalizedPhone,
        initiated_by: user.id,
        initiated_at: new Date().toISOString(),
      },
    })
    .select('id')
    .single();

  if (payErr || !payment) {
    res.status(500).json({ error: payErr?.message || 'Failed to record payment attempt.' });
    return;
  }

  // Call real Moolre API — never simulate or auto-activate on initiation!
  const moolreRes = await initiateMoolreMomoPayment({
    payerPhone: normalizedPhone,
    network: String(network || 'MTN MoMo'),
    amountGhs: authoritativeAmount,
    externalRef: reference,
    narrative: `${SAMLEYBOOK_PLAN_NAME} (${business.name})`,
    otpCode: otpCode ? String(otpCode) : undefined,
  });

  if (moolreRes.requiresOtp) {
    await supabase
      .from('payment_transactions')
      .update({
        status: 'failed',
        raw_response: {
          network: network || 'MTN MoMo',
          payer_phone: normalizedPhone,
          requires_otp: true,
          moolre_response: moolreRes.raw || null,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id);

    res.status(200).json({
      ok: false,
      requiresOtp: true,
      code: moolreRes.code,
      message: moolreRes.message,
    });
    return;
  }

  if (!moolreRes.ok) {
    await supabase
      .from('payment_transactions')
      .update({
        status: 'failed',
        raw_response: {
          network: network || 'MTN MoMo',
          payer_phone: normalizedPhone,
          initiation_error: moolreRes.message,
          moolre_response: moolreRes.raw || null,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id);

    const statusCode = moolreRes.code === 'MOOLRE_NOT_CONFIGURED' ? 503 : 400;
    res.status(statusCode).json({
      error: moolreRes.message,
      code: moolreRes.code,
    });
    return;
  }

  await supabase
    .from('payment_transactions')
    .update({
      raw_response: {
        network: network || 'MTN MoMo',
        payer_phone: normalizedPhone,
        initiated_by: user.id,
        initiated_at: new Date().toISOString(),
        moolre_response: moolreRes.raw || null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', payment.id);

  res.status(200).json({
    ok: true,
    status: 'pending',
    paymentId: payment.id,
    reference,
    amount: authoritativeAmount,
    currency: SAMLEYBOOK_PLAN_CURRENCY,
    planName: SAMLEYBOOK_PLAN_NAME,
    message: moolreRes.message,
  });
}

export async function handleSubscriptionsVerify(req: any, res: any) {
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

export async function handleSubscriptionsStatus(req: any, res: any) {
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
