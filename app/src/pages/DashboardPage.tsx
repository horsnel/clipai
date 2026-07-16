import { useState, useEffect } from 'react';
import type { Page } from '../App';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Zap, Upload, TrendingUp, Clock, Play,
  ExternalLink, Sparkles, Radio, Flame, Bot,
  Trophy, BarChart2, Scissors, ChevronRight, Coins, ArrowRight,
} from 'lucide-react';
import { listClips } from '@/services/api';

interface DashboardPageProps {
  user: { name: string; email: string; plan: 'free' | 'starter' | 'pro' | 'creator'; credits?: number; clipsUsed?: number; xp?: number } | null;
  onNavigate: (page: Page, clips?: unknown[]) => void;
  onLogout?: () => void;
}

interface Clip {
  id: string; thumbnail: string; title: string; game: string;
  hypeScore: number; duration: string; createdAt: string; status: 'ready' | 'processing';
}

const FALLBACK_CLIPS: Clip[] = [
  { id:'1', thumbnail:'/gameplay-thumb-1.jpg', title:'Epic Multi-Kill',          game:'Call of Duty',   hypeScore:96, duration:'0:32', createdAt:'2 hours ago',  status:'ready' },
  { id:'2', thumbnail:'/gameplay-thumb-2.jpg', title:'Clutch Victory',           game:'Bloodstrike',    hypeScore:88, duration:'0:45', createdAt:'5 hours ago',  status:'ready' },
  { id:'3', thumbnail:'/gameplay-thumb-3.jpg', title:'Team Fight Domination',    game:'Mobile Legends', hypeScore:92, duration:'0:28', createdAt:'1 day ago',    status:'ready' },
];

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
    page: 'clipbot',
    icon: Bot,
    iconColor: 'text-clip-cyan',
    iconBg: 'bg-clip-cyan/10',
    label: 'ClipBot',
    desc: 'Your personal AI content coach',
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
    page: 'growth',
    icon: BarChart2,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-500/10',
    label: 'Growth Intel',
    desc: 'Competitor spy, A/B titles & timing',
  },
  {
    page: 'upload',
    icon: Scissors,
    iconColor: 'text-clip-muted',
    iconBg: 'bg-clip-surface',
    label: 'Video Export',
    desc: 'AI clip rendering & editing',
    badge: 'SOON',
    badgeColor: 'bg-clip-surface text-clip-muted border-white/[0.05]',
    locked: true,
  },
];

