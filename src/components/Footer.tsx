import type { Page } from '@/App';
import { Zap, Github, Twitter, Instagram } from 'lucide-react';

interface FooterProps {
  onNavigate: (page: Page) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-clip-dark border-t border-white/[0.06]">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 lg:gap-16">
          {/* Brand */}
          <div className="md:col-span-2">
            <button
              onClick={() => onNavigate('landing')}
              className="flex items-center gap-2 group mb-4"
            >
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-clip-cyan to-blue-500 flex items-center justify-center group-hover:shadow-glow-cyan transition-shadow">
                <Zap className="w-5 h-5 text-black" />
              </div>
              <span className="font-display font-bold text-xl text-clip-text">
                ClipAI
              </span>
            </button>
            <p className="text-clip-muted text-sm leading-relaxed max-w-sm mb-6">
              AI-powered gaming highlight clips. Upload your gameplay, let our AI detect the hype moments, and export viral-ready content in seconds.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="https://x.com/Olhmescraxes1"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-lg bg-clip-surface border border-white/[0.06] flex items-center justify-center text-clip-muted hover:text-clip-cyan hover:border-clip-cyan/30 transition-all"
              >
                <Twitter className="w-4 h-4" />
              </a>
              <a
                href="#"
                className="w-10 h-10 rounded-lg bg-clip-surface border border-white/[0.06] flex items-center justify-center text-clip-muted hover:text-clip-cyan hover:border-clip-cyan/30 transition-all"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="#"
                className="w-10 h-10 rounded-lg bg-clip-surface border border-white/[0.06] flex items-center justify-center text-clip-muted hover:text-clip-cyan hover:border-clip-cyan/30 transition-all"
              >
                <Github className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-clip-text mb-4">
              Product
            </h4>
            <ul className="space-y-3">
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    setTimeout(() => {
                      const element = document.querySelector('#features');
                      element?.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                  }}
                  className="text-clip-muted hover:text-clip-cyan text-sm transition-colors"
                >
                  Features
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('pricing')}
                  className="text-clip-muted hover:text-clip-cyan text-sm transition-colors"
                >
                  Pricing
                </button>
              </li>
              <li>
                <a href="#" className="text-clip-muted hover:text-clip-cyan text-sm transition-colors">
                  API
                </a>
              </li>
              <li>
                <a href="#" className="text-clip-muted hover:text-clip-cyan text-sm transition-colors">
                  Changelog
                </a>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-clip-text mb-4">
              Company
            </h4>
            <ul className="space-y-3">
              <li>
                <a href="#" className="text-clip-muted hover:text-clip-cyan text-sm transition-colors">
                  About
                </a>
              </li>
              <li>
                <a href="#" className="text-clip-muted hover:text-clip-cyan text-sm transition-colors">
                  Blog
                </a>
              </li>
              <li>
                <a href="#" className="text-clip-muted hover:text-clip-cyan text-sm transition-colors">
                  Contact
                </a>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('privacy')}
                  className="text-clip-muted hover:text-clip-cyan text-sm transition-colors"
                >
                  Privacy
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('terms')}
                  className="text-clip-muted hover:text-clip-cyan text-sm transition-colors"
                >
                  Terms
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-center gap-4">
          <p className="text-clip-muted text-sm text-center">
            &copy; {currentYear} ClipAI by OLHMES. Built in Lagos, Nigeria.
          </p>
        </div>
      </div>
    </footer>
  );
}
