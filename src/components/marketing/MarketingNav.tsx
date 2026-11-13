import React, { useState } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';
import { SamleyLogo } from '../common/SamleyLogo';
import { PWAInstallButton } from '../common/PWAInstallButton';

import { useAuth } from '../../context/AuthContext';

interface Props {
  onNavigate: (route: string) => void;
  currentRoute: string;
}

export const MarketingNav: React.FC<Props> = ({ onNavigate, currentRoute }) => {
  const { user, profile } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Home', href: '/', sectionId: 'home' },
    { label: 'Features', href: '/features', sectionId: 'features' },
    { label: 'Pricing', href: '/pricing', sectionId: 'pricing' },
    { label: 'About', href: '/about', sectionId: 'about' },
    { label: 'FAQ', href: '/faq', sectionId: 'faq' },
    { label: 'Contact', href: '/contact', sectionId: 'contact' },
  ];

  const handleSectionLink = (href: string, sectionId: string) => {
    onNavigate(href);
    requestAnimationFrame(() => {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    });
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-zinc-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo with SamTeck Digital Attribution */}
          <button
            type="button"
            onClick={() => handleSectionLink('/', 'home')}
            className="text-left focus:outline-none"
            aria-label="SamleyBook Home"
          >
            <SamleyLogo size="md" />
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8" aria-label="Marketing Navigation">
            {navLinks.map((link) => (
              <button
                key={link.href}
                type="button"
                onClick={() => handleSectionLink(link.href, link.sectionId)}
                className={`text-sm font-semibold transition ${
                  currentRoute === link.sectionId
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
            <PWAInstallButton variant="secondary" />

            {user ? (
              <button
                type="button"
                onClick={() => {
                  if (profile?.role === 'super_admin') {
                    onNavigate('/app/admin');
                  } else {
                    onNavigate('/app/dashboard');
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
                  type="button"
                  onClick={() => onNavigate('/app/login')}
                  className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/app/register')}
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
              type="button"
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
                type="button"
                onClick={() => {
                  handleSectionLink(link.href, link.sectionId);
                  setMobileMenuOpen(false);
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
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    if (profile?.role === 'super_admin') {
                      onNavigate('/app/admin');
                    } else {
                      onNavigate('/app/dashboard');
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
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigate('/app/login');
                    }}
                    className="w-full text-center py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl border border-zinc-200 text-zinc-800"
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigate('/app/register');
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
    </>
  );
};
