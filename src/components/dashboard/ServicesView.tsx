import React, { useState } from 'react';
import {
  Scissors,
  Plus,
  Edit2,
  Trash2,
  Clock,
  Upload,
  Check,
  X,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { getSupabase, uploadBusinessAsset } from '../../lib/supabase';
import { formatGHS, formatDurationMinutes } from '../../utils/booking-logic';
import { Service } from '../../types/database';
import { PRIMARY_ORANGE_BTN, SURFACE_CARD } from './ui/DashboardTokens';

export const ServicesView: React.FC = () => {
  const { currentBusiness, services, refreshBusinessData } = useBusiness();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<string>('50');
  const [duration, setDuration] = useState<string>('30');
  const [isActive, setIsActive] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openCreateModal = () => {
    setEditingService(null);
    setName('');
    setDescription('');
    setPrice('50');
    setDuration('30');
    setIsActive(true);
    setImageFile(null);
    setImagePreview(null);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (service: Service) => {
    setEditingService(service);
    setName(service.name);
    setDescription(service.description || '');
    setPrice(service.price.toString());
    setDuration(service.duration_minutes.toString());
    setIsActive(service.is_active);
    setImageFile(null);
    setImagePreview(service.image_url || null);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBusiness) return;
    setErrorMsg(null);

    const numericPrice = parseFloat(price);
    const numericDuration = parseInt(duration, 10);

    if (!name.trim()) {
      setErrorMsg('Service name is required');
      return;
    }
    if (isNaN(numericPrice) || numericPrice < 0) {
      setErrorMsg('Please enter a valid price');
      return;
    }
    if (isNaN(numericDuration) || numericDuration <= 0) {
      setErrorMsg('Duration must be greater than 0 minutes');
      return;
    }

    setSubmitting(true);

    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase client not ready');

      let imageUrl = editingService?.image_url || null;

      if (imageFile) {
        const uploadResult = await uploadBusinessAsset(imageFile, 'services');
        if (uploadResult.url) {
          imageUrl = uploadResult.url;
        } else if (uploadResult.error) {
          throw new Error(`Image upload failed: ${uploadResult.error}`);
        }
      }

      if (editingService) {
        const { error } = await supabase
          .from('services')
          .update({
            name: name.trim(),
            description: description.trim() || null,
            price: numericPrice,
            duration_minutes: numericDuration,
            is_active: isActive,
            image_url: imageUrl,
          })
          .eq('id', editingService.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('services').insert({
          business_id: currentBusiness.id,
          name: name.trim(),
          description: description.trim() || null,
          price: numericPrice,
          duration_minutes: numericDuration,
          is_active: isActive,
          image_url: imageUrl,
        });

        if (error) throw error;
      }

      await refreshBusinessData();
      setModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (service: Service) => {
    setActionError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const { error } = await supabase
        .from('services')
        .update({ is_active: !service.is_active })
        .eq('id', service.id);

      if (error) throw error;
      await refreshBusinessData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to toggle service status');
    }
  };

  const handleDelete = async (serviceId: string) => {
    setActionError(null);
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const { error } = await supabase.from('services').delete().eq('id', serviceId);
      if (error) {
        setActionError(`Cannot delete service: ${error.message}`);
      } else {
        setConfirmDeleteId(null);
        await refreshBusinessData();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error deleting service');
    }
  };

  const activeCount = services.filter((s) => s.is_active).length;

  return (
    <div className="space-y-6 text-left">
      {/* Summary & Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-2xl bg-gradient-to-br from-[#FFF6EE] to-[#FFE7D4] border border-[#FADAC1] text-xs font-bold text-[#111827]">
            Total Services: <span className="font-black text-[#F95700] ml-1">{services.length}</span>
          </div>
          <div className="px-4 py-2 rounded-2xl bg-gradient-to-br from-[#ECFDF5] to-[#CEFAE0] border border-[#A7F3D0] text-xs font-bold text-[#111827]">
            Active on Booking Page: <span className="font-black text-emerald-700 ml-1">{activeCount}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className={`${PRIMARY_ORANGE_BTN} px-4 py-2.5 text-xs`}
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Add New Service</span>
        </button>
      </div>

      {actionError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button type="button" onClick={() => setActionError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Services List / Grid */}
      {services.length === 0 ? (
        <div className={`${SURFACE_CARD} p-12 text-center space-y-4`}>
          <div className="w-12 h-12 rounded-2xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center mx-auto">
            <Scissors className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-[#111827]">No Services Added Yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Add your first haircut, styling, massage, consultation, or package to start accepting online bookings.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className={`${PRIMARY_ORANGE_BTN} px-5 py-2.5 text-xs`}
          >
            <Plus className="w-4 h-4" />
            <span>Create First Service</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {services.map((svc) => (
            <div
              key={svc.id}
              className={`${SURFACE_CARD} overflow-hidden flex flex-col justify-between transition-all ${
                svc.is_active ? 'hover:border-orange-200 hover:shadow-md' : 'opacity-65'
              }`}
            >
              <div>
                <div className="h-40 bg-slate-100 relative overflow-hidden">
                  {svc.image_url ? (
                    <img
                      src={svc.image_url}
                      alt={svc.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#FFF6EE] to-[#FFE7D4] text-[#F95700]/40">
                      <Scissors className="w-10 h-10" />
                    </div>
                  )}

                  <div className="absolute top-3 right-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-xs ${
                        svc.is_active
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-700 text-white'
                      }`}
                    >
                      {svc.is_active ? 'Active on Page' : 'Inactive'}
                    </span>
                  </div>
                </div>

                <div className="p-5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-extrabold text-[#111827] leading-snug">{svc.name}</h3>
                    <span className="text-base font-black text-[#F95700] shrink-0">
                      {formatGHS(svc.price)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 line-clamp-2 min-h-[32px]">
                    {svc.description || 'No description provided.'}
                  </p>

                  <div className="flex items-center gap-2 text-xs font-bold text-slate-600 pt-2 border-t border-slate-100">
                    <Clock className="w-3.5 h-3.5 text-[#F95700]" />
                    <span>{formatDurationMinutes(svc.duration_minutes)}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="px-4 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-2">
                {confirmDeleteId === svc.id ? (
                  <div className="flex items-center justify-between w-full gap-2">
                    <span className="text-[11px] font-bold text-rose-700">Delete service?</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-600"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(svc.id)}
                        className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700"
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(svc)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#111827]"
                    >
                      {svc.is_active ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                          <span>Deactivate</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Activate</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditModal(svc)}
                        aria-label={`Edit ${svc.name}`}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-[#F95700] hover:bg-orange-50 transition"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(svc.id)}
                        aria-label={`Delete ${svc.name}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="bg-gradient-to-r from-[#FF6514] to-[#E64D00] px-6 py-4 flex items-center justify-between text-white">
              <h3 className="text-base font-extrabold">
                {editingService ? 'Edit Service' : 'Add New Service'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/15"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {errorMsg && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4 text-left">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Service Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Traditional Beard Sculpting"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F95700]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Describe what is included in this service..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F95700]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Price (GHS)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F95700]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Duration (Minutes)
                    </label>
                    <input
                      type="number"
                      min="5"
                      step="5"
                      required
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F95700]"
                    />
                    <p className="mt-1 text-[11px] font-bold text-[#F95700]">
                      {formatDurationMinutes(duration)}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Service Image (Optional)
                  </label>
                  <div className="flex items-center gap-3">
                    {imagePreview ? (
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-14 h-14 rounded-xl object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                        <Upload className="w-5 h-5" />
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#FFF3EC] file:text-[#F95700] hover:file:bg-orange-100 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded text-[#F95700] focus:ring-[#F95700]"
                  />
                  <label htmlFor="isActive" className="text-xs font-bold text-slate-700">
                    Make service visible on public booking page
                  </label>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
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
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>{editingService ? 'Update Service' : 'Save Service'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
