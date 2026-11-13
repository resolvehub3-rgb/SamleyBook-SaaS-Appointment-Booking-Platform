import React, { useEffect, useState } from 'react';
import {
  Crown,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  Receipt,
  CreditCard,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { getSupabase } from '../../lib/supabase';
import { calculateTrialRemainingDays, formatGHS } from '../../utils/booking-logic';
import { PRIMARY_ORANGE_BTN, SURFACE_CARD } from './ui/DashboardTokens';

interface SubscriptionPaymentRecord {
  id: string;
  amount: number;
  status: string;
  moolre_reference?: string | null;
  payment_provider: string;
  created_at: string;
}

export const SubscriptionView: React.FC = () => {
  const { currentBusiness, subscription, refreshBusinessData } = useBusiness();
  const [plans, setPlans] = useState<any[]>([]);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ success: boolean; text: string } | null>(null);
  const [paying, setPaying] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<SubscriptionPaymentRecord[]>([]);

  const trialInfo = subscription?.trial_end
    ? calculateTrialRemainingDays(subscription.trial_end)
    : { daysRemaining: 7, hoursRemaining: 168, isExpired: false };

  useEffect(() => {
    const fetchPlansAndHistory = async () => {
      const supabase = getSupabase();
      if (!supabase) return;
      const { data } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price_ghs', { ascending: true });
      // Single plan model: only SamleyBook Monthly Subscription (GH₵120)
      const single = (data || []).filter((p: any) => (p.code || '').toLowerCase() === 'starter');
      setPlans(single.length ? single : (data || []).slice(0, 1));

      if (currentBusiness?.id) {
        const { data: txData } = await supabase
          .from('payment_transactions')
          .select('id, amount, status, moolre_reference, payment_provider, created_at')
          .eq('business_id', currentBusiness.id)
          .is('appointment_id', null)
          .order('created_at', { ascending: false })
          .limit(10);
        setPaymentHistory((txData as SubscriptionPaymentRecord[]) || []);
      }
    };
    fetchPlansAndHistory();
  }, [currentBusiness?.id, subscription?.updated_at]);

  const getDbPlan = (name: string) =>
    plans.find(
      (p) =>
        (p.name || '').toLowerCase() === name.toLowerCase() ||
        (p.code || '').toLowerCase() === name.toLowerCase().replace(' plan', '').trim()
    );

  const handleSelectPlan = async (planName: string) => {
    if (!currentBusiness) return;
    const dbPlan = getDbPlan(planName);
    if (!dbPlan) {
      setFeedback({ success: false, text: `Plan "${planName}" is not available in the database yet.` });
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setFeedback({ success: false, text: 'Supabase is not configured.' });
      return;
    }

    setSelecting(planName);
    setFeedback(null);
    try {
      if (subscription?.id) {
        const { error } = await supabase
          .from('business_subscriptions')
          .update({
            plan_id: dbPlan.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', subscription.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('business_subscriptions').insert({
          business_id: currentBusiness.id,
          plan_id: dbPlan.id,
          status: 'trialing',
          payment_status: 'none',
        });
        if (error) throw error;
      }
      await refreshBusinessData();
      setFeedback({ success: true, text: `${planName} selected successfully. Your subscription has been updated.` });
    } catch (err) {
      setFeedback({ success: false, text: err instanceof Error ? err.message : 'Failed to select plan.' });
    } finally {
      setSelecting(null);
    }
  };

  const handlePayNow = async () => {
    if (!currentBusiness || !subscription?.plan_id) return;
    const plan = plans.find((p) => p.id === subscription.plan_id);
    if (!plan) return;
    setPaying(true);
    setFeedback(null);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase not configured');
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      const initRes = await fetch('/api/subscriptions/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ businessId: currentBusiness.id, planCode: plan.code }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || 'Payment initiation failed');

      // Verify subscription settlement
      const verifyRes = await fetch('/api/subscriptions/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reference: initData.reference }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || 'Verification failed');

      await refreshBusinessData();
      setFeedback({ success: true, text: 'Subscription renewed successfully. Full access restored.' });
    } catch (err) {
      setFeedback({ success: false, text: err instanceof Error ? err.message : 'Payment failed.' });
    } finally {
      setPaying(false);
    }
  };

  const statusHeadline =
    subscription?.status === 'trialing'
      ? '7-Day Free Trial Active'
      : subscription?.status === 'active'
      ? `${subscription?.plan?.name || 'Active Plan'} Active`
      : subscription?.status || 'Active Trial';

  return (
    <div className="space-y-6 text-left">
      {/* Status Hero Card */}
      <div className={`${SURFACE_CARD} overflow-hidden`}>
        <div className="bg-[#0E1733] px-6 py-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FF6B1A] to-[#E64D00] flex items-center justify-center shadow-sm">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-300">
                Current Subscription Status
              </span>
              <h3 className="text-xl font-black tracking-tight capitalize mt-0.5">
                {statusHeadline}
              </h3>
            </div>
          </div>

          <div
            className={`px-4 py-2 rounded-full text-xs font-bold inline-flex items-center gap-2 ${
              trialInfo.isExpired && subscription?.status !== 'active'
                ? 'bg-red-500/20 text-red-200 border border-red-400/30'
                : 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>
              {subscription?.status === 'active' && subscription.current_period_end
                ? `Valid until ${new Date(subscription.current_period_end).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}`
                : trialInfo.isExpired
                ? 'Trial Expired'
                : `${trialInfo.daysRemaining} Day${trialInfo.daysRemaining !== 1 ? 's' : ''} Remaining (${trialInfo.hoursRemaining} hours)`}
            </span>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-[#FFF6EE] to-[#FFE7D4] border border-[#FADAC1]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#EA580C]">
                Trial Start Date
              </p>
              <p className="font-extrabold text-[#111827] text-sm mt-1">
                {subscription?.trial_start
                  ? new Date(subscription.trial_start).toLocaleDateString()
                  : 'Registration Date'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-br from-[#F2F7FF] to-[#DCEBFF] border border-[#C7DDFC]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB]">
                Expiry Date
              </p>
              <p className="font-extrabold text-[#111827] text-sm mt-1">
                {subscription?.status === 'active' && subscription.current_period_end
                  ? new Date(subscription.current_period_end).toLocaleDateString()
                  : subscription?.trial_end
                  ? new Date(subscription.trial_end).toLocaleDateString()
                  : 'In 7 Days'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-br from-[#ECFDF5] to-[#CEFAE0] border border-[#A7F3D0]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#16A34A]">
                Assigned Plan
              </p>
              <p className="font-extrabold text-[#111827] text-sm mt-1">
                {subscription?.plan?.name || 'Growth Plan (Trial Access)'}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <div className="flex items-start gap-2.5 text-xs text-slate-600">
              <ShieldCheck className="w-4 h-4 text-[#F95700] shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong className="text-[#111827]">Server-Side Verified:</strong> Trial dates and subscription authorization are enforced directly in PostgreSQL via UTC timestamps.
              </p>
            </div>

            <button
              type="button"
              onClick={handlePayNow}
              disabled={paying || !subscription?.plan_id}
              className={`${PRIMARY_ORANGE_BTN} px-6 py-2.5 text-xs shrink-0`}
            >
              <CreditCard className="w-4 h-4" />
              <span>{paying ? 'Processing...' : 'Pay Now / Renew Subscription'}</span>
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl text-xs font-semibold flex items-start gap-3 border ${
            feedback.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.success ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Available Plans for Upgrade */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-[#111827]">Standard Subscription Packages</h3>
            <p className="text-xs text-slate-500">
              Select a package and complete renewal anytime
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              name: 'Starter Plan',
              price: 'GHS 120.00 / month',
              features: ['Up to 200 bookings/month', 'QR Code Booking Page', 'Moolre Payments', 'SMS Confirmations'],
            },
            {
              name: 'Growth Plan',
              price: 'GHS 250.00 / month',
              popular: true,
              features: ['Unlimited appointments', '24h SMS Reminders', 'PWA Mobile App', 'Customer Records'],
            },
            {
              name: 'Pro Plan',
              price: 'GHS 450.00 / month',
              features: ['Multi-business Switcher', 'Priority SMS gateway', 'Dedicated Support', 'Advanced Analytics'],
            },
          ].map((plan, idx) => {
            const isSelected = subscription?.plan?.name === plan.name;
            const dbPlan = getDbPlan(plan.name);
            const features =
              Array.isArray(dbPlan?.features) && dbPlan.features.length ? dbPlan.features : plan.features;
            const displayPrice = dbPlan
              ? `GHS ${Number(dbPlan.price_ghs).toFixed(2)} / ${dbPlan.billing_cycle === 'yearly' ? 'year' : 'month'}`
              : plan.price;

            return (
              <div
                key={idx}
                className={`${SURFACE_CARD} p-6 flex flex-col justify-between transition ${
                  plan.popular ? 'border-[#F95700] ring-2 ring-[#F95700]/15' : ''
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-base font-extrabold text-[#111827]">{plan.name}</h4>
                    {plan.popular && (
                      <span className="px-2.5 py-0.5 rounded-full bg-[#FFF3EC] text-[#F95700] text-[10px] font-bold">
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="text-lg font-black text-[#F95700]">{displayPrice}</p>
                  <div className="space-y-2 pt-3 border-t border-slate-100">
                    {features.map((f: string, fIdx: number) => (
                      <div key={fIdx} className="flex items-center gap-2 text-xs text-slate-600">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    type="button"
                    disabled={selecting === plan.name}
                    className={`w-full py-2.5 rounded-xl font-bold text-xs transition ${
                      isSelected
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : plan.popular
                        ? PRIMARY_ORANGE_BTN
                        : 'border border-slate-200 text-[#111827] hover:bg-slate-50'
                    } disabled:opacity-60`}
                    onClick={() => handleSelectPlan(plan.name)}
                  >
                    {selecting === plan.name ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Selecting...
                      </span>
                    ) : isSelected ? (
                      'Selected Plan'
                    ) : (
                      'Select Plan'
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Subscription Payment History */}
      <div className={`${SURFACE_CARD} overflow-hidden`}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-[#111827]">Subscription Payment History</h3>
              <p className="text-[11px] text-slate-500">Verified renewal transactions in Supabase</p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-400">
            {paymentHistory.length} record{paymentHistory.length === 1 ? '' : 's'}
          </span>
        </div>

        {paymentHistory.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No subscription renewal payments recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-6">Reference</th>
                  <th className="py-3 px-6">Provider</th>
                  <th className="py-3 px-6">Amount</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paymentHistory.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-6 font-mono font-semibold text-[#111827]">
                      {tx.moolre_reference || tx.id.slice(0, 10).toUpperCase()}
                    </td>
                    <td className="py-3 px-6 text-slate-600">{tx.payment_provider}</td>
                    <td className="py-3 px-6 font-extrabold text-[#111827]">
                      {formatGHS(tx.amount)}
                    </td>
                    <td className="py-3 px-6">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                          tx.status === 'successful'
                            ? 'bg-emerald-50 text-emerald-700'
                            : tx.status === 'pending'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-slate-500">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
