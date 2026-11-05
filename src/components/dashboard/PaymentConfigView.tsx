import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Phone,
  ShieldCheck,
  Check,
  AlertCircle,
  RefreshCw,
  HelpCircle,
  Percent,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { getSupabase } from '../../lib/supabase';
import { isValidGhanaPhone } from '../../utils/booking-logic';

export const PaymentConfigView: React.FC = () => {
  const { currentBusiness, paymentConfig, refreshBusinessData } = useBusiness();

  const [paymentType, setPaymentType] = useState<'full' | 'deposit'>('full');
  const [depositType, setDepositType] = useState<'percentage' | 'fixed'>('percentage');
  const [depositPercentage, setDepositPercentage] = useState<string>('50');
  const [depositFixedAmount, setDepositFixedAmount] = useState<string>('20');
  const [momoNumber, setMomoNumber] = useState('');
  const [provider, setProvider] = useState<'MTN MoMo' | 'Telecel Cash' | 'AT Money'>('MTN MoMo');

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (paymentConfig) {
      setPaymentType(paymentConfig.payment_type || 'full');
      setDepositType(paymentConfig.deposit_type || 'percentage');
      setDepositPercentage(paymentConfig.deposit_percentage?.toString() || '50');
      setDepositFixedAmount(paymentConfig.deposit_fixed_amount?.toString() || '20');
      setMomoNumber(paymentConfig.mobile_money_number || currentBusiness?.phone || '');
      setProvider(paymentConfig.mobile_money_provider || 'MTN MoMo');
    } else if (currentBusiness) {
      setMomoNumber(currentBusiness.phone || '');
    }
  }, [paymentConfig, currentBusiness]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBusiness) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    if (momoNumber && !isValidGhanaPhone(momoNumber)) {
      setErrorMsg('Please enter a valid Ghanaian Mobile Money phone number (e.g. 024XXXXXXX)');
      return;
    }

    setSaving(true);

    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase client not ready');

      const payload = {
        business_id: currentBusiness.id,
        payment_type: paymentType,
        deposit_type: depositType,
        deposit_percentage: parseFloat(depositPercentage) || 50,
        deposit_fixed_amount: parseFloat(depositFixedAmount) || 0,
        mobile_money_number: momoNumber.trim() || null,
        mobile_money_provider: provider,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('payment_configurations')
        .upsert(payload, { onConflict: 'business_id' });

      if (error) throw error;

      await refreshBusinessData();
      setSuccessMsg('Payment settings saved and updated for your public booking page!');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-left max-w-4xl">
      <div>
        <h2 className="text-xl font-black text-zinc-900 tracking-tight">Payment Configuration</h2>
        <p className="text-xs text-zinc-500">
          Configure Mobile Money recipient details and customer checkout requirements via Moolre
        </p>
      </div>

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2.5">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Recipient Destination Card */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-6 md:p-8 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-zinc-100">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900">Mobile Money Settlement Destination</h3>
              <p className="text-xs text-zinc-500">
                The designated business Mobile Money account to receive customer booking funds
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Mobile Money Network
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as any)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
              >
                <option value="MTN MoMo">MTN Mobile Money</option>
                <option value="Telecel Cash">Telecel Cash</option>
                <option value="AT Money">AT Money (AirtelTigo)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Settlement Mobile Money Number
              </label>
              <input
                type="tel"
                required
                placeholder="024XXXXXXX"
                value={momoNumber}
                onChange={(e) => setMomoNumber(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
              />
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-600 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p>
              <strong>Security Guarantee:</strong> Owners never need to enter developer API keys or private credentials. Moolre platform credentials remain securely handled on the server side.
            </p>
          </div>
        </div>

        {/* Payment Policy Card (Full vs Deposit) */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-6 md:p-8 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-zinc-100">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900">Customer Payment Requirements</h3>
              <p className="text-xs text-zinc-500">
                Choose whether clients pay the full amount or a deposit upfront when booking
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setPaymentType('full')}
              className={`p-5 rounded-2xl border text-left transition ${
                paymentType === 'full'
                  ? 'border-orange-600 bg-orange-50/50 ring-2 ring-orange-100'
                  : 'border-zinc-200 hover:border-zinc-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-zinc-900">Full Payment (100%)</span>
                {paymentType === 'full' && (
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-600" />
                )}
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Customers must pay the complete service amount in full before their booking is confirmed.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setPaymentType('deposit')}
              className={`p-5 rounded-2xl border text-left transition ${
                paymentType === 'deposit'
                  ? 'border-orange-600 bg-orange-50/50 ring-2 ring-orange-100'
                  : 'border-zinc-200 hover:border-zinc-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-zinc-900">Deposit / Down Payment</span>
                {paymentType === 'deposit' && (
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-600" />
                )}
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Customers pay a deposit to secure their appointment slot, with the remainder payable in person.
              </p>
            </button>
          </div>

          {paymentType === 'deposit' && (
            <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700 cursor-pointer">
                  <input
                    type="radio"
                    name="depType"
                    checked={depositType === 'percentage'}
                    onChange={() => setDepositType('percentage')}
                    className="text-orange-600 focus:ring-orange-500"
                  />
                  <span>Percentage of Service Price</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700 cursor-pointer">
                  <input
                    type="radio"
                    name="depType"
                    checked={depositType === 'fixed'}
                    onChange={() => setDepositType('fixed')}
                    className="text-orange-600 focus:ring-orange-500"
                  />
                  <span>Fixed Cedi Amount</span>
                </label>
              </div>

              {depositType === 'percentage' ? (
                <div className="max-w-xs">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Deposit Percentage (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="10"
                      max="100"
                      value={depositPercentage}
                      onChange={(e) => setDepositPercentage(e.target.value)}
                      className="w-full pl-3.5 pr-8 py-2 text-xs rounded-xl border border-zinc-300 bg-white"
                    />
                    <Percent className="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-2.5" />
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1">Commonly 50% for grooming and salons</p>
                </div>
              ) : (
                <div className="max-w-xs">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Fixed Deposit Amount (GHS)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={depositFixedAmount}
                    onChange={(e) => setDepositFixedAmount(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-300 bg-white"
                  />
                  <p className="text-[11px] text-zinc-500 mt-1">E.g. GHS 20.00 flat deposit hold</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-orange-700 shadow-sm disabled:opacity-50 transition"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving Configuration...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Save Payment Settings</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
