import React from 'react';
import { Sparkles, Clock, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { calculateTrialRemainingDays } from '../../utils/booking-logic';

export const SubscriptionView: React.FC = () => {
  const { currentBusiness, subscription } = useBusiness();

  const trialInfo = subscription?.trial_end
    ? calculateTrialRemainingDays(subscription.trial_end)
    : { daysRemaining: 7, hoursRemaining: 168, isExpired: false };

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
                <p className="text-lg font-black text-orange-600">{plan.price}</p>
                <div className="space-y-2 pt-2 border-t border-zinc-100">
                  {plan.features.map((f, fIdx) => (
                    <div key={fIdx} className="flex items-center gap-2 text-xs text-zinc-600">
                      <CheckCircle2 className="w-3.5 h-3.5 text-orange-600" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6">
                <button
                  type="button"
                  className="w-full py-2.5 rounded-xl border border-zinc-200 font-bold text-xs uppercase tracking-wider text-zinc-800 hover:bg-zinc-50 transition"
                  onClick={() => alert(`Upgrading to ${plan.name} will be processed via Moolre merchant payment upon trial conclusion.`)}
                >
                  Select Plan
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
