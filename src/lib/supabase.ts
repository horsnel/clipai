import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Only create a real Supabase client when both URL and key are provided.
// Otherwise create a stub that gracefully returns empty sessions
// so the app renders the landing page instead of hanging forever.
export const supabase: SupabaseClient = (() => {
  if (supabaseUrl && supabaseAnonKey) {
    return createClient(supabaseUrl, supabaseAnonKey);
  }

  // Return a minimal stub client when Supabase is not configured.
  // This prevents the app from hanging on a black screen during
  // the auth getSession() call.
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => {
        const subscription = { unsubscribe: () => {} };
        return { data: { subscription } };
      },
      signInWithPassword: async () => {
        throw new Error(
          'Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.',
        );
      },
      signUp: async () => {
        throw new Error(
          'Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.',
        );
      },
      signInWithOAuth: async () => {
        throw new Error(
          'Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.',
        );
      },
      signOut: async () => {
        // No-op: nothing to sign out from when not configured
      },
    },
  } as unknown as SupabaseClient;
})();
