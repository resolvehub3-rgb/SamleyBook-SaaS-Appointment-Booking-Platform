import {
  SubscriptionAccessEvaluation,
  evaluateSubscriptionAccess,
  isSuperAdminUser,
} from '../../src/utils/subscription-access.js';

export async function isServerSuperAdmin(
  supabase: any,
  userId: string,
  email?: string | null
): Promise<boolean> {
  if (isSuperAdminUser(null, email)) return true;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', userId)
    .maybeSingle();
  return isSuperAdminUser(profile?.role, profile?.email || email);
}

/**
 * Queries the business's latest subscription row, evaluates expiry against UTC server time,
 * and lazily transitions stale 'trialing'/'active' rows to 'expired' in PostgreSQL.
 */
export async function getAuthoritativeBusinessSubscription(
  supabase: any,
  businessId: string
): Promise<{
  subscription: any | null;
  evaluation: SubscriptionAccessEvaluation;
}> {
  const { data: sub } = await supabase
    .from('business_subscriptions')
    .select('*, plan:subscription_plans(*)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date();
  const evaluation = evaluateSubscriptionAccess(sub, now);

  if (sub && evaluation.isExpired && (sub.status === 'trialing' || sub.status === 'active')) {
    const { data: synced } = await supabase
      .from('business_subscriptions')
      .update({
        status: 'expired',
        payment_status: sub.payment_status === 'paid' ? 'none' : sub.payment_status || 'none',
        updated_at: now.toISOString(),
      })
      .eq('id', sub.id)
      .select('*, plan:subscription_plans(*)')
      .maybeSingle();

    return {
      subscription: synced || { ...sub, status: 'expired' },
      evaluation,
    };
  }

  return {
    subscription: sub || null,
    evaluation,
  };
}
