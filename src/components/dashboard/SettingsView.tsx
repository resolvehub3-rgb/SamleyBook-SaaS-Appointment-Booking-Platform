import React from 'react';
import { User, Smartphone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PWAInstallButton } from '../common/PWAInstallButton';

export const SettingsView: React.FC = () => {
  const { profile } = useAuth();

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

    </div>
  );
};
