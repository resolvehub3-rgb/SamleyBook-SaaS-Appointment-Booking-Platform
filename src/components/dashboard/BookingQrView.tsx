import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  QrCode,
  Download,
  Printer,
  Copy,
  Check,
  ExternalLink,
  Smartphone,
  Share2,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';

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
  const printRef = useRef<HTMLDivElement>(null);

  const bookingUrl = currentBusiness?.slug
    ? `${baseUrl.replace(/\/$/, '')}/b/${currentBusiness.slug}`
    : '';

  const handleBaseUrlChange = (value: string) => {
    setBaseUrl(value);
    try {
      localStorage.setItem('samley_booking_base_url', value.trim());
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (bookingUrl) {
      QRCode.toDataURL(bookingUrl, {
        width: 512,
        margin: 4,
        errorCorrectionLevel: 'H',
        color: {
          dark: '#000000',
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
      <div className="p-8 text-center bg-white rounded-3xl border border-zinc-200">
        <h3 className="text-base font-bold text-zinc-900">No Business Selected</h3>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Printable Sheet (Visible during window.print()) */}
      <div className="hidden print:block text-center p-8 bg-white text-black space-y-6">
        <h1 className="text-3xl font-black">{currentBusiness.name}</h1>
        <p className="text-lg text-zinc-600">{currentBusiness.category}</p>
        <p className="text-sm text-zinc-500">{currentBusiness.address} &bull; {currentBusiness.phone}</p>
        <div className="my-8 flex justify-center">
          {qrDataUrl && <img src={qrDataUrl} alt="QR Code" className="w-80 h-80" />}
        </div>
        <h2 className="text-xl font-bold">Scan with your smartphone camera to book your appointment!</h2>
        <p className="text-sm text-zinc-500">No app download or account required &bull; Powered by SamleyBook</p>
        <p className="text-xs font-mono text-zinc-400">{bookingUrl}</p>
      </div>

      {/* Screen View */}
      <div className="print:hidden space-y-6">
        <div>
          <h2 className="text-xl font-black text-zinc-900 tracking-tight">
            Booking Page & QR Code Access
          </h2>
          <p className="text-xs text-zinc-500">
            Customers scan your unique QR code to open your services and book instantly without signing in
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: QR Display & Download / Print Card */}
          <div className="lg:col-span-5 bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-6 text-center space-y-6">
            <div className="p-4 bg-orange-50/50 rounded-2xl border border-orange-100 flex justify-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Business QR Code"
                  className="w-64 h-64 shadow-xs bg-white p-2"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : (
                <div className="w-64 h-64 flex items-center justify-center text-zinc-300">
                  <QrCode className="w-16 h-16 animate-pulse" />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-bold text-zinc-900">{currentBusiness.name}</h3>
              <p className="text-xs text-zinc-500">
                Unique identifier: <code className="font-mono text-orange-600">{currentBusiness.slug}</code>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={handleDownloadQr}
                className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-orange-700 shadow-xs transition"
              >
                <Download className="w-4 h-4" />
                <span>Download PNG</span>
              </button>

              <button
                onClick={handlePrintQr}
                className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-zinc-200 text-zinc-700 font-bold text-xs uppercase tracking-wider hover:bg-zinc-50 transition"
              >
                <Printer className="w-4 h-4" />
                <span>Print Standee</span>
              </button>
            </div>
          </div>

          {/* Right: Booking URL & Sharing Advice */}
          <div className="lg:col-span-7 space-y-6 text-left">
            {/* Live Link Card */}
            <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-6 space-y-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600">
                Your Public Booking URL
              </span>

              <div className="flex items-center gap-2 p-2 rounded-2xl bg-zinc-50 border border-zinc-200">
                <input
                  type="text"
                  readOnly
                  value={bookingUrl}
                  className="w-full px-3 py-1.5 text-xs font-mono text-zinc-800 bg-transparent focus:outline-none"
                />
                <button
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-bold shrink-0 hover:bg-orange-700 transition"
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

              <div className="space-y-2 pt-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  QR Code Base URL
                </label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => handleBaseUrlChange(e.target.value)}
                  placeholder="https://your-domain.com or http://192.168.x.x:3001"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition"
                />
                <p className="text-[10px] text-zinc-400 leading-relaxed">
                  Use a publicly reachable URL (or your computer's LAN IP when testing locally) so phones can open the booking page after scanning.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700"
                >
                  <span>Open live booking page in new tab</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Best practices guide */}
            <div className="bg-white rounded-3xl border border-zinc-200/80 shadow-xs p-6 space-y-4">
              <h4 className="text-sm font-bold text-zinc-900">How to use your QR Code for Maximum Bookings</h4>

              <div className="space-y-3 text-xs text-zinc-600">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                    1
                  </div>
                  <p>
                    <strong className="text-zinc-900">Front Desk & Mirrors:</strong> Print and place the QR standee directly at checkout counters, mirrors, waiting areas, and entrance doors.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                    2
                  </div>
                  <p>
                    <strong className="text-zinc-900">Social Media & WhatsApp:</strong> Add your booking link to your Instagram bio, TikTok profile, and WhatsApp Business greeting message.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                    3
                  </div>
                  <p>
                    <strong className="text-zinc-900">Zero Customer Friction:</strong> Customers do not need to download an application or sign up. They select a service, choose a time, and confirm.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
