import type { Page } from '../App';
import { Button } from '@/components/ui/button';
import {
  Link2, Flame, Radio, BarChart2,
  Trophy, Scissors, Coins, ArrowRight, Sparkles,
} from 'lucide-react';
import { TopicStealWidget } from '@/components/TopicStealWidget';
import { RecentAnalysesWidget } from '@/components/RecentAnalysesWidget';
import { TrendingVideosSection } from '@/components/TrendingVideosSection';
import { TrendingViewsChart } from '@/components/TrendingViewsChart';
import { ChannelAuditsGrid } from '@/components/ChannelAuditsGrid';
import { GamingFeedWidget } from '@/components/GamingFeedWidget';
import { ToolsGuide } from '@/components/ToolsGuide';
import { DailyInsightCard } from '@/components/DailyInsightCard';
import { setPendingAnalysisId } from '@/lib/navState';
import type { AnalysisSummary } from '../types';

interface DashboardPageProps {
  user: { name: string; email: string; plan: 'free' | 'starter' | 'pro' | 'creator'; credits?: number; clipsUsed?: number; xp?: number } | null;
  onNavigate: (page: Page, clips?: unknown[]) => void;
  onLogout?: () => void;
}

interface FeatureCard {
  page: Page;
  icon: React.ElementType;
  /** Solid colored circle background for the icon (matches screenshot style). */
  iconBg: string;
  label: string;
  desc: string;
  badge?: string;
  badgeColor?: string;
  locked?: boolean;
}

const FEATURE_CARDS: FeatureCard[] = [
  {
    page: 'forge',
    icon: Flame,
    iconBg: 'bg-clip-amber',
    label: 'Viral Forge',
    desc: 'Generate winning titles, captions, hooks and hashtags to boost views.',
    badge: 'HOT',
    badgeColor: 'bg-clip-amber/15 text-clip-amber border-clip-amber/30',
  },
  {
    page: 'trends',
    icon: Radio,
    iconBg: 'bg-green-500',
    label: 'Trend Radar',
    desc: 'Live gaming trends updated every hour so you never miss a wave.',
    badge: 'LIVE',
    badgeColor: 'bg-green-500/15 text-green-500 border-green-500/30',
  },
  {
    page: 'growth',
    icon: BarChart2,
    iconBg: 'bg-blue-500',
    label: 'Growth Intel',
    desc: 'Spy on competitors, A/B test titles and find the best post time.',
  },
  {
    page: 'rank',
    icon: Trophy,
    iconBg: 'bg-purple-500',
    label: 'Creator Rank',
    desc: 'Earn XP, keep streaks, climb ranks and unlock exclusive badges.',
    badge: 'NEW',
    badgeColor: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
  },
  {
    page: 'upload',
    icon: Scissors,
    iconBg: 'bg-clip-muted',
    label: 'Video Export',
    desc: 'AI clip rendering and editing coming soon to every creator.',
    badge: 'SOON',
    badgeColor: 'bg-clip-surface text-clip-muted border-white/[0.06]',
    locked: true,
  },
];

