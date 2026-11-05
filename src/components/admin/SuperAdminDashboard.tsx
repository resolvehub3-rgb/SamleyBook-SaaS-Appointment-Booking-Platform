import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Building2,
  Users,
  Sparkles,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  Search,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  Database,
  Plus,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabase';
import { formatGHS, calculateTrialRemainingDays } from '../../utils/booking-logic';
import { SamleyLogo } from '../common/SamleyLogo';
import { SUPABASE_SQL_SCHEMA } from '../../lib/sqlScript';
import {
  Business,
  SubscriptionPlan,
  BusinessSubscription,
  PaymentTransaction,
} from '../../types/database';

export type AdminTab =
  | 'overview'
  | 'businesses'
  | 'subscriptions'
  | 'plans'
  | 'payments'
  | 'settings';

interface Props {
  onNavigateHome: () => void;
}

export const SuperAdminDashboard: React.FC<Props> = ({ onNavigateHome }) => {
  const { signOut, profile, isConfigured } = useAuth();
  const [currentTab, setCurrentTab] = useState<AdminTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Real Database state
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [bizFilter, setBizFilter] = useState<string>('all');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const [selectedBusiness, setSelectedBusiness] = useState<any | null>(null);

  // Subscriptions tab state
  const [subSearch, setSubSearch] = useState('');
  const [subStatusFilter, setSubStatusFilter] = useState<string>('all');
  const [selectedSub, setSelectedSub] = useState<any | null>(null);
  const [editSubStatus, setEditSubStatus] = useState<string>('trialing');
  const [editSubPlanId, setEditSubPlanId] = useState<string>('');
  const [subActionLoading, setSubActionLoading] = useState(false);

  // New plan modal
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanCode, setNewPlanCode] = useState('');
  const [newPlanPrice, setNewPlanPrice] = useState('150');
  const [newPlanCycle, setNewPlanCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [newPlanFeatures, setNewPlanFeatures] = useState('Unlimited bookings\nSMS alerts\nPWA access');

  const [copiedSql, setCopiedSql] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      // 1. Fetch businesses with owner profile
      const { data: bData } = await supabase
        .from('businesses')
        .select('*, owner:profiles(*)')
        .order('created_at', { ascending: false });

      setBusinesses(bData || []);

      // 2. Fetch subscriptions with business & plan
      const { data: subData } = await supabase
        .from('business_subscriptions')
        .select('*, business:businesses(*), plan:subscription_plans(*)')
        .order('created_at', { ascending: false });

      setSubscriptions(subData || []);

      // 3. Fetch subscription plans
      const { data: planData } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price_ghs', { ascending: true });

      setPlans((planData as SubscriptionPlan[]) || []);

      // 4. Fetch all payment transactions
      const { data: payData } = await supabase
        .from('payment_transactions')
        .select('*, business:businesses(name)')
        .order('created_at', { ascending: false });

      setPayments((payData as PaymentTransaction[]) || []);
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
      setLastRefreshed(new Date());
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchData();
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Realtime listener for new businesses
    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_subscriptions' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscription_plans' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_transactions' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleLogout = async () => {
    await signOut();
    onNavigateHome();
  };

  // Metrics calculation
  const totalBusinesses = businesses.length;
  const trialBusinesses = subscriptions.filter((s) => s.status === 'trialing').length;
  const activeSubs = subscriptions.filter((s) => s.status === 'active').length;
  const expiredSubs = subscriptions.filter((s) => s.status === 'expired').length;
  const totalRevenue = payments
    .filter((p) => p.status === 'successful')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const filteredSubscriptions = subscriptions.filter((s) => {
    const q = subSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (s.business?.name || '').toLowerCase().includes(q) ||
      (s.business?.owner?.full_name || '').toLowerCase().includes(q) ||
      (s.plan?.name || '').toLowerCase().includes(q);
    const matchesStatus = subStatusFilter === 'all' || s.status === subStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const openSubscription = (sub: any) => {
    setSelectedSub(sub);
    setEditSubStatus(sub.status || 'trialing');
    setEditSubPlanId(sub.plan_id || sub.plan?.id || '');
  };

  const handleSaveSubscription = async () => {
    if (!selectedSub) return;
    const supabase = getSupabase();
    if (!supabase) return;
    setSubActionLoading(true);
    try {
      await supabase
        .from('business_subscriptions')
        .update({
          status: editSubStatus,
          plan_id: editSubPlanId || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedSub.id);
      await fetchData();
      setSelectedSub((prev: any) =>
        prev ? { ...prev, status: editSubStatus, plan_id: editSubPlanId || null } : prev
      );
    } finally {
      setSubActionLoading(false);
    }
  };

  const formatDate = (value?: string | null) =>
    value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  const statusStyles: Record<string, string> = {
    trialing: 'bg-orange-50 text-orange-700 border-orange-200',
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    past_due: 'bg-amber-50 text-amber-700 border-amber-200',
    canceled: 'bg-zinc-100 text-zinc-600 border-zinc-200',
    expired: 'bg-red-50 text-red-700 border-red-200',
  };

  const paymentStyles: Record<string, string> = {
    none: 'bg-zinc-100 text-zinc-600 border-zinc-200',
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    failed: 'bg-red-50 text-red-700 border-red-200',
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabase();
    if (!supabase) return;

    const featuresList = newPlanFeatures
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);

    const { error } = await supabase.from('subscription_plans').insert({
      name: newPlanName.trim(),
      code: newPlanCode.trim().toLowerCase(),
      price_ghs: parseFloat(newPlanPrice) || 100,
      billing_cycle: newPlanCycle,
      features: featuresList,
      is_active: true,
    });

    if (error) {
      alert(`Error creating plan: ${error.message}`);
    } else {
      setPlanModalOpen(false);
      setNewPlanName('');
      setNewPlanCode('');
      await fetchData();
    }
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: Building2 },
    { id: 'businesses', label: 'Registered Businesses', icon: Users, count: totalBusinesses },
    { id: 'subscriptions', label: 'Subscriptions', icon: Sparkles, count: trialBusinesses },
    { id: 'plans', label: 'Subscription Plans', icon: CreditCard },
    { id: 'payments', label: 'Payment Records', icon: CreditCard },
    { id: 'settings', label: 'Platform Settings & SQL', icon: Database },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col md:flex-row text-left">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col w-72 bg-zinc-900 text-white shrink-0 h-screen sticky top-0 overflow-y-auto">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <SamleyLogo size="sm" light={true} />
          <span className="px-2 py-0.5 rounded-full bg-orange-950 text-orange-400 text-[9px] font-black tracking-widest uppercase border border-orange-800">
            Super Admin
          </span>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id as AdminTab)}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold transition ${
                  isActive
                    ? 'bg-orange-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.count !== undefined && item.count > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-white text-orange-600' : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-zinc-800 space-y-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* MOBILE HEADER */}
      <div className="md:hidden bg-zinc-900 text-white p-4 sticky top-0 z-40 flex items-center justify-between">
        <SamleyLogo size="sm" light={true} />
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg text-zinc-400 hover:text-white"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/60 flex">
          <div className="w-4/5 max-w-xs bg-zinc-900 text-white h-full p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                <SamleyLogo size="sm" light={true} />
                <button onClick={() => setMobileMenuOpen(false)}>
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <nav className="py-4 space-y-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentTab(item.id as AdminTab);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold ${
                      currentTab === item.id ? 'bg-orange-600 text-white' : 'text-zinc-400'
                    }`}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-xs text-red-400 py-3"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* MAIN ADMIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="hidden md:flex items-center justify-between px-8 py-4 bg-white border-b border-zinc-200 sticky top-0 z-30">
          <div>
            <h1 className="text-lg font-black text-zinc-900 tracking-tight">
              {navItems.find((n) => n.id === currentTab)?.label || 'Super Admin'}
            </h1>
            <p className="text-[11px] text-zinc-500">
              SamleyBook Platform Management &bull; SamTeck Digital Master Console
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full bg-zinc-100 text-zinc-700 text-xs font-semibold">
              Live Production Supabase
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-8">
          {/* TAB: OVERVIEW */}
          {currentTab === 'overview' && (
            <div className="space-y-8">
              {/* Hero header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                        isConfigured
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      {isConfigured ? 'Supabase Connected' : 'Supabase Not Configured'}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-medium">
                      Last refresh: {lastRefreshed ? lastRefreshed.toLocaleTimeString() : '—'}
                    </span>
                  </div>
                  <h1 className="text-2xl font-black text-zinc-900 tracking-tight">Platform Overview</h1>
                  <p className="text-xs text-zinc-500 mt-1">
                    SamleyBook Platform Management &bull; SamTeck Digital Master Console
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-700 font-semibold text-xs hover:bg-zinc-50 transition disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{isRefreshing ? 'Refreshing...' : 'Refresh Data'}</span>
                  </button>
                </div>
              </div>

              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: 'Registered Businesses', value: totalBusinesses, color: 'text-zinc-900', icon: Building2, bg: 'bg-zinc-100 text-zinc-600' },
                  { label: 'On Free Trial', value: trialBusinesses, color: 'text-orange-600', icon: Clock, bg: 'bg-orange-100 text-orange-600' },
                  { label: 'Active Subscriptions', value: activeSubs, color: 'text-emerald-600', icon: Sparkles, bg: 'bg-emerald-100 text-emerald-600' },
                  { label: 'Past Due', value: subscriptions.filter((s) => s.status === 'past_due').length, color: 'text-amber-600', icon: AlertCircle, bg: 'bg-amber-100 text-amber-600' },
                  { label: 'Expired / Canceled', value: expiredSubs, color: 'text-red-600', icon: AlertCircle, bg: 'bg-red-100 text-red-600' },
                  { label: 'Total Revenue', value: formatGHS(totalRevenue), color: 'text-zinc-900', icon: CreditCard, bg: 'bg-zinc-100 text-zinc-600' },
                ].map((s, idx) => {
                  const Icon = s.icon;
                  return (
                    <div
                      key={idx}
                      className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs space-y-3 hover:shadow-md transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.bg}`}>
                          <Icon className="w-5 h-5" />
                        </span>
                      </div>
                      <div>
                        <p className={`text-2xl font-black ${s.color} leading-tight`}>{s.value}</p>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{s.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick actions */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Manage Businesses', icon: Building2, tab: 'businesses' as const, color: 'hover:border-orange-300 hover:text-orange-600' },
                  { label: 'Manage Subscriptions', icon: Sparkles, tab: 'subscriptions' as const, color: 'hover:border-emerald-300 hover:text-emerald-600' },
                  { label: 'Subscription Plans', icon: CreditCard, tab: 'plans' as const, color: 'hover:border-blue-300 hover:text-blue-600' },
                  { label: 'Platform Settings', icon: Settings, tab: 'settings' as const, color: 'hover:border-zinc-400 hover:text-zinc-800' },
                ].map((a, idx) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => setCurrentTab(a.tab)}
                      className={`flex items-center gap-3 p-4 rounded-2xl bg-white border border-zinc-200/80 shadow-xs text-left transition ${a.color}`}
                    >
                      <span className="w-9 h-9 rounded-xl bg-zinc-100 text-zinc-600 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5" />
                      </span>
                      <span className="text-xs font-bold text-zinc-700">{a.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Two-column: recent registrations + recent payments */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent business registrations */}
                <div className="lg:col-span-2 bg-white rounded-3xl border border-zinc-200/80 shadow-xs overflow-hidden">
                  <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-zinc-900">Recent Business Registrations</h3>
                      <p className="text-xs text-zinc-500">Live feed from Supabase businesses table</p>
                    </div>
                    <button
                      onClick={() => setCurrentTab('businesses')}
                      className="text-xs font-bold text-orange-600 hover:text-orange-700"
                    >
                      View All ({businesses.length})
                    </button>
                  </div>

                  {businesses.length === 0 ? (
                    <div className="p-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-zinc-400">
                        <Building2 className="w-8 h-8" />
                        <p className="text-sm font-semibold text-zinc-500">No businesses registered yet</p>
                        <p className="text-[11px]">When owners complete registration, they appear here immediately.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-zinc-50 text-zinc-400 font-bold uppercase border-b border-zinc-100">
                          <tr>
                            <th className="py-3 px-6">Business</th>
                            <th className="py-3 px-6">Owner</th>
                            <th className="py-3 px-6">Category</th>
                            <th className="py-3 px-6">Status</th>
                            <th className="py-3 px-6">Registered</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {businesses.slice(0, 6).map((b) => {
                            const sub = subscriptions.find((s) => s.business_id === b.id);
                            return (
                              <tr key={b.id} className="hover:bg-zinc-50/80 transition">
                                <td className="py-3.5 px-6">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 font-bold flex items-center justify-center text-[11px] shrink-0">
                                      {(b.name || 'B').charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-bold text-zinc-900 truncate">{b.name}</p>
                                      <p className="text-[10px] text-zinc-400 font-mono truncate">{b.phone}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3.5 px-6 text-zinc-600">{b.owner?.full_name || 'Owner'}</td>
                                <td className="py-3.5 px-6 text-zinc-600">{b.category}</td>
                                <td className="py-3.5 px-6">
                                  {sub ? (
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                        statusStyles[sub.status] || 'bg-zinc-100 text-zinc-600 border-zinc-200'
                                      }`}
                                    >
                                      {String(sub.status || '').replace('_', ' ')}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-zinc-400">—</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-6 text-zinc-500">
                                  {new Date(b.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Recent payments + system status */}
                <div className="space-y-6">
                  <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs overflow-hidden">
                    <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-zinc-900">Recent Payments</h3>
                      <button onClick={() => setCurrentTab('payments')} className="text-[11px] font-bold text-orange-600 hover:text-orange-700">
                        View All
                      </button>
                    </div>
                    <div className="divide-y divide-zinc-100">
                      {payments.length === 0 ? (
                        <div className="p-6 text-center text-[11px] text-zinc-400">No payments recorded yet.</div>
                      ) : (
                        payments.slice(0, 5).map((p) => (
                          <div key={p.id} className="p-4 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-zinc-900 truncate">{(p as any).business?.name || 'Business'}</p>
                              <p className="text-[10px] text-zinc-500">
                                {new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-bold text-zinc-900">{formatGHS(Number(p.amount || 0))}</p>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                  p.status === 'successful'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : p.status === 'pending'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-red-50 text-red-700 border-red-200'
                                }`}
                              >
                                {p.status}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-5 space-y-3">
                    <h3 className="text-sm font-bold text-zinc-900">System Status</h3>
                    <div className="space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500">Supabase</span>
                        <span className={`font-bold ${isConfigured ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {isConfigured ? 'Connected' : 'Not configured'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500">Businesses</span>
                        <span className="font-bold text-zinc-900">{businesses.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500">Subscriptions</span>
                        <span className="font-bold text-zinc-900">{subscriptions.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500">Plans</span>
                        <span className="font-bold text-zinc-900">{plans.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500">Payments</span>
                        <span className="font-bold text-zinc-900">{payments.length}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: REGISTERED BUSINESSES */}
          {currentTab === 'businesses' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-zinc-900 tracking-tight">Registered Businesses</h2>
                  <p className="text-xs text-zinc-500">
                    Every registered salon, spa, barbershop, and business across the platform
                  </p>
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-700 font-semibold text-xs hover:bg-zinc-50 transition disabled:opacity-60 self-start"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Total Businesses', value: businesses.length, color: 'text-zinc-900' },
                  { label: 'Active Subscriptions', value: businesses.filter((b) => subscriptions.find((s) => s.business_id === b.id)?.status === 'active').length, color: 'text-emerald-600' },
                  { label: 'On Free Trial', value: businesses.filter((b) => subscriptions.find((s) => s.business_id === b.id)?.status === 'trialing').length, color: 'text-orange-600' },
                  { label: 'Expired / Canceled', value: businesses.filter((b) => {
                      const s = subscriptions.find((x) => x.business_id === b.id);
                      return s?.status === 'expired' || s?.status === 'canceled';
                    }).length, color: 'text-red-600' },
                ].map((s, idx) => (
                  <div key={idx} className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{s.label}</span>
                    <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Toolbar */}
              <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-4 flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    placeholder="Search by name, category, phone, or owner..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-zinc-200 bg-zinc-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition"
                  />
                </div>
                <select
                  value={bizFilter}
                  onChange={(e) => setBizFilter(e.target.value)}
                  className="px-3.5 py-2.5 text-xs rounded-xl border border-zinc-200 bg-white text-zinc-700 font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                >
                  <option value="all">All businesses</option>
                  <option value="active">Active subscription</option>
                  <option value="trialing">On trial</option>
                  <option value="expired">Expired / Canceled</option>
                  <option value="none">No subscription</option>
                </select>
                <span className="text-[11px] text-zinc-400 font-medium whitespace-nowrap">
                  {businesses.filter((b) => {
                    const q = searchQuery.trim().toLowerCase();
                    const matchesSearch =
                      !q ||
                      (b.name || '').toLowerCase().includes(q) ||
                      (b.category || '').toLowerCase().includes(q) ||
                      (b.phone || '').includes(q) ||
                      (b.owner?.full_name || '').toLowerCase().includes(q);
                    const sub = subscriptions.find((s) => s.business_id === b.id);
                    const matchesFilter =
                      bizFilter === 'all' ||
                      (bizFilter === 'none' && !sub) ||
                      (bizFilter !== 'none' && sub?.status === bizFilter);
                    return matchesSearch && matchesFilter;
                  }).length} result(s)
                </span>
              </div>

              {businesses.length === 0 ? (
                <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-zinc-400">
                    <Building2 className="w-8 h-8" />
                    <p className="text-sm font-semibold text-zinc-500">No businesses registered yet</p>
                    <p className="text-[11px]">When owners complete registration, they appear here immediately.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 text-zinc-400 font-bold uppercase border-b border-zinc-100">
                        <tr>
                          <th className="py-3.5 px-6">Business</th>
                          <th className="py-3.5 px-6">Owner</th>
                          <th className="py-3.5 px-6">Category</th>
                          <th className="py-3.5 px-6">Subscription</th>
                          <th className="py-3.5 px-6">Phone / Slug</th>
                          <th className="py-3.5 px-6">Registered</th>
                          <th className="py-3.5 px-6 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {businesses
                          .filter((b) => {
                            const q = searchQuery.trim().toLowerCase();
                            const matchesSearch =
                              !q ||
                              (b.name || '').toLowerCase().includes(q) ||
                              (b.category || '').toLowerCase().includes(q) ||
                              (b.phone || '').includes(q) ||
                              (b.owner?.full_name || '').toLowerCase().includes(q);
                            const sub = subscriptions.find((s) => s.business_id === b.id);
                            const matchesFilter =
                              bizFilter === 'all' ||
                              (bizFilter === 'none' && !sub) ||
                              (bizFilter !== 'none' && sub?.status === bizFilter);
                            return matchesSearch && matchesFilter;
                          })
                          .map((b) => {
                            const sub = subscriptions.find((s) => s.business_id === b.id);
                            return (
                              <tr key={b.id} className="hover:bg-zinc-50/80 transition">
                                <td className="py-4 px-6">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-700 font-bold flex items-center justify-center shrink-0">
                                      {(b.name || 'B').charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-bold text-zinc-900 truncate">{b.name}</p>
                                      <p className="text-[10px] text-zinc-400 truncate">{b.email || b.owner?.email || '—'}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-4 px-6">
                                  <p className="font-semibold text-zinc-800">{b.owner?.full_name || 'Owner'}</p>
                                  <p className="text-[10px] text-zinc-400 truncate">{b.owner?.email || '—'}</p>
                                </td>
                                <td className="py-4 px-6 text-zinc-600">{b.category || '—'}</td>
                                <td className="py-4 px-6">
                                  {sub ? (
                                    <div className="space-y-1">
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                          statusStyles[sub.status] || 'bg-zinc-100 text-zinc-600 border-zinc-200'
                                        }`}
                                      >
                                        {String(sub.status || '').replace('_', ' ')}
                                      </span>
                                      <p className="text-[10px] text-zinc-400">{sub.plan?.name || 'No plan'}</p>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-zinc-400">No subscription</span>
                                  )}
                                </td>
                                <td className="py-4 px-6">
                                  <p className="font-mono text-zinc-700">{b.phone || '—'}</p>
                                  <p className="text-[10px] text-orange-600 font-mono">/b/{b.slug}</p>
                                </td>
                                <td className="py-4 px-6 text-zinc-500">
                                  {new Date(b.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                                <td className="py-4 px-6 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => {
                                        const s = subscriptions.find((x) => x.business_id === b.id);
                                        if (s) openSubscription(s);
                                      }}
                                      disabled={!subscriptions.find((x) => x.business_id === b.id)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 hover:border-orange-300 hover:text-orange-600 text-zinc-600 font-semibold text-[11px] transition disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      Manage Sub
                                    </button>
                                    <a
                                      href={`/b/${b.slug}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 hover:border-zinc-400 text-zinc-600 font-semibold text-[11px] transition"
                                    >
                                      <span>View</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: SUBSCRIPTIONS MANAGEMENT */}
          {currentTab === 'subscriptions' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-zinc-900 tracking-tight">Business Subscriptions</h2>
                  <p className="text-xs text-zinc-500">
                    Monitor, filter, and manage every business subscription across the platform
                  </p>
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-700 font-semibold text-xs hover:bg-zinc-50 transition self-start disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Total', value: subscriptions.length, color: 'text-zinc-900' },
                  { label: 'Active', value: activeSubs, color: 'text-emerald-600' },
                  { label: 'On Trial', value: trialBusinesses, color: 'text-orange-600' },
                  { label: 'Past Due', value: subscriptions.filter((s) => s.status === 'past_due').length, color: 'text-amber-600' },
                  { label: 'Expired / Canceled', value: subscriptions.filter((s) => s.status === 'expired' || s.status === 'canceled').length, color: 'text-red-600' },
                ].map((s, idx) => (
                  <div
                    key={idx}
                    className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs space-y-1"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{s.label}</span>
                    <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Toolbar */}
              <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-4 flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    placeholder="Search by business, owner, or plan..."
                    value={subSearch}
                    onChange={(e) => setSubSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-zinc-200 bg-zinc-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition"
                  />
                </div>
                <select
                  value={subStatusFilter}
                  onChange={(e) => setSubStatusFilter(e.target.value)}
                  className="px-3.5 py-2.5 text-xs rounded-xl border border-zinc-200 bg-white text-zinc-700 font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                >
                  <option value="all">All statuses</option>
                  <option value="trialing">Trialing</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past Due</option>
                  <option value="canceled">Canceled</option>
                  <option value="expired">Expired</option>
                </select>
                <span className="text-[11px] text-zinc-400 font-medium whitespace-nowrap">
                  {filteredSubscriptions.length} result{filteredSubscriptions.length === 1 ? '' : 's'}
                </span>
              </div>

              {/* Table */}
              <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 text-zinc-400 font-bold uppercase border-b border-zinc-100">
                      <tr>
                        <th className="py-3.5 px-6">Business</th>
                        <th className="py-3.5 px-6">Plan</th>
                        <th className="py-3.5 px-6">Status</th>
                        <th className="py-3.5 px-6">Payment</th>
                        <th className="py-3.5 px-6">Period / Trial</th>
                        <th className="py-3.5 px-6">Created</th>
                        <th className="py-3.5 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {filteredSubscriptions.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-16 text-center">
                            <div className="flex flex-col items-center gap-2 text-zinc-400">
                              <Sparkles className="w-8 h-8" />
                              <p className="text-sm font-semibold text-zinc-500">No subscriptions found</p>
                              <p className="text-[11px]">Try adjusting your search or filters.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredSubscriptions.map((sub) => (
                          <tr key={sub.id} className="hover:bg-zinc-50/80 transition">
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-700 font-bold flex items-center justify-center shrink-0">
                                  {(sub.business?.name || 'B').charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-zinc-900 truncate">{sub.business?.name || 'Unknown Business'}</p>
                                  <p className="text-[11px] text-zinc-500 truncate">
                                    {sub.business?.category || 'Service Business'}
                                    {sub.business?.owner?.full_name ? ` • ${sub.business.owner.full_name}` : ''}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <p className="font-semibold text-zinc-800">{sub.plan?.name || 'No plan'}</p>
                              <p className="text-[11px] text-zinc-500">
                                {sub.plan
                                  ? `GHS ${Number(sub.plan.price_ghs).toFixed(2)} / ${sub.plan.billing_cycle}`
                                  : '—'}
                              </p>
                            </td>
                            <td className="py-4 px-6">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                                  statusStyles[sub.status] || 'bg-zinc-100 text-zinc-600 border-zinc-200'
                                }`}
                              >
                                {String(sub.status || '').replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-4 px-6">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                                  paymentStyles[sub.payment_status] || 'bg-zinc-100 text-zinc-600 border-zinc-200'
                                }`}
                              >
                                {sub.payment_status || 'none'}
                              </span>
                            </td>
                            <td className="py-4 px-6">
                              <p className="text-zinc-700 font-medium">
                                {formatDate(sub.current_period_start)} → {formatDate(sub.current_period_end)}
                              </p>
                              <p className="text-[11px] text-zinc-500">Trial ends {formatDate(sub.trial_end)}</p>
                            </td>
                            <td className="py-4 px-6 text-zinc-500">{formatDate(sub.created_at)}</td>
                            <td className="py-4 px-6 text-right">
                              <button
                                onClick={() => openSubscription(sub)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 hover:border-orange-300 hover:text-orange-600 text-zinc-600 font-semibold text-[11px] transition"
                              >
                                Manage
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: PAYMENT RECORDS */}
          {currentTab === 'payments' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-zinc-900 tracking-tight">Payment Records</h2>
                  <p className="text-xs text-zinc-500">
                    All customer payments and deposits recorded across the platform
                  </p>
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-700 font-semibold text-xs hover:bg-zinc-50 transition disabled:opacity-60 self-start"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Total Payments', value: payments.length, color: 'text-zinc-900' },
                  { label: 'Successful', value: payments.filter((p) => p.status === 'successful').length, color: 'text-emerald-600' },
                  { label: 'Pending', value: payments.filter((p) => p.status === 'pending').length, color: 'text-amber-600' },
                  { label: 'Total Revenue', value: formatGHS(totalRevenue), color: 'text-zinc-900' },
                ].map((s, idx) => (
                  <div key={idx} className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{s.label}</span>
                    <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Toolbar */}
              <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-4 flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    placeholder="Search by business or reference..."
                    value={paymentSearch}
                    onChange={(e) => setPaymentSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-zinc-200 bg-zinc-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition"
                  />
                </div>
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value)}
                  className="px-3.5 py-2.5 text-xs rounded-xl border border-zinc-200 bg-white text-zinc-700 font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                >
                  <option value="all">All statuses</option>
                  <option value="successful">Successful</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
                <span className="text-[11px] text-zinc-400 font-medium whitespace-nowrap">
                  {
                    payments.filter((p) => {
                      const q = paymentSearch.trim().toLowerCase();
                      const matchesSearch =
                        !q ||
                        (p as any).business?.name?.toLowerCase().includes(q) ||
                        (p.moolre_reference || p.provider_reference || '').toLowerCase().includes(q);
                      const matchesStatus = paymentStatusFilter === 'all' || p.status === paymentStatusFilter;
                      return matchesSearch && matchesStatus;
                    }).length
                  } result(s)
                </span>
              </div>

              {/* Table */}
              <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50 text-zinc-400 font-bold uppercase border-b border-zinc-100">
                      <tr>
                        <th className="py-3.5 px-6">Business</th>
                        <th className="py-3.5 px-6">Amount</th>
                        <th className="py-3.5 px-6">Status</th>
                        <th className="py-3.5 px-6">Reference</th>
                        <th className="py-3.5 px-6">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {payments.filter((p) => {
                        const q = paymentSearch.trim().toLowerCase();
                        const matchesSearch =
                          !q ||
                          ((p as any).business?.name || '').toLowerCase().includes(q) ||
                          (p.moolre_reference || p.provider_reference || '').toLowerCase().includes(q);
                        const matchesStatus = paymentStatusFilter === 'all' || p.status === paymentStatusFilter;
                        return matchesSearch && matchesStatus;
                      }).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-16 text-center">
                            <div className="flex flex-col items-center gap-2 text-zinc-400">
                              <CreditCard className="w-8 h-8" />
                              <p className="text-sm font-semibold text-zinc-500">No payment records found</p>
                              <p className="text-[11px]">Try adjusting your search or filters.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        payments
                          .filter((p) => {
                            const q = paymentSearch.trim().toLowerCase();
                            const matchesSearch =
                              !q ||
                              ((p as any).business?.name || '').toLowerCase().includes(q) ||
                              (p.moolre_reference || p.provider_reference || '').toLowerCase().includes(q);
                            const matchesStatus = paymentStatusFilter === 'all' || p.status === paymentStatusFilter;
                            return matchesSearch && matchesStatus;
                          })
                          .map((p) => (
                            <tr key={p.id} className="hover:bg-zinc-50/80 transition">
                              <td className="py-4 px-6">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-[11px] shrink-0">
                                    {(((p as any).business?.name || 'B') as string).charAt(0).toUpperCase()}
                                  </div>
                                  <p className="font-bold text-zinc-900 truncate">{(p as any).business?.name || 'Business'}</p>
                                </div>
                              </td>
                              <td className="py-4 px-6 font-bold text-zinc-900">{formatGHS(Number(p.amount || 0))}</td>
                              <td className="py-4 px-6">
                                <span
                                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                                    p.status === 'successful'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : p.status === 'pending'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-red-50 text-red-700 border-red-200'
                                  }`}
                                >
                                  {p.status}
                                </span>
                              </td>
                              <td className="py-4 px-6 font-mono text-[11px] text-zinc-500">{p.moolre_reference || p.provider_reference || '—'}</td>
                              <td className="py-4 px-6 text-zinc-500">
                                {new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: SUBSCRIPTION PLANS CONFIG */}
          {currentTab === 'plans' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-zinc-900 tracking-tight">Subscription Packages</h2>
                  <p className="text-xs text-zinc-500">
                    Configure the actual platform subscription tiers and pricing in Ghanaian Cedis
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-700 font-semibold text-xs hover:bg-zinc-50 transition disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                  </button>
                  <button
                    onClick={() => setPlanModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-orange-700 shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add New Plan</span>
                  </button>
                </div>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Total Plans', value: plans.length, color: 'text-zinc-900' },
                  { label: 'Active Plans', value: plans.filter((p) => p.is_active).length, color: 'text-emerald-600' },
                  { label: 'Avg. Price (GHS)', value: plans.length ? (plans.reduce((s, p) => s + Number(p.price_ghs || 0), 0) / plans.length).toFixed(2) : '0.00', color: 'text-orange-600' },
                ].map((s, idx) => (
                  <div key={idx} className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{s.label}</span>
                    <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {plans.length === 0 ? (
                <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-zinc-400">
                    <CreditCard className="w-8 h-8" />
                    <p className="text-sm font-semibold text-zinc-500">No subscription plans yet</p>
                    <p className="text-[11px]">Create your first plan to get started.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {plans.map((p, idx) => (
                    <div
                      key={p.id}
                      className="relative p-6 rounded-3xl bg-white border border-zinc-200/80 shadow-xs space-y-4 hover:shadow-md transition overflow-hidden"
                    >
                      {idx === 1 && (
                        <span className="absolute top-4 right-4 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[9px] font-black uppercase tracking-wider">
                          Popular
                        </span>
                      )}
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-bold text-zinc-900">{p.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${p.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-100 text-zinc-600 border-zinc-200'}`}>
                          {p.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <div className="pt-1 pb-3 border-b border-zinc-100">
                        <p className="text-3xl font-black text-zinc-900">
                          GHS {Number(p.price_ghs).toFixed(2)}
                          <span className="text-xs font-normal text-zinc-500"> /{p.billing_cycle}</span>
                        </p>
                        <p className="text-xs text-zinc-500 mt-1">{p.description || 'No description provided.'}</p>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase text-zinc-400">Features</p>
                        {Array.isArray(p.features) && p.features.length > 0 ? (
                          p.features.map((f, fIdx) => (
                            <div key={fIdx} className="flex items-center gap-2 text-xs text-zinc-600">
                              <Check className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                              <span>{f}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-[11px] text-zinc-400">No features listed.</p>
                        )}
                      </div>

                      <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-[10px] text-zinc-400">
                        <span className="font-mono">{p.code}</span>
                        <span>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: PLATFORM SETTINGS & SQL SETUP */}
          {currentTab === 'settings' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-zinc-900 tracking-tight">Platform Settings & SQL Setup</h2>
                  <p className="text-xs text-zinc-500">
                    Manage platform configuration and database schema
                  </p>
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-700 font-semibold text-xs hover:bg-zinc-50 transition disabled:opacity-60 self-start"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              </div>

              {/* System info cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Supabase Status', value: isConfigured ? 'Connected' : 'Not Configured', color: isConfigured ? 'text-emerald-600' : 'text-amber-600', icon: Database },
                  { label: 'Registered Businesses', value: businesses.length, color: 'text-zinc-900', icon: Building2 },
                  { label: 'Total Plans', value: plans.length, color: 'text-zinc-900', icon: CreditCard },
                ].map((s, idx) => {
                  const Icon = s.icon;
                  return (
                    <div key={idx} className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex items-center gap-4">
                      <span className="w-10 h-10 rounded-xl bg-zinc-100 text-zinc-600 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5" />
                      </span>
                      <div>
                        <p className={`text-xl font-black ${s.color} leading-tight`}>{s.value}</p>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{s.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* SQL Schema card */}
              <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs overflow-hidden">
                <div className="p-6 border-b border-zinc-100">
                  <h3 className="text-base font-bold text-zinc-900">PostgreSQL Schema Script</h3>
                  <p className="text-xs text-zinc-500 mt-1">
                    Complete SQL DDL script to run in the Supabase SQL Editor. Includes all tables, triggers, RLS policies, storage bucket, and realtime publications.
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="p-4 rounded-2xl bg-orange-50 border border-orange-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-orange-950">Complete Supabase Schema</p>
                      <p className="text-[11px] text-orange-800 mt-0.5">
                        src/lib/supabase-schema.sql &bull; 14 tables, triggers, RLS, storage, realtime
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
                        setCopiedSql(true);
                        setTimeout(() => setCopiedSql(false), 2500);
                      }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase hover:bg-orange-700 shadow-sm transition shrink-0"
                    >
                      {copiedSql ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedSql ? 'Copied!' : 'Copy Script'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {[
                      'Run the copied script in Supabase SQL Editor',
                      'All 14 tables created with RLS policies',
                      'Storage bucket "business-assets" configured',
                      'Realtime publications enabled for live sync',
                    ].map((step, idx) => (
                      <div key={idx} className="flex items-center gap-2.5 p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-zinc-600">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* SUBSCRIPTION MANAGE MODAL */}
      {selectedSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-zinc-100 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-zinc-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 font-bold flex items-center justify-center">
                  {(selectedSub.business?.name || 'B').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900">{selectedSub.business?.name || 'Unknown Business'}</h3>
                  <p className="text-[11px] text-zinc-500">
                    {selectedSub.business?.category || 'Service Business'}
                    {selectedSub.business?.owner?.full_name ? ` • ${selectedSub.business.owner.full_name}` : ''}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedSub(null)} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Details grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Current Plan</p>
                  <p className="font-bold text-zinc-900">{selectedSub.plan?.name || 'No plan'}</p>
                  <p className="text-zinc-500">
                    {selectedSub.plan ? `GHS ${Number(selectedSub.plan.price_ghs).toFixed(2)} / ${selectedSub.plan.billing_cycle}` : '—'}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Payment Status</p>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                      paymentStyles[selectedSub.payment_status] || 'bg-zinc-100 text-zinc-600 border-zinc-200'
                    }`}
                  >
                    {selectedSub.payment_status || 'none'}
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Current Period</p>
                  <p className="font-medium text-zinc-800">
                    {formatDate(selectedSub.current_period_start)} → {formatDate(selectedSub.current_period_end)}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Trial Window</p>
                  <p className="font-medium text-zinc-800">
                    {formatDate(selectedSub.trial_start)} → {formatDate(selectedSub.trial_end)}
                  </p>
                </div>
              </div>

              {/* Edit controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Subscription Status</label>
                  <select
                    value={editSubStatus}
                    onChange={(e) => setEditSubStatus(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  >
                    <option value="trialing">Trialing</option>
                    <option value="active">Active</option>
                    <option value="past_due">Past Due</option>
                    <option value="canceled">Canceled</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Assign Plan</label>
                  <select
                    value={editSubPlanId}
                    onChange={(e) => setEditSubPlanId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  >
                    <option value="">No plan</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (GHS {Number(p.price_ghs).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedSub(null)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 text-zinc-600 font-semibold text-xs hover:bg-zinc-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSubscription}
                  disabled={subActionLoading}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-orange-600 text-white font-bold text-xs hover:bg-orange-700 disabled:opacity-50 transition"
                >
                  {subActionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW PLAN MODAL */}
      {planModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-zinc-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="text-base font-bold text-zinc-900">Add Subscription Package</h3>
              <button onClick={() => setPlanModalOpen(false)}>
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">Package Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VIP Enterprise Hub"
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-zinc-300"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Plan Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. vip-hub"
                  value={newPlanCode}
                  onChange={(e) => setNewPlanCode(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-zinc-300 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Price (GHS)</label>
                  <input
                    type="number"
                    required
                    value={newPlanPrice}
                    onChange={(e) => setNewPlanPrice(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-zinc-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Billing Cycle</label>
                  <select
                    value={newPlanCycle}
                    onChange={(e) => setNewPlanCycle(e.target.value as any)}
                    className="w-full p-2.5 rounded-xl border border-zinc-300 bg-white"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Features (One per line)</label>
                <textarea
                  rows={3}
                  value={newPlanFeatures}
                  onChange={(e) => setNewPlanFeatures(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-zinc-300"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPlanModalOpen(false)}
                  className="px-4 py-2 rounded-xl border text-zinc-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-orange-600 text-white font-bold"
                >
                  Save Package
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
