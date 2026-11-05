import React, { useState } from 'react';
import { Menu, X, ArrowRight, Database } from 'lucide-react';
import { SamleyLogo } from '../common/SamleyLogo';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { SupabaseSetupModal } from '../common/SupabaseSetupModal';
import { useAuth } from '../../context/AuthContext';

interface Props {
  onNavigate: (route: string) => void;
  currentRoute: string;
}

export const MarketingNav: React.FC<Props> = ({ onNavigate, currentRoute }) => {
  const { user, profile } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dbModalOpen, setDbModalOpen] = useState(false);

  const navLinks = [
    { label: 'Home', href: 'home' },
    { label: 'Features', href: 'features' },
    { label: 'Pricing', href: 'pricing' },
    { label: 'Contact', href: 'contact' },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-zinc-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo with SamTeck Digital Attribution */}
          <button
            onClick={() => onNavigate('home')}
            className="text-left focus:outline-none"
            aria-label="SamleyBook Home"
          >
            <SamleyLogo size="md" />
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => {
                  onNavigate(link.href);
                  const el = document.getElementById(link.href);
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className={`text-sm font-semibold transition ${
                  currentRoute === link.href
                    ? 'text-orange-600'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-3">
            {/* Supabase status / config trigger */}
            <button
              onClick={() => setDbModalOpen(true)}
              className="p-2 text-zinc-400 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition"
              title="Supabase Database Configuration"
              aria-label="Database Setup"
            >
              <Database className="w-4 h-4" />
            </button>

            <PWAInstallButton variant="secondary" />

            {user ? (
              <button
                onClick={() => {
                  if (profile?.role === 'super_admin') {
                    onNavigate('admin');
                  } else {
                    onNavigate('dashboard');
                  }
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl bg-orange-600 text-white hover:bg-orange-700 shadow-sm transition"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <>
                <button
                  onClick={() => onNavigate('login')}
                  className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition"
                >
                  Sign In
                </button>
                <button
                  onClick={() => onNavigate('register')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl bg-orange-600 text-white hover:bg-orange-700 shadow-sm transition"
                >
                  <span>Register Your Business</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setDbModalOpen(true)}
              className="p-2 text-zinc-400 hover:text-orange-600 rounded-lg"
              aria-label="Database Configuration"
            >
              <Database className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 focus:outline-none"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-zinc-100 bg-white px-4 pt-3 pb-6 space-y-3 shadow-lg animate-in slide-in-from-top duration-200">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => {
                  onNavigate(link.href);
                  setMobileMenuOpen(false);
                  const el = document.getElementById(link.href);
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="block w-full text-left px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 rounded-lg"
              >
                {link.label}
              </button>
            ))}

            <div className="pt-3 border-t border-zinc-100 space-y-2">
              <PWAInstallButton variant="sidebar" />
              {user ? (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (profile?.role === 'super_admin') {
                      onNavigate('admin');
                    } else {
                      onNavigate('dashboard');
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl bg-orange-600 text-white"
                >
                  <span>Go to Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigate('login');
                    }}
                    className="w-full text-center py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl border border-zinc-200 text-zinc-800"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigate('register');
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl bg-orange-600 text-white"
                  >
                    <span>Register Your Business</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <SupabaseSetupModal isOpen={dbModalOpen} onClose={() => setDbModalOpen(false)} />
    </>
  );
};
