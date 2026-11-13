import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  Crown,
  Lock,
  LogOut,
  Receipt,
  ShieldCheck,
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

interface SubscriptionPaymentRecord {
  id: string;
  amount: number;
  status: string;
  moolre_reference?: string | null;
  provider_reference?: string | null;
  payment_provider: string;
  created_at: string;
}

const PREMIUM_INCLUDED_FEATURES = [
  'Online appointment booking & public QR page',
  'Full Business Dashboard & real-time calendar',
  'Services, pricing & duration management',
  'Customer directory & booking history',
  'Customer feedback invitations & analytics',
  'Automated SMS confirmations & reminders',
];

interface SubscriptionLockScreenProps {
  onSignOut: () => Promise<void> | void;
  onUnlocked?: () => void;
}

export const SubscriptionLockScreen: React.FC<SubscriptionLockScreenProps> = ({
  onSignOut,
  onUnlocked,
}) => {
  const { profile } = useAuth();
  const {
    businesses,
    currentBusiness,
    setCurrentBusiness,
    subscription,
    subscriptionAccess,
    paymentConfig,
    refreshBusinessData,
  } = useBusiness();

  const [paymentHistory, setPaymentHistory] = useState<SubscriptionPaymentRecord[]>([]);
  const [signingOut, setSigningOut] = useState(false);

  const loadHistory = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !currentBusiness?.id) return;
    const { data } = await supabase
      .from('payment_transactions')
      .select(
        'id, amount, status, moolre_reference, provider_reference, payment_provider, created_at'
      )
      .eq('business_id', currentBusiness.id)
      .is('appointment_id', null)
      .order('created_at', { ascending: false })
      .limit(10);

    setPaymentHistory((data as SubscriptionPaymentRecord[]) || []);
  }, [currentBusiness?.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, subscription?.updated_at]);

  const handleLogoutClick = async () => {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  };

  const handleActivated = async () => {
    await refreshBusinessData();
    await loadHistory();
    onUnlocked?.();
  };

  const isTrialExpired = subscriptionAccess.isTrialExpired;
  const statusLabel = isTrialExpired
    ? 'Trial Expired'
    : subscriptionAccess.effectiveStatus === 'past_due'
    ? 'Past Due'
    : subscriptionAccess.effectiveStatus === 'canceled'
    ? 'Canceled'
    : 'Expired';

  const previousExpiryFormatted = subscriptionAccess.expiryIso
    ? new Date(subscriptionAccess.expiryIso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Not active';

  return (
    <div
      className="min-h-screen bg-[#F5F6FA] flex flex-col text-left"
      data-testid="subscription-lock-screen"
    >
      {/* Minimal Lock Header (NO Dashboard Sidebar, NO Marketing Links) */}
      <header className="bg-[#0E1733] text-white border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white p-1 flex items-center justify-center shrink-0">
              <img
                src="/assets/aistudio/logo1_6de85ee8.png"
                alt="SamleyBook"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="text-base font-black tracking-tight leading-none">SamleyBook</p>
              <p className="text-[10.5px] font-semibold text-orange-300 mt-1 truncate">
                Subscription Renewal Required
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {businesses.length > 1 && currentBusiness && (
              <div className="relative hidden sm:block">
                <select
                  aria-label="Switch business"
                  value={currentBusiness.id}
                  onChange={(e) => {
                    const matched = businesses.find((b) => b.id === e.target.value);
                    if (matched) setCurrentBusiness(matched);
                  }}
                  className="appearance-none bg-white/10 border border-white/20 text-white text-xs font-bold rounded-xl pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-[#F95700]"
                >
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id} className="text-slate-900">
                      {b.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-white/70 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
            )}

            <button
              type="button"
              disabled={signingOut}
              onClick={handleLogoutClick}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-rose-500/20 border border-white/15 text-xs font-bold text-white transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{signingOut ? 'Signing Out...' : 'Sign Out'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Dedicated Renewal Workspace */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Lock Notice Banner */}
        <section className="rounded-3xl bg-[#0E1733] text-white p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-2.5 max-w-2xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/35 text-rose-200 text-[11px] font-extrabold uppercase tracking-wider">
                <Lock className="w-3.5 h-3.5" />
                <span>Account Access Locked</span>
              </span>

              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Your Subscription Has Expired
              </h1>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {isTrialExpired
                  ? `Your 7-day free trial for ${
                      currentBusiness?.name || 'your business'
                    } has ended. Renew your SamleyBook Premium subscription to unlock your business dashboard and resume accepting online bookings.`
                  : `Your 30-day SamleyBook Premium subscription for ${
                      currentBusiness?.name || 'your business'
                    } has expired. Complete your GH₵${SAMLEYBOOK_PLAN_PRICE_GHS} renewal below to immediately restore full workspace access.`}
              </p>

              <p className="text-[11.5px] text-emerald-300 font-semibold flex items-center gap-1.5 pt-1">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>
                  All your appointments, customers, services, and feedback records are safely preserved.
                </span>
              </p>
            </div>

            <div className="rounded-2xl bg-white/10 border border-white/15 px-5 py-4 shrink-0 min-w-[200px]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-orange-300">
                Required Renewal Amount
              </p>
              <p className="text-3xl font-black text-white tabular-nums mt-1">
                GH₵{SAMLEYBOOK_PLAN_PRICE_GHS}
              </p>
              <p className="text-xs text-slate-300 font-semibold mt-0.5">Every 30 days</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Single SamleyBook Premium Card & Moolre Checkout */}
          <section className="lg:col-span-7 rounded-3xl bg-white border-2 border-[#F95700] shadow-[0_12px_32px_rgba(249,87,0,0.12)] p-6 sm:p-7 space-y-6">
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF3EC] text-[#F95700] text-[10.5px] font-extrabold uppercase tracking-wider">
                  <Crown className="w-3.5 h-3.5" />
                  <span>Subscription Plan</span>
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-[#111827] mt-2">
                  {SAMLEYBOOK_PLAN_NAME}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  One complete subscription plan with full SamleyBook platform access.
                </p>
              </div>

              <div className="text-right shrink-0">
                <p className="text-2xl sm:text-3xl font-black text-[#111827] tabular-nums">
                  GH₵{SAMLEYBOOK_PLAN_PRICE_GHS}
                </p>
                <p className="text-[11px] font-bold text-slate-500">Every 30 days</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PREMIUM_INCLUDED_FEATURES.map((feat) => (
                <div key={feat} className="flex items-start gap-2 text-xs text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>

            {currentBusiness && (
              <div className="pt-4 border-t border-slate-100">
                <MoolreRenewalCheckout
                  businessId={currentBusiness.id}
                  businessPhone={currentBusiness.phone || profile?.phone}
                  defaultMomoNumber={paymentConfig?.mobile_money_number}
                  defaultNetwork={paymentConfig?.mobile_money_provider}
                  ctaLabel={`Renew Subscription — GH₵${SAMLEYBOOK_PLAN_PRICE_GHS}`}
                  onPaymentActivated={handleActivated}
                  onHistoryUpdated={loadHistory}
                />
              </div>
            )}
          </section>

          {/* Right Column: Locked Account Summary + Subscription Payment History */}
          <aside className="lg:col-span-5 space-y-5">
            <div className="rounded-3xl bg-white border border-slate-200/80 shadow-xs p-5 space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                <div className="w-8 h-8 rounded-xl bg-slate-100 text-[#0E1733] flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#111827]">Account Status</h3>
                  <p className="text-[11px] text-slate-500">Current business subscription record</p>
                </div>
              </div>

              <dl className="space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500 font-medium">Business Name</dt>
                  <dd className="font-extrabold text-[#111827] text-right truncate max-w-[60%]">
                    {currentBusiness?.name || '—'}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500 font-medium">Subscription Status</dt>
                  <dd>
                    <span className="inline-flex px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-extrabold">
                      {statusLabel}
                    </span>
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500 font-medium">Previous Expiry Date</dt>
                  <dd className="font-bold text-[#111827] tabular-nums">
                    {previousExpiryFormatted}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500 font-medium">Account Access</dt>
                  <dd className="inline-flex items-center gap-1 font-extrabold text-rose-700">
                    <Lock className="w-3 h-3" />
                    <span>Locked</span>
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <dt className="text-slate-500 font-medium">Renewal Amount</dt>
                  <dd className="font-black text-[#F95700] tabular-nums">
                    GH₵{SAMLEYBOOK_PLAN_PRICE_GHS}.00 / 30 days
                  </dd>
                </div>
              </dl>
            </div>

            {/* Permitted Payment History while Locked */}
            <div className="rounded-3xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-[#F95700]" />
                  <h3 className="text-sm font-extrabold text-[#111827]">
                    Subscription Payment History
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-slate-400">
                  {paymentHistory.length}
                </span>
              </div>

              {paymentHistory.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No previous subscription payments recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {paymentHistory.map((tx) => (
                    <div
                      key={tx.id}
                      className="px-5 py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-[#111827] truncate">
                          {tx.moolre_reference || tx.id.slice(0, 10).toUpperCase()}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {new Date(tx.created_at).toLocaleDateString()} &middot;{' '}
                          {tx.payment_provider}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-extrabold text-[#111827] tabular-nums">
                          {formatGHS(tx.amount)}
                        </p>
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold capitalize mt-0.5 ${
                            tx.status === 'successful'
                              ? 'bg-emerald-50 text-emerald-700'
                              : tx.status === 'pending'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};