export function DashboardPage({ user, onNavigate, onLogout: _onLogout }: DashboardPageProps) {
  const [clips, setClips] = useState<Clip[]>(FALLBACK_CLIPS);

  // ─── Fetch real clips from worker ────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    listClips().then((data) => {
      if (!mounted || !data.clips?.length) return;
      const mapped: Clip[] = data.clips.slice(0, 3).map(c => ({
        id: c.id,
        thumbnail: '/gameplay-thumb-' + (((parseInt(c.id.slice(0, 2), 16) || 0) % 3) + 1) + '.jpg',
        title: c.title || 'Untitled clip',
        game: c.game || 'Gaming',
        hypeScore: c.hype_score || 80,
        duration: c.duration_seconds ? `${Math.floor(c.duration_seconds / 60)}:${String(c.duration_seconds % 60).padStart(2, '0')}` : '0:30',
        createdAt: new Date(c.created_at).toLocaleDateString(),
        status: c.status === 'ready' ? 'ready' : 'processing',
      }));
      setClips(mapped);
    }).catch(() => {/* fallback stays */});
    return () => { mounted = false; };
  }, []);

  const PLAN_LIMITS = {
    free:    { clips: 3,        label: 'Free'    },
    starter: { clips: 30,       label: 'Starter' },
    pro:     { clips: 100,      label: 'Pro'     },
    creator: { clips: Infinity, label: 'Creator' },
  };

  const currentPlan  = PLAN_LIMITS[user?.plan ?? 'free'];
  const clipsUsed    = user?.clipsUsed ?? clips.length;
  const usagePercent = currentPlan.clips === Infinity ? 0 : (clipsUsed / currentPlan.clips) * 100;
  const remaining    = currentPlan.clips === Infinity ? '∞' : Math.max(0, currentPlan.clips - clipsUsed);

  const getHypeBadge = (score: number) => {
    if (score >= 90) return <span className="hype-badge-gold">{score} HYPE</span>;
    if (score >= 70) return <span className="hype-badge-blue">{score} HYPE</span>;
    return <span className="hype-badge-gray">{score} HYPE</span>;
  };

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
          <Button onClick={() => onNavigate('upload')} className="btn-primary flex items-center gap-2 self-start lg:self-auto">
            <Upload className="w-5 h-5" /> Upload Gameplay
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-10">
          <div className="card-glass p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-clip-cyan/10 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-clip-cyan" />
                </div>
                <div className="min-w-0">
                  <p className="text-clip-muted text-sm">Clips This Month</p>
                  <p className="font-display font-semibold text-clip-text">
                    {clipsUsed} / {currentPlan.clips === Infinity ? '∞' : currentPlan.clips}
                  </p>
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded font-medium flex-shrink-0 ${
                user?.plan === 'creator' ? 'bg-clip-amber text-black' :
                user?.plan === 'pro'     ? 'bg-clip-cyan text-black' :
                user?.plan === 'starter' ? 'bg-blue-500/20 text-blue-600' :
                'bg-clip-surface text-clip-muted border border-white/[0.05]'
              }`}>
                {currentPlan.label.toUpperCase()}
              </span>
            </div>
            <Progress value={usagePercent} className="h-2 bg-clip-surface" />
            <p className="text-clip-muted text-xs mt-2">
              {currentPlan.clips === Infinity
                ? 'Unlimited clips on your Creator plan!'
                : `${remaining} remaining this month`}
            </p>
          </div>

          <div className="card-glass p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-2 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-clip-muted text-sm">Total Views</p>
                <p className="font-display font-semibold text-2xl text-clip-text">24.5K</p>
              </div>
            </div>
            <p className="text-green-600 text-xs flex items-center gap-1">
              <TrendingUp className="w-3 h-3 flex-shrink-0" /> +12% from last week
            </p>
          </div>

          {/* Credits card — replaces "Current Plan" (plan name already shown in chip on card 1) */}
          <div className={`card-glass p-5 sm:p-6 relative overflow-hidden ${
            (user?.credits ?? 0) <= 5
              ? 'border-clip-amber/30 bg-clip-amber/5'
              : 'border-clip-cyan/20 bg-clip-cyan/5'
          }`}>
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  (user?.credits ?? 0) <= 5 ? 'bg-clip-amber/15' : 'bg-clip-cyan/15'
                }`}>
                  <Coins className={`w-5 h-5 ${(user?.credits ?? 0) <= 5 ? 'text-clip-amber' : 'text-clip-cyan'}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-clip-muted text-sm">Credits Balance</p>
                  <p className={`font-display font-bold text-2xl tabular-nums ${
                    (user?.credits ?? 0) <= 5 ? 'text-clip-amber' : 'text-clip-text'
                  }`}>
                    {user?.credits ?? 0}
                  </p>
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded font-medium capitalize flex-shrink-0 ${
                user?.plan === 'creator' ? 'bg-clip-amber text-black' :
                user?.plan === 'pro'     ? 'bg-clip-cyan text-black' :
                user?.plan === 'starter' ? 'bg-blue-500/20 text-blue-600' :
                'bg-clip-surface text-clip-muted border border-white/[0.05]'
              }`}>
                {(user?.plan ?? 'free')} plan
              </span>
            </div>
            {(user?.credits ?? 0) <= 5 ? (
              <button onClick={() => onNavigate('pricing')}
                className="w-full mt-2 px-3 py-2 rounded-lg bg-clip-amber text-black text-sm font-semibold hover:brightness-110 flex items-center justify-center gap-2 transition-all">
                <Sparkles className="w-4 h-4 flex-shrink-0" />
                Get more credits
                <ArrowRight className="w-4 h-4 flex-shrink-0" />
              </button>
            ) : (
              <p className="text-clip-muted text-xs mt-1 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-clip-cyan flex-shrink-0" />
                1 credit = 1 trend pack or ClipBot msg · 2 = ViralForge
              </p>
            )}
          </div>
        </div>

        {/* ── Feature Grid ── */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
            <h2 className="font-display font-semibold text-xl text-clip-text">AI Tools</h2>
            <span className="text-clip-muted text-xs sm:text-sm">All powered by ClipAI</span>
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
                <p className="font-display font-semibold text-clip-text mb-1 group-hover:text-clip-cyan transition-colors pr-10">
                  {card.label}
                </p>
                <p className="text-clip-muted text-sm leading-snug">{card.desc}</p>

                {!card.locked && (
                  <div className="flex items-center gap-1 mt-3 text-clip-cyan text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                    Open <ChevronRight className="w-3 h-3" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Recent Clips */}
        <div>
          <div className="flex items-center justify-between mb-6 gap-4">
            <h2 className="font-display font-semibold text-xl text-clip-text">Recent Clips</h2>
            <button onClick={() => onNavigate('results')}
              className="text-clip-cyan text-sm hover:underline flex items-center gap-1 flex-shrink-0">
              View All <ExternalLink className="w-4 h-4" />
            </button>
          </div>

          {clips.length === 0 ? (
            <div className="card-glass p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-clip-cyan/10 flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-clip-cyan" />
              </div>
              <h3 className="font-display font-semibold text-xl text-clip-text mb-2">No clips yet</h3>
              <p className="text-clip-muted mb-6">Upload your first gameplay and let AI find your highlights!</p>
              <Button onClick={() => onNavigate('upload')} className="btn-primary">
                <Upload className="w-5 h-5 mr-2" /> Upload Video
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {clips.map(clip => (
                <div key={clip.id} onClick={() => onNavigate('results')}
                  className="card-glass overflow-hidden cursor-pointer group hover:-translate-y-1 hover:border-white/[0.07] transition-all duration-300">
                  <div className="relative aspect-video overflow-hidden">
                    <img src={clip.thumbnail} alt={clip.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-clip-dark/80 via-transparent to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-14 h-14 rounded-full bg-clip-cyan/90 flex items-center justify-center backdrop-blur-sm">
                        <Play className="w-6 h-6 text-black ml-1" />
                      </div>
                    </div>
                    <div className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium">
                      {clip.duration}
                    </div>
                    <div className="absolute top-3 left-3">{getHypeBadge(clip.hypeScore)}</div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-display font-medium text-clip-text mb-1 truncate">{clip.title}</h3>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-clip-muted text-sm truncate">{clip.game}</span>
                      <span className="text-clip-muted text-xs flex items-center gap-1 flex-shrink-0">
                        <Clock className="w-3 h-3" /> {clip.createdAt}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
