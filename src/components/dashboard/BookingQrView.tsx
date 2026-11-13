import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  QrCode,
  Download,
  Printer,
  Copy,
  Check,
  ExternalLink,
  Share2,
  Link2,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { PRIMARY_ORANGE_BTN, SURFACE_CARD } from './ui/DashboardTokens';

export const BookingQrView: React.FC = () => {
  const { currentBusiness } = useBusiness();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [baseUrl, setBaseUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('samley_booking_base_url') || import.meta.env.VITE_APP_URL || window.location.origin;
    } catch {
      return import.meta.env.VITE_APP_URL || window.location.origin;
    }
  });

  const bookingUrl = currentBusiness?.slug
    ? `${baseUrl.replace(/\/$/, '')}/b/${currentBusiness.slug}`
    : '';

  const handleBaseUrlChange = (value: string) => {
    setBaseUrl(value);
    try {
      localStorage.setItem('samley_booking_base_url', value.trim());
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    if (bookingUrl) {
      QRCode.toDataURL(bookingUrl, {
        width: 512,
        margin: 4,
        errorCorrectionLevel: 'H',
        color: {
          dark: '#0E1733',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('QR code generation error:', err));
    }
  }, [bookingUrl]);

  const handleCopyLink = async () => {
    if (!bookingUrl) return;
    await navigator.clipboard.writeText(bookingUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl || !currentBusiness) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${currentBusiness.slug}-booking-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrintQr = () => {
    window.print();
  };

  if (!currentBusiness) {
    return (
      <div className={`${SURFACE_CARD} p-8 text-center`}>
        <h3 className="text-base font-extrabold text-[#111827]">No Business Selected</h3>
        <p className="text-xs text-slate-500 mt-1">
          Select or register a business to generate its public booking QR code.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      {/* Printable Standee Sheet */}
      <div className="hidden print:block text-center p-8 bg-white text-black space-y-6">
        <h1 className="text-3xl font-black">{currentBusiness.name}</h1>
        <p className="text-lg text-slate-600">{currentBusiness.category}</p>
        <p className="text-sm text-slate-500">
          {currentBusiness.address} &bull; {currentBusiness.phone}
        </p>
        <div className="my-8 flex justify-center">
          {qrDataUrl && <img src={qrDataUrl} alt="QR Code" className="w-80 h-80" />}
        </div>
        <h2 className="text-xl font-bold">Scan with your smartphone camera to book your appointment!</h2>
        <p className="text-sm text-slate-500">No app download or account required &bull; Powered by SamleyBook</p>
        <p className="text-xs font-mono text-slate-400">{bookingUrl}</p>
      </div>

      {/* Screen View */}
      <div className="print:hidden space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: QR Display & Download / Print Card */}
          <div className={`lg:col-span-5 ${SURFACE_CARD} overflow-hidden`}>
            <div className="bg-gradient-to-r from-[#FF6514] to-[#E64D00] px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <QrCode className="w-4 h-4" />
                <span className="text-sm font-extrabold">Scan-to-Book QR Code</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
                High-Res PNG
              </span>
            </div>

            <div className="p-6 text-center space-y-5">
              <div className="p-5 bg-gradient-to-br from-[#FFF6EE] to-[#FFE7D4] rounded-2xl border border-[#FADAC1] flex justify-center">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Business QR Code"
                    className="w-60 h-60 rounded-xl shadow-xs bg-white p-2.5 border border-orange-100"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : (
                  <div className="w-60 h-60 flex items-center justify-center text-orange-300">
                    <QrCode className="w-16 h-16 animate-pulse" />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-[#111827]">{currentBusiness.name}</h3>
                <p className="text-xs text-slate-500">
                  Slug:{' '}
                  <code className="font-mono font-semibold text-[#F95700] bg-[#FFF3EC] px-2 py-0.5 rounded-md">
                    {currentBusiness.slug}
                  </code>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadQr}
                  className={`${PRIMARY_ORANGE_BTN} py-2.5 px-4 text-xs`}
                >
                  <Download className="w-4 h-4" />
                  <span>Download PNG</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintQr}
                  className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs hover:bg-slate-50 transition"
                >
                  <Printer className="w-4 h-4 text-[#2563EB]" />
                  <span>Print Standee</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right: Booking URL & Sharing Guide */}
          <div className="lg:col-span-7 space-y-6">
            <div className={`${SURFACE_CARD} p-6 space-y-4`}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#FFF3EC] text-[#F95700] flex items-center justify-center">
                  <Link2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#111827]">Your Public Booking URL</h3>
                  <p className="text-[11px] text-slate-500">
                    Customers can book directly with zero account creation
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 rounded-2xl bg-slate-50 border border-slate-200">
                <input
                  type="text"
                  readOnly
                  value={bookingUrl}
                  className="w-full px-3 py-1.5 text-xs font-mono text-[#111827] bg-transparent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className={`${PRIMARY_ORANGE_BTN} px-4 py-2 text-xs shrink-0`}
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-1.5 pt-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  QR Code Base URL
                </label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => handleBaseUrlChange(e.target.value)}
                  placeholder="https://your-domain.com or http://192.168.x.x:3000"
                  className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F95700]/25 focus:border-[#F95700] transition"
                />
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Use a publicly reachable URL (or your LAN IP when testing locally) so phones open your booking page after scanning.
                </p>
              </div>

              <div className="pt-1">
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FFF3EC] text-[#F95700] text-xs font-bold hover:bg-[#FFE7D4] transition"
                >
                  <span>Open live booking page</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <div className={`${SURFACE_CARD} p-6 space-y-4`}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
                  <Share2 className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-extrabold text-[#111827]">
                  How to Maximize QR Bookings
                </h4>
              </div>

              <div className="space-y-3 text-xs text-slate-600">
                {[
                  {
                    num: '1',
                    title: 'Front Desk & Mirrors:',
                    body: 'Print and place the QR standee at checkout counters, styling mirrors, waiting areas, and entrance doors.',
                  },
                  {
                    num: '2',
                    title: 'Social Media & WhatsApp:',
                    body: 'Add your booking link to your Instagram bio, TikTok profile, and WhatsApp Business auto-greeting.',
                  },
                  {
                    num: '3',
                    title: 'Zero Customer Friction:',
                    body: 'Customers do not need to download an app or create an account. They pick a service, select a slot, and book.',
                  },
                ].map((tip) => (
                  <div
                    key={tip.num}
                    className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/70 border border-slate-100"
                  >
                    <div className="w-6 h-6 rounded-full bg-[#F95700] text-white flex items-center justify-center font-extrabold text-[11px] shrink-0 mt-0.5">
                      {tip.num}
                    </div>
                    <p className="leading-relaxed">
                      <strong className="text-[#111827]">{tip.title}</strong> {tip.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
