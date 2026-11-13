import React, { useEffect, useState } from 'react';
import {
  Building2,
  X,
  Plus,
  AlertCircle,
  RefreshCw,
  Crown,
  CreditCard,
  CheckCircle2,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { getSupabase } from '../../lib/supabase';
import {
  canRegisterAdditionalBusiness,
  generateBusinessSlug,
  isValidGhanaPhone,
  resolvePremiumPlan,
} from '../../utils/booking-logic';
import { PRIMARY_ORANGE_BTN } from './ui/DashboardTokens';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateBusinessModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const {
    businesses,
    currentBusiness,
    subscription,
    createBusiness,
    refreshBusinessData,
  } = useBusiness();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Salons & Barbershops');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [justVerified, setJustVerified] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [planPrice, setPlanPrice] = useState<number>(120);
  const [planCode, setPlanCode] = useState<string>('premium');

  useEffect(() => {
    if (!isOpen) {
      setErrorMsg(null);
      setPaying(false);
      setJustVerified(false);
      return;
    }

    const fetchActivePlan = async () => {
      const supabase = getSupabase();
      if (!supabase) return;
      const { data } = await supabase
        .from('subscription_plans')
        .select('id, name, code, price_ghs')
        .eq('is_active', true)
        .order('price_ghs', { ascending: true });
      const resolved = resolvePremiumPlan(data || [], subscription?.plan_id);
      if (resolved) {
        if (resolved.price_ghs) setPlanPrice(Number(resolved.price_ghs));
        if (resolved.code) setPlanCode(resolved.code);
      }
    };
    fetchActivePlan();
  }, [isOpen, subscription?.plan_id]);

  if (!isOpen) return null;

  const isUnlocked =
    justVerified || canRegisterAdditionalBusiness(businesses.length, subscription);

  const handlePayNowUpgrade = async () => {
    if (!currentBusiness) {
      setErrorMsg('No active business found to associate payment with.');
      return;
    }

    setPaying(true);
    setErrorMsg(null);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase is not configured.');

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session expired. Please sign in again.');

      const initRes = await fetch('/api/subscriptions/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          businessId: currentBusiness.id,
          planCode,
        }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) {
        throw new Error(initData.error || 'Failed to initiate subscription payment.');
      }

      const verifyRes = await fetch('/api/subscriptions/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reference: initData.reference }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || 'Payment verification failed.');
      }

      await refreshBusinessData();
      setJustVerified(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upgrade payment failed.');
    } finally {
      setPaying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg('Please enter a business name');
      return;
    }
    if (!phone.trim() || !isValidGhanaPhone(phone)) {
      setErrorMsg('Please enter a valid Ghanaian phone number (e.g. 024XXXXXXX)');
      return;
    }
    if (!address.trim()) {
      setErrorMsg('Please specify the business location');
      return;
    }

    setSubmitting(true);

    try {
      const baseSlug = generateBusinessSlug(name);
      const uniqueSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;

      const { business, error } = await createBusiness({
        name: name.trim(),
        slug: uniqueSlug,
        category,
        phone: phone.trim(),
        address: address.trim(),
        description: description.trim() || undefined,
        is_active: true,
      });

      if (error || !business) {
        throw new Error(error?.message || 'Failed to register business');
      }

      setName('');
      setPhone('');
      setAddress('');
      setDescription('');
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0E1733]/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200/80 my-8 overflow-hidden text-left">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#FF6514] to-[#E64D00] px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              {isUnlocked ? (
                <Building2 className="w-5 h-5 text-white" />
              ) : (
                <Crown className="w-5 h-5 text-white" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-[15px] sm:text-base font-extrabold leading-snug">
                {isUnlocked
                  ? 'Register Another Business'
                  : 'Upgrade to Register Another Business'}
              </h3>
              <p className="text-[11px] text-orange-100 leading-snug mt-0.5">
                {isUnlocked
                  ? 'Manage multiple business locations or brands'
                  : 'Activate Book Premium to unlock additional locations or brands'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!isUnlocked ? (
            /* UPGRADE GATE BEFORE REGISTERING ADDITIONAL BUSINESS */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#FFF6EE] to-[#FFE7D4] border border-[#FADAC1] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#F95700] text-white text-[10px] font-extrabold uppercase tracking-wider">
                    Book Premium
                  </span>
                  <span className="text-sm font-black text-[#111827] tabular-nums">
                    GHS {planPrice.toFixed(2)}{' '}
                    <span className="text-[11px] font-semibold text-slate-500">/month</span>
                  </span>
                </div>
                <p className="text-xs font-bold text-[#111827]">
                  Upgrade required to manage multiple business locations or brands
                </p>
                <p className="text-[11.5px] text-slate-600 leading-relaxed">
                  Complete your <strong className="text-[#111827]">Book Premium</strong> subscription payment to unlock multi-business registration and instant workspace switching.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-2 border-t border-orange-200/60">
                  {[
                    'Online appointment booking',
                    'Business dashboard',
                    'Service & Customer management',
                    'Booking page & QR code',
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] text-slate-600">
                <ShieldCheck className="w-4 h-4 text-[#F95700] shrink-0 mt-0.5" />
                <span>
                  Once payment is verified, the <strong className="text-[#111827]">Register Another Business</strong> form opens immediately.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePayNowUpgrade}
                  disabled={paying}
                  className={`${PRIMARY_ORANGE_BTN} px-5 py-2.5 text-xs`}
                >
                  {paying ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Pay Now</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* REGISTER ANOTHER BUSINESS FORM (SHOWN AFTER VERIFICATION OR WHEN ALREADY PAID) */
            <form onSubmit={handleSubmit} className="space-y-4">
              {justVerified && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Subscription verified! Complete the form below to add your next business.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Business Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Osu Barber & Lounge"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F95700]/25 focus:border-[#F95700] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F95700]/25 focus:border-[#F95700] transition"
                >
                  <option value="Salons & Barbershops">Salons & Barbershops</option>
                  <option value="Spas & Wellness">Spas & Wellness</option>
                  <option value="Beauty & Grooming">Beauty & Grooming</option>
                  <option value="Photography Studios">Photography Studios</option>
                  <option value="Consultation & Professional Services">
                    Consultation & Professional Services
                  </option>
                  <option value="Other Appointment-Based Business">
                    Other Appointment-Based Business
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Business Phone Number
                </label>
                <input
                  type="tel"
                  required
                  placeholder="024XXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F95700]/25 focus:border-[#F95700] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Physical Location / Address
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Oxford Street, Osu, Accra"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F95700]/25 focus:border-[#F95700] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief description of services..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F95700]/25 focus:border-[#F95700] transition"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`${PRIMARY_ORANGE_BTN} px-5 py-2.5 text-xs`}
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Registering...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Register Business</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
