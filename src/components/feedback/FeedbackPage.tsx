import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw, Star } from 'lucide-react';
import { SamleyLogo } from '../common/SamleyLogo';

interface Props {
  token: string;
}

export const FeedbackPage: React.FC<Props> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [appointmentRef, setAppointmentRef] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const validate = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/feedback/validate?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (data.valid) {
          setValid(true);
          setBusinessName(data.businessName || '');
          setServiceName(data.serviceName || '');
          setAppointmentRef(data.appointmentRef || '');
          setCustomerName(data.customerName || '');
        } else {
          setError(data.reason || 'Invalid feedback link.');
        }
      } catch (err) {
        setError('Failed to validate feedback link.');
      } finally {
        setLoading(false);
      }
    };
    validate();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !feedback.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, customerName: customerName.trim(), feedback: feedback.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setSubmitted(true);
      } else {
        setError(data.error || 'Failed to submit feedback.');
      }
    } catch (err) {
      setError('Failed to submit feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-orange-600 animate-spin mx-auto" />
          <p className="text-xs font-semibold text-zinc-500">Validating feedback link...</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-3xl bg-white border border-zinc-200 shadow-xl text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-black text-zinc-900">Thank You!</h2>
          <p className="text-xs text-zinc-500">
            Your feedback has been submitted successfully. We appreciate you taking the time to share your experience with {businessName}.
          </p>
        </div>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-3xl bg-white border border-zinc-200 shadow-xl text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900">Feedback Unavailable</h2>
          <p className="text-xs text-zinc-500">{error || 'This feedback link is invalid, expired, or has already been used.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 py-8 px-4 sm:px-6 lg:px-8 text-left">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center">
          <SamleyLogo size="md" />
        </div>
        <div className="p-6 md:p-8 rounded-3xl bg-white border border-zinc-200/80 shadow-xl space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-black text-zinc-900 tracking-tight">Share Your Feedback</h2>
            <p className="text-xs text-zinc-500">
              {businessName} &bull; {serviceName} &bull; Booking #{appointmentRef}
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Your Name *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Your Feedback *</label>
              <textarea
                rows={5}
                required
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Tell us about your experience..."
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-orange-700 shadow-md disabled:opacity-50 transition"
            >
              {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
              <span>{submitting ? 'Submitting...' : 'Submit Feedback'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
