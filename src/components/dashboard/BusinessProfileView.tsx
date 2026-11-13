import React, { useState, useEffect } from 'react';
import {
  Building2,
  Clock,
  Upload,
  Check,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { uploadBusinessAsset } from '../../lib/supabase';
import { BusinessOperatingHoursWeekly } from '../../types/database';
import { PRIMARY_ORANGE_BTN, SURFACE_CARD } from './ui/DashboardTokens';

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

  if (!currentBusiness) {
    return (
      <div className={`${SURFACE_CARD} p-8 text-center`}>
        <h3 className="text-base font-extrabold text-[#111827]">No Business Selected</h3>
        <p className="text-xs text-slate-500 mt-1">
          Select or register a business to manage its profile and operating hours.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left max-w-4xl">
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core Info */}
        <div className={`${SURFACE_CARD} p-6 md:p-7 space-y-5`}>
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5">
            <div className="w-8 h-8 rounded-xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#111827]">General Business Details</h3>
              <p className="text-[11px] text-slate-500">
                Shown to customers on your public booking page
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Business Name
              </label>
              <input
                type="text"
                required
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Public Business Phone
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F95700]/25 focus:border-[#F95700] font-mono transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Business Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F95700]/25 focus:border-[#F95700] transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Physical Location / Address
            </label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F95700]/25 focus:border-[#F95700] transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F95700]/25 focus:border-[#F95700] transition"
            />
          </div>

          {/* Logo Upload */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Business Logo / Image
            </label>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Logo Preview"
                  className="w-14 h-14 rounded-2xl object-cover border border-slate-200"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                  <Upload className="w-5 h-5" />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="text-xs text-slate-500 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#FFF3EC] file:text-[#F95700] hover:file:bg-[#FFE7D4] cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Operating Hours Weekly Grid */}
        <div className={`${SURFACE_CARD} p-6 md:p-7 space-y-4`}>
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5">
            <div className="w-8 h-8 rounded-xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#111827]">
                Operating Hours & Availability Schedule
              </h3>
              <p className="text-[11px] text-slate-500">
                Appointment slots are computed automatically from these hours and your service durations
              </p>
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            {DAYS.map((day) => {
              const dayData = operatingHours[day];
              return (
                <div
                  key={day}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/70"
                >
                  <div className="w-36 flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      id={`day-${day}`}
                      checked={dayData.isOpen}
                      onChange={(e) => handleDayChange(day, 'isOpen', e.target.checked)}
                      className="w-4 h-4 rounded accent-[#F95700] cursor-pointer"
                    />
                    <label
                      htmlFor={`day-${day}`}
                      className="text-xs font-extrabold text-[#111827] capitalize cursor-pointer"
                    >
                      {day}
                    </label>
                  </div>

                  {dayData.isOpen ? (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="font-semibold">Open:</span>
                      <input
                        type="time"
                        value={dayData.open}
                        onChange={(e) => handleDayChange(day, 'open', e.target.value)}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-mono text-xs"
                      />
                      <span className="font-semibold">to</span>
                      <input
                        type="time"
                        value={dayData.close}
                        onChange={(e) => handleDayChange(day, 'close', e.target.value)}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-mono text-xs"
                      />
                    </div>
                  ) : (
                    <span className="inline-flex px-2.5 py-1 rounded-full bg-slate-100 text-[11px] font-bold text-slate-400">
                      Closed All Day
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={saving}
            className={`${PRIMARY_ORANGE_BTN} px-6 py-3 text-xs`}
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
