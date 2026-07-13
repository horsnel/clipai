import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { apiClient } from '@/services/api';

// ─── Types ─────────────────────────────────────────────────────────────────
export type Plan = 'free' | 'starter' | 'pro' | 'creator';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  plan: Plan;
  credits: number;
  clipsUsed: number;
  referralCode: string;
  xp: number;
  streakDays: number;
  avatarUrl?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  isLoading: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string, referralCode?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// ─── Context ───────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ─── Fetch profile from worker (which validates the JWT) ────────────────
  const fetchProfile = useCallback(async (sess: Session): Promise<AuthUser | null> => {
    try {
      apiClient.setToken(sess.access_token);
      const me = await apiClient.get<AuthUser & { streakBumped?: boolean; streakCreditsAwarded?: number }>('/auth/me');
      // Celebrate streak bump (only fires once per day per server logic)
      if (me.streakBumped && me.streakCreditsAwarded) {
        toast.success(`🔥 Day ${me.streakDays} streak! +${me.streakCreditsAwarded} credits`, {
          description: 'Come back tomorrow for more.',
        });
      }
      return me;
    } catch (err) {
      console.warn('[auth] /auth/me failed, falling back to session metadata', err);
      // Fallback: derive user from Supabase session metadata
      const u: User = sess.user;
      return {
        id: u.id,
        name: u.user_metadata?.full_name ?? u.user_metadata?.name ?? 'Gamer',
        email: u.email ?? '',
        plan: (u.user_metadata?.plan as Plan) ?? 'free',
        credits: 50,
        clipsUsed: 0,
        referralCode: 'CLIP' + (u.email || 'XX').slice(0, 4).toUpperCase(),
        xp: 0,
        streakDays: 0,
      };
    }
  }, []);

  // ─── On mount: check existing session ───────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }
    let mounted = true;
    const safety = setTimeout(() => mounted && setIsLoading(false), 8000);

    supabase.auth.getSession().then(async ({ data: { session: existing } }) => {
      if (!mounted) return;
      clearTimeout(safety);
      setSession(existing);
      if (existing) {
        const profile = await fetchProfile(existing);
        if (mounted) setUser(profile);
      }
      if (mounted) setIsLoading(false);
    }).catch(() => {
      if (mounted) { clearTimeout(safety); setIsLoading(false); }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!mounted) return;
        setSession(newSession);
        if (newSession) {
          const profile = await fetchProfile(newSession);
          if (mounted) setUser(profile);
        } else {
          setUser(null);
          apiClient.setToken(null);
        }
      },
    );

    return () => {
      mounted = false;
      clearTimeout(safety);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // ─── Actions ────────────────────────────────────────────────────────────
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (
    email: string, password: string, name?: string, referralCode?: string,
  ) => {
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name ?? '', referral_code: referralCode ?? '' } },
    });
    if (error) throw error;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    apiClient.setToken(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!session) return;
    const profile = await fetchProfile(session);
    setUser(profile);
  }, [session, fetchProfile]);

  const value: AuthContextType = {
    user, session, isLoading,
    isConfigured: isSupabaseConfigured,
    signIn, signUp, signInWithGoogle, signOut, refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
