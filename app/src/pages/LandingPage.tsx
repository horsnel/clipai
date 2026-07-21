import { useEffect, useRef } from 'react';
import type { Page } from '../App';
import { Button } from '@/components/ui/button';
import {
  Zap, ChevronRight,
  Gamepad2, Sparkles, Play, Flame, TrendingUp, Users,
} from 'lucide-react';
import { toast } from 'sonner';

interface LandingPageProps {
  onNavigate: (page: Page, clips?: unknown[]) => void;
}

/**
 * Branded fallback for any <img> that fails to load. Instead of showing the
 * browser's broken-image icon, we swap the <img> for a gradient block with
 * the ClipAI logo mark. This keeps the landing page looking polished even
 * when the CDN / network fails for a specific asset.
 *
 * Usage: <img onError={handleImageError} ... />
 */
function handleImageError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  // Avoid infinite loop if the fallback itself somehow fails
  if (img.dataset.fallbackApplied) return;
  img.dataset.fallbackApplied = 'true';
  // Hide the broken img and inject a branded placeholder in its place
  img.style.display = 'none';
  const parent = img.parentElement;
  if (!parent) return;
  parent.classList.add('bg-gradient-to-br', 'from-clip-cyan/15', 'via-clip-surface', 'to-blue-900/30');
  parent.classList.add('flex', 'items-center', 'justify-center', 'min-h-[200px]');
  const placeholder = document.createElement('div');
  placeholder.className = 'flex flex-col items-center gap-2 opacity-50';
  placeholder.innerHTML = '<svg width="48" height="48" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="92" height="92" rx="24" fill="#00FFFF"/><path d="M 32 26 L 32 74 L 76 50 Z" fill="#0A0A0A"/></svg><span class="text-[10px] text-clip-muted uppercase tracking-wider">ClipAI</span>';
  parent.appendChild(placeholder);
}

