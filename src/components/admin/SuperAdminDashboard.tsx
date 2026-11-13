import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabase';
import { PlatformSettings, Service } from '../../types/database';
import {
  AdminAppointmentRecord,
  AdminAuditRecord,
  AdminBusinessRecord,
  AdminPaymentRecord,
  AdminSmsRecord,
  AdminSubscriptionRecord,
  getEffectiveRegistrationStatus,
  isExpiringSoon,
} from '../../utils/admin-analytics';
import { calculateEndTime } from '../../utils/booking-logic';
import { AdminConfirmationModal, AdminConfirmConfig } from './AdminConfirmationModal';
import { AdminLayout, AdminNotificationItem } from './AdminLayout';
import { AdminSectionId } from './AdminTokens';
import { ExecutiveDashboardView, SystemHealthCheckItem } from './ExecutiveDashboardView';
import { AdminAppointmentsView } from './AdminAppointmentsView';
import { BusinessOverviewView, BusinessRegistrationsView } from './BusinessManagementViews';
import { BusinessSubscriptionsView, PaymentRecordsView } from './FinanceViews';
import { SMSManagementView } from './SMSManagementView';
import {
  PlatformSettingsView,
  SecurityAuditLogsView,
  SystemMonitoringView,
} from './SystemAdminViews';

interface Props {
  onNavigate?: (route: string) => void;
  onLoggedOut?: () => void;
}

