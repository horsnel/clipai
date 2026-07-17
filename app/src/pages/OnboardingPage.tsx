/**
 * OnboardingPage.tsx — Multi-step onboarding shown after signup.
 *
 * 4 steps:
 *   1. Primary game (single-select from popular games + custom input)
 *   2. Platform focus (multi-select: YouTube, TikTok, X, Instagram)
 *   3. Content goal (single-select: Growth, Monetize, Hobby, Brand)
 *   4. Experience level (single-select: New, Casual, Pro, Veteran)
 *
 * On Finish:
 *   - Persist selections to localStorage (per-user key)
 *   - Set a `clipai_onboarding_complete_<email>` flag
 *   - Call onComplete() which navigates to the dashboard
 *
 * Skippable: "Skip" link in the top-right marks onboarding complete without
 * saving selections (still navigates to dashboard).
 *
 * Re-accessible: the flag is per-user-email, so signing out + signing back
 * in with a different account will trigger onboarding again for that account.
 */
import { useState } from 'react';
import type { Page } from '../App';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, ArrowLeft, Check, X, Gamepad2, Trophy,
  TrendingUp, DollarSign, Heart, Building2,
  Sparkles, Zap, Bot, Flame,
} from 'lucide-react';
import { toast } from 'sonner';
import { saveOnboarding } from '@/services/api';
import { InfoIconPopup } from '@/components/InfoIconPopup';
import { PlatformIcon, GameIcon } from '@/components/BrandIcons';
import type { PlatformId } from '@/components/BrandIcons';

interface OnboardingPageProps {
  user: { name: string; email: string } | null;
  onNavigate: (page: Page) => void;
  onComplete: () => void;
}

type Step = 0 | 1 | 2 | 3;

interface OnboardingData {
  primaryGame: string;
  platforms: string[];
  goal: string;
  experience: string;
}

const POPULAR_GAMES = [
  { name: 'Free Fire' },
  { name: 'Bloodstrike' },
  { name: 'Call of Duty' },
  { name: 'Valorant' },
  { name: 'Fortnite' },
  { name: 'Apex Legends' },
  { name: 'Mobile Legends' },
  { name: 'FIFA' },
  { name: 'Minecraft' },
  { name: 'GTA V' },
  { name: 'Roblox' },
  { name: 'PUBG' },
];

const PLATFORMS: Array<{ id: PlatformId; label: string; color: string; bg: string }> = [
  { id: 'youtube',   label: 'YouTube',     color: 'text-red-500',          bg: 'hover:bg-red-500/10 hover:border-red-500/40' },
  { id: 'tiktok',    label: 'TikTok',      color: 'text-clip-cyan',        bg: 'hover:bg-cyan-500/10 hover:border-cyan-500/40' },
  { id: 'twitter',   label: 'X',           color: 'text-slate-300',        bg: 'hover:bg-slate-500/10 hover:border-slate-400/40' },
  { id: 'instagram', label: 'Instagram',   color: 'text-pink-400',         bg: 'hover:bg-pink-500/10 hover:border-pink-500/40' },
];

const GOALS = [
  { id: 'growth',    label: 'Grow my channel',     desc: 'More views, subs, followers',     icon: TrendingUp, color: 'text-green-600',     bg: 'hover:bg-green-500/10 hover:border-green-500/40' },
  { id: 'monetize',  label: 'Make money',          desc: 'Monetize content & sponsorships', icon: DollarSign, color: 'text-clip-amber',    bg: 'hover:bg-amber-500/10 hover:border-amber-500/40' },
  { id: 'hobby',     label: 'Just for fun',        desc: 'Hobby & community',                icon: Heart,      color: 'text-pink-500',      bg: 'hover:bg-pink-500/10 hover:border-pink-500/40' },
  { id: 'brand',     label: 'Build my brand',      desc: 'Personal brand & influence',       icon: Building2,  color: 'text-blue-500',      bg: 'hover:bg-blue-500/10 hover:border-blue-500/40' },
];

const EXPERIENCE = [
  { id: 'new',       label: 'New creator',         desc: 'Just starting out',                icon: Sparkles, color: 'text-clip-cyan' },
  { id: 'casual',    label: 'Casual',              desc: 'Posting occasionally',             icon: Zap,      color: 'text-clip-amber' },
  { id: 'pro',       label: 'Semi-pro',            desc: 'Posting regularly',                icon: Flame,    color: 'text-red-500' },
  { id: 'veteran',   label: 'Veteran',             desc: 'Years of experience',              icon: Trophy,   color: 'text-purple-500' },
];

const STEPS = ['Game', 'Platforms', 'Goal', 'Experience'];

