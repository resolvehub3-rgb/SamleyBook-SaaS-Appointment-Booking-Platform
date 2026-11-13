import React, { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  EyeOff,
  Laptop,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  User,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { PRIMARY_ORANGE_BTN, SURFACE_CARD } from './ui/DashboardTokens';
import type { NotificationPreferences } from '../../types/database';

const STATUS_BADGE: Record<string, { label: string; badgeClass: string; desc: string }> = {
  subscribed: {
    label: 'Active on This Device',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    desc: 'This device receives real-time OS and lock-screen push alerts even when SamleyBook is closed.',
  },
  ready_to_subscribe: {
    label: 'Permission Granted — Connect Device',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    desc: 'Browser permission is granted. Click Enable Notifications to register this device for your account.',
  },
  needs_permission: {
    label: 'Not Enabled Yet',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    desc: 'Enable push notifications to receive WhatsApp-style background alerts for bookings and reminders.',
  },
  denied: {
    label: 'Blocked in Browser',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    desc: 'Notifications are blocked in your browser site settings. Allow notifications in site permissions and reload.',
  },
  ios_install_required: {
    label: 'iOS Home Screen Install Required',
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-200',
    desc: 'On iPhone/iPad Safari, tap Share -> Add to Home Screen, then launch SamleyBook from your Home Screen.',
  },
  server_unconfigured: {
    label: 'Push Server Keys Not Configured',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    desc: 'Background Web Push keys are not configured on the server yet. In-app Realtime notifications remain active.',
  },
  unsupported: {
    label: 'Browser Unsupported',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    desc: 'This browser does not expose the Push API. In-app notifications remain active.',
  },
};

export const SettingsView: React.FC = () => {
  const { profile } = useAuth();
  const {
    preferences,
    updatePreferences,
    devices,
    currentEndpoint,
    currentDeviceId,
    pushCapability,
    pushBusy,
    pushError,
    enablePushNotifications,
    disableThisDevice,
    removeDevice,
    sendTestPush,
  } = useNotifications();

  const [actionFeedback, setActionFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const statusMeta = STATUS_BADGE[pushCapability] || STATUS_BADGE.unsupported;

  const handleEnable = async () => {
    const res = await enablePushNotifications();
    setActionFeedback({
      ok: res.ok,
      text: res.message || (res.ok ? 'Device subscribed.' : 'Could not enable push notifications.'),
    });
  };

  const handleDisableThisDevice = async () => {
    const res = await disableThisDevice();
    setActionFeedback({
      ok: res.ok,
      text: res.message || (res.ok ? 'Device notifications disabled.' : 'Failed to disable device.'),
    });
  };

  const handleTestPush = async () => {
    const res = await sendTestPush();
    setActionFeedback({
      ok: res.ok,
      text: res.message || (res.ok ? 'Test push sent.' : 'Test push failed.'),
    });
  };

  const handleRemoveDevice = async (id: string) => {
    const res = await removeDevice(id);
    setActionFeedback({
      ok: res.ok,
      text: res.message || (res.ok ? 'Device removed.' : 'Failed to remove device.'),
    });
  };

  const handleTogglePref = async (
    key: keyof Omit<NotificationPreferences, 'user_id' | 'updated_at'>,
    value: boolean
  ) => {
    const res = await updatePreferences({ [key]: value });
    if (!res.ok && res.message) {
      setActionFeedback({ ok: false, text: res.message });
    }
  };

  const categoryRows: Array<{
    key: keyof Omit<NotificationPreferences, 'user_id' | 'updated_at'>;
    label: string;
    desc: string;
  }> = [
    { key: 'new_booking', label: 'New Appointment Bookings', desc: 'Alert immediately when a customer books online or a booking is added.' },
    { key: 'cancellation', label: 'Appointment Cancellations', desc: 'Alert when any scheduled appointment is cancelled.' },
    { key: 'reschedule', label: 'Appointment Reschedules', desc: 'Alert when appointment date or time changes.' },
    { key: 'feedback', label: 'Customer Feedback', desc: 'Alert when a customer submits post-appointment feedback.' },
    { key: 'subscription', label: 'Subscription & Billing Alerts', desc: 'Reminders 3 days and 1 day before expiry, plus expiry and renewal confirmation.' },
    { key: 'security', label: 'Account & Device Security Alerts', desc: 'Alerts when a new notification device is added or password changes.' },
  ];

  return (
    <div className="space-y-6 text-left max-w-4xl">
      {/* Account Profile Card */}
      <div className={`${SURFACE_CARD} p-6 md:p-7 space-y-5`}>
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5">
          <div className="w-8 h-8 rounded-xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-[#111827]">Account Profile</h3>
            <p className="text-[11px] text-slate-500">
              Authenticated business owner credentials in Supabase
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Full Name
            </span>
            <p className="font-extrabold text-[#111827] text-sm mt-1">
              {profile?.full_name || 'Owner'}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Registered Email
            </span>
            <p className="font-mono font-semibold text-slate-700 text-xs mt-1.5 break-all">
              {profile?.email || 'Not set'}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Phone Number
            </span>
            <p className="font-mono font-semibold text-slate-700 text-xs mt-1.5">
              {profile?.phone || 'Not set'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1">
          <ShieldCheck className="w-4 h-4 text-[#16A34A] shrink-0" />
          <span>Multi-tenant Row Level Security (RLS) active for this account session.</span>
        </div>
      </div>

      {/* Push Notifications & Registered Devices Card */}
      <div className={`${SURFACE_CARD} p-6 md:p-7 space-y-5`} id="notifications-settings">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#111827]">
                Background Push Notifications & Devices
              </h3>
              <p className="text-[11px] text-slate-500">
                Receive real-time alerts even when SamleyBook is closed across phone, tablet, and desktop
              </p>
            </div>
          </div>

          <span
            data-testid="push-capability-badge"
            className={`inline-flex items-center px-3 py-1 rounded-full border text-[11px] font-bold shrink-0 ${statusMeta.badgeClass}`}
          >
            {statusMeta.label}
          </span>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">{statusMeta.desc}</p>

        {(actionFeedback || pushError) && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
              actionFeedback?.ok
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {actionFeedback?.ok ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{actionFeedback?.text || pushError}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          {(pushCapability === 'needs_permission' || pushCapability === 'ready_to_subscribe') && (
            <button
              type="button"
              disabled={pushBusy}
              onClick={() => void handleEnable()}
              className={`${PRIMARY_ORANGE_BTN} px-4 py-2.5 text-xs`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>{pushBusy ? 'Enabling...' : 'Enable Notifications on This Device'}</span>
            </button>
          )}

          {pushCapability === 'subscribed' && (
            <>
              <button
                type="button"
                disabled={pushBusy}
                onClick={() => void handleTestPush()}
                className={`${PRIMARY_ORANGE_BTN} px-4 py-2.5 text-xs`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>{pushBusy ? 'Sending...' : 'Send Test Push Notification'}</span>
              </button>
              <button
                type="button"
                disabled={pushBusy}
                onClick={() => void handleDisableThisDevice()}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-bold text-xs transition disabled:opacity-50"
              >
                Disable on This Device
              </button>
            </>
          )}
        </div>

        {/* Registered Devices List */}
        <div className="pt-2 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              Registered Active Devices ({devices.length})
            </h4>
          </div>

          {devices.length === 0 ? (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-slate-500">
              No active push notification devices registered yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-2xl overflow-hidden">
              {devices.map((dev) => {
                const isThisDevice =
                  dev.endpoint === currentEndpoint || dev.device_id === currentDeviceId;
                const isMobile = dev.platform === 'android' || dev.platform === 'ios';

                return (
                  <div
                    key={dev.id}
                    className="p-3.5 bg-white flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                        {isMobile ? (
                          <Smartphone className="w-4 h-4" />
                        ) : (
                          <Laptop className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-[#111827] truncate">{dev.device_name}</p>
                          {isThisDevice && (
                            <span className="px-2 py-0.5 rounded-full bg-orange-50 text-[#F95700] border border-orange-200 text-[10px] font-bold">
                              This device
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          Platform: <span className="capitalize">{dev.platform}</span> &bull;{' '}
                          {dev.last_success_at
                            ? `Last delivered ${new Date(dev.last_success_at).toLocaleString()}`
                            : `Registered ${new Date(dev.created_at).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={pushBusy}
                      onClick={() => void handleRemoveDevice(dev.id)}
                      aria-label={`Remove ${dev.device_name}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-[11px] font-bold transition disabled:opacity-50 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Remove</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Synced Notification Preferences & Privacy */}
      <div className={`${SURFACE_CARD} p-6 md:p-7 space-y-5`}>
        <div className="border-b border-slate-100 pb-3.5">
          <h3 className="text-base font-extrabold text-[#111827]">
            Notification Categories & Reminder Timing
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Synced across all your devices. Disabling a push category stops background push only; your in-app history is always preserved.
          </p>
        </div>

        <div className="space-y-3">
          {categoryRows.map((row) => (
            <label
              key={row.key}
              className="flex items-start justify-between gap-4 p-3.5 rounded-2xl bg-slate-50/70 border border-slate-100 cursor-pointer hover:border-orange-200 transition"
            >
              <div>
                <p className="text-xs font-extrabold text-[#111827]">{row.label}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{row.desc}</p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(preferences[row.key])}
                onChange={(e) => void handleTogglePref(row.key, e.target.checked)}
                className="mt-1 h-4 w-4 accent-[#F95700] rounded cursor-pointer shrink-0"
              />
            </label>
          ))}

          {/* Owner Appointment Reminders Group */}
          <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-100 space-y-3">
            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <div>
                <p className="text-xs font-extrabold text-[#111827]">
                  Owner Appointment Reminders
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Receive advance reminders before each scheduled appointment begins.
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.reminders_enabled}
                onChange={(e) => void handleTogglePref('reminders_enabled', e.target.checked)}
                className="mt-1 h-4 w-4 accent-[#F95700] rounded cursor-pointer shrink-0"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-200/70">
              {(
                [
                  { key: 'reminder_24h', label: '24 hours before' },
                  { key: 'reminder_1h', label: '1 hour before' },
                  { key: 'reminder_30m', label: '30 minutes before' },
                ] as const
              ).map((item) => (
                <label
                  key={item.key}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border bg-white text-xs font-semibold ${
                    preferences.reminders_enabled
                      ? 'border-slate-200 text-slate-800 cursor-pointer'
                      : 'border-slate-100 text-slate-400 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <span>{item.label}</span>
                  <input
                    type="checkbox"
                    disabled={!preferences.reminders_enabled}
                    checked={Boolean(preferences[item.key])}
                    onChange={(e) => void handleTogglePref(item.key, e.target.checked)}
                    className="h-4 w-4 accent-[#F95700] rounded shrink-0"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Lock-screen privacy toggle */}
          <label className="flex items-start justify-between gap-4 p-3.5 rounded-2xl bg-[#FFFDF7] border border-amber-200/70 cursor-pointer">
            <div className="flex items-start gap-2.5">
              <EyeOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-extrabold text-[#111827]">
                  Hide Customer Details on Lock Screen
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Masks customer names and service details in push notifications shown on locked devices while keeping full details inside the app.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={preferences.hide_lockscreen_details}
              onChange={(e) => void handleTogglePref('hide_lockscreen_details', e.target.checked)}
              className="mt-1 h-4 w-4 accent-[#F95700] rounded cursor-pointer shrink-0"
            />
          </label>
        </div>
      </div>

      {/* PWA App Install Card */}
      <div className={`${SURFACE_CARD} p-6 md:p-7 space-y-4`}>
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5">
          <div className="w-8 h-8 rounded-xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-[#111827]">
              Progressive Web App (PWA)
            </h3>
            <p className="text-[11px] text-slate-500">
              Install SamleyBook as a standalone desktop or mobile app
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Install the SamleyBook Business Owner dashboard to your home screen on Android, iPhone, iPad, or Windows desktop for rapid one-tap access and background push notifications.
        </p>

        <PWAInstallButton variant="primary" />
      </div>
    </div>
  );
};
