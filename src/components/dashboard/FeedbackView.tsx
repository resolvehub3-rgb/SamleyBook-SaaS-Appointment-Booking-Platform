import React, { useState, useEffect } from 'react';
import { MessageSquare, Star, Calendar, RefreshCw } from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { getSupabase } from '../../lib/supabase';

interface FeedbackRow {
  id: string;
  business_id: string;
  appointment_id: string;
  customer_name: string;
  service_id: string | null;
  feedback: string;
  submitted_at: string;
  appointment?: { appointment_date: string; appointment_time: string; customer_phone?: string } | null;
  service?: { name: string } | null;
}

export const FeedbackView: React.FC = () => {
  const { currentBusiness } = useBusiness();
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFeedback = async () => {
    if (!currentBusiness?.id) return;
    const supabase = getSupabase();
    if (!supabase) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('customer_feedback')
        .select('*, appointment:appointments(appointment_date, appointment_time), service:services(name)')
        .eq('business_id', currentBusiness.id)
        .order('submitted_at', { ascending: false });
      setFeedback((data as FeedbackRow[]) || []);
    } catch (err) {
      console.error('Error fetching feedback:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
  }, [currentBusiness?.id]);

  // Realtime
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !currentBusiness?.id) return;
    const channel = supabase
      .channel(`feedback-${currentBusiness.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_feedback', filter: `business_id=eq.${currentBusiness.id}` }, () => fetchFeedback())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentBusiness?.id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-zinc-900 tracking-tight">Customer Feedback</h2>
          <p className="text-xs text-zinc-500">Reviews submitted by customers after completed appointments</p>
        </div>
        <button
          onClick={fetchFeedback}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-700 font-semibold text-xs hover:bg-zinc-50 transition disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {feedback.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-zinc-200/80 shadow-xs space-y-3">
          <MessageSquare className="w-8 h-8 text-zinc-300 mx-auto" />
          <h3 className="text-base font-bold text-zinc-900">No Feedback Yet</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Feedback submitted by customers will appear here after appointments are marked as completed.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {feedback.map((f) => (
            <div key={f.id} className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-zinc-900">{f.customer_name}</p>
                  <p className="text-[11px] text-zinc-500">
                    {f.service?.name || 'Service'} &bull; Booking #{String(f.appointment_id).substring(0, 8).toUpperCase()}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-amber-500">
                  <Star className="w-4 h-4 fill-amber-400" />
                </div>
              </div>
              <p className="text-xs text-zinc-700 bg-zinc-50 p-3 rounded-xl border border-zinc-100">{f.feedback}</p>
              <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                <Calendar className="w-3.5 h-3.5" />
                <span>{new Date(f.submitted_at).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
