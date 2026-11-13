import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Building2,
  ClipboardCheck,
  CalendarDays,
  CreditCard,
  Receipt,
  MessageSquare,
  Settings,
  ShieldAlert,
  Activity,
  LogOut,
  Menu,
  X,
  Search,
  Bell,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { ADMIN_SECTION_META, AdminSectionId } from './AdminTokens';

export interface AdminNotificationItem {
  id: string;
  title: string;
  detail: string;
  tone: 'warning' | 'danger' | 'info';
  targetSection: AdminSectionId;
}

interface NavItem {
  id: AdminSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeCount?: number;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

interface AdminLayoutProps {
  activeSection: AdminSectionId;
  onSelectSection: (section: AdminSectionId) => void;
  onSignOut: () => void;
  adminName: string;
  adminEmail: string;
  globalSearch: string;
  onGlobalSearchChange: (q: string) => void;
  onGlobalSearchSubmit: (q: string) => void;
  notifications: AdminNotificationItem[];
  pendingRegistrationsCount: number;
  failedSmsCount: number;
  onRefreshAll: () => void;
  isRefreshing: boolean;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  activeSection,
  onSelectSection,
  onSignOut,
  adminName,
  adminEmail,
  globalSearch,
  onGlobalSearchChange,
  onGlobalSearchSubmit,
  notifications,
  pendingRegistrationsCount,
  failedSmsCount,
  onRefreshAll,
  isRefreshing,
  children,
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        setNotificationsOpen(false);
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const navGroups: NavGroup[] = [
    {
      group: 'OVERVIEW',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
    },
    {
      group: 'PLATFORM MANAGEMENT',
      items: [
        { id: 'businesses', label: 'Business Overview', icon: Building2 },
        {
          id: 'registrations',
          label: 'Business Registrations',
          icon: ClipboardCheck,
          badgeCount: pendingRegistrationsCount > 0 ? pendingRegistrationsCount : undefined,
        },
        { id: 'appointments', label: 'Appointment Management', icon: CalendarDays },
      ],
    },
    {
      group: 'FINANCIAL MANAGEMENT',
      items: [
        { id: 'subscriptions', label: 'Business Subscriptions', icon: CreditCard },
        { id: 'payments', label: 'Payment Records', icon: Receipt },
      ],
    },
    {
      group: 'COMMUNICATION',
      items: [
        {
          id: 'sms',
          label: 'SMS Management',
          icon: MessageSquare,
          badgeCount: failedSmsCount > 0 ? failedSmsCount : undefined,
        },
      ],
    },
    {
      group: 'SYSTEM ADMINISTRATION',
      items: [
        { id: 'settings', label: 'Platform Settings', icon: Settings },
        { id: 'audit', label: 'Security & Audit Logs', icon: ShieldAlert },
        { id: 'monitoring', label: 'System Monitoring', icon: Activity },
      ],
    },
  ];

  const meta = ADMIN_SECTION_META[activeSection];
  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const handleNavClick = (id: AdminSectionId) => {
    onSelectSection(id);
    setMobileMenuOpen(false);
  };

