/**
 * Authoritative subscription access-control and UTC renewal calculations
 * for SamleyBook SaaS.
 *
 * Single offering:
 * - Plan: SamleyBook Premium
 * - Price: GH₵120
 * - Billing interval: Every 30 days
 * - Trial: 7-day free trial for eligible new businesses
 */

export const SAMLEYBOOK_PLAN_NAME = 'SamleyBook Premium';
export const SAMLEYBOOK_PLAN_CODE = 'premium';
export const SAMLEYBOOK_PLAN_PRICE_GHS = 120;
export const SAMLEYBOOK_PLAN_CURRENCY = 'GHS';
export const SAMLEYBOOK_PERIOD_DAYS = 30;
export const SAMLEYBOOK_TRIAL_DAYS = 7;

export const DAY_MS = 24 * 60 * 60 * 1000;
export const THIRTY_DAYS_MS = SAMLEYBOOK_PERIOD_DAYS * DAY_MS;

export interface SubscriptionSnapshot {
  id?: string | null;
  business_id?: string | null;
  status?: string | null;
  trial_start?: string | null;
  trial_end?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  payment_status?: string | null;
}

export type SubscriptionBlockReason =
  | 'ok'
  | 'no_subscription'
  | 'trial_expired'
  | 'subscription_expired'
  | 'status_blocked';

export interface SubscriptionAccessEvaluation {
  isAllowed: boolean;
  isExpired: boolean;
  isTrial: boolean;
  isPaidActive: boolean;
  isTrialExpired: boolean;
  isPaidExpired: boolean;
  effectiveStatus: 'trialing' | 'active' | 'expired' | 'past_due' | 'canceled';
  expiryIso: string | null;
  expiryTimestampMs: number | null;
  daysRemaining: number;
  hoursRemaining: number;
  reason: SubscriptionBlockReason;
}