export function LandingPage({ onNavigate }: LandingPageProps) {
  const heroRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Animate hero elements on load
    const animateHero = () => {
      const headline = headlineRef.current;
      const cards = cardsRef.current;

      if (headline) {
        const words = headline.querySelectorAll('.word');
        words.forEach((word, i) => {
          (word as HTMLElement).style.opacity = '0';
          (word as HTMLElement).style.transform = 'translateY(30px) rotateX(35deg)';
          setTimeout(() => {
            (word as HTMLElement).style.transition = 'all 0.6s cubic bezier(0.33, 1, 0.68, 1)';
            (word as HTMLElement).style.opacity = '1';
            (word as HTMLElement).style.transform = 'translateY(0) rotateX(0deg)';
          }, 200 + i * 80);
        });
      }

      if (cards) {
        const cardElements = cards.querySelectorAll('.feature card');
        cardElements.forEach((card, i) => {
          (card as HTMLElement).style.opacity = '0';
          (card as HTMLElement).style.transform = i === 0 
            ? 'translateY(60px) rotateZ(-3deg)' 
            : 'translateY(60px) rotateZ(3deg)';
          setTimeout(() => {
            (card as HTMLElement).style.transition = 'all 0.7s cubic bezier(0.34, 1.56, 0.64, 1)';
            (card as HTMLElement).style.opacity = '1';
            (card as HTMLElement).style.transform = 'translateY(0) rotateZ(0deg)';
          }, 600 + i * 150);
        });
      }
    };

    animateHero();
  }, []);

  const handleWaitlist = () => {
    toast.success('Thanks for your interest! Sign up to get early access.');
    onNavigate('auth');
  };

  return (
    <div className="relative">
      {/* Hero Section */}
      <section 
        ref={heroRef}
        className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-20"
      >
        {/* Background effects */}
        <div className="absolute inset-0 vignette pointer-events-none" />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-clip-cyan/3 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/3 rounded-full blur-[100px]" />
        </div>

        {/* Content */}
        <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          {/* Headline */}
          <h1 
            ref={headlineRef}
            className="text-center font-display font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-clip-text leading-tight mb-6 perspective-1000"
          >
            <span className="word inline-block">Paste</span>{' '}
            <span className="word inline-block">a</span>{' '}
            <span className="word inline-block">URL.</span>{' '}
            <span className="word inline-block gradient-text">Get</span>{' '}
            <span className="word inline-block gradient-text">14</span>{' '}
            <span className="word inline-block text-clip-amber">strategies.</span>
          </h1>

          {/* Subheadline */}
          <p className="text-center text-clip-muted text-base sm:text-lg md:text-xl max-w-2xl mx-auto mb-8 px-4">
            ClipAI streams any YouTube video through AI and returns titles, hooks, captions, distribution packs, thumbnail concepts, and 9 more viral outputs: in seconds. No uploads. No rendering. No storage.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Button
              onClick={() => onNavigate('auth')}
              className="btn-primary text-base px-8 py-4 flex items-center gap-2"
            >
              <Zap className="w-5 h-5" />
              Start Free — 50 Credits
            </Button>
            <button
              onClick={handleWaitlist}
              className="btn-secondary text-base px-8 py-4 flex items-center gap-2"
            >
              <Play className="w-5 h-5" />
              See How It Works
            </button>
          </div>

          {/* Bottom Feature Cards */}
          <div 
            ref={cardsRef}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto mt-12 px-4"
          >
            <div className="feature-card card-glass p-5 hover:-translate-y-1 transition-transform duration-300">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-clip-amber/10 flex items-center justify-center flex-shrink-0">
                  <Flame className="w-5 h-5 text-clip-amber" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-clip-text mb-1">
                    Viral Forge: 14 outputs per URL
                  </h3>
                  <p className="text-clip-muted text-sm">
                    Titles, hook score, captions, distribution pack, thumbnail concepts, pinned comments, sponsorship spots: all from one paste.
                  </p>
                </div>
              </div>
            </div>

            <div className="feature-card card-glass p-5 hover:-translate-y-1 transition-transform duration-300">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-clip-text mb-1">
                    Topic Steal: network trends
                  </h3>
                  <p className="text-clip-muted text-sm">
                    See which topics every ClipAI creator is analysing this week. Anonymous aggregation across all Deep Analyses.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Hero showcase — new portrait image right after hero */}
      <section className="py-16 lg:py-20 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-clip-cyan/4 rounded-full blur-[130px]" />
        </div>
        <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="relative max-w-md mx-auto">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-white/[0.04] bg-clip-surface">
              <img
                src="/marketing-hero.png"
                alt="ClipAI in action — creator workflow on mobile"
                className="w-full h-auto"
                onError={handleImageError}
              />
              {/* Subtle overlay gradient for legibility */}
              <div className="absolute inset-0 bg-gradient-to-t from-clip-dark/40 via-transparent to-transparent pointer-events-none" />
              {/* Badge */}
              <div className="absolute top-4 right-4 bg-clip-amber text-black text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-glow-amber animate-pulse-glow">
                <Flame className="w-3.5 h-3.5" />
                VIRAL
              </div>
            </div>
            {/* Glow under */}
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-3/4 h-10 bg-clip-amber/15 blur-2xl rounded-full pointer-events-none" />
          </div>
        </div>
      </section>

      {/* Creator phone showcase — new portrait screenshot, full-bleed dark teal */}
      <section className="py-16 lg:py-20 relative overflow-hidden bg-clip-surface/30">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-clip-cyan/6 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-clip-violet/6 rounded-full blur-[100px]" />
        </div>
        <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center max-w-6xl mx-auto">
            {/* Phone screenshot image */}
            <div className="relative order-2 lg:order-1">
              <div className="relative max-w-[320px] mx-auto lg:mx-0">
                <div className="relative rounded-[2.2rem] overflow-hidden shadow-2xl border border-white/[0.06] bg-clip-dark">
                  <img
                    src="/marketing-phone.png"
                    alt="ClipAI mobile app — creator dashboard in action"
                    className="w-full h-auto"
                    onError={handleImageError}
                  />
                  {/* Subtle scanline overlay for screen feel */}
                  <div className="absolute inset-0 bg-gradient-to-t from-clip-dark/30 via-transparent to-transparent pointer-events-none" />
                  {/* Notch indicator */}
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-1.5 bg-black/60 rounded-full" />
                </div>
                {/* Vivid dual-color glow */}
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-3/4 h-12 bg-gradient-to-r from-clip-cyan/30 via-clip-blue/30 to-clip-violet/30 blur-2xl rounded-full pointer-events-none" />
                {/* Side accent */}
                <div className="absolute -right-3 top-1/4 w-1.5 h-12 bg-gradient-to-b from-clip-cyan to-clip-violet rounded-full opacity-70" />
              </div>
            </div>

            {/* Copy */}
            <div className="order-1 lg:order-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-clip-violet bg-clip-violet/10 border border-clip-violet/30 px-3 py-1 rounded-full mb-4">
                <Sparkles className="w-3.5 h-3.5" /> Real creator workflow
              </span>
              <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-clip-text mb-6 leading-tight">
                Built mobile-first. <span className="gradient-text">Lives in your pocket.</span>
              </h2>
              <p className="text-clip-muted text-base sm:text-lg mb-8 leading-relaxed">
                Every ClipAI feature — Viral Forge, Trend Radar, ClipBot coach, Channel Audit — is one tap away on your phone. Capture a clip on the bus, get 14 outputs before you get home.
              </p>
              <div className="space-y-4">
                {[
                  { icon: Zap, text: 'Mobile-optimised UI — every screen tuned for one-handed use' },
                  { icon: Flame, text: 'Instant paste-from-clipboard — no uploads, no rendering' },
                  { icon: TrendingUp, text: 'Push notifications when your game\'s meta shifts' },
                ].map((item) => (
                  <div key={item.text} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-clip-cyan/15 to-clip-violet/15 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-5 h-5 text-clip-cyan" />
                    </div>
                    <span className="text-clip-text font-medium leading-relaxed">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Phase 1 Features Section */}
      <section id="features" className="py-20 lg:py-28 relative">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-clip-amber bg-clip-amber/10 border border-clip-amber/20 px-3 py-1 rounded-full mb-4">
              <Sparkles className="w-3.5 h-3.5" /> Phase 1 — live now
            </span>
            <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-clip-text mb-4">
              One paste. <span className="gradient-text">14 viral strategies.</span>
            </h2>
            <p className="text-clip-muted text-base sm:text-lg">
              Viral Forge turns any YouTube URL into titles, hooks, captions, distribution packs, thumbnail concepts, and 9 more outputs: all from one AI call.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[
              {
                icon: Flame,
                title: 'Viral Forge',
                description: 'Paste a URL → get hook score, 10 titles, captions, distribution pack, hidden gems, goldilocks map, thumbnail concepts, sponsorship spots, and 6 more outputs in seconds.',
                color: 'clip-amber',
              },
              {
                icon: TrendingUp,
                title: 'Topic Steal',
                description: 'Anonymous aggregation across every Deep Analysis. See what topics are rising +340% in your network this week. The moat compounds with every analysis.',
                color: 'green-400',
              },
              {
                icon: Users,
                title: 'Competitor Lab + Playlist Architect',
                description: 'Head-to-head video comparison (Viral Gap, Voice Gap, Predictive Comments) and multi-video sequencing for distribution. Pro tier unlocks both.',
                color: 'clip-cyan',
              },
            ].map((feature, i) => (
              <div
                key={feature.title}
                className="card-glass p-8 hover:-translate-y-2 hover:border-white/[0.025] transition-all duration-300 group"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className={`w-14 h-14 rounded-2xl bg-${feature.color}/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                  <feature.icon className={`w-7 h-7 text-${feature.color}`} />
                </div>
                <h3 className="font-display font-semibold text-xl text-clip-text mb-3">
                  {feature.title}
                </h3>
                <p className="text-clip-muted text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>

          {/* 14 outputs strip */}
          <div className="max-w-4xl mx-auto mt-12 card-glass p-6">
            <p className="text-clip-muted text-xs uppercase tracking-wider mb-3 text-center">Every Deep Analysis returns</p>
            <div className="flex flex-wrap justify-center gap-2">
              {['Hook Score', '10 Titles', 'Captions', 'Distribution Pack', 'Hidden Gems', 'Goldilocks Map', 'Thumbnail Concepts', 'Pinned Comments', 'Community Polls', 'Sponsorship Spots', 'Controversy Hooks', 'Sentiment Arc', 'Shadow Editor', 'Pacing'].map((o) => (
                <span key={o} className="text-xs text-clip-text bg-clip-surface border border-white/[0.02] px-2.5 py-1 rounded-full">
                  {o}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard Preview Section — shows the in-app phone dashboard with trending videos */}
      <section className="py-20 lg:py-28 relative overflow-hidden">
        {/* Background glows */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-clip-cyan/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-clip-amber/5 rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center max-w-6xl mx-auto">
            {/* Phone mockup with the actual ClipAI dashboard */}
            <div className="relative order-2 lg:order-1">
              <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-white/[0.04] max-w-sm mx-auto lg:mx-0 bg-clip-surface perspective-1000">
                <img
                  src="/marketing-leaderboard.png"
                  alt="ClipAI dashboard showing trending videos and Viral Forge CTA"
                  className="w-full h-auto"
                  onError={handleImageError}
                />
                {/* Overlay gradient for legibility */}
                <div className="absolute inset-0 bg-gradient-to-t from-clip-dark/30 via-transparent to-transparent pointer-events-none" />

                {/* Floating "Live" badge */}
                <div className="absolute top-4 left-4 bg-clip-surface/90 backdrop-blur-sm text-clip-cyan text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-clip-cyan/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-clip-live animate-pulse" />
                  LIVE DASHBOARD
                </div>
              </div>

              {/* Glow effect under phone */}
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-2/3 h-16 bg-clip-cyan/20 blur-2xl rounded-full pointer-events-none" />
            </div>

            {/* Content */}
            <div className="order-1 lg:order-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-clip-cyan bg-clip-cyan/10 border border-clip-cyan/20 px-3 py-1 rounded-full mb-4">
                <Sparkles className="w-3.5 h-3.5" /> Inside the app
              </span>
              <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-clip-text mb-6 leading-tight">
                Your creator command center. <span className="gradient-text">Always one tap away.</span>
              </h2>
              <p className="text-clip-muted text-base sm:text-lg mb-8 leading-relaxed">
                Open ClipAI and the dashboard loads instantly. Trending videos in your game, scored by HYPE. A one-tap shortcut to run Viral Forge on any clip. Everything you need to ship content faster, surfaced before you ask.
              </p>

              <div className="space-y-4 mb-8">
                {[
                  { icon: Flame, text: 'Trending Now — top clips in your game, last 24h, ranked by HYPE score' },
                  { icon: Zap, text: 'One-tap Viral Forge — paste a URL, get 14 outputs in seconds' },
                  { icon: TrendingUp, text: 'Personalized to your primary game, updated continuously' },
                ].map((item) => (
                  <div key={item.text} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-clip-cyan/6 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-5 h-5 text-clip-cyan" />
                    </div>
                    <span className="text-clip-text font-medium leading-relaxed">{item.text}</span>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => onNavigate('auth')}
                className="btn-primary flex items-center gap-2"
              >
                Open the Dashboard
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="py-20 lg:py-28 bg-clip-surface/50 relative">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          {/* Game logos */}
          <div className="text-center mb-12">
            <p className="text-clip-muted text-sm uppercase tracking-wider mb-6">
              Built for the games you play
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6 lg:gap-10">
              {['Valorant', 'Apex Legends', 'Fortnite', 'Minecraft', 'Roblox', 'Call of Duty'].map((game) => (
                <span
                  key={game}
                  className="text-clip-muted/60 hover:text-clip-text font-display font-semibold text-sm lg:text-base transition-colors cursor-default"
                >
                  {game}
                </span>
              ))}
            </div>
          </div>

          {/* Testimonials — 2 creator cards */}
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Existing Tobi testimonial */}
            <div className="card-glass p-8 lg:p-10 relative">
              <div className="absolute -top-4 left-8 text-6xl text-clip-cyan/20 font-serif">"</div>
              <blockquote className="text-clip-text text-lg lg:text-xl leading-relaxed mb-6 relative z-10">
                I dropped 3 clips using ViralForge captions and Trend Radar sounds. Two hit 100K in a week. ClipBot literally rewrote my hook in 5 seconds and the third hit 400K.
              </blockquote>
              <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                <img
                  src="/avatar-tobi.jpg"
                  alt="Tobi"
                  className="w-12 h-12 rounded-xl object-cover border border-white/[0.02] flex-shrink-0 bg-clip-surface"
                  onError={handleImageError}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-display font-semibold text-clip-text">Tobi</p>
                  <p className="text-clip-muted text-sm break-words">Apex Legends Creator · 280K followers</p>
                </div>
                <div className="flex-shrink-0 w-full sm:w-auto sm:ml-auto">
                  <span className="hype-badge-gold inline-block">98 HYPE</span>
                </div>
              </div>
            </div>

            {/* New creator testimonial — uses avatar-new.jpg */}
            <div className="card-glass p-8 lg:p-10 relative">
              <div className="absolute -top-4 left-8 text-6xl text-clip-amber/20 font-serif">"</div>
              <blockquote className="text-clip-text text-lg lg:text-xl leading-relaxed mb-6 relative z-10">
                I was grinding for months with no traction. One Deep Analysis told me my hook was buried at 0:18 — moved it to 0:02 and the next clip did 220K in 48 hours. ClipAI just gets the algorithm.
              </blockquote>
              <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                <img
                  src="/avatar-new.jpg"
                  alt="Maya"
                  className="w-12 h-12 rounded-xl object-cover border border-white/[0.02] flex-shrink-0 bg-clip-surface"
                  onError={handleImageError}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-display font-semibold text-clip-text">Maya</p>
                  <p className="text-clip-muted text-sm break-words">Valorant Creator · 145K followers</p>
                </div>
                <div className="flex-shrink-0 w-full sm:w-auto sm:ml-auto">
                  <span className="hype-badge inline-block">91 HYPE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Smart Cuts Section */}
      <section className="py-20 lg:py-28 relative overflow-hidden">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center max-w-6xl mx-auto">
            {/* Phone mockup */}
            <div className="relative">
              <div className="relative rounded-3xl overflow-hidden shadow-card border border-white/[0.02] max-w-sm mx-auto lg:mx-0 bg-clip-surface">
                <img
                  src="/marketing-ai.png"
                  alt="Smart Cuts Preview"
                  className="w-full h-auto"
                  onError={handleImageError}
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-clip-dark/80 via-transparent to-clip-cyan/10" />
                
                {/* Overlay UI elements */}
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="bg-clip-dark/90 backdrop-blur-sm rounded-xl p-3 border border-white/[0.02]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-clip-muted">Beat Sync</span>
                      <span className="text-xs text-clip-cyan">ON</span>
                    </div>
                    <div className="h-1 bg-clip-surface rounded-full overflow-hidden">
                      <div className="h-full w-2/3 bg-gradient-to-r from-clip-cyan to-blue-600" />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Glow effect */}
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-2/3 h-16 bg-clip-cyan/20 blur-2xl rounded-full" />
            </div>

            {/* Content */}
            <div>
              <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-clip-text mb-6">
                Smart cuts. <span className="gradient-text">Coming December 2026.</span>
              </h2>
              
              <div className="space-y-5 mb-8">
                {[
                  { icon: Zap, text: 'Beat synced transitions' },
                  { icon: Sparkles, text: 'Auto captions that match your style' },
                  { icon: Gamepad2, text: 'Watermark + outro branding' },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-clip-cyan/6 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-5 h-5 text-clip-cyan" />
                    </div>
                    <span className="text-clip-text font-medium">{item.text}</span>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => onNavigate('upload')}
                className="btn-primary flex items-center gap-2"
              >
                Join the Waitlist
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Wide gameplay showcase — new landscape image before CTA */}
      <section className="py-20 lg:py-28 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 right-1/3 w-96 h-96 bg-clip-amber/4 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-clip-cyan/4 rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-clip-cyan bg-clip-cyan/10 border border-clip-cyan/20 px-3 py-1 rounded-full mb-4">
                <Gamepad2 className="w-3.5 h-3.5" /> Built for the clutch
              </span>
              <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-clip-text mb-4 leading-tight">
                Every play. <span className="gradient-text">Every angle.</span> Every output.
              </h2>
              <p className="text-clip-muted text-base sm:text-lg max-w-2xl mx-auto">
                Drop a clip from any shooter, MOBA, or sandbox. ClipAI recognises the game, the moment, and the meta — then ships 14 viral strategies tuned to that exact play.
              </p>
            </div>

            <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-white/[0.04] bg-clip-surface">
              <img
                src="/marketing-social.png"
                alt="Clutch gameplay moment analyzed by ClipAI"
                className="w-full h-auto"
                onError={handleImageError}
              />
              {/* Cinematic gradient overlays */}
              <div className="absolute inset-0 bg-gradient-to-t from-clip-dark/80 via-clip-dark/10 to-transparent pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-r from-clip-dark/40 via-transparent to-clip-dark/40 pointer-events-none" />

              {/* Floating analysis chips */}
              <div className="absolute top-4 left-4 flex flex-wrap gap-2">
                <span className="bg-clip-surface/90 backdrop-blur-sm text-clip-cyan text-xs font-bold px-3 py-1.5 rounded-full border border-clip-cyan/30 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> HOOK SCORE 94
                </span>
                <span className="bg-clip-surface/90 backdrop-blur-sm text-clip-amber text-xs font-bold px-3 py-1.5 rounded-full border border-clip-amber/30 flex items-center gap-1.5">
                  <Flame className="w-3 h-3" /> TRENDING +340%
                </span>
              </div>

              {/* Bottom caption strip */}
              <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
                <div className="bg-clip-dark/85 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-white/[0.04]">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-clip-cyan to-clip-violet flex items-center justify-center flex-shrink-0">
                        <Zap className="w-5 h-5 text-black" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-display font-semibold text-clip-text text-sm sm:text-base truncate">Viral Forge analysis ready</p>
                        <p className="text-clip-muted text-xs truncate">14 outputs · 1.2s · game detected: Valorant</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => onNavigate('auth')}
                      className="btn-primary flex items-center gap-2 flex-shrink-0"
                    >
                      Try It Free
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Glow under */}
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-2/3 h-12 bg-clip-cyan/15 blur-3xl rounded-full pointer-events-none" />
          </div>
        </div>
      </section>

      {/* Dual gameplay showcase — two new landscape images side by side */}
      <section className="py-20 lg:py-28 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-clip-amber/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-clip-violet/5 rounded-full blur-[120px]" />
        </div>

        <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-clip-cyan bg-clip-cyan/10 border border-clip-cyan/30 px-3 py-1 rounded-full mb-4">
              <Gamepad2 className="w-3.5 h-3.5" /> Multi-game intelligence
            </span>
            <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-clip-text mb-4 leading-tight">
              One tool. <span className="gradient-text">Every game.</span>
            </h2>
            <p className="text-clip-muted text-base sm:text-lg">
              Whether you're clipping a 1v5 in Valorant or a build battle in Fortnite, ClipAI recognises the moment, the meta, and the music — then ships captions that hit.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {/* Sunset gameplay card — uses gameplay-sunset.jpg (amber/teal tones) */}
            <div className="relative group">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/[0.04] bg-clip-surface aspect-video">
                <img
                  src="/gameplay-sunset.jpg"
                  alt="Sunset gameplay moment — amber and teal tones"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  onError={handleImageError}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-clip-dark/80 via-transparent to-transparent" />
                <div className="absolute top-3 left-3 flex gap-2">
                  <span className="bg-clip-amber/90 text-black text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                    <Flame className="w-2.5 h-2.5" /> HOOK 96
                  </span>
                  <span className="bg-clip-dark/80 backdrop-blur-sm text-clip-amber-rich text-[10px] font-bold px-2 py-1 rounded-full border border-clip-amber/30">
                    SUNSET TONES
                  </span>
                </div>
                <div className="absolute bottom-3 left-3 right-3">
                  <p className="font-display font-bold text-clip-text text-sm sm:text-base">Apex Legends · Ranked Clutch</p>
                  <p className="text-clip-muted text-xs">14 outputs generated · 1.1s</p>
                </div>
              </div>
              {/* Amber glow underneath */}
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-2/3 h-8 bg-clip-amber/25 blur-2xl rounded-full pointer-events-none" />
            </div>

            {/* Violet gameplay card — uses gameplay-violet.jpg (blue/violet tones) */}
            <div className="relative group">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/[0.04] bg-clip-surface aspect-video">
                <img
                  src="/gameplay-violet.jpg"
                  alt="Violet gameplay moment — blue and magenta tones"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  onError={handleImageError}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-clip-dark/80 via-transparent to-transparent" />
                <div className="absolute top-3 left-3 flex gap-2">
                  <span className="bg-clip-violet/90 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" /> HOOK 94
                  </span>
                  <span className="bg-clip-dark/80 backdrop-blur-sm text-clip-violet text-[10px] font-bold px-2 py-1 rounded-full border border-clip-violet/30">
                    NEON VIBE
                  </span>
                </div>
                <div className="absolute bottom-3 left-3 right-3">
                  <p className="font-display font-bold text-clip-text text-sm sm:text-base">Valorant · Tournament Ace</p>
                  <p className="text-clip-muted text-xs">14 outputs generated · 1.2s</p>
                </div>
              </div>
              {/* Violet glow underneath */}
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-2/3 h-8 bg-clip-violet/25 blur-2xl rounded-full pointer-events-none" />
            </div>
          </div>

          {/* Stat row below the two cards */}
          <div className="max-w-3xl mx-auto mt-12 grid grid-cols-3 gap-4">
            {[
              { stat: '50+', label: 'games supported' },
              { stat: '1.2s', label: 'avg analysis time' },
              { stat: '14', label: 'outputs per clip' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="font-display font-bold text-3xl sm:text-4xl gradient-text">{s.stat}</p>
                <p className="text-clip-muted text-xs sm:text-sm uppercase tracking-wider mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-28 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-clip-cyan/3 rounded-full blur-[150px]" />
        </div>
        
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 relative z-10">
          <div className="max-w-xl mx-auto">
            <div className="card-glass p-8 lg:p-10 border-white/[0.02]">
              <h2 className="font-display font-bold text-2xl sm:text-3xl text-clip-text text-center mb-3">
                Get 50 free credits
              </h2>
              <p className="text-clip-muted text-center mb-6">
                Sign up free, unlock Trend Radar + ViralForge + ClipBot coach + Caption Battle instantly. No card required.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <input
                  type="email"
                  placeholder="you@example.com"
                  className="input-dark flex-1"
                />
                <Button
                  onClick={() => onNavigate('auth')}
                  className="btn primary whitespace nowrap"
                >
                  Create Free Account
                </Button>
              </div>
              
              <p className="text-clip-muted text-xs text-center">
                No spam. Unsubscribe anytime.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
