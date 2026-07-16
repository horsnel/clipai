import { useState, useEffect } from 'react';
import type { Page } from '../App';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { Logo } from './Logo';

interface NavbarProps {
  currentPage: Page;
  onNavigate: (page: Page, clips?: unknown[]) => void;
  isLoggedIn: boolean;
  user: { name: string; email: string; plan: 'free' | 'starter' | 'pro' | 'creator'; credits?: number } | null;
}

export function Navbar({ currentPage, onNavigate, isLoggedIn }: NavbarProps) {
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

  const navLinks: Array<{
    label: string;
    page: Page;
    hash?: string;
    badge?: string;
  }> = isLoggedIn
    ? [
        { label: 'Dashboard', page: 'dashboard' as Page },
        { label: 'Trend Radar', page: 'trends' as Page },
        { label: 'Viral Forge', page: 'forge' as Page },
        { label: 'ClipBot', page: 'clipbot' as Page },
        { label: 'My Rank', page: 'rank' as Page },
        { label: 'Growth Intel', page: 'growth' as Page },
        { label: 'Editor', page: 'upload' as Page, badge: 'Coming Soon' },
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
          ? 'bg-clip-dark/90 backdrop-blur-md border-b border-white/[0.04]'
          : 'bg-transparent'
      }`}
    >
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="flex items-center justify-between h-20 lg:h-24">
          {/* Logo */}
          <button
            onClick={() => onNavigate(isLoggedIn ? 'dashboard' : 'landing')}
            className="flex items-center gap-2 group"
          >
            <Logo size="sm" showWord />
          </button>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-0.5 xl:gap-1">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => handleNavClick(link.page, link.hash)}
                className={`group inline-flex items-center gap-1.5 px-2.5 xl:px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                  currentPage === link.page
                    ? 'text-clip-cyan bg-clip-cyan/10'
                    : 'text-clip-muted hover:text-clip-text hover:bg-white/[0.03]'
                }`}
              >
                {link.label}
                {link.badge && (
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-clip-cyan/25 bg-clip-cyan/5 text-clip-cyan/80 group-hover:border-clip-cyan/40 group-hover:text-clip-cyan transition-colors"
                    title="This feature is under development"
                  >
                    {link.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Auth Buttons */}
          <div className="hidden lg:flex items-center gap-3">
            {!isLoggedIn && (
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
            className="lg:hidden p-2 text-clip-text hover:bg-white/[0.04] rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden bg-clip-dark/98 backdrop-blur-lg border-b border-white/[0.03] max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="px-4 py-4 space-y-2">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => handleNavClick(link.page, link.hash)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium rounded-lg transition-all ${
                  currentPage === link.page
                    ? 'text-clip-cyan bg-clip-cyan/10'
                    : 'text-clip-muted hover:text-clip-text hover:bg-white/[0.03]'
                }`}
              >
                <span>{link.label}</span>
                {link.badge && (
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-clip-cyan/25 bg-clip-cyan/5 text-clip-cyan/80"
                    title="This feature is under development"
                  >
                    {link.badge}
                  </span>
                )}
              </button>
            ))}
            <div className="pt-2 border-t border-white/[0.03]">
              {isLoggedIn ? null : (
                <div className="space-y-2">
                  <button
                    onClick={() => handleNavClick('auth')}
                    className="w-full px-4 py-3 text-left text-sm font-medium text-clip-muted hover:text-clip-text hover:bg-white/[0.03] rounded-lg transition-all"
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
