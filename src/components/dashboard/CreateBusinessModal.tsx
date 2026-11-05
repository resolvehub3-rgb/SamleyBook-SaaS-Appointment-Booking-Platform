import React, { useState } from 'react';
import { Building2, X, Plus, AlertCircle, RefreshCw, MapPin, Tag } from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { generateBusinessSlug, isValidGhanaPhone } from '../../utils/booking-logic';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 md:p-8 shadow-2xl border border-zinc-100 my-8 text-left">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900">Register Another Business</h3>
              <p className="text-xs text-zinc-500">Manage multiple business locations or brands</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Business Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Osu Barber & Lounge"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
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
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Business Phone Number
            </label>
            <input
              type="tel"
              required
              placeholder="024XXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Physical Location / Address
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Oxford Street, Osu, Accra"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Brief description of services..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-zinc-200 text-zinc-600 font-semibold text-xs hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-orange-700 disabled:opacity-50 transition"
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
  );
};
