import React, { useMemo, useState } from 'react';
import {
  Search,
  Building2,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  XCircle,
  ExternalLink,
  X,
  Clock,
  Scissors,
  CalendarDays,
  CreditCard,
  ShieldAlert,
} from 'lucide-react';
import {
  AdminAppointmentRecord,
  AdminBusinessRecord,
  AdminSubscriptionRecord,
  getEffectiveRegistrationStatus,
} from '../../utils/admin-analytics';
import { Service } from '../../types/database';
import { AdminConfirmConfig } from './AdminConfirmationModal';
import {
  ADMIN_CARD,
  APPOINTMENT_STATUS_BADGES,
  REGISTRATION_STATUS_BADGES,
  SUBSCRIPTION_STATUS_BADGES,
  formatAdminDate,
  formatAdminDateTime,
  formatCurrencyGhs,
} from './AdminTokens';

interface BusinessOverviewViewProps {
  businesses: AdminBusinessRecord[];
  subscriptions: AdminSubscriptionRecord[];
  appointments: AdminAppointmentRecord[];
  services: Service[];
  inspectedBusinessId: string | null;
  onInspectBusinessId: (id: string | null) => void;
  onToggleBusinessActive: (business: AdminBusinessRecord, nextActive: boolean, reason?: string) => Promise<void>;
  onRequestConfirm: (config: AdminConfirmConfig) => void;
  onViewBusinessAppointments: (businessId: string) => void;
  initialSearch?: string;
}

