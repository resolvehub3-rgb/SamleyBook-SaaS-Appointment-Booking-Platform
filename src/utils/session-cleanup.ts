const APP_USER_LOCAL_KEYS = [
  'samley_active_business_id',
  'samley_appt_open_mode',
  'samley_appt_view',
];

/**
 * Clears all user-specific and business-specific client storage and dynamic caches
 * on explicit Sign Out or unexpected session expiration/revocation.
 * Preserves project-level Supabase connection overrides (samley_supabase_url / anon_key)
 * and Workbox static precache bundles.
 */
export async function clearSensitiveClientCaches(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    for (const key of APP_USER_LOCAL_KEYS) {
      window.localStorage.removeItem(key);
    }

    // Remove any residual Supabase auth session tokens from localStorage
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('sb-') && k.includes('auth-token')) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      window.localStorage.removeItem(k);
    }
  } catch {
    // ignore storage access errors
  }

  try {
    window.sessionStorage.clear();
  } catch {
    // ignore sessionStorage errors
  }

  // Clear non-precache runtime CacheStorage entries so no sensitive dynamic payload lingers
  try {
    if ('caches' in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => !name.startsWith('workbox-precache'))
          .map((name) => window.caches.delete(name))
      );
    }
  } catch {
    // ignore CacheStorage errors
  }
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}
