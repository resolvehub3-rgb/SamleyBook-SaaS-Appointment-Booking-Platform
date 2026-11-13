import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Calendar,
  CalendarClock,
  CheckCheck,
  Clock,
  Crown,
  Loader2,
  MessageSquare,
  Shield,
  XCircle,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useNotifications } from '../../../context/NotificationContext';
import type { NotificationCategory, OwnerNotification } from '../../../types/database';
import { applyNotificationFilter } from '../../../utils/notifications';

interface Props {
  onNavigateToUrl: (url: string) => void;
  onOpenSettings?: () => void;
}

const CATEGORY_META: Record<
  NotificationCategory,
  { label: string; iconBg: string; iconColor: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  new_booking: {
    label: 'New Booking',
    iconBg: 'bg-[#FFF3EC]',
    iconColor: 'text-[#F95700]',
    Icon: Calendar,
  },
  cancellation: {
    label: 'Cancelled',
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-600',
    Icon: XCircle,
  },
  reschedule: {
    label: 'Rescheduled',
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    Icon: CalendarClock,
  },
  reminder_24h: {
    label: '24h Reminder',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    Icon: Clock,
  },
  reminder_1h: {
    label: '1h Reminder',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    Icon: Clock,
  },
  reminder_30m: {
    label: '30m Reminder',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-700',
    Icon: Clock,
  },
  feedback: {
    label: 'Feedback',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    Icon: MessageSquare,
  },
  subscription: {
    label: 'Subscription',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-700',
    Icon: Crown,
  },
  security: {
    label: 'Security',
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-700',
    Icon: Shield,
  },
};

function formatRelativeTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const NotificationsDropdown: React.FC<Props> = ({
  onNavigateToUrl,
  onOpenSettings,
}) => {
  const {
    notifications,
    unreadCount,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    markNotificationRead,
    markAllRead,
  } = useNotifications();

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const shouldReduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(
    () => applyNotificationFilter(notifications, filter),
    [notifications, filter]
  );

  // Option A behavior: opening the dropdown does NOT mark items read; clicking an item marks only that item read
  const handleItemClick = async (item: OwnerNotification) => {
    setOpen(false);
    if (!item.read_at) {
      void markNotificationRead(item.id);
    }
    onNavigateToUrl(item.destination_url || '/app/dashboard');
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-testid="notifications-bell-button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={open}
        className="relative w-10 h-10 md:w-11 md:h-11 rounded-full bg-white border border-slate-200/80 shadow-[0_2px_8px_rgba(15,23,42,0.05)] flex items-center justify-center text-slate-700 hover:border-orange-300 hover:text-[#F95700] transition"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span
            data-testid="notifications-unread-badge"
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#EF4444] text-white text-[10px] font-extrabold flex items-center justify-center shadow-xs border-2 border-white tabular-nums"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            data-testid="notifications-dropdown-panel"
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-[21rem] sm:w-[25rem] bg-white rounded-2xl shadow-xl border border-slate-200/90 z-50 overflow-hidden text-left"
          >
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-extrabold text-[#111827]">Notification Centre</p>
                  <p className="text-[11px] text-slate-500">
                    {unreadCount > 0
                      ? `${unreadCount} unread update${unreadCount !== 1 ? 's' : ''}`
                      : 'All caught up'}
                  </p>
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#F95700] hover:underline"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5">
                {(['all', 'unread', 'read'] as const).map((tab) => {
                  const active = filter === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setFilter(tab)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition ${
                        active
                          ? 'bg-[#0E1733] text-white'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {tab}
                      {tab === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            {loading && notifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Loader2 className="w-5 h-5 text-[#F95700] animate-spin mx-auto" />
                <p className="text-xs font-semibold text-slate-500">Loading notifications...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Bell className="w-6 h-6 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-700">
                  {filter === 'unread'
                    ? 'No unread notifications'
                    : filter === 'read'
                    ? 'No read notifications yet'
                    : 'No notifications yet'}
                </p>
                <p className="text-[11px] text-slate-400">
                  Real-time bookings, reminders, cancellations, feedback, and subscription updates appear here.
                </p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {filtered.map((n) => {
                  const isUnread = !n.read_at;
                  const meta = CATEGORY_META[n.category] || CATEGORY_META.new_booking;
                  const Icon = meta.Icon;

                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => void handleItemClick(n)}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition flex items-start gap-3 ${
                        isUnread ? 'bg-orange-50/40' : ''
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${meta.iconBg} ${meta.iconColor}`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                            {meta.label}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] text-slate-400">
                              {formatRelativeTime(n.created_at)}
                            </span>
                            {isUnread && (
                              <span
                                aria-label="Unread"
                                className="w-2 h-2 rounded-full bg-[#F95700] shrink-0"
                              />
                            )}
                          </div>
                        </div>
                        <p className="text-xs font-bold text-[#111827] truncate mt-0.5">{n.title}</p>
                        <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">
                          {n.body}
                        </p>
                      </div>
                    </button>
                  );
                })}

                {hasMore && filter === 'all' && (
                  <div className="p-2.5 text-center bg-slate-50/50">
                    <button
                      type="button"
                      disabled={loadingMore}
                      onClick={() => void loadMore()}
                      className="text-[11px] font-bold text-[#F95700] hover:underline disabled:opacity-50"
                    >
                      {loadingMore ? 'Loading more...' : 'Load earlier notifications'}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onNavigateToUrl('/app/appointments');
                }}
                className="text-xs font-bold text-[#F95700] hover:underline"
              >
                Open Appointments
              </button>
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpenSettings();
                  }}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                >
                  Preferences & Devices
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
