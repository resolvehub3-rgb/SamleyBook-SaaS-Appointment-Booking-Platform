import React, { useEffect, useState } from 'react';
import {
  MessageSquare,
  Send,
  Settings,
  FileText,
  History,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabase';
import { ADMIN_CARD, formatAdminDateTime } from './AdminTokens';

interface SmsNotification {
  id: string;
  business_id: string | null;
  customer_id: string | null;
  appointment_id: string | null;
  notification_type: string;
  recipient: string;
  message: string;
  sasusync_task_id: string | null;
  sasusync_message_id: string | null;
  submission_status: string;
  delivery_status: string;
  error_details: string | null;
  created_at: string;
  updated_at: string;
}

interface SmsTemplate {
  id: string;
  template_key: string;
  name: string;
  notification_type: string;
  content: string;
  is_enabled: boolean;
  placeholders: string[];
  updated_at: string;
}

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'config', label: 'Configuration', icon: Settings },
  { id: 'test', label: 'Send Test', icon: Send },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'history', label: 'History', icon: History },
  { id: 'usage', label: 'Business Usage', icon: BarChart3 },
];

export const SMSManagementView: React.FC = () => {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [businesses, setBusinesses] = useState<{ id: string; name: string }[]>([]);
  const [notifications, setNotifications] = useState<SmsNotification[]>([]);
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [config, setConfig] = useState<{
    provider?: string;
    configured?: boolean;
    senderId?: string | null;
    baseUrl?: string | null;
    smsEnabled?: boolean;
    hasApiKey?: boolean;
    hasWebhookSecret?: boolean;
  } | null>(null);
  const [dateFilter, setDateFilter] = useState('7d');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(0);
  const [testPhone, setTestPhone] = useState('');
  const [testResult, setTestResult] = useState<{
    ok?: boolean;
    taskId?: string;
    error?: string;
    skipped?: boolean;
    reason?: string;
  } | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplate | null>(null);
  const [feedback, setFeedback] = useState<{ success: boolean; text: string } | null>(null);

  const supabase = getSupabase();

  const fetchAll = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data: bData } = await supabase.from('businesses').select('id, name').order('name');
      setBusinesses((bData as { id: string; name: string }[]) || []);

      const { data: nData } = await supabase
        .from('sms_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      setNotifications((nData as SmsNotification[]) || []);

      const { data: tData } = await supabase.from('sms_templates').select('*').order('name');
      setTemplates((tData as SmsTemplate[]) || []);

      const res = await fetch('/api/sms/config');
      if (res.ok) {
        const cfg = await res.json();
        setConfig(cfg);
      }
    } catch (err) {
      console.error('SMS fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const businessName = (id: string | null) => businesses.find((b) => b.id === id)?.name || '—';

  const filteredByDate = (items: SmsNotification[]) => {
    const now = new Date();
    let start: Date | null = null;
    if (dateFilter === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (dateFilter === '7d') {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (dateFilter === '30d') {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    if (!start) return items;
    return items.filter((n) => new Date(n.created_at) >= start!);
  };

  const dateFiltered = filteredByDate(notifications);

  const metrics = {
    total: dateFiltered.length,
    delivered: dateFiltered.filter((n) => n.delivery_status === 'delivered').length,
    failed: dateFiltered.filter((n) => n.delivery_status === 'failed' || n.delivery_status === 'expired').length,
    pending: dateFiltered.filter(
      (n) => n.delivery_status === 'queued' || n.delivery_status === 'sent' || n.delivery_status === 'pending'
    ).length,
    successRate: dateFiltered.length
      ? Math.round(
          (dateFiltered.filter((n) => n.delivery_status === 'delivered').length / dateFiltered.length) * 100
        )
      : 0,
    businesses: new Set(dateFiltered.map((n) => n.business_id).filter(Boolean)).size,
  };

  const handleToggleSms = async (enabled: boolean) => {
    try {
      const {
        data: { session },
      } = await supabase!.auth.getSession();
      const res = await fetch('/api/sms/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ smsEnabled: enabled, adminId: profile?.id }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setConfig((c) => ({ ...(c || {}), smsEnabled: enabled }));
        await supabase!.from('sms_audit_logs').insert({
          admin_id: profile?.id,
          action: enabled ? 'sms_enabled' : 'sms_disabled',
          entity_type: 'sms_platform_settings',
          details: { smsEnabled: enabled },
        });
        setFeedback({ success: true, text: `SMS sending ${enabled ? 'enabled' : 'disabled'}.` });
      } else {
        setFeedback({ success: false, text: data?.error || 'Failed to update SMS setting.' });
      }
    } catch {
      setFeedback({ success: false, text: 'Failed to update SMS setting.' });
    }
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestLoading(true);
    setTestResult(null);
    try {
      const {
        data: { session },
      } = await supabase!.auth.getSession();
      const res = await fetch('/api/sms/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ recipient: testPhone }),
      });
      const data = await res.json();
      setTestResult(data);
      await fetchAll();
    } catch {
      setTestResult({ ok: false, error: 'Request failed' });
    } finally {
      setTestLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    try {
      await supabase!
        .from('sms_templates')
        .update({ content: editingTemplate.content, is_enabled: editingTemplate.is_enabled })
        .eq('id', editingTemplate.id);
      await supabase!.from('sms_audit_logs').insert({
        admin_id: profile?.id,
        action: 'template_updated',
        entity_type: 'sms_template',
        entity_id: editingTemplate.id,
        details: { template_key: editingTemplate.template_key },
      });
      setFeedback({ success: true, text: 'SMS template saved and logged.' });
      setEditingTemplate(null);
      fetchAll();
    } catch {
      setFeedback({ success: false, text: 'Failed to save template.' });
    }
  };

  const historyFiltered = notifications.filter((n) => {
    const q = historySearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      n.recipient.toLowerCase().includes(q) ||
      (businessName(n.business_id) || '').toLowerCase().includes(q) ||
      (n.sasusync_task_id || '').toLowerCase().includes(q);
    let matchesFilter = true;
    if (historyFilter !== 'all') {
      if (['delivered', 'failed', 'pending', 'queued', 'sent', 'expired'].includes(historyFilter)) {
        matchesFilter = n.delivery_status === historyFilter;
      } else {
        matchesFilter = n.notification_type === historyFilter;
      }
    }
    return matchesSearch && matchesFilter;
  });

  const pageSize = 15;
  const pagedHistory = historyFiltered.slice(historyPage * pageSize, (historyPage + 1) * pageSize);
  const totalPages = Math.ceil(historyFiltered.length / pageSize);

  const usageByBusiness = businesses.map((b) => {
    const related = dateFiltered.filter((n) => n.business_id === b.id);
    return {
      id: b.id,
      name: b.name,
      total: related.length,
      delivered: related.filter((n) => n.delivery_status === 'delivered').length,
      failed: related.filter((n) => n.delivery_status === 'failed' || n.delivery_status === 'expired').length,
      pending: related.filter(
        (n) => n.delivery_status === 'queued' || n.delivery_status === 'sent' || n.delivery_status === 'pending'
      ).length,
      lastActivity: related.length ? related[0].created_at : null,
    };
  });

  const platformMessages = dateFiltered.filter((n) => !n.business_id);

  const badgeForStatus = (status: string) =>
    status === 'delivered'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'failed' || status === 'expired'
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  active
                    ? 'bg-[#14243B] text-white shadow-xs'
                    : 'bg-white border border-slate-200/80 text-slate-600 hover:text-[#14243B]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={fetchAll}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-[#14243B] font-bold text-xs hover:border-[#E87936] hover:text-[#E87936] transition disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Refreshing...' : 'Refresh SMS Data'}</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold border ${
            feedback.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500 mr-1">Timeframe:</span>
              {['today', '7d', '30d', 'all'].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setDateFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition ${
                    dateFilter === f
                      ? 'bg-[#E87936] text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:text-[#14243B]'
                  }`}
                >
                  {f === 'today' ? 'Today' : f === '7d' ? '7 Days' : f === '30d' ? '30 Days' : 'All'}
                </button>
              ))}
            </div>

            {metrics.failed > 0 && (
              <button
                type="button"
                onClick={() => {
                  setHistoryFilter('failed');
                  setActiveTab('history');
                }}
                className="text-xs font-bold text-red-600 hover:underline tabular-nums"
              >
                Inspect {metrics.failed} Failed Deliveries →
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Total SMS', value: metrics.total, color: 'text-[#14243B]' },
              { label: 'Delivered', value: metrics.delivered, color: 'text-emerald-700' },
              { label: 'Failed', value: metrics.failed, color: 'text-red-600' },
              { label: 'Pending / Queued', value: metrics.pending, color: 'text-amber-700' },
              { label: 'Success Rate', value: `${metrics.successRate}%`, color: 'text-[#E87936]' },
              { label: 'Active Tenants', value: metrics.businesses, color: 'text-[#14243B]' },
            ].map((m) => (
              <div key={m.label} className={`${ADMIN_CARD} p-4 space-y-1`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {m.label}
                </span>
                <p className={`text-2xl font-extrabold tabular-nums ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          <div className={`${ADMIN_CARD} overflow-hidden`}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-bold text-[#14243B]">Recent SMS Activity</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F5F6F8] text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200/80">
                  <tr>
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Business</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Task ID</th>
                    <th className="py-3 px-4">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dateFiltered.slice(0, 10).map((n) => (
                    <tr key={n.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-semibold text-[#14243B]">{n.recipient}</td>
                      <td className="py-3 px-4 text-[#14243B]">{businessName(n.business_id)}</td>
                      <td className="py-3 px-4 text-slate-600">{n.notification_type.replace(/_/g, ' ')}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${badgeForStatus(
                            n.delivery_status
                          )}`}
                        >
                          {n.delivery_status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[10px] text-slate-400">
                        {n.sasusync_task_id || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-500 tabular-nums">
                        {formatAdminDateTime(n.created_at)}
                      </td>
                    </tr>
                  ))}
                  {dateFiltered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 text-xs">
                        No SMS activity in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Configuration */}
      {activeTab === 'config' && (
        <div className={`${ADMIN_CARD} p-6 space-y-5`}>
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-[#14243B]">SasuSync Gateway Configuration</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Secrets stay server-side only; readiness indicators confirm environment variables.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {[
              { label: 'Provider', value: config?.provider || 'SasuSync' },
              { label: 'Integration Status', value: config?.configured ? 'Configured' : 'Not Configured' },
              { label: 'Sender ID', value: config?.senderId || '—' },
              { label: 'API Base URL', value: config?.baseUrl || '—' },
              { label: 'API Key', value: config?.hasApiKey ? 'Configured (Hidden)' : 'Missing' },
              { label: 'Webhook Secret', value: config?.hasWebhookSecret ? 'Configured (Hidden)' : 'Missing' },
            ].map((row) => (
              <div key={row.label} className="p-4 rounded-xl bg-[#F5F6F8] border border-slate-200/70">
                <p className="text-[10px] font-bold uppercase text-slate-500">{row.label}</p>
                <p className="font-bold text-[#14243B] mt-1 truncate">{row.value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <span className="text-xs font-bold text-[#14243B]">Global SMS Dispatch:</span>
            <button
              type="button"
              onClick={() => handleToggleSms(!config?.smsEnabled)}
              aria-label="Toggle global SMS sending"
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                config?.smsEnabled ? 'bg-[#E87936]' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  config?.smsEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-xs font-semibold text-slate-600">
              {config?.smsEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      )}

      {/* Send Test */}
      {activeTab === 'test' && (
        <div className={`${ADMIN_CARD} p-6 space-y-4 max-w-lg`}>
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-[#14243B]">Send Test SMS</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Dispatch a live verification message through the configured SasuSync gateway.
            </p>
          </div>
          <form onSubmit={handleSendTest} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#14243B] mb-1">
                Destination Phone Number
              </label>
              <input
                type="tel"
                required
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="0552148347 or 233552148347"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#E87936]/30 focus:border-[#E87936]"
              />
            </div>
            <button
              type="submit"
              disabled={testLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#E87936] hover:bg-[#d66a29] text-white font-bold text-xs transition disabled:opacity-50"
            >
              {testLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{testLoading ? 'Sending...' : 'Send Test SMS'}</span>
            </button>
          </form>
          {testResult && (
            <div
              className={`p-4 rounded-xl text-xs border ${
                testResult.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <p className="font-bold">{testResult.ok ? 'Request Accepted' : 'Failed'}</p>
              {testResult.taskId && <p className="mt-1 font-mono">Task ID: {testResult.taskId}</p>}
              {testResult.error && <p className="mt-1">{testResult.error}</p>}
              {testResult.skipped && <p className="mt-1">Skipped: {testResult.reason}</p>}
            </div>
          )}
        </div>
      )}

      {/* Templates */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          {editingTemplate ? (
            <div className={`${ADMIN_CARD} p-6 space-y-4`}>
              <h3 className="text-sm font-bold text-[#14243B]">{editingTemplate.name}</h3>
              <p className="text-[11px] text-slate-500">
                Placeholders: {editingTemplate.placeholders.join(', ') || 'none'}
              </p>
              <textarea
                rows={5}
                value={editingTemplate.content}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, content: e.target.value })}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#E87936]/30"
              />
              <label className="flex items-center gap-2 text-xs font-semibold text-[#14243B]">
                <input
                  type="checkbox"
                  checked={editingTemplate.is_enabled}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, is_enabled: e.target.checked })
                  }
                  className="accent-[#E87936]"
                />
                Enabled
              </label>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTemplate(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  className="px-5 py-2 rounded-xl bg-[#E87936] hover:bg-[#d66a29] text-white font-bold text-xs"
                >
                  Save Template
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((t) => (
                <div key={t.id} className={`${ADMIN_CARD} p-5 space-y-3`}>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-[#14243B]">{t.name}</h4>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        t.is_enabled
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {t.is_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {t.placeholders.join(', ') || 'No placeholders'}
                  </p>
                  <p className="text-xs text-slate-700 bg-[#F5F6F8] p-3 rounded-xl border border-slate-200/70">
                    {t.content}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditingTemplate(t)}
                    className="text-xs font-bold text-[#E87936] hover:underline"
                  >
                    Edit Template
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className={`${ADMIN_CARD} p-4 flex flex-col sm:flex-row gap-3 items-center`}>
            <div className="relative flex-1 w-full">
              <MessageSquare className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
              <input
                type="text"
                placeholder="Search recipient, business or task ID..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-[#F5F6F8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E87936]/30"
              />
            </div>
            <select
              value={historyFilter}
              onChange={(e) => {
                setHistoryFilter(e.target.value);
                setHistoryPage(0);
              }}
              className="px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-[#14243B] font-semibold"
            >
              <option value="all">All Messages</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
              <option value="queued">Queued</option>
              <option value="sent">Sent</option>
              <option value="expired">Expired</option>
              <option value="business_registration">Account Approval</option>
              <option value="booking_confirmation">Booking</option>
              <option value="appointment_reminder">Reminder</option>
              <option value="feedback_invitation">Feedback Invitation</option>
              <option value="test_sms">Test</option>
            </select>
          </div>

          <div className={`${ADMIN_CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F5F6F8] text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200/80">
                  <tr>
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Business</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Task ID</th>
                    <th className="py-3 px-4">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedHistory.map((n) => (
                    <tr key={n.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-[#14243B]">{n.recipient}</td>
                      <td className="py-3 px-4">{businessName(n.business_id)}</td>
                      <td className="py-3 px-4 text-slate-600">{n.notification_type.replace(/_/g, ' ')}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${badgeForStatus(
                            n.delivery_status
                          )}`}
                        >
                          {n.delivery_status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[10px] text-slate-400">
                        {n.sasusync_task_id || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-500 tabular-nums">
                        {formatAdminDateTime(n.created_at)}
                      </td>
                    </tr>
                  ))}
                  {pagedHistory.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 text-xs">
                        No SMS records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-100 text-xs">
                <button
                  type="button"
                  onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                  disabled={historyPage === 0}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-slate-500 tabular-nums">
                  Page {historyPage + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setHistoryPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={historyPage >= totalPages - 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 font-semibold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Business Usage */}
      {activeTab === 'usage' && (
        <div className={`${ADMIN_CARD} overflow-hidden`}>
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-[#14243B]">
              Business SMS Usage ({dateFilter === 'today' ? 'Today' : dateFilter === '7d' ? '7 Days' : dateFilter === '30d' ? '30 Days' : 'All'})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F5F6F8] text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200/80">
                <tr>
                  <th className="py-3 px-4">Business</th>
                  <th className="py-3 px-4">Total</th>
                  <th className="py-3 px-4">Delivered</th>
                  <th className="py-3 px-4">Failed</th>
                  <th className="py-3 px-4">Pending</th>
                  <th className="py-3 px-4">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {usageByBusiness.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-bold text-[#14243B]">{u.name}</td>
                    <td className="py-3 px-4 font-semibold">{u.total}</td>
                    <td className="py-3 px-4 text-emerald-700 font-semibold">{u.delivered}</td>
                    <td className="py-3 px-4 text-red-600 font-semibold">{u.failed}</td>
                    <td className="py-3 px-4 text-amber-700 font-semibold">{u.pending}</td>
                    <td className="py-3 px-4 text-slate-500">
                      {u.lastActivity ? formatAdminDateTime(u.lastActivity) : '—'}
                    </td>
                  </tr>
                ))}
                {platformMessages.length > 0 && (
                  <tr className="bg-[#F5F6F8]/60">
                    <td className="py-3 px-4 font-bold text-[#14243B]">Platform (System Tests)</td>
                    <td className="py-3 px-4 font-semibold">{platformMessages.length}</td>
                    <td className="py-3 px-4 text-emerald-700 font-semibold">
                      {platformMessages.filter((n) => n.delivery_status === 'delivered').length}
                    </td>
                    <td className="py-3 px-4 text-red-600 font-semibold">
                      {
                        platformMessages.filter(
                          (n) => n.delivery_status === 'failed' || n.delivery_status === 'expired'
                        ).length
                      }
                    </td>
                    <td className="py-3 px-4 text-amber-700 font-semibold">
                      {
                        platformMessages.filter(
                          (n) =>
                            n.delivery_status === 'queued' ||
                            n.delivery_status === 'sent' ||
                            n.delivery_status === 'pending'
                        ).length
                      }
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {formatAdminDateTime(platformMessages[0].created_at)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};