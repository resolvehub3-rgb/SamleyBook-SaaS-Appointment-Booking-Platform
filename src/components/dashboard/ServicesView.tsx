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

export const ServicesView: React.FC = () => {
  const { currentBusiness, services, refreshBusinessData } = useBusiness();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

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

      // Upload image if selected
      if (imageFile) {
        const uploadResult = await uploadBusinessAsset(imageFile, 'services');
        if (uploadResult.url) {
          imageUrl = uploadResult.url;
        }
      }

      if (editingService) {
        // Update existing service
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
        // Create new service
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
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      await supabase
        .from('services')
        .update({ is_active: !service.is_active })
        .eq('id', service.id);

      await refreshBusinessData();
    } catch (err) {
      console.error('Failed to toggle status:', err);
    }
  };

  const handleDelete = async (serviceId: string) => {
    if (!confirm('Are you sure you want to delete this service?')) return;

    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const { error } = await supabase.from('services').delete().eq('id', serviceId);
      if (error) {
        alert(`Cannot delete service: ${error.message}`);
      } else {
        await refreshBusinessData();
      }
    } catch (err) {
      console.error('Error deleting service:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-zinc-900 tracking-tight">Services & Pricing</h2>
          <p className="text-xs text-zinc-500">
            Create, edit, and price the services offered on your public booking page
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-orange-700 shadow-xs transition"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Service</span>
        </button>
      </div>

      {/* Services List / Grid */}
      {services.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-zinc-200/80 shadow-xs space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
            <Scissors className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-zinc-900">No Services Added Yet</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
              Add your first haircut, styling, massage, consultation, or package to start accepting online bookings.
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-orange-700 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Service</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((svc) => (
            <div
              key={svc.id}
              className={`rounded-3xl bg-white border transition-all overflow-hidden flex flex-col justify-between shadow-xs ${
                svc.is_active ? 'border-zinc-200/80 hover:border-orange-200' : 'border-zinc-200 opacity-60'
              }`}
            >
              <div>
                {/* Service Image banner or placeholder */}
                <div className="h-40 bg-zinc-100 relative overflow-hidden">
                  {svc.image_url ? (
                    <img
                      src={svc.image_url}
                      alt={svc.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-300">
                      <Scissors className="w-10 h-10" />
                    </div>
                  )}

                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold shadow-xs ${
                        svc.is_active
                          ? 'bg-emerald-500 text-white'
                          : 'bg-zinc-700 text-white'
                      }`}
                    >
                      {svc.is_active ? 'Active on Page' : 'Inactive'}
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="p-5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-zinc-900 leading-snug">{svc.name}</h3>
                    <span className="text-base font-black text-orange-600 shrink-0">
                      {formatGHS(svc.price)}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-500 line-clamp-2 min-h-[32px]">
                    {svc.description || 'No description provided.'}
                  </p>

                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-600 pt-2 border-t border-zinc-100">
                    <Clock className="w-3.5 h-3.5 text-orange-600" />
                    <span>{formatDurationMinutes(svc.duration_minutes)}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-4 bg-zinc-50/70 border-t border-zinc-100 flex items-center justify-between">
                <button
                  onClick={() => handleToggleActive(svc)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
                  title={svc.is_active ? 'Deactivate service' : 'Reactivate service'}
                >
                  {svc.is_active ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Deactivate</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Activate</span>
                    </>
                  )}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(svc)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-orange-600 hover:bg-orange-50 transition"
                    title="Edit Service"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(svc.id)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition"
                    title="Delete Service"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 md:p-8 shadow-2xl border border-zinc-100 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
              <h3 className="text-lg font-bold text-zinc-900">
                {editingService ? 'Edit Service' : 'Add New Service'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
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

            <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-left">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Service Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Traditional Beard Sculpting"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe what is included in this service..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Price (GHS)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="5"
                    step="5"
                    required
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <p className="mt-1 text-[11px] font-semibold text-orange-600">
                    {formatDurationMinutes(duration)}
                  </p>
                </div>
              </div>

              {/* Service Image Upload */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Service Image (Optional)
                </label>
                <div className="flex items-center gap-3">
                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-14 h-14 rounded-xl object-cover border border-zinc-200"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-zinc-100 border border-dashed border-zinc-300 flex items-center justify-center text-zinc-400">
                      <Upload className="w-5 h-5" />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="text-xs text-zinc-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer"
                  />
                </div>
              </div>

              {/* Status Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded text-orange-600 focus:ring-orange-500"
                />
                <label htmlFor="isActive" className="text-xs font-semibold text-zinc-700">
                  Make service visible on public booking page
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-zinc-200 text-zinc-600 font-semibold text-xs hover:bg-zinc-50 transition"
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
                      <span>Saving Service...</span>
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
      )}
    </div>
  );
};
