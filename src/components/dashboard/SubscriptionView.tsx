import React, { useEffect, useState } from 'react';
import { Sparkles, Clock, CheckCircle2, AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { getSupabase } from '../../lib/supabase';
import { calculateTrialRemainingDays } from '../../utils/booking-logic';

export const SubscriptionView: React.FC = () => {
  const { currentBusiness, subscription, refreshBusinessData } = useBusiness();
  const [plans, setPlans] = useState<any[]>([]);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ success: boolean; text: string } | null>(null);
  const [paying, setPaying] = useState(false);

  const trialInfo = subscription?.trial_end
    ? calculateTrialRemainingDays(subscription.trial_end)
    : { daysRemaining: 7, hoursRemaining: 168, isExpired: false };

  useEffect(() => {
    const fetchPlans = async () => {
      const supabase = getSupabase();
      if (!supabase) return;
      const { data } = await supabase.from('subscription_plans').select('*').order('price_ghs', { ascending: true });
      // Single plan model: only SamleyBook Monthly Subscription (GH₵120)
      const single = (data || []).filter((p: any) => (p.code || '').toLowerCase() === 'starter');
      setPlans(single.length ? single : (data || []).slice(0, 1));
    };
    fetchPlans();
  }, []);

  const getDbPlan = (name: string) =>
    plans.find((p) => (p.name || '').toLowerCase() === name.toLowerCase() || (p.code || '').toLowerCase() === name.toLowerCase().replace(' plan', '').trim());

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
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const initRes = await fetch('/api/subscriptions/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ businessId: currentBusiness.id, planCode: plan.code }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || 'Payment initiation failed');

      // Simulate Moolre approval then verify
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

  return (
    <div className="space-y-6 text-left max-w-4xl">
      <div>
        <h2 className="text-xl font-black text-zinc-900 tracking-tight">Subscription & 7-Day Free Trial</h2>
        <p className="text-xs text-zinc-500">
          Manage your business subscription package and monitor your trial period
        </p>
      </div>

      {/* Trial Status Hero Card */}
      <div className="p-8 rounded-3xl bg-white border border-zinc-200/80 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600">
              Current Subscription Status
            </span>
            <h3 className="text-2xl font-black text-zinc-900 capitalize">
              {subscription?.status === 'trialing' ? '7-Day Free Trial Active' : subscription?.status || 'Active Trial'}
            </h3>
            <p className="text-xs text-zinc-500">
              Assigned automatically upon successful business registration
            </p>
          </div>

          <div
            className={`px-4 py-2 rounded-2xl text-xs font-bold inline-flex items-center gap-2 ${
              trialInfo.isExpired
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-orange-50 text-orange-700 border border-orange-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>
              {trialInfo.isExpired
                ? 'Trial Expired'
                : `${trialInfo.daysRemaining} Day${trialInfo.daysRemaining !== 1 ? 's' : ''} Remaining (${trialInfo.hoursRemaining} hours)`}
            </span>
          </div>
        </div>

        {/* Pay Now */}
        <div className="pt-4 border-t border-zinc-100">
          <button
            onClick={handlePayNow}
            disabled={paying}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-orange-700 disabled:opacity-50 transition shadow-sm"
          >
            {paying ? 'Processing...' : 'Pay Now / Renew Subscription'}
          </button>
        </div>

        {/* Timestamps details */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-zinc-100 text-xs">
          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100">
            <p className="text-[10px] font-bold uppercase text-zinc-400">Trial Start Date</p>
            <p className="font-bold text-zinc-900 mt-1">
              {subscription?.trial_start
                ? new Date(subscription.trial_start).toLocaleDateString()
                : 'Registration Date'}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100">
            <p className="text-[10px] font-bold uppercase text-zinc-400">Trial Expiry Date</p>
            <p className="font-bold text-zinc-900 mt-1">
              {subscription?.trial_end
                ? new Date(subscription.trial_end).toLocaleDateString()
                : 'In 7 Days'}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100">
            <p className="text-[10px] font-bold uppercase text-zinc-400">Assigned Plan</p>
            <p className="font-bold text-zinc-900 mt-1">
              {subscription?.plan?.name || 'Growth Plan (Trial Access)'}
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-orange-50/50 border border-orange-100 flex items-start gap-3 text-xs text-orange-950">
          <ShieldCheck className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Server-Side Verified:</strong> Trial dates and authorization are enforced directly in PostgreSQL via UTC timestamps to ensure complete multi-tenant security.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl text-xs flex items-start gap-3 border ${
            feedback.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.success ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Available Plans for Upgrade */}
      <div className="space-y-4 pt-2">
        <h3 className="text-base font-bold text-zinc-900">Standard Subscription Packages</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          ].map((plan, idx) => (
            <div
              key={idx}
              className={`p-6 rounded-3xl bg-white border text-left flex flex-col justify-between ${
                plan.popular ? 'border-orange-600 ring-2 ring-orange-100' : 'border-zinc-200'
              }`}
            >
              <div className="space-y-3">
                <h4 className="text-base font-bold text-zinc-900">{plan.name}</h4>
                <p className="text-lg font-black text-orange-600">
                  {(() => {
                    const dbPlan = getDbPlan(plan.name);
                    return dbPlan ? `GHS ${Number(dbPlan.price_ghs).toFixed(2)} / ${dbPlan.billing_cycle === 'yearly' ? 'year' : 'month'}` : plan.price;
                  })()}
                </p>
                <div className="space-y-2 pt-2 border-t border-zinc-100">
                  {(() => {
                    const dbPlan = getDbPlan(plan.name);
                    const features = Array.isArray(dbPlan?.features) && dbPlan.features.length ? dbPlan.features : plan.features;
                    return features.map((f: string, fIdx: number) => (
                      <div key={fIdx} className="flex items-center gap-2 text-xs text-zinc-600">
                        <CheckCircle2 className="w-3.5 h-3.5 text-orange-600" />
                        <span>{f}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              <div className="pt-6">
                <button
                  type="button"
                  disabled={selecting === plan.name}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                    subscription?.plan?.name === plan.name
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'border border-zinc-200 text-zinc-800 hover:bg-zinc-50'
                  } disabled:opacity-60`}
                  onClick={() => handleSelectPlan(plan.name)}
                >
                  {selecting === plan.name ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Selecting...
                    </span>
                  ) : subscription?.plan?.name === plan.name ? (
                    'Selected Plan'
                  ) : (
                    'Select Plan'
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
