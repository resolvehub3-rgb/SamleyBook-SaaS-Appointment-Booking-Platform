import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { useBusiness } from './BusinessContext';
import type {
  NotificationPreferences,
  OwnerNotification,
  PushSubscriptionRecord,
} from '../types/database';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PROMPT_DISMISS_KEY,
  PUSH_DEVICE_ID_KEY,
  computeUnreadCount,
  detectClientPlatformAndName,
  evaluatePushEnvironment,
  extractInternalNotificationRedirect,
  markAllNotificationsReadOptimistic,
  markSingleNotificationReadOptimistic,
  normalizeNotificationPreferences,
  type PushCapabilityStatus,
  urlBase64ToUint8Array,
} from '../utils/notifications';
import { isStandalonePWA } from '../utils/session-cleanup';

const PAGE_SIZE = 20;

interface ActionResult {
  ok: boolean;
  message?: string;
}

interface NotificationContextType {
  notifications: OwnerNotification[];
  unreadCount: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  preferences: NotificationPreferences;
  preferencesLoading: boolean;
  updatePreferences: (patch: Partial<NotificationPreferences>) => Promise<ActionResult>;
  devices: PushSubscriptionRecord[];
  currentEndpoint: string | null;
  currentDeviceId: string;
  pushCapability: PushCapabilityStatus;
  vapidConfigured: boolean;
  vapidPublicKey: string | null;
  pushBusy: boolean;
  pushError: string | null;
  enablePushNotifications: () => Promise<ActionResult>;
  disableThisDevice: () => Promise<ActionResult>;
  removeDevice: (subscriptionId: string) => Promise<ActionResult>;
  sendTestPush: () => Promise<ActionResult>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  dispatchNotificationEvent: (payload: { type: string; [key: string]: unknown }) => Promise<void>;
  onboardingDismissed: boolean;
  dismissOnboarding: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    const existing = window.localStorage.getItem(PUSH_DEVICE_ID_KEY);
    if (existing) return existing;
    const created =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(PUSH_DEVICE_ID_KEY, created);
    return created;
  } catch {
    return `dev-${Date.now()}`;
  }
}

