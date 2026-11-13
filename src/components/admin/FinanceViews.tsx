import React, { useMemo, useState } from 'react';
import {
  Search,
  CreditCard,
  ShieldCheck,
  AlertCircle,
  Clock,
  Receipt,
  X,
} from 'lucide-react';
import {
  AdminPaymentRecord,
  AdminSubscriptionRecord,
  isExpiringSoon,
  isSubscriptionPayment,
  isVerifiedSubscriptionPayment,
} from '../../utils/admin-analytics';
import { AdminConfirmConfig } from './AdminConfirmationModal';
import {
  ADMIN_CARD,
  PAYMENT_STATUS_BADGES,
  SUBSCRIPTION_STATUS_BADGES,
  formatAdminDate,
  formatAdminDateTime,
  formatCurrencyGhs,
} from './AdminTokens';

interface BusinessSubscriptionsViewProps {
  subscriptions: AdminSubscriptionRecord[];
  onUpdateSubscriptionStatus: (
    sub: AdminSubscriptionRecord,
    nextStatus: AdminSubscriptionRecord['status'],
    reason?: string
  ) => Promise<void>;
  onRequestConfirm: (config: AdminConfirmConfig) => void;
}

export const BusinessSubscriptionsView: React.FC<BusinessSubscriptionsViewProps> = ({
  subscriptions,
  onUpdateSubscriptionStatus,
  onRequestConfirm,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'trialing' | 'expiring' | 'expired'>('all');

  const stats = useMemo(() => {
    return {
      total: subscriptions.length,
      active: subscriptions.filter((s) => s.status === 'active').length,
      trialing: subscriptions.filter((s) => s.status === 'trialing').length,
      expiringSoon: subscriptions.filter((s) => isExpiringSoon(s)).length,
      expired: subscriptions.filter((s) => s.status === 'expired' || s.status === 'canceled').length,
    };
  }, [subscriptions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subscriptions.filter((s) => {
      if (filter === 'active' && s.status !== 'active') return false;
      if (filter === 'trialing' && s.status !== 'trialing') return false;
      if (filter === 'expiring' && !isExpiringSoon(s)) return false;
      if (filter === 'expired' && s.status !== 'expired' && s.status !== 'canceled') return false;
      if (q) {
        return (s.business?.name || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [subscriptions, search, filter]);

  const confirmStatusChange = (
    sub: AdminSubscriptionRecord,
    nextStatus: AdminSubscriptionRecord['status']
  ) => {
    onRequestConfirm({
      title: `Change Subscription Status to ${nextStatus.toUpperCase()}`,
      description: `Update Book Premium subscription for ${
        sub.business?.name || 'this business'
      } from "${sub.status}" to "${nextStatus}"? Audited in Security & Audit Logs.`,
      confirmLabel: 'Update Subscription',
      tone: nextStatus === 'active' ? 'success' : nextStatus === 'expired' ? 'danger' : 'primary',
      requireReason: true,
      reasonLabel: 'Audit Reason',
      reasonPlaceholder: 'Explain why this subscription status is being changed...',
      onConfirm: async ({ reason }) => {
        await onUpdateSubscriptionStatus(sub, nextStatus, reason);
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* Single Book Premium Offering Banner */}
      <div className="rounded-2xl bg-[#14243B] text-white p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#E87936] flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#E87936]">
              Single Platform Offering
            </p>
            <h2 className="text-base font-bold mt-0.5">Book Premium — GH₵120.00 / 30 days</h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Includes 7-day free trial for eligible new businesses. All features unlocked platform-wide.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-xs tabular-nums">
          <div className="px-3.5 py-2 rounded-xl bg-white/10">
            <span className="text-slate-300 block text-[10px] uppercase font-bold">Active Paid</span>
            <strong className="text-base font-extrabold">{stats.active}</strong>
          </div>
          <div className="px-3.5 py-2 rounded-xl bg-white/10">
            <span className="text-slate-300 block text-[10px] uppercase font-bold">7-Day Trial</span>
            <strong className="text-base font-extrabold text-amber-300">{stats.trialing}</strong>
          </div>
          <div className="px-3.5 py-2 rounded-xl bg-white/10">
            <span className="text-slate-300 block text-[10px] uppercase font-bold">Expiring ≤ 3d</span>
            <strong className="text-base font-extrabold text-[#E87936]">{stats.expiringSoon}</strong>
          </div>
          <div className="px-3.5 py-2 rounded-xl bg-white/10">
            <span className="text-slate-300 block text-[10px] uppercase font-bold">Expired</span>
            <strong className="text-base font-extrabold text-red-300">{stats.expired}</strong>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={`${ADMIN_CARD} p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between`}>
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by business name..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-[#F5F6F8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E87936]/30"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'all', label: `All (${stats.total})` },
              { id: 'active', label: `Active (${stats.active})` },
              { id: 'trialing', label: `Trial (${stats.trialing})` },
              { id: 'expiring', label: `Expiring Soon (${stats.expiringSoon})` },
              { id: 'expired', label: `Expired (${stats.expired})` },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition tabular-nums ${
                filter === f.id
                  ? 'bg-[#14243B] text-white'
                  : 'bg-[#F5F6F8] text-slate-600 hover:text-[#14243B]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className={`${ADMIN_CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F5F6F8] text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200/80">
              <tr>
                <th className="py-3 px-4">Business</th>
                <th className="py-3 px-4">Offering</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Trial End</th>
                <th className="py-3 px-4">Current Period Ends</th>
                <th className="py-3 px-4">Payment State</th>
                <th className="py-3 px-4 text-right">Audited Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 text-xs">
                    No subscription records match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((sub) => {
                  const soon = isExpiringSoon(sub);
                  return (
                    <tr key={sub.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <p className="font-bold text-[#14243B]">{sub.business?.name || 'Business'}</p>
                        <p className="text-[11px] text-slate-400">{sub.business?.category || '—'}</p>
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#14243B]">
                        Book Premium · <span className="tabular-nums">GH₵120</span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border capitalize ${
                            SUBSCRIPTION_STATUS_BADGES[sub.status] || SUBSCRIPTION_STATUS_BADGES.trialing
                          }`}
                        >
                          {sub.status}
                        </span>
                        {soon && (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-[#E87936]">
                            <Clock className="w-3 h-3" /> Soon
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 tabular-nums">
                        {formatAdminDate(sub.trial_end)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#14243B] tabular-nums">
                        {formatAdminDate(sub.current_period_end)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${
                            PAYMENT_STATUS_BADGES[sub.payment_status === 'paid' ? 'successful' : sub.payment_status] ||
                            'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {sub.payment_status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        {sub.status !== 'active' && (
                          <button
                            type="button"
                            onClick={() => confirmStatusChange(sub, 'active')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition"
                          >
                            Activate 30d
                          </button>
                        )}
                        {sub.status !== 'expired' && (
                          <button
                            type="button"
                            onClick={() => confirmStatusChange(sub, 'expired')}
                            className="px-2.5 py-1 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-[11px] font-bold transition"
                          >
                            Expire
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

interface PaymentRecordsViewProps {
  payments: AdminPaymentRecord[];
}

export const PaymentRecordsView: React.FC<PaymentRecordsViewProps> = ({ payments }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'successful' | 'pending' | 'failed'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'subscription' | 'booking'>('all');
  const [inspectedPayment, setInspectedPayment] = useState<AdminPaymentRecord | null>(null);

  const metrics = useMemo(() => {
    const verifiedSubs = payments.filter(isVerifiedSubscriptionPayment);
    const verifiedBookings = payments.filter(
      (p) => !isSubscriptionPayment(p) && p.status === 'successful'
    );
    return {
      verifiedSubscriptionRevenue: verifiedSubs.reduce((s, p) => s + Number(p.amount || 0), 0),
      verifiedBookingVolume: verifiedBookings.reduce((s, p) => s + Number(p.amount || 0), 0),
      pendingCount: payments.filter((p) => p.status === 'pending').length,
      failedCount: payments.filter((p) => p.status === 'failed').length,
    };
  }, [payments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments
      .filter((p) => {
        if (statusFilter !== 'all' && p.status !== statusFilter) return false;
        const isSub = isSubscriptionPayment(p);
        if (typeFilter === 'subscription' && !isSub) return false;
        if (typeFilter === 'booking' && isSub) return false;
        if (q) {
          return (
            (p.business?.name || '').toLowerCase().includes(q) ||
            (p.moolre_reference || '').toLowerCase().includes(q) ||
            (p.provider_reference || '').toLowerCase().includes(q) ||
            (p.customer_phone || '').toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [payments, search, statusFilter, typeFilter]);

  return (
    <div className="space-y-5">
      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`${ADMIN_CARD} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Verified Subscription Revenue
          </p>
          <p className="text-2xl font-extrabold text-emerald-700 mt-1 tabular-nums">
            {formatCurrencyGhs(metrics.verifiedSubscriptionRevenue)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">SamleyBook SaaS plans only</p>
        </div>
        <div className={`${ADMIN_CARD} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Verified Booking Settlements
          </p>
          <p className="text-2xl font-extrabold text-[#14243B] mt-1 tabular-nums">
            {formatCurrencyGhs(metrics.verifiedBookingVolume)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Direct business service fees</p>
        </div>
        <div className={`${ADMIN_CARD} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Pending Verification
          </p>
          <p className="text-2xl font-extrabold text-amber-700 mt-1 tabular-nums">
            {metrics.pendingCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Excluded from revenue totals</p>
        </div>
        <div className={`${ADMIN_CARD} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Failed Transactions
          </p>
          <p className="text-2xl font-extrabold text-red-700 mt-1 tabular-nums">
            {metrics.failedCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Excluded from revenue totals</p>
        </div>
      </div>

      {/* Filters */}
      <div className={`${ADMIN_CARD} p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between`}>
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search business, Moolre ref, or phone..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-[#F5F6F8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E87936]/30"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            aria-label="Filter by payment category"
            className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-[#14243B]"
          >
            <option value="all">All Payment Types</option>
            <option value="subscription">Subscription Payments</option>
            <option value="booking">Service Booking Payments</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            aria-label="Filter by payment status"
            className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-[#14243B]"
          >
            <option value="all">All Statuses</option>
            <option value="successful">Successful (Verified)</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Payments Table */}
      <div className={`${ADMIN_CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F5F6F8] text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200/80">
              <tr>
                <th className="py-3 px-4">Business</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Reference</th>
                <th className="py-3 px-4">Verification</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 text-xs">
                    No payment records match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const isSub = isSubscriptionPayment(p);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-bold text-[#14243B]">
                        {p.business?.name || 'Business'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                            isSub
                              ? 'bg-orange-50 text-[#E87936] border border-orange-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {isSub ? 'Subscription' : 'Service Booking'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-extrabold text-[#14243B] tabular-nums">
                        {formatCurrencyGhs(p.amount)}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                        {p.moolre_reference || p.provider_reference || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border capitalize ${
                            PAYMENT_STATUS_BADGES[p.status] || PAYMENT_STATUS_BADGES.pending
                          }`}
                        >
                          {p.status === 'successful' ? (
                            <ShieldCheck className="w-3 h-3" />
                          ) : (
                            <AlertCircle className="w-3 h-3" />
                          )}
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 tabular-nums">
                        {formatAdminDateTime(p.created_at)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setInspectedPayment(p)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-bold text-[#14243B] hover:border-[#E87936] hover:text-[#E87936]"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Inspection Modal */}
      {inspectedPayment && (
        <div className="fixed inset-0 z-50 bg-[#14243B]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#14243B] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#E87936]" />
                <h3 className="text-sm font-bold">Payment Record Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedPayment(null)}
                className="p-1 rounded-lg text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-500">Business</span>
                  <p className="font-bold text-[#14243B]">{inspectedPayment.business?.name || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-500">Category</span>
                  <p className="font-bold text-[#14243B]">
                    {isSubscriptionPayment(inspectedPayment) ? 'Subscription Plan' : 'Service Booking'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Amount</span>
                  <p className="font-extrabold text-[#14243B] tabular-nums">
                    {formatCurrencyGhs(inspectedPayment.amount)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Status</span>
                  <p className="font-bold capitalize text-[#14243B]">{inspectedPayment.status}</p>
                </div>
                <div>
                  <span className="text-slate-500">Moolre Ref</span>
                  <p className="font-mono text-[#14243B]">{inspectedPayment.moolre_reference || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-500">Provider Ref</span>
                  <p className="font-mono text-[#14243B]">{inspectedPayment.provider_reference || '—'}</p>
                </div>
              </div>
              {inspectedPayment.raw_response && (
                <div className="pt-2">
                  <p className="text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Verification Metadata
                  </p>
                  <pre className="p-3 rounded-xl bg-[#F5F6F8] border border-slate-200 text-[11px] font-mono overflow-x-auto max-h-44">
                    {JSON.stringify(inspectedPayment.raw_response, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
