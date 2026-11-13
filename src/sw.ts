import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

interface SwExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface SwPushEvent extends SwExtendableEvent {
  data: {
    json(): any;
    text(): string;
  } | null;
}

interface SwNotificationEvent extends SwExtendableEvent {
  notification: Notification & { data?: Record<string, any> };
}

interface SwWindowClient {
  url: string;
  focused?: boolean;
  focus(): Promise<SwWindowClient>;
  navigate?(url: string): Promise<SwWindowClient | null>;
  postMessage(message: unknown): void;
}

interface SwScope {
  location: Location;
  navigator: Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  registration: ServiceWorkerRegistration & {
    showNotification(title: string, options?: NotificationOptions): Promise<void>;
  };
  clients: {
    matchAll(options?: { type?: 'window' | 'worker' | 'sharedworker' | 'all'; includeUncontrolled?: boolean }): Promise<SwWindowClient[]>;
    openWindow(url: string): Promise<SwWindowClient | null>;
  };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install', listener: (event: SwExtendableEvent) => void): void;
  addEventListener(type: 'activate', listener: (event: SwExtendableEvent) => void): void;
  addEventListener(type: 'push', listener: (event: SwPushEvent) => void): void;
  addEventListener(type: 'notificationclick', listener: (event: SwNotificationEvent) => void): void;
  addEventListener(type: 'pushsubscriptionchange', listener: (event: SwExtendableEvent) => void): void;
  __WB_MANIFEST?: Array<PrecacheEntry | string>;
}

const sw = self as unknown as SwScope;

sw.skipWaiting();
clientsClaim();

const wbManifest = (self as unknown as SwScope).__WB_MANIFEST || [];
cleanupOutdatedCaches();
if (wbManifest.length > 0) {
  precacheAndRoute(wbManifest);
}

// Guard NavigationRoute so dev mode (where __WB_MANIFEST is empty) does not throw non-precached-url
const indexManifestEntry = wbManifest.find((entry) => {
  const url = typeof entry === 'string' ? entry : entry.url;
  return url === 'index.html' || url === '/index.html';
});

if (indexManifestEntry) {
  const indexUrl = typeof indexManifestEntry === 'string' ? indexManifestEntry : indexManifestEntry.url;
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL(indexUrl), {
      denylist: [/^\/api\//],
    })
  );
}

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkOnly()
);

registerRoute(
  ({ url }) => url.hostname.endsWith('.supabase.co'),
  new NetworkOnly()
);

function sanitizeAppRoute(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string') return '/app/dashboard';
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('/app') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return '/app/dashboard';
  }
  return /^\/app($|\/|\?)/.test(trimmed) ? trimmed : '/app/dashboard';
}

sw.addEventListener('push', (event: SwPushEvent) => {
  let payload: Record<string, any> = {};
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch {
    const rawText = event.data ? event.data.text() : '';
    payload = {
      title: 'SamleyBook',
      body: rawText || 'You have a new update.',
    };
  }

  const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : 'SamleyBook';
  const body = typeof payload.body === 'string' ? payload.body : 'Open SamleyBook to view details.';
  const targetUrl = sanitizeAppRoute(payload.url);

  const notificationOptions: NotificationOptions & { renotify?: boolean; timestamp?: number } = {
    body,
    icon: typeof payload.icon === 'string' ? payload.icon : '/pwa-192x192.png',
    badge: typeof payload.badge === 'string' ? payload.badge : '/pwa-192x192.png',
    tag: typeof payload.tag === 'string' ? payload.tag : `samley-${Date.now()}`,
    renotify: payload.renotify !== false,
    requireInteraction: Boolean(payload.requireInteraction),
    timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
    data: {
      url: targetUrl,
      notificationId: payload.notificationId || null,
      category: payload.category || null,
      businessId: payload.businessId || null,
      entityType: payload.entityType || null,
      entityId: payload.entityId || null,
    },
  };

  event.waitUntil(
    (async () => {
      await sw.registration.showNotification(title, notificationOptions);

      if (typeof payload.unreadCount === 'number') {
        try {
          if (payload.unreadCount > 0 && sw.navigator.setAppBadge) {
            await sw.navigator.setAppBadge(payload.unreadCount);
          } else if (payload.unreadCount === 0 && sw.navigator.clearAppBadge) {
            await sw.navigator.clearAppBadge();
          }
        } catch {
          // Badge API not supported on all browsers
        }
      }

      const clients = await sw.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clients) {
        client.postMessage({
          type: 'SAMLEY_PUSH_RECEIVED',
          payload,
        });
      }
    })()
  );
});

sw.addEventListener('notificationclick', (event: SwNotificationEvent) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetPath = sanitizeAppRoute(data.url);
  const fullTargetUrl = new URL(targetPath, sw.location.origin).href;

  event.waitUntil(
    (async () => {
      const windowClients = await sw.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      const appClient =
        windowClients.find((c) => {
          try {
            return new URL(c.url).origin === sw.location.origin;
          } catch {
            return false;
          }
        }) || null;

      if (appClient) {
        await appClient.focus();
        appClient.postMessage({
          type: 'SAMLEY_NOTIFICATION_CLICK',
          url: targetPath,
          notificationId: data.notificationId || null,
        });
        if (!new URL(appClient.url).pathname.startsWith('/app') && appClient.navigate) {
          await appClient.navigate(fullTargetUrl);
        }
        return;
      }

      await sw.clients.openWindow(fullTargetUrl);
    })()
  );
});

sw.addEventListener('pushsubscriptionchange', (event: SwExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const clients = await sw.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clients) {
        client.postMessage({
          type: 'SAMLEY_PUSH_SUBSCRIPTION_CHANGED',
        });
      }
    })()
  );
});