export const SuperAdminDashboard: React.FC<Props> = ({ onNavigate, onLoggedOut }) => {
  const { profile, user, signOut } = useAuth();
  const [activeSection, setActiveSection] = useState<AdminSectionId>('dashboard');
  const [loading, setLoading] = useState(true);
  const [globalSearch, setGlobalSearch] = useState('');

  // Live Supabase Domain Datasets
  const [businesses, setBusinesses] = useState<AdminBusinessRecord[]>([]);
  const [appointments, setAppointments] = useState<AdminAppointmentRecord[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionRecord[]>([]);
  const [payments, setPayments] = useState<AdminPaymentRecord[]>([]);
  const [smsNotifications, setSmsNotifications] = useState<AdminSmsRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditRecord[]>([]);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings | null>(null);
  const [auditTableMissing, setAuditTableMissing] = useState(false);
  const [settingsTableMissing, setSettingsTableMissing] = useState(false);

  // Health Probe State
  const [healthChecks, setHealthChecks] = useState<SystemHealthCheckItem[]>([]);
  const [healthCheckedAt, setHealthCheckedAt] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Deep-link Inspection States
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [inspectedBusinessId, setInspectedBusinessId] = useState<string | null>(null);
  const [appointmentInitialFilterBiz, setAppointmentInitialFilterBiz] = useState<string | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<AdminConfirmConfig | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const showToast = (ok: boolean, text: string) => {
    setToast({ ok, text });
    setTimeout(() => {
      setToast((curr) => (curr?.text === text ? null : curr));
    }, 4500);
  };

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const res = await fetch('/api/admin/health');
      if (!res.ok) {
        throw new Error(`Health endpoint returned HTTP ${res.status}`);
      }
      const payload = await res.json();
      setHealthChecks(Array.isArray(payload?.checks) ? payload.checks : []);
      setHealthCheckedAt(payload?.checkedAt || new Date().toISOString());
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : 'Unable to reach /api/admin/health');
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const fetchPlatformData = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [bizRes, apptRes, svcRes, subRes, payRes, smsRes, adminAuditRes, smsAuditRes, settingsRes] =
        await Promise.all([
          supabase.from('businesses').select('*').order('created_at', { ascending: false }),
          supabase
            .from('appointments')
            .select(
              'id, business_id, service_id, customer_id, customer_name, customer_phone, appointment_date, appointment_time, end_time, status, payment_status, service_price, payment_required, payment_received, notes, created_at, updated_at, business:businesses(id, name, category, slug), service:services(id, name, duration_minutes, price)'
            )
            .order('appointment_date', { ascending: false })
            .limit(500),
          supabase.from('services').select('*').order('name'),
          supabase
            .from('business_subscriptions')
            .select('*, business:businesses(id, name, category, slug), plan:subscription_plans(name, price_ghs, billing_cycle)')
            .order('created_at', { ascending: false }),
          supabase
            .from('payment_transactions')
            .select('*, business:businesses(id, name)')
            .order('created_at', { ascending: false })
            .limit(400),
          supabase
            .from('sms_notifications')
            .select('id, business_id, notification_type, recipient, submission_status, delivery_status, error_details, sasusync_task_id, created_at')
            .order('created_at', { ascending: false })
            .limit(400),
          supabase
            .from('admin_audit_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200),
          supabase
            .from('sms_audit_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100),
          supabase.from('platform_settings').select('*').limit(1).maybeSingle(),
        ]);

      setBusinesses((bizRes.data as AdminBusinessRecord[]) || []);
      setAppointments((apptRes.data as unknown as AdminAppointmentRecord[]) || []);
      setServices((svcRes.data as Service[]) || []);
      setSubscriptions((subRes.data as unknown as AdminSubscriptionRecord[]) || []);
      setPayments((payRes.data as unknown as AdminPaymentRecord[]) || []);
      setSmsNotifications((smsRes.data as AdminSmsRecord[]) || []);

      const isMissingTable = (err: { code?: string; message?: string } | null) =>
        Boolean(err && (err.code === '42P01' || err.code === 'PGRST205' || err.message?.includes('does not exist')));

      if (isMissingTable(adminAuditRes.error)) {
        setAuditTableMissing(true);
      } else {
        setAuditTableMissing(false);
      }

      if (isMissingTable(settingsRes.error)) {
        setSettingsTableMissing(true);
      } else {
        setSettingsTableMissing(false);
        setPlatformSettings((settingsRes.data as PlatformSettings) || null);
      }

      const unifiedAudits: AdminAuditRecord[] = [
        ...((adminAuditRes.data as AdminAuditRecord[]) || []).map((a) => ({
          ...a,
          source: 'admin' as const,
        })),
        ...((smsAuditRes.data as AdminAuditRecord[]) || []).map((s) => ({
          ...s,
          source: 'sms' as const,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setAuditLogs(unifiedAudits);
    } catch (err) {
      console.error('Super Admin fetch error:', err);
      showToast(false, 'Some platform queries failed. Check database permissions or migrations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlatformData();
    fetchHealth();

    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel('super-admin-command-centre')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, () => {
        fetchPlatformData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        fetchPlatformData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_transactions' }, () => {
        fetchPlatformData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_subscriptions' }, () => {
        fetchPlatformData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_notifications' }, () => {
        fetchPlatformData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPlatformData, fetchHealth]);

  const recordAudit = async (
    action: string,
    entityType: string,
    entityId: string | null,
    details: Record<string, unknown>
  ) => {
    const supabase = getSupabase();
    if (!supabase) return;

    const entry = {
      admin_id: profile?.id || user?.id || null,
      admin_email: profile?.email || user?.email || 'samleybook@gmail.com',
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
    };

    const { error } = await supabase.from('admin_audit_logs').insert(entry);
    if (error) {
      // Fallback to sms_audit_logs if admin_audit_logs migration is not yet applied
      await supabase.from('sms_audit_logs').insert({
        admin_id: entry.admin_id,
        action,
        entity_type: entityType,
        entity_id: entityId,
        details: { ...details, admin_email: entry.admin_email },
      });
    }
  };

  // Audited Administrative Mutations
  const handleUpdateAppointmentStatus = async (
    appt: AdminAppointmentRecord,
    nextStatus: 'confirmed' | 'completed' | 'cancelled',
    reason?: string
  ) => {
    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase
      .from('appointments')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', appt.id);

    if (error) throw new Error(error.message);

    await recordAudit(`appointment_${nextStatus}`, 'appointment', appt.id, {
      previous_status: appt.status,
      next_status: nextStatus,
      business_id: appt.business_id,
      reason: reason || null,
    });

    showToast(true, `Appointment marked ${nextStatus} and logged.`);
    await fetchPlatformData();
  };

  const handleRescheduleAppointment = async (
    appt: AdminAppointmentRecord,
    newDate: string,
    newTime: string,
    reason?: string
  ) => {
    const supabase = getSupabase();
    if (!supabase) return;

    const durationMins = appt.service?.duration_minutes || 60;
    const endTime = calculateEndTime(newTime, durationMins);

    const { error } = await supabase
      .from('appointments')
      .update({
        appointment_date: newDate,
        appointment_time: newTime,
        end_time: endTime,
        updated_at: new Date().toISOString(),
      })
      .eq('id', appt.id);

    if (error) throw new Error(error.message);

    await recordAudit('appointment_rescheduled', 'appointment', appt.id, {
      previous_date: appt.appointment_date,
      previous_time: appt.appointment_time,
      new_date: newDate,
      new_time: newTime,
      reason: reason || null,
    });

    showToast(true, `Appointment rescheduled to ${newDate} at ${newTime}.`);
    await fetchPlatformData();
  };

  const handleToggleBusinessActive = async (
    biz: AdminBusinessRecord,
    nextActive: boolean,
    reason?: string
  ) => {
    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase
      .from('businesses')
      .update({ is_active: nextActive, updated_at: new Date().toISOString() })
      .eq('id', biz.id);

    if (error) throw new Error(error.message);

    await recordAudit(nextActive ? 'business_reactivated' : 'business_suspended', 'business', biz.id, {
      business_name: biz.name,
      is_active: nextActive,
      reason: reason || null,
    });

    showToast(true, `${biz.name} ${nextActive ? 'reactivated' : 'suspended'} successfully.`);
    await fetchPlatformData();
  };

  const handleApproveRegistration = async (biz: AdminBusinessRecord, reason?: string) => {
    const supabase = getSupabase();
    if (!supabase) return;

    const updatePayload: Record<string, unknown> = {
      is_active: true,
      registration_status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile?.id || user?.id || null,
      rejection_reason: null,
    };

    const { error } = await supabase.from('businesses').update(updatePayload).eq('id', biz.id);
    if (error) {
      // Fallback if optional registration columns haven't been migrated yet
      const { error: fallbackErr } = await supabase
        .from('businesses')
        .update({ is_active: true })
        .eq('id', biz.id);
      if (fallbackErr) throw new Error(fallbackErr.message);
    }

    await recordAudit('registration_approved', 'business', biz.id, {
      business_name: biz.name,
      note: reason || null,
    });

    showToast(true, `${biz.name} registration approved.`);
    await fetchPlatformData();
  };

  const handleRejectRegistration = async (biz: AdminBusinessRecord, reason: string) => {
    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase
      .from('businesses')
      .update({
        is_active: false,
        registration_status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: profile?.id || user?.id || null,
        rejection_reason: reason,
      })
      .eq('id', biz.id);

    if (error) {
      const { error: fallbackErr } = await supabase
        .from('businesses')
        .update({ is_active: false })
        .eq('id', biz.id);
      if (fallbackErr) throw new Error(fallbackErr.message);
    }

    await recordAudit('registration_rejected', 'business', biz.id, {
      business_name: biz.name,
      reason,
    });

    showToast(true, `${biz.name} registration rejected and recorded.`);
    await fetchPlatformData();
  };

  const handleUpdateSubscriptionStatus = async (
    sub: AdminSubscriptionRecord,
    nextStatus: AdminSubscriptionRecord['status'],
    reason?: string
  ) => {
    const supabase = getSupabase();
    if (!supabase) return;

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const payload: Record<string, unknown> = {
      status: nextStatus,
      updated_at: now.toISOString(),
    };
    if (nextStatus === 'active') {
      payload.payment_status = 'paid';
      payload.current_period_start = now.toISOString();
      payload.current_period_end = periodEnd.toISOString();
    }

    const { error } = await supabase.from('business_subscriptions').update(payload).eq('id', sub.id);
    if (error) throw new Error(error.message);

    await recordAudit('subscription_status_updated', 'business_subscription', sub.id, {
      business_id: sub.business_id,
      previous_status: sub.status,
      next_status: nextStatus,
      reason: reason || null,
    });

    showToast(true, `Subscription updated to ${nextStatus}.`);
    await fetchPlatformData();
  };

  const handleSavePlatformSettings = async (updated: Partial<PlatformSettings>) => {
    const supabase = getSupabase();
    if (!supabase) return;

    if (platformSettings?.id) {
      const { error } = await supabase
        .from('platform_settings')
        .update({
          ...updated,
          updated_at: new Date().toISOString(),
          updated_by: profile?.id || user?.id || null,
        })
        .eq('id', platformSettings.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from('platform_settings').insert({
        ...updated,
        updated_by: profile?.id || user?.id || null,
      });
      if (error) throw new Error(error.message);
    }

    await recordAudit('platform_settings_updated', 'platform_settings', platformSettings?.id || null, {
      updated_fields: Object.keys(updated),
    });

    await fetchPlatformData();
  };

  // Actionable Header Notifications
  const pendingRegistrationsCount = useMemo(
    () => businesses.filter((b) => getEffectiveRegistrationStatus(b) === 'pending').length,
    [businesses]
  );

  const failedSms24hCount = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return smsNotifications.filter(
      (s) =>
        (s.delivery_status === 'failed' || s.delivery_status === 'expired') &&
        new Date(s.created_at).getTime() >= cutoff
    ).length;
  }, [smsNotifications]);

  const notifications: AdminNotificationItem[] = useMemo(() => {
    const list: AdminNotificationItem[] = [];
    if (pendingRegistrationsCount > 0) {
      list.push({
        id: 'pending-reg',
        title: `${pendingRegistrationsCount} Business Registration(s) Pending`,
        detail: 'Review and approve or reject new onboarding requests.',
        tone: 'warning',
        targetSection: 'registrations',
      });
    }
    if (failedSms24hCount > 0) {
      list.push({
        id: 'failed-sms',
        title: `${failedSms24hCount} Failed SMS in Last 24h`,
        detail: 'Inspect gateway errors in SMS Management.',
        tone: 'danger',
        targetSection: 'sms',
      });
    }
    const expiringCount = subscriptions.filter((s) => isExpiringSoon(s)).length;
    if (expiringCount > 0) {
      list.push({
        id: 'expiring-subs',
        title: `${expiringCount} Subscription(s) Expiring Within 3 Days`,
        detail: 'Monitor renewals under Business Subscriptions.',
        tone: 'info',
        targetSection: 'subscriptions',
      });
    }
    return list;
  }, [pendingRegistrationsCount, failedSms24hCount, subscriptions]);

  const handleGlobalSearchSubmit = (q: string) => {
    const lower = q.toLowerCase();
    const matchedBiz = businesses.find((b) => b.name.toLowerCase().includes(lower));
    if (matchedBiz) {
      setInspectedBusinessId(matchedBiz.id);
      setActiveSection('businesses');
      return;
    }
    setActiveSection('appointments');
  };

  const handleSignOut = async () => {
    await signOut();
    if (onLoggedOut) {
      onLoggedOut();
    } else if (onNavigate) {
      onNavigate('/app/login');
    }
  };

  const isAuthorizedSuperAdmin =
    profile?.role === 'super_admin' ||
    (user?.email || '').toLowerCase().trim() === 'samleybook@gmail.com';

  if (profile && !isAuthorizedSuperAdmin) {
    return (
      <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full rounded-2xl bg-white border border-slate-200 shadow-sm p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto font-extrabold text-lg">
            !
          </div>
          <h2 className="text-base font-bold text-[#14243B]">Super Admin Access Required</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Your signed-in account does not hold Super Administrator privileges. Please return to your Business Dashboard or sign in with an administrator account.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigate?.('/app/dashboard')}
              className="px-4 py-2 rounded-xl bg-[#14243B] text-white text-xs font-bold hover:bg-[#1e3352] transition"
            >
              Return to Portal
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout
      activeSection={activeSection}
      onSelectSection={(sec) => {
        setActiveSection(sec);
        if (sec !== 'appointments') {
          setAppointmentInitialFilterBiz(null);
        }
      }}
      onSignOut={handleSignOut}
      adminName={profile?.full_name || 'Super Admin'}
      adminEmail={profile?.email || user?.email || 'samleybook@gmail.com'}
      globalSearch={globalSearch}
      onGlobalSearchChange={setGlobalSearch}
      onGlobalSearchSubmit={handleGlobalSearchSubmit}
      notifications={notifications}
      pendingRegistrationsCount={pendingRegistrationsCount}
      failedSmsCount={failedSms24hCount}
      onRefreshAll={() => {
        fetchPlatformData();
        fetchHealth();
      }}
      isRefreshing={loading || healthLoading}
    >
      {toast && (
        <div
          className={`mb-5 px-4 py-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
            toast.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} className="text-[11px] underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {activeSection === 'dashboard' && (
        <ExecutiveDashboardView
          businesses={businesses}
          appointments={appointments}
          subscriptions={subscriptions}
          payments={payments}
          smsNotifications={smsNotifications}
          auditLogs={auditLogs}
          healthChecks={healthChecks}
          healthError={healthError}
          onNavigateSection={(sec) => setActiveSection(sec)}
          onInspectBusiness={(bizId) => {
            setInspectedBusinessId(bizId);
            setActiveSection('businesses');
          }}
          onInspectAppointment={(appt) => {
            setSelectedAppointmentId(appt.id);
            setActiveSection('appointments');
          }}
        />
      )}

      {activeSection === 'businesses' && (
        <BusinessOverviewView
          businesses={businesses}
          subscriptions={subscriptions}
          appointments={appointments}
          services={services}
          inspectedBusinessId={inspectedBusinessId}
          onInspectBusinessId={setInspectedBusinessId}
          onToggleBusinessActive={handleToggleBusinessActive}
          onRequestConfirm={setConfirmConfig}
          onViewBusinessAppointments={(bizId) => {
            setAppointmentInitialFilterBiz(bizId);
            setInspectedBusinessId(null);
            setActiveSection('appointments');
          }}
          initialSearch={globalSearch}
        />
      )}

      {activeSection === 'registrations' && (
        <BusinessRegistrationsView
          businesses={businesses}
          onApproveRegistration={handleApproveRegistration}
          onRejectRegistration={handleRejectRegistration}
          onRequestConfirm={setConfirmConfig}
          onInspectBusiness={(bizId) => {
            setInspectedBusinessId(bizId);
            setActiveSection('businesses');
          }}
        />
      )}

      {activeSection === 'appointments' && (
        <AdminAppointmentsView
          key={appointmentInitialFilterBiz || 'all-appts'}
          appointments={
            appointmentInitialFilterBiz
              ? appointments.filter((a) => a.business_id === appointmentInitialFilterBiz)
              : appointments
          }
          businesses={businesses}
          selectedAppointmentId={selectedAppointmentId}
          onSelectAppointmentId={setSelectedAppointmentId}
          onRequestConfirm={setConfirmConfig}
          onUpdateAppointmentStatus={handleUpdateAppointmentStatus}
          onRescheduleAppointment={handleRescheduleAppointment}
          onViewBusiness={(bizId) => {
            setInspectedBusinessId(bizId);
            setActiveSection('businesses');
          }}
          initialSearch={globalSearch}
        />
      )}

      {activeSection === 'subscriptions' && (
        <BusinessSubscriptionsView
          subscriptions={subscriptions}
          onUpdateSubscriptionStatus={handleUpdateSubscriptionStatus}
          onRequestConfirm={setConfirmConfig}
        />
      )}

      {activeSection === 'payments' && <PaymentRecordsView payments={payments} />}

      {activeSection === 'sms' && <SMSManagementView />}

      {activeSection === 'settings' && (
        <PlatformSettingsView
          settings={platformSettings}
          settingsTableMissing={settingsTableMissing}
          onSaveSettings={handleSavePlatformSettings}
        />
      )}

      {activeSection === 'audit' && (
        <SecurityAuditLogsView logs={auditLogs} auditTableMissing={auditTableMissing} />
      )}

      {activeSection === 'monitoring' && (
        <SystemMonitoringView
          checks={healthChecks}
          checkedAt={healthCheckedAt}
          healthError={healthError}
          loading={healthLoading}
          onRefreshHealth={fetchHealth}
          dbStats={{
            businesses: businesses.length,
            appointments: appointments.length,
            failedSms24h: failedSms24hCount,
            pendingPayments: payments.filter((p) => p.status === 'pending').length,
          }}
        />
      )}

      <AdminConfirmationModal
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
      />
    </AdminLayout>
  );
};
