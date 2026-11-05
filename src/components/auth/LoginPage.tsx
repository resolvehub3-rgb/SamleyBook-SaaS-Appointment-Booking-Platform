import React, { useState } from 'react';
import { Mail, Lock, ArrowRight, AlertCircle, RefreshCw, Database, Copy, Check, ExternalLink, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase, getSupabaseCredentials } from '../../lib/supabase';
import { SamleyLogo } from '../common/SamleyLogo';
import { SupabaseSetupModal } from '../common/SupabaseSetupModal';

interface Props {
  onNavigate: (route: string) => void;
}

export const LoginPage: React.FC<Props> = ({ onNavigate }) => {
  const { signIn, signUp, refreshProfile, isConfigured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isEmailUnconfirmed, setIsEmailUnconfirmed] = useState(false);
  const [copiedConfirmSql, setCopiedConfirmSql] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendFeedback, setResendFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dbModalOpen, setDbModalOpen] = useState(false);

  const creds = getSupabaseCredentials();
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
  const projectId = getProjectId(creds.url);
  const sqlEditorUrl = projectId
    ? `https://supabase.com/dashboard/project/${projectId}/sql/new`
    : 'https://supabase.com/dashboard';

  const confirmSql = `UPDATE auth.users SET email_confirmed_at = now() WHERE email = '${(email || 'samleybook@gmail.com').trim().toLowerCase()}';`;

  const handleCopyConfirmSql = async () => {
    try {
      await navigator.clipboard.writeText(confirmSql);
      setCopiedConfirmSql(true);
      setTimeout(() => setCopiedConfirmSql(false), 2500);
    } catch {
      setCopiedConfirmSql(true);
      setTimeout(() => setCopiedConfirmSql(false), 2500);
    }
  };

  const handleResendConfirmation = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    setIsResending(true);
    setResendFeedback(null);
    try {
      const targetEmail = (email || 'samleybook@gmail.com').trim().toLowerCase();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: targetEmail,
      });
      if (error) {
        setResendFeedback(`Resend error: ${error.message}`);
      } else {
        setResendFeedback(`Confirmation email resent to ${targetEmail}! Please check inbox/spam.`);
      }
    } catch (err) {
      setResendFeedback(err instanceof Error ? err.message : 'Failed to resend confirmation email');
    } finally {
      setIsResending(false);
    }
  };

  const fillSuperAdmin = () => {
    setEmail('samleybook@gmail.com');
    setPassword('GoodGod1$');
    setErrorMsg(null);
    setIsEmailUnconfirmed(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsEmailUnconfirmed(false);
    setResendFeedback(null);
    setIsLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const isSuperAdminEmail = cleanEmail === 'samleybook@gmail.com';

    try {
      let loginRes = await signIn(cleanEmail, password);

      // If logging in as super_admin and user doesn't exist yet in Supabase Auth,
      // automatically provision the account in Supabase Auth!
      if (loginRes.error && isSuperAdminEmail) {
        const errMsg = loginRes.error.message.toLowerCase();
        if (
          errMsg.includes('invalid') ||
          errMsg.includes('credentials') ||
          errMsg.includes('not found') ||
          errMsg.includes('user')
        ) {
          const { user: newAdminUser, error: signUpError } = await signUp(
            cleanEmail,
            password,
            'Super Admin (SamleyBook)',
            '+233200000000',
            'super_admin'
          );

          if (!signUpError && newAdminUser) {
            loginRes = await signIn(cleanEmail, password);
          }
        }
      }

      if (loginRes.error) {
        const errMsg = loginRes.error.message.toLowerCase();
        if (errMsg.includes('email not confirmed')) {
          setIsEmailUnconfirmed(true);
          return;
        }
        throw new Error(loginRes.error.message);
      }

      // Check profile role to route appropriately
      const supabase = getSupabase();
      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          if (isSuperAdminEmail) {
            // Guarantee super_admin role in database
            await supabase.from('profiles').upsert({
              id: user.id,
              email: cleanEmail,
              full_name: 'Super Admin (SamleyBook)',
              phone: '+233200000000',
              role: 'super_admin',
            });
            await refreshProfile();
            onNavigate('admin');
            return;
          }

          const { data: profileData } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

          await refreshProfile();

          if (profileData?.role === 'super_admin') {
            onNavigate('admin');
            return;
          }
        }
      }

      onNavigate('dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid login credentials';
      if (msg.toLowerCase().includes('email not confirmed')) {
        setIsEmailUnconfirmed(true);
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-zinc-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <button
            onClick={() => onNavigate('home')}
            className="inline-block focus:outline-none mb-6"
          >
            <SamleyLogo size="lg" />
          </button>
          <h2 className="text-2xl font-black text-zinc-900 tracking-tight">
            Sign In to SamleyBook
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Access your business appointment dashboard or admin portal
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
          <div className="bg-white py-8 px-6 sm:px-10 shadow-xl rounded-3xl border border-zinc-200/80 text-left">
            {!isConfigured && (
              <div className="mb-5 p-3.5 rounded-xl bg-orange-50 border border-orange-200 text-xs text-orange-900 flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">Supabase Keys Required</p>
                  <p className="text-[11px] text-orange-700 mt-0.5">
                    Connect your Supabase project to authenticate real users.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDbModalOpen(true)}
                  className="px-2.5 py-1 rounded-lg bg-orange-600 text-white font-semibold text-[11px] shrink-0"
                >
                  Configure
                </button>
              </div>
            )}

            {isEmailUnconfirmed && (
              <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-3 animate-in fade-in duration-200">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold text-amber-900">Email Not Confirmed in Supabase</p>
                    <p className="text-zinc-600 leading-relaxed text-[11px]">
                      This user was created before you disabled "Confirm email". In Supabase, turning off email confirmation only affects new accounts, while existing records still require one-time confirmation.
                    </p>
                  </div>
                </div>

                {/* Option 1: 1-Click SQL fix */}
                <div className="bg-white p-3 rounded-xl border border-amber-200 space-y-2">
                  <p className="font-bold text-zinc-800 text-[11px]">Option 1: Confirm via SQL Query (Instant)</p>
                  <div className="flex items-center justify-between gap-2 bg-zinc-900 p-2 rounded-lg text-white font-mono text-[11px]">
                    <span className="truncate">{confirmSql}</span>
                    <button
                      type="button"
                      onClick={handleCopyConfirmSql}
                      className="shrink-0 px-2 py-1 bg-orange-600 hover:bg-orange-700 text-white font-sans font-bold text-[10px] rounded transition"
                    >
                      {copiedConfirmSql ? (
                        <span className="flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Copied
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Copy className="w-3 h-3" />
                          Copy SQL
                        </span>
                      )}
                    </button>
                  </div>
                  <a
                    href={sqlEditorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-600 hover:text-orange-700"
                  >
                    Open Supabase SQL Editor & Run Fix
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {/* Option 2: Dashboard UI */}
                <div className="bg-white p-3 rounded-xl border border-amber-200 space-y-1">
                  <p className="font-bold text-zinc-800 text-[11px]">Option 2: Confirm via Dashboard</p>
                  <p className="text-zinc-600 text-[11px] leading-relaxed">
                    In Supabase, go to <strong>Authentication &rarr; Users</strong> &rarr; find <strong className="text-zinc-900">{email || 'samleybook@gmail.com'}</strong> &rarr; click <strong>...</strong> on the right &rarr; select <strong>Confirm User</strong> (or delete user and sign in again).
                  </p>
                </div>

                {resendFeedback && (
                  <p className="p-2 rounded-lg bg-white border border-amber-300 text-[11px] text-zinc-700 font-medium">
                    {resendFeedback}
                  </p>
                )}

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={isResending}
                    className="text-xs font-semibold text-orange-700 hover:text-orange-800 underline underline-offset-2"
                  >
                    {isResending ? 'Sending...' : 'Resend Confirmation Email'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEmailUnconfirmed(false)}
                    className="text-[11px] text-zinc-400 hover:text-zinc-700"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="owner@yourbusiness.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-orange-700 shadow-md disabled:opacity-50 transition"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="pt-1 flex justify-center">
                  <button
                    type="button"
                    onClick={fillSuperAdmin}
                    className="text-[11px] font-semibold text-zinc-500 hover:text-orange-600 transition underline underline-offset-2"
                  >
                    Use Super Admin Credentials
                  </button>
                </div>
              </div>
            </form>

            <div className="mt-6 pt-6 border-t border-zinc-100 flex flex-col items-center gap-3 text-center">
              <p className="text-xs text-zinc-500">
                Don't have a business account yet?{' '}
                <button
                  onClick={() => onNavigate('register')}
                  className="font-bold text-orange-600 hover:text-orange-700"
                >
                  Register here
                </button>
              </p>

              <button
                type="button"
                onClick={() => setDbModalOpen(true)}
                className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-700"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Supabase Connection Settings</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <SupabaseSetupModal isOpen={dbModalOpen} onClose={() => setDbModalOpen(false)} />
    </>
  );
};
