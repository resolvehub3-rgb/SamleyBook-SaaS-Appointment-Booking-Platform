import React, { useCallback, useEffect, useState } from 'react';
import {
  Crown,
  Clock,
  CheckCircle2,
  ShieldCheck,
  Receipt,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { getSupabase } from '../../lib/supabase';
import { formatGHS } from '../../utils/booking-logic';
import {
  SAMLEYBOOK_PLAN_NAME,
  SAMLEYBOOK_PLAN_PRICE_GHS,
} from '../../utils/subscription-access';
import { MoolreRenewalCheckout } from './MoolreRenewalCheckout';
import { SURFACE_CARD } from './ui/DashboardTokens';

interface SubscriptionPaymentRecord {
  id: string;
  amount: number;
  status: string;
  moolre_reference?: string | null;
  payment_provider: string;
  created_at: string;
}

const PREMIUM_FEATURES = [
  'Online appointment booking',
  'Business dashboard & calendar',
  'Service management',
  'Customer management',
  'Appointment management',
  'Business booking page and QR code',
  'Customer feedback management',
  '7-day free trial for eligible businesses',
];

export const SubscriptionView: React.FC = () => {
  const { profile } = useAuth();
  const {
    currentBusiness,
    subscription,
    subscriptionAccess,
    paymentConfig,
    refreshBusinessData,
  } = useBusiness();
  const [paymentHistory, setPaymentHistory] = useState<SubscriptionPaymentRecord[]>([]);

  const fetchHistory = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !currentBusiness?.id) return;
    const { data: txData } = await supabase
      .from('payment_transactions')
      .select('id, amount, status, moolre_reference, payment_provider, created_at')
      .eq('business_id', currentBusiness.id)
      .is('appointment_id', null)
      .order('created_at', { ascending: false })
      .limit(10);
    setPaymentHistory((txData as SubscriptionPaymentRecord[]) || []);
  }, [currentBusiness?.id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, subscription?.updated_at]);

  const statusHeadline = subscriptionAccess.isPaidActive
    ? `${SAMLEYBOOK_PLAN_NAME} Active`
    : subscriptionAccess.isTrial
    ? '7-Day Free Trial Active'
    : 'Subscription Expired';

  const expiryFormatted = subscriptionAccess.expiryIso
    ? new Date(subscriptionAccess.expiryIso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';

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
              <h3 className="text-xl font-black tracking-tight mt-0.5">
                {statusHeadline}
              </h3>
            </div>
          </div>

          <div
            className={`px-4 py-2 rounded-full text-xs font-bold inline-flex items-center gap-2 ${
              subscriptionAccess.isExpired
                ? 'bg-red-500/20 text-red-200 border border-red-400/30'
                : 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>
              {subscriptionAccess.isPaidActive
                ? `Valid until ${expiryFormatted} (${subscriptionAccess.daysRemaining}d left)`
                : subscriptionAccess.isTrial
                ? `${subscriptionAccess.daysRemaining} Day${
                    subscriptionAccess.daysRemaining !== 1 ? 's' : ''
                  } Remaining (${subscriptionAccess.hoursRemaining} hours)`
                : 'Expired'}
            </span>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-[#FFF6EE] to-[#FFE7D4] border border-[#FADAC1]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#EA580C]">
                {subscriptionAccess.isPaidActive ? 'Billing Period Start' : 'Trial Start Date'}
              </p>
              <p className="font-extrabold text-[#111827] text-sm mt-1">
                {subscriptionAccess.isPaidActive && subscription?.current_period_start
                  ? new Date(subscription.current_period_start).toLocaleDateString()
                  : subscription?.trial_start
                  ? new Date(subscription.trial_start).toLocaleDateString()
                  : 'Registration Date'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-br from-[#F2F7FF] to-[#DCEBFF] border border-[#C7DDFC]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB]">
                Expiry Date
              </p>
              <p className="font-extrabold text-[#111827] text-sm mt-1">
                {expiryFormatted}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-br from-[#ECFDF5] to-[#CEFAE0] border border-[#A7F3D0]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#16A34A]">
                Assigned Plan
              </p>
              <p className="font-extrabold text-[#111827] text-sm mt-1">
                {subscriptionAccess.isPaidActive
                  ? `${SAMLEYBOOK_PLAN_NAME} (Active)`
                  : `${SAMLEYBOOK_PLAN_NAME} (7-Day Trial)`}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
            <ShieldCheck className="w-4 h-4 text-[#F95700] shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-[#111827]">Server-Verified Billing:</strong> Renewing early adds 30 days on top of your existing expiry timestamp in UTC, verified directly with Moolre.
            </p>
          </div>
        </div>
      </div>

      {/* Single SamleyBook Premium Plan & Early Renewal Checkout */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-extrabold text-[#111827]">Subscription Plan</h3>
          <p className="text-xs text-slate-500">
            Renew or extend your {SAMLEYBOOK_PLAN_NAME} subscription via Moolre Mobile Money.
          </p>
        </div>

        <div className="max-w-2xl">
          <div className="relative rounded-3xl p-6 sm:p-7 bg-white border-2 border-[#F95700] shadow-[0_8px_28px_rgba(249,87,0,0.12)] ring-4 ring-orange-100/70 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-flex px-3 py-1 rounded-full bg-[#FFF3EC] text-[#F95700] text-[10.5px] font-extrabold uppercase tracking-wider">
                  {SAMLEYBOOK_PLAN_NAME}
                </span>
                <h4 className="text-xl font-black text-[#111827] mt-2">
                  {SAMLEYBOOK_PLAN_NAME}
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  One complete appointment management platform for your business.
                </p>
              </div>
              {subscriptionAccess.isPaidActive && (
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold shrink-0">
                  Active
                </span>
              )}
            </div>

            <div className="pb-4 border-b border-slate-100">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-[#111827] tabular-nums">
                  GH₵{SAMLEYBOOK_PLAN_PRICE_GHS}
                </span>
                <span className="text-xs font-semibold text-slate-500">Every 30 days</span>
              </div>
              <p className="text-[11px] font-bold text-[#F95700] mt-1">
                &bull; 7-day free trial for eligible new businesses
              </p>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-extrabold text-[#111827] uppercase tracking-wider">
                Included Features:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PREMIUM_FEATURES.map((feature) => (
                  <div key={feature} className="flex items-center gap-2 text-xs text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            {currentBusiness && (
              <div className="pt-3 border-t border-slate-100">
                <MoolreRenewalCheckout
                  businessId={currentBusiness.id}
                  businessPhone={currentBusiness.phone || profile?.phone}
                  defaultMomoNumber={paymentConfig?.mobile_money_number}
                  defaultNetwork={paymentConfig?.mobile_money_provider}
                  ctaLabel={`Renew Subscription — GH₵${SAMLEYBOOK_PLAN_PRICE_GHS}`}
                  onPaymentActivated={async () => {
                    await refreshBusinessData();
                    await fetchHistory();
                  }}
                  onHistoryUpdated={fetchHistory}
                />
              </div>
            )}
          </div>
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
              <h3 className="text-sm font-extrabold text-[#111827]">
                Subscription Payment History
              </h3>
              <p className="text-[11px] text-slate-500">
                Moolre subscription renewal transactions in Supabase
              </p>
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
