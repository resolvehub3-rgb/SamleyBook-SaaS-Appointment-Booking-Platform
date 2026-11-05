import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { getSupabase, getSupabaseCredentials, isValidSupabaseUrl, isValidAnonKey } from '../lib/supabase';
import { Profile } from '../types/database';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    phone: string,
    role?: 'business_owner' | 'super_admin'
  ) => Promise<{ user: User | null; error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshClient: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConfigured, setIsConfigured] = useState<boolean>(() => {
    const creds = getSupabaseCredentials();
    return !!(creds.url && creds.anonKey && isValidSupabaseUrl(creds.url) && isValidAnonKey(creds.anonKey));
  });

  const fetchProfile = useCallback(async (userId: string, userEmail?: string) => {
    const supabase = getSupabase();
    if (!supabase) return;

    try {
      const isSuperAdminEmail = (userEmail || user?.email || '').toLowerCase().trim() === 'samleybook@gmail.com';

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
      }

      if (data) {
        if (isSuperAdminEmail && data.role !== 'super_admin') {
          // Promote to super_admin in real database
          await supabase
            .from('profiles')
            .update({ role: 'super_admin' })
            .eq('id', userId);
          setProfile({ ...data, role: 'super_admin' } as Profile);
        } else {
          setProfile(data as Profile);
        }
      } else if (isSuperAdminEmail) {
        // Create profile if missing
        const adminProfile: Partial<Profile> = {
          id: userId,
          email: 'samleybook@gmail.com',
          full_name: 'Super Admin',
          phone: '+233200000000',
          role: 'super_admin',
        };
        await supabase.from('profiles').upsert(adminProfile);
        setProfile(adminProfile as Profile);
      }
    } catch (err) {
      console.error('Failed to load user profile:', err);
    }
  }, [user?.email]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id, user.email);
    }
  }, [user?.id, user?.email, fetchProfile]);

  const refreshClient = useCallback(() => {
    const creds = getSupabaseCredentials();
    const configured = !!(creds.url && creds.anonKey && isValidSupabaseUrl(creds.url) && isValidAnonKey(creds.anonKey));
    setIsConfigured(configured);
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id, session.user.email);
      }
      setIsLoading(false);
    }).catch((err) => {
      console.error('Failed to get session:', err);
      setIsLoading(false);
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id, session.user.email);
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile, isConfigured]);

  const signIn = async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      return { error: new Error('Supabase client is not configured') };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    phone: string,
    role: 'business_owner' | 'super_admin' = 'business_owner'
  ) => {
    const supabase = getSupabase();
    if (!supabase) {
      return { user: null, error: new Error('Supabase client is not configured') };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone,
          role,
        },
      },
    });

    if (data.user && !error) {
      // Ensure profile record exists
      try {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          full_name: fullName,
          email,
          phone,
          role,
          updated_at: new Date().toISOString(),
        });
      } catch (upsertErr) {
        console.warn('Profile upsert warning:', upsertErr);
      }
    }

    return { user: data.user, error: error as Error | null };
  };

  const signOut = async () => {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isLoading,
        isConfigured,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        refreshClient,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
