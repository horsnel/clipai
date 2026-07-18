import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { Logo } from './components/Logo';
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
import { ClipBotBubble } from './components/ClipBotBubble';
import { CreatorRankPage } from './pages/CreatorRankPage';
import { GrowthIntelPage } from './pages/GrowthIntelPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ChannelAuditPage } from './pages/ChannelAuditPage';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { UpgradeModalProvider, useUpgradeModal } from '@/components/UpgradeModalContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { setLoggerUser } from './lib/logger';
import type { Plan } from './types';
import { verifyPayment, UPGRADE_REQUIRED_EVENT } from './services/api';
import type { UpgradeRequiredDetail } from './services/api';
import './App.css';

export type Page =
  | 'landing' | 'auth' | 'dashboard' | 'upload' | 'results'
  | 'pricing' | 'settings' | 'terms' | 'privacy' | 'leaderboard'
  | 'trends' | 'forge' | 'clipbot' | 'rank' | 'growth' | 'onboarding' | 'audit';

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

  const navigateTo = (page: Page, _clips?: unknown[]) => {
    setCurrentPage(page);
    window.scrollTo(0, 0);
  };

  // NOTE: <UpgradeModalProvider> must wrap the children that call
  // useUpgradeModal(). AppContent itself is rendered ABOVE the provider, so
  // it CANNOT call useUpgradeModal() directly — doing so throws
  // "useUpgradeModal must be used within an UpgradeModalProvider" because the
  // context is still undefined at that point. The consumer logic lives in
  // <AppContentInner> below, which is rendered INSIDE the provider.
  return (
    <UpgradeModalProvider onNavigate={navigateTo}>
      <AppContentInner
        currentPage={currentPage}
        authUser={authUser}
        session={session}
        isLoading={isLoading}
        signOut={signOut}
        refreshUser={refreshUser}
        setCurrentPage={setCurrentPage}
        navigateTo={navigateTo}
      />
    </UpgradeModalProvider>
  );
}

interface AppContentInnerProps {
  currentPage: Page;
  authUser: ReturnType<typeof useAuth>['user'];
  session: ReturnType<typeof useAuth>['session'];
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setCurrentPage: (page: Page) => void;
  navigateTo: (page: Page, clips?: unknown[]) => void;
}

