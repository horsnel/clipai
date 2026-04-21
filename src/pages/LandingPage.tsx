import { useEffect, useRef } from 'react';
import type { Page } from '@/App';
import { Button } from '@/components/ui/button';
import { 
  Zap, Upload, Brain, Share2, ChevronRight, 
  Gamepad2, Target, Sparkles, Play 
} from 'lucide-react';
import { toast } from 'sonner';

interface LandingPageProps {
  onNavigate: (page: Page) => void;
}

export function LandingPage({ onNavigate }: LandingPageProps) {
  const heroRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Animate hero elements on load
    const animateHero = () => {
      const phone = phoneRef.current;
      const headline = headlineRef.current;
      const cards = cardsRef.current;

      if (phone) {
        phone.style.opacity = '0';
        phone.style.transform = 'translateY(80px) scale(0.92) rotateX(18deg)';
        setTimeout(() => {
          phone.style.transition = 'all 1s cubic-bezier(0.33, 1, 0.68, 1)';
          phone.style.opacity = '1';
          phone.style.transform = 'translateY(0) scale(1) rotateX(0deg)';
        }, 100);
      }

      if (headline) {
        const words = headline.querySelectorAll('.word');
        words.forEach((word, i) => {
          (word as HTMLElement).style.opacity = '0';
          (word as HTMLElement).style.transform = 'translateY(30px) rotateX(35deg)';
          setTimeout(() => {
            (word as HTMLElement).style.transition = 'all 0.6s cubic-bezier(0.33, 1, 0.68, 1)';
            (word as HTMLElement).style.opacity = '1';
            (word as HTMLElement).style.transform = 'translateY(0) rotateX(0deg)';
          }, 200 + i * 80);
        });
      }

      if (cards) {
        const cardElements = cards.querySelectorAll('.feature-card');
        cardElements.forEach((card, i) => {
          (card as HTMLElement).style.opacity = '0';
          (card as HTMLElement).style.transform = i === 0 
            ? 'translateY(60px) rotateZ(-3deg)' 
            : 'translateY(60px) rotateZ(3deg)';
          setTimeout(() => {
            (card as HTMLElement).style.transition = 'all 0.7s cubic-bezier(0.34, 1.56, 0.64, 1)';
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
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-clip-cyan/5 rounded-full blur-[60px]" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/5 rounded-full blur-[60px]" />
        </div>

        {/* Content */}
        <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          {/* Headline */}
          <h1 
            ref={headlineRef}
            className="text-center font-display font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-clip-text leading-tight mb-6 perspective-1000"
          >
            <span className="word inline-block">Your</span>{' '}
            <span className="word inline-block">Gameplay.</span>{' '}
            <span className="word inline-block gradient-text">Your</span>{' '}
            <span className="word inline-block gradient-text">Highlights.</span>{' '}
            <span className="word inline-block text-clip-amber">Viral.</span>
          </h1>

          {/* Subheadline */}
          <p className="text-center text-clip-muted text-base sm:text-lg md:text-xl max-w-2xl mx-auto mb-8 px-4">
            ClipAI scans your matches, detects the hype moments, and cuts share-ready clips—in seconds.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Button
              onClick={() => onNavigate('auth')}
              className="btn-primary text-base px-8 py-4 flex items-center gap-2"
            >
              <Zap className="w-5 h-5" />
              Get Early Access
            </Button>
            <button
              onClick={handleWaitlist}
              className="btn-secondary text-base px-8 py-4 flex items-center gap-2"
            >
              <Play className="w-5 h-5" />
              See How It Works
            </button>
          </div>

          {/* Phone Mockup */}
          <div 
            ref={phoneRef}
            className="relative mx-auto w-full max-w-sm sm:max-w-md lg:max-w-lg perspective-1000 preserve-3d"
          >
            <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-white/[0.08]">
              <img 
                src="/hero-phone.jpg" 
                alt="ClipAI Phone Mockup"
                className="w-full h-auto"
              />
              {/* Overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-clip-dark/60 via-transparent to-transparent" />
              
              {/* Floating badge */}
              <div className="absolute top-4 right-4 bg-clip-cyan text-black text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 animate-pulse-glow">
                <Sparkles className="w-3.5 h-3.5" />
                AI POWERED
              </div>
            </div>

            {/* Decorative elements */}
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-clip-cyan/20 blur-md rounded-full" />
          </div>

          {/* Bottom Feature Cards */}
          <div 
            ref={cardsRef}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto mt-12 px-4"
          >
            <div className="feature-card card-glass p-5 hover:-translate-y-1 transition-transform duration-300">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-clip-cyan/10 flex items-center justify-center flex-shrink-0">
                  <Target className="w-5 h-5 text-clip-cyan" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-clip-text mb-1">
                    Auto-detect kills & clutches
                  </h3>
                  <p className="text-clip-muted text-sm">
                    AI that understands the game—so you don't have to scrub footage.
                  </p>
                </div>
              </div>
            </div>

            <div className="feature-card card-glass p-5 hover:-translate-y-1 transition-transform duration-300">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-clip-amber/10 flex items-center justify-center flex-shrink-0">
                  <Share2 className="w-5 h-5 text-clip-amber" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-clip-text mb-1">
                    TikTok / Reels / Shorts ready
                  </h3>
                  <p className="text-clip-muted text-sm">
                    Vertical exports, smart captions, and beat-synced cuts.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid Section */}
      <section id="features" className="py-20 lg:py-28 relative">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-clip-text mb-4">
              Three moves. <span className="gradient-text">Zero editing.</span>
            </h2>
            <p className="text-clip-muted text-base sm:text-lg">
              Upload a match. Pick your moments. Export in seconds.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[
              {
                icon: Upload,
                title: 'Upload or paste a link',
                description: 'MP4, YouTube, or stream VOD—ClipAI handles the rest.',
                color: 'clip-cyan',
              },
              {
                icon: Brain,
                title: 'AI finds the hype',
                description: 'Detects kills, clutches, comebacks, and crowd-level audio spikes.',
                color: 'clip-amber',
              },
              {
                icon: Share2,
                title: 'Export & go viral',
                description: 'Vertical cuts, captions, and beat sync—ready for TikTok / Reels / Shorts.',
                color: 'green-400',
              },
            ].map((feature, i) => (
              <div
                key={feature.title}
                className="card-glass p-8 hover:-translate-y-2 hover:border-white/[0.12] transition-all duration-300 group"
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
              {['Call of Duty', 'Bloodstrike', 'PUBG', 'Mobile Legends', 'Free Fire'].map((game) => (
                <span
                  key={game}
                  className="text-clip-muted/60 hover:text-clip-text font-display font-semibold text-sm lg:text-base transition-colors cursor-default"
                >
                  {game}
                </span>
              ))}
            </div>
          </div>

          {/* Testimonial */}
          <div className="max-w-3xl mx-auto">
            <div className="card-glass p-8 lg:p-10 relative">
              <div className="absolute -top-4 left-8 text-6xl text-clip-cyan/20 font-serif">"</div>
              <blockquote className="text-clip-text text-lg lg:text-xl leading-relaxed mb-6 relative z-10">
                ClipAI turned a 40-minute scrim into three viral clips. My editor quit…and I don't miss him.
              </blockquote>
              <div className="flex items-center gap-4">
                <img
                  src="/avatar-tobi.jpg"
                  alt="Tobi"
                  className="w-12 h-12 rounded-xl object-cover border border-white/[0.08]"
                />
                <div>
                  <p className="font-display font-semibold text-clip-text">Tobi</p>
                  <p className="text-clip-muted text-sm">COD Mobile Creator</p>
                </div>
                <div className="ml-auto">
                  <span className="hype-badge-gold">98 HYPE</span>
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
              <div className="relative rounded-3xl overflow-hidden shadow-card border border-white/[0.08] max-w-sm mx-auto lg:mx-0">
                <img 
                  src="/gameplay-thumb-1.jpg" 
                  alt="Smart Cuts Preview"
                  className="w-full h-auto"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-clip-dark/80 via-transparent to-clip-cyan/10" />
                
                {/* Overlay UI elements */}
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="bg-clip-dark/90 rounded-xl p-3 border border-white/[0.08]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-clip-muted">Beat Sync</span>
                      <span className="text-xs text-clip-cyan">ON</span>
                    </div>
                    <div className="h-1 bg-clip-surface rounded-full overflow-hidden">
                      <div className="h-full w-2/3 bg-gradient-to-r from-clip-cyan to-blue-400" />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Glow effect */}
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-2/3 h-16 bg-clip-cyan/20 blur-md rounded-full" />
            </div>

            {/* Content */}
            <div>
              <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-clip-text mb-6">
                Smart cuts. <span className="gradient-text">No guesswork.</span>
              </h2>
              
              <div className="space-y-5 mb-8">
                {[
                  { icon: Zap, text: 'Beat-synced transitions' },
                  { icon: Sparkles, text: 'Auto-captions that match your style' },
                  { icon: Gamepad2, text: 'Watermark + outro branding' },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-clip-cyan/10 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-5 h-5 text-clip-cyan" />
                    </div>
                    <span className="text-clip-text font-medium">{item.text}</span>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => onNavigate('auth')}
                className="btn-primary flex items-center gap-2"
              >
                See the Demo
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-28 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-clip-cyan/5 rounded-full blur-[60px]" />
        </div>
        
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 relative z-10">
          <div className="max-w-xl mx-auto">
            <div className="card-glass p-8 lg:p-10 border-white/[0.08]">
              <h2 className="font-display font-bold text-2xl sm:text-3xl text-clip-text text-center mb-3">
                Get early access
              </h2>
              <p className="text-clip-muted text-center mb-6">
                Be the first to auto-edit your highlights. Join the waitlist + get 20% off when we launch.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <input
                  type="email"
                  placeholder="you@example.com"
                  className="input-dark flex-1"
                />
                <Button
                  onClick={() => onNavigate('auth')}
                  className="btn-primary whitespace-nowrap"
                >
                  Join Waitlist
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
