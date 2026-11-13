import React, { useState, useEffect } from 'react';
import { MessageSquare, Star, Calendar, RefreshCw } from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { getSupabase } from '../../lib/supabase';
import { SURFACE_CARD } from './ui/DashboardTokens';

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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customer_feedback',
          filter: `business_id=eq.${currentBusiness.id}`,
        },
        () => fetchFeedback()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentBusiness?.id]);

  return (
    <div className="space-y-6 text-left">
      <div className="flex items-center justify-between gap-4">
        <div className="px-4 py-2 rounded-2xl bg-gradient-to-br from-[#FFFBEB] to-[#FDEEC2] border border-[#FDE293] text-xs font-bold text-[#111827] inline-flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
          <span>Total Reviews:</span>
          <span className="font-black text-amber-700">{feedback.length}</span>
        </div>

        <button
          type="button"
          onClick={fetchFeedback}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200/80 bg-white text-slate-700 font-bold text-xs hover:bg-slate-50 shadow-xs transition disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {feedback.length === 0 ? (
        <div className={`${SURFACE_CARD} p-12 text-center space-y-3`}>
          <div className="w-12 h-12 rounded-2xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center mx-auto">
            <MessageSquare className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-[#111827]">No Feedback Yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Feedback submitted by customers will appear here automatically after appointments are marked as completed.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {feedback.map((f) => (
            <div key={f.id} className={`${SURFACE_CARD} p-5 space-y-3`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-extrabold text-[#111827]">{f.customer_name}</p>
                  <p className="text-[11px] font-semibold text-slate-500">
                    {f.service?.name || 'Service'} &bull; Booking #
                    {String(f.appointment_id).substring(0, 8).toUpperCase()}
                  </p>
                </div>
                <div className="w-8 h-8 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-500 shrink-0">
                  <Star className="w-4 h-4 fill-amber-400" />
                </div>
              </div>
              <p className="text-xs text-slate-700 bg-[#FEF9E7] p-3.5 rounded-xl border border-[#FDE68A] leading-relaxed">
                {f.feedback}
              </p>
              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400">
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
