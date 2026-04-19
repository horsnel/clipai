import { useState, useEffect } from 'react';
import type { Page } from '@/App';
import { Button } from '@/components/ui/button';
import { Zap, Menu, X, User, LogOut } from 'lucide-react';

interface NavbarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  isLoggedIn: boolean;
  user: { name: string; email: string; plan: 'free' | 'pro' | 'creator' } | null;
  onLogout: () => void;
}

export function Navbar({ currentPage, onNavigate, isLoggedIn, user, onLogout }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isLanding = currentPage === 'landing';
  const showBg = isScrolled || !isLanding;

  const navLinks = isLoggedIn
    ? [
        { label: 'Dashboard', page: 'dashboard' as Page },
        { label: 'Upload', page: 'upload' as Page },
        { label: 'Leaderboard', page: 'leaderboard' as Page },
        { label: 'Pricing', page: 'pricing' as Page },
        { label: 'Settings', page: 'settings' as Page },
      ]
    : [
        { label: 'Features', page: 'landing' as Page, hash: '#features' },
        { label: 'Pricing', page: 'pricing' as Page },
      ];

  const handleNavClick = (page: Page, hash?: string) => {
    onNavigate(page);
    if (hash) {
      setTimeout(() => {
        const element = document.querySelector(hash);
        element?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        showBg
          ? 'bg-clip-dark/95 border-b border-white/[0.06]'
          : 'bg-transparent'
      }`}
    >
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <button
            onClick={() => onNavigate(isLoggedIn ? 'dashboard' : 'landing')}
            className="flex items-center gap-2 group"
          >
            <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-lg bg-gradient-to-br from-clip-cyan to-blue-500 flex items-center justify-center group-hover:shadow-glow-cyan transition-shadow">
              <Zap className="w-4 h-4 lg:w-5 lg:h-5 text-black" />
            </div>
            <span className="font-display font-bold text-lg lg:text-xl text-clip-text">
              ClipAI
            </span>
          </button>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => handleNavClick(link.page, link.hash)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  currentPage === link.page
                    ? 'text-clip-cyan bg-clip-cyan/10'
                    : 'text-clip-muted hover:text-clip-text hover:bg-white/[0.05]'
                }`}
              >
                {link.label}
              </button>
            ))}
          </div>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center gap-3">
            {isLoggedIn ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-clip-surface rounded-lg border border-white/[0.06]">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-clip-cyan to-blue-500 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-black" />
                  </div>
                  <span className="text-sm font-medium">{user?.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    user?.plan === 'creator' 
                      ? 'bg-clip-amber text-black' 
                      : user?.plan === 'pro'
                      ? 'bg-clip-cyan text-black'
                      : 'bg-clip-surface text-clip-muted border border-white/[0.08]'
                  }`}>
                    {user?.plan.toUpperCase()}
                  </span>
                </div>
                <button
                  onClick={onLogout}
                  className="p-2 text-clip-muted hover:text-clip-red hover:bg-clip-red/10 rounded-lg transition-all"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => onNavigate('auth')}
                  className="px-4 py-2 text-sm font-medium text-clip-muted hover:text-clip-text transition-colors"
                >
                  Login
                </button>
                <Button
                  onClick={() => onNavigate('auth')}
                  className="bg-clip-cyan text-black hover:brightness-110 font-semibold px-5 py-2 rounded-xl shadow-glow-cyan"
                >
                  Sign Up
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-clip-text hover:bg-white/[0.05] rounded-lg transition-colors"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-clip-dark/98 border-b border-white/[0.06]">
          <div className="px-4 py-4 space-y-2">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => handleNavClick(link.page, link.hash)}
                className={`w-full px-4 py-3 text-left text-sm font-medium rounded-lg transition-all ${
                  currentPage === link.page
                    ? 'text-clip-cyan bg-clip-cyan/10'
                    : 'text-clip-muted hover:text-clip-text hover:bg-white/[0.05]'
                }`}
              >
                {link.label}
              </button>
            ))}
            <div className="pt-2 border-t border-white/[0.06]">
              {isLoggedIn ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-4 py-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-clip-cyan to-blue-500 flex items-center justify-center">
                      <User className="w-4 h-4 text-black" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{user?.name}</p>
                      <p className="text-xs text-clip-muted">{user?.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={onLogout}
                    className="w-full px-4 py-3 text-left text-sm font-medium text-clip-red hover:bg-clip-red/10 rounded-lg transition-all flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    onClick={() => handleNavClick('auth')}
                    className="w-full px-4 py-3 text-left text-sm font-medium text-clip-muted hover:text-clip-text hover:bg-white/[0.05] rounded-lg transition-all"
                  >
                    Login
                  </button>
                  <Button
                    onClick={() => handleNavClick('auth')}
                    className="w-full bg-clip-cyan text-black hover:brightness-110 font-semibold py-3 rounded-xl"
                  >
                    Sign Up Free
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
