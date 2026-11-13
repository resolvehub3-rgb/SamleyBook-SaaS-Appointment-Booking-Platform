import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BusinessProvider, useBusiness } from './context/BusinessContext';
import { NotificationProvider } from './context/NotificationContext';
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
import { CheckCircle2, X } from 'lucide-react';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { DatabaseSetupBanner } from './components/common/DatabaseSetupBanner';
import { SamleyLogo } from './components/common/SamleyLogo';
import { SubscriptionLockScreen } from './components/dashboard/SubscriptionLockScreen';
import {
  mapDashboardTabToAppPath,
  normalizeRoutePath,
  resolveRouteAccess,
} from './utils/app-routing';
import { isStandalonePWA } from './utils/session-cleanup';
import { shouldLockBusinessWorkspace } from './utils/subscription-access';
import {
  POST_LOGIN_REDIRECT_STORAGE_KEY,
  extractInternalNotificationRedirect,
} from './utils/notifications';

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
  const {
    businesses,
    subscription,
    subscriptionLoading,
    isLoading: businessLoading,
    refreshSubscription,
  } = useBusiness();

  const [currentPath, setCurrentPath] = useState<string>(() => {
    return normalizeRoutePath(window.location.pathname || '/');
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [createBusinessModalOpen, setCreateBusinessModalOpen] = useState(false);
  const [renewalSuccessBanner, setRenewalSuccessBanner] = useState(false);
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
    const rawTarget = pathOrRoute.startsWith('/') ? pathOrRoute : `/${pathOrRoute}`;
    const qIndex = rawTarget.indexOf('?');
    const pathPart = qIndex >= 0 ? rawTarget.slice(0, qIndex) : rawTarget;
    const searchPart = qIndex >= 0 ? rawTarget.slice(qIndex) : '';
    const normalized = normalizeRoutePath(pathPart);
    const fullTarget = `${normalized}${searchPart}`;

    if (`${window.location.pathname}${window.location.search}` !== fullTarget) {
      if (options?.replace) {
        window.history.replaceState({}, '', fullTarget);
      } else {
        window.history.pushState({}, '', fullTarget);
      }
      window.dispatchEvent(new CustomEvent('samley_location_change', { detail: fullTarget }));
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
      window.dispatchEvent(
        new CustomEvent('samley_location_change', {
          detail: `${window.location.pathname}${window.location.search}`,
        })
      );
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

  // Synchronize URL bar cleanly whenever a redirect guard fires (and preserve notification deep link before login redirect)
  useEffect(() => {
    if (decision.kind === 'redirect' && decision.to !== currentPath) {
      if (decision.to === '/app/login' && !user) {
        const candidate = extractInternalNotificationRedirect(
          `${window.location.pathname}${window.location.search}`
        );
        if (
          candidate &&
          candidate !== '/app' &&
          candidate !== '/app/login' &&
          candidate !== '/app/register'
        ) {
          try {
            window.sessionStorage.setItem(POST_LOGIN_REDIRECT_STORAGE_KEY, candidate);
          } catch {
            // ignore storage errors
          }
        }
      }
      window.history.replaceState({}, '', decision.to);
      setCurrentPath(decision.to);
    }
  }, [decision, currentPath, user]);

  // Ensure URL bar matches canonical normalized path while preserving deep-link query params
  useEffect(() => {
    const raw = window.location.pathname || '/';
    const normalized = normalizeRoutePath(raw);
    if (raw !== normalized && decision.kind !== 'redirect') {
      window.history.replaceState({}, '', `${normalized}${window.location.search}`);
    }
  }, [currentPath, decision.kind]);

  const isDashboardRoute =
    decision.kind === 'render' && decision.target === 'dashboard';

  const workspaceLockState = isDashboardRoute
    ? shouldLockBusinessWorkspace({
        userRole: profile?.role,
        userEmail: user?.email,
        businessLoading,
        hasAnyBusiness: businesses.length > 0,
        subscriptionLoading,
        subscription,
      })
    : null;

  // Re-verify subscription status on protected route navigation
  useEffect(() => {
    if (isDashboardRoute) {
      void refreshSubscription();
    }
  }, [currentPath, isDashboardRoute, refreshSubscription]);

  // Redirect locked business routes cleanly to /app/subscription
  useEffect(() => {
    if (workspaceLockState?.decision === 'locked' && currentPath !== '/app/subscription') {
      window.history.replaceState({}, '', '/app/subscription');
      setCurrentPath('/app/subscription');
    }
  }, [workspaceLockState?.decision, currentPath]);

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

    // Wait for business & authoritative subscription verification before rendering protected dashboard
    if (workspaceLockState?.decision === 'loading') {
      return (
        <>
          <BusinessSessionLoadingScreen />
          <OfflineIndicator />
        </>
      );
    }

    // Hard lockout when trial or paid subscription is expired / blocked (no sidebar, no dashboard behind it)
    if (workspaceLockState?.decision === 'locked') {
      return (
        <>
          <DatabaseSetupBanner />
          <SubscriptionLockScreen
            onSignOut={handleExpiredSignOut}
            onUnlocked={() => {
              setRenewalSuccessBanner(true);
              navigateTo('/app/dashboard', { replace: true });
            }}
          />
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
          onNavigateToUrl={(url) => navigateTo(url)}
          onLoggedOut={replaceToLogin}
          onOpenCreateBusinessModal={() => setCreateBusinessModalOpen(true)}
        >
          {renewalSuccessBanner && (
            <div className="mb-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Subscription Renewed!</strong> Your SamleyBook Premium workspace is now unlocked for 30 days.
                </span>
              </div>
              <button
                type="button"
                aria-label="Dismiss renewal confirmation"
                onClick={() => setRenewalSuccessBanner(false)}
                className="p-1 rounded-lg hover:bg-emerald-100 text-emerald-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
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

function AppWithNotifications() {
  const navRef = useRef<(url: string) => void>(() => {});
  return (
    <NotificationProvider onNavigateToRoute={(url) => navRef.current(url)}>
      <AppRouterWithNavRef navRef={navRef} />
    </NotificationProvider>
  );
}

function AppRouterWithNavRef({
  navRef,
}: {
  navRef: React.MutableRefObject<(url: string) => void>;
}) {
  useEffect(() => {
    navRef.current = (url: string) => {
      const target = extractInternalNotificationRedirect(url) || '/app/dashboard';
      if (`${window.location.pathname}${window.location.search}` !== target) {
        window.history.pushState({}, '', target);
      }
      window.dispatchEvent(new PopStateEvent('popstate'));
    };
  }, [navRef]);

  return <AppRouter />;
}

export default function App() {
  return (
    <AuthProvider>
      <BusinessProvider>
        <AppWithNotifications />
      </BusinessProvider>
    </AuthProvider>
  );
}