function parseUtcTimestampMs(iso: string | null | undefined): number | null {
  if (!iso || typeof iso !== 'string') return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Resolve the authoritative expiry timestamp for a subscription row.
 * For `trialing`, both `trial_end` and `current_period_end` represent the trial window,
 * so the earliest valid timestamp is treated as authoritative to prevent stale-column bypasses.
 */
export function resolveAuthoritativeExpiryIso(
  sub: Pick<SubscriptionSnapshot, 'status' | 'trial_end' | 'current_period_end'> | null | undefined
): string | null {
  if (!sub) return null;

  const status = (sub.status || '').toLowerCase().trim();
  const trialEndMs = parseUtcTimestampMs(sub.trial_end);
  const periodEndMs = parseUtcTimestampMs(sub.current_period_end);

  if (status === 'trialing') {
    if (trialEndMs !== null && periodEndMs !== null) {
      return trialEndMs <= periodEndMs ? sub.trial_end! : sub.current_period_end!;
    }
    if (trialEndMs !== null) return sub.trial_end!;
    if (periodEndMs !== null) return sub.current_period_end!;
    return null;
  }

  if (periodEndMs !== null) return sub.current_period_end!;
  if (trialEndMs !== null) return sub.trial_end!;
  return null;
}

/**
 * Evaluate whether a business has active access to the Business Application
 * using both subscription status and authoritative UTC expiry timestamps.
 */
export function evaluateSubscriptionAccess(
  sub: SubscriptionSnapshot | null | undefined,
  referenceNow: Date = new Date()
): SubscriptionAccessEvaluation {
  const nowMs = referenceNow.getTime();

  if (!sub) {
    return {
      isAllowed: false,
      isExpired: true,
      isTrial: false,
      isPaidActive: false,
      isTrialExpired: false,
      isPaidExpired: true,
      effectiveStatus: 'expired',
      expiryIso: null,
      expiryTimestampMs: null,
      daysRemaining: 0,
      hoursRemaining: 0,
      reason: 'no_subscription',
    };
  }

  const rawStatus = (sub.status || '').toLowerCase().trim();
  const expiryIso = resolveAuthoritativeExpiryIso(sub);
  const expiryMs = parseUtcTimestampMs(expiryIso);

  if (rawStatus === 'trialing') {
    if (expiryMs !== null && expiryMs > nowMs) {
      const diffMs = expiryMs - nowMs;
      return {
        isAllowed: true,
        isExpired: false,
        isTrial: true,
        isPaidActive: false,
        isTrialExpired: false,
        isPaidExpired: false,
        effectiveStatus: 'trialing',
        expiryIso,
        expiryTimestampMs: expiryMs,
        daysRemaining: Math.ceil(diffMs / DAY_MS),
        hoursRemaining: Math.floor(diffMs / (60 * 60 * 1000)),
        reason: 'ok',
      };
    }

    return {
      isAllowed: false,
      isExpired: true,
      isTrial: false,
      isPaidActive: false,
      isTrialExpired: true,
      isPaidExpired: false,
      effectiveStatus: 'expired',
      expiryIso,
      expiryTimestampMs: expiryMs,
      daysRemaining: 0,
      hoursRemaining: 0,
      reason: 'trial_expired',
    };
  }

  if (rawStatus === 'active') {
    if (expiryMs !== null && expiryMs > nowMs) {
      const diffMs = expiryMs - nowMs;
      return {
        isAllowed: true,
        isExpired: false,
        isTrial: false,
        isPaidActive: true,
        isTrialExpired: false,
        isPaidExpired: false,
        effectiveStatus: 'active',
        expiryIso,
        expiryTimestampMs: expiryMs,
        daysRemaining: Math.ceil(diffMs / DAY_MS),
        hoursRemaining: Math.floor(diffMs / (60 * 60 * 1000)),
        reason: 'ok',
      };
    }

    return {
      isAllowed: false,
      isExpired: true,
      isTrial: false,
      isPaidActive: false,
      isTrialExpired: false,
      isPaidExpired: true,
      effectiveStatus: 'expired',
      expiryIso,
      expiryTimestampMs: expiryMs,
      daysRemaining: 0,
      hoursRemaining: 0,
      reason: 'subscription_expired',
    };
  }

  // Explicitly blocked statuses: 'expired', 'past_due', 'canceled', 'pending', or unknown
  const wasTrialOnly =
    (sub.payment_status || 'none') !== 'paid' && Boolean(sub.trial_end);
  const mappedStatus: SubscriptionAccessEvaluation['effectiveStatus'] =
    rawStatus === 'past_due'
      ? 'past_due'
      : rawStatus === 'canceled'
      ? 'canceled'
      : 'expired';

  return {
    isAllowed: false,
    isExpired: true,
    isTrial: false,
    isPaidActive: false,
    isTrialExpired: wasTrialOnly,
    isPaidExpired: !wasTrialOnly,
    effectiveStatus: mappedStatus,
    expiryIso,
    expiryTimestampMs: expiryMs,
    daysRemaining: 0,
    hoursRemaining: 0,
    reason: rawStatus === 'expired' ? (wasTrialOnly ? 'trial_expired' : 'subscription_expired') : 'status_blocked',
  };
}

/**
 * Computes authoritative UTC renewal period timestamps:
 * - Renewal before expiry: new expiry = existing expiry timestamp + 30 days
 * - Renewal after expiry:  new expiry = verified payment timestamp + 30 days
 */
export function computeRenewalPeriod(params: {
  currentStatus?: string | null;
  currentPeriodEnd?: string | null;
  trialEnd?: string | null;
  paidAt?: Date;
  periodDays?: number;
}): {
  periodStartIso: string;
  periodEndIso: string;
  extendedFromExistingExpiry: boolean;
} {
  const paidAt = params.paidAt ?? new Date();
  const paidAtMs = paidAt.getTime();
  const periodDays = params.periodDays ?? SAMLEYBOOK_PERIOD_DAYS;
  const periodMs = periodDays * DAY_MS;

  const status = (params.currentStatus || '').toLowerCase().trim();
  const isCurrentlyRenewableBeforeExpiry = status === 'active' || status === 'trialing';
  const existingExpiryIso = resolveAuthoritativeExpiryIso({
    status: params.currentStatus,
    current_period_end: params.currentPeriodEnd,
    trial_end: params.trialEnd,
  });
  const existingExpiryMs = parseUtcTimestampMs(existingExpiryIso);

  if (
    isCurrentlyRenewableBeforeExpiry &&
    existingExpiryMs !== null &&
    existingExpiryMs > paidAtMs
  ) {
    return {
      periodStartIso: paidAt.toISOString(),
      periodEndIso: new Date(existingExpiryMs + periodMs).toISOString(),
      extendedFromExistingExpiry: true,
    };
  }

  return {
    periodStartIso: paidAt.toISOString(),
    periodEndIso: new Date(paidAtMs + periodMs).toISOString(),
    extendedFromExistingExpiry: false,
  };
}

/**
 * Validates that a verified Moolre payment matches SamleyBook's subscription requirements
 * before restoring/activating access.
 */
export function validateMoolreSubscriptionVerification(params: {
  expectedReference: string;
  providerExternalRef?: string | null;
  txStatus?: number | string | null;
  paidAmount?: number | string | null;
  expectedAmountGhs?: number;
  currency?: string | null;
}): {
  valid: boolean;
  state: 'successful' | 'pending' | 'failed';
  reason?: string;
} {
  const expectedAmount = params.expectedAmountGhs ?? SAMLEYBOOK_PLAN_PRICE_GHS;
  const numericTxStatus =
    typeof params.txStatus === 'string' ? Number(params.txStatus) : params.txStatus;

  if (numericTxStatus === 0) {
    return {
      valid: false,
      state: 'pending',
      reason: 'Transaction is still pending Mobile Money approval.',
    };
  }

  if (numericTxStatus === 2) {
    return {
      valid: false,
      state: 'failed',
      reason: 'Payment failed or was declined by the customer.',
    };
  }

  if (numericTxStatus !== 1) {
    return {
      valid: false,
      state: 'pending',
      reason: 'Transaction status could not be confirmed as successful.',
    };
  }

  if (
    params.providerExternalRef &&
    params.providerExternalRef.trim() !== params.expectedReference.trim()
  ) {
    return {
      valid: false,
      state: 'failed',
      reason: 'Payment reference mismatch with provider response.',
    };
  }

  const currency = (params.currency || 'GHS').toUpperCase().trim();
  if (currency !== SAMLEYBOOK_PLAN_CURRENCY) {
    return {
      valid: false,
      state: 'failed',
      reason: `Invalid currency "${currency}". Expected ${SAMLEYBOOK_PLAN_CURRENCY}.`,
    };
  }

  const amountNum = Number(params.paidAmount ?? 0);
  if (!Number.isFinite(amountNum) || amountNum < expectedAmount) {
    return {
      valid: false,
      state: 'failed',
      reason: `Verified payment amount (${amountNum}) is less than required GH₵${expectedAmount}.`,
    };
  }

  return {
    valid: true,
    state: 'successful',
  };
}

/**
 * Checks whether a user role/email belongs to Super Admin (unaffected by business subscription locks).
 */
export function isSuperAdminUser(
  role: string | null | undefined,
  email?: string | null
): boolean {
  return (
    role === 'super_admin' ||
    (email || '').toLowerCase().trim() === 'samleybook@gmail.com'
  );
}

/**
 * Evaluates whether a business owner is locked out of the Business Application.
 */
export function shouldLockBusinessWorkspace(params: {
  userRole: string | null | undefined;
  userEmail?: string | null;
  businessLoading: boolean;
  hasAnyBusiness: boolean;
  subscriptionLoading: boolean;
  subscription: SubscriptionSnapshot | null | undefined;
  now?: Date;
}): {
  decision: 'bypass_admin' | 'loading' | 'no_business' | 'allowed' | 'locked';
  evaluation: SubscriptionAccessEvaluation;
} {
  if (isSuperAdminUser(params.userRole, params.userEmail)) {
    return {
      decision: 'bypass_admin',
      evaluation: {
        isAllowed: true,
        isExpired: false,
        isTrial: false,
        isPaidActive: true,
        isTrialExpired: false,
        isPaidExpired: false,
        effectiveStatus: 'active',
        expiryIso: null,
        expiryTimestampMs: null,
        daysRemaining: 0,
        hoursRemaining: 0,
        reason: 'ok',
      },
    };
  }

  if (params.businessLoading) {
    return {
      decision: 'loading',
      evaluation: evaluateSubscriptionAccess(params.subscription, params.now),
    };
  }

  if (!params.hasAnyBusiness) {
    return {
      decision: 'no_business',
      evaluation: evaluateSubscriptionAccess(null, params.now),
    };
  }

  if (params.subscriptionLoading) {
    return {
      decision: 'loading',
      evaluation: evaluateSubscriptionAccess(params.subscription, params.now),
    };
  }

  const evaluation = evaluateSubscriptionAccess(params.subscription, params.now);
  return {
    decision: evaluation.isExpired ? 'locked' : 'allowed',
    evaluation,
  };
}
