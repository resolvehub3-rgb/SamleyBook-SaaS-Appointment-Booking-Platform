import React, { useState } from 'react';
import {
  User,
  Mail,
  Phone,
  Lock,
  Building2,
  MapPin,
  FileText,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Tag,
  Upload,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { getSupabase, uploadBusinessAsset } from '../../lib/supabase';
import { generateBusinessSlug, isValidGhanaPhone } from '../../utils/booking-logic';
import { SamleyLogo } from '../common/SamleyLogo';

interface Props {
  onNavigate: (route: string) => void;
}

export const RegisterPage: React.FC<Props> = ({ onNavigate }) => {
  const { signUp } = useAuth();
  const { refreshBusinesses } = useBusiness();

  // Stage 1 vs 2
  const [currentStage, setCurrentStage] = useState<1 | 2>(1);

  // Stage 1 fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [personalPhone, setPersonalPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Stage 2 fields
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('Salons & Barbershops');
  const [description, setDescription] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [address, setAddress] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Status & error states
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Stage 1 validation & proceed
  const handleStageOneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!fullName.trim()) {
      setErrorMsg('Please enter your full name');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address');
      return;
    }
    if (!personalPhone.trim() || !isValidGhanaPhone(personalPhone)) {
      setErrorMsg('Please enter a valid Ghanaian phone number (e.g. 024XXXXXXX or 050XXXXXXX)');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }

    // Pre-populate business phone & email defaults if empty
    if (!businessPhone) setBusinessPhone(personalPhone);
    if (!businessEmail) setBusinessEmail(email);

    setCurrentStage(2);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  // Stage 2 final registration submission
  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!businessName.trim()) {
      setErrorMsg('Please enter your business name');
      return;
    }
    if (!address.trim()) {
      setErrorMsg('Please enter your business location/address');
      return;
    }
    if (!businessPhone.trim() || !isValidGhanaPhone(businessPhone)) {
      setErrorMsg('Please enter a valid business phone number');
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = getSupabase();
      if (!supabase) {
        throw new Error('Supabase is not configured. Please configure your Supabase keys in Settings or on the login page.');
      }

      // 1. Sign up owner account in Supabase Auth
      const { user, error: signUpError } = await signUp(
        email.trim(),
        password,
        fullName.trim(),
        personalPhone.trim(),
        'business_owner'
      );

      if (signUpError || !user) {
        throw new Error(signUpError?.message || 'Failed to create user account');
      }

      // 2. Upload logo if provided
      let uploadedLogoUrl: string | null = null;
      if (logoFile) {
        const uploadResult = await uploadBusinessAsset(logoFile, 'logos');
        if (uploadResult.url) {
          uploadedLogoUrl = uploadResult.url;
        }
      }

      // 3. Generate unique business slug
      const baseSlug = generateBusinessSlug(businessName);
      const uniqueSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;

      // 4. Insert business record
      const { data: businessData, error: businessError } = await supabase
        .from('businesses')
        .insert({
          owner_id: user.id,
          name: businessName.trim(),
          slug: uniqueSlug,
          category,
          description: description.trim() || null,
          phone: businessPhone.trim(),
          email: businessEmail.trim() || email.trim(),
          address: address.trim(),
          logo_url: uploadedLogoUrl,
          is_active: true,
        })
        .select()
        .single();

      if (businessError || !businessData) {
        throw new Error(`Business creation failed: ${businessError?.message}`);
      }

      // 5. Assign default 7-day free trial
      await supabase.from('business_subscriptions').insert({
        business_id: businessData.id,
        status: 'trialing',
        trial_start: new Date().toISOString(),
        trial_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        payment_status: 'none',
      });

      // 6. Assign default payment configuration
      await supabase.from('payment_configurations').insert({
        business_id: businessData.id,
        payment_type: 'full',
        mobile_money_provider: 'MTN MoMo',
        mobile_money_number: businessPhone.trim(),
      });

      // 7. Log registration confirmation SMS
      const dashboardUrl = `${window.location.origin}/dashboard`;
      await supabase.from('sms_logs').insert({
        business_id: businessData.id,
        recipient_phone: personalPhone.trim(),
        message_type: 'registration',
        message_text: `Welcome to SamleyBook! Your business "${businessName}" has been successfully registered. Your 7-day free trial is now active. You can access your business dashboard here: ${dashboardUrl}. Thank you for choosing SamleyBook.`,
        delivery_status: 'sent',
      });

      // 8. Log registration confirmation email
      await supabase.from('email_logs').insert({
        business_id: businessData.id,
        recipient_email: email.trim(),
        subject: `Welcome to SamleyBook — Your Business is Live!`,
        message_type: 'registration',
        delivery_status: 'sent',
      });

      // 9. Store active business and refresh
      if (typeof window !== 'undefined') {
        localStorage.setItem('samley_active_business_id', businessData.id);
      }
      await refreshBusinesses();

      setSuccess(true);
      setTimeout(() => {
        onNavigate('dashboard');
      }, 2000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <button
          onClick={() => onNavigate('home')}
          className="inline-block focus:outline-none mb-6"
        >
          <SamleyLogo size="lg" />
        </button>

        <h2 className="text-2xl font-black text-zinc-900 tracking-tight">
          Register Your Business
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Get started with your 7-day free trial. No credit card required.
        </p>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-3 mt-6">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                currentStage === 1
                  ? 'bg-orange-600 text-white'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              1
            </span>
            <span className={`text-xs font-semibold ${currentStage === 1 ? 'text-zinc-900' : 'text-zinc-500'}`}>
              Personal Details
            </span>
          </div>

          <span className="w-8 h-px bg-zinc-300" />

          <div className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                currentStage === 2
                  ? 'bg-orange-600 text-white'
                  : 'bg-zinc-200 text-zinc-600'
              }`}
            >
              2
            </span>
            <span className={`text-xs font-semibold ${currentStage === 2 ? 'text-zinc-900' : 'text-zinc-400'}`}>
              Business Profile
            </span>
          </div>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl px-4 sm:px-0">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-xl rounded-3xl border border-zinc-200/80 text-left">
          {errorMsg && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {success && (
            <div className="mb-6 p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <h4 className="text-base font-bold text-emerald-900">Registration Complete!</h4>
              <p className="text-xs text-emerald-700">
                Welcome to SamleyBook! Your 7-day free trial has been activated. Confirmation SMS & email have been recorded. Redirecting to your dashboard...
              </p>
            </div>
          )}

          {!success && currentStage === 1 && (
            <form onSubmit={handleStageOneSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kwame Mensah"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Personal Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="kwame@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Phone Number (For Registration SMS)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                  <input
                    type="tel"
                    required
                    placeholder="024XXXXXXX or 050XXXXXXX"
                    value={personalPhone}
                    onChange={(e) => setPersonalPhone(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  We send your registration confirmation and trial access details to this number.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      placeholder="Min 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-orange-700 shadow-md transition"
                >
                  <span>Continue to Business Profile</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {!success && currentStage === 2 && (
            <form onSubmit={handleFinalSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Business Name
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Prestige Barbers & Grooming"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Business Category
                </label>
                <div className="relative">
                  <Tag className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                  >
                    <option value="Salons & Barbershops">Salons & Barbershops</option>
                    <option value="Spas & Wellness">Spas & Wellness</option>
                    <option value="Beauty & Grooming">Beauty & Grooming</option>
                    <option value="Photography Studios">Photography Studios</option>
                    <option value="Consultation & Professional Services">
                      Consultation & Professional Services
                    </option>
                    <option value="Other Appointment-Based Business">
                      Other Appointment-Based Business
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Business Location / Address
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Shop 4B, Accra Mall Commercial Wing"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Business Phone
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="024XXXXXXX"
                    value={businessPhone}
                    onChange={(e) => setBusinessPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Business Email (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="info@yourbusiness.com"
                    value={businessEmail}
                    onChange={(e) => setBusinessEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Business Description
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                  <textarea
                    rows={2}
                    placeholder="Briefly describe what services your business provides..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              {/* Logo Upload */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Business Logo (Optional)
                </label>
                <div className="flex items-center gap-4">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Logo Preview"
                      className="w-12 h-12 rounded-xl object-cover border border-zinc-200"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-zinc-100 border border-dashed border-zinc-300 flex items-center justify-center text-zinc-400">
                      <Upload className="w-5 h-5" />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="text-xs text-zinc-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentStage(1)}
                  className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border border-zinc-300 text-zinc-700 font-semibold text-xs hover:bg-zinc-50 transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-orange-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-orange-700 shadow-md disabled:opacity-50 transition"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Creating Business & Trial...</span>
                    </>
                  ) : (
                    <>
                      <span>Register Business</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 pt-6 border-t border-zinc-100 text-center">
            <p className="text-xs text-zinc-500">
              Already have an account?{' '}
              <button
                onClick={() => onNavigate('login')}
                className="font-bold text-orange-600 hover:text-orange-700"
              >
                Sign in here
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
