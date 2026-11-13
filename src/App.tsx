import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BusinessProvider, useBusiness } from './context/BusinessContext';
import { MarketingLayout } from './components/marketing/MarketingLayout';
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
import { SamleyLogo } from './components/common/SamleyLogo';
import {
  mapDashboardTabToAppPath,
  normalizeRoutePath,
  resolveRouteAccess,
} from './utils/app-routing';
import { isStandalonePWA } from './utils/session-cleanup';

function BusinessSessionLoadingScreen() {
  return (
    <div
      className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4 text-center"
      data-testid="business-auth-loading"
    >
      <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-lg px-8 py-9 max-w-sm w-full space-y-4">
        <div className="flex justify-center">
          <SamleyLogo size="md" showAttribution={false} />
        </div>
        <div className="w-8 h-8 rounded-full border-[3px] border-orange-600 border-t-transparent animate-spin mx-auto" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-zinc-900">Restoring Business Session</p>
          <p className="text-xs text-zinc-500">
            Verifying your SamleyBook credentials...
          </p>
        </div>
      </div>
    </div>
  );
}

function AppRouter() {
  const {
    user,
    profile,
    isLoading: authLoading,
    profileLoading,
    sessionExpired,
    clearSessionExpired,
    signOut,
  } = useAuth();
  const { subscription } = useBusiness();

  const [currentPath, setCurrentPath] = useState<string>(() => {
    return normalizeRoutePath(window.location.pathname || '/');
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [createBusinessModalOpen, setCreateBusinessModalOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => isStandalonePWA());

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(display-mode: standalone)');
    const syncStandalone = () => setIsStandalone(isStandalonePWA());
    syncStandalone();
    mq.addEventListener?.('change', syncStandalone);
    return () => mq.removeEventListener?.('change', syncStandalone);
  }, []);

  const navigateTo = useCallback((pathOrRoute: string, options?: { replace?: boolean }) => {
    const normalized = normalizeRoutePath(
      pathOrRoute.startsWith('/') ? pathOrRoute : `/${pathOrRoute}`
    );
    if (window.location.pathname !== normalized) {
      if (options?.replace) {
        window.history.replaceState({}, '', normalized);
      } else {
        window.history.pushState({}, '', normalized);
      }
    }
    setCurrentPath(normalized);
    if (!options?.replace) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const replaceToLogin = useCallback(() => {
    window.history.replaceState({}, '', '/app/login');
    setCurrentPath('/app/login');
  }, []);

  // Sync with browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(normalizeRoutePath(window.location.pathname || '/'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const decision = resolveRouteAccess({
    path: currentPath,
    authLoading,
    profileLoading,
    isAuthenticated: !!user,
    userRole: profile?.role,
    userEmail: user?.email,
    isStandalone,
    isRegistering,
  });

  // Synchronize URL bar cleanly whenever a redirect guard fires (using replaceState to prevent back-button leaks)
  useEffect(() => {
    if (decision.kind === 'redirect' && decision.to !== currentPath) {
      window.history.replaceState({}, '', decision.to);
      setCurrentPath(decision.to);
    }
  }, [decision, currentPath]);

  // Ensure URL bar matches canonical normalized path (e.g. legacy /login -> /app/login)
  useEffect(() => {
    const raw = window.location.pathname || '/';
    const normalized = normalizeRoutePath(raw);
    if (raw !== normalized && decision.kind !== 'redirect') {
      window.history.replaceState({}, '', normalized);
    }
  }, [currentPath, decision.kind]);

  // 1. STANDALONE PUBLIC CUSTOMER BOOKING & FEEDBACK PORTALS
  if (decision.kind === 'render' && decision.target === 'booking') {
    const slug = currentPath.replace('/b/', '').split('/')[0];
    return (
      <>
        <DatabaseSetupBanner />
        <PublicBookingPage businessSlug={slug} />
        <OfflineIndicator />
      </>
    );
  }

  if (decision.kind === 'render' && decision.target === 'feedback') {
    const token = currentPath.replace('/feedback/', '').split('/')[0];
    return (
      <>
        <DatabaseSetupBanner />
        <FeedbackPage token={token} />
        <OfflineIndicator />
      </>
    );
  }

  // 2. SESSION RESTORATION / REDIRECT IN-FLIGHT SPLASH (prevents login or dashboard flash)
  if (decision.kind === 'redirect' || (decision.kind === 'render' && decision.target === 'loading')) {
    return (
      <>
        <BusinessSessionLoadingScreen />
        <OfflineIndicator />
      </>
    );
  }

  // 3. BUSINESS APPLICATION AUTHENTICATION PAGES (/app/login & /app/register)
  if (decision.target === 'login') {
    return (
      <>
        <DatabaseSetupBanner />
        <LoginPage
          onNavigate={(route) => navigateTo(route, { replace: route.startsWith('/app/dashboard') || route.startsWith('/app/admin') })}
          sessionExpired={sessionExpired}
          onDismissSessionExpired={clearSessionExpired}
        />
        <OfflineIndicator />
      </>
    );
  }

  if (decision.target === 'register') {
    return (
      <>
        <DatabaseSetupBanner />
        <RegisterPage
          onNavigate={(route) => navigateTo(route, { replace: route.startsWith('/app/dashboard') })}
          onRegistrationStateChange={setIsRegistering}
        />
        <OfflineIndicator />
      </>
    );
  }

  // 4. SUPER ADMIN WORKSPACE (/app/admin)
  if (decision.target === 'admin') {
    return (
      <>
        <DatabaseSetupBanner />
        <SuperAdminDashboard
          onNavigate={(route) => navigateTo(route)}
          onLoggedOut={replaceToLogin}
        />
        <OfflineIndicator />
      </>
    );
  }

  // 5. AUTHENTICATED BUSINESS OWNER WORKSPACE (/app/dashboard, /app/appointments, etc.)
  if (decision.target === 'dashboard') {
    const activeTab: DashboardTab = decision.tab || 'dashboard';

    const handleSelectTab = (tab: DashboardTab) => {
      navigateTo(mapDashboardTabToAppPath(tab));
    };

    const handleExpiredSignOut = async () => {
      await signOut();
      replaceToLogin();
    };

    // Subscription expired: lock dashboard to renewal view + sign out back to /app/login
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
                type="button"
                onClick={handleExpiredSignOut}
                className="px-4 py-2 rounded-xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Sign Out
              </button>
            </div>
          </div>
          <OfflineIndicator />
        </>
      );
    }

    const renderTabView = () => {
      switch (activeTab) {
        case 'dashboard':
          return <DashboardView onSelectTab={handleSelectTab} />;
        case 'overview':
          return <OverviewView onSelectTab={handleSelectTab} />;
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
          return <DashboardView onSelectTab={handleSelectTab} />;
      }
    };

    return (
      <>
        <DatabaseSetupBanner />
        <DashboardLayout
          currentTab={activeTab}
          onSelectTab={handleSelectTab}
          onLoggedOut={replaceToLogin}
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

  // 6. PUBLIC MARKETING WEBSITE (/, /features, /pricing, /about, /faq, /contact)
  return (
    <>
      <DatabaseSetupBanner />
      <MarketingLayout
        currentSection={decision.marketingSection || 'home'}
        onNavigate={(route) => navigateTo(route)}
      >
        <MarketingPage
          onNavigate={(route) => navigateTo(route)}
          initialSection={decision.marketingSection}
        />
      </MarketingLayout>
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
