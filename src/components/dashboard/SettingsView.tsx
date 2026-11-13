import React from 'react';
import { User, Smartphone, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { SURFACE_CARD } from './ui/DashboardTokens';

export const SettingsView: React.FC = () => {
  const { profile } = useAuth();

  return (
    <div className="space-y-6 text-left max-w-4xl">
      {/* Account Profile Card */}
      <div className={`${SURFACE_CARD} p-6 md:p-7 space-y-5`}>
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5">
          <div className="w-8 h-8 rounded-xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-[#111827]">Account Profile</h3>
            <p className="text-[11px] text-slate-500">
              Authenticated business owner credentials in Supabase
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Full Name
            </span>
            <p className="font-extrabold text-[#111827] text-sm mt-1">
              {profile?.full_name || 'Owner'}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Registered Email
            </span>
            <p className="font-mono font-semibold text-slate-700 text-xs mt-1.5 break-all">
              {profile?.email || 'Not set'}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Phone Number
            </span>
            <p className="font-mono font-semibold text-slate-700 text-xs mt-1.5">
              {profile?.phone || 'Not set'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1">
          <ShieldCheck className="w-4 h-4 text-[#16A34A] shrink-0" />
          <span>Multi-tenant Row Level Security (RLS) active for this account session.</span>
        </div>
      </div>

      {/* PWA App Install Card */}
      <div className={`${SURFACE_CARD} p-6 md:p-7 space-y-4`}>
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5">
          <div className="w-8 h-8 rounded-xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-[#111827]">
              Progressive Web App (PWA)
            </h3>
            <p className="text-[11px] text-slate-500">
              Install SamleyBook as a standalone desktop or mobile app
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Install the SamleyBook Business Owner dashboard to your home screen on Android, iPhone, iPad, or Windows desktop for rapid one-tap access without opening a browser window.
        </p>

        <PWAInstallButton variant="primary" />
      </div>
    </div>
  );
};
