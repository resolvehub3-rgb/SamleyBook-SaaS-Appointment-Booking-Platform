import React, { useEffect, useRef, useState } from 'react';
import {
  Home,
  BarChart2,
  Scissors,
  Calendar,
  Star,
  Users,
  CreditCard,
  Settings,
  QrCode,
  Crown,
  Store,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Plus,
  Check,
  ExternalLink,
  Clock,
  SlidersHorizontal,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { calculateTrialRemainingDays } from '../../utils/booking-logic';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { NotificationsDropdown } from './ui/NotificationsDropdown';
import { Business } from '../../types/database';
import { DASHBOARD_COLORS, PRIMARY_ORANGE_BTN } from './ui/DashboardTokens';

export type DashboardTab =
  | 'dashboard'
  | 'overview'
  | 'services'
  | 'appointments'
  | 'feedback'
  | 'customers'
  | 'payments'
  | 'payment-config'
  | 'booking-page'
  | 'subscription'
  | 'business-profile'
  | 'settings';

export type AppointmentSubMode = 'list' | 'calendar-week' | 'calendar-month' | 'calendar-day' | 'upcoming';

interface Props {
  currentTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  onNavigateHome: () => void;
  onOpenCreateBusinessModal: () => void;
  children: React.ReactNode;
}

const PAGE_META: Record<
  DashboardTab,
  { title: string; subtitle: string; icon: React.ComponentType<{ className?: string }> }
> = {
  dashboard: {
    title: 'Business Dashboard',
    subtitle: 'Monitor real-time bookings, revenue performance, and daily schedule insights.',
    icon: Home,
  },
  overview: {
    title: 'Operations Overview',
    subtitle: 'Summary of bookings, services, payments, and recent customer activity.',
    icon: BarChart2,
  },
  services: {
    title: 'Services & Pricing',
    subtitle: 'Create, edit, and manage the services offered on your public booking page.',
    icon: Scissors,
  },
  appointments: {
    title: 'Appointments & Bookings',
    subtitle: 'Manage all appointments received from your public booking page and QR code.',
    icon: Calendar,
  },
  feedback: {
    title: 'Customer Feedback',
    subtitle: 'Reviews submitted by customers after completed appointments.',
    icon: Star,
  },
  customers: {
    title: 'Customers',
    subtitle: 'Clients who have booked appointments with your business.',
    icon: Users,
  },
  payments: {
    title: 'Payments & Settlement',
    subtitle: 'Transaction history and verified payment receipts processed through Moolre.',
    icon: CreditCard,
  },
  'payment-config': {
    title: 'Payment Configuration',
    subtitle: 'Configure Mobile Money settlement details and customer deposit requirements.',
    icon: SlidersHorizontal,
  },
  'booking-page': {
    title: 'Booking Page & QR Code',
    subtitle: 'Share your instant booking URL and printable QR standee with clients.',
    icon: QrCode,
  },
  subscription: {
    title: 'Subscription & Billing',
    subtitle: 'Manage your SamleyBook plan, trial status, and renewal history.',
    icon: Crown,
  },
  'business-profile': {
    title: 'Business Profile',
    subtitle: 'Update your public business details, logo, and weekly operating hours.',
    icon: Store,
  },
  settings: {
    title: 'Settings',
    subtitle: 'Manage your business owner account preferences and PWA installation.',
    icon: Settings,
  },
};

export const DashboardLayout: React.FC<Props> = ({
  currentTab,
  onSelectTab,
  onNavigateHome,
  onOpenCreateBusinessModal,
  children,
}) => {
  const { profile, signOut } = useAuth();
  const { businesses, currentBusiness, setCurrentBusiness, subscription, appointments } =
    useBusiness();
  const shouldReduceMotion = useReducedMotion();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [businessSwitcherOpen, setBusinessSwitcherOpen] = useState(false);
  const [apptMenuOpen, setApptMenuOpen] = useState(true);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [activeApptSubMode, setActiveApptSubMode] = useState<string>(() => {
    try {
      return localStorage.getItem('samley_appt_open_mode') || 'calendar-week';
    } catch {
      return 'calendar-week';
    }
  });

  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    const syncMode = () => {
      try {
        const mode = localStorage.getItem('samley_appt_open_mode');
        if (mode) setActiveApptSubMode(mode);
      } catch {
        // ignore
      }
    };
    window.addEventListener('samley_appt_mode_change', syncMode);
    return () => window.removeEventListener('samley_appt_mode_change', syncMode);
  }, []);

  const pendingCount = appointments.filter((a) => a.status === 'pending').length;

  const trialInfo = subscription?.trial_end
    ? calculateTrialRemainingDays(subscription.trial_end)
    : null;

  const handleLogout = async () => {
    await signOut();
    onNavigateHome();
  };

  const handleSelectBusiness = (b: Business) => {
    setCurrentBusiness(b);
    setBusinessSwitcherOpen(false);
  };

  const openApptView = (mode: string) => {
    try {
      localStorage.setItem('samley_appt_open_mode', mode);
    } catch {
      // ignore
    }
    setActiveApptSubMode(mode);
    window.dispatchEvent(new CustomEvent('samley_appt_mode_change', { detail: mode }));
    onSelectTab('appointments');
    setMobileMenuOpen(false);
  };

  const primaryTopNav = [
    { id: 'overview', label: 'Overview', icon: BarChart2 },
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'services', label: 'Services', icon: Scissors },
  ] as const;

  const lowerNavItems = [
    { id: 'feedback', label: 'Customer Feedback', icon: Star },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'payment-config', label: 'Payment Configuration', icon: SlidersHorizontal },
    { id: 'booking-page', label: 'Booking Page & QR Code', icon: QrCode },
    { id: 'subscription', label: 'Subscription', icon: Crown },
    { id: 'business-profile', label: 'Business Profile', icon: Store },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  const apptSubItems = [
    { label: 'Appointments', mode: 'list' },
    { label: 'Calendar', mode: 'calendar-week' },
    { label: 'Daily Schedule', mode: 'calendar-day' },
    { label: 'Upcoming Appointments', mode: 'upcoming' },
  ];

  const isApptActive = currentTab === 'appointments';
  const currentMeta = PAGE_META[currentTab] || PAGE_META.dashboard;
  const PageIcon = currentMeta.icon;

  // Format actual subscription expiry date
  const validUntilRaw = subscription?.current_period_end || subscription?.trial_end;
  const validUntilFormatted = validUntilRaw
    ? new Date(validUntilRaw).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const planHeading = subscription?.plan?.name
    ? `${subscription.plan.name}${
        subscription.status === 'active'
          ? ' Active'
          : subscription.status === 'trialing'
          ? ' (Trial)'
          : ''
      }`
    : subscription?.status === 'trialing'
    ? '7-Day Free Trial'
    : 'Subscription';

  const ownerInitial = profile?.full_name
    ? profile.full_name.trim().charAt(0).toUpperCase()
    : 'B';

  const renderSidebarContent = (isMobile: boolean) => (
    <div
      className="flex flex-col h-full select-none"
      style={{ backgroundColor: DASHBOARD_COLORS.sidebarNavy }}
    >
      {/* Top Orange Brand Header Block */}
      <div className="bg-gradient-to-r from-[#FF6514] to-[#E64D00] px-4 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
            <img
              src="/assets/aistudio/logo1_6de85ee8.png"
              alt="SamleyBook"
              className="w-full h-full object-contain select-none"
            />
          </div>
          <div className="leading-tight min-w-0">
            <p className="text-[18px] font-black text-white tracking-tight truncate">SamleyBook</p>
            <p className="text-[10px] font-semibold text-orange-100 tracking-wide truncate">
              Book &bull; Manage &bull; Grow
            </p>
          </div>
        </div>
        {isMobile && (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
            className="p-1.5 rounded-lg text-white/85 hover:text-white hover:bg-white/15"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Business Switcher */}
      <div className="px-3.5 py-2.5 border-b border-white/10 relative">
        <button
          type="button"
          onClick={() => setBusinessSwitcherOpen(!businessSwitcherOpen)}
          className="w-full flex items-center justify-between p-1.5 rounded-xl hover:bg-white/[0.06] transition text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            {currentBusiness?.logo_url ? (
              <img
                src={currentBusiness.logo_url}
                alt={currentBusiness.name}
                className="w-9 h-9 rounded-full object-cover shrink-0 border border-white/20"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#F95700] text-white font-extrabold flex items-center justify-center text-sm shrink-0 shadow-xs">
                {currentBusiness?.name ? currentBusiness.name.charAt(0).toUpperCase() : 'S'}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-white truncate leading-tight">
                {currentBusiness?.name || 'Select Business'}
              </p>
              <p className="text-[11px] text-white/60 truncate mt-0.5">
                {currentBusiness?.category || 'Service Business'}
              </p>
            </div>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-white/60 shrink-0 ml-1 transition-transform ${
              businessSwitcherOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        <AnimatePresence>
          {businessSwitcherOpen && (
            <motion.div
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14 }}
              className="absolute top-full left-3 right-3 mt-1 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-2 space-y-1"
            >
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Your Registered Businesses
              </p>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {businesses.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleSelectBusiness(b)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition ${
                      currentBusiness?.id === b.id
                        ? 'bg-orange-50 text-orange-900 font-bold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{b.name}</span>
                    {currentBusiness?.id === b.id && (
                      <span className="w-2 h-2 rounded-full bg-[#F95700]" />
                    )}
                  </button>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setBusinessSwitcherOpen(false);
                    if (isMobile) setMobileMenuOpen(false);
                    onOpenCreateBusinessModal();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-[#F95700] hover:bg-orange-50 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Register Another Business</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto" aria-label="Dashboard Navigation">
        {primaryTopNav.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                if (isMobile) setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-[#FF6B1A] to-[#EA580C] text-white shadow-[0_4px_12px_rgba(249,87,0,0.3)]'
                  : 'text-white/80 hover:text-white hover:bg-white/[0.07]'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-white/60'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}

        {/* Expandable Appointments Menu */}
        <div className="pt-0.5">
          <button
            type="button"
            aria-expanded={apptMenuOpen}
            onClick={() => setApptMenuOpen(!apptMenuOpen)}
            className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all ${
              isApptActive
                ? 'bg-gradient-to-r from-[#FF6B1A] to-[#EA580C] text-white shadow-[0_4px_12px_rgba(249,87,0,0.3)]'
                : 'text-white/80 hover:text-white hover:bg-white/[0.07]'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Calendar
                className={`w-4 h-4 shrink-0 ${isApptActive ? 'text-white' : 'text-white/60'}`}
              />
              <span className="truncate">Appointments</span>
              {pendingCount > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    isApptActive
                      ? 'bg-white/25 text-white'
                      : 'bg-orange-500/25 text-orange-200'
                  }`}
                >
                  {pendingCount}
                </span>
              )}
            </div>
            {apptMenuOpen ? (
              <ChevronRight className="w-3.5 h-3.5 shrink-0 rotate-90 transition-transform" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 shrink-0 transition-transform" />
            )}
          </button>

          <AnimatePresence initial={false}>
            {apptMenuOpen && (
              <motion.div
                initial={shouldReduceMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="mt-0.5 ml-2.5 space-y-0.5 pl-2">
                  {apptSubItems.map((sub) => {
                    const isSubActive = isApptActive && activeApptSubMode === sub.mode;
                    return (
                      <button
                        key={sub.mode}
                        type="button"
                        onClick={() => openApptView(sub.mode)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-1 rounded-lg text-[11.5px] transition ${
                          isSubActive
                            ? 'bg-white/[0.11] text-white font-bold'
                            : 'text-white/70 font-medium hover:text-white hover:bg-white/[0.06]'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            isSubActive ? 'bg-[#FF6B1A]' : 'bg-[#EA580C]/70'
                          }`}
                        />
                        <span className="truncate">{sub.label}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Remaining Nav Items */}
        {lowerNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                if (isMobile) setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-[#FF6B1A] to-[#EA580C] text-white shadow-[0_4px_12px_rgba(249,87,0,0.3)]'
                  : 'text-white/80 hover:text-white hover:bg-white/[0.07]'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-white/60'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Subscription Card */}
      <div className="px-3 pt-1.5 pb-2 shrink-0">
        <div
          className="rounded-2xl border border-white/10 p-3 space-y-2"
          style={{ backgroundColor: DASHBOARD_COLORS.sidebarCardBg }}
        >
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-amber-400/15 text-amber-400 flex items-center justify-center shrink-0">
              <Crown className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[11.5px] font-extrabold text-white truncate">{planHeading}</p>
                {(subscription?.status === 'active' || subscription?.status === 'trialing') && (
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                )}
              </div>
              <p className="text-[10px] text-white/65 truncate mt-0.5">
                {validUntilFormatted
                  ? `Valid until: ${validUntilFormatted}`
                  : `Status: ${subscription?.status || 'Trialing'}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onSelectTab('subscription');
              if (isMobile) setMobileMenuOpen(false);
            }}
            className={`${PRIMARY_ORANGE_BTN} w-full py-1.5 text-[11.5px]`}
          >
            Upgrade Plan
          </button>
        </div>
      </div>

      {/* Footer: PWA Install + Sign Out */}
      <div className="px-3 pb-3 pt-1.5 border-t border-white/10 space-y-1 shrink-0">
        <PWAInstallButton variant="sidebar" />
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-semibold text-white/75 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen flex flex-col md:flex-row text-left"
      style={{ backgroundColor: DASHBOARD_COLORS.canvasBg }}
    >
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 h-screen sticky top-0 self-start overflow-y-auto shadow-[4px_0_24px_rgba(14,23,51,0.08)] z-30">
        {renderSidebarContent(false)}
      </aside>

      {/* MOBILE TOP HEADER */}
      <div className="md:hidden bg-white border-b border-slate-200/80 sticky top-0 z-40 px-4 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white border border-slate-200/80 p-1 flex items-center justify-center shadow-2xs shrink-0 overflow-hidden">
            <img
              src="/assets/aistudio/logo1_6de85ee8.png"
              alt="SamleyBook"
              className="w-full h-full object-contain select-none"
            />
          </div>
          <div className="leading-tight min-w-0">
            <p className="text-[15px] font-black text-[#111827] tracking-tight truncate">SamleyBook</p>
            <p className="text-[10.5px] font-semibold text-slate-500 truncate max-w-[165px]">
              {currentBusiness?.name || currentMeta.title}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NotificationsDropdown onOpenAppointments={() => onSelectTab('appointments')} />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl text-slate-700 hover:bg-slate-100"
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* MOBILE DRAWER */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex">
            <motion.div
              initial={shouldReduceMotion ? { x: 0 } : { x: -280 }}
              animate={{ x: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { x: -280 }}
              transition={{ duration: 0.2 }}
              className="w-72 max-w-[85vw] h-full overflow-y-auto shadow-2xl"
            >
              {renderSidebarContent(true)}
            </motion.div>
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
          </div>
        )}
      </AnimatePresence>

      {/* MAIN WORKSPACE */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Desktop Top Header matching Reference */}
        <header className="hidden md:flex items-center justify-between gap-4 px-6 lg:px-8 pt-5 pb-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[#FFF3EC] border border-[#FADAC1] text-[#F95700] flex items-center justify-center shrink-0 shadow-xs">
              <PageIcon className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[22px] lg:text-[24px] font-extrabold text-[#111827] tracking-tight leading-tight truncate">
                {currentMeta.title}
              </h1>
              <p className="text-xs text-slate-500 truncate mt-0.5">{currentMeta.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {currentBusiness?.slug && (
              <a
                href={`/b/${currentBusiness.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden xl:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-slate-200/80 shadow-[0_2px_8px_rgba(15,23,42,0.04)] hover:border-orange-300 hover:text-[#F95700] text-slate-600 text-xs font-bold transition"
              >
                <span>Live Booking Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            {trialInfo && subscription?.status === 'trialing' && (
              <button
                type="button"
                onClick={() => onSelectTab('subscription')}
                className={`hidden xl:inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold border shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition ${
                  trialInfo.isExpired
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-white text-orange-700 border-orange-200 hover:bg-orange-50'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {trialInfo.isExpired ? 'Trial Expired' : `${trialInfo.daysRemaining}d Trial Left`}
                </span>
              </button>
            )}

            <NotificationsDropdown onOpenAppointments={() => onSelectTab('appointments')} />

            {/* Profile Pill Dropdown */}
            <div ref={profileMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                aria-expanded={profileMenuOpen}
                className="flex items-center gap-2.5 pl-1.5 pr-3.5 py-1.5 rounded-full bg-white border border-slate-200/80 shadow-[0_2px_8px_rgba(15,23,42,0.05)] hover:border-orange-200 transition"
              >
                <div className="w-8 h-8 rounded-full bg-[#F95700] text-white font-extrabold flex items-center justify-center text-xs shrink-0">
                  {ownerInitial}
                </div>
                <div className="text-left">
                  <p className="text-xs font-extrabold text-[#111827] leading-tight">
                    {profile?.full_name || 'Business Owner'}
                  </p>
                  <p className="text-[10px] font-semibold text-slate-500 leading-tight mt-0.5">
                    Business Owner
                  </p>
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                    profileMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              <AnimatePresence>
                {profileMenuOpen && (
                  <motion.div
                    initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
                    transition={{ duration: 0.14 }}
                    className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200/90 z-50 p-2 text-left"
                  >
                    <div className="px-3 py-2 border-b border-slate-100 mb-1">
                      <p className="text-xs font-extrabold text-[#111827] truncate">
                        {profile?.full_name || 'Business Owner'}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{profile?.email}</p>
                    </div>
                    {currentBusiness?.slug && (
                      <a
                        href={`/b/${currentBusiness.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setProfileMenuOpen(false)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <span>Open Booking Page</span>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        onSelectTab('business-profile');
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Business Profile
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        onSelectTab('settings');
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Settings
                    </button>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        handleLogout();
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50"
                    >
                      Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Mobile Page Title Strip */}
        <div className="md:hidden px-4 pt-3.5 pb-1 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#FFF3EC] border border-[#FADAC1] text-[#F95700] flex items-center justify-center shrink-0">
            <PageIcon className="w-4 h-4 stroke-[2.2]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-[#111827] truncate">{currentMeta.title}</h2>
            <p className="text-[11px] text-slate-500 truncate">{currentMeta.subtitle}</p>
          </div>
        </div>

        {/* Content Body */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 pb-8 pt-2 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};