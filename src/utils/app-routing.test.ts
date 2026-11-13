import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRoutePath,
  isBusinessAppRoute,
  isMarketingRoute,
  mapAppPathToDashboardTab,
  mapDashboardTabToAppPath,
  resolveRouteAccess,
} from './app-routing.ts';

describe('app-routing path normalization and classification', () => {
  it('normalizes legacy routes into /app/* namespace and strips trailing slashes/query params', () => {
    assert.equal(normalizeRoutePath('/'), '/');
    assert.equal(normalizeRoutePath('/home'), '/');
    assert.equal(normalizeRoutePath('/login'), '/app/login');
    assert.equal(normalizeRoutePath('/register/'), '/app/register');
    assert.equal(normalizeRoutePath('/dashboard'), '/app/dashboard');
    assert.equal(normalizeRoutePath('/admin/businesses'), '/app/admin/businesses');
    assert.equal(normalizeRoutePath('/app/login?reason=session_expired'), '/app/login');
    assert.equal(normalizeRoutePath('/app/'), '/app');
  });

  it('clearly separates Marketing Website routes from Business Application routes', () => {
    assert.equal(isMarketingRoute('/'), true);
    assert.equal(isMarketingRoute('/features'), true);
    assert.equal(isMarketingRoute('/pricing'), true);
    assert.equal(isMarketingRoute('/about'), true);
    assert.equal(isMarketingRoute('/contact'), true);
    assert.equal(isMarketingRoute('/faq'), true);

    assert.equal(isBusinessAppRoute('/'), false);
    assert.equal(isBusinessAppRoute('/app'), true);
    assert.equal(isBusinessAppRoute('/app/login'), true);
    assert.equal(isBusinessAppRoute('/app/register'), true);
    assert.equal(isBusinessAppRoute('/app/dashboard'), true);
    assert.equal(isBusinessAppRoute('/app/appointments'), true);
    assert.equal(isBusinessAppRoute('/app/admin'), true);
    assert.equal(isBusinessAppRoute('/b/royal-cuts'), false);
  });

  it('maps real SamleyBook modules bidirectionally between /app/* routes and DashboardTab', () => {
    assert.equal(mapAppPathToDashboardTab('/app/dashboard'), 'dashboard');
    assert.equal(mapAppPathToDashboardTab('/app/overview'), 'overview');
    assert.equal(mapAppPathToDashboardTab('/app/appointments'), 'appointments');
    assert.equal(mapAppPathToDashboardTab('/app/services'), 'services');
    assert.equal(mapAppPathToDashboardTab('/app/customers'), 'customers');
    assert.equal(mapAppPathToDashboardTab('/app/payments'), 'payments');
    assert.equal(mapAppPathToDashboardTab('/app/payment-config'), 'payment-config');
    assert.equal(mapAppPathToDashboardTab('/app/booking-page'), 'booking-page');
    assert.equal(mapAppPathToDashboardTab('/app/subscription'), 'subscription');
    assert.equal(mapAppPathToDashboardTab('/app/business-profile'), 'business-profile');
    assert.equal(mapAppPathToDashboardTab('/app/settings'), 'settings');
    assert.equal(mapAppPathToDashboardTab('/app/login'), null);

    assert.equal(mapDashboardTabToAppPath('appointments'), '/app/appointments');
    assert.equal(mapDashboardTabToAppPath('settings'), '/app/settings');
  });
});

describe('resolveRouteAccess PWA & authentication state machine', () => {
  it('allows public marketing website routes when unauthenticated in normal browser', () => {
    const decision = resolveRouteAccess({
      path: '/pricing',
      authLoading: false,
      profileLoading: false,
      isAuthenticated: false,
      userRole: null,
      isStandalone: false,
    });
    assert.deepEqual(decision, { kind: 'render', target: 'marketing', marketingSection: 'pricing' });
  });

  it('redirects unauthenticated direct access to /app/dashboard or /app/appointments to /app/login', () => {
    for (const protectedPath of ['/app', '/app/dashboard', '/app/appointments', '/app/settings', '/app/admin']) {
      const decision = resolveRouteAccess({
        path: protectedPath,
        authLoading: false,
        profileLoading: false,
        isAuthenticated: false,
        userRole: null,
        isStandalone: false,
      });
      assert.deepEqual(decision, { kind: 'redirect', to: '/app/login' });
    }
  });

  it('shows branded loading splash during auth restoration on /app/login without flashing login form', () => {
    const decision = resolveRouteAccess({
      path: '/app/login',
      authLoading: true,
      profileLoading: false,
      isAuthenticated: false,
      userRole: null,
      isStandalone: true,
    });
    assert.deepEqual(decision, { kind: 'render', target: 'loading' });
  });

  it('redirects authenticated business owner on PWA launch (/app/login) directly to /app/dashboard', () => {
    const decision = resolveRouteAccess({
      path: '/app/login',
      authLoading: false,
      profileLoading: false,
      isAuthenticated: true,
      userRole: 'business_owner',
      userEmail: 'owner@salon.com',
      isStandalone: true,
    });
    assert.deepEqual(decision, { kind: 'redirect', to: '/app/dashboard' });
  });

  it('redirects authenticated super_admin on /app/login directly to /app/admin', () => {
    const decision = resolveRouteAccess({
      path: '/app/login',
      authLoading: false,
      profileLoading: false,
      isAuthenticated: true,
      userRole: 'super_admin',
      userEmail: 'samleybook@gmail.com',
      isStandalone: true,
    });
    assert.deepEqual(decision, { kind: 'redirect', to: '/app/admin' });
  });

  it('keeps logged-out user reopening installed PWA on /app/login and never redirects to marketing /', () => {
    const decision = resolveRouteAccess({
      path: '/app/login',
      authLoading: false,
      profileLoading: false,
      isAuthenticated: false,
      userRole: null,
      isStandalone: true,
    });
    assert.deepEqual(decision, { kind: 'render', target: 'login' });

    // Even if standalone PWA somehow opens at /, redirect inside /app/login instead of marketing
    const rootDecision = resolveRouteAccess({
      path: '/',
      authLoading: false,
      profileLoading: false,
      isAuthenticated: false,
      userRole: null,
      isStandalone: true,
    });
    assert.deepEqual(rootDecision, { kind: 'redirect', to: '/app/login' });
  });

  it('allows Stage 2 business registration to finish before redirecting /app/register', () => {
    const midRegistration = resolveRouteAccess({
      path: '/app/register',
      authLoading: false,
      profileLoading: false,
      isAuthenticated: true,
      userRole: 'business_owner',
      isStandalone: false,
      isRegistering: true,
    });
    assert.deepEqual(midRegistration, { kind: 'render', target: 'register' });

    const alreadySignedInIdle = resolveRouteAccess({
      path: '/app/register',
      authLoading: false,
      profileLoading: false,
      isAuthenticated: true,
      userRole: 'business_owner',
      isStandalone: false,
      isRegistering: false,
    });
    assert.deepEqual(alreadySignedInIdle, { kind: 'redirect', to: '/app/dashboard' });
  });
});
