import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { getSupabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import {
  Business,
  BusinessSubscription,
  PaymentConfiguration,
  Service,
  Appointment,
  Customer,
} from '../types/database';
import {
  SAMLEYBOOK_PLAN_CODE,
  SAMLEYBOOK_TRIAL_DAYS,
  DAY_MS,
  SubscriptionAccessEvaluation,
  evaluateSubscriptionAccess,
  isSuperAdminUser,
} from '../utils/subscription-access';

interface BusinessContextType {
  businesses: Business[];
  currentBusiness: Business | null;
  setCurrentBusiness: (business: Business) => void;
  subscription: BusinessSubscription | null;
  subscriptionAccess: SubscriptionAccessEvaluation;
  subscriptionLoading: boolean;
  paymentConfig: PaymentConfiguration | null;
  services: Service[];
  appointments: Appointment[];
  customers: Customer[];
  isLoading: boolean;
  createBusiness: (
    data: Partial<Business>
  ) => Promise<{ business: Business | null; error: Error | null }>;
  updateBusiness: (id: string, updates: Partial<Business>) => Promise<{ error: Error | null }>;
  refreshBusinesses: () => Promise<void>;
  refreshBusinessData: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export const BusinessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [currentBusiness, setCurrentBusinessState] = useState<Business | null>(null);
  const [subscription, setSubscription] = useState<BusinessSubscription | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState<boolean>(false);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfiguration | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  // Periodic tick every 30s + immediate re-evaluation on window focus / visibility
  useEffect(() => {
    const updateClock = () => setNowTick(Date.now());
    const interval = window.setInterval(updateClock, 30_000);
    window.addEventListener('focus', updateClock);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') updateClock();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', updateClock);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const isAdmin = isSuperAdminUser(profile?.role, user?.email);

  const subscriptionAccess = useMemo(
    () => evaluateSubscriptionAccess(subscription, new Date(nowTick)),
    [subscription, nowTick]
  );

  // Switch active business and store in localStorage for session persistence
  const setCurrentBusiness = (business: Business) => {
    if (business?.id !== currentBusiness?.id) {
      setSubscriptionLoading(true);
    }
    setCurrentBusinessState(business);
    if (typeof window !== 'undefined' && business?.id) {
      localStorage.setItem('samley_active_business_id', business.id);
    }
  };

  const fetchBusinesses = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !user) {
      setBusinesses([]);
      setCurrentBusinessState(null);
      setSubscription(null);
      setSubscriptionLoading(false);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching businesses:', error);
      } else if (data) {
        const bList = data as Business[];
        setBusinesses(bList);

        const savedId =
          typeof window !== 'undefined'
            ? localStorage.getItem('samley_active_business_id')
            : null;
        const matched = bList.find((b) => b.id === savedId) || bList[0] || null;
        if (matched) {
          setSubscriptionLoading(true);
        } else {
          setSubscriptionLoading(false);
        }
        setCurrentBusinessState(matched);
      }
    } catch (err) {
      console.error('Failed to load businesses:', err);
      setSubscriptionLoading(false);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const fetchSubscriptionOnly = useCallback(async (businessId: string) => {
    const supabase = getSupabase();
    if (!supabase || !businessId) return null;

    setNowTick(Date.now());

    // Try authoritative server UTC status check first (lazily marks expired rows in DB)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        const res = await fetch(
          `/api/subscriptions/status?businessId=${encodeURIComponent(businessId)}`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }
        );
        if (res.ok) {
          const json = await res.json();
          if (json?.serverNowUtc) {
            const serverMs = Date.parse(json.serverNowUtc);
            if (Number.isFinite(serverMs)) setNowTick(serverMs);
          }
          if (json?.subscription !== undefined) {
            setSubscription(json.subscription as BusinessSubscription | null);
            return json.subscription as BusinessSubscription | null;
          }
        }
      }
    } catch {
      // Fallback to direct Supabase query below
    }

    const { data: subData } = await supabase
      .from('business_subscriptions')
      .select('*, plan:subscription_plans(*)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    setSubscription(subData as BusinessSubscription | null);
    return (subData as BusinessSubscription | null) || null;
  }, []);

  // Fetch sub-data for the currently selected business
  const fetchCurrentBusinessDetails = useCallback(
    async (businessId: string) => {
      const supabase = getSupabase();
      if (!supabase || !businessId) return;

      setSubscriptionLoading(true);
      try {
        // 1. Authoritative Subscription check first
        const subData = await fetchSubscriptionOnly(businessId);
        const evalResult = evaluateSubscriptionAccess(subData, new Date());

        if (evalResult.isExpired && !isAdmin) {
          // Clear operational workspace data from memory when subscription is expired
          setPaymentConfig(null);
          setServices([]);
          setAppointments([]);
          setCustomers([]);
          return;
        }

        // 2. Payment config
        const { data: payData } = await supabase
          .from('payment_configurations')
          .select('*')
          .eq('business_id', businessId)
          .maybeSingle();

        setPaymentConfig(payData as PaymentConfiguration | null);

        // 3. Services
        const { data: svcData } = await supabase
          .from('services')
          .select('*')
          .eq('business_id', businessId)
          .order('created_at', { ascending: false });

        setServices((svcData as Service[]) || []);

        // 4. Appointments
        const { data: apptData } = await supabase
          .from('appointments')
          .select('*, service:services(*)')
          .eq('business_id', businessId)
          .order('appointment_date', { ascending: false })
          .order('appointment_time', { ascending: false });

        setAppointments((apptData as Appointment[]) || []);

        // 5. Customers
        const { data: custData } = await supabase
          .from('customers')
          .select('*')
          .eq('business_id', businessId)
          .order('created_at', { ascending: false });

        setCustomers((custData as Customer[]) || []);
      } catch (err) {
        console.error('Error fetching business details:', err);
      } finally {
        setSubscriptionLoading(false);
      }
    },
    [fetchSubscriptionOnly, isAdmin]
  );

  useEffect(() => {
    if (user) {
      fetchBusinesses();
    } else {
      setBusinesses([]);
      setCurrentBusinessState(null);
      setSubscription(null);
      setSubscriptionLoading(false);
      setPaymentConfig(null);
      setServices([]);
      setAppointments([]);
      setCustomers([]);
      setIsLoading(false);
    }
  }, [user, fetchBusinesses]);

  useEffect(() => {
    if (currentBusiness?.id) {
      fetchCurrentBusinessDetails(currentBusiness.id);
    } else {
      setSubscription(null);
      setSubscriptionLoading(false);
      setPaymentConfig(null);
      setServices([]);
      setAppointments([]);
      setCustomers([]);
    }
  }, [currentBusiness?.id, fetchCurrentBusinessDetails]);

  // Refresh authoritative subscription status when user returns to browser tab
  useEffect(() => {
    if (!currentBusiness?.id) return;
    const handleFocusRefresh = () => {
      fetchSubscriptionOnly(currentBusiness.id);
    };
    window.addEventListener('focus', handleFocusRefresh);
    return () => window.removeEventListener('focus', handleFocusRefresh);
  }, [currentBusiness?.id, fetchSubscriptionOnly]);

  // Set up Supabase Realtime subscriptions for live appointments, services, payments, and subscriptions
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !currentBusiness?.id) return;

    const channel = supabase
      .channel(`business-${currentBusiness.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'business_subscriptions',
          filter: `business_id=eq.${currentBusiness.id}`,
        },
        () => {
          fetchCurrentBusinessDetails(currentBusiness.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `business_id=eq.${currentBusiness.id}`,
        },
        () => {
          fetchCurrentBusinessDetails(currentBusiness.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'services',
          filter: `business_id=eq.${currentBusiness.id}`,
        },
        () => {
          fetchCurrentBusinessDetails(currentBusiness.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_transactions',
          filter: `business_id=eq.${currentBusiness.id}`,
        },
        () => {
          fetchCurrentBusinessDetails(currentBusiness.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentBusiness?.id, fetchCurrentBusinessDetails]);

  const createBusiness = async (businessData: Partial<Business>) => {
    const supabase = getSupabase();
    if (!supabase || !user) {
      return { business: null, error: new Error('User not authenticated') };
    }

    try {
      const { data, error } = await supabase
        .from('businesses')
        .insert({
          owner_id: user.id,
          name: businessData.name,
          slug: businessData.slug,
          category: businessData.category,
          description: businessData.description || '',
          phone: businessData.phone,
          email: businessData.email || user.email,
          address: businessData.address,
          logo_url: businessData.logo_url || null,
          operating_hours: businessData.operating_hours,
        })
        .select()
        .single();

      if (error) {
        return { business: null, error: error as Error };
      }

      const newBiz = data as Business;
      const now = new Date();
      const trialEndIso = new Date(
        now.getTime() + SAMLEYBOOK_TRIAL_DAYS * DAY_MS
      ).toISOString();

      const { data: planRow } = await supabase
        .from('subscription_plans')
        .select('id')
        .in('code', [SAMLEYBOOK_PLAN_CODE, 'book-premium', 'starter'])
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      // Assign default 7-day free trial subscription
      await supabase.from('business_subscriptions').insert({
        business_id: newBiz.id,
        plan_id: planRow?.id || null,
        status: 'trialing',
        trial_start: now.toISOString(),
        trial_end: trialEndIso,
        current_period_start: now.toISOString(),
        current_period_end: trialEndIso,
        payment_status: 'none',
      });

      // Assign default payment configuration
      await supabase.from('payment_configurations').insert({
        business_id: newBiz.id,
        payment_type: 'full',
        mobile_money_provider: 'MTN MoMo',
        mobile_money_number: newBiz.phone,
      });

      // Refresh list and select new business
      await fetchBusinesses();
      setCurrentBusiness(newBiz);

      return { business: newBiz, error: null };
    } catch (err) {
      return {
        business: null,
        error: err instanceof Error ? err : new Error('Creation failed'),
      };
    }
  };

  const updateBusiness = async (id: string, updates: Partial<Business>) => {
    const supabase = getSupabase();
    if (!supabase) return { error: new Error('Supabase client not ready') };

    const { error } = await supabase.from('businesses').update(updates).eq('id', id);

    if (!error) {
      await fetchBusinesses();
    }
    return { error: error as Error | null };
  };

  return (
    <BusinessContext.Provider
      value={{
        businesses,
        currentBusiness,
        setCurrentBusiness,
        subscription,
        subscriptionAccess,
        subscriptionLoading,
        paymentConfig,
        services,
        appointments,
        customers,
        isLoading,
        createBusiness,
        updateBusiness,
        refreshBusinesses: fetchBusinesses,
        refreshBusinessData: async () => {
          if (currentBusiness?.id) {
            await fetchCurrentBusinessDetails(currentBusiness.id);
          }
        },
        refreshSubscription: async () => {
          if (currentBusiness?.id) {
            await fetchSubscriptionOnly(currentBusiness.id);
          }
        },
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
};

export const useBusiness = () => {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error('useBusiness must be used within a BusinessProvider');
  }
  return context;
};
