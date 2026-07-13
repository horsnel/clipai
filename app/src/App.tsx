import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { WaitlistPage } from './pages/WaitlistPage';
import { PricingPage } from './pages/PricingPage';
import { SettingsPage } from './pages/SettingsPage';
import { TermsPage } from './pages/TermsPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { TrendRadarPage } from './pages/TrendRadarPage';
import { ViralForgePage } from './pages/ViralForgePage';
import { ClipBotPage } from './pages/ClipBotPage';
import { CreatorRankPage } from './pages/CreatorRankPage';
import { GrowthIntelPage } from './pages/GrowthIntelPage';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import type { Plan } from './types';
import { verifyPayment } from './services/api';
import './App.css';

export type Page =
  | 'landing' | 'auth' | 'dashboard' | 'upload' | 'results'
  | 'pricing' | 'settings' | 'terms' | 'privacy' | 'leaderboard'
  | 'trends' | 'forge' | 'clipbot' | 'rank' | 'growth';

interface AppUser {
  id: string;
  name: string;
  email: string;
  plan: Plan;
  credits: number;
  clipsUsed: number;
  referralCode: string;
  xp?: number;
  streakDays?: number;
  avatarUrl?: string;
}

function AppContent() {
  const [currentPage, setCurrentPage]         = useState<Page>('landing');
  const { user: authUser, session, isLoading, signOut, refreshUser } = useAuth();

  const isLoggedIn = !!authUser;
  // Adapt AuthContext user → App's legacy user shape (so existing pages keep working)
  const user: AppUser | null = authUser ? {
    id: authUser.id,
    name: authUser.name,
    email: authUser.email,
    plan: authUser.plan,
    credits: authUser.credits,
    clipsUsed: authUser.clipsUsed,
    referralCode: authUser.referralCode,
    xp: authUser.xp,
    streakDays: authUser.streakDays,
    avatarUrl: authUser.avatarUrl,
  } : null;

  // ─── Referral capture + Paystack redirect verification ─────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) localStorage.setItem('clipai_pending_referral', ref.toUpperCase());
    const paystackRef = params.get('trxref') ?? params.get('reference');
    if (paystackRef && session) {
      verifyPayment(paystackRef)
        .then(async (data) => {
          if (data.success) {
            await refreshUser();
            setCurrentPage('dashboard');
          }
        })
        .catch(() => {/* ignore */});
    }
  }, [session, refreshUser]);

  // ─── Redirect after login ───────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading && authUser) {
      if (currentPage === 'auth' || currentPage === 'landing') {
        setCurrentPage('dashboard');
      }
    }
  }, [isLoading, authUser]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = async (_email: string, _name: string) => {
    // Real auth handled by AuthContext; just navigate
    setCurrentPage('dashboard');
  };

  const handleLogout = async () => {
    await signOut();
    setCurrentPage('landing');
  };

  const navigateTo = (page: Page, _clips?: unknown[]) => {
    setCurrentPage(page);
    window.scrollTo(0, 0);
  };

  // Pages that require login. 'upload' + 'results' now route to the v3 waitlist (no auth required).
  const PROTECTED: Page[] = ['dashboard','settings','trends','forge','clipbot','rank','growth'];

  const renderPage = () => {
    if (PROTECTED.includes(currentPage) && !isLoggedIn) {
      return <AuthPage onNavigate={navigateTo} onLogin={handleLogin} />;
    }
    switch (currentPage) {
      case 'landing':     return <LandingPage onNavigate={navigateTo} />;
      case 'auth':        return <AuthPage onNavigate={navigateTo} onLogin={handleLogin} />;
      case 'dashboard':   return <DashboardPage user={user} onNavigate={navigateTo} onLogout={handleLogout} />;
      case 'upload':      return <WaitlistPage user={user} onNavigate={navigateTo} />;
      case 'results':     return <WaitlistPage user={user} onNavigate={navigateTo} />;
      case 'pricing':     return <PricingPage user={user} onNavigate={navigateTo} isLoggedIn={isLoggedIn} />;
      case 'settings':    return <SettingsPage user={user} onNavigate={navigateTo} />;
      case 'terms':       return <TermsPage onNavigate={navigateTo} />;
      case 'privacy':     return <PrivacyPage onNavigate={navigateTo} />;
      case 'leaderboard': return <LeaderboardPage user={user} onNavigate={navigateTo} />;
      case 'trends':      return <TrendRadarPage user={user} onNavigate={navigateTo} />;
      case 'forge':       return <ViralForgePage user={user} onNavigate={navigateTo} />;
      case 'clipbot':     return <ClipBotPage user={user} onNavigate={navigateTo} />;
      case 'rank':        return <CreatorRankPage user={user} onNavigate={navigateTo} />;
      case 'growth':      return <GrowthIntelPage user={user} onNavigate={navigateTo} />;
      default:            return <LandingPage onNavigate={navigateTo} />;
    }
  };

  const FOOTER_PAGES: Page[] = ['landing', 'pricing', 'terms', 'privacy'];

  // Loading spinner while auth session resolves
  if (isLoading) {
    return (
      <div className="min-h-screen bg-clip-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-clip-cyan/30 border-t-clip-cyan rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-clip-dark text-clip-text">
      <div className="grain-overlay" />
      <Navbar
        currentPage={currentPage}
        onNavigate={navigateTo}
        isLoggedIn={isLoggedIn}
        user={user}
        onLogout={handleLogout}
      />
      <main className="relative">{renderPage()}</main>
      {FOOTER_PAGES.includes(currentPage) && <Footer onNavigate={navigateTo} />}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#121216',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#F4F6FA',
          },
        }}
      />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
