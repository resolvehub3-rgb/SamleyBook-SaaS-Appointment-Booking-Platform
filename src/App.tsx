import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BusinessProvider, useBusiness } from './context/BusinessContext';
import { MarketingNav } from './components/marketing/MarketingNav';
import { MarketingPage } from './components/marketing/MarketingPage';
import { LoginPage } from './components/auth/LoginPage';
import { RegisterPage } from './components/auth/RegisterPage';
import { DashboardLayout, DashboardTab } from './components/dashboard/DashboardLayout';
import { DashboardView } from './components/dashboard/DashboardView';
import { OverviewView } from './components/dashboard/OverviewView';
import { ServicesView } from './components/dashboard/ServicesView';
import { AppointmentsView } from './components/dashboard/AppointmentsView';
import { FeedbackView } from './components/dashboard/FeedbackView';
import { CustomersView } from './components/dashboard/CustomersView';
import { PaymentsView } from './components/dashboard/PaymentsView';
import { PaymentConfigView } from './components/dashboard/PaymentConfigView';
import { BookingQrView } from './components/dashboard/BookingQrView';
import { SubscriptionView } from './components/dashboard/SubscriptionView';
import { BusinessProfileView } from './components/dashboard/BusinessProfileView';
import { SettingsView } from './components/dashboard/SettingsView';
import { CreateBusinessModal } from './components/dashboard/CreateBusinessModal';
import { SuperAdminDashboard } from './components/admin/SuperAdminDashboard';
import { PublicBookingPage } from './components/booking/PublicBookingPage';
import { FeedbackPage } from './components/feedback/FeedbackPage';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { DatabaseSetupBanner } from './components/common/DatabaseSetupBanner';

