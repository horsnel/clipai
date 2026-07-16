import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { UploadPage } from './pages/UploadPage';
import { ResultsPage } from './pages/ResultsPage';
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
import type { DetectedClip, Plan } from './types';
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
}

function App() {
  const [currentPage, setCurrentPage]         = useState<Page>('landing');
  const [isLoggedIn, setIsLoggedIn]           = useState(false);
  const [user, setUser]                       = useState<AppUser | null>(null);
  const [detectedClips, setDetectedClips]     = useState<DetectedClip[] | undefined>(undefined);

  useEffect(() => {
    const savedUser = localStorage.getItem('clipai_user');
    if (savedUser) {
      try { setUser(JSON.parse(savedUser)); setIsLoggedIn(true); } catch { /* corrupt */ }
    }
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) localStorage.setItem('clipai_pending_referral', ref.toUpperCase());
    const paystackRef = params.get('trxref') ?? params.get('reference');
    if (paystackRef) verifyPaystackPayment(paystackRef);
  }, []);

  const verifyPaystackPayment = async (reference: string) => {
    try {
      const API_BASE = import.meta.env.VITE_API_URL ?? '';
      if (!API_BASE) return;
      const res = await fetch(`${API_BASE}/payment/verify?reference=${reference}`);
      const data = await res.json();
      if (data.success && user) {
        const upgraded = { ...user, plan: data.plan as Plan };
        setUser(upgraded);
        localStorage.setItem('clipai_user', JSON.stringify(upgraded));
      }
    } catch { /* ignore */ }
  };

  const handleLogin = (email: string, name: string) => {
    const newUser: AppUser = {
      id: crypto.randomUUID(),
      email, name,
      plan: 'free',
      credits: 50,
      clipsUsed: 0,
      referralCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
    };
    setUser(newUser);
    setIsLoggedIn(true);
    localStorage.setItem('clipai_user', JSON.stringify(newUser));
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    setIsLoggedIn(false);
    localStorage.removeItem('clipai_user');
    setCurrentPage('landing');
  };

  const navigateTo = (page: Page, clips?: unknown[]) => {
    if (clips) setDetectedClips(clips as DetectedClip[]);
    setCurrentPage(page);
    window.scrollTo(0, 0);
  };

  // Pages that require login
  const PROTECTED: Page[] = ['dashboard','upload','results','settings','trends','forge','clipbot','rank','growth'];

  const renderPage = () => {
    if (PROTECTED.includes(currentPage) && !isLoggedIn) {
      return <AuthPage onNavigate={navigateTo} onLogin={handleLogin} />;
    }
    switch (currentPage) {
      case 'landing':     return <LandingPage onNavigate={navigateTo} />;
      case 'auth':        return <AuthPage onNavigate={navigateTo} onLogin={handleLogin} />;
      case 'dashboard':   return <DashboardPage user={user} onNavigate={navigateTo} onLogout={handleLogout} />;
      case 'upload':      return <UploadPage user={user} onNavigate={navigateTo} />;
      case 'results':     return <ResultsPage user={user} onNavigate={navigateTo} clips={detectedClips} />;
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

export default App;
