import type { Page } from '../App';
import { Button } from '@/components/ui/button';
import {
  Link2, Flame, Radio, BarChart2,
  Trophy, Scissors, ChevronRight, Coins, ArrowRight, Sparkles,
} from 'lucide-react';
import { TopicStealWidget } from '@/components/TopicStealWidget';
import { RecentAnalysesWidget } from '@/components/RecentAnalysesWidget';
import { TrendingVideosSection } from '@/components/TrendingVideosSection';
import { TrendingViewsChart } from '@/components/TrendingViewsChart';
import { ChannelAuditsGrid } from '@/components/ChannelAuditsGrid';
import { InfoIconPopup } from '@/components/InfoIconPopup';
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
  iconColor: string;
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
    iconColor: 'text-clip-amber',
    iconBg: 'bg-clip-amber/10',
    label: 'Viral Forge',
    desc: 'AI titles, captions, hooks & hashtags',
    badge: 'HOT',
    badgeColor: 'bg-clip-amber/10 text-clip-amber border-clip-amber/20',
  },
  {
    page: 'trends',
    icon: Radio,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-500/10',
    label: 'Trend Radar',
    desc: 'Live gaming trends updated every hour',
    badge: 'LIVE',
    badgeColor: 'bg-green-500/10 text-green-600 border-green-500/20',
  },
  {
    page: 'growth',
    icon: BarChart2,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-500/10',
    label: 'Growth Intel',
    desc: 'Competitor spy, A/B titles & timing',
  },
  {
    page: 'rank',
    icon: Trophy,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-500/10',
    label: 'Creator Rank',
    desc: 'XP, streaks, ranks & badges',
    badge: 'NEW',
    badgeColor: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  },
  {
    page: 'upload',
    icon: Scissors,
    iconColor: 'text-clip-muted',
    iconBg: 'bg-clip-surface',
    label: 'Video Export',
    desc: 'AI clip rendering & editing',
    badge: 'SOON',
    badgeColor: 'bg-clip-surface text-clip-muted border-white/[0.02]',
    locked: true,
  },
];

export function DashboardPage({ user, onNavigate, onLogout: _onLogout }: DashboardPageProps) {
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
          <div className={`card-glass p-5 sm:p-6 relative overflow-hidden group hover:border-white/[0.10] transition-all ${
            (user?.credits ?? 0) <= 5
              ? 'border-clip-amber/30 bg-clip-amber/3'
              : 'border-clip-cyan/20 bg-clip-cyan/3'
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
                    (user?.credits ?? 0) <= 5 ? 'text-clip-amber' : 'text-clip-text'
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

        {/* ── Trending Views chart ── */}
        <div className="mb-10">
          <TrendingViewsChart />
        </div>

        {/* ── Trending Gaming Videos ── */}
        <div className="mb-10">
          <TrendingVideosSection />
        </div>

        {/* ── Feature Grid ── */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
            <h2 className="font-display font-semibold text-xl text-clip-text">AI Tools</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURE_CARDS.map(card => (
              <button
                key={card.page}
                onClick={() => onNavigate(card.page)}
                className={`card-glass p-5 text-left hover:-translate-y-1 transition-all duration-300 group relative ${
                  card.locked
                    ? 'opacity-60 cursor-default hover:translate-y-0'
                    : 'hover:border-white/[0.14] cursor-pointer'
                }`}
              >
                {/* Badge */}
                {card.badge && (
                  <span className={`absolute top-3 right-3 text-xs px-1.5 py-0.5 rounded border font-bold flex-shrink-0 z-10 ${card.badgeColor}`}>
                    {card.badge}
                  </span>
                )}

                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${card.iconBg}`}>
                  <card.icon className={`w-5 h-5 ${card.iconColor}`} />
                </div>
                <div className="flex items-center mb-1 pr-10">
                  <span className="font-display font-semibold text-clip-text group-hover:text-clip-cyan transition-colors">
                    {card.label}
                  </span>
                  <InfoIconPopup label={`What is ${card.label}?`} size="sm" className="ml-1">
                    {card.desc}
                  </InfoIconPopup>
                </div>

                {!card.locked && (
                  <div className="flex items-center gap-1 mt-3 text-clip-cyan text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    Open <ChevronRight className="w-3 h-3" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

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
    </div>
  );
}
