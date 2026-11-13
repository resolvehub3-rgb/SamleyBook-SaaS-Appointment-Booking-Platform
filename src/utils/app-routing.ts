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

export const APP_TAB_ROUTES: Record<DashboardTab, string> = {
  overview: '/app/overview',
  dashboard: '/app/dashboard',
  services: '/app/services',
  appointments: '/app/appointments',
  feedback: '/app/feedback',
  customers: '/app/customers',
  payments: '/app/payments',
  'payment-config': '/app/payment-config',
  'booking-page': '/app/booking-page',
  subscription: '/app/subscription',
  'business-profile': '/app/business-profile',
  settings: '/app/settings',
};

const DASHBOARD_PATH_TO_TAB: Record<string, DashboardTab> = {
  '/app/dashboard': 'dashboard',
  '/app/overview': 'overview',
  '/app/services': 'services',
  '/app/appointments': 'appointments',
  '/app/feedback': 'feedback',
  '/app/customers': 'customers',
  '/app/payments': 'payments',
  '/app/payment-config': 'payment-config',
  '/app/booking-page': 'booking-page',
  '/app/subscription': 'subscription',
  '/app/business-profile': 'business-profile',
  '/app/settings': 'settings',
  // Sub-path aliases under /app/dashboard/*
  '/app/dashboard/overview': 'overview',
  '/app/dashboard/services': 'services',
  '/app/dashboard/appointments': 'appointments',
  '/app/dashboard/feedback': 'feedback',
  '/app/dashboard/customers': 'customers',
  '/app/dashboard/payments': 'payments',
  '/app/dashboard/payment-config': 'payment-config',
  '/app/dashboard/booking-page': 'booking-page',
  '/app/dashboard/subscription': 'subscription',
  '/app/dashboard/business-profile': 'business-profile',
  '/app/dashboard/settings': 'settings',
};

export const MARKETING_SECTION_ROUTES: Record<string, string> = {
  '/': 'home',
  '/home': 'home',
  '/features': 'features',
  '/how-it-works': 'how-it-works',
  '/about': 'about',
  '/pricing': 'pricing',
  '/faq': 'faq',
  '/contact': 'contact',
};

export const SUPER_ADMIN_EMAIL = 'samleybook@gmail.com';

export function stripQueryAndHash(rawPath: string): string {
  const withoutHash = rawPath.split('#')[0] || '';
  const withoutQuery = withoutHash.split('?')[0] || '';
  return withoutQuery || '/';
}

export function normalizeRoutePath(rawPath: string): string {
  const cleaned = stripQueryAndHash(rawPath.trim());
  const withLeadingSlash = cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  const trimmed =
    withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')
      ? withLeadingSlash.slice(0, -1)
      : withLeadingSlash;

  if (trimmed === '/home') return '/';
  if (trimmed === '/login') return '/app/login';
  if (trimmed === '/register') return '/app/register';
  if (trimmed === '/dashboard') return '/app/dashboard';
  if (trimmed === '/overview') return '/app/overview';
  if (trimmed === '/admin') return '/app/admin';
  if (trimmed.startsWith('/admin/')) return trimmed.replace('/admin/', '/app/admin/');
  return trimmed || '/';
}

export function isBusinessAppRoute(rawPath: string): boolean {
  const path = normalizeRoutePath(rawPath);
  return path === '/app' || path.startsWith('/app/');
}

export function isPublicBookingOrFeedbackRoute(rawPath: string): boolean {
  const path = normalizeRoutePath(rawPath);
  return path.startsWith('/b/') || path.startsWith('/feedback/');
}

export function isMarketingRoute(rawPath: string): boolean {
  const path = normalizeRoutePath(rawPath);
  return !isBusinessAppRoute(path) && !isPublicBookingOrFeedbackRoute(path);
}

export function mapAppPathToDashboardTab(rawPath: string): DashboardTab | null {
  const path = normalizeRoutePath(rawPath);
  return DASHBOARD_PATH_TO_TAB[path] ?? null;
}

export function mapDashboardTabToAppPath(tab: DashboardTab): string {
  return APP_TAB_ROUTES[tab] || '/app/dashboard';
}

export function getAuthenticatedHomePath(
  userRole: string | null | undefined,
  userEmail?: string | null
): '/app/admin' | '/app/dashboard' {
  const isSuperAdmin =
    userRole === 'super_admin' ||
    (userEmail || '').toLowerCase().trim() === SUPER_ADMIN_EMAIL;
  return isSuperAdmin ? '/app/admin' : '/app/dashboard';
}

