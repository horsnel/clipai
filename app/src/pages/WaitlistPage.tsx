import { useState } from 'react';
import type { Page } from '../App';
import { Button } from '@/components/ui/button';
import {
  Sparkles, Lock, Mail, Gamepad2, ChevronRight,
  Check, Loader2, Gift, Bell, Trophy, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { joinWaitlist } from '@/services/api';

interface WaitlistPageProps {
  user: { name: string; email: string; plan: 'free' | 'starter' | 'pro' | 'creator' } | null;
  onNavigate: (page: Page, clips?: unknown[]) => void;
}

const GAMES = [
  { id: 'valorant',   label: 'Valorant'    , emoji: '🎯' },
  { id: 'apex',       label: 'Apex Legends', emoji: '🪂' },
  { id: 'fortnite',   label: 'Fortnite'    , emoji: '🏗️' },
  { id: 'minecraft',  label: 'Minecraft'   , emoji: '⛏️' },
  { id: 'roblox',     label: 'Roblox'      , emoji: '🟥' },
  { id: 'cod',        label: 'Call of Duty', emoji: '🎮' },
  { id: 'warzone',    label: 'Warzone'     , emoji: '💀' },
  { id: 'mobile',     label: 'Mobile (PUBG/FF/ML)', emoji: '📱' },
];

export function WaitlistPage({ user, onNavigate }: WaitlistPageProps) {
  const [email, setEmail]       = useState(user?.email ?? '');
  const [game, setGame]         = useState<string>('valorant');
  const [isSubmitting, setSubmitting] = useState(false);
  const [joined, setJoined]     = useState<{ position: number; credits: number } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email');
      return;
    }
    setSubmitting(true);
    try {
      const result = await joinWaitlist(email, game, 'upload_page');
      setJoined({ position: result.position, credits: result.creditsAwarded });
      if (result.creditsAwarded > 0) {
        toast.success(`🎉 ${result.creditsAwarded} credits added to your account!`);
      } else {
        toast.success(result.message);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not join waitlist');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12 relative">
      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-clip-cyan/8 rounded-full blur-[140px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-clip-amber/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-4xl mx-auto">
        {/* Coming Soon badge */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-clip-amber/10 border border-clip-amber/30">
            <Lock className="w-4 h-4 text-clip-amber" />
            <span className="text-clip-amber text-xs font-bold uppercase tracking-wider">
              Coming December 2026 · Early Access
            </span>
          </div>
        </div>

        {/* Headline */}
        <div className="text-center mb-10">
          <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl text-clip-text mb-4">
            The <span className="gradient-text">AI Video Editor</span><br />
            is reloading.
          </h1>
          <p className="text-clip-muted text-lg max-w-2xl mx-auto">
            We're rebuilding the ClipAI editor with auto-cut, beat-sync, vertical reframing, and one-tap TikTok export.
            Join the waitlist — get early access, <span className="text-clip-cyan font-semibold">+25 bonus credits</span> when it ships, and lock in launch pricing.
          </p>
        </div>

        {/* What's coming grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {[
            { icon: Zap,      title: 'Auto-Cut AI',      desc: 'Gemini 2.5 finds your hype moments and snaps cuts to action beats.' },
            { icon: Sparkles, title: 'Beat-Sync Renders', desc: 'Transitions land on the drop. Vertical 9:16 by default.' },
            { icon: Bell,     title: 'One-Tap Export',    desc: 'TikTok, Reels, Shorts — watermark-free on paid plans.' },
          ].map((f) => (
            <div key={f.title} className="card-glass p-5 hover:border-white/[0.12] transition-all">
              <div className="w-10 h-10 rounded-xl bg-clip-cyan/10 flex items-center justify-center mb-3">
                <f.icon className="w-5 h-5 text-clip-cyan" />
              </div>
              <h3 className="font-display font-semibold text-clip-text mb-1">{f.title}</h3>
              <p className="text-clip-muted text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Waitlist form OR success state */}
        {joined ? (
          <div className="card-glass p-8 lg:p-10 text-center max-w-xl mx-auto border-clip-cyan/30">
            <div className="w-16 h-16 rounded-full bg-green-400/10 flex items-center justify-center mx-auto mb-5">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="font-display font-bold text-2xl text-clip-text mb-2">
              You're in! Position #{joined.position}
            </h2>
            {joined.credits > 0 ? (
              <p className="text-clip-muted mb-4">
                <span className="text-clip-cyan font-semibold">+{joined.credits} credits</span> added to your account.
                Use them today on ViralForge, ClipBot, and TrendRadar while you wait.
              </p>
            ) : (
              <p className="text-clip-muted mb-4">
                We'll email you the moment the editor goes live. Share your spot to climb the leaderboard!
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
              <Button onClick={() => onNavigate('forge')} className="btn-primary">
                <Sparkles className="w-4 h-4" /> Try ViralForge Now
              </Button>
              <Button onClick={() => onNavigate('trends')} className="btn-secondary">
                <Trophy className="w-4 h-4" /> See Trend Radar
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card-glass p-6 sm:p-8 max-w-xl mx-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-clip-amber/10 flex items-center justify-center">
                <Gift className="w-5 h-5 text-clip-amber" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-clip-text">Join the Waitlist</h3>
                <p className="text-clip-muted text-sm">+25 credits when the editor launches.</p>
              </div>
            </div>

            <label className="block text-sm font-medium text-clip-text mb-2">Email address</label>
            <div className="relative mb-4">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-clip-muted" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="input-dark pl-12 w-full"
              />
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-clip-text mb-3">
              <Gamepad2 className="w-4 h-4 text-clip-cyan" /> What do you main?
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
              {GAMES.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGame(g.id)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 justify-center ${
                    game === g.id
                      ? 'bg-clip-cyan text-black'
                      : 'bg-clip-surface text-clip-muted hover:text-clip-text border border-white/[0.06]'
                  }`}
                >
                  <span>{g.emoji}</span>
                  <span className="truncate">{g.label}</span>
                </button>
              ))}
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full py-4 text-base disabled:opacity-50"
            >
              {isSubmitting ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Reserving your spot…</>
              ) : (
                <>Reserve My Spot <ChevronRight className="w-5 h-5" /></>
              )}
            </Button>
            <p className="text-clip-muted text-xs text-center mt-3">
              No spam. We email you once when the editor launches.
            </p>
          </form>
        )}

        {/* Perks row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-10 max-w-3xl mx-auto">
          {[
            { icon: Trophy, label: 'Climb the leaderboard while you wait' },
            { icon: Sparkles, label: 'Free ViralForge + ClipBot access today' },
            { icon: Lock, label: 'Lock in launch pricing before it goes up' },
          ].map((p) => (
            <div key={p.label} className="flex items-center gap-2 text-clip-muted text-xs text-center justify-center">
              <p.icon className="w-4 h-4 text-clip-cyan flex-shrink-0" />
              <span>{p.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
