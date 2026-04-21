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
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import type { Page } from './types';
export type { Page };
import './App.css';

function AppContent() {
  const [currentPage, setCurrentPage] = useState<Page>('landing');
  const { user, isLoading, signOut } = useAuth();

  const isLoggedIn = !!user;
  const displayUser = user
    ? { name: user.name, email: user.email, plan: user.plan }
    : null;

  // Check for referral code in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('clipai_pending_referral', ref.toUpperCase());
    }
  }, []);

  // Navigate to dashboard once auth resolves with an active session.
  // With the AuthContext fix, `user` is always populated before
  // isLoading becomes false, so this reliably redirects after login.
  useEffect(() => {
    if (!isLoading && user) {
      if (currentPage === 'auth' || currentPage === 'landing') {
        setCurrentPage('dashboard');
      }
    }
  }, [isLoading, user]); // intentionally omit currentPage to avoid stale closure

  const handleLogin = (_email: string, _name: string) => {
    setCurrentPage('dashboard');
  };

  const handleLogout = async () => {
    await signOut();
    setCurrentPage('landing');
  };

  const navigateTo = (page: Page) => {
    setCurrentPage(page);
    window.scrollTo(0, 0);
  };

  // Don't render anything while auth is loading to prevent flash
  if (isLoading) {
    return (
      <div className="min-h-screen bg-clip-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-clip-cyan/30 border-t-clip-cyan rounded-full animate-spin" />
      </div>
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'landing':
        return <LandingPage onNavigate={navigateTo} />;
      case 'auth':
        return <AuthPage onNavigate={navigateTo} onLogin={handleLogin} />;
      case 'dashboard':
        return <DashboardPage user={displayUser} onNavigate={navigateTo} onLogout={handleLogout} />;
      case 'upload':
        return <UploadPage user={displayUser} onNavigate={navigateTo} />;
      case 'results':
        return <ResultsPage user={displayUser} onNavigate={navigateTo} />;
      case 'pricing':
        return <PricingPage user={displayUser} onNavigate={navigateTo} isLoggedIn={isLoggedIn} />;
      case 'settings':
        return isLoggedIn ? <SettingsPage user={displayUser} onNavigate={navigateTo} /> : <LandingPage onNavigate={navigateTo} />;
      case 'terms':
        return <TermsPage onNavigate={navigateTo} />;
      case 'privacy':
        return <PrivacyPage onNavigate={navigateTo} />;
      case 'leaderboard':
        return <LeaderboardPage user={displayUser} onNavigate={navigateTo} />;
      default:
        return <LandingPage onNavigate={navigateTo} />;
    }
  };

  return (
    <div className="min-h-screen bg-clip-dark text-clip-text">

      {/* Navigation */}
      <Navbar
        currentPage={currentPage}
        onNavigate={navigateTo}
        isLoggedIn={isLoggedIn}
        user={displayUser}
        onLogout={handleLogout}
      />

      {/* Main content */}
      <main className="relative">
        {renderPage()}
      </main>

      {/* Footer - only show on landing, pricing, terms, and privacy */}
      {(currentPage === 'landing' || currentPage === 'pricing' || currentPage === 'terms' || currentPage === 'privacy') && (
        <Footer onNavigate={navigateTo} />
      )}

      {/* Toast notifications */}
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