export function OnboardingPage({ user, onNavigate: _onNavigate, onComplete }: OnboardingPageProps) {
  const [step, setStep] = useState<Step>(0);
  const [data, setData] = useState<OnboardingData>({
    primaryGame: '',
    platforms: [],
    goal: '',
    experience: '',
  });
  const [customGame, setCustomGame] = useState('');

  const storageKey = `clipai_onboarding_${user?.email ?? 'anon'}`;
  const flagKey    = `clipai_onboarding_complete_${user?.email ?? 'anon'}`;

  const finish = (skipped: boolean = false) => {
    try {
      if (!skipped) {
        localStorage.setItem(storageKey, JSON.stringify(data));
        // Fire-and-forget backend persistence — falls back to localStorage on error.
        // We don't await this; the user shouldn't wait on a network call to land
        // on their dashboard. Errors are silently ignored (localStorage is the
        // source of truth for the client, the DB copy is for server-side
        // personalisation later).
        saveOnboarding(data).catch(() => {/* localStorage fallback already wrote */});
      }
      localStorage.setItem(flagKey, '1');
    } catch {}
    toast.success(skipped ? 'Onboarding skipped' : `Welcome aboard, ${user?.name ?? 'Creator'}! 🚀`);
    onComplete();
  };

  const canProceed = () => {
    if (step === 0) return data.primaryGame !== '';
    if (step === 1) return data.platforms.length > 0;
    if (step === 2) return data.goal !== '';
    if (step === 3) return data.experience !== '';
    return false;
  };

  const next = () => {
    if (!canProceed()) {
      toast.error('Please make a selection to continue');
      return;
    }
    if (step < 3) setStep((step + 1) as Step);
    else finish(false);
  };

  const back = () => {
    if (step > 0) setStep((step - 1) as Step);
  };

  const selectGame = (game: string) => {
    setData(prev => ({ ...prev, primaryGame: game }));
    setCustomGame('');
  };

  const togglePlatform = (id: string) => {
    setData(prev => ({
      ...prev,
      platforms: prev.platforms.includes(id)
        ? prev.platforms.filter(p => p !== id)
        : [...prev.platforms, id],
    }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-20 px-4 relative">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-clip-cyan/3 rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/3 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-xl relative z-10">
        {/* Top bar — progress + skip */}
        <div className="flex items-center justify-between mb-8">
          {/* Progress dots */}
          <div className="flex items-center gap-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${
                    i < step
                      ? 'bg-clip-cyan text-black'
                      : i === step
                      ? 'bg-clip-cyan/20 text-clip-cyan border border-clip-cyan/50'
                      : 'bg-clip-surface text-clip-muted border border-white/[0.025]'
                  }`}
                >
                  {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-6 h-px ${i < step ? 'bg-clip-cyan' : 'bg-white/[0.05]'}`} />
                )}
              </div>
            ))}
          </div>

          {/* Skip */}
          <button
            onClick={() => finish(true)}
            className="text-clip-muted hover:text-clip-text text-xs transition-colors flex items-center gap-1"
          >
            Skip <X className="w-3 h-3" />
          </button>
        </div>

        {/* Card */}
        <div className="card-glass p-6 sm:p-8">
          {/* Step 0: Game */}
          {step === 0 && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-clip-cyan/15 flex items-center justify-center">
                  <Gamepad2 className="w-5 h-5 text-clip-cyan" />
                </div>
                <h2 className="font-display font-bold text-xl text-clip-text">
                  What do you play?
                </h2>
                <InfoIconPopup label="Why we ask" size="sm" className="ml-1">
                  Pick your primary game — we'll tailor trends, hashtags & titles to it.
                </InfoIconPopup>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {POPULAR_GAMES.map(g => (
                  <button
                    key={g.name}
                    onClick={() => selectGame(g.name)}
                    className={`p-3 rounded-xl border text-sm font-medium transition-all flex items-center gap-2 ${
                      data.primaryGame === g.name
                        ? 'bg-clip-cyan/15 border-clip-cyan/50 text-clip-cyan'
                        : 'bg-clip-surface border-white/[0.025] text-clip-text hover:border-white/[0.06]'
                    }`}
                  >
                    <GameIcon game={g.name} className="w-5 h-5 flex-shrink-0" />
                    <span className="truncate">{g.name}</span>
                  </button>
                ))}
              </div>
              {/* Custom game */}
              <div className="mt-4">
                <label className="block text-xs text-clip-muted mb-2 uppercase tracking-wider">
                  Or type your own
                </label>
                <input
                  type="text"
                  value={customGame}
                  onChange={(e) => {
                    setCustomGame(e.target.value);
                    setData(prev => ({ ...prev, primaryGame: e.target.value }));
                  }}
                  placeholder="e.g. Genshin Impact, Pokémon, etc."
                  className="input-dark w-full"
                />
              </div>
            </div>
          )}

          {/* Step 1: Platforms */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-clip-cyan/15 flex items-center justify-center">
                  <PlatformIcon platform="youtube" className="w-5 h-5 text-clip-cyan" />
                </div>
                <h2 className="font-display font-bold text-xl text-clip-text">
                  Where do you post?
                </h2>
                <InfoIconPopup label="Why we ask" size="sm" className="ml-1">
                  Pick all the platforms you create content for. We'll tune caption length & hashtags per platform.
                </InfoIconPopup>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PLATFORMS.map(p => {
                  const selected = data.platforms.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePlatform(p.id)}
                      className={`p-4 rounded-xl border flex items-center gap-3 transition-all text-left ${
                        selected
                          ? `bg-clip-cyan/15 border-clip-cyan/50 ${p.bg}`
                          : `bg-clip-surface border-white/[0.025] ${p.bg}`
                      }`}
                    >
                      <PlatformIcon platform={p.id} className={`w-6 h-6 ${p.color} flex-shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-clip-text">{p.label}</p>
                      </div>
                      {selected && (
                        <Check className="w-5 h-5 text-clip-cyan flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Goal */}
          {step === 2 && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-clip-cyan/15 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-clip-cyan" />
                </div>
                <h2 className="font-display font-bold text-xl text-clip-text">
                  What's your main goal?
                </h2>
                <InfoIconPopup label="Why we ask" size="sm" className="ml-1">
                  We'll prioritise features & suggestions based on what you're trying to achieve.
                </InfoIconPopup>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {GOALS.map(g => {
                  const selected = data.goal === g.id;
                  const Icon = g.icon;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setData(prev => ({ ...prev, goal: g.id }))}
                      className={`p-4 rounded-xl border flex items-start gap-3 transition-all text-left ${
                        selected
                          ? `bg-clip-cyan/15 border-clip-cyan/50 ${g.bg}`
                          : `bg-clip-surface border-white/[0.025] ${g.bg}`
                      }`}
                    >
                      <Icon className={`w-6 h-6 ${g.color} flex-shrink-0 mt-0.5`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-clip-text">{g.label}</p>
                        <p className="text-xs text-clip-muted mt-0.5">{g.desc}</p>
                      </div>
                      {selected && (
                        <Check className="w-5 h-5 text-clip-cyan flex-shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Experience */}
          {step === 3 && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-clip-cyan/15 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-clip-cyan" />
                </div>
                <h2 className="font-display font-bold text-xl text-clip-text">
                  How experienced are you?
                </h2>
                <InfoIconPopup label="Why we ask" size="sm" className="ml-1">
                  This helps us calibrate the complexity of suggestions we give you.
                </InfoIconPopup>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EXPERIENCE.map(e => {
                  const selected = data.experience === e.id;
                  const Icon = e.icon;
                  return (
                    <button
                      key={e.id}
                      onClick={() => setData(prev => ({ ...prev, experience: e.id }))}
                      className={`p-4 rounded-xl border flex items-start gap-3 transition-all text-left ${
                        selected
                          ? 'bg-clip-cyan/15 border-clip-cyan/50'
                          : 'bg-clip-surface border-white/[0.025] hover:border-white/[0.06]'
                      }`}
                    >
                      <Icon className={`w-6 h-6 ${e.color} flex-shrink-0 mt-0.5`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-clip-text">{e.label}</p>
                        <p className="text-xs text-clip-muted mt-0.5">{e.desc}</p>
                      </div>
                      {selected && (
                        <Check className="w-5 h-5 text-clip-cyan flex-shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer nav */}
          <div className="flex items-center justify-between gap-3 mt-7 pt-5 border-t border-white/[0.025]">
            <button
              onClick={back}
              disabled={step === 0}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                step === 0
                  ? 'text-clip-muted/40 cursor-not-allowed'
                  : 'text-clip-muted hover:text-clip-text'
              }`}
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            <div className="flex items-center gap-1.5 text-clip-muted text-xs">
              <Bot className="w-3.5 h-3.5 text-clip-cyan" />
              <span>ClipAI will personalise your dashboard</span>
            </div>

            <Button
              onClick={next}
              disabled={!canProceed()}
              className="btn-primary py-2.5 px-5 flex items-center gap-2 text-sm"
            >
              {step === 3 ? (
                <>
                  <Check className="w-4 h-4" /> Finish
                </>
              ) : (
                <>
                  Next <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Helper text */}
        <p className="text-center text-clip-muted text-xs mt-5">
          You can change these anytime in Settings
        </p>
      </div>
    </div>
  );
}
