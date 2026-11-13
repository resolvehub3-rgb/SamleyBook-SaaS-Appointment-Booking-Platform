import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CalendarClock, X } from 'lucide-react';

export interface AdminConfirmConfig {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger' | 'success';
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  rescheduleFields?: {
    initialDate: string;
    initialTime: string;
  };
  onConfirm: (payload: { reason?: string; date?: string; time?: string }) => Promise<void> | void;
}

interface Props {
  config: AdminConfirmConfig | null;
  onClose: () => void;
}

export const AdminConfirmationModal: React.FC<Props> = ({ config, onClose }) => {
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setReason('');
      setDate(config.rescheduleFields?.initialDate || '');
      setTime((config.rescheduleFields?.initialTime || '').slice(0, 5));
      setError(null);
      setSubmitting(false);
    }
  }, [config]);

  if (!config) return null;

  const tone = config.tone || 'primary';
  const iconBg =
    tone === 'danger'
      ? 'bg-red-50 text-red-600 border-red-200'
      : tone === 'success'
      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
      : 'bg-orange-50 text-[#E87936] border-orange-200';

  const btnClasses =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : tone === 'success'
      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
      : 'bg-[#E87936] hover:bg-[#d66a29] text-white';

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (config.requireReason && !reason.trim()) {
      setError('Please enter a brief explanation for the audit log.');
      return;
    }
    if (config.rescheduleFields && (!date || !time)) {
      setError('Both a valid date and time are required.');
      return;
    }

    setSubmitting(true);
    try {
      await config.onConfirm({
        reason: reason.trim() || undefined,
        date: config.rescheduleFields ? date : undefined,
        time: config.rescheduleFields ? time : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#14243B]/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-confirm-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${iconBg}`}>
              {config.rescheduleFields ? (
                <CalendarClock className="w-5 h-5" />
              ) : tone === 'success' ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 id="admin-confirm-title" className="text-base font-bold text-[#14243B]">
                {config.title}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{config.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="p-5 space-y-4">
          {config.rescheduleFields && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#14243B] mb-1">New Date</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#E87936]/30 focus:border-[#E87936]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#14243B] mb-1">New Start Time</label>
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#E87936]/30 focus:border-[#E87936]"
                />
              </div>
            </div>
          )}

          {config.requireReason !== undefined && (
            <div>
              <label className="block text-xs font-semibold text-[#14243B] mb-1">
                {config.reasonLabel || 'Reason / Audit Note'}
                {!config.requireReason && <span className="text-slate-400 font-normal ml-1">(optional)</span>}
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={config.reasonPlaceholder || 'Record context for the audit log...'}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#E87936]/30 focus:border-[#E87936]"
              />
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition disabled:opacity-60 ${btnClasses}`}
            >
              {submitting ? 'Processing...' : config.confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
