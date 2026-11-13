import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { getSupabase, getSupabaseCredentials, isValidSupabaseUrl, isValidAnonKey } from '../lib/supabase';
import { Profile } from '../types/database';
import { clearSensitiveClientCaches } from '../utils/session-cleanup';
import { SUPER_ADMIN_EMAIL } from '../utils/app-routing';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  profileLoading: boolean;
  sessionExpired: boolean;
  clearSessionExpired: () => void;
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
  const [profileLoading, setProfileLoading] = useState<boolean>(false);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  const [isConfigured, setIsConfigured] = useState<boolean>(() => {
    const creds = getSupabaseCredentials();
    return !!(creds.url && creds.anonKey && isValidSupabaseUrl(creds.url) && isValidAnonKey(creds.anonKey));
  });

  const hadSessionRef = useRef<boolean>(false);
  const manualSignOutRef = useRef<boolean>(false);

  const clearSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  const fetchProfile = useCallback(async (userId: string, userEmail?: string) => {
    const supabase = getSupabase();
    if (!supabase) return;

    setProfileLoading(true);
    try {
      const normalizedEmail = (userEmail || '').toLowerCase().trim();
      const isSuperAdminEmail = normalizedEmail === SUPER_ADMIN_EMAIL;

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
          await supabase
            .from('profiles')
            .update({ role: 'super_admin' })
            .eq('id', userId);
          setProfile({ ...data, role: 'super_admin' } as Profile);
        } else {
          setProfile(data as Profile);
        }
      } else if (isSuperAdminEmail) {
        const adminProfile: Partial<Profile> = {
          id: userId,
          email: SUPER_ADMIN_EMAIL,
          full_name: 'Super Admin',
          phone: '+233200000000',
          role: 'super_admin',
        };
        await supabase.from('profiles').upsert(adminProfile);
        setProfile(adminProfile as Profile);
      }
    } catch (err) {
      console.error('Failed to load user profile:', err);
    } finally {
      setProfileLoading(false);
    }
  }, []);

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
      setProfileLoading(false);
      return;
    }

    let mounted = true;

    // Restore initial session cleanly BEFORE dropping isLoading so /app/login never flashes
    supabase.auth
      .getSession()
      .then(async ({ data: { session: initialSession } }) => {
        if (!mounted) return;
        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (initialSession?.user) {
          hadSessionRef.current = true;
          await fetchProfile(initialSession.user.id, initialSession.user.email);
        } else {
          hadSessionRef.current = false;
          setProfile(null);
        }

        if (mounted) {
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to get session:', err);
        if (mounted) {
          setIsLoading(false);
          setProfileLoading(false);
        }
      });

    // Listen for auth state changes (sign-in, token refresh, sign-out, or external revocation)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        hadSessionRef.current = true;
        manualSignOutRef.current = false;
        setSessionExpired(false);
        void fetchProfile(nextSession.user.id, nextSession.user.email);
      } else {
        const wasSignedIn = hadSessionRef.current;
        const wasManual = manualSignOutRef.current;
        hadSessionRef.current = false;
        manualSignOutRef.current = false;
        setProfile(null);
        setProfileLoading(false);

        if (event === 'SIGNED_OUT' && wasSignedIn && !wasManual) {
          setSessionExpired(true);
          void clearSensitiveClientCaches();
        }
      }
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, isConfigured]);

  const signIn = async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      return { error: new Error('Supabase client is not configured') };
    }
    manualSignOutRef.current = false;
    setSessionExpired(false);
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

    manualSignOutRef.current = false;
    setSessionExpired(false);

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
    manualSignOutRef.current = true;
    hadSessionRef.current = false;
    setSessionExpired(false);
    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error('Supabase signOut error:', err);
    } finally {
      await clearSensitiveClientCaches();
      setUser(null);
      setSession(null);
      setProfile(null);
      setProfileLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isLoading,
        profileLoading,
        sessionExpired,
        clearSessionExpired,
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