function AppContentInner({
  currentPage, authUser, session, isLoading, signOut, refreshUser, setCurrentPage, navigateTo,
}: AppContentInnerProps) {
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

  // Sync user ID with the error logger so server-side logs are attributable
  useEffect(() => {
    setLoggerUser(authUser?.id);
  }, [authUser?.id]);

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

  // ─── Auto-show UpgradeModal when apiClient fires the upgrade-required event
  // The apiClient dispatches this whenever a 402 response comes back with
  // `insufficient_credits` or `plan_required`. The UpgradeModalContext's
  // showUpgrade() opens the modal with the right headline + tier options.
  const { showUpgrade } = useUpgradeModal();
  useEffect(() => {
    // Map current page → friendly tool name for the modal headline
    const TOOL_LABELS: Record<Page, string> = {
      landing: 'ClipAI',
      auth: 'ClipAI',
      onboarding: 'ClipAI',
      audit: 'Channel Audit',
      dashboard: 'Dashboard',
      upload: 'Video Editor',
      results: 'Video Editor',
      pricing: 'ClipAI',
      settings: 'Settings',
      terms: 'ClipAI',
      privacy: 'ClipAI',
      leaderboard: 'Leaderboard',
      trends: 'Trend Radar',
      forge: 'Viral Forge',
      clipbot: 'ClipBot',
      rank: 'Creator Rank',
      growth: 'Growth Intel',
    };
    const onUpgradeRequired = (e: Event) => {
      const detail = (e as CustomEvent<UpgradeRequiredDetail>).detail;
      if (!detail) return;
      // If the backend didn't include a tool label, infer it from the current page.
      const tool = detail.tool ?? TOOL_LABELS[currentPage];
      showUpgrade({
        reason: detail.reason,
        requiredCredits: detail.required,
        currentCredits: detail.current,
        requiredPlan: detail.requiredPlan,
        tool,
      });
    };
    window.addEventListener(UPGRADE_REQUIRED_EVENT, onUpgradeRequired);
    return () => window.removeEventListener(UPGRADE_REQUIRED_EVENT, onUpgradeRequired);
  }, [showUpgrade, currentPage]);

  // ─── Redirect after login + onboarding gate ────────────────────────────
  useEffect(() => {
    if (!isLoading && authUser) {
      if (currentPage === 'auth' || currentPage === 'landing') {
        // First-time login? Show onboarding before dashboard.
        const onboardingDone = localStorage.getItem(`clipai_onboarding_complete_${authUser.email}`);
        if (!onboardingDone) {
          setCurrentPage('onboarding');
        } else {
          setCurrentPage('dashboard');
        }
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

  // Pages that require login. 'upload' + 'results' now route to the v3 waitlist (no auth required).
  const PROTECTED: Page[] = ['dashboard','settings','trends','forge','clipbot','rank','growth','onboarding','audit'];

  const renderPage = () => {
    if (PROTECTED.includes(currentPage) && !isLoggedIn) {
      return <AuthPage onNavigate={navigateTo} onLogin={handleLogin} />;
    }
    switch (currentPage) {
      case 'landing':     return <LandingPage onNavigate={navigateTo} />;
      case 'auth':        return <AuthPage onNavigate={navigateTo} onLogin={handleLogin} />;
      case 'onboarding':  return <OnboardingPage user={user} onNavigate={navigateTo} onComplete={() => setCurrentPage('audit')} />;
      case 'audit':        return <ChannelAuditPage user={user} onNavigate={navigateTo} onComplete={() => setCurrentPage('dashboard')} />;
      case 'dashboard':   return <DashboardPage user={user} onNavigate={navigateTo} onLogout={handleLogout} />;
      case 'upload':      return <WaitlistPage user={user} onNavigate={navigateTo} />;
      case 'results':     return <WaitlistPage user={user} onNavigate={navigateTo} />;
      case 'pricing':     return <PricingPage user={user} onNavigate={navigateTo} isLoggedIn={isLoggedIn} />;
      case 'settings':    return <SettingsPage user={user} onNavigate={navigateTo} onLogout={handleLogout} />;
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

  // Premium branded loading screen while auth session resolves
  if (isLoading) {
    return (
      <div className="min-h-screen bg-clip-dark flex flex-col items-center justify-center gap-10 relative overflow-hidden">
        {/* Logo + wordmark with fade-in */}
        <div
          className="relative flex flex-col items-center gap-4"
          style={{ animation: 'clipai-boot-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both' }}
        >
          <div className="relative">
            {/* Subtle ring around the logo mark */}
            <div
              className="absolute -inset-3 rounded-2xl border border-clip-cyan/20"
              style={{ animation: 'clipai-boot-ring 2s linear infinite' }}
            />
            <Logo size="xl" showWord />
          </div>
        </div>

        {/* Minimal progress indicator */}
        <div
          className="relative flex items-center gap-3 text-clip-muted text-sm"
          style={{ animation: 'clipai-boot-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both' }}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-clip-cyan animate-pulse" />
          <span>Loading ClipAI…</span>
        </div>

        {/* Slim animated progress bar */}
        <div
          className="relative w-48 h-0.5 bg-clip-border rounded-full overflow-hidden"
          style={{ animation: 'clipai-boot-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both' }}
        >
          <div
            className="absolute inset-y-0 w-1/3 rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, #0E7A88 50%, transparent 100%)',
              animation: 'clipai-boot-sweep 1.4s ease-in-out infinite',
            }}
          />
        </div>

        <style>{`
          @keyframes clipai-boot-rise {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes clipai-boot-ring {
            from { transform: rotate(0deg); opacity: 0.2; }
            50% { opacity: 0.5; }
            to { transform: rotate(360deg); opacity: 0.2; }
          }
          @keyframes clipai-boot-sweep {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(400%); }
          }
        `}</style>
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
      />
      <main className="relative">{renderPage()}</main>
      {FOOTER_PAGES.includes(currentPage) && <Footer onNavigate={navigateTo} />}
      {/* Floating ClipBot chat widget — persistent across all logged-in pages.
          State (messages, mode) is preserved during navigation. When the user
          navigates to /clipbot, it forces full-page mode and covers the viewport. */}
      {isLoggedIn && currentPage !== 'onboarding' && (
        <ClipBotBubble
          user={user}
          onNavigate={navigateTo}
          forcedMode={currentPage === 'clipbot' ? 'full' : undefined}
          hideBubble={currentPage === 'clipbot'}
        />
      )}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#0B0B0F',
            border: '1px solid rgba(255, 255, 255, 0.04)',
            color: '#A8AEB8',
          },
        }}
      />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
