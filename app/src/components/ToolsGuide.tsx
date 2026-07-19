/**
 * ToolsGuide.tsx — Animated onboarding guide for new ClipAI users.
 *
 * Replaces every per-tool InfoIconPopup across the app with a single,
 * centrally-managed guidance experience. Designed for first-time users so
 * they can quickly learn what each tool does and how the platform fits
 * together without having to click tiny "i" icons scattered around.
 *
 * BEHAVIOUR
 *   1. First dashboard visit (no `clipai_tools_guide_seen` localStorage
 *      flag) — auto-opens the guided tour as a centred modal.
 *   2. Subsequent visits — collapses into a quiet "How does ClipAI work?"
 *      button at the bottom of the dashboard. Click to reopen.
 *   3. The guide is a single scrollable card that walks through each tool
 *      with an animated icon + short copy. Auto-advances every 3.5s with
 *      a progress bar; user can also click steps manually.
 *   4. "Got it" closes the modal and sets the localStorage flag.
 *
 * NO deaths-by-1000-cuts: one component, one source of truth for tool
 * descriptions, shown once per browser. Replaces 30+ InfoIconPopup instances.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Page } from '../App';
import {
  X, ChevronRight, ChevronLeft, Sparkles, Flame, Radio,
  BarChart2, Trophy, Scissors, Bot, Search, ArrowRight, Check,
} from 'lucide-react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';

interface ToolsGuideProps {
  onNavigate: (page: Page) => void;
}

interface Step {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  title: string;
  body: string;
  cta?: { label: string; page: Page };
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    iconBg: 'bg-clip-cyan/15',
    iconColor: 'text-clip-cyan',
    title: 'Welcome to ClipAI',
    body: 'ClipAI turns any YouTube video into 14 viral strategy outputs in seconds: titles, captions, hooks, hashtags, thumbnail concepts, and more. No uploads. No rendering. No storage.',
  },
  {
    icon: Flame,
    iconBg: 'bg-clip-amber/15',
    iconColor: 'text-clip-amber',
    title: 'Viral Forge',
    body: 'Paste a YouTube URL and get 14 viral outputs in one shot: title variants, hook score, captions, distribution pack for X and LinkedIn, thumbnail concepts, pinned comments, sponsorship spots, and more. Costs 5 credits per URL.',
    cta: { label: 'Open Viral Forge', page: 'forge' },
  },
  {
    icon: Radio,
    iconBg: 'bg-green-500/15',
    iconColor: 'text-green-600',
    title: 'Trend Radar',
    body: 'See what is blowing up across YouTube, Reddit, Google, TikTok and X right now. Free plan refreshes every 24h. Pro refreshes hourly and adds sound tracking.',
    cta: { label: 'Open Trend Radar', page: 'trends' },
  },
  {
    icon: BarChart2,
    iconBg: 'bg-blue-500/15',
    iconColor: 'text-blue-600',
    title: 'Growth Intel',
    body: 'Three growth tools in one. Competitor Spy analyses any creator channel. Best Time to Post gives you the optimal schedule for Nigeria (WAT). A/B Title Predictor scores two title options against live search data.',
    cta: { label: 'Open Growth Intel', page: 'growth' },
  },
  {
    icon: Trophy,
    iconBg: 'bg-purple-500/15',
    iconColor: 'text-purple-600',
    title: 'Creator Rank',
    body: 'Earn XP for every action on ClipAI. Climb through 7 ranks from Rookie to God Tier. Log in 7 days in a row to unlock a 2× XP streak multiplier.',
    cta: { label: 'Open Creator Rank', page: 'rank' },
  },
  {
    icon: Bot,
    iconBg: 'bg-clip-cyan/15',
    iconColor: 'text-clip-cyan',
    title: 'ClipBot Coach',
    body: 'Chat with ClipBot: your personal AI gaming content coach. Ask anything about going viral on TikTok, YouTube Shorts and Reels, especially in the Nigerian and African gaming scene. 10 free messages per day on Free plan.',
  },
  {
    icon: Search,
    iconBg: 'bg-purple-500/15',
    iconColor: 'text-purple-500',
    title: 'Channel Audits',
    body: 'Audit up to 8 YouTube, TikTok, X, Instagram or Reddit channels for free. Pull real subscriber counts, total views, recent posts and engagement rates. First audit is free, then 1 credit each.',
    cta: { label: 'Audit a channel', page: 'audit' },
  },
  {
    icon: Scissors,
    iconBg: 'bg-clip-surface',
    iconColor: 'text-clip-muted',
    title: 'Video Editor (Coming Soon)',
    body: 'Auto cut, beat synced transitions, vertical reframing and one tap TikTok export. Launches December 2026. Pro and Creator subscribers get Early Access the moment it ships.',
  },
];

const STORAGE_KEY = 'clipai_tools_guide_seen_v1';
const AUTO_ADVANCE_MS = 4500;

export function ToolsGuide({ onNavigate }: ToolsGuideProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<number | null>(null);

  // First-time auto-open
  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        // Small delay so the dashboard paints first
        const t = setTimeout(() => setOpen(true), 800);
        return () => clearTimeout(t);
      }
    } catch {}
  }, []);

  // Auto-advance with progress bar
  useEffect(() => {
    if (!open || paused) return;
    timerRef.current = window.setTimeout(() => {
      setStep(s => (s + 1) % STEPS.length);
    }, AUTO_ADVANCE_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [open, paused, step]);

  // Lock parent body scroll while the guide is open
  useBodyScrollLock(open);

  const handleClose = useCallback(() => {
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
  }, []);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  const goTo = (i: number) => {
    setStep(((i % STEPS.length) + STEPS.length) % STEPS.length);
  };

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <>
      {/* Collapsed trigger button: only shown after first-time guide dismissed */}
      <div className="mb-10 flex justify-center">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 text-xs font-medium px-4 py-2.5 rounded-full bg-clip-surface border border-white/[0.04] text-clip-muted hover:text-clip-cyan hover:border-clip-cyan/30 transition-all group"
        >
          <Sparkles className="w-3.5 h-3.5 text-clip-cyan group-hover:scale-110 transition-transform" />
          How does ClipAI work?
          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-label="ClipAI tools guide"
        >
          <div
            className="relative w-full max-w-lg card-glass rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            {/* Top progress bar: animated per step */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-clip-border z-20">
              <div
                key={step + (paused ? '-p' : '')}
                className="h-full bg-gradient-to-r from-clip-cyan to-violet-500"
                style={{
                  animation: paused ? 'none' : `clipai-guide-progress ${AUTO_ADVANCE_MS}ms linear forwards`,
                }}
              />
            </div>

            {/* Close button (circled X) */}
            <button
              onClick={handleClose}
              aria-label="Close guide"
              className="absolute top-3 right-3 z-30 w-8 h-8 rounded-full border border-white/15 text-clip-muted hover:text-clip-text hover:border-white/40 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" strokeWidth={2.5} />
            </button>

            {/* Step counter */}
            <div className="absolute top-3 left-3 z-30 text-[10px] uppercase tracking-wider text-clip-muted/80 font-medium">
              {step + 1} / {STEPS.length}
            </div>

            {/* Body */}
            <div className="p-8 pt-12">
              {/* Animated icon: fade + scale on step change */}
              <div
                key={`icon-${step}`}
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ animation: 'clipai-guide-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
              >
                <div className={`w-full h-full rounded-2xl flex items-center justify-center ${current.iconBg}`}>
                  <Icon className={`w-8 h-8 ${current.iconColor}`} strokeWidth={2} />
                </div>
              </div>

              {/* Title */}
              <h3
                key={`title-${step}`}
                className="font-display font-bold text-xl sm:text-2xl text-clip-text text-center mb-3"
                style={{ animation: 'clipai-guide-fade-up 0.4s ease-out' }}
              >
                {current.title}
              </h3>

              {/* Body copy */}
              <p
                key={`body-${step}`}
                className="text-clip-muted text-sm sm:text-base leading-relaxed text-center max-w-md mx-auto"
                style={{ animation: 'clipai-guide-fade-up 0.5s ease-out 0.05s both' }}
              >
                {current.body}
              </p>

              {/* CTA (if any) */}
              {current.cta && (
                <div className="mt-5 flex justify-center">
                  <button
                    onClick={() => {
                      handleClose();
                      onNavigate(current.cta!.page);
                    }}
                    className="inline-flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl bg-clip-cyan/15 text-clip-cyan border border-clip-cyan/30 hover:bg-clip-cyan/25 transition-all"
                    style={{ animation: 'clipai-guide-fade-up 0.6s ease-out 0.1s both' }}
                  >
                    {current.cta.label}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Footer — step dots + prev/next */}
            <div className="px-8 pb-6 pt-2 border-t border-white/[0.025] flex items-center justify-between gap-3">
              {/* Prev */}
              <button
                onClick={() => goTo(step - 1)}
                disabled={step === 0}
                aria-label="Previous step"
                className="inline-flex items-center gap-1 text-xs text-clip-muted hover:text-clip-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Prev</span>
              </button>

              {/* Step dots */}
              <div className="flex items-center gap-1.5">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    aria-label={`Go to step ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all ${
                      i === step
                        ? 'w-6 bg-clip-cyan'
                        : i < step
                          ? 'w-1.5 bg-clip-cyan/40'
                          : 'w-1.5 bg-clip-border hover:bg-clip-muted/40'
                    }`}
                  />
                ))}
              </div>

              {/* Next / Got it */}
              {isLast ? (
                <button
                  onClick={handleClose}
                  className="inline-flex items-center gap-1 text-xs font-medium text-clip-cyan hover:text-clip-text transition-colors"
                >
                  <span className="hidden sm:inline">Got it</span>
                  <Check className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => goTo(step + 1)}
                  aria-label="Next step"
                  className="inline-flex items-center gap-1 text-xs text-clip-muted hover:text-clip-text transition-colors"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>

            <style>{`
              @keyframes clipai-guide-progress {
                from { width: 0%; }
                to { width: 100%; }
              }
              @keyframes clipai-guide-pop {
                0% { transform: scale(0.5); opacity: 0; }
                100% { transform: scale(1); opacity: 1; }
              }
              @keyframes clipai-guide-fade-up {
                from { opacity: 0; transform: translateY(8px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>
          </div>
        </div>
      )}
    </>
  );
}
