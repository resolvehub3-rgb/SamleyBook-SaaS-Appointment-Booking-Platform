import React, { useState } from 'react';
import { User, Database, Shield, Smartphone, Key, Check, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { SupabaseSetupModal } from '../common/SupabaseSetupModal';

export const SettingsView: React.FC = () => {
  const { profile, isConfigured } = useAuth();
  const [dbModalOpen, setDbModalOpen] = useState(false);

  return (
    <div className="space-y-6 text-left max-w-4xl">
      <div>
        <h2 className="text-xl font-black text-zinc-900 tracking-tight">Platform & Account Settings</h2>
        <p className="text-xs text-zinc-500">
          Manage your owner account preferences and backend infrastructure
        </p>
      </div>

      {/* Account Profile Card */}
      <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-6 md:p-8 space-y-4">
        <h3 className="text-base font-bold text-zinc-900 border-b border-zinc-100 pb-3 flex items-center gap-2">
          <User className="w-4 h-4 text-orange-600" />
          <span>Account Profile</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-[10px] font-bold uppercase text-zinc-400">Full Name</span>
            <p className="font-bold text-zinc-900 text-sm mt-0.5">{profile?.full_name || 'Owner'}</p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-zinc-400">Registered Email</span>
            <p className="font-mono text-zinc-700 text-sm mt-0.5">{profile?.email}</p>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-zinc-400">Phone Number</span>
            <p className="font-mono text-zinc-700 text-sm mt-0.5">{profile?.phone || 'Not set'}</p>
          </div>
        </div>
      </div>

      {/* Supabase Connection Card */}
      <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-6 md:p-8 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div className="flex items-center gap-2.5">
            <Database className="w-4 h-4 text-orange-600" />
            <h3 className="text-base font-bold text-zinc-900">Supabase Infrastructure</h3>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold ${
              isConfigured
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            {isConfigured ? 'Connected to Supabase' : 'Configuration Pending'}
          </span>
        </div>

        <p className="text-xs text-zinc-600 leading-relaxed">
          SamleyBook operates exclusively on real Supabase PostgreSQL data, Supabase Realtime, and Supabase Storage. You can view your project credentials or copy the complete database schema script at any time.
        </p>

        <button
          onClick={() => setDbModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 hover:border-orange-300 hover:text-orange-600 text-xs font-bold text-zinc-700 transition"
        >
          <Key className="w-4 h-4 text-orange-600" />
          <span>Manage Supabase Keys & SQL Script</span>
        </button>
      </div>

      {/* PWA App Install Card */}
      <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-6 md:p-8 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-zinc-100 pb-3">
          <Smartphone className="w-4 h-4 text-orange-600" />
          <h3 className="text-base font-bold text-zinc-900">Progressive Web App (PWA)</h3>
        </div>

        <p className="text-xs text-zinc-600 leading-relaxed">
          Install the SamleyBook Business Owner dashboard to your home screen on Android, iPhone, iPad, or Windows desktop for rapid one-tap access without opening a browser window.
        </p>

        <PWAInstallButton variant="primary" />
      </div>

      <SupabaseSetupModal isOpen={dbModalOpen} onClose={() => setDbModalOpen(false)} />
    </div>
  );
};
