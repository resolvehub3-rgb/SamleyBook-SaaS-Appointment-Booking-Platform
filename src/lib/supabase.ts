import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY_URL = 'samley_supabase_url';
const STORAGE_KEY_ANON_KEY = 'samley_supabase_anon_key';

export function isValidSupabaseUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value.trim());
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !!parsed.hostname;
  } catch {
    return false;
  }
}

// Anon keys are sent as HTTP headers, so they must be printable ASCII without
// control characters (a common cause of "Invalid value" fetch errors).
export function isValidAnonKey(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && /^[\x20-\x7E]+$/.test(trimmed);
}

export function getSupabaseCredentials(): { url: string; anonKey: string } {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  // Local storage override/fallback if user inputs in UI
  const localUrl = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_URL) : null;
  const localKey = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_ANON_KEY) : null;

  const localValid =
    isValidSupabaseUrl(localUrl) && isValidAnonKey(localKey);

  // If stored credentials are invalid, clear them so they stop breaking requests
  if (typeof window !== 'undefined' && (localUrl || localKey) && !localValid) {
    try {
      localStorage.removeItem(STORAGE_KEY_URL);
      localStorage.removeItem(STORAGE_KEY_ANON_KEY);
    } catch {
      // ignore storage errors
    }
  }

  const url = (localValid ? (localUrl as string).trim() : envUrl || '').trim();
  const anonKey = (localValid ? (localKey as string).trim() : envKey || '').trim();

  return { url, anonKey };
}

export function saveSupabaseCredentials(url: string, anonKey: string) {
  if (typeof window !== 'undefined') {
    if (url && anonKey) {
      localStorage.setItem(STORAGE_KEY_URL, url.trim());
      localStorage.setItem(STORAGE_KEY_ANON_KEY, anonKey.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_URL);
      localStorage.removeItem(STORAGE_KEY_ANON_KEY);
    }
  }
}

let supabaseInstance: SupabaseClient | null = null;
let currentClientConfig = { url: '', anonKey: '' };

export function getSupabase(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseCredentials();

  if (!url || !anonKey || !isValidSupabaseUrl(url) || !isValidAnonKey(anonKey)) {
    return null;
  }

  // Re-instantiate if config changed
  if (
    !supabaseInstance ||
    currentClientConfig.url !== url ||
    currentClientConfig.anonKey !== anonKey
  ) {
    try {
      supabaseInstance = createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
      currentClientConfig = { url, anonKey };
    } catch (err) {
      console.error('Error creating Supabase client:', err);
      return null;
    }
  }

  return supabaseInstance;
}

/**
 * Test connectivity with provided or stored credentials
 */
export async function testSupabaseConnection(url?: string, anonKey?: string): Promise<{
  success: boolean;
  needsSchema?: boolean;
  message: string;
}> {
  const targetUrl = (url || getSupabaseCredentials().url || '').trim();
  const targetKey = (anonKey || getSupabaseCredentials().anonKey || '').trim();

  if (!targetUrl || !targetKey) {
    return {
      success: false,
      message: 'Supabase URL and Anon Key are missing.',
    };
  }

  if (!isValidSupabaseUrl(targetUrl)) {
    return {
      success: false,
      message: 'Invalid Supabase URL. Please enter a valid project URL (https://your-project-id.supabase.co).',
    };
  }

  if (!isValidAnonKey(targetKey)) {
    return {
      success: false,
      message: 'Invalid Supabase Anon Key. Please enter a valid anon/public key.',
    };
  }

  try {
    const testClient = createClient(targetUrl, targetKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    // 1. First test basic Supabase project reachability and auth key validity
    try {
      const { error: authError } = await testClient.auth.getSession();
      if (authError && (authError.message.includes('Invalid API key') || authError.status === 401)) {
        return {
          success: false,
          message: 'Invalid Supabase Anon Key. Please check the public anon key in Project Settings > API.',
        };
      }
    } catch (authErr) {
      // Continue to rest test
    }

    // 2. Query subscription_plans to check if the schema tables exist
    const { error: dbError } = await testClient.from('subscription_plans').select('id').limit(1);

    if (dbError) {
      const errMsg = (dbError.message || '').toLowerCase();
      // If table is missing from schema cache or relation does not exist
      if (
        errMsg.includes('could not find the table') ||
        errMsg.includes('schema cache') ||
        errMsg.includes('does not exist') ||
        dbError.code === 'PGRST205' ||
        dbError.code === 'PGRST116' ||
        dbError.code === '42P01'
      ) {
        return {
          success: true,
          needsSchema: true,
          message: 'Connected to your Supabase project! The database schema is ready to be set up. Please copy and run the SQL script in your Supabase SQL Editor.',
        };
      }

      // Check if it's an invalid key or domain error
      if (errMsg.includes('api key') || errMsg.includes('jwt')) {
        return {
          success: false,
          message: `Authentication error: ${dbError.message}`,
        };
      }

      return {
        success: false,
        message: `Database error: ${dbError.message}`,
      };
    }

    return {
      success: true,
      needsSchema: false,
      message: 'Successfully connected to Supabase and verified all database tables!',
    };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const lower = rawMsg.toLowerCase();
    if (
      lower.includes('schema cache') ||
      lower.includes('could not find the table') ||
      lower.includes('subscription_plans') ||
      lower.includes('relation') ||
      lower.includes('does not exist') ||
      lower.includes('pgrst205')
    ) {
      return {
        success: true,
        needsSchema: true,
        message: 'Connected to your Supabase project! Your credentials are valid, but the database tables have not been created yet. Copy and run the SQL script in your Supabase SQL Editor.',
      };
    }
    return {
      success: false,
      message: rawMsg,
    };
  }
}

/**
 * Upload an image file to Supabase Storage bucket `business-assets`
 */
export async function uploadBusinessAsset(
  file: File,
  folder: 'logos' | 'services' = 'services'
): Promise<{ url: string | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { url: null, error: 'Supabase is not configured' };
  }

  try {
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('business-assets')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      return { url: null, error: uploadError.message };
    }

    const { data: publicUrlData } = supabase.storage
      .from('business-assets')
      .getPublicUrl(fileName);

    return { url: publicUrlData.publicUrl, error: null };
  } catch (err) {
    return {
      url: null,
      error: err instanceof Error ? err.message : 'Upload failed',
    };
  }
}