export interface RouteAccessInput {
  path: string;
  authLoading: boolean;
  profileLoading: boolean;
  isAuthenticated: boolean;
  userRole: string | null | undefined;
  userEmail?: string | null;
  isStandalone: boolean;
  isRegistering?: boolean;
}

export type RouteAccessDecision =
  | {
      kind: 'render';
      target: 'loading' | 'booking' | 'feedback' | 'login' | 'register' | 'admin' | 'dashboard' | 'marketing';
      tab?: DashboardTab;
      marketingSection?: string;
    }
  | {
      kind: 'redirect';
      to: string;
    };

export function resolveRouteAccess(input: RouteAccessInput): RouteAccessDecision {
  const path = normalizeRoutePath(input.path);

  // 1. Standalone customer booking & feedback portals remain publicly accessible by direct link
  if (path.startsWith('/b/')) {
    return { kind: 'render', target: 'booking' };
  }
  if (path.startsWith('/feedback/')) {
    return { kind: 'render', target: 'feedback' };
  }

  // 2. Installed standalone PWA safety guard:
  //    The installed PWA must NEVER render the public marketing website.
  if (input.isStandalone && !isBusinessAppRoute(path)) {
    if (input.authLoading) {
      return { kind: 'render', target: 'loading' };
    }
    if (!input.isAuthenticated) {
      return { kind: 'redirect', to: '/app/login' };
    }
    const isAdminEmail = (input.userEmail || '').toLowerCase().trim() === SUPER_ADMIN_EMAIL;
    if (input.profileLoading && !isAdminEmail) {
      return { kind: 'render', target: 'loading' };
    }
    return { kind: 'redirect', to: getAuthenticatedHomePath(input.userRole, input.userEmail) };
  }

  // 3. Business Application (/app/* namespace)
  if (isBusinessAppRoute(path)) {
    // Wait cleanly during initial session restoration so neither login form nor protected view flashes
    if (input.authLoading) {
      return { kind: 'render', target: 'loading' };
    }

    // Unauthenticated visitors inside /app/*
    if (!input.isAuthenticated) {
      if (path === '/app/login') {
        return { kind: 'render', target: 'login' };
      }
      if (path === '/app/register') {
        return { kind: 'render', target: 'register' };
      }
      return { kind: 'redirect', to: '/app/login' };
    }

    // Authenticated user inside /app/*
    const isAdminEmail = (input.userEmail || '').toLowerCase().trim() === SUPER_ADMIN_EMAIL;
    const homeDest = getAuthenticatedHomePath(input.userRole, input.userEmail);

    // Entry point /app or /app/login: wait for role resolution (if needed) then redirect straight to dashboard/admin
    if (path === '/app' || path === '/app/login') {
      if (input.profileLoading && !isAdminEmail) {
        return { kind: 'render', target: 'loading' };
      }
      return { kind: 'redirect', to: homeDest };
    }

    // Registration route: allow an active multi-step registration to complete Stage 2 cleanly
    if (path === '/app/register') {
      if (input.isRegistering) {
        return { kind: 'render', target: 'register' };
      }
      if (input.profileLoading && !isAdminEmail) {
        return { kind: 'render', target: 'loading' };
      }
      return { kind: 'redirect', to: homeDest };
    }

    // Super Admin workspace
    if (path === '/app/admin' || path.startsWith('/app/admin/')) {
      if (input.profileLoading && !isAdminEmail) {
        return { kind: 'render', target: 'loading' };
      }
      return { kind: 'render', target: 'admin' };
    }

    // Business Owner Dashboard module routes
    const tab = mapAppPathToDashboardTab(path);
    if (tab) {
      return { kind: 'render', target: 'dashboard', tab };
    }

    // Any unknown /app/* route redirects to the user's authorized app home
    if (input.profileLoading && !isAdminEmail) {
      return { kind: 'render', target: 'loading' };
    }
    return { kind: 'redirect', to: homeDest };
  }

  // 4. Public Marketing Website (/, /features, /pricing, /about, /contact, /faq)
  const marketingSection = MARKETING_SECTION_ROUTES[path] || 'home';
  return {
    kind: 'render',
    target: 'marketing',
    marketingSection,
  };
}
