import React, { useState } from 'react';
import { Building2, X, Plus, AlertCircle, RefreshCw } from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { generateBusinessSlug, isValidGhanaPhone } from '../../utils/booking-logic';
import { PRIMARY_ORANGE_BTN } from './ui/DashboardTokens';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateBusinessModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { createBusiness } = useBusiness();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Salons & Barbershops');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

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
        <div className="bg-gradient-to-r from-[#FF6514] to-[#E64D00] px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-extrabold">Register Another Business</h3>
              <p className="text-[11px] text-orange-100">
                Manage multiple business locations or brands
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition"
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

          <form onSubmit={handleSubmit} className="space-y-4">
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
        </div>
      </div>
    </div>
  );
};