  const renderNavContent = (collapsed: boolean) => (
    <div className="flex flex-col h-full">
      {/* Brand Header */}
      <div
        className={`flex items-center ${
          collapsed ? 'justify-center px-3' : 'justify-between px-5'
        } py-5 border-b border-white/10 shrink-0`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#E87936] p-1.5 flex items-center justify-center shadow-sm shrink-0">
            <img
              src="/assets/aistudio/logo1_6de85ee8.png"
              alt="SamleyBook Logo"
              className="w-full h-full object-contain rounded-lg bg-white p-0.5"
            />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-base font-extrabold text-white tracking-tight leading-tight truncate">
                SamleyBook
              </p>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#E87936] mt-0.5">
                SUPER ADMIN
              </p>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(true)}
            className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {collapsed && (
        <div className="hidden lg:flex justify-center py-2 border-b border-white/5">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Super Admin Navigation">
        {navGroups.map((group) => (
          <div key={group.group} className="space-y-1">
            {!collapsed && (
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400/80">
                {group.group}
              </p>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center ${
                    collapsed ? 'justify-center px-2 py-2.5' : 'justify-between px-3 py-2.5'
                  } rounded-xl text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-[#E87936] text-white shadow-sm'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-300'}`} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </span>
                  {!collapsed && item.badgeCount !== undefined && (
                    <span
                      className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                        isActive ? 'bg-white text-[#E87936]' : 'bg-[#E87936]/20 text-[#E87936]'
                      }`}
                    >
                      {item.badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer Sign Out */}
      <div className="p-3 border-t border-white/10 shrink-0">
        <button
          type="button"
          onClick={onSignOut}
          title={collapsed ? 'Sign Out' : undefined}
          className={`w-full flex items-center ${
            collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
          } rounded-xl text-xs font-semibold text-slate-300 hover:bg-red-500/15 hover:text-red-300 transition-colors`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  const initials = (adminName || adminEmail || 'SA')
    .replace(/[^A-Za-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || 'SA';

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#14243B] flex font-sans">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 bg-[#14243B] border-r border-[#1e3352] sticky top-0 h-screen transition-all duration-200 ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {renderNavContent(sidebarCollapsed)}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#14243B]/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-[#14243B] h-full flex flex-col shadow-2xl z-10">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              aria-label="Close navigation menu"
            >
              <X className="w-5 h-5" />
            </button>
            {renderNavContent(false)}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Executive Top Header */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200/80 px-4 sm:px-6 py-3.5">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-xl border border-slate-200 text-[#14243B] hover:bg-slate-50 transition shrink-0"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-[#14243B] tracking-tight truncate">
                  {meta.title}
                </h1>
                <p className="hidden sm:block text-xs text-slate-500 truncate">{meta.subtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Global Search */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (globalSearch.trim()) {
                    onGlobalSearchSubmit(globalSearch.trim());
                  }
                }}
                className="hidden md:flex items-center relative"
              >
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={globalSearch}
                  onChange={(e) => onGlobalSearchChange(e.target.value)}
                  placeholder="Search businesses or bookings..."
                  className="w-56 xl:w-72 pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-[#F5F6F8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E87936]/30 focus:border-[#E87936] transition"
                />
              </form>

              {/* Current Date Pill */}
              <div className="hidden xl:flex items-center px-3 py-2 rounded-xl bg-[#F5F6F8] border border-slate-200/80 text-[11px] font-semibold text-slate-600">
                {todayLabel}
              </div>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={onRefreshAll}
                disabled={isRefreshing}
                title="Refresh platform data"
                aria-label="Refresh platform data"
                className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-[#14243B] hover:bg-slate-50 transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>

              {/* Notifications Dropdown */}
              <div className="relative" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((prev) => !prev)}
                  className="relative p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-[#14243B] hover:bg-slate-50 transition"
                  aria-label="Platform notifications"
                >
                  <Bell className="w-4 h-4" />
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E87936] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {notifications.length}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden z-40">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-bold text-[#14243B]">Actionable Platform Alerts</span>
                      <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                        {notifications.length} active
                      </span>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">
                          No urgent alerts right now.
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => {
                              onSelectSection(n.targetSection);
                              setNotificationsOpen(false);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-slate-50 transition flex items-start gap-2.5"
                          >
                            <span
                              className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                                n.tone === 'danger'
                                  ? 'bg-red-500'
                                  : n.tone === 'warning'
                                  ? 'bg-amber-500'
                                  : 'bg-blue-500'
                              }`}
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#14243B]">{n.title}</p>
                              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{n.detail}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Admin Profile Dropdown */}
              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((prev) => !prev)}
                  className="flex items-center gap-2 p-1 sm:pl-1.5 sm:pr-2.5 sm:py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition"
                  aria-label="Super Admin profile menu"
                >
                  <div className="w-7 h-7 rounded-lg bg-[#14243B] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                    {initials}
                  </div>
                  <div className="hidden sm:block text-left leading-tight">
                    <p className="text-xs font-bold text-[#14243B] truncate max-w-[120px]">{adminName}</p>
                    <p className="text-[10px] font-semibold text-slate-500">Super Admin</p>
                  </div>
                  <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-slate-400" />
                </button>

                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-60 rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden z-40">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <p className="text-xs font-bold text-[#14243B] truncate">{adminName}</p>
                      <p className="text-[11px] text-slate-500 truncate">{adminEmail}</p>
                    </div>
                    <div className="p-1.5 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSection('settings');
                          setProfileMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <Settings className="w-3.5 h-3.5 text-slate-500" />
                        <span>Platform Settings</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSection('audit');
                          setProfileMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
                        <span>Security & Audit Logs</span>
                      </button>
                      <button
                        type="button"
                        onClick={onSignOut}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Workspace Body */}
        <main className="flex-1 p-4 sm:p-6">
          <div className="max-w-[1440px] mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};
