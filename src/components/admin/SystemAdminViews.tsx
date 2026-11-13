import React, { useMemo, useState } from 'react';
import {
  Save,
  Check,
  Copy,
  Database,
  ShieldAlert,
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Search,
  Server,
} from 'lucide-react';
import { PlatformSettings } from '../../types/database';
import { SUPABASE_SQL_SCHEMA } from '../../lib/sqlScript';
import { AdminAuditRecord } from '../../utils/admin-analytics';
import { SystemHealthCheckItem } from './ExecutiveDashboardView';
import { ADMIN_CARD, formatAdminDateTime } from './AdminTokens';

interface PlatformSettingsViewProps {
  settings: PlatformSettings | null;
  settingsTableMissing: boolean;
  onSaveSettings: (updated: Partial<PlatformSettings>) => Promise<void>;
}

export const PlatformSettingsView: React.FC<PlatformSettingsViewProps> = ({
  settings,
  settingsTableMissing,
  onSaveSettings,
}) => {
  const [platformName, setPlatformName] = useState(settings?.platform_name || 'SamleyBook');
  const [tagline, setTagline] = useState(settings?.tagline || 'Book • Manage • Grow');
  const [allowNewRegistrations, setAllowNewRegistrations] = useState(
    settings?.allow_new_registrations ?? true
  );
  const [requireApproval, setRequireApproval] = useState(
    settings?.require_registration_approval ?? false
  );
  const [defaultTrialDays, setDefaultTrialDays] = useState(settings?.default_trial_days ?? 7);
  const [subscriptionPrice, setSubscriptionPrice] = useState(
    settings?.subscription_price_ghs ?? 120
  );
  const [periodDays, setPeriodDays] = useState(settings?.subscription_period_days ?? 30);
  const [timezone, setTimezone] = useState(settings?.timezone || 'Africa/Accra');
  const [emailAlerts, setEmailAlerts] = useState(settings?.email_alerts_enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await onSaveSettings({
        platform_name: platformName.trim() || 'SamleyBook',
        tagline: tagline.trim() || 'Book • Manage • Grow',
        allow_new_registrations: allowNewRegistrations,
        require_registration_approval: requireApproval,
        default_trial_days: Number(defaultTrialDays) || 7,
        subscription_price_ghs: Number(subscriptionPrice) || 120,
        subscription_period_days: Number(periodDays) || 30,
        timezone,
        email_alerts_enabled: emailAlerts,
      });
      setFeedback({ ok: true, text: 'Platform settings saved and recorded in Security & Audit Logs.' });
    } catch (err) {
      setFeedback({
        ok: false,
        text: err instanceof Error ? err.message : 'Unable to save platform settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="space-y-6">
      {settingsTableMissing && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <p className="font-bold">Database migration required for persistent global settings</p>
          <p className="mt-1">
            Run the updated SQL setup script below in your Supabase SQL Editor to create{' '}
            <code className="font-mono">platform_settings</code> and <code className="font-mono">admin_audit_logs</code>.
          </p>
        </div>
      )}

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold ${
            feedback.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <form onSubmit={handleSave} className={`${ADMIN_CARD} p-6 space-y-5`}>
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-[#14243B]">Global Platform Configuration</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Operational settings stored in Supabase (non-secret; API keys remain strictly server-side).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#14243B] mb-1">Platform Name</label>
            <input
              type="text"
              value={platformName}
              onChange={(e) => setPlatformName(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#E87936]/30"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#14243B] mb-1">Platform Tagline</label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#E87936]/30"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#14243B] mb-1">
              Standard Subscription Price (GH₵)
            </label>
            <input
              type="number"
              min={1}
              step="0.01"
              value={subscriptionPrice}
              onChange={(e) => setSubscriptionPrice(Number(e.target.value))}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#E87936]/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#14243B] mb-1">Trial Days</label>
              <input
                type="number"
                min={0}
                value={defaultTrialDays}
                onChange={(e) => setDefaultTrialDays(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#E87936]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#14243B] mb-1">Billing Period (Days)</label>
              <input
                type="number"
                min={1}
                value={periodDays}
                onChange={(e) => setPeriodDays(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#E87936]/30"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#14243B] mb-1">Default Timezone</label>
            <input
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#E87936]/30"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <label className="p-3.5 rounded-xl bg-[#F5F6F8] border border-slate-200/80 flex items-center justify-between gap-2 text-xs font-semibold text-[#14243B] cursor-pointer">
            <span>Allow New Registrations</span>
            <input
              type="checkbox"
              checked={allowNewRegistrations}
              onChange={(e) => setAllowNewRegistrations(e.target.checked)}
              className="w-4 h-4 accent-[#E87936]"
            />
          </label>
          <label className="p-3.5 rounded-xl bg-[#F5F6F8] border border-slate-200/80 flex items-center justify-between gap-2 text-xs font-semibold text-[#14243B] cursor-pointer">
            <span>Require Manual Approval</span>
            <input
              type="checkbox"
              checked={requireApproval}
              onChange={(e) => setRequireApproval(e.target.checked)}
              className="w-4 h-4 accent-[#E87936]"
            />
          </label>
          <label className="p-3.5 rounded-xl bg-[#F5F6F8] border border-slate-200/80 flex items-center justify-between gap-2 text-xs font-semibold text-[#14243B] cursor-pointer">
            <span>Email Notification Alerts</span>
            <input
              type="checkbox"
              checked={emailAlerts}
              onChange={(e) => setEmailAlerts(e.target.checked)}
              className="w-4 h-4 accent-[#E87936]"
            />
          </label>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#E87936] hover:bg-[#d66a29] text-white text-xs font-bold transition disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save Platform Settings'}</span>
          </button>
        </div>
      </form>

      {/* SQL Schema Reference */}
      <div className={`${ADMIN_CARD} p-6 space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#E87936]" />
            <div>
              <h3 className="text-sm font-bold text-[#14243B]">Supabase Database Schema Script</h3>
              <p className="text-xs text-slate-500">
                Complete idempotent SQL schema including RLS policies, SMS management, and audit logs.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopySql}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-[#14243B] hover:border-[#E87936] hover:text-[#E87936] transition"
          >
            {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedSql ? 'Copied SQL Script' : 'Copy Full SQL Script'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface SecurityAuditLogsViewProps {
  logs: AdminAuditRecord[];
  auditTableMissing: boolean;
}

export const SecurityAuditLogsView: React.FC<SecurityAuditLogsViewProps> = ({
  logs,
  auditTableMissing,
}) => {
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('all');

  const entities = useMemo(
    () => Array.from(new Set(logs.map((l) => l.entity_type).filter(Boolean))).sort(),
    [logs]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (entityFilter !== 'all' && l.entity_type !== entityFilter) return false;
      if (q) {
        return (
          l.action.toLowerCase().includes(q) ||
          l.entity_type.toLowerCase().includes(q) ||
          (l.entity_id || '').toLowerCase().includes(q) ||
          (l.admin_email || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logs, search, entityFilter]);

  return (
    <div className="space-y-5">
      {auditTableMissing && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <p className="font-bold">Unified admin_audit_logs table not detected yet</p>
          <p className="mt-0.5">
            Currently displaying historical SMS audit records. Run the latest migration in Platform Settings to log all appointment, business, and subscription interventions.
          </p>
        </div>
      )}

      <div className={`${ADMIN_CARD} p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between`}>
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search action, actor email, entity ID..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-[#F5F6F8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E87936]/30"
          />
        </div>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          aria-label="Filter by entity type"
          className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-[#14243B]"
        >
          <option value="all">All Event Entities</option>
          {entities.map((ent) => (
            <option key={ent} value={ent}>
              {ent}
            </option>
          ))}
        </select>
      </div>

      <div className={`${ADMIN_CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F5F6F8] text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200/80">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Target Entity</th>
                <th className="py-3 px-4">Context Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500 text-xs">
                    No audit trail records logged yet.
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 text-slate-600 tabular-nums whitespace-nowrap">
                      {formatAdminDateTime(log.created_at)}
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#14243B]">
                      {log.admin_email || log.admin_id?.slice(0, 8) || 'Super Admin'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#14243B]/5 text-[#14243B] border border-slate-200">
                        <ShieldAlert className="w-3 h-3 text-[#E87936]" />
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                      {log.entity_type}
                      {log.entity_id ? ` · ${log.entity_id.slice(0, 8)}` : ''}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-slate-500 max-w-xs truncate">
                      {log.details ? JSON.stringify(log.details) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

interface SystemMonitoringViewProps {
  checks: SystemHealthCheckItem[];
  checkedAt: string | null;
  healthError: string | null;
  loading: boolean;
  onRefreshHealth: () => void;
  dbStats: {
    businesses: number;
    appointments: number;
    failedSms24h: number;
    pendingPayments: number;
  };
}

export const SystemMonitoringView: React.FC<SystemMonitoringViewProps> = ({
  checks,
  checkedAt,
  healthError,
  loading,
  onRefreshHealth,
  dbStats,
}) => {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">
            Last server probe:{' '}
            <strong className="text-[#14243B] tabular-nums">
              {checkedAt ? formatAdminDateTime(checkedAt) : 'Not checked yet'}
            </strong>
          </p>
        </div>
        <button
          type="button"
          onClick={onRefreshHealth}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-[#14243B] hover:border-[#E87936] hover:text-[#E87936] transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Run Live Health Probe</span>
        </button>
      </div>

      {/* Real Operational Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`${ADMIN_CARD} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Indexed Businesses
          </p>
          <p className="text-2xl font-extrabold text-[#14243B] mt-1 tabular-nums">{dbStats.businesses}</p>
        </div>
        <div className={`${ADMIN_CARD} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Indexed Appointments
          </p>
          <p className="text-2xl font-extrabold text-[#14243B] mt-1 tabular-nums">{dbStats.appointments}</p>
        </div>
        <div className={`${ADMIN_CARD} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Failed SMS (Last 24h)
          </p>
          <p className={`text-2xl font-extrabold mt-1 tabular-nums ${dbStats.failedSms24h > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
            {dbStats.failedSms24h}
          </p>
        </div>
        <div className={`${ADMIN_CARD} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Unverified Payments
          </p>
          <p className="text-2xl font-extrabold text-amber-700 mt-1 tabular-nums">
            {dbStats.pendingPayments}
          </p>
        </div>
      </div>

      {/* Live Infrastructure Checks */}
      {healthError ? (
        <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
          <p className="font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Server Health Endpoint Unavailable
          </p>
          <p>{healthError}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {checks.map((chk) => (
            <div key={chk.key} className={`${ADMIN_CARD} p-5 flex items-start justify-between gap-3`}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#F5F6F8] flex items-center justify-center shrink-0">
                  {chk.key === 'database' ? (
                    <Database className="w-4 h-4 text-[#14243B]" />
                  ) : chk.key === 'cron' ? (
                    <Activity className="w-4 h-4 text-[#14243B]" />
                  ) : (
                    <Server className="w-4 h-4 text-[#14243B]" />
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[#14243B]">{chk.label}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{chk.detail}</p>
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border capitalize shrink-0 ${
                  chk.status === 'healthy'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : chk.status === 'degraded'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : chk.status === 'unconfigured'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {chk.status === 'healthy' ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <AlertTriangle className="w-3 h-3" />
                )}
                {chk.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
