import React from 'react';
import { BellRing, ShieldAlert, Smartphone, X } from 'lucide-react';
import { useNotifications } from '../../../context/NotificationContext';

interface Props {
  onOpenNotificationSettings: () => void;
}

export const NotificationOnboardingBanner: React.FC<Props> = ({
  onOpenNotificationSettings,
}) => {
  const {
    pushCapability,
    pushBusy,
    pushError,
    onboardingDismissed,
    dismissOnboarding,
    enablePushNotifications,
  } = useNotifications();

  if (onboardingDismissed) return null;

  if (pushCapability === 'subscribed' || pushCapability === 'unsupported' || pushCapability === 'server_unconfigured') {
    return null;
  }

  if (pushCapability === 'ios_install_required') {
    return (
      <div
        data-testid="notification-onboarding-ios"
        className="mb-4 p-4 rounded-2xl bg-[#FFF3EC] border border-[#FADAC1] text-[#111827] flex items-start justify-between gap-3 text-xs shadow-xs"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#F95700] text-white flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <p className="font-extrabold text-[#111827]">
              Install SamleyBook for iPhone / iPad Push Alerts
            </p>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Safari on iOS requires installing this app first. Tap <strong>Share</strong> &rarr;{' '}
              <strong>Add to Home Screen</strong>, then open SamleyBook from your Home Screen to enable background lock-screen notifications.
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss notification prompt"
          onClick={dismissOnboarding}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-orange-100/70 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (pushCapability === 'denied') {
    return (
      <div
        data-testid="notification-onboarding-denied"
        className="mb-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 flex items-center justify-between gap-3 text-xs"
      >
        <div className="flex items-center gap-3 min-w-0">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-[11px] leading-snug">
            <strong>Browser notifications are blocked.</strong> To get real-time booking alerts when SamleyBook is closed, allow notifications in your browser site settings.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenNotificationSettings}
            className="px-3 py-1.5 rounded-xl bg-amber-600 text-white font-bold text-[11px] hover:bg-amber-700 transition"
          >
            Settings
          </button>
          <button
            type="button"
            aria-label="Dismiss notification notice"
            onClick={dismissOnboarding}
            className="p-1 rounded-lg text-amber-700 hover:bg-amber-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="notification-onboarding-banner"
      className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-[#0E1733] to-[#17254D] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-md"
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-[#F95700] text-white flex items-center justify-center shrink-0 shadow-xs">
          <BellRing className="w-4 h-4" />
        </div>
        <div className="space-y-0.5 min-w-0">
          <p className="font-extrabold text-[13px] text-white">
            Enable Real-Time Background Notifications
          </p>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Receive instant alerts for new bookings, cancellations, reschedules, reminders, and customer feedback even when SamleyBook is closed.
          </p>
          {pushError && (
            <p className="text-[11px] text-rose-300 font-semibold pt-0.5">{pushError}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        <button
          type="button"
          onClick={dismissOnboarding}
          className="px-3 py-2 rounded-xl text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition"
        >
          Maybe Later
        </button>
        <button
          type="button"
          disabled={pushBusy}
          onClick={() => void enablePushNotifications()}
          className="px-4 py-2 rounded-xl bg-[#F95700] hover:bg-[#EA580C] text-white font-bold text-[11px] shadow-sm transition disabled:opacity-50"
        >
          {pushBusy ? 'Enabling...' : 'Enable Notifications'}
        </button>
      </div>
    </div>
  );
};
