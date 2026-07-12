import { useState, useEffect, useCallback } from 'react';
import type { Page } from '../App';
import {
  TrendingUp, Flame, Hash, Music, RefreshCw,
  ChevronUp, ChevronDown, Minus, Zap, Globe, Clock,
} from 'lucide-react';
import { toast } from 'sonner';

interface TrendRadarPageProps {
  user: { name: string; email: string; plan: 'free' | 'starter' | 'pro' | 'creator' } | null;
  onNavigate: (page: Page, data?: unknown[]) => void;
}

type TrendStatus = 'rising' | 'peaked' | 'falling';

interface TrendItem {
  id: string;
  name: string;
  category: 'title' | 'hashtag' | 'sound' | 'challenge';
  game: string;
  score: number;
  change: number;
  status: TrendStatus;
  views?: string;
  example?: string;
}

interface TrendData {
  trends: TrendItem[];
  updatedAt: string;
  game: string;
}

const GAMES = ['All Games', 'Call of Duty', 'Bloodstrike', 'PUBG', 'Mobile Legends', 'Free Fire'];

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const StatusIcon = ({ status }: { status: TrendStatus }) => {
  if (status === 'rising')  return <ChevronUp className="w-4 h-4 text-green-400" />;
  if (status === 'peaked')  return <Minus className="w-4 h-4 text-clip-amber" />;
  return <ChevronDown className="w-4 h-4 text-red-400" />;
};

const StatusColor: Record<TrendStatus, string> = {
  rising:  'text-green-400 bg-green-400/10',
  peaked:  'text-clip-amber bg-clip-amber/10',
  falling: 'text-red-400 bg-red-400/10',
};

const CategoryIcon = ({ cat }: { cat: TrendItem['category'] }) => {
  if (cat === 'hashtag')   return <Hash className="w-4 h-4 text-clip-cyan" />;
  if (cat === 'sound')     return <Music className="w-4 h-4 text-purple-400" />;
  if (cat === 'challenge') return <Flame className="w-4 h-4 text-clip-amber" />;
  return <TrendingUp className="w-4 h-4 text-green-400" />;
};

