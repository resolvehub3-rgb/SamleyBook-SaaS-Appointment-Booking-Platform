import React, { useState } from 'react';
import {
  Database,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  X,
  RefreshCw,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { getSupabaseCredentials, saveSupabaseCredentials, testSupabaseConnection } from '../../lib/supabase';
import { SUPABASE_SQL_SCHEMA } from '../../lib/sqlScript';
import { useAuth } from '../../context/AuthContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'credentials' | 'sql';
}

export const SupabaseSetupModal: React.FC<Props> = ({ isOpen, onClose, initialTab = 'credentials' }) => {
  const { refreshClient } = useAuth();
  const currentCreds = getSupabaseCredentials();

  const [url, setUrl] = useState(currentCreds.url);
  const [anonKey, setAnonKey] = useState(currentCreds.anonKey);
  const [testing, setTesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<{ success: boolean; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    needsSchema?: boolean;
    message: string;
  } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [showSqlTab, setShowSqlTab] = useState(initialTab === 'sql');

  // Sync initial tab when opened
  React.useEffect(() => {
    if (isOpen && initialTab) {
      setShowSqlTab(initialTab === 'sql');
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  // Extract project ref from URL (e.g. https://[project-ref].supabase.co)
  const getProjectId = (supabaseUrl: string) => {
    try {
      const parsed = new URL(supabaseUrl);
      const hostParts = parsed.hostname.split('.');
      if (hostParts.length >= 3 && hostParts[1] === 'supabase') {
        return hostParts[0];
      }
    } catch {
      // ignore
    }
    return null;
  };

  const projectId = getProjectId(url);
  const sqlEditorUrl = projectId
    ? `https://supabase.com/dashboard/project/${projectId}/sql/new`
    : 'https://supabase.com/dashboard';

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setTesting(true);
    setTestResult(null);

    const result = await testSupabaseConnection(url.trim(), anonKey.trim());
    setTesting(false);

    // If connected or if it's a schema missing issue (PGRST205 / schema cache)
    if (result.success || result.needsSchema) {
      // Save credentials immediately so user doesn't lose them
      saveSupabaseCredentials(url.trim(), anonKey.trim());
      refreshClient();
      setTestResult(result);

      if (result.needsSchema) {
        // Automatically switch to the SQL tab
        setShowSqlTab(true);
      }
    } else {
      // Double check if error is table missing
      const msg = (result.message || '').toLowerCase();
      if (
        msg.includes('schema cache') ||
        msg.includes('could not find the table') ||
        msg.includes('subscription_plans') ||
        msg.includes('does not exist')
      ) {
        saveSupabaseCredentials(url.trim(), anonKey.trim());
        refreshClient();
        setTestResult({
          success: true,
          needsSchema: true,
          message: 'Connected to your Supabase project! Your credentials are valid, but the database tables need to be created. Please copy and run the SQL script in your Supabase SQL Editor.',
        });
        setShowSqlTab(true);
      } else {
        setTestResult(result);
      }
    }
  };

  const handleForceSave = () => {
    if (!url.trim() || !anonKey.trim()) return;
    saveSupabaseCredentials(url.trim(), anonKey.trim());
    refreshClient();
    setTestResult({
      success: true,
      needsSchema: true,
      message: 'Credentials saved! Please make sure to run the SQL schema in Supabase.',
    });
    setShowSqlTab(true);
  };

  const handleVerifyTables = async () => {
    setVerifying(true);
    setVerifyMessage(null);
    const result = await testSupabaseConnection(url.trim(), anonKey.trim());
    setVerifying(false);

    if (result.success && !result.needsSchema) {
      setVerifyMessage({
        success: true,
        text: 'All 14 tables verified! Your database is fully configured and ready for production.',
      });
      refreshClient();
    } else {
      setVerifyMessage({
        success: false,
        text: result.message || 'Tables not detected yet. Make sure you clicked "Run" in your Supabase SQL Editor.',
      });
    }
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 md:p-8 shadow-2xl border border-zinc-100 my-8 text-left">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900">Supabase Backend Configuration</h2>
              <p className="text-xs text-zinc-500">Real Supabase database, Authentication & Realtime connection</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-2 mt-5 border-b border-zinc-200">
          <button
            type="button"
            onClick={() => setShowSqlTab(false)}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition ${
              !showSqlTab
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            1. API Credentials
          </button>
          <button
            type="button"
            onClick={() => setShowSqlTab(true)}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              showSqlTab
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <span>2. Database SQL Script (Copy & Run)</span>
            <span className="w-2 h-2 rounded-full bg-orange-600 animate-pulse" />
          </button>
        </div>

        {!showSqlTab ? (
          <form onSubmit={handleTestAndSave} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Supabase Project URL
              </label>
              <input
                type="url"
                required
                placeholder="https://your-project-id.supabase.co"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 font-mono"
              />
              <p className="text-[11px] text-zinc-400 mt-1">
                Found in your Supabase Dashboard: Project Settings &rarr; API &rarr; Project URL
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Supabase Anon / Public Key
              </label>
              <input
                type="text"
                required
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 font-mono"
              />
              <p className="text-[11px] text-zinc-400 mt-1">
                Found in your Supabase Dashboard: Project Settings &rarr; API &rarr; Project API keys &rarr; <span className="font-semibold text-zinc-600">anon public</span>
              </p>
            </div>

            {testResult && (
              <div
                className={`p-4 rounded-xl text-xs flex items-start gap-3 ${
                  testResult.success
                    ? testResult.needsSchema
                      ? 'bg-amber-50 border border-amber-200 text-amber-900'
                      : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className={`w-5 h-5 shrink-0 mt-0.5 ${testResult.needsSchema ? 'text-amber-600' : 'text-emerald-600'}`} />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1.5 flex-1">
                  <p className="font-bold">
                    {testResult.success
                      ? testResult.needsSchema
                        ? 'Connected! Database Setup Needed'
                        : 'Fully Connected & Ready'
                      : 'Connection Failed'}
                  </p>
                  <p className="leading-relaxed">{testResult.message}</p>

                  {testResult.needsSchema && (
                    <div className="pt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowSqlTab(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 text-white font-bold text-xs hover:bg-orange-700 transition"
                      >
                        <span>View & Copy SQL Script</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-3">
              <div className="flex items-center gap-3">
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-700 font-medium"
                >
                  Open Supabase Dashboard
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={handleForceSave}
                  className="text-xs text-zinc-400 hover:text-zinc-700 underline underline-offset-2"
                >
                  Save without testing
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={testing}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 rounded-xl shadow-xs transition"
                >
                  {testing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Testing Connection...
                    </>
                  ) : (
                    'Save & Connect'
                  )}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="p-4 rounded-xl bg-orange-50 border border-orange-200 text-xs text-orange-950 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-orange-600" />
                <span>One-Time Database Schema Setup</span>
              </p>
              <p className="leading-relaxed">
                Copy the SQL script below and run it in your Supabase SQL Editor. It creates all 14 tables (<code className="bg-white/80 px-1 py-0.5 rounded font-mono font-bold text-zinc-900">subscription_plans</code>, <code className="bg-white/80 px-1 py-0.5 rounded font-mono font-bold text-zinc-900">businesses</code>, <code className="bg-white/80 px-1 py-0.5 rounded font-mono font-bold text-zinc-900">appointments</code>, etc.), security rules, triggers, storage bucket, and realtime publications.
              </p>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900 text-white">
              <span className="text-xs font-mono text-zinc-300">
                src/lib/supabase-schema.sql (Complete Script)
              </span>
              <button
                type="button"
                onClick={handleCopySql}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition shadow-sm"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Full SQL Script</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick 3-step Instructions with direct link */}
            <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-700 space-y-2.5">
              <p className="font-bold text-zinc-900">How to execute in 30 seconds:</p>
              <ol className="list-decimal list-inside space-y-2 text-zinc-600">
                <li>
                  Click{' '}
                  <a
                    href={sqlEditorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1"
                  >
                    Open Supabase SQL Editor
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  .
                </li>
                <li>
                  Paste the copied script into the query window (<strong>Ctrl+V</strong> or <strong>Cmd+V</strong>).
                </li>
                <li>
                  Click the green <strong>Run</strong> button at the bottom right of Supabase.
                </li>
                <li>
                  Come back here and click <strong>Verify Database Tables</strong> below to confirm.
                </li>
              </ol>
            </div>

            {verifyMessage && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 ${
                  verifyMessage.success
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border border-amber-200 text-amber-900'
                }`}
              >
                {verifyMessage.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <span>{verifyMessage.text}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setShowSqlTab(false)}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-800"
              >
                &larr; Back to API Credentials
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleVerifyTables}
                  disabled={verifying}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-zinc-300 hover:border-zinc-400 bg-white text-zinc-800 font-semibold text-xs hover:bg-zinc-50 transition"
                >
                  {verifying ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-600" />
                      Checking Supabase...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Verify Database Tables
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl bg-zinc-900 text-white font-bold text-xs hover:bg-zinc-800 transition shadow-sm"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
