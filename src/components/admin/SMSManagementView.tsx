import React, { useEffect, useState } from 'react';
import {
  MessageSquare,
  Send,
  Settings,
  FileText,
  History,
  BarChart3,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabase';

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
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<SmsNotification[]>([]);
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [dateFilter, setDateFilter] = useState('7d');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(0);
  const [testPhone, setTestPhone] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplate | null>(null);
  const [feedback, setFeedback] = useState<{ success: boolean; text: string } | null>(null);

  const supabase = getSupabase();

  const fetchAll = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data: bData } = await supabase.from('businesses').select('id, name').order('name');
      setBusinesses(bData || []);

      const { data: nData } = await supabase
        .from('sms_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      setNotifications((nData as SmsNotification[]) || []);

      const { data: tData } = await supabase.from('sms_templates').select('*').order('name');
      setTemplates((tData as SmsTemplate[]) || []);

      const res = await fetch('/api/sms/config');
      const cfg = await res.json();
      setConfig(cfg);
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
    pending: dateFiltered.filter((n) => n.delivery_status === 'queued' || n.delivery_status === 'sent' || n.delivery_status === 'pending').length,
    successRate: dateFiltered.length ? Math.round((dateFiltered.filter((n) => n.delivery_status === 'delivered').length / dateFiltered.length) * 100) : 0,
    businesses: new Set(dateFiltered.map((n) => n.business_id).filter(Boolean)).size,
  };

  const handleToggleSms = async (enabled: boolean) => {
    try {
      const { data: { session } } = await supabase!.auth.getSession();
      const res = await fetch('/api/sms/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ smsEnabled: enabled, adminId: profile?.id }),
      });
      const data = await res.json();
      if (data.ok) {
        setConfig((c: any) => ({ ...c, smsEnabled: enabled }));
        // audit
        await supabase!.from('sms_audit_logs').insert({
          admin_id: profile?.id,
          action: enabled ? 'sms_enabled' : 'sms_disabled',
          entity_type: 'sms_platform_settings',
          details: { smsEnabled: enabled },
        });
        setFeedback({ success: true, text: `SMS sending ${enabled ? 'enabled' : 'disabled'}.` });
      }
    } catch (err) {
      setFeedback({ success: false, text: 'Failed to update SMS setting.' });
    }
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestLoading(true);
    setTestResult(null);
    try {
      const { data: { session } } = await supabase!.auth.getSession();
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
    } catch (err) {
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
      setFeedback({ success: true, text: 'Template saved.' });
      setEditingTemplate(null);
      fetchAll();
    } catch (err) {
      setFeedback({ success: false, text: 'Failed to save template.' });
    }
  };

  // History filtering
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

  // Business usage
  const usageByBusiness = businesses.map((b) => {
    const related = dateFiltered.filter((n) => n.business_id === b.id);
    return {
      id: b.id,
      name: b.name,
      total: related.length,
      delivered: related.filter((n) => n.delivery_status === 'delivered').length,
      failed: related.filter((n) => n.delivery_status === 'failed' || n.delivery_status === 'expired').length,
      pending: related.filter((n) => n.delivery_status === 'queued' || n.delivery_status === 'sent' || n.delivery_status === 'pending').length,
      lastActivity: related.length ? related[0].created_at : null,
    };
  }).filter((u) => u.total > 0 || true);

  const platformMessages = dateFiltered.filter((n) => !n.business_id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-zinc-900 tracking-tight">SMS Management</h2>
          <p className="text-xs text-zinc-500">Central SasuSync SMS control, monitoring and templates</p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-700 font-semibold text-xs hover:bg-zinc-50 transition disabled:opacity-60 self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {feedback && (
        <div className={`p-3 rounded-xl text-xs border ${feedback.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {feedback.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                activeTab === t.id
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500">Period:</span>
            {['today', '7d', '30d', 'all'].map((f) => (
              <button
                key={f}
                onClick={() => setDateFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition ${
                  dateFilter === f ? 'bg-orange-600 text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                {f === 'today' ? 'Today' : f === '7d' ? '7 Days' : f === '30d' ? '30 Days' : 'All'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Total SMS', value: metrics.total, color: 'text-zinc-900' },
              { label: 'Delivered', value: metrics.delivered, color: 'text-emerald-600' },
              { label: 'Failed', value: metrics.failed, color: 'text-red-600' },
              { label: 'Pending/Queued', value: metrics.pending, color: 'text-amber-600' },
              { label: 'Success Rate', value: `${metrics.successRate}%`, color: 'text-orange-600' },
              { label: 'Businesses', value: metrics.businesses, color: 'text-zinc-900' },
            ].map((m, idx) => (
              <div key={idx} className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{m.label}</span>
                <p className={`text-2xl font-black ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-zinc-100">
              <h3 className="text-sm font-bold text-zinc-900">Recent SMS Activity</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 text-zinc-400 font-bold uppercase border-b border-zinc-100">
                  <tr>
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Business</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Task ID</th>
                    <th className="py-3 px-4">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {dateFiltered.slice(0, 10).map((n) => (
                    <tr key={n.id} className="hover:bg-zinc-50/80">
                      <td className="py-3 px-4 font-mono">{n.recipient}</td>
                      <td className="py-3 px-4">{businessName(n.business_id)}</td>
                      <td className="py-3 px-4">{n.notification_type}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          n.delivery_status === 'delivered' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          n.delivery_status === 'failed' || n.delivery_status === 'expired' ? 'bg-red-50 text-red-700 border-red-200' :
                          'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>{n.delivery_status}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[10px] text-zinc-400">{n.sasusync_task_id || '—'}</td>
                      <td className="py-3 px-4 text-zinc-500">{new Date(n.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {dateFiltered.length === 0 && (
                    <tr><td colSpan={6} className="py-12 text-center text-zinc-400 text-xs">No SMS activity in this period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Configuration */}
      {activeTab === 'config' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-6 space-y-4">
            <h3 className="text-base font-bold text-zinc-900 border-b border-zinc-100 pb-3">SMS Configuration</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {[
                { label: 'Provider', value: config?.provider || 'SasuSync' },
                { label: 'Integration Status', value: config?.configured ? 'Configured' : 'Not Configured' },
                { label: 'Sender ID', value: config?.senderId || '—' },
                { label: 'API Base URL', value: config?.baseUrl || '—' },
                { label: 'API Key', value: config?.hasApiKey ? 'Configured' : 'Missing' },
                { label: 'Webhook Secret', value: config?.hasWebhookSecret ? 'Configured' : 'Missing' },
                { label: 'SMS Sending', value: config?.smsEnabled ? 'Enabled' : 'Disabled' },
              ].map((row, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{row.label}</p>
                  <p className="font-bold text-zinc-900 mt-1">{row.value}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <span className="text-xs font-semibold text-zinc-700">SMS Sending:</span>
              <button
                onClick={() => handleToggleSms(!(config?.smsEnabled))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${config?.smsEnabled ? 'bg-orange-600' : 'bg-zinc-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${config?.smsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className="text-xs text-zinc-500">{config?.smsEnabled ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Send Test */}
      {activeTab === 'test' && (
        <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-6 space-y-4 max-w-lg">
          <h3 className="text-base font-bold text-zinc-900 border-b border-zinc-100 pb-3">Send Test SMS</h3>
          <form onSubmit={handleSendTest} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Destination Phone Number</label>
              <input
                type="tel"
                required
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="0552148347 or 233552148347"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
            <button
              type="submit"
              disabled={testLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase hover:bg-orange-700 disabled:opacity-50"
            >
              {testLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{testLoading ? 'Sending...' : 'Send Test SMS'}</span>
            </button>
          </form>
          {testResult && (
            <div className={`p-4 rounded-xl text-xs border ${testResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
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
            <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-6 space-y-4">
              <h3 className="text-base font-bold text-zinc-900">{editingTemplate.name}</h3>
              <p className="text-[11px] text-zinc-500">Placeholders: {editingTemplate.placeholders.join(', ') || 'none'}</p>
              <textarea
                rows={5}
                value={editingTemplate.content}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, content: e.target.value })}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                  <input
                    type="checkbox"
                    checked={editingTemplate.is_enabled}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, is_enabled: e.target.checked })}
                  />
                  Enabled
                </label>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button onClick={() => setEditingTemplate(null)} className="px-4 py-2 rounded-xl border border-zinc-200 text-zinc-600 font-semibold text-xs hover:bg-zinc-50">Cancel</button>
                <button onClick={handleSaveTemplate} className="px-5 py-2 rounded-xl bg-orange-600 text-white font-bold text-xs hover:bg-orange-700">Save</button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((t) => (
                <div key={t.id} className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-zinc-900">{t.name}</h4>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${t.is_enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-100 text-zinc-600 border-zinc-200'}`}>
                      {t.is_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500">{t.placeholders.join(', ') || 'No placeholders'}</p>
                  <p className="text-xs text-zinc-700 bg-zinc-50 p-3 rounded-xl border border-zinc-100">{t.content}</p>
                  <button onClick={() => setEditingTemplate(t)} className="text-xs font-bold text-orange-600 hover:text-orange-700">Edit</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-4 flex flex-col sm:flex-row gap-3 items-center">
            <div className="relative flex-1 w-full">
              <MessageSquare className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search recipient, business or task ID..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-zinc-200 bg-zinc-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
            <select
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
              className="px-3.5 py-2.5 text-xs rounded-xl border border-zinc-200 bg-white text-zinc-700 font-semibold"
            >
              <option value="all">All</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
              <option value="queued">Queued</option>
              <option value="sent">Sent</option>
              <option value="expired">Expired</option>
              <option value="business_registration">Registration</option>
              <option value="booking_confirmation">Booking</option>
              <option value="appointment_reminder">Reminder</option>
              <option value="test_sms">Test</option>
            </select>
          </div>

          <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 text-zinc-400 font-bold uppercase border-b border-zinc-100">
                  <tr>
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Business</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Task ID</th>
                    <th className="py-3 px-4">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {pagedHistory.map((n) => (
                    <tr key={n.id} className="hover:bg-zinc-50/80">
                      <td className="py-3 px-4 font-mono">{n.recipient}</td>
                      <td className="py-3 px-4">{businessName(n.business_id)}</td>
                      <td className="py-3 px-4">{n.notification_type}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          n.delivery_status === 'delivered' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          n.delivery_status === 'failed' || n.delivery_status === 'expired' ? 'bg-red-50 text-red-700 border-red-200' :
                          'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>{n.delivery_status}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[10px] text-zinc-400">{n.sasusync_task_id || '—'}</td>
                      <td className="py-3 px-4 text-zinc-500">{new Date(n.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {pagedHistory.length === 0 && (
                    <tr><td colSpan={6} className="py-12 text-center text-zinc-400 text-xs">No SMS records found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-zinc-100">
                <button
                  onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                  disabled={historyPage === 0}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-xs text-zinc-500">Page {historyPage + 1} of {totalPages}</span>
                <button
                  onClick={() => setHistoryPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={historyPage >= totalPages - 1}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold disabled:opacity-40"
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
        <div className="space-y-4">
          <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-zinc-100">
              <h3 className="text-sm font-bold text-zinc-900">Business SMS Usage ({dateFilter === 'today' ? 'Today' : dateFilter === '7d' ? '7 Days' : dateFilter === '30d' ? '30 Days' : 'All'})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 text-zinc-400 font-bold uppercase border-b border-zinc-100">
                  <tr>
                    <th className="py-3 px-4">Business</th>
                    <th className="py-3 px-4">Total</th>
                    <th className="py-3 px-4">Delivered</th>
                    <th className="py-3 px-4">Failed</th>
                    <th className="py-3 px-4">Pending</th>
                    <th className="py-3 px-4">Last Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {usageByBusiness.map((u) => (
                    <tr key={u.id} className="hover:bg-zinc-50/80">
                      <td className="py-3 px-4 font-bold text-zinc-900">{u.name}</td>
                      <td className="py-3 px-4">{u.total}</td>
                      <td className="py-3 px-4 text-emerald-600 font-semibold">{u.delivered}</td>
                      <td className="py-3 px-4 text-red-600 font-semibold">{u.failed}</td>
                      <td className="py-3 px-4 text-amber-600 font-semibold">{u.pending}</td>
                      <td className="py-3 px-4 text-zinc-500">{u.lastActivity ? new Date(u.lastActivity).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                  {platformMessages.length > 0 && (
                    <tr className="bg-zinc-50/50">
                      <td className="py-3 px-4 font-bold text-zinc-700">Platform (no business)</td>
                      <td className="py-3 px-4">{platformMessages.length}</td>
                      <td className="py-3 px-4 text-emerald-600 font-semibold">{platformMessages.filter((n) => n.delivery_status === 'delivered').length}</td>
                      <td className="py-3 px-4 text-red-600 font-semibold">{platformMessages.filter((n) => n.delivery_status === 'failed' || n.delivery_status === 'expired').length}</td>
                      <td className="py-3 px-4 text-amber-600 font-semibold">{platformMessages.filter((n) => n.delivery_status === 'queued' || n.delivery_status === 'sent' || n.delivery_status === 'pending').length}</td>
                      <td className="py-3 px-4 text-zinc-500">{new Date(platformMessages[0].created_at).toLocaleString()}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};