function AppRouter() {
  const { user, profile, isLoading: authLoading, signOut } = useAuth();
  const { businesses, subscription, isLoading: businessLoading } = useBusiness();

  // Route state
  const normalizePath = (p: string) => {
    if (p === '/login') return '/app/login';
    if (p === '/dashboard') return '/app/dashboard';
    if (p.startsWith('/admin')) return p.replace('/admin', '/app/admin');
    return p || '/';
  };

  const [currentPath, setCurrentPath] = useState<string>(() => {
    return normalizePath(window.location.pathname || '/');
  });

  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('overview');
  const [createBusinessModalOpen, setCreateBusinessModalOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      setDashboardTab('overview');
    } else if (!authLoading && currentPath === '/app/login') {
      const dest = profile?.role === 'super_admin' ? '/app/admin' : '/app/dashboard';
      window.history.replaceState({}, '', dest);
      setCurrentPath(dest);
    }
  }, [user, authLoading, currentPath, profile?.role]);

  // Sync with browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(normalizePath(window.location.pathname || '/'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (pathOrSlug: string) => {
    let target = pathOrSlug.startsWith('/') ? pathOrSlug : `/${pathOrSlug}`;
    if (target === '/home') target = '/';
    if (target === '/login') target = '/app/login';
    if (target === '/dashboard') target = '/app/dashboard';
    if (target === '/admin') target = '/app/admin';
    if (target.startsWith('/admin/')) target = target.replace('/admin/', '/app/admin/');
    window.history.pushState({}, '', target);
    setCurrentPath(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 1. PUBLIC CUSTOMER BOOKING PAGE: /b/:slug
  if (currentPath.startsWith('/b/')) {
    const slug = currentPath.replace('/b/', '').split('/')[0];
    return (
      <>
        <DatabaseSetupBanner />
        <PublicBookingPage businessSlug={slug} />
        <OfflineIndicator />
      </>
    );
  }

  // 1b. PUBLIC FEEDBACK PAGE: /feedback/:token
  if (currentPath.startsWith('/feedback/')) {
    const token = currentPath.replace('/feedback/', '').split('/')[0];
    return (
      <>
        <DatabaseSetupBanner />
        <FeedbackPage token={token} />
        <OfflineIndicator />
      </>
    );
  }

  // 2. AUTHENTICATION PAGES
  if (currentPath === '/app/login') {
    return (
      <>
        <DatabaseSetupBanner />
        <LoginPage onNavigate={(route) => navigateTo(route)} />
        <OfflineIndicator />
      </>
    );
  }

  if (currentPath === '/register') {
    return (
      <>
        <DatabaseSetupBanner />
        <RegisterPage onNavigate={(route) => navigateTo(route)} />
        <OfflineIndicator />
      </>
    );
  }

  // 3. SUPER ADMIN DASHBOARD: /admin
  if (currentPath.startsWith('/app/admin')) {
    if (authLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#14243B] text-white text-xs font-semibold">
          Authenticating Super Admin...
        </div>
      );
    }

    if (!user) {
      return (
        <>
          <DatabaseSetupBanner />
          <LoginPage onNavigate={(route) => navigateTo(route)} />
        </>
      );
    }

    return (
      <>
        <DatabaseSetupBanner />
        <SuperAdminDashboard
          onNavigate={(route) => navigateTo(route)}
          onNavigateHome={() => navigateTo('/')}
        />
        <OfflineIndicator />
      </>
    );
  }

  // 4. BUSINESS OWNER DASHBOARD: /dashboard
  if (currentPath.startsWith('/app/dashboard')) {
    if (authLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 text-zinc-500 text-xs">
          Loading business portal...
        </div>
      );
    }

    if (!user) {
      return (
        <>
          <DatabaseSetupBanner />
          <LoginPage onNavigate={(route) => navigateTo(route)} />
        </>
      );
    }

    // Subscription expired: lock dashboard to renewal page only
    if (subscription?.status === 'expired') {
      return (
        <>
          <DatabaseSetupBanner />
          <div className="min-h-screen bg-[#F5F6FA] py-8 px-4">
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
                Your SamleyBook subscription has expired. Renew your subscription to regain access to your business dashboard and continue managing your appointments.
              </div>
              <SubscriptionView />
              <button
                onClick={() => signOut && signOut()}
                className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Logout
              </button>
            </div>
          </div>
          <OfflineIndicator />
        </>
      );
    }

    // Render tab views
    const renderTabView = () => {
      switch (dashboardTab) {
        case 'dashboard':
          return <DashboardView onSelectTab={setDashboardTab} />;
        case 'overview':
          return <OverviewView onSelectTab={setDashboardTab} />;
        case 'services':
          return <ServicesView />;
        case 'appointments':
          return <AppointmentsView />;
        case 'feedback':
          return <FeedbackView />;
        case 'customers':
          return <CustomersView />;
        case 'payments':
          return <PaymentsView />;
        case 'payment-config':
          return <PaymentConfigView />;
        case 'booking-page':
          return <BookingQrView />;
        case 'subscription':
          return <SubscriptionView />;
        case 'business-profile':
          return <BusinessProfileView />;
        case 'settings':
          return <SettingsView />;
        default:
          return <OverviewView onSelectTab={setDashboardTab} />;
      }
    };

    return (
      <>
        <DatabaseSetupBanner />
        <DashboardLayout
          currentTab={dashboardTab}
          onSelectTab={setDashboardTab}
          onNavigateHome={() => navigateTo('/')}
          onOpenCreateBusinessModal={() => setCreateBusinessModalOpen(true)}
        >
          {renderTabView()}
        </DashboardLayout>

        <CreateBusinessModal
          isOpen={createBusinessModalOpen}
          onClose={() => setCreateBusinessModalOpen(false)}
        />
        <OfflineIndicator />
      </>
    );
  }

  // 5. MARKETING WEBSITE (Default: /, /features, /pricing, /contact)
  return (
    <>
      <DatabaseSetupBanner />
      <MarketingNav
        onNavigate={(route) => navigateTo(route)}
        currentRoute={currentPath.replace('/', '') || 'home'}
      />
      <MarketingPage onNavigate={(route) => navigateTo(route)} />
      <OfflineIndicator />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BusinessProvider>
        <AppRouter />
      </BusinessProvider>
    </AuthProvider>
  );
}
