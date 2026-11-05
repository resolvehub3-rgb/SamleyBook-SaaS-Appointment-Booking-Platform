import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

interface BusinessContextType {
  businesses: Business[];
  currentBusiness: Business | null;
  setCurrentBusiness: (business: Business) => void;
  subscription: BusinessSubscription | null;
  paymentConfig: PaymentConfiguration | null;
  services: Service[];
  appointments: Appointment[];
  customers: Customer[];
  isLoading: boolean;
  createBusiness: (data: Partial<Business>) => Promise<{ business: Business | null; error: Error | null }>;
  updateBusiness: (id: string, updates: Partial<Business>) => Promise<{ error: Error | null }>;
  refreshBusinesses: () => Promise<void>;
  refreshBusinessData: () => Promise<void>;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export const BusinessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [currentBusiness, setCurrentBusinessState] = useState<Business | null>(null);
  const [subscription, setSubscription] = useState<BusinessSubscription | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfiguration | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Switch active business and store in localStorage for session persistence
  const setCurrentBusiness = (business: Business) => {
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

        // Restore previously selected business or pick first
        const savedId = typeof window !== 'undefined' ? localStorage.getItem('samley_active_business_id') : null;
        const matched = bList.find((b) => b.id === savedId) || bList[0] || null;
        setCurrentBusinessState(matched);
      }
    } catch (err) {
      console.error('Failed to load businesses:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Fetch sub-data for the currently selected business
  const fetchCurrentBusinessDetails = useCallback(async (businessId: string) => {
    const supabase = getSupabase();
    if (!supabase || !businessId) return;

    try {
      // 1. Subscription
      const { data: subData } = await supabase
        .from('business_subscriptions')
        .select('*, plan:subscription_plans(*)')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setSubscription(subData as BusinessSubscription | null);

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
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchBusinesses();
    } else {
      setBusinesses([]);
      setCurrentBusinessState(null);
      setSubscription(null);
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
      setPaymentConfig(null);
      setServices([]);
      setAppointments([]);
      setCustomers([]);
    }
  }, [currentBusiness?.id, fetchCurrentBusinessDetails]);

  // Set up Supabase Realtime subscriptions for live appointments and services updates
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

      // Assign default 7-day free trial subscription
      await supabase.from('business_subscriptions').insert({
        business_id: newBiz.id,
        status: 'trialing',
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

    const { error } = await supabase
      .from('businesses')
      .update(updates)
      .eq('id', id);

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