export function DashboardPage({ user, onNavigate, onLogout: _onLogout }: DashboardPageProps) {
  // Read the user's primary game from onboarding localStorage so the gaming
  // feed widget can show news/tweets/reddit for THEIR game (not generic "gaming").
  // Falls back to "gaming" if onboarding wasn't completed yet.
  const primaryGame = (() => {
    try {
      const raw = localStorage.getItem(`clipai_onboarding_${user?.email ?? 'anon'}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.primaryGame) return parsed.primaryGame;
      }
    } catch {}
    return undefined;
  })();

  return (
    <div className="min-h-screen pt-28 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12">
      <div className="max-w-7xl mx-auto">

        {/* Welcome */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-10">
          <div>
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-clip-text mb-2">
              Welcome back, <span className="gradient-text">{user?.name ?? 'Creator'}</span> 👋
            </h1>
            <p className="text-clip-muted">Ready to make your next viral clip?</p>
          </div>
          <Button onClick={() => onNavigate('forge')} className="btn-primary flex items-center gap-2 self-start lg:self-auto">
            <Link2 className="w-5 h-5" /> Paste Video URL
          </Button>
        </div>

        {/* Credits Balance — full-width stat card (Trending Now card removed) */}
        <div className="mb-6">
          <div className={`card-glass p-5 sm:p-6 relative overflow-hidden group hover:border-clip-cyan/30 transition-all ${
            (user?.credits ?? 0) <= 5
              ? 'border-clip-amber/40 bg-clip-amber/5 shadow-[0_0_24px_rgba(255,149,0,0.10)]'
              : 'border-clip-cyan/40 bg-clip-cyan/5 shadow-[0_0_24px_rgba(0,229,255,0.10)]'
          }`}>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 min-w-0">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                  (user?.credits ?? 0) <= 5 ? 'bg-clip-amber/15' : 'bg-clip-cyan/15'
                }`}>
                  <Coins className={`w-6 h-6 ${(user?.credits ?? 0) <= 5 ? 'text-clip-amber' : 'text-clip-cyan'}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-clip-muted text-xs uppercase tracking-wider font-medium">Credits Balance</p>
                  <p className={`font-display font-bold text-3xl tabular-nums leading-tight mt-0.5 ${
                    (user?.credits ?? 0) <= 5 ? 'text-clip-amber' : 'text-white'
                  }`}>
                    {user?.credits ?? 0}
                  </p>
                </div>
              </div>

              {(user?.credits ?? 0) <= 5 ? (
                <button onClick={() => onNavigate('pricing')}
                  className="px-4 py-2 rounded-lg bg-clip-amber text-black text-xs font-semibold hover:brightness-110 flex items-center justify-center gap-2 transition-all">
                  <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
                  Get more credits
                  <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
                </button>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-clip-muted text-xs flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-clip-cyan flex-shrink-0" />
                    1 credit = 1 trend pack
                  </p>
                  <span className={`text-[10px] uppercase tracking-wider font-medium px-2 py-1 rounded ${
                    user?.plan === 'creator' ? 'bg-clip-amber/10 text-clip-amber' :
                    user?.plan === 'pro'     ? 'bg-clip-cyan/10 text-clip-cyan' :
                    user?.plan === 'starter' ? 'bg-blue-500/10 text-blue-500' :
                    'bg-clip-surface text-clip-muted'
                  }`}>
                    {user?.plan ?? 'free'} plan
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Channel Audits Grid (HERO — audited channels as avatar squares) ── */}
        <ChannelAuditsGrid onNavigate={onNavigate} />

        {/* ── Trending Views Chart (graphic table of accumulated views) ── */}
        <div className="mb-10">
          <TrendingViewsChart />
        </div>

        {/* ── Trending Gaming Videos ── */}
        <div className="mb-10">
          <TrendingVideosSection game={primaryGame} />
        </div>

        {/* ── Gaming Feed: official news + dev tweets + reddit (enrichment) ── */}
        <div className="mb-10">
          <GamingFeedWidget game={primaryGame} />
        </div>

        {/* ── AI Tools Grid ──
            Screenshot-style: cards placed besides each other (2-col on mobile,
            3-col on desktop), each card has a solid colored icon circle in the
            top-left, a bold title underneath, and a light-gray description
            below — text is clamped to 2 lines so it never overflows. */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
            <h2 className="font-display font-semibold text-xl text-clip-text">AI Tools</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {FEATURE_CARDS.map(card => (
              <button
                key={card.page}
                onClick={() => !card.locked && onNavigate(card.page)}
                className={`relative text-left rounded-xl p-4 sm:p-5 bg-clip-surface/80 border border-white/[0.10] transition-all duration-300 group flex flex-col gap-3 min-h-[150px] sm:min-h-[168px] ${
                  card.locked
                    ? 'opacity-60 cursor-default'
                    : 'hover:-translate-y-1 hover:border-clip-cyan/50 hover:shadow-[0_0_16px_rgba(0,229,255,0.10)] cursor-pointer'
                }`}
              >
                {/* Badge — top right */}
                {card.badge && (
                  <span className={`absolute top-3 right-3 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 z-10 ${card.badgeColor}`}>
                    {card.badge}
                  </span>
                )}

                {/* Solid colored icon circle — top left */}
                <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${card.iconBg} ${
                  card.locked ? 'opacity-70' : 'group-hover:scale-105 transition-transform'
                }`}>
                  <card.icon className="w-5 h-5 text-white" />
                </div>

                {/* Title */}
                <h3 className="font-display font-bold text-sm sm:text-base text-clip-text leading-tight group-hover:text-clip-cyan transition-colors pr-8">
                  {card.label}
                </h3>

                {/* Description — 2-line clamp, no overflow */}
                <p className="text-xs sm:text-[13px] text-clip-muted leading-relaxed line-clamp-2">
                  {card.desc}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Tools & platform usage guidance for first-time users */}
        <ToolsGuide onNavigate={onNavigate} />

        {/* Topic Steal — anonymized network trends (Phase 1) */}
        <div className="mb-10">
          <TopicStealWidget limit={6} onNavigate={onNavigate} />
        </div>

        {/* Recent Deep Analyses — re-open past URLs instantly (Phase 1) */}
        <div className="mb-10">
          <RecentAnalysesWidget
            limit={5}
            onNavigate={onNavigate}
            onReopen={(a: AnalysisSummary) => {
              // Stash the id so ViralForgePage picks it up on mount, then navigate.
              setPendingAnalysisId(a.id);
              onNavigate('forge');
            }}
          />
        </div>
      </div>

      {/* Daily AI insight pop-up — shows once per day on dashboard load */}
      <DailyInsightCard onNavigate={onNavigate} />
    </div>
  );
}
