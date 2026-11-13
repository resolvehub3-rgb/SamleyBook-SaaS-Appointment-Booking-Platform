import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Calendar, CheckCheck, Clock } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useBusiness } from '../../../context/BusinessContext';
import { formatTime12h } from '../../../utils/dashboard-analytics';

interface Props {
  onOpenAppointments: () => void;
}

export const NotificationsDropdown: React.FC<Props> = ({ onOpenAppointments }) => {
  const { currentBusiness, appointments } = useBusiness();
  const [open, setOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  const storageKey = currentBusiness?.id
    ? `samley_read_notifications_${currentBusiness.id}`
    : 'samley_read_notifications';

  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setReadIds(raw ? JSON.parse(raw) : []);
    } catch {
      setReadIds([]);
    }
  }, [storageKey]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Derive real notifications from recent pending/confirmed bookings
  const notifications = useMemo(() => {
    return [...appointments]
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 8)
      .map((a) => ({
        id: a.id,
        title:
          a.status === 'pending'
            ? `Pending approval: ${a.customer_name}`
            : a.status === 'cancelled'
            ? `Booking cancelled: ${a.customer_name}`
            : `New booking: ${a.customer_name}`,
        subtitle: `${a.service?.name || 'Service'} • ${a.appointment_date} at ${formatTime12h(
          a.appointment_time
        )}`,
        status: a.status,
        createdAt: a.created_at,
      }));
  }, [appointments]);

  const readSet = new Set(readIds);
  const unreadCount = notifications.filter((n) => !readSet.has(n.id)).length;

  const markAllRead = () => {
    const allIds = notifications.map((n) => n.id);
    setReadIds(allIds);
    try {
      localStorage.setItem(storageKey, JSON.stringify(allIds));
    } catch {
      // ignore
    }
  };

  const handleItemClick = (id: string) => {
    const next = Array.from(new Set([...readIds, id]));
    setReadIds(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // ignore
    }
    setOpen(false);
    onOpenAppointments();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={open}
        className="relative w-10 h-10 md:w-11 md:h-11 rounded-full bg-white border border-slate-200/80 shadow-[0_2px_8px_rgba(15,23,42,0.05)] flex items-center justify-center text-slate-700 hover:border-orange-300 hover:text-[#F95700] transition"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#EF4444] text-white text-[10px] font-extrabold flex items-center justify-center shadow-xs border-2 border-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200/90 z-50 overflow-hidden text-left"
          >
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div>
                <p className="text-xs font-extrabold text-[#111827]">Notifications</p>
                <p className="text-[11px] text-slate-500">
                  {unreadCount > 0
                    ? `${unreadCount} unread booking update${unreadCount !== 1 ? 's' : ''}`
                    : 'All caught up'}
                </p>
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#F95700] hover:underline"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Bell className="w-6 h-6 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-700">No notifications yet</p>
                <p className="text-[11px] text-slate-400">
                  Incoming customer bookings and status updates will appear here.
                </p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {notifications.map((n) => {
                  const isUnread = !readSet.has(n.id);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleItemClick(n.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition flex items-start gap-3 ${
                        isUnread ? 'bg-orange-50/35' : ''
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          n.status === 'pending'
                            ? 'bg-amber-100 text-amber-700'
                            : n.status === 'cancelled'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-[#FFF3EC] text-[#F95700]'
                        }`}
                      >
                        {n.status === 'pending' ? (
                          <Clock className="w-4 h-4" />
                        ) : (
                          <Calendar className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-[#111827] truncate">{n.title}</p>
                          {isUnread && (
                            <span className="w-2 h-2 rounded-full bg-[#F95700] shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{n.subtitle}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/70">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenAppointments();
                }}
                className="w-full text-center text-xs font-bold text-[#F95700] hover:underline"
              >
                Open Appointments Workspace
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
