import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { apiClient } from '@/api/client';

// --- Types ---

export type UserPlan = 'free' | 'pro' | 'creator';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  plan: UserPlan;
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapSupabaseUser(session: Session | null, profilePlan?: UserPlan): AuthUser | null {
  if (!session?.user) return null;

  const meta = session.user.user_metadata;
  return {
    id: session.user.id,
    name: meta?.full_name ?? meta?.name ?? 'Gamer',
    email: session.user.email ?? '',
    plan: profilePlan ?? (meta?.plan as UserPlan) ?? 'free',
  };
}

// --- Provider ---

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Sync user object whenever session changes, fetching plan from profiles table
  useEffect(() => {
    if (!session?.user) {
      setUser(null);
      return;
    }

    // Fetch profile from database for the real plan value
    (async () => {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('plan, full_name')
          .eq('id', session.user.id)
          .single();

        const plan = (profile?.plan as UserPlan) ?? undefined;
        const name = profile?.full_name || undefined;
        const meta = session.user.user_metadata;
        setUser({
          id: session.user.id,
          name: name ?? meta?.full_name ?? meta?.name ?? 'Gamer',
          email: session.user.email ?? '',
          plan: plan ?? (meta?.plan as UserPlan) ?? 'free',
        });
      } catch {
        // Fallback to metadata if profile fetch fails
        setUser(mapSupabaseUser(session));
      }
    })();
  }, [session]);

  // Check for existing session and listen for auth changes.
  // IMPORTANT: We fetch the profile BEFORE setting isLoading=false
  // to prevent a flash of the landing page for logged-in users.
  useEffect(() => {
    let mounted = true;

    // Safety timeout: if session+profile fetch doesn't resolve in 8 seconds,
    // stop loading so the app doesn't hang forever on a black screen
    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        setIsLoading(false);
      }
    }, 8000);

    supabase.auth.getSession().then(async ({ data: { session: existingSession } }) => {
      if (mounted) {
        clearTimeout(safetyTimeout);
        setSession(existingSession);

        // Fetch profile immediately so the user object is ready
        // before we mark loading as complete. This prevents the
        // landing-page flash for logged-in users.
        if (existingSession?.user) {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('plan, full_name')
              .eq('id', existingSession.user.id)
              .single();

            const meta = existingSession.user.user_metadata;
            setUser({
              id: existingSession.user.id,
              name: profile?.full_name || meta?.full_name || meta?.name || 'Gamer',
              email: existingSession.user.email ?? '',
              plan: (profile?.plan as UserPlan) ?? (meta?.plan as UserPlan) ?? 'free',
            });
          } catch {
            setUser(mapSupabaseUser(existingSession));
          }
        }

        setIsLoading(false);
      }
    }).catch(() => {
      if (mounted) {
        clearTimeout(safetyTimeout);
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (mounted) {
          setSession(newSession);
        }
      },
    );

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  // Sync the API client token whenever the session changes
  useEffect(() => {
    apiClient.setToken(session?.access_token ?? null);
  }, [session]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name ?? '',
        },
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value: AuthContextType = {
    user,
    session,
    isLoading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// --- Hook ---

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
