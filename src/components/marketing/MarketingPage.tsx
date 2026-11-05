import React, { useState, useEffect } from 'react';
import {
  Calendar,
  QrCode,
  Smartphone,
  CreditCard,
  MessageSquare,
  Clock,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Check,
  Mail,
  Phone,
  MapPin,
  Send,
  Scissors,
  Camera,
  HeartHandshake,
} from 'lucide-react';
import { getSupabase } from '../../lib/supabase';
import { SubscriptionPlan } from '../../types/database';
import { SamleyLogo } from '../common/SamleyLogo';

interface Props {
  onNavigate: (route: string) => void;
}

export const MarketingPage: React.FC<Props> = ({ onNavigate }) => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '' });

  useEffect(() => {
    const fetchPlans = async () => {
      const supabase = getSupabase();
      if (!supabase) return;

      try {
        const { data } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('is_active', true)
          .order('price_ghs', { ascending: true });

        if (data && data.length > 0) {
          setPlans(data as SubscriptionPlan[]);
        }
      } catch (err) {
        // Fallback plans are displayed
      }
    };

    fetchPlans();
  }, []);

  const defaultPlans: SubscriptionPlan[] = [
    {
      id: 'plan-1',
      name: 'Starter Plan',
      code: 'starter',
      description: 'Perfect for independent stylists, solo barbers, and boutique studios',
      price_ghs: 120,
      billing_cycle: 'monthly',
      features: [
        'Up to 200 appointments/month',
        'Custom QR code booking page',
        'Moolre Mobile Money integration',
        'SMS booking confirmation',
        '24h SMS appointment reminders',
        '7-Day Free Trial included',
      ],
      is_active: true,
      created_at: new Date().toISOString(),
    },
    {
      id: 'plan-2',
      name: 'Growth Plan',
      code: 'growth',
      description: 'Ideal for busy salons, spas, and expanding wellness centres',
      price_ghs: 250,
      billing_cycle: 'monthly',
      features: [
        'Unlimited appointments',
        'Custom QR code & branding',
        'Moolre Mobile Money integration',
        'Priority SMS notifications',
        'Automated 24h reminders',
        'Customer history & notes',
        'PWA mobile install support',
      ],
      is_active: true,
      created_at: new Date().toISOString(),
    },
    {
      id: 'plan-3',
      name: 'Pro Plan',
      code: 'pro',
      description: 'For high-volume studios and premier multi-location appointment hubs',
      price_ghs: 450,
      billing_cycle: 'monthly',
      features: [
        'All Growth features',
        'Multi-business switcher support',
        'Highest throughput SMS gateway',
        'Deposit & full advance payments',
        'Dedicated SamTeck Digital support',
        'Real-time revenue analytics',
      ],
      is_active: true,
      created_at: new Date().toISOString(),
    },
  ];

  const displayPlans = plans.length > 0 ? plans : defaultPlans;

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setContactSubmitted(true);
    setTimeout(() => {
      setContactForm({ name: '', email: '', message: '' });
      setContactSubmitted(false);
    }, 4000);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* HERO SECTION */}
      <section id="home" className="relative pt-12 pb-24 overflow-hidden border-b border-zinc-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Headlines & CTA */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                <span>Smart Multi-Tenant Appointment Booking SaaS</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-zinc-900 tracking-tight leading-[1.1]">
                Book More Clients. Eliminate No-Shows.{' '}
                <span className="text-orange-600">Grow Your Business.</span>
              </h1>

              <p className="text-base sm:text-lg text-zinc-600 leading-relaxed max-w-2xl">
                SamleyBook empowers salons, barbershops, wellness spas, grooming lounges, and consultation businesses with a frictionless booking experience. Customers scan your custom QR code and book services in seconds — with no account registration or app download needed.
              </p>

              {/* Business Categories Badges */}
              <div className="flex flex-wrap gap-2 pt-2">
                {[
                  { label: 'Salons & Barbershops', icon: Scissors },
                  { label: 'Spas & Wellness', icon: HeartHandshake },
                  { label: 'Photography Studios', icon: Camera },
                  { label: 'Consultations & Services', icon: Calendar },
                ].map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-50 border border-zinc-200 text-xs font-medium text-zinc-700"
                    >
                      <Icon className="w-3 h-3 text-orange-600" />
                      {item.label}
                    </span>
                  );
                })}
              </div>

              {/* Primary Actions */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-4">
                <button
                  onClick={() => onNavigate('register')}
                  className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl bg-orange-600 text-white font-bold text-sm tracking-wide shadow-md hover:bg-orange-700 hover:shadow-lg transition-all"
                >
                  <span>Start 7-Day Free Trial</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onNavigate('login')}
                  className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl border border-zinc-200 text-zinc-800 font-semibold text-sm hover:bg-zinc-50 transition"
                >
                  <span>Sign In to Dashboard</span>
                </button>
              </div>

              <div className="flex items-center gap-6 pt-2 text-xs text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>7-Day Full Free Trial</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>No Credit Card Required</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Instant QR Code Activation</span>
                </div>
              </div>
            </div>

            {/* Right Column: Visual Preview Card */}
            <div className="lg:col-span-5 relative">
              <div className="relative mx-auto max-w-sm rounded-3xl bg-zinc-900 p-3 shadow-2xl ring-1 ring-zinc-800">
                {/* Phone screen mockup */}
                <div className="rounded-[22px] bg-white p-5 space-y-4 text-left overflow-hidden">
                  {/* Business header preview */}
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-orange-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                        S
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-zinc-900">Royal Grooming Studio</h4>
                        <p className="text-[10px] text-zinc-400">East Legon, Accra</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
                      Open Today
                    </span>
                  </div>

                  {/* QR Scan Prompt */}
                  <div className="p-3 rounded-2xl bg-orange-50 border border-orange-100 flex items-center gap-3">
                    <div className="w-12 h-12 bg-white rounded-xl p-1 shadow-xs border border-orange-200 flex items-center justify-center">
                      <QrCode className="w-8 h-8 text-orange-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-bold text-orange-900">Scan & Book In Seconds</p>
                      <p className="text-[11px] text-orange-700 leading-tight">
                        No login or app install needed for your customers!
                      </p>
                    </div>
                  </div>

                  {/* Sample Service Item */}
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                      Popular Service
                    </p>
                    <div className="p-3 rounded-xl border border-zinc-200 flex items-center justify-between bg-zinc-50/50">
                      <div>
                        <p className="text-xs font-bold text-zinc-900">Executive Haircut & Beard Trim</p>
                        <p className="text-[11px] text-zinc-500">45 minutes &bull; Steam towel included</p>
                      </div>
                      <span className="text-xs font-black text-orange-600">GHS 80.00</span>
                    </div>
                  </div>

                  {/* Date & Moolre payment tags */}
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="p-2 rounded-lg bg-zinc-100 flex items-center gap-1.5 text-zinc-700">
                      <Clock className="w-3.5 h-3.5 text-orange-600" />
                      <span>Select Available Slot</span>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-100 flex items-center gap-1.5 text-zinc-700">
                      <CreditCard className="w-3.5 h-3.5 text-orange-600" />
                      <span>Pay via Moolre MoMo</span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <div className="w-full py-2.5 rounded-xl bg-orange-600 text-white text-center text-xs font-bold shadow-xs">
                      Instant Booking Confirmed
                    </div>
                    <p className="text-[10px] text-center text-zinc-400 mt-2">
                      SMS confirmation automatically sent to customer
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PLATFORM FEATURES SECTION */}
      <section id="features" className="py-24 bg-zinc-50/50 border-b border-zinc-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <span className="text-xs font-bold tracking-widest text-orange-600 uppercase">
              Everything Your Business Needs
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-zinc-900 tracking-tight">
              Built From the Ground Up for Appointment Businesses
            </h2>
            <p className="text-zinc-600 text-sm sm:text-base leading-relaxed">
              Say goodbye to messy WhatsApp booking back-and-forths, manual paper logs, and costly customer no-shows. SamleyBook automates your entire appointment lifecycle.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mt-16 text-left">
            {[
              {
                icon: Calendar,
                title: 'Online Appointment Booking',
                desc: 'Give your clients a frictionless self-service scheduling portal accessible 24/7 on any device.',
              },
              {
                icon: Scissors,
                title: 'Business Service Management',
                desc: 'Configure services, upload custom photos, set exact durations in minutes, and manage pricing in Ghanaian Cedis.',
              },
              {
                icon: Smartphone,
                title: 'Custom Booking Web Page',
                desc: 'Every business gets its own branded, fast-loading public link (e.g., samleybook.com/b/your-business) with live availability.',
              },
              {
                icon: QrCode,
                title: 'Instant QR-Code Access',
                desc: 'Place your generated QR code on mirrors, counter tops, business cards, or storefront banners for instant customer booking.',
              },
              {
                icon: Clock,
                title: 'Real-Time Appointment Tracking',
                desc: 'View pending, confirmed, completed, and cancelled bookings in real time with Supabase Realtime synchronization.',
              },
              {
                icon: CreditCard,
                title: 'Moolre Payment Integration',
                desc: 'Accept Mobile Money payments securely. Allow customers to pay the full price or a configured deposit upfront.',
              },
              {
                icon: MessageSquare,
                title: 'SMS Alerts & 24h Reminders',
                desc: 'Automated SMS confirmations and 24-hour appointment reminders keep clients punctual and eliminate empty chairs.',
              },
              {
                icon: Sparkles,
                title: 'Progressive Web App (PWA)',
                desc: 'Install SamleyBook directly to your Android, iPhone, tablet, or PC home screen with instant app-like access.',
              },
            ].map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className="p-6 rounded-2xl bg-white border border-zinc-200/80 shadow-xs hover:border-orange-200 hover:shadow-md transition-all space-y-3"
                >
                  <div className="w-11 h-11 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-zinc-900">{feature.title}</h3>
                  <p className="text-xs text-zinc-600 leading-relaxed">{feature.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-20 bg-white border-b border-zinc-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-xs font-bold tracking-widest text-orange-600 uppercase">
              Seamless Workflow
            </span>
            <h2 className="text-3xl font-black text-zinc-900 tracking-tight">
              How SamleyBook Works for You & Your Clients
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-14 text-left">
            <div className="p-6 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
              <div className="w-8 h-8 rounded-full bg-orange-600 text-white font-bold flex items-center justify-center text-sm">
                1
              </div>
              <h4 className="text-base font-bold text-zinc-900">Register & Setup Services</h4>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Complete the two-stage business profile, add your services, specify your operating hours, and configure your Mobile Money destination.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
              <div className="w-8 h-8 rounded-full bg-orange-600 text-white font-bold flex items-center justify-center text-sm">
                2
              </div>
              <h4 className="text-base font-bold text-zinc-900">Share or Print Your QR Code</h4>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Download and print your unique QR code or copy your public booking link. Customers scan with their smartphone camera — no account needed.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
              <div className="w-8 h-8 rounded-full bg-orange-600 text-white font-bold flex items-center justify-center text-sm">
                3
              </div>
              <h4 className="text-base font-bold text-zinc-900">Receive Bookings & Payments</h4>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Appointments appear in your real-time dashboard immediately. Automated SMS confirmations and reminders notify your clients automatically.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SUBSCRIPTION PACKAGES / PRICING */}
      <section id="pricing" className="py-24 bg-zinc-50/50 border-b border-zinc-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <span className="text-xs font-bold tracking-widest text-orange-600 uppercase">
              Transparent Pricing
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-zinc-900 tracking-tight">
              Affordable Packages. Every Plan Begins With a 7-Day Free Trial.
            </h2>
            <p className="text-zinc-600 text-sm sm:text-base leading-relaxed">
              No hidden fees, no credit cards required to start. Experience everything SamleyBook offers for 7 full days before deciding.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16 max-w-6xl mx-auto">
            {displayPlans.map((plan, index) => {
              const isPopular = plan.code === 'growth' || index === 1;
              return (
                <div
                  key={plan.id}
                  className={`relative rounded-3xl p-8 flex flex-col justify-between transition-all text-left ${
                    isPopular
                      ? 'bg-white border-2 border-orange-600 shadow-xl ring-4 ring-orange-100'
                      : 'bg-white border border-zinc-200 shadow-xs hover:border-zinc-300'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-orange-600 text-white text-xs font-bold uppercase tracking-wider shadow-sm">
                      Most Popular
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900">{plan.name}</h3>
                      <p className="text-xs text-zinc-500 mt-1">{plan.description}</p>
                    </div>

                    <div className="pt-2 pb-4 border-b border-zinc-100">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl sm:text-4xl font-black text-zinc-900">
                          GHS {Number(plan.price_ghs).toFixed(2)}
                        </span>
                        <span className="text-xs font-semibold text-zinc-500">
                          /{plan.billing_cycle === 'yearly' ? 'year' : 'month'}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-orange-600 mt-1">
                        &bull; 7-Day Free Trial Active on Sign-up
                      </p>
                    </div>

                    <div className="space-y-2.5 pt-2">
                      <p className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                        Included Features:
                      </p>
                      {plan.features.map((feature, fIdx) => (
                        <div key={fIdx} className="flex items-start gap-2.5 text-xs text-zinc-600">
                          <Check className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-8">
                    <button
                      onClick={() => onNavigate('register')}
                      className={`w-full py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                        isPopular
                          ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-md'
                          : 'bg-zinc-900 text-white hover:bg-zinc-800'
                      }`}
                    >
                      Start 7-Day Free Trial
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CONTACT SECTION (SamTeck Digital) */}
      <section id="contact" className="py-24 bg-white border-b border-zinc-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 text-left">
            {/* Left info */}
            <div className="lg:col-span-5 space-y-6">
              <span className="text-xs font-bold tracking-widest text-orange-600 uppercase">
                Get In Touch
              </span>
              <h2 className="text-3xl font-black text-zinc-900 tracking-tight">
                SamTeck Digital Support & Inquiries
              </h2>
              <p className="text-sm text-zinc-600 leading-relaxed">
                Have questions about custom onboarding, merchant setup with Moolre, SMS packages, or high-volume enterprise integrations? The SamTeck Digital engineering team is ready to assist.
              </p>

              <div className="space-y-4 pt-2">
                <div className="flex items-start gap-3.5 text-xs text-zinc-700">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-zinc-900">Email Address</p>
                    <a
                      href="mailto:contact@samteckdigital.com"
                      className="text-zinc-600 hover:text-orange-600"
                    >
                      contact@samteckdigital.com
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 text-xs text-zinc-700">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-zinc-900">Phone & WhatsApp</p>
                    <span className="text-zinc-600">+233 (0) 50 123 4567 / +233 (0) 24 000 0000</span>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 text-xs text-zinc-700">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-zinc-900">Office Location</p>
                    <span className="text-zinc-600">Accra, Greater Accra Region, Ghana</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right form */}
            <div className="lg:col-span-7">
              <div className="p-8 rounded-3xl bg-zinc-50 border border-zinc-200">
                <h3 className="text-lg font-bold text-zinc-900 mb-2">Send us a Message</h3>
                <p className="text-xs text-zinc-500 mb-6">
                  We typically reply within 2 to 4 business hours.
                </p>

                {contactSubmitted ? (
                  <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                      <Check className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-bold text-emerald-900">Message Delivered!</h4>
                    <p className="text-xs text-emerald-700">
                      Thank you for contacting SamTeck Digital. Our team has received your message and will reach out shortly.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleContactSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Your Full Name
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Kwame Mensah"
                        value={contactForm.name}
                        onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                        className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="kwame@example.com"
                        value={contactForm.email}
                        onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                        className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Message or Inquiry
                      </label>
                      <textarea
                        required
                        rows={4}
                        placeholder="Tell us about your business or specific questions..."
                        value={contactForm.message}
                        onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                        className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                      />
                    </div>

                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-orange-700 shadow-sm transition"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Message</span>
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 bg-zinc-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-zinc-800">
            <SamleyLogo size="md" light={true} />
            <p className="text-xs text-zinc-400 text-center md:text-right max-w-md">
              SamleyBook is the modern appointment SaaS designed specifically for service-based businesses. A proud product of SamTeck Digital.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 text-[11px] text-zinc-500">
            <p>&copy; {new Date().getFullYear()} SamleyBook. A product by SamTeck Digital. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <button onClick={() => onNavigate('login')} className="hover:text-white transition">
                Owner Login
              </button>
              <button onClick={() => onNavigate('register')} className="hover:text-white transition">
                Register Business
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