export const BusinessOverviewView: React.FC<BusinessOverviewViewProps> = ({
  businesses,
  subscriptions,
  appointments,
  services,
  inspectedBusinessId,
  onInspectBusinessId,
  onToggleBusinessActive,
  onRequestConfirm,
  onViewBusinessAppointments,
  initialSearch = '',
}) => {
  const [search, setSearch] = useState(initialSearch);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');

  const categories = useMemo(
    () => Array.from(new Set(businesses.map((b) => b.category).filter(Boolean))).sort(),
    [businesses]
  );

  const subByBiz = useMemo(() => {
    const map = new Map<string, AdminSubscriptionRecord>();
    for (const s of subscriptions) {
      if (!map.has(s.business_id)) map.set(s.business_id, s);
    }
    return map;
  }, [subscriptions]);

  const apptCountByBiz = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of appointments) {
      map.set(a.business_id, (map.get(a.business_id) || 0) + 1);
    }
    return map;
  }, [appointments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return businesses.filter((b) => {
      if (categoryFilter !== 'all' && b.category !== categoryFilter) return false;
      if (statusFilter === 'active' && !b.is_active) return false;
      if (statusFilter === 'suspended' && b.is_active) return false;
      if (q) {
        return (
          b.name.toLowerCase().includes(q) ||
          b.slug.toLowerCase().includes(q) ||
          b.phone.toLowerCase().includes(q) ||
          (b.address || '').toLowerCase().includes(q) ||
          (b.category || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [businesses, search, categoryFilter, statusFilter]);

  const inspectedBusiness = useMemo(
    () => businesses.find((b) => b.id === inspectedBusinessId) || null,
    [businesses, inspectedBusinessId]
  );

  const inspectedServices = useMemo(
    () => (inspectedBusiness ? services.filter((s) => s.business_id === inspectedBusiness.id) : []),
    [services, inspectedBusiness]
  );

  const inspectedAppointments = useMemo(
    () =>
      inspectedBusiness
        ? appointments
            .filter((a) => a.business_id === inspectedBusiness.id)
            .sort((a, b) => b.appointment_date.localeCompare(a.appointment_date))
            .slice(0, 8)
        : [],
    [appointments, inspectedBusiness]
  );

  const inspectedSubscription = inspectedBusiness ? subByBiz.get(inspectedBusiness.id) || null : null;

  const confirmToggleActive = (biz: AdminBusinessRecord) => {
    const nextActive = !biz.is_active;
    onRequestConfirm({
      title: nextActive ? `Reactivate ${biz.name}` : `Suspend ${biz.name}`,
      description: nextActive
        ? `Restore ${biz.name}'s public booking page and dashboard access?`
        : `Suspend ${biz.name}? Their public booking link will become inactive until reactivated.`,
      confirmLabel: nextActive ? 'Reactivate Business' : 'Suspend Business',
      tone: nextActive ? 'success' : 'danger',
      requireReason: !nextActive,
      reasonLabel: nextActive ? 'Reactivation Note' : 'Suspension Reason',
      reasonPlaceholder: nextActive ? 'Context for reactivation...' : 'Reason for suspension...',
      onConfirm: async ({ reason }) => {
        await onToggleBusinessActive(biz, nextActive, reason);
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* Filter Controls */}
      <div className={`${ADMIN_CARD} p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between`}>
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by business name, slug, phone, city..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-[#F5F6F8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E87936]/30 focus:border-[#E87936]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-[#14243B]"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <div className="inline-flex p-0.5 rounded-xl bg-[#F5F6F8] border border-slate-200">
            {(['all', 'active', 'suspended'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition ${
                  statusFilter === st ? 'bg-[#14243B] text-white' : 'text-slate-600 hover:text-[#14243B]'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Businesses Table */}
      <div className={`${ADMIN_CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F5F6F8] text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200/80">
              <tr>
                <th className="py-3 px-4">Business</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Subscription</th>
                <th className="py-3 px-4">Bookings</th>
                <th className="py-3 px-4">Operational Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 text-xs">
                    No businesses found matching your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((biz) => {
                  const sub = subByBiz.get(biz.id);
                  const appts = apptCountByBiz.get(biz.id) || 0;
                  return (
                    <tr key={biz.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <p className="font-bold text-[#14243B]">{biz.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono">/b/{biz.slug}</p>
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium">{biz.category}</td>
                      <td className="py-3 px-4 tabular-nums">
                        <p className="font-semibold text-[#14243B]">{biz.phone}</p>
                        <p className="text-[11px] text-slate-400 truncate max-w-[160px]">{biz.address}</p>
                      </td>
                      <td className="py-3 px-4">
                        {sub ? (
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${
                              SUBSCRIPTION_STATUS_BADGES[sub.status] || SUBSCRIPTION_STATUS_BADGES.trialing
                            }`}
                          >
                            {sub.status}
                          </span>
                        ) : (
                          <span className="text-slate-400">No record</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-bold text-[#14243B] tabular-nums">{appts}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            biz.is_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}
                        >
                          {biz.is_active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onInspectBusinessId(biz.id)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-[#14243B] hover:border-[#E87936] hover:text-[#E87936] transition"
                        >
                          Inspect
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmToggleActive(biz)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${
                            biz.is_active
                              ? 'border-red-200 text-red-700 hover:bg-red-50'
                              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          {biz.is_active ? 'Suspend' : 'Reactivate'}
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

      {/* Inspection Slide-Over Drawer */}
      {inspectedBusiness && (
        <div className="fixed inset-0 z-50 bg-[#14243B]/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-[#14243B] text-white flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#E87936]">
                  Business Profile Inspection
                </p>
                <h3 className="text-base font-bold truncate mt-0.5">{inspectedBusiness.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => onInspectBusinessId(null)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
                aria-label="Close business inspection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* Overview & Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                      inspectedBusiness.is_active
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}
                  >
                    {inspectedBusiness.is_active ? 'Active' : 'Suspended'}
                  </span>
                  {inspectedSubscription && (
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold border capitalize ${
                        SUBSCRIPTION_STATUS_BADGES[inspectedSubscription.status] ||
                        SUBSCRIPTION_STATUS_BADGES.trialing
                      }`}
                    >
                      Sub: {inspectedSubscription.status}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onViewBusinessAppointments(inspectedBusiness.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-[#14243B] hover:border-[#E87936] hover:text-[#E87936] transition"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    <span>View Bookings</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmToggleActive(inspectedBusiness)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      inspectedBusiness.is_active
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    {inspectedBusiness.is_active ? 'Suspend' : 'Reactivate'}
                  </button>
                </div>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-[#F5F6F8] border border-slate-200/70 space-y-1">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Category</p>
                  <p className="font-bold text-[#14243B] flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-[#E87936]" />
                    {inspectedBusiness.category}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F5F6F8] border border-slate-200/70 space-y-1">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Phone</p>
                  <p className="font-bold text-[#14243B] flex items-center gap-1.5 tabular-nums">
                    <Phone className="w-3.5 h-3.5 text-[#E87936]" />
                    {inspectedBusiness.phone}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F5F6F8] border border-slate-200/70 space-y-1">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Email</p>
                  <p className="font-semibold text-[#14243B] flex items-center gap-1.5 truncate">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {inspectedBusiness.email || '—'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#F5F6F8] border border-slate-200/70 space-y-1">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Location</p>
                  <p className="font-semibold text-[#14243B] flex items-center gap-1.5 truncate">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {inspectedBusiness.address}
                  </p>
                </div>
              </div>

              {/* Subscription Summary */}
              <div className="p-4 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-[#E87936]" /> Subscription History
                </p>
                {inspectedSubscription ? (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <span className="text-slate-500">Plan</span>
                      <p className="font-bold text-[#14243B]">Book Premium (GH₵120 / 30d)</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Current Period Ends</span>
                      <p className="font-bold text-[#14243B] tabular-nums">
                        {formatAdminDate(inspectedSubscription.current_period_end)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500">No subscription record attached.</p>
                )}
              </div>

              {/* Services Catalog */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Scissors className="w-3.5 h-3.5 text-[#E87936]" /> Services ({inspectedServices.length})
                </h4>
                {inspectedServices.length === 0 ? (
                  <p className="text-xs text-slate-500 p-3 rounded-xl bg-[#F5F6F8]">No services published yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 overflow-hidden">
                    {inspectedServices.map((svc) => (
                      <div key={svc.id} className="px-3.5 py-2.5 flex items-center justify-between text-xs bg-white">
                        <div>
                          <p className="font-bold text-[#14243B]">{svc.name}</p>
                          <p className="text-[11px] text-slate-500 tabular-nums">{svc.duration_minutes} mins</p>
                        </div>
                        <span className="font-extrabold text-[#14243B] tabular-nums">
                          {formatCurrencyGhs(svc.price)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Appointments */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#E87936]" /> Recent Appointments ({inspectedAppointments.length})
                </h4>
                {inspectedAppointments.length === 0 ? (
                  <p className="text-xs text-slate-500 p-3 rounded-xl bg-[#F5F6F8]">No appointments recorded yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 overflow-hidden">
                    {inspectedAppointments.map((a) => (
                      <div key={a.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs bg-white">
                        <div className="min-w-0">
                          <p className="font-bold text-[#14243B] truncate">{a.customer_name}</p>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            {a.appointment_date} · {a.service?.name || 'Service'}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize shrink-0 ${
                            APPOINTMENT_STATUS_BADGES[a.status] || APPOINTMENT_STATUS_BADGES.pending
                          }`}
                        >
                          {a.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface BusinessRegistrationsViewProps {
  businesses: AdminBusinessRecord[];
  onApproveRegistration: (business: AdminBusinessRecord, reason?: string) => Promise<void>;
  onRejectRegistration: (business: AdminBusinessRecord, reason: string) => Promise<void>;
  onRequestConfirm: (config: AdminConfirmConfig) => void;
  onInspectBusiness: (businessId: string) => void;
}

export const BusinessRegistrationsView: React.FC<BusinessRegistrationsViewProps> = ({
  businesses,
  onApproveRegistration,
  onRejectRegistration,
  onRequestConfirm,
  onInspectBusiness,
}) => {
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  const counts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const b of businesses) {
      const st = getEffectiveRegistrationStatus(b);
      if (st === 'pending') pending++;
      else if (st === 'rejected') rejected++;
      else approved++;
    }
    return { pending, approved, rejected, all: businesses.length };
  }, [businesses]);

  const list = useMemo(() => {
    return businesses
      .filter((b) => {
        if (tab === 'all') return true;
        return getEffectiveRegistrationStatus(b) === tab;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [businesses, tab]);

  const confirmApprove = (biz: AdminBusinessRecord) => {
    onRequestConfirm({
      title: `Approve ${biz.name}`,
      description: `Approve ${biz.name} for live public booking access? This action is recorded in Security & Audit Logs.`,
      confirmLabel: 'Approve Business',
      tone: 'success',
      requireReason: false,
      reasonLabel: 'Approval Note',
      onConfirm: async ({ reason }) => {
        await onApproveRegistration(biz, reason);
      },
    });
  };

  const confirmReject = (biz: AdminBusinessRecord) => {
    onRequestConfirm({
      title: `Reject ${biz.name}`,
      description: `Reject ${biz.name}'s registration and deactivate public booking? A rejection reason is required for the audit log.`,
      confirmLabel: 'Reject Registration',
      tone: 'danger',
      requireReason: true,
      reasonLabel: 'Rejection Reason',
      reasonPlaceholder: 'Specify reason for rejection...',
      onConfirm: async ({ reason }) => {
        await onRejectRegistration(biz, reason || 'Rejected by Super Admin');
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* Status Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200/80 shadow-xs">
          {(
            [
              { id: 'pending', label: 'Pending Review', count: counts.pending },
              { id: 'approved', label: 'Approved', count: counts.approved },
              { id: 'rejected', label: 'Rejected', count: counts.rejected },
              { id: 'all', label: 'All Registrations', count: counts.all },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                tab === item.id ? 'bg-[#14243B] text-white' : 'text-slate-600 hover:text-[#14243B]'
              }`}
            >
              <span>{item.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] tabular-nums ${
                  tab === item.id ? 'bg-[#E87936] text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {item.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Registration Cards / Table */}
      <div className={`${ADMIN_CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F5F6F8] text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200/80">
              <tr>
                <th className="py-3 px-4">Business</th>
                <th className="py-3 px-4">Category & Location</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Submitted</th>
                <th className="py-3 px-4">Review Status</th>
                <th className="py-3 px-4 text-right">Review Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 text-xs">
                    {tab === 'pending'
                      ? 'No pending business registrations waiting for review.'
                      : 'No business registrations in this view.'}
                  </td>
                </tr>
              ) : (
                list.map((biz) => {
                  const regStatus = getEffectiveRegistrationStatus(biz);
                  return (
                    <tr key={biz.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-[#14243B]">{biz.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono">/b/{biz.slug}</p>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-[#14243B]">{biz.category}</p>
                        <p className="text-[11px] text-slate-500">{biz.address}</p>
                      </td>
                      <td className="py-3.5 px-4 tabular-nums">
                        <p className="font-semibold text-[#14243B]">{biz.phone}</p>
                        {biz.email && <p className="text-[11px] text-slate-400">{biz.email}</p>}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 tabular-nums">
                        {formatAdminDateTime(biz.created_at)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border capitalize ${
                            REGISTRATION_STATUS_BADGES[regStatus] || REGISTRATION_STATUS_BADGES.approved
                          }`}
                        >
                          {regStatus}
                        </span>
                        {biz.rejection_reason && regStatus === 'rejected' && (
                          <p className="text-[10px] text-red-600 mt-1 max-w-[180px] truncate">
                            {biz.rejection_reason}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onInspectBusiness(biz.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-[#14243B] hover:border-[#E87936] hover:text-[#E87936]"
                        >
                          <span>Inspect</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                        {regStatus !== 'approved' && (
                          <button
                            type="button"
                            onClick={() => confirmApprove(biz)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Approve</span>
                          </button>
                        )}
                        {regStatus !== 'rejected' && (
                          <button
                            type="button"
                            onClick={() => confirmReject(biz)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-[11px] font-bold transition"
                          >
                            <XCircle className="w-3 h-3" />
                            <span>Reject</span>
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

      {/* Info Banner */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/80 flex items-start gap-3 text-xs text-slate-600">
        <ShieldAlert className="w-4 h-4 text-[#E87936] shrink-0 mt-0.5" />
        <p>
          Existing active businesses default to <strong>Approved</strong> so public booking pages keep running uninterrupted. Every manual approval or rejection is logged with timestamp and administrator identity.
        </p>
      </div>
    </div>
  );
};
