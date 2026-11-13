import crypto from 'node:crypto';
import {
  SAMLEYBOOK_PLAN_CURRENCY,
  SAMLEYBOOK_PLAN_PRICE_GHS,
  computeRenewalPeriod,
  validateMoolreSubscriptionVerification,
} from '../../src/utils/subscription-access.js';
import { createAndDispatchOwnerNotification } from './push.js';
import { buildDeepLinkDestination } from '../../src/utils/notifications.js';

export type GhanaMomoNetwork = 'MTN MoMo' | 'Telecel Cash' | 'AT Money';

export interface MoolreConfig {
  baseUrl: string;
  apiUser: string;
  apiPubkey: string;
  accountNumber: string;
  webhookSecret?: string;
}

export function getMoolreConfig(): MoolreConfig | null {
  const apiUser = (process.env.MOOLRE_API_USER || '').trim();
  const apiPubkey = (process.env.MOOLRE_API_PUBKEY || '').trim();
  const accountNumber = (process.env.MOOLRE_ACCOUNT_NUMBER || '').trim();

  if (!apiUser || !apiPubkey || !accountNumber) {
    return null;
  }

  return {
    baseUrl: (process.env.MOOLRE_BASE_URL || 'https://api.moolre.com').replace(/\/$/, ''),
    apiUser,
    apiPubkey,
    accountNumber,
    webhookSecret: (process.env.MOOLRE_WEBHOOK_SECRET || '').trim() || undefined,
  };
}

export function mapMomoNetworkToChannel(network: string | undefined | null): string {
  const normalized = (network || 'MTN MoMo').toLowerCase().trim();
  if (normalized.includes('telecel') || normalized.includes('vodafone') || normalized === '6') {
    return '6';
  }
  if (
    normalized.includes('at') ||
    normalized.includes('airtel') ||
    normalized.includes('tigo') ||
    normalized === '7'
  ) {
    return '7';
  }
  return '13'; // MTN MoMo default
}

export function normalizeGhanaMomoPhone(phone: string): string | null {
  const cleaned = (phone || '').replace(/[\s-()]/g, '');
  if (/^\+233[235][0-9]{8}$/.test(cleaned)) {
    return `0${cleaned.slice(4)}`;
  }
  if (/^233[235][0-9]{8}$/.test(cleaned)) {
    return `0${cleaned.slice(3)}`;
  }
  if (/^0[235][0-9]{8}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

export interface MoolreInitiateResult {
  ok: boolean;
  requiresOtp?: boolean;
  code?: string;
  message: string;
  raw?: Record<string, unknown>;
}

export async function initiateMoolreMomoPayment(params: {
  payerPhone: string;
  network: string;
  amountGhs: number;
  externalRef: string;
  narrative: string;
  otpCode?: string;
}): Promise<MoolreInitiateResult> {
  const cfg = getMoolreConfig();
  if (!cfg) {
    return {
      ok: false,
      code: 'MOOLRE_NOT_CONFIGURED',
      message:
        'Moolre payment gateway credentials (MOOLRE_API_USER, MOOLRE_API_PUBKEY, MOOLRE_ACCOUNT_NUMBER) are not configured on this server.',
    };
  }

  const normalizedPhone = normalizeGhanaMomoPhone(params.payerPhone);
  if (!normalizedPhone) {
    return {
      ok: false,
      code: 'INVALID_PHONE',
      message: 'Please provide a valid Ghanaian Mobile Money number (e.g. 024XXXXXXX).',
    };
  }

  const channel = mapMomoNetworkToChannel(params.network);
  const bodyPayload: Record<string, unknown> = {
    type: 1,
    channel,
    currency: SAMLEYBOOK_PLAN_CURRENCY,
    payer: normalizedPhone,
    amount: String(Number(params.amountGhs).toFixed(2)),
    externalref: params.externalRef,
    reference: params.narrative,
    accountnumber: cfg.accountNumber,
  };

  if (params.otpCode && params.otpCode.trim()) {
    bodyPayload.otpcode = params.otpCode.trim();
  }

  const res = await fetch(`${cfg.baseUrl}/open/transact/payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-USER': cfg.apiUser,
      'X-API-PUBKEY': cfg.apiPubkey,
    },
    body: JSON.stringify(bodyPayload),
  });

  const data: any = await res.json().catch(() => ({}));
  const code = String(data?.code || '');
  const message = String(data?.message || data?.error || '');

  // Moolre TP14 indicates an OTP prompt is required before triggering USSD push
  if (code === 'TP14') {
    return {
      ok: false,
      requiresOtp: true,
      code,
      message: message || 'Enter the OTP sent to your Mobile Money number to continue.',
      raw: data,
    };
  }

  const isSuccess = res.ok && (data?.status === 1 || data?.status === true || code === 'TR099');
  if (!isSuccess) {
    return {
      ok: false,
      code: code || `HTTP_${res.status}`,
      message: message || 'Moolre could not initiate the Mobile Money payment prompt.',
      raw: data,
    };
  }

  return {
    ok: true,
    code,
    message:
      message ||
      'Payment prompt sent to your phone. Approve the Mobile Money prompt to complete renewal.',
    raw: data,
  };
}

export interface MoolreStatusResult {
  ok: boolean;
  txStatus?: number;
  amount?: number;
  currency?: string;
  externalRef?: string;
  transactionId?: string;
  thirdPartyRef?: string;
  message: string;
  raw?: Record<string, unknown>;
}

export async function checkMoolreTransactionStatus(
  externalRef: string
): Promise<MoolreStatusResult> {
  const cfg = getMoolreConfig();
  if (!cfg) {
    return {
      ok: false,
      message:
        'Moolre payment gateway credentials are not configured on this server. Cannot verify payment.',
    };
  }

  const res = await fetch(`${cfg.baseUrl}/open/transact/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-USER': cfg.apiUser,
      'X-API-PUBKEY': cfg.apiPubkey,
    },
    body: JSON.stringify({
      type: 1,
      idtype: 1,
      id: externalRef,
      accountnumber: cfg.accountNumber,
    }),
  });

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      message: String(data?.message || `Moolre status check returned HTTP ${res.status}`),
      raw: data,
    };
  }

  const txData = data?.data || {};
  const txStatus =
    typeof txData.txstatus === 'number'
      ? txData.txstatus
      : txData.txstatus !== undefined
      ? Number(txData.txstatus)
      : undefined;

  return {
    ok: true,
    txStatus,
    amount:
      txData.amount !== undefined
        ? Number(txData.amount)
        : txData.value !== undefined
        ? Number(txData.value)
        : undefined,
    currency: String(txData.currency || SAMLEYBOOK_PLAN_CURRENCY),
    externalRef: txData.externalref ? String(txData.externalref) : externalRef,
    transactionId: txData.transactionid ? String(txData.transactionid) : undefined,
    thirdPartyRef: txData.thirdpartyref ? String(txData.thirdpartyref) : undefined,
    message: String(data?.message || ''),
    raw: data,
  };
}