function isDismissedCurrently(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_PROMPT_DISMISS_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

export const NotificationProvider: React.FC<{
  children: React.ReactNode;
  onNavigateToRoute?: (route: string) => void;
}> = ({ children, onNavigateToRoute }) => {
  const { user, session } = useAuth();
  const { currentBusiness } = useBusiness();

  const [notifications, setNotifications] = useState<OwnerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const [preferences, setPreferences] = useState<NotificationPreferences>(() => ({
    user_id: '',
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  }));
  const [preferencesLoading, setPreferencesLoading] = useState<boolean>(false);

  const [devices, setDevices] = useState<PushSubscriptionRecord[]>([]);
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);
  const [currentDeviceId] = useState<string>(() => getOrCreateDeviceId());

  const [vapidConfigured, setVapidConfigured] = useState<boolean>(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return window.Notification.permission;
  });
  const [pushBusy, setPushBusy] = useState<boolean>(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState<boolean>(() => isDismissedCurrently());

  const navCallbackRef = useRef(onNavigateToRoute);
  navCallbackRef.current = onNavigateToRoute;

  const subCheckDoneForBizRef = useRef<string | null>(null);

  const syncAppBadge = useCallback(async (count: number) => {
    if (typeof navigator === 'undefined') return;
    const nav = navigator as Navigator & {
      setAppBadge?: (c?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    try {
      if (count > 0 && nav.setAppBadge) {
        await nav.setAppBadge(count);
      } else if (count === 0 && nav.clearAppBadge) {
        await nav.clearAppBadge();
      }
    } catch {
      // App Badge API optional on some platforms
    }
  }, []);

  useEffect(() => {
    void syncAppBadge(unreadCount);
  }, [unreadCount, syncAppBadge]);

  const fetchExactUnreadCount = useCallback(async (userId: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { count, error } = await supabase
      .from('owner_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);

    if (!error && typeof count === 'number') {
      setUnreadCount(count);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !user?.id) {
      setNotifications([]);
      setUnreadCount(0);
      setHasMore(false);
      return;
    }

    setLoading(true);
    try {
      const [{ data, error }, { count }] = await Promise.all([
        supabase
          .from('owner_notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .range(0, PAGE_SIZE - 1),
        supabase
          .from('owner_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .is('read_at', null),
      ]);

      if (!error && Array.isArray(data)) {
        const list = data as OwnerNotification[];
        setNotifications(list);
        setHasMore(list.length === PAGE_SIZE);
        setUnreadCount(typeof count === 'number' ? count : computeUnreadCount(list));
      }
    } catch (err) {
      console.error('Failed to load owner notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const loadMore = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !user?.id || loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const offset = notifications.length;
      const { data, error } = await supabase
        .from('owner_notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (!error && Array.isArray(data)) {
        const incoming = data as OwnerNotification[];
        setNotifications((prev) => {
          const seen = new Set(prev.map((n) => n.id));
          const merged = [...prev];
          for (const item of incoming) {
            if (!seen.has(item.id)) merged.push(item);
          }
          return merged;
        });
        setHasMore(incoming.length === PAGE_SIZE);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [user?.id, loadingMore, hasMore, notifications.length]);

  const fetchPreferencesAndDevices = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !user?.id) {
      setDevices([]);
      return;
    }

    setPreferencesLoading(true);
    try {
      const [prefRes, devRes] = await Promise.all([
        supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('push_subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('updated_at', { ascending: false }),
      ]);

      setPreferences(normalizeNotificationPreferences(user.id, prefRes.data as NotificationPreferences | null));
      if (!devRes.error && Array.isArray(devRes.data)) {
        setDevices(devRes.data as PushSubscriptionRecord[]);
      }
    } finally {
      setPreferencesLoading(false);
    }
  }, [user?.id]);

  const probeVapidAndBrowserSub = useCallback(async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionState(window.Notification.permission);
    } else {
      setPermissionState('unsupported');
    }

    try {
      const resp = await fetch('/api/notifications/config');
      if (resp.ok) {
        const data = await resp.json();
        setVapidConfigured(Boolean(data.configured && data.publicKey));
        setVapidPublicKey(data.publicKey || null);
      }
    } catch {
      setVapidConfigured(false);
    }

    try {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.pushManager) {
          const existing = await reg.pushManager.getSubscription();
          setCurrentEndpoint(existing?.endpoint || null);
        }
      }
    } catch {
      setCurrentEndpoint(null);
    }
  }, []);

  useEffect(() => {
    void probeVapidAndBrowserSub();
  }, [probeVapidAndBrowserSub]);

  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      setUnreadCount(0);
      setDevices([]);
      setPreferences({ user_id: '', ...DEFAULT_NOTIFICATION_PREFERENCES });
      subCheckDoneForBizRef.current = null;
      return;
    }

    void refreshNotifications();
    void fetchPreferencesAndDevices();
    void probeVapidAndBrowserSub();

    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel(`owner-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'owner_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            const incoming = payload.new as OwnerNotification;
            setNotifications((prev) => {
              if (prev.some((n) => n.id === incoming.id)) return prev;
              return [incoming, ...prev];
            });
            if (!incoming.read_at) {
              setUnreadCount((c) => c + 1);
            }
            void fetchExactUnreadCount(user.id);
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const updated = payload.new as OwnerNotification;
            setNotifications((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
            void fetchExactUnreadCount(user.id);
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const deletedId = (payload.old as { id?: string }).id;
            if (deletedId) {
              setNotifications((prev) => prev.filter((n) => n.id !== deletedId));
            }
            void fetchExactUnreadCount(user.id);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_preferences',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new) {
            setPreferences(normalizeNotificationPreferences(user.id, payload.new as NotificationPreferences));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'push_subscriptions',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void fetchPreferencesAndDevices();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, refreshNotifications, fetchPreferencesAndDevices, fetchExactUnreadCount, probeVapidAndBrowserSub]);

  // Mark individual notification read (Option A behavior)
  const markNotificationRead = useCallback(
    async (id: string) => {
      const supabase = getSupabase();
      if (!supabase || !user?.id) return;

      const target = notifications.find((n) => n.id === id);
      if (target?.read_at) return;

      const nowIso = new Date().toISOString();
      setNotifications((prev) => markSingleNotificationReadOptimistic(prev, id, nowIso));
      setUnreadCount((c) => Math.max(0, c - 1));

      await supabase
        .from('owner_notifications')
        .update({ read_at: nowIso })
        .eq('id', id)
        .eq('user_id', user.id)
        .is('read_at', null);

      void fetchExactUnreadCount(user.id);
    },
    [user?.id, notifications, fetchExactUnreadCount]
  );

  const markAllRead = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !user?.id) return;

    const nowIso = new Date().toISOString();
    setNotifications((prev) => markAllNotificationsReadOptimistic(prev, nowIso));
    setUnreadCount(0);

    await supabase
      .from('owner_notifications')
      .update({ read_at: nowIso })
      .eq('user_id', user.id)
      .is('read_at', null);

    void fetchExactUnreadCount(user.id);
  }, [user?.id, fetchExactUnreadCount]);

  const updatePreferences = useCallback(
    async (patch: Partial<NotificationPreferences>): Promise<ActionResult> => {
      const supabase = getSupabase();
      if (!supabase || !user?.id) {
        return { ok: false, message: 'Sign in required to save preferences.' };
      }

      const next = normalizeNotificationPreferences(user.id, {
        ...preferences,
        ...patch,
      });
      setPreferences(next);

      const { error } = await supabase.from('notification_preferences').upsert(
        {
          user_id: user.id,
          new_booking: next.new_booking,
          cancellation: next.cancellation,
          reschedule: next.reschedule,
          reminders_enabled: next.reminders_enabled,
          reminder_24h: next.reminder_24h,
          reminder_1h: next.reminder_1h,
          reminder_30m: next.reminder_30m,
          feedback: next.feedback,
          subscription: next.subscription,
          security: next.security,
          hide_lockscreen_details: next.hide_lockscreen_details,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (error) {
        await fetchPreferencesAndDevices();
        return { ok: false, message: error.message };
      }
      return { ok: true };
    },
    [user?.id, preferences, fetchPreferencesAndDevices]
  );

  const subscribeDeviceToServer = useCallback(
    async (sub: PushSubscription, notifySecurity: boolean): Promise<ActionResult> => {
      if (!session?.access_token) {
        return { ok: false, message: 'Missing authenticated session.' };
      }
      const subJson = sub.toJSON();
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const info = detectClientPlatformAndName(ua);

      const resp = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          subscription: subJson,
          businessId: currentBusiness?.id || null,
          deviceId: currentDeviceId,
          deviceName: info.deviceName,
          platform: info.platform,
          userAgent: ua,
          notifySecurity,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return { ok: false, message: data.error || 'Failed to register push subscription.' };
      }

      setCurrentEndpoint(sub.endpoint);
      await fetchPreferencesAndDevices();
      return { ok: true, message: 'Device registered for background notifications.' };
    },
    [session?.access_token, currentBusiness?.id, currentDeviceId, fetchPreferencesAndDevices]
  );

  const enablePushNotifications = useCallback(async (): Promise<ActionResult> => {
    setPushError(null);
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      const msg = 'This browser does not support Web Push notifications.';
      setPushError(msg);
      return { ok: false, message: msg };
    }

    if (!vapidConfigured || !vapidPublicKey) {
      const msg = 'Push server VAPID keys are not configured yet.';
      setPushError(msg);
      return { ok: false, message: msg };
    }

    setPushBusy(true);
    try {
      let perm = window.Notification.permission;
      if (perm === 'default') {
        perm = await window.Notification.requestPermission();
      }
      setPermissionState(perm);

      if (perm !== 'granted') {
        const msg =
          perm === 'denied'
            ? 'Notifications are blocked in your browser settings. Enable notifications in site permissions and reload.'
            : 'Notification permission was dismissed.';
        setPushError(msg);
        return { ok: false, message: msg };
      }

      const reg = await navigator.serviceWorker.ready;
      if (!reg.pushManager) {
        const msg = 'PushManager is unavailable on this browser.';
        setPushError(msg);
        return { ok: false, message: msg };
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      const result = await subscribeDeviceToServer(sub, true);
      if (!result.ok) {
        setPushError(result.message || 'Could not register push device.');
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to enable push notifications.';
      setPushError(msg);
      return { ok: false, message: msg };
    } finally {
      setPushBusy(false);
    }
  }, [vapidConfigured, vapidPublicKey, subscribeDeviceToServer]);

  const disableThisDevice = useCallback(async (): Promise<ActionResult> => {
    setPushBusy(true);
    setPushError(null);
    try {
      let endpoint = currentEndpoint;
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg?.pushManager ? await reg.pushManager.getSubscription() : null;
        if (sub) {
          endpoint = sub.endpoint;
          await sub.unsubscribe().catch(() => {});
        }
      }

      if (session?.access_token && (endpoint || currentDeviceId)) {
        const resp = await fetch('/api/notifications/unsubscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            endpoint: endpoint || undefined,
            deviceId: currentDeviceId,
          }),
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          return { ok: false, message: data.error || 'Failed to disable device notifications.' };
        }
      }

      setCurrentEndpoint(null);
      await fetchPreferencesAndDevices();
      return { ok: true, message: 'Notifications disabled on this device.' };
    } finally {
      setPushBusy(false);
    }
  }, [currentEndpoint, currentDeviceId, session?.access_token, fetchPreferencesAndDevices]);

  const removeDevice = useCallback(
    async (subscriptionId: string): Promise<ActionResult> => {
      if (!session?.access_token) return { ok: false, message: 'Not authenticated' };
      const target = devices.find((d) => d.id === subscriptionId);
      setPushBusy(true);
      try {
        if (target && target.endpoint === currentEndpoint && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = reg?.pushManager ? await reg.pushManager.getSubscription() : null;
          if (sub && sub.endpoint === target.endpoint) {
            await sub.unsubscribe().catch(() => {});
            setCurrentEndpoint(null);
          }
        }

        const resp = await fetch('/api/notifications/unsubscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ subscriptionId }),
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          return { ok: false, message: data.error || 'Failed to remove device.' };
        }
        await fetchPreferencesAndDevices();
        return { ok: true, message: 'Device removed.' };
      } finally {
        setPushBusy(false);
      }
    },
    [session?.access_token, devices, currentEndpoint, fetchPreferencesAndDevices]
  );

  const sendTestPush = useCallback(async (): Promise<ActionResult> => {
    if (!session?.access_token) return { ok: false, message: 'Authentication required.' };
    setPushBusy(true);
    setPushError(null);
    try {
      const resp = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ businessId: currentBusiness?.id || null }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = data.error || 'Failed to send test push notification.';
        setPushError(msg);
        return { ok: false, message: msg };
      }
      await refreshNotifications();
      return {
        ok: true,
        message: `Test push sent to ${data.sent} registered device${data.sent === 1 ? '' : 's'}.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Test push failed.';
      setPushError(msg);
      return { ok: false, message: msg };
    } finally {
      setPushBusy(false);
    }
  }, [session?.access_token, currentBusiness?.id, refreshNotifications]);

  const dispatchNotificationEvent = useCallback(
    async (payload: { type: string; [key: string]: unknown }) => {
      try {
        await fetch('/api/notifications/dispatch-event', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify(payload),
        });
      } catch {
        // Non-blocking notification push trigger
      }
    },
    [session?.access_token]
  );

  // Trigger subscription expiry alert check once per business session
  useEffect(() => {
    if (!user?.id || !session?.access_token || !currentBusiness?.id) return;
    if (subCheckDoneForBizRef.current === currentBusiness.id) return;
    subCheckDoneForBizRef.current = currentBusiness.id;
    void dispatchNotificationEvent({ type: 'subscription_check' });
  }, [user?.id, session?.access_token, currentBusiness?.id, dispatchNotificationEvent]);

  // Listen to Service Worker push/click/rotation messages
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data || {};
      if (data.type === 'SAMLEY_NOTIFICATION_CLICK') {
        if (typeof data.notificationId === 'string' && data.notificationId) {
          void markNotificationRead(data.notificationId);
        }
        const safeUrl = extractInternalNotificationRedirect(data.url);
        if (safeUrl && navCallbackRef.current) {
          navCallbackRef.current(safeUrl);
        }
      } else if (data.type === 'SAMLEY_PUSH_RECEIVED') {
        void refreshNotifications();
      } else if (data.type === 'SAMLEY_PUSH_SUBSCRIPTION_CHANGED' && vapidPublicKey && user?.id) {
        void (async () => {
          try {
            const reg = await navigator.serviceWorker.ready;
            const newSub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
            });
            await subscribeDeviceToServer(newSub, false);
          } catch {
            // ignore automatic key rotation failure
          }
        })();
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
  }, [markNotificationRead, refreshNotifications, subscribeDeviceToServer, vapidPublicKey, user?.id]);

  const dismissOnboarding = useCallback(() => {
    setOnboardingDismissed(true);
    try {
      const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
      window.localStorage.setItem(NOTIFICATION_PROMPT_DISMISS_KEY, String(sevenDaysFromNow));
    } catch {
      // ignore
    }
  }, []);

  const pushCapability = useMemo(() => {
    const isIOS =
      typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent || '');
    const hasNotificationApi = typeof window !== 'undefined' && 'Notification' in window;
    const hasServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
    const hasPushManager =
      typeof window !== 'undefined' && 'PushManager' in window;

    const hasActiveCurrentDeviceSubscription = Boolean(
      currentEndpoint &&
        devices.some((d) => d.is_active && (d.endpoint === currentEndpoint || d.device_id === currentDeviceId))
    );

    return evaluatePushEnvironment({
      hasNotificationApi,
      hasServiceWorker,
      hasPushManager,
      permission: permissionState,
      isIOS,
      isStandalone: isStandalonePWA(),
      vapidConfigured,
      hasActiveCurrentDeviceSubscription,
    });
  }, [currentEndpoint, devices, currentDeviceId, permissionState, vapidConfigured]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        loadingMore,
        hasMore,
        loadMore,
        refreshNotifications,
        preferences,
        preferencesLoading,
        updatePreferences,
        devices,
        currentEndpoint,
        currentDeviceId,
        pushCapability,
        vapidConfigured,
        vapidPublicKey,
        pushBusy,
        pushError,
        enablePushNotifications,
        disableThisDevice,
        removeDevice,
        sendTestPush,
        markNotificationRead,
        markAllRead,
        dispatchNotificationEvent,
        onboardingDismissed,
        dismissOnboarding,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return ctx;
};
