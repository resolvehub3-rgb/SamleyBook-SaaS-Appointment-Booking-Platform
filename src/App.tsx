import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BusinessProvider, useBusiness } from './context/BusinessContext';
import { MarketingNav } from './components/marketing/MarketingNav';
import { MarketingPage } from './components/marketing/MarketingPage';
import { LoginPage } from './components/auth/LoginPage';
import { RegisterPage } from './components/auth/RegisterPage';
import { DashboardLayout, DashboardTab } from './components/dashboard/DashboardLayout';
import { OverviewView } from './components/dashboard/OverviewView';
import { ServicesView } from './components/dashboard/ServicesView';
import { AppointmentsView } from './components/dashboard/AppointmentsView';
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
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { DatabaseSetupBanner } from './components/common/DatabaseSetupBanner';

function AppRouter() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const { businesses, isLoading: businessLoading } = useBusiness();

  // Route state
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return window.location.pathname || '/';
  });

  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('overview');
  const [createBusinessModalOpen, setCreateBusinessModalOpen] = useState(false);

  // Sync with browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (pathOrSlug: string) => {
    let target = pathOrSlug.startsWith('/') ? pathOrSlug : `/${pathOrSlug}`;
    if (target === '/home') target = '/';

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

  // 2. AUTHENTICATION PAGES
  if (currentPath === '/login') {
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
  if (currentPath.startsWith('/admin')) {
    if (authLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-900 text-white text-xs">
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
        <SuperAdminDashboard onNavigateHome={() => navigateTo('/')} />
        <OfflineIndicator />
      </>
    );
  }

  // 4. BUSINESS OWNER DASHBOARD: /dashboard
  if (currentPath.startsWith('/dashboard')) {
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

    // Render tab views
    const renderTabView = () => {
      switch (dashboardTab) {
        case 'overview':
          return <OverviewView onSelectTab={setDashboardTab} />;
        case 'services':
          return <ServicesView />;
        case 'appointments':
          return <AppointmentsView />;
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
          onOpenCreateBusinessModal={() => setCreateBusinessModalOpen(false)}
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