export function TrendRadarPage({ user, onNavigate }: TrendRadarPageProps) {
  const [selectedGame, setSelectedGame]   = useState('All Games');
  const [activeTab, setActiveTab]         = useState<TrendItem['category'] | 'all'>('all');
  const [trendData, setTrendData]         = useState<TrendData | null>(null);
  const [isLoading, setIsLoading]         = useState(false);
  const [lastRefresh, setLastRefresh]     = useState<Date | null>(null);

  const fetchTrends = useCallback(async () => {
    setIsLoading(true);
    try {
      const game = selectedGame === 'All Games' ? '' : selectedGame;
      const res  = await fetch(`${API_BASE}/trends?game=${encodeURIComponent(game)}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setTrendData(data);
      setLastRefresh(new Date());
    } catch {
      toast.error('Could not load live trends. Showing cached data.');
      // Fallback data so the UI never looks empty
      setTrendData(getFallbackData(selectedGame));
      setLastRefresh(new Date());
    } finally {
      setIsLoading(false);
    }
  }, [selectedGame]);

  useEffect(() => { fetchTrends(); }, [fetchTrends]);

  const filtered = trendData?.trends.filter(t =>
    activeTab === 'all' ? true : t.category === activeTab
  ) ?? [];

  const topRising = trendData?.trends
    .filter(t => t.status === 'rising')
    .sort((a, b) => b.score - a.score)
    .slice(0, 3) ?? [];

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 text-xs font-medium uppercase tracking-wider">Live</span>
            </div>
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-clip-text">
              Trend <span className="gradient-text">Radar</span>
            </h1>
            <p className="text-clip-muted mt-1">
              What's blowing up in gaming content RIGHT NOW
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-clip-muted text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchTrends}
              disabled={isLoading}
              className="btn-secondary flex items-center gap-2 text-sm px-4 py-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Top Rising — highlight row */}
        {topRising.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {topRising.map((t, i) => (
              <div key={t.id} className="card-glass p-4 border-green-400/20 bg-green-400/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-green-400/5 rounded-full -translate-y-4 translate-x-4" />
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-green-400 font-bold text-lg">#{i + 1}</span>
                  <span className="text-green-400 text-xs px-2 py-0.5 rounded-full bg-green-400/10 font-medium">🔥 HOT</span>
                </div>
                <p className="font-display font-semibold text-clip-text truncate">{t.name}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-clip-muted text-xs capitalize">{t.category}</span>
                  <span className="text-green-400 text-xs font-mono">+{t.change}%</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {/* Game filter */}
          <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
            {GAMES.map(g => (
              <button key={g} onClick={() => setSelectedGame(g)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                  selectedGame === g
                    ? 'bg-clip-cyan text-black'
                    : 'bg-clip-surface text-clip-muted hover:text-clip-text border border-white/[0.06]'
                }`}>
                {g}
              </button>
            ))}
          </div>

          {/* Category tabs */}
          <div className="flex gap-2">
            {(['all', 'title', 'hashtag', 'sound', 'challenge'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium uppercase tracking-wide transition-all ${
                  activeTab === tab
                    ? 'bg-clip-surface border border-clip-cyan/50 text-clip-cyan'
                    : 'text-clip-muted hover:text-clip-text'
                }`}>
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Trends table */}
        <div className="card-glass overflow-hidden">
          <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-clip-cyan" />
              <span className="text-sm font-medium text-clip-text">
                {filtered.length} trends tracked
              </span>
            </div>
            {isLoading && (
              <div className="flex items-center gap-2 text-clip-muted text-xs">
                <div className="w-3 h-3 border border-clip-cyan border-t-transparent rounded-full animate-spin" />
                Fetching live data…
              </div>
            )}
          </div>

          <div className="divide-y divide-white/[0.04]">
            {filtered.length === 0 && !isLoading ? (
              <div className="p-12 text-center text-clip-muted">
                <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No trends found for this filter.</p>
              </div>
            ) : filtered.map((trend, idx) => (
              <div key={trend.id}
                className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors group">
                {/* Rank */}
                <span className="text-clip-muted font-mono text-sm w-6 flex-shrink-0">
                  {String(idx + 1).padStart(2, '0')}
                </span>

                {/* Category icon */}
                <div className="w-8 h-8 rounded-lg bg-clip-surface flex items-center justify-center flex-shrink-0">
                  <CategoryIcon cat={trend.category} />
                </div>

                {/* Name + game */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-clip-text truncate group-hover:text-clip-cyan transition-colors">
                    {trend.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-clip-muted text-xs capitalize">{trend.category}</span>
                    {trend.game && trend.game !== 'All' && (
                      <>
                        <span className="text-white/20">·</span>
                        <span className="text-clip-muted text-xs">{trend.game}</span>
                      </>
                    )}
                    {trend.example && (
                      <>
                        <span className="text-white/20">·</span>
                        <span className="text-clip-muted text-xs italic truncate max-w-[180px]">{trend.example}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Views */}
                {trend.views && (
                  <span className="text-clip-muted text-xs font-mono hidden sm:block flex-shrink-0">
                    {trend.views}
                  </span>
                )}

                {/* Score bar */}
                <div className="w-20 hidden md:block flex-shrink-0">
                  <div className="h-1.5 bg-clip-surface rounded-full overflow-hidden">
                    <div
                      className="h-full bg-clip-cyan rounded-full transition-all duration-500"
                      style={{ width: `${trend.score}%` }}
                    />
                  </div>
                  <p className="text-clip-muted text-xs mt-1 text-right font-mono">{trend.score}</p>
                </div>

                {/* Status */}
                <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium flex-shrink-0 ${StatusColor[trend.status]}`}>
                  <StatusIcon status={trend.status} />
                  {trend.status}
                </div>

                {/* Change % */}
                <span className={`text-xs font-mono w-14 text-right flex-shrink-0 ${
                  trend.change > 0 ? 'text-green-400' : trend.change < 0 ? 'text-red-400' : 'text-clip-muted'
                }`}>
                  {trend.change > 0 ? '+' : ''}{trend.change}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Upgrade CTA for free users */}
        {user?.plan === 'free' && (
          <div className="mt-6 card-glass p-5 border-clip-amber/20 bg-clip-amber/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-clip-amber flex-shrink-0" />
              <div>
                <p className="text-clip-text font-medium text-sm">Unlock hourly trend updates + sound tracker</p>
                <p className="text-clip-muted text-xs">Free plan refreshes every 24h. Pro refreshes every hour.</p>
              </div>
            </div>
            <button onClick={() => onNavigate('pricing')}
              className="btn-primary text-sm px-5 py-2 whitespace-nowrap">
              Upgrade to Pro
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Fallback data (shown when API is offline) ─────────────────────────────────

function getFallbackData(game: string): TrendData {
  const g = game === 'All Games' ? 'All' : game;
  return {
    game: g,
    updatedAt: new Date().toISOString(),
    trends: [
      { id:'1', name:'1v4 clutch no scope',       category:'title',     game:g, score:97, change:+34, status:'rising',  views:'2.1M',  example:'"1v4 clutch no scope 😤 they thought I was done"' },
      { id:'2', name:'#gamingafrica',              category:'hashtag',   game:g, score:91, change:+28, status:'rising',  views:'890K',  example:undefined },
      { id:'3', name:'RAGE QUIT challenge',        category:'challenge', game:g, score:88, change:+19, status:'rising',  views:'1.4M',  example:undefined },
      { id:'4', name:'POV: you thought you won',   category:'title',     game:g, score:86, change:+22, status:'rising',  views:'3.3M',  example:undefined },
      { id:'5', name:'Phonk drift sound',          category:'sound',     game:g, score:84, change: +8, status:'peaked',  views:'5.1M',  example:undefined },
      { id:'6', name:'#naijagamer',               category:'hashtag',   game:g, score:82, change:+15, status:'rising',  views:'340K',  example:undefined },
      { id:'7', name:'Watch till the end 👀',      category:'title',     game:g, score:79, change: -3, status:'peaked',  views:'1.9M',  example:undefined },
      { id:'8', name:'They didn\'t see me coming', category:'title',     game:g, score:76, change:+11, status:'rising',  views:'780K',  example:undefined },
      { id:'9', name:'Subway Surfers split screen',category:'challenge', game:g, score:74, change: -8, status:'falling', views:'4.2M',  example:undefined },
      { id:'10',name:'#mobilegaming',              category:'hashtag',   game:g, score:72, change: -5, status:'falling', views:'12M',   example:undefined },
      { id:'11',name:'Savage mode beat drop',      category:'sound',     game:g, score:70, change:+18, status:'rising',  views:'2.7M',  example:undefined },
      { id:'12',name:'Bro activated cheat codes',  category:'title',     game:g, score:68, change: +6, status:'rising',  views:'560K',  example:undefined },
    ],
  };
}
