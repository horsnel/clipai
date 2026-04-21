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

function mapSupabaseUser(session: Session | null): AuthUser | null {
  if (!session?.user) return null;

  const meta = session.user.user_metadata;
  return {
    id: session.user.id,
    name: meta?.full_name ?? meta?.name ?? 'Gamer',
    email: session.user.email ?? '',
    plan: (meta?.plan as UserPlan) ?? 'free',
  };
}

// --- Provider ---

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Sync user object whenever session changes
  useEffect(() => {
    setUser(mapSupabaseUser(session));
  }, [session]);

  // Check for existing session and listen for auth changes
  useEffect(() => {
    let mounted = true;

    // Safety timeout: if getSession doesn't resolve in 5 seconds,
    // stop loading so the app doesn't hang forever on a black screen
    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        setIsLoading(false);
      }
    }, 5000);

    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (mounted) {
        clearTimeout(safetyTimeout);
        setSession(existingSession);
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
