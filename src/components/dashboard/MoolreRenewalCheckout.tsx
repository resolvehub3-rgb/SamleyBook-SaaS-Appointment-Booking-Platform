import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { getSupabase } from '../../lib/supabase';
import { isValidGhanaPhone } from '../../utils/booking-logic';
import {
  SAMLEYBOOK_PLAN_NAME,
  SAMLEYBOOK_PLAN_PRICE_GHS,
} from '../../utils/subscription-access';
import { PRIMARY_ORANGE_BTN } from './ui/DashboardTokens';

interface MoolreRenewalCheckoutProps {
  businessId: string;
  businessPhone?: string | null;
  defaultMomoNumber?: string | null;
  defaultNetwork?: string | null;
  ctaLabel?: string;
  onPaymentActivated?: () => Promise<void> | void;
  onHistoryUpdated?: () => void;
}

const MOMO_NETWORKS = ['MTN MoMo', 'Telecel Cash', 'AT Money'] as const;

function pendingStorageKey(businessId: string) {
  return `samley_pending_sub_ref:${businessId}`;
}

export const MoolreRenewalCheckout: React.FC<MoolreRenewalCheckoutProps> = ({
  businessId,
  businessPhone,
  defaultMomoNumber,
  defaultNetwork,
  ctaLabel = `Renew Subscription — GH₵${SAMLEYBOOK_PLAN_PRICE_GHS}`,
  onPaymentActivated,
  onHistoryUpdated,
}) => {
  const [network, setNetwork] = useState<string>(defaultNetwork || 'MTN MoMo');
  const [payerPhone, setPayerPhone] = useState<string>(
    defaultMomoNumber || businessPhone || ''
  );
  const [otpCode, setOtpCode] = useState<string>('');
  const [requiresOtp, setRequiresOtp] = useState<boolean>(false);

  const [pendingRef, setPendingRef] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(pendingStorageKey(businessId));
    } catch {
      return null;
    }
  });

  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    tone: 'info' | 'success' | 'error';
    text: string;
  } | null>(null);

  const pollAttemptsRef = useRef(0);

  // Sync defaults if business changes
  useEffect(() => {
    if (!payerPhone) {
      setPayerPhone(defaultMomoNumber || businessPhone || '');
    }
    if (defaultNetwork) {
      setNetwork(defaultNetwork);
    }
    try {
      setPendingRef(sessionStorage.getItem(pendingStorageKey(businessId)));
    } catch {
      setPendingRef(null);
    }
  }, [businessId, businessPhone, defaultMomoNumber, defaultNetwork]);

  const clearPendingRef = useCallback(() => {
    setPendingRef(null);
    pollAttemptsRef.current = 0;
    try {
      sessionStorage.removeItem(pendingStorageKey(businessId));
    } catch {
      // ignore
    }
  }, [businessId]);

  const verifyReference = useCallback(
    async (reference: string, options?: { silentPending?: boolean }) => {
      const supabase = getSupabase();
      if (!supabase) return 'error' as const;

      setVerifying(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          setStatusMessage({
            tone: 'error',
            text: 'Your session has expired. Please sign in again to verify payment.',
          });
          return 'error' as const;
        }

        const res = await fetch('/api/subscriptions/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reference }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.ok) {
          clearPendingRef();
          onHistoryUpdated?.();
          setStatusMessage({
            tone: 'success',
            text:
              data.message ||
              `${SAMLEYBOOK_PLAN_NAME} verified and activated for 30 days.`,
          });
          await onPaymentActivated?.();
          return 'successful' as const;
        }

        if (data.status === 'pending') {
          if (!options?.silentPending) {
            setStatusMessage({
              tone: 'info',
              text:
                data.message ||
                'Payment is still awaiting Mobile Money approval on your phone.',
            });
          }
          return 'pending' as const;
        }

        // Explicit provider failure or rejection
        clearPendingRef();
        onHistoryUpdated?.();
        setStatusMessage({
          tone: 'error',
          text:
            data.error ||
            data.message ||
            'Payment verification failed or was declined. You can safely retry below.',
        });
        return 'failed' as const;
      } catch (err) {
        if (!options?.silentPending) {
          setStatusMessage({
            tone: 'error',
            text:
              err instanceof Error
                ? err.message
                : 'Unable to reach verification server. Please retry.',
          });
        }
        return 'error' as const;
      } finally {
        setVerifying(false);
      }
    },
    [clearPendingRef, onHistoryUpdated, onPaymentActivated]
  );

  // Automatic short polling while awaiting Moolre MoMo approval
  useEffect(() => {
    if (!pendingRef) return;

    const timer = window.setInterval(async () => {
      if (pollAttemptsRef.current >= 12) {
        window.clearInterval(timer);
        return;
      }
      pollAttemptsRef.current += 1;
      const result = await verifyReference(pendingRef, { silentPending: true });
      if (result === 'successful' || result === 'failed') {
        window.clearInterval(timer);
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [pendingRef, verifyReference]);

  const handleInitiatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!isValidGhanaPhone(payerPhone)) {
      setStatusMessage({
        tone: 'error',
        text: 'Enter a valid Ghanaian Mobile Money number (e.g. 024XXXXXXX or 050XXXXXXX).',
      });
      return;
    }

    if (requiresOtp && !otpCode.trim()) {
      setStatusMessage({
        tone: 'error',
        text: 'Enter the Mobile Money OTP sent to your phone to continue.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase client is not configured.');

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session expired. Please sign in again.');

      const res = await fetch('/api/subscriptions/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          businessId,
          payerPhone: payerPhone.trim(),
          network,
          otpCode: requiresOtp ? otpCode.trim() : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      onHistoryUpdated?.();

      if (data?.requiresOtp) {
        setRequiresOtp(true);
        setStatusMessage({
          tone: 'info',
          text:
            data.message ||
            'An OTP is required by Moolre. Enter the OTP sent to your phone and resubmit.',
        });
        return;
      }

      if (!res.ok || !data?.ok || !data?.reference) {
        throw new Error(
          data?.error ||
            data?.message ||
            'Could not initiate Moolre Mobile Money payment.'
        );
      }

      setRequiresOtp(false);
      setOtpCode('');
      pollAttemptsRef.current = 0;
      setPendingRef(data.reference);
      try {
        sessionStorage.setItem(pendingStorageKey(businessId), data.reference);
      } catch {
        // ignore
      }

      setStatusMessage({
        tone: 'info',
        text:
          data.message ||
          `Mobile Money prompt for GH₵${SAMLEYBOOK_PLAN_PRICE_GHS} sent to ${payerPhone.trim()}. Approve on your phone to complete renewal.`,
      });
    } catch (err) {
      setStatusMessage({
        tone: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Unable to initiate Mobile Money payment.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 text-left">
      {statusMessage && (
        <div
          role="status"
          className={`p-3.5 rounded-2xl text-xs font-semibold flex items-start gap-2.5 border ${
            statusMessage.tone === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : statusMessage.tone === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          {statusMessage.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : statusMessage.tone === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          ) : (
            <Loader2 className="w-4 h-4 text-amber-600 animate-spin shrink-0 mt-0.5" />
          )}
          <span className="leading-relaxed">{statusMessage.text}</span>
        </div>
      )}

      {pendingRef ? (
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#F95700]">
                Awaiting Moolre Confirmation
              </p>
              <p className="text-xs font-extrabold text-[#111827] mt-0.5">
                Reference: <span className="font-mono">{pendingRef}</span>
              </p>
              <p className="text-[11.5px] text-slate-600 mt-1">
                Approve the GH₵{SAMLEYBOOK_PLAN_PRICE_GHS}.00 Mobile Money prompt on{' '}
                <strong className="text-[#111827]">{payerPhone || 'your phone'}</strong>.
                We are checking with Moolre automatically.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              disabled={verifying}
              onClick={() => verifyReference(pendingRef)}
              className={`${PRIMARY_ORANGE_BTN} flex-1 py-2.5 px-4 text-xs`}
            >
              {verifying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>{verifying ? 'Verifying with Moolre...' : 'Verify Payment Status'}</span>
            </button>

            <button
              type="button"
              disabled={verifying}
              onClick={() => {
                clearPendingRef();
                setStatusMessage(null);
              }}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs hover:bg-slate-50 transition"
            >
              Use Different Number
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleInitiatePayment} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={`momo-network-${businessId}`}
                className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5"
              >
                Mobile Money Network
              </label>
              <select
                id={`momo-network-${businessId}`}
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F95700]/25 focus:border-[#F95700] transition"
              >
                {MOMO_NETWORKS.map((net) => (
                  <option key={net} value={net}>
                    {net}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor={`momo-phone-${businessId}`}
                className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5"
              >
                Mobile Money Number
              </label>
              <div className="relative">
                <Smartphone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id={`momo-phone-${businessId}`}
                  type="tel"
                  required
                  placeholder="024XXXXXXX"
                  value={payerPhone}
                  onChange={(e) => setPayerPhone(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F95700]/25 focus:border-[#F95700] transition"
                />
              </div>
            </div>
          </div>

          {requiresOtp && (
            <div>
              <label
                htmlFor={`momo-otp-${businessId}`}
                className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5"
              >
                Moolre Verification OTP
              </label>
              <input
                id={`momo-otp-${businessId}`}
                type="text"
                required
                placeholder="Enter OTP received via SMS"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs font-mono font-bold rounded-xl border border-amber-300 bg-amber-50/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F95700]/25 focus:border-[#F95700]"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={`${PRIMARY_ORANGE_BTN} w-full py-3 px-5 text-xs sm:text-sm`}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Sending Moolre Payment Prompt...</span>
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                <span>{ctaLabel}</span>
              </>
            )}
          </button>

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A]" />
            <span>
              Secured by Moolre &middot; Access restores automatically upon verified settlement
            </span>
          </p>
        </form>
      )}
    </div>
  );
};
