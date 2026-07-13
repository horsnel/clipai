import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// If env vars aren't set, return a stub client that throws on use.
// This keeps the build green and the landing page renderable.
export const supabase: SupabaseClient = (() => {
  if (supabaseUrl && supabaseAnonKey) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }

  const err = new Error(
    'Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  );
  const stub: any = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async () => { throw err; },
      signUp: async () => { throw err; },
      signInWithOAuth: async () => { throw err; },
      signOut: async () => {},
      resetPasswordForEmail: async () => { throw err; },
      updateUser: async () => { throw err; },
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
  };
  return stub as unknown as SupabaseClient;
})();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