export function verifyWebhookSecretIfConfigured(req: any): boolean {
  const secret = (process.env.MOOLRE_WEBHOOK_SECRET || '').trim();
  if (!secret) return true; // Rely on direct server-to-server Moolre status re-verification

  const headerSecret =
    (req.headers['x-moolre-secret'] as string | undefined) ||
    (req.headers['x-webhook-secret'] as string | undefined) ||
    (req.query?.secret as string | undefined) ||
    '';

  if (headerSecret && headerSecret.length === secret.length) {
    return crypto.timingSafeEqual(Buffer.from(headerSecret), Buffer.from(secret));
  }

  return false;
}

/**
 * Atomically and idempotently verifies a payment row against Moolre and applies
 * the 30-day UTC subscription renewal.
 */
export async function verifyAndActivateSubscriptionPayment(params: {
  supabase: any;
  payment: {
    id: string;
    business_id: string;
    subscription_id: string | null;
    plan_id: string | null;
    amount: number | string;
    currency?: string | null;
    status: string;
    moolre_reference: string;
  };
}): Promise<{
  ok: boolean;
  status: 'successful' | 'pending' | 'failed';
  alreadyVerified?: boolean;
  activated?: boolean;
  subscription?: any;
  message: string;
}> {
  const { supabase, payment } = params;

  if (payment.status === 'successful') {
    const { data: currentSub } = await supabase
      .from('business_subscriptions')
      .select('*, plan:subscription_plans(*)')
      .eq('business_id', payment.business_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      ok: true,
      status: 'successful',
      alreadyVerified: true,
      subscription: currentSub || null,
      message: 'Subscription payment has already been verified and applied.',
    };
  }

  // 1. Independently query Moolre transaction status
  const providerStatus = await checkMoolreTransactionStatus(payment.moolre_reference);
  if (!providerStatus.ok) {
    return {
      ok: false,
      status: 'pending',
      message: providerStatus.message,
    };
  }

  const integrity = validateMoolreSubscriptionVerification({
    expectedReference: payment.moolre_reference,
    providerExternalRef: providerStatus.externalRef,
    txStatus: providerStatus.txStatus,
    paidAmount: providerStatus.amount,
    expectedAmountGhs: SAMLEYBOOK_PLAN_PRICE_GHS,
    currency: providerStatus.currency,
  });

  if (integrity.state === 'pending') {
    return {
      ok: false,
      status: 'pending',
      message:
        integrity.reason ||
        'Awaiting Mobile Money approval on your phone. Once approved, click Verify Payment Status.',
    };
  }

  const now = new Date();
  const providerRef = providerStatus.transactionId || providerStatus.thirdPartyRef || null;

  if (integrity.state === 'failed' || !integrity.valid) {
    await supabase
      .from('payment_transactions')
      .update({
        status: 'failed',
        provider_reference: providerRef,
        raw_response: {
          ...(providerStatus.raw || {}),
          verification_error: integrity.reason || 'Payment failed',
          checked_at: now.toISOString(),
        },
        updated_at: now.toISOString(),
      })
      .eq('id', payment.id)
      .neq('status', 'successful');

    return {
      ok: false,
      status: 'failed',
      message: integrity.reason || 'Subscription payment failed or was declined.',
    };
  }

  // 2. Payment confirmed by Moolre (txstatus = 1, amount >= 120 GHS, reference matches).
  // Apply atomic database activation via PostgreSQL RPC first, with conditional-update fallback.
  const enrichedRaw = {
    ...(providerStatus.raw || {}),
    verified_via: 'moolre_status_api',
    verified_at: now.toISOString(),
    verified_amount: providerStatus.amount,
    verified_currency: providerStatus.currency,
  };

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'activate_subscription_from_payment',
    {
      p_payment_id: payment.id,
      p_provider_reference: providerRef,
      p_raw_response: enrichedRaw,
      p_verified_at: now.toISOString(),
      p_period_days: 30,
    }
  );

  if (!rpcError && rpcResult) {
    const parsed = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
    const { data: refreshedSub } = await supabase
      .from('business_subscriptions')
      .select('*, plan:subscription_plans(*)')
      .eq('business_id', payment.business_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (parsed.already_verified) {
      return {
        ok: true,
        status: 'successful',
        alreadyVerified: true,
        subscription: refreshedSub || null,
        message: 'Subscription payment already verified.',
      };
    }

    await notifySubscriptionRenewed(supabase, payment.business_id, payment.id);

    return {
      ok: true,
      status: 'successful',
      activated: true,
      subscription: refreshedSub || null,
      message: 'SamleyBook Premium renewed successfully for 30 days.',
    };
  }

  // Fallback path if RPC migration hasn't been executed yet:
  // Use conditional UPDATE on status != 'successful' so concurrent calls cannot both extend!
  const { data: claimedPayment } = await supabase
    .from('payment_transactions')
    .update({
      status: 'successful',
      provider_reference: providerRef,
      raw_response: enrichedRaw,
      updated_at: now.toISOString(),
    })
    .eq('id', payment.id)
    .neq('status', 'successful')
    .select('id')
    .maybeSingle();

  if (!claimedPayment) {
    const { data: existingSub } = await supabase
      .from('business_subscriptions')
      .select('*, plan:subscription_plans(*)')
      .eq('business_id', payment.business_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      ok: true,
      status: 'successful',
      alreadyVerified: true,
      subscription: existingSub || null,
      message: 'Subscription payment already processed.',
    };
  }

  const { data: existingSub } = await supabase
    .from('business_subscriptions')
    .select('*')
    .eq('business_id', payment.business_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const renewal = computeRenewalPeriod({
    currentStatus: existingSub?.status,
    currentPeriodEnd: existingSub?.current_period_end,
    trialEnd: existingSub?.trial_end,
    paidAt: now,
    periodDays: 30,
  });

  if (existingSub?.id) {
    await supabase
      .from('business_subscriptions')
      .update({
        plan_id: payment.plan_id || existingSub.plan_id,
        status: 'active',
        payment_status: 'paid',
        current_period_start: renewal.periodStartIso,
        current_period_end: renewal.periodEndIso,
        updated_at: now.toISOString(),
      })
      .eq('id', existingSub.id);
  } else {
    await supabase.from('business_subscriptions').insert({
      business_id: payment.business_id,
      plan_id: payment.plan_id,
      status: 'active',
      payment_status: 'paid',
      trial_start: renewal.periodStartIso,
      trial_end: renewal.periodStartIso,
      current_period_start: renewal.periodStartIso,
      current_period_end: renewal.periodEndIso,
    });
  }

  const { data: finalSub } = await supabase
    .from('business_subscriptions')
    .select('*, plan:subscription_plans(*)')
    .eq('business_id', payment.business_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  await notifySubscriptionRenewed(supabase, payment.business_id, payment.id);

  return {
    ok: true,
    status: 'successful',
    activated: true,
    subscription: finalSub || null,
    message: 'SamleyBook Premium renewed successfully for 30 days.',
  };
}

async function notifySubscriptionRenewed(
  supabase: any,
  businessId: string,
  paymentId: string
): Promise<void> {
  try {
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, name, owner_id')
      .eq('id', businessId)
      .maybeSingle();
    if (!biz?.owner_id) return;

    await createAndDispatchOwnerNotification(supabase, {
      userId: biz.owner_id,
      businessId: biz.id,
      category: 'subscription',
      title: `Subscription Renewed: ${biz.name}`,
      body: 'Your SamleyBook Premium subscription has been verified and extended for 30 days.',
      entityType: 'payment',
      entityId: paymentId,
      destinationUrl: buildDeepLinkDestination({ category: 'subscription' }),
      metadata: {
        tier: 'renewed',
        business_name: biz.name,
        payment_id: paymentId,
      },
      idempotencyKey: `subscription:renewed:${paymentId}`,
    });
  } catch (err) {
    console.error('Failed to send subscription renewal notification:', err);
  }
}
