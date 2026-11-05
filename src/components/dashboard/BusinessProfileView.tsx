import React, { useState, useEffect } from 'react';
import {
  Building2,
  Phone,
  Mail,
  MapPin,
  Clock,
  Upload,
  Check,
  AlertCircle,
  RefreshCw,
  Tag,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { getSupabase, uploadBusinessAsset } from '../../lib/supabase';
import { BusinessOperatingHoursWeekly } from '../../types/database';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

export const BusinessProfileView: React.FC = () => {
  const { currentBusiness, updateBusiness } = useBusiness();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Salons & Barbershops');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [operatingHours, setOperatingHours] = useState<BusinessOperatingHoursWeekly>({
    monday: { open: '08:00', close: '18:00', isOpen: true },
    tuesday: { open: '08:00', close: '18:00', isOpen: true },
    wednesday: { open: '08:00', close: '18:00', isOpen: true },
    thursday: { open: '08:00', close: '18:00', isOpen: true },
    friday: { open: '08:00', close: '18:00', isOpen: true },
    saturday: { open: '09:00', close: '17:00', isOpen: true },
    sunday: { open: '10:00', close: '14:00', isOpen: false },
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (currentBusiness) {
      setName(currentBusiness.name);
      setCategory(currentBusiness.category);
      setDescription(currentBusiness.description || '');
      setPhone(currentBusiness.phone);
      setEmail(currentBusiness.email || '');
      setAddress(currentBusiness.address);
      if (currentBusiness.operating_hours) {
        setOperatingHours(currentBusiness.operating_hours);
      }
      setLogoPreview(currentBusiness.logo_url || null);
    }
  }, [currentBusiness]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleDayChange = (
    day: keyof BusinessOperatingHoursWeekly,
    field: 'open' | 'close' | 'isOpen',
    value: string | boolean
  ) => {
    setOperatingHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBusiness) return;

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      let logoUrl = currentBusiness.logo_url;

      if (logoFile) {
        const uploadResult = await uploadBusinessAsset(logoFile, 'logos');
        if (uploadResult.url) {
          logoUrl = uploadResult.url;
        }
      }

      const updates = {
        name: name.trim(),
        category,
        description: description.trim() || null,
        phone: phone.trim(),
        email: email.trim() || null,
        address: address.trim(),
        operating_hours: operatingHours,
        logo_url: logoUrl,
      };

      const { error } = await updateBusiness(currentBusiness.id, updates);
      if (error) throw error;

      setSuccessMsg('Business profile and operating hours updated successfully!');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update business profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-left max-w-4xl">
      <div>
        <h2 className="text-xl font-black text-zinc-900 tracking-tight">Business Profile & Operating Hours</h2>
        <p className="text-xs text-zinc-500">
          Update the profile information and opening schedule displayed to customers on your public booking page
        </p>
      </div>

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core Info */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-6 md:p-8 space-y-4">
          <h3 className="text-base font-bold text-zinc-900 border-b border-zinc-100 pb-3">
            General Business Details
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Business Name
              </label>
              <input
                type="text"
                required
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Public Business Phone
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Business Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Physical Location / Address
            </label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Logo Upload */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Business Logo / Image
            </label>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Logo Preview"
                  className="w-14 h-14 rounded-2xl object-cover border border-zinc-200"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-zinc-100 border border-dashed border-zinc-300 flex items-center justify-center text-zinc-400">
                  <Upload className="w-5 h-5" />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="text-xs text-zinc-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Operating Hours Weekly Grid */}
        <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-6 md:p-8 space-y-4">
          <h3 className="text-base font-bold text-zinc-900 border-b border-zinc-100 pb-3">
            Operating Hours & Availability Schedule
          </h3>
          <p className="text-xs text-zinc-500">
            Appointment slots are automatically computed based on these hours and your service durations.
          </p>

          <div className="space-y-3 pt-2">
            {DAYS.map((day) => {
              const dayData = operatingHours[day];
              return (
                <div
                  key={day}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-zinc-50 border border-zinc-200/60"
                >
                  <div className="w-32 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`day-${day}`}
                      checked={dayData.isOpen}
                      onChange={(e) => handleDayChange(day, 'isOpen', e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <label
                      htmlFor={`day-${day}`}
                      className="text-xs font-bold text-zinc-900 capitalize cursor-pointer"
                    >
                      {day}
                    </label>
                  </div>

                  {dayData.isOpen ? (
                    <div className="flex items-center gap-2 text-xs">
                      <span>Open:</span>
                      <input
                        type="time"
                        value={dayData.open}
                        onChange={(e) => handleDayChange(day, 'open', e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg border border-zinc-300 bg-white font-mono"
                      />
                      <span>to</span>
                      <input
                        type="time"
                        value={dayData.close}
                        onChange={(e) => handleDayChange(day, 'close', e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg border border-zinc-300 bg-white font-mono"
                      />
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-zinc-400">Closed All Day</span>
                  )}
                </div>
              );
            })}
          </div>
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
                <span>Saving Profile...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Save Business Profile</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
