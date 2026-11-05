import React, { useState, useEffect } from 'react';
import { Database, ArrowRight, X, CheckCircle2 } from 'lucide-react';
import { getSupabaseCredentials, testSupabaseConnection } from '../../lib/supabase';
import { SupabaseSetupModal } from './SupabaseSetupModal';

export const DatabaseSetupBanner: React.FC = () => {
  const [needsSetup, setNeedsSetup] = useState<boolean>(false);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    const creds = getSupabaseCredentials();
    if (!creds.url || !creds.anonKey) {
      // Not configured at all
      return;
    }

    // Check if the tables exist
    testSupabaseConnection().then((res) => {
      if (res.needsSchema) {
        setNeedsSetup(true);
      } else {
        setNeedsSetup(false);
      }
    });
  }, []);

  if (!needsSetup || dismissed) return null;

  return (
    <>
      <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 text-white text-xs px-4 py-2.5 flex items-center justify-between shadow-sm relative z-50">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-1 rounded-md bg-white/20 text-white shrink-0">
              <Database className="w-3.5 h-3.5" />
            </span>
            <p className="truncate font-medium">
              <strong className="font-bold">Supabase Connected:</strong> Your database tables are ready to be set up.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-white text-orange-700 hover:bg-orange-50 font-bold text-xs transition shadow-xs"
            >
              <span>Copy SQL Script</span>
              <ArrowRight className="w-3 h-3" />
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="p-1 text-white/80 hover:text-white rounded-md transition"
              aria-label="Dismiss banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <SupabaseSetupModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          // Recheck connection on close
          testSupabaseConnection().then((res) => {
            if (!res.needsSchema && res.success) {
              setNeedsSetup(false);
            }
          });
        }}
        initialTab="sql"
      />
    </>
  );
};
