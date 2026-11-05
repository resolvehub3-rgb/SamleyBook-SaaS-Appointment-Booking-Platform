import React, { useState } from 'react';
import {
  LayoutDashboard,
  Scissors,
  Calendar,
  Users,
  CreditCard,
  Settings,
  QrCode,
  Sparkles,
  Building2,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Plus,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { calculateTrialRemainingDays } from '../../utils/booking-logic';
import { SamleyLogo } from '../common/SamleyLogo';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { Business } from '../../types/database';

export type DashboardTab =
  | 'overview'
  | 'services'
  | 'appointments'
  | 'customers'
  | 'payments'
  | 'payment-config'
  | 'booking-page'
  | 'subscription'
  | 'business-profile'
  | 'settings';

interface Props {
  currentTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  onNavigateHome: () => void;
  onOpenCreateBusinessModal: () => void;
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<Props> = ({
  currentTab,
  onSelectTab,
  onNavigateHome,
  onOpenCreateBusinessModal,
  children,
}) => {
  const { profile, signOut } = useAuth();
  const { businesses, currentBusiness, setCurrentBusiness, subscription, appointments } = useBusiness();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [businessSwitcherOpen, setBusinessSwitcherOpen] = useState(false);

  // Real pending appointments count
  const pendingCount = appointments.filter((a) => a.status === 'pending').length;

  // Real trial calculation
  const trialInfo = subscription?.trial_end
    ? calculateTrialRemainingDays(subscription.trial_end)
    : null;

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'services', label: 'Services', icon: Scissors },
    { id: 'appointments', label: 'Appointments', icon: Calendar, badge: pendingCount > 0 ? pendingCount : null },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'payment-config', label: 'Payment Configuration', icon: Settings },
    { id: 'booking-page', label: 'Booking Page & QR Code', icon: QrCode },
    { id: 'subscription', label: 'Subscription', icon: Sparkles },
    { id: 'business-profile', label: 'Business Profile', icon: Building2 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleLogout = async () => {
    await signOut();
    onNavigateHome();
  };

  const handleSelectBusiness = (b: Business) => {
    setCurrentBusiness(b);
    setBusinessSwitcherOpen(false);
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col md:flex-row text-left">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col w-72 bg-white border-r border-zinc-200/80 shrink-0 h-screen sticky top-0 overflow-y-auto">
        {/* Brand Header */}
        <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
          <SamleyLogo size="sm" showAttribution={true} />
        </div>

        {/* Business Switcher Dropdown */}
        <div className="p-4 border-b border-zinc-100 relative">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
            Active Business
          </label>
          <button
            onClick={() => setBusinessSwitcherOpen(!businessSwitcherOpen)}
            className="w-full flex items-center justify-between p-2.5 rounded-xl border border-zinc-200 hover:border-zinc-300 bg-zinc-50/50 hover:bg-zinc-50 transition text-left"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {currentBusiness?.logo_url ? (
                <img
                  src={currentBusiness.logo_url}
                  alt={currentBusiness.name}
                  className="w-7 h-7 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-lg bg-orange-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                  {currentBusiness?.name ? currentBusiness.name.charAt(0).toUpperCase() : 'B'}
                </div>
              )}
              <div className="truncate">
                <p className="text-xs font-bold text-zinc-900 truncate">
                  {currentBusiness?.name || 'Select Business'}
                </p>
                <p className="text-[10px] text-zinc-500 truncate">
                  {currentBusiness?.category || 'Service Business'}
                </p>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0 ml-1" />
          </button>

          {/* Switcher popover */}
          {businessSwitcherOpen && (
            <div className="absolute top-full left-4 right-4 mt-1 bg-white rounded-2xl shadow-xl border border-zinc-200 z-50 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-100">
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Your Registered Businesses
              </p>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {businesses.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => handleSelectBusiness(b)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition ${
                      currentBusiness?.id === b.id
                        ? 'bg-orange-50 text-orange-900 font-bold'
                        : 'text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <span className="truncate">{b.name}</span>
                    {currentBusiness?.id === b.id && (
                      <span className="w-2 h-2 rounded-full bg-orange-600" />
                    )}
                  </button>
                ))}
              </div>

              <div className="pt-2 border-t border-zinc-100">
                <button
                  onClick={() => {
                    setBusinessSwitcherOpen(false);
                    onOpenCreateBusinessModal();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-orange-600 hover:bg-orange-50 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Register Another Business</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id as DashboardTab)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  isActive
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== null && item.badge !== undefined && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-white text-orange-600' : 'bg-orange-100 text-orange-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-zinc-100 space-y-3">
          <PWAInstallButton variant="sidebar" />

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* MOBILE HEADER */}
      <div className="md:hidden bg-white border-b border-zinc-200 sticky top-0 z-40 px-4 py-3 flex items-center justify-between">
        <SamleyLogo size="sm" showAttribution={false} />

        <div className="flex items-center gap-2">
          {trialInfo && !trialInfo.isExpired && (
            <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold">
              {trialInfo.daysRemaining}d Trial
            </span>
          )}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl text-zinc-600 hover:bg-zinc-100"
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* MOBILE DRAWER */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex">
          <div className="w-4/5 max-w-xs bg-white h-full flex flex-col p-4 overflow-y-auto animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
              <SamleyLogo size="sm" />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Active business selector */}
            <div className="py-3 border-b border-zinc-100">
              <p className="text-[10px] font-bold uppercase text-zinc-400 mb-1">Active Business</p>
              <p className="text-xs font-bold text-zinc-900 truncate">{currentBusiness?.name || 'No Business'}</p>
            </div>

            <nav className="flex-1 py-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectTab(item.id as DashboardTab);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold ${
                      isActive
                        ? 'bg-orange-600 text-white'
                        : 'text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </div>
                    {item.badge !== null && item.badge !== undefined && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="pt-3 border-t border-zinc-100 space-y-2">
              <PWAInstallButton variant="sidebar" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-red-600"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top bar */}
        <header className="hidden md:flex items-center justify-between px-8 py-4 bg-white border-b border-zinc-200/80 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-black text-zinc-900 tracking-tight">
              {navItems.find((n) => n.id === currentTab)?.label || 'Dashboard'}
            </h1>
            {currentBusiness && (
              <span className="px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[11px] font-medium">
                {currentBusiness.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* View live public booking page link */}
            {currentBusiness?.slug && (
              <a
                href={`/b/${currentBusiness.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 hover:border-orange-300 hover:text-orange-600 text-zinc-600 text-xs font-semibold transition"
              >
                <span>Live Booking Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            {/* Trial remaining pill */}
            {trialInfo && (
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                  trialInfo.isExpired
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-orange-50 text-orange-700 border border-orange-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {trialInfo.isExpired
                    ? 'Free Trial Expired'
                    : `${trialInfo.daysRemaining} Days Free Trial Left`}
                </span>
              </div>
            )}

            {/* User pill */}
            <div className="flex items-center gap-2 pl-2 border-l border-zinc-200">
              <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-800 font-bold flex items-center justify-center text-xs">
                {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="text-left hidden lg:block">
                <p className="text-xs font-bold text-zinc-900 leading-tight">
                  {profile?.full_name || 'Business Owner'}
                </p>
                <p className="text-[10px] text-zinc-400">{profile?.email}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
