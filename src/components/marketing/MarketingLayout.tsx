import React from 'react';
import { MarketingNav } from './MarketingNav';
import { SamleyLogo } from '../common/SamleyLogo';

interface MarketingLayoutProps {
  currentSection: string;
  onNavigate: (route: string) => void;
  children: React.ReactNode;
}

export const MarketingLayout: React.FC<MarketingLayoutProps> = ({
  currentSection,
  onNavigate,
  children,
}) => {
  const scrollOrNavigate = (route: string, sectionId: string) => {
    onNavigate(route);
    requestAnimationFrame(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <MarketingNav onNavigate={onNavigate} currentRoute={currentSection} />

      <main className="flex-1">{children}</main>

      {/* MARKETING WEBSITE FOOTER */}
      <footer className="py-12 bg-zinc-900 text-white border-t border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-8 border-b border-zinc-800">
            <div className="md:col-span-5 space-y-3 text-left">
              <SamleyLogo size="md" light={true} />
              <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
                SamleyBook is a multi-tenant appointment booking SaaS built for salons, barbershops, spas, wellness studios, and service businesses. A proud product of SamTeck Digital.
              </p>
            </div>

            <div className="md:col-span-4 space-y-2.5 text-left">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                Explore Platform
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
                <button
                  type="button"
                  onClick={() => scrollOrNavigate('/', 'home')}
                  className="text-left hover:text-white transition"
                >
                  Home
                </button>
                <button
                  type="button"
                  onClick={() => scrollOrNavigate('/features', 'features')}
                  className="text-left hover:text-white transition"
                >
                  Features
                </button>
                <button
                  type="button"
                  onClick={() => scrollOrNavigate('/pricing', 'pricing')}
                  className="text-left hover:text-white transition"
                >
                  Pricing
                </button>
                <button
                  type="button"
                  onClick={() => scrollOrNavigate('/about', 'about')}
                  className="text-left hover:text-white transition"
                >
                  About Us
                </button>
                <button
                  type="button"
                  onClick={() => scrollOrNavigate('/faq', 'faq')}
                  className="text-left hover:text-white transition"
                >
                  FAQ
                </button>
                <button
                  type="button"
                  onClick={() => scrollOrNavigate('/contact', 'contact')}
                  className="text-left hover:text-white transition"
                >
                  Contact Support
                </button>
              </div>
            </div>

            <div className="md:col-span-3 space-y-2.5 text-left">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                Business Portal
              </p>
              <div className="flex flex-col items-start gap-2 text-xs text-zinc-400">
                <button
                  type="button"
                  onClick={() => onNavigate('/app/login')}
                  className="hover:text-white transition font-medium"
                >
                  Business Owner Sign In
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/app/register')}
                  className="text-orange-400 hover:text-orange-300 transition font-semibold"
                >
                  Register Your Business &rarr;
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 text-[11px] text-zinc-500">
            <p>&copy; {new Date().getFullYear()} SamleyBook. A product by SamTeck Digital. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => onNavigate('/app/login')}
                className="hover:text-white transition"
              >
                Owner Login
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/app/register')}
                className="hover:text-white transition"
              >
                Register Business
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
