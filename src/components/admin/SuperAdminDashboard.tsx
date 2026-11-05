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
  const { signOut, profile } = useAuth();
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
  const [selectedBusiness, setSelectedBusiness] = useState<any | null>(null);

  // New plan modal
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanCode, setNewPlanCode] = useState('');
  const [newPlanPrice, setNewPlanPrice] = useState('150');
  const [newPlanCycle, setNewPlanCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [newPlanFeatures, setNewPlanFeatures] = useState('Unlimited bookings\nSMS alerts\nPWA access');

  const [copiedSql, setCopiedSql] = useState(false);

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
        .select('*')
        .order('created_at', { ascending: false });

      setPayments((payData as PaymentTransaction[]) || []);
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Realtime listener for new businesses
    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel('admin-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'businesses' },
        () => fetchData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'business_subscriptions' },
        () => fetchData()
      )
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
              {/* Stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Registered Businesses', value: totalBusinesses, color: 'text-zinc-900' },
                  { label: 'On 7-Day Free Trial', value: trialBusinesses, color: 'text-orange-600' },
                  { label: 'Active Subscriptions', value: activeSubs, color: 'text-emerald-600' },
                  { label: 'Expired Subscriptions', value: expiredSubs, color: 'text-red-600' },
                  { label: 'Total Recorded Payments', value: formatGHS(totalRevenue), color: 'text-zinc-900' },
                ].map((s, idx) => (
                  <div key={idx} className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      {s.label}
                    </span>
                    <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Recent business registrations table */}
              <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs overflow-hidden">
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
                  <div className="p-12 text-center text-xs text-zinc-500">
                    No businesses registered yet. When owners complete registration, they appear here immediately.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 text-zinc-400 font-bold uppercase border-b border-zinc-100">
                        <tr>
                          <th className="py-3 px-6">Business</th>
                          <th className="py-3 px-6">Owner</th>
                          <th className="py-3 px-6">Category</th>
                          <th className="py-3 px-6">Phone</th>
                          <th className="py-3 px-6">Registered Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {businesses.slice(0, 5).map((b) => (
                          <tr key={b.id} className="hover:bg-zinc-50">
                            <td className="py-3.5 px-6 font-bold text-zinc-900">{b.name}</td>
                            <td className="py-3.5 px-6 text-zinc-600">{b.owner?.full_name || 'Owner'}</td>
                            <td className="py-3.5 px-6 text-zinc-600">{b.category}</td>
                            <td className="py-3.5 px-6 font-mono">{b.phone}</td>
                            <td className="py-3.5 px-6 text-zinc-500">
                              {new Date(b.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: REGISTERED BUSINESSES */}
          {currentTab === 'businesses' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-zinc-900 tracking-tight">Registered Businesses</h2>
                  <p className="text-xs text-zinc-500">
                    Every registered salon, spa, barbershop, and business across the platform
                  </p>
                </div>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search businesses by name, category, phone, or owner..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-zinc-200 bg-white"
                />
              </div>

              {businesses.length === 0 ? (
                <div className="p-12 text-center bg-white rounded-3xl border border-zinc-200/80 shadow-xs text-xs text-zinc-500">
                  No businesses registered in the database yet.
                </div>
              ) : (
                <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-50 text-zinc-400 font-bold uppercase border-b border-zinc-100">
                        <tr>
                          <th className="py-3.5 px-6">Business Name</th>
                          <th className="py-3.5 px-6">Category</th>
                          <th className="py-3.5 px-6">Owner Name & Email</th>
                          <th className="py-3.5 px-6">Phone</th>
                          <th className="py-3.5 px-6">Slug</th>
                          <th className="py-3.5 px-6">Registered</th>
                          <th className="py-3.5 px-6 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {businesses
                          .filter(
                            (b) =>
                              b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              b.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              b.phone.includes(searchQuery)
                          )
                          .map((b) => (
                            <tr key={b.id} className="hover:bg-zinc-50">
                              <td className="py-4 px-6 font-bold text-zinc-900">{b.name}</td>
                              <td className="py-4 px-6 text-zinc-600">{b.category}</td>
                              <td className="py-4 px-6">
                                <p className="font-semibold text-zinc-800">{b.owner?.full_name || 'Owner'}</p>
                                <p className="text-[11px] text-zinc-400">{b.owner?.email || b.email}</p>
                              </td>
                              <td className="py-4 px-6 font-mono text-zinc-700">{b.phone}</td>
                              <td className="py-4 px-6 font-mono text-[11px] text-orange-600">
                                /b/{b.slug}
                              </td>
                              <td className="py-4 px-6 text-zinc-500">
                                {new Date(b.created_at).toLocaleDateString()}
                              </td>
                              <td className="py-4 px-6 text-right">
                                <a
                                  href={`/b/${b.slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700"
                                >
                                  <span>View Page</span>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: SUBSCRIPTION PLANS CONFIG */}
          {currentTab === 'plans' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-zinc-900 tracking-tight">Subscription Packages</h2>
                  <p className="text-xs text-zinc-500">
                    Configure the actual platform subscription tiers and pricing in Ghanaian Cedis
                  </p>
                </div>
                <button
                  onClick={() => setPlanModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-orange-700"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add New Plan</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {plans.map((p) => (
                  <div key={p.id} className="p-6 rounded-3xl bg-white border border-zinc-200/80 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-zinc-900">{p.name}</h3>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                        Active
                      </span>
                    </div>

                    <div className="pt-1 pb-3 border-b border-zinc-100">
                      <p className="text-2xl font-black text-zinc-900">
                        GHS {Number(p.price_ghs).toFixed(2)}
                        <span className="text-xs font-normal text-zinc-500"> /{p.billing_cycle}</span>
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">{p.description}</p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase text-zinc-400">Features:</p>
                      {Array.isArray(p.features) &&
                        p.features.map((f, fIdx) => (
                          <div key={fIdx} className="flex items-center gap-2 text-xs text-zinc-600">
                            <Check className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                            <span>{f}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: PLATFORM SETTINGS & SQL SETUP */}
          {currentTab === 'settings' && (
            <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-black text-zinc-900 tracking-tight">
                  Platform Setup & PostgreSQL Schema Script
                </h2>
                <p className="text-xs text-zinc-500">
                  Complete SQL DDL script to run in the Supabase SQL editor
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-orange-950">Complete Supabase Schema (src/lib/supabase-schema.sql)</p>
                  <p className="text-[11px] text-orange-800">
                    Includes all 14 tables, triggers, Row Level Security policies, storage bucket, and realtime publications.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
                    setCopiedSql(true);
                    setTimeout(() => setCopiedSql(false), 2500);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase"
                >
                  {copiedSql ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedSql ? 'Copied!' : 'Copy Script'}</span>
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

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
