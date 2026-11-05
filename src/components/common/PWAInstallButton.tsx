import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface Props {
  variant?: 'primary' | 'secondary' | 'sidebar';
  className?: string;
}

export const PWAInstallButton: React.FC<Props> = ({ variant = 'primary', className = '' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running in standalone mode, hide button
  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    const baseClasses =
      variant === 'sidebar'
        ? 'w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors border border-orange-200'
        : variant === 'secondary'
        ? 'inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition'
        : 'inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-orange-600 text-white hover:bg-orange-700 shadow-sm transition';

    return (
      <button
        onClick={install}
        aria-label="Install SamleyBook App"
        className={`${baseClasses} ${className}`}
      >
        <Download className="w-4 h-4 text-orange-500" />
        <span>Install SamleyBook App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          aria-label="Install SamleyBook on iPhone"
          className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition ${className}`}
        >
          <Download className="w-3.5 h-3.5 text-orange-600" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-zinc-100">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <h3 className="text-base font-bold text-zinc-900">Install SamleyBook on iPhone / iPad</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
                  aria-label="Close guide"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-sm text-zinc-600">
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700 font-bold text-xs">
                    1
                  </div>
                  <p>
                    Tap the <strong className="text-zinc-900">Share</strong> button <Share className="w-3.5 h-3.5 inline text-blue-600" /> at the bottom of your Safari screen.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700 font-bold text-xs">
                    2
                  </div>
                  <p>
                    Scroll down in the options and tap <strong className="text-zinc-900">Add to Home Screen</strong>.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700 font-bold text-xs">
                    3
                  </div>
                  <p>
                    Tap <strong className="text-zinc-900">Add</strong> in the top right to access SamleyBook like a native app anytime!
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-xl bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 transition"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
