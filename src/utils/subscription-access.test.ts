import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAMLEYBOOK_PLAN_PRICE_GHS,
  THIRTY_DAYS_MS,
  computeRenewalPeriod,
  evaluateSubscriptionAccess,
  shouldLockBusinessWorkspace,
  validateMoolreSubscriptionVerification,
} from './subscription-access';

test('Test 1: Active 7-day free trial grants dashboard access', () => {
  const now = new Date('2026-11-10T10:00:00.000Z');
  const res = evaluateSubscriptionAccess(
    {
      status: 'trialing',
      trial_start: '2026-11-08T10:00:00.000Z',
      trial_end: '2026-11-15T10:00:00.000Z',
      current_period_start: '2026-11-08T10:00:00.000Z',
      current_period_end: '2026-11-15T10:00:00.000Z',
      payment_status: 'none',
    },
    now
  );

  assert.equal(res.isAllowed, true);
  assert.equal(res.isExpired, false);
  assert.equal(res.isTrial, true);
  assert.equal(res.daysRemaining, 5);
  assert.equal(res.reason, 'ok');
});

test('Test 2: Expired 7-day trial locks dashboard even if DB status still says trialing', () => {
  const now = new Date('2026-11-15T10:00:01.000Z');
  const res = evaluateSubscriptionAccess(
    {
      status: 'trialing',
      trial_start: '2026-11-08T10:00:00.000Z',
      trial_end: '2026-11-15T10:00:00.000Z',
      current_period_end: '2026-11-15T10:00:00.000Z',
      payment_status: 'none',
    },
    now
  );

  assert.equal(res.isAllowed, false);
  assert.equal(res.isExpired, true);
  assert.equal(res.isTrialExpired, true);
  assert.equal(res.effectiveStatus, 'expired');
  assert.equal(res.reason, 'trial_expired');
});

test('Test 3: Expired paid subscription locks dashboard even if DB status still says active', () => {
  const now = new Date('2026-12-16T00:00:00.000Z');
  const res = evaluateSubscriptionAccess(
    {
      status: 'active',
      current_period_start: '2026-11-15T00:00:00.000Z',
      current_period_end: '2026-12-15T00:00:00.000Z',
      payment_status: 'paid',
    },
    now
  );

  assert.equal(res.isAllowed, false);
  assert.equal(res.isExpired, true);
  assert.equal(res.isPaidExpired, true);
  assert.equal(res.effectiveStatus, 'expired');
  assert.equal(res.reason, 'subscription_expired');
});

test('Test 3b: Past-due, canceled, and missing subscriptions all block access', () => {
  const now = new Date('2026-11-10T10:00:00.000Z');

  assert.equal(
    evaluateSubscriptionAccess(
      { status: 'past_due', current_period_end: '2026-12-10T10:00:00.000Z', payment_status: 'paid' },
      now
    ).isExpired,
    true
  );
  assert.equal(
    evaluateSubscriptionAccess(
      { status: 'canceled', current_period_end: '2026-12-10T10:00:00.000Z', payment_status: 'paid' },
      now
    ).isExpired,
    true
  );
  assert.equal(evaluateSubscriptionAccess(null, now).isExpired, true);
});

test('Test 4 & 5: Loading state waits cleanly and prevents dashboard flash before subscription resolves', () => {
  const whileLoading = shouldLockBusinessWorkspace({
    userRole: 'business_owner',
    businessLoading: false,
    hasAnyBusiness: true,
    subscriptionLoading: true,
    subscription: null,
  });
  assert.equal(whileLoading.decision, 'loading');

  const afterLoadExpired = shouldLockBusinessWorkspace({
    userRole: 'business_owner',
    businessLoading: false,
    hasAnyBusiness: true,
    subscriptionLoading: false,
    subscription: {
      status: 'trialing',
      trial_end: '2026-01-01T00:00:00.000Z',
      current_period_end: '2026-01-01T00:00:00.000Z',
    },
    now: new Date('2026-01-02T00:00:00.000Z'),
  });
  assert.equal(afterLoadExpired.decision, 'locked');
});

