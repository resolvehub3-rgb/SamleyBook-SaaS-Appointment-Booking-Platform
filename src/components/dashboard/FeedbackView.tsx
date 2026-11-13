import React, { useState, useEffect, useMemo } from 'react';
import {
  MessageSquare,
  Star,
  Calendar,
  RefreshCw,
  Phone,
  PhoneCall,
  Search,
  Scissors,
  Clock,
  Quote,
  CheckCircle2,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { getSupabase } from '../../lib/supabase';
import { formatTelHref, resolveFeedbackPhone } from '../../utils/booking-logic';
import { KPI_CARD_THEMES, PRIMARY_ORANGE_BTN, SURFACE_CARD } from './ui/DashboardTokens';

interface FeedbackRow {
  id: string;
  business_id: string;
  appointment_id: string;
  customer_id?: string | null;
  customer_name: string;
  service_id: string | null;
  feedback: string;
  submitted_at: string;
  appointment?: {
    appointment_date: string;
    appointment_time: string;
    customer_phone?: string | null;
  } | null;
  customer?: {
    phone?: string | null;
    full_name?: string | null;
  } | null;
  service?: { name: string } | null;
}

export const FeedbackView: React.FC = () => {
  const { currentBusiness, appointments, customers } = useBusiness();
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchFeedback = async () => {
    if (!currentBusiness?.id) return;
    const supabase = getSupabase();
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customer_feedback')
        .select(
          '*, appointment:appointments(appointment_date, appointment_time, customer_phone), customer:customers(phone, full_name), service:services(name)'
        )
        .eq('business_id', currentBusiness.id)
        .order('submitted_at', { ascending: false });

      if (error) {
        console.error('Error fetching feedback:', error);
        return;
      }
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

  // Supabase Realtime updates for new/updated customer feedback
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

  const enrichedFeedback = useMemo(() => {
    return feedback.map((item) => {
      const phone = resolveFeedbackPhone(item, appointments, customers);
      const telHref = formatTelHref(phone);
      return {
        ...item,
        resolvedPhone: phone,
        telHref,
      };
    });
  }, [feedback, appointments, customers]);

  const filteredFeedback = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enrichedFeedback;
    return enrichedFeedback.filter((item) => {
      const nameMatch = item.customer_name.toLowerCase().includes(q);
      const phoneMatch = item.resolvedPhone ? item.resolvedPhone.toLowerCase().includes(q) : false;
      const serviceMatch = (item.service?.name || '').toLowerCase().includes(q);
      const textMatch = item.feedback.toLowerCase().includes(q);
      return nameMatch || phoneMatch || serviceMatch || textMatch;
    });
  }, [enrichedFeedback, search]);

  const followUpReadyCount = enrichedFeedback.filter((f) => Boolean(f.telHref)).length;
  const latestSubmitted = enrichedFeedback[0]?.submitted_at
    ? new Date(enrichedFeedback[0].submitted_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : 'None yet';

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'C';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  };

  return (
    <div className="space-y-5 text-left">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5">
        <div
          className={`col-span-2 lg:col-span-1 rounded-2xl border p-4 flex items-center justify-between gap-3 ${KPI_CARD_THEMES.pending.cardBg} ${KPI_CARD_THEMES.pending.border}`}
        >
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700/80">
              Total Reviews
            </p>
            <p className="text-2xl font-black text-[#111827] mt-1 tabular-nums">
              {enrichedFeedback.length}
            </p>
            <p className="text-[11px] font-semibold text-amber-800/75 mt-0.5 truncate">
              Verified post-appointment feedback
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[#F59E0B] text-white flex items-center justify-center shadow-xs shrink-0">
            <Star className="w-5 h-5 fill-white" />
          </div>
        </div>

        <div
          className={`rounded-2xl border p-3.5 sm:p-4 flex items-center justify-between gap-2.5 ${KPI_CARD_THEMES.completed.cardBg} ${KPI_CARD_THEMES.completed.border}`}
        >
          <div className="min-w-0">
            <p className="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-700/80">
              Follow-Up Ready
            </p>
            <p className="text-xl sm:text-2xl font-black text-[#111827] mt-1 tabular-nums">
              {followUpReadyCount}
            </p>
            <p className="text-[11px] font-semibold text-emerald-800/75 mt-0.5 leading-snug">
              Call number ready
            </p>
          </div>
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-[#16A34A] text-white flex items-center justify-center shadow-xs shrink-0">
            <PhoneCall className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        <div
          className={`rounded-2xl border p-3.5 sm:p-4 flex items-center justify-between gap-2.5 ${KPI_CARD_THEMES.confirmed.cardBg} ${KPI_CARD_THEMES.confirmed.border}`}
        >
          <div className="min-w-0">
            <p className="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider text-blue-700/80">
              Latest Review
            </p>
            <p className="text-base sm:text-lg font-black text-[#111827] mt-1 leading-tight">
              {latestSubmitted}
            </p>
            <p className="text-[11px] font-semibold text-blue-800/75 mt-0.5 leading-snug">
              Live sync
            </p>
          </div>
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-[#2563EB] text-white flex items-center justify-center shadow-xs shrink-0">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
      </div>

      {/* Filter & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by customer name, phone number, service, or review..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-200/80 focus:outline-none focus:ring-2 focus:ring-[#F95700] bg-white shadow-xs"
          />
        </div>

        <button
          type="button"
          onClick={fetchFeedback}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200/80 bg-white text-slate-700 font-bold text-xs hover:bg-slate-50 shadow-xs transition disabled:opacity-60 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Empty States */}
      {enrichedFeedback.length === 0 ? (
        <div className={`${SURFACE_CARD} p-12 text-center space-y-3`}>
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FFF3EC] to-[#FFE7D4] border border-[#FADAC1] text-[#F95700] flex items-center justify-center mx-auto shadow-xs">
            <MessageSquare className="w-7 h-7" />
          </div>
          <h3 className="text-base font-extrabold text-[#111827]">No Customer Feedback Yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            When completed appointments receive client feedback, customer reviews and their follow-up phone numbers will appear here automatically.
          </p>
        </div>
      ) : filteredFeedback.length === 0 ? (
        <div className={`${SURFACE_CARD} p-10 text-center space-y-3`}>
          <p className="text-sm font-extrabold text-[#111827]">No Matching Feedback</p>
          <p className="text-xs text-slate-500">
            No customer reviews matched <span className="font-semibold text-slate-700">"{search}"</span>.
          </p>
          <button
            type="button"
            onClick={() => setSearch('')}
            className="inline-flex items-center px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
          >
            Clear Search
          </button>
        </div>
      ) : (
        /* Feedback Cards Grid */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredFeedback.map((f) => {
            const submittedFormatted = new Date(f.submitted_at).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            });

            return (
              <article
                key={f.id}
                className={`${SURFACE_CARD} p-5 sm:p-6 flex flex-col justify-between gap-4 hover:border-[#FADAC1] hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition-all`}
              >
                <div className="space-y-4">
                  {/* Top Row: Customer Identity & Verified Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FF6B1A] to-[#EA580C] text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
                        {getInitials(f.customer_name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-[15px] font-extrabold text-[#111827] truncate">
                            {f.customer_name}
                          </h3>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[10px] font-bold shrink-0">
                            <CheckCircle2 className="w-3 h-3" />
                            Verified Visit
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap mt-1 text-[11px] font-semibold text-slate-500">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#FFF3EC] text-[#F95700] font-bold">
                            <Scissors className="w-3 h-3" />
                            {f.service?.name || 'Service'}
                          </span>
                          <span className="text-slate-400">
                            Booking #{String(f.appointment_id).substring(0, 8).toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-500 shrink-0">
                      <Star className="w-4 h-4 fill-amber-400" />
                    </div>
                  </div>

                  {/* Quote Card Body */}
                  <div className="relative rounded-2xl bg-gradient-to-br from-[#FFFDF7] to-[#FEF9E7] border border-[#FDE68A]/80 p-4">
                    <Quote className="w-4 h-4 text-amber-400/80 mb-1.5" />
                    <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-line">
                      {f.feedback}
                    </p>
                  </div>

                  {/* Visit & Submission Metadata */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-semibold text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>Submitted {submittedFormatted}</span>
                    </span>
                    {f.appointment?.appointment_date && (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          Visit: {f.appointment.appointment_date}
                          {f.appointment.appointment_time
                            ? ` at ${f.appointment.appointment_time.slice(0, 5)}`
                            : ''}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Follow-Up Contact & Native Device Call Action */}
                <div className="pt-3.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Customer Follow-Up Phone
                      </p>
                      <p className="text-xs font-extrabold font-mono text-[#111827] truncate">
                        {f.resolvedPhone || 'Phone number not on file'}
                      </p>
                    </div>
                  </div>

                  {f.telHref && f.resolvedPhone ? (
                    <a
                      href={f.telHref}
                      aria-label={`Call ${f.customer_name} at ${f.resolvedPhone}`}
                      className={`${PRIMARY_ORANGE_BTN} px-4 py-2.5 text-xs shrink-0 no-underline`}
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>Call Customer</span>
                    </a>
                  ) : (
                    <span className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 text-slate-400 text-xs font-bold shrink-0">
                      <Phone className="w-3.5 h-3.5" />
                      <span>No Phone</span>
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