test('Test 8 & 9: Authoritative UTC 30-day renewal date math (before vs after expiry)', () => {
  // Case A: Renewal BEFORE expiry -> existing expiry + 30 days
  const existingExpiry = '2026-11-20T12:00:00.000Z';
  const paidEarlyAt = new Date('2026-11-15T09:30:00.000Z');
  const earlyRenewal = computeRenewalPeriod({
    currentStatus: 'active',
    currentPeriodEnd: existingExpiry,
    paidAt: paidEarlyAt,
  });

  assert.equal(earlyRenewal.extendedFromExistingExpiry, true);
  assert.equal(earlyRenewal.periodStartIso, paidEarlyAt.toISOString());
  assert.equal(
    earlyRenewal.periodEndIso,
    new Date(Date.parse(existingExpiry) + THIRTY_DAYS_MS).toISOString()
  );

  // Case B: Renewal AFTER expiry -> verified payment timestamp + 30 days
  const pastExpiry = '2026-11-01T12:00:00.000Z';
  const paidLateAt = new Date('2026-11-15T09:30:00.000Z');
  const lateRenewal = computeRenewalPeriod({
    currentStatus: 'expired',
    currentPeriodEnd: pastExpiry,
    paidAt: paidLateAt,
  });

  assert.equal(lateRenewal.extendedFromExistingExpiry, false);
  assert.equal(lateRenewal.periodStartIso, paidLateAt.toISOString());
  assert.equal(
    lateRenewal.periodEndIso,
    new Date(paidLateAt.getTime() + THIRTY_DAYS_MS).toISOString()
  );
});

test('Test 7 & 11: Moolre verification rejects pending, failed, mismatched ref, wrong currency, or underpayment', () => {
  const pending = validateMoolreSubscriptionVerification({
    expectedReference: 'SUB-123',
    providerExternalRef: 'SUB-123',
    txStatus: 0,
    paidAmount: SAMLEYBOOK_PLAN_PRICE_GHS,
    currency: 'GHS',
  });
  assert.equal(pending.valid, false);
  assert.equal(pending.state, 'pending');

  const failed = validateMoolreSubscriptionVerification({
    expectedReference: 'SUB-123',
    providerExternalRef: 'SUB-123',
    txStatus: 2,
    paidAmount: SAMLEYBOOK_PLAN_PRICE_GHS,
    currency: 'GHS',
  });
  assert.equal(failed.valid, false);
  assert.equal(failed.state, 'failed');

  const underpaid = validateMoolreSubscriptionVerification({
    expectedReference: 'SUB-123',
    providerExternalRef: 'SUB-123',
    txStatus: 1,
    paidAmount: 50,
    currency: 'GHS',
  });
  assert.equal(underpaid.valid, false);
  assert.equal(underpaid.state, 'failed');

  const wrongCurrency = validateMoolreSubscriptionVerification({
    expectedReference: 'SUB-123',
    providerExternalRef: 'SUB-123',
    txStatus: 1,
    paidAmount: 120,
    currency: 'USD',
  });
  assert.equal(wrongCurrency.valid, false);
  assert.equal(wrongCurrency.state, 'failed');

  const refMismatch = validateMoolreSubscriptionVerification({
    expectedReference: 'SUB-123',
    providerExternalRef: 'SUB-OTHER',
    txStatus: 1,
    paidAmount: 120,
    currency: 'GHS',
  });
  assert.equal(refMismatch.valid, false);
  assert.equal(refMismatch.state, 'failed');

  const valid = validateMoolreSubscriptionVerification({
    expectedReference: 'SUB-123',
    providerExternalRef: 'SUB-123',
    txStatus: 1,
    paidAmount: '120.00',
    currency: 'GHS',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.state, 'successful');
});

test('Test 12: Super Admin is completely unaffected by expired business subscriptions', () => {
  const adminCheck = shouldLockBusinessWorkspace({
    userRole: 'super_admin',
    userEmail: 'samleybook@gmail.com',
    businessLoading: false,
    hasAnyBusiness: true,
    subscriptionLoading: false,
    subscription: {
      status: 'expired',
      current_period_end: '2025-01-01T00:00:00.000Z',
    },
  });
  assert.equal(adminCheck.decision, 'bypass_admin');
  assert.equal(adminCheck.evaluation.isAllowed, true);
});
