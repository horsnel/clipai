import { useState, useEffect, useCallback } from 'react';
import type { Page } from '../App';
import {
  TrendingUp, Flame, Hash, Music, RefreshCw,
  ChevronUp, ChevronDown, Minus, Zap, Globe, Clock, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { TrendCardModal } from '../components/TrendCardModal';

interface TrendRadarPageProps {
  user: { name: string; email: string; plan: 'free' | 'starter' | 'pro' | 'creator' } | null;
  onNavigate: (page: Page, data?: unknown[]) => void;
}

type TrendStatus = 'rising' | 'peaked' | 'falling';
type TrendPlatform = 'youtube' | 'reddit' | 'google_trends' | 'tiktok' | 'twitter' | 'all';

export interface TrendItem {
  id: string;
  name: string;
  category: 'title' | 'hashtag' | 'sound' | 'challenge';
  game: string;
  score: number;
  change: number;
  status: TrendStatus;
  views?: string;
  example?: string;
  platform?: TrendPlatform;
}

interface TrendData {
  trends: TrendItem[];
  updatedAt: string;
  game: string;
  sources?: Record<string, number>;
}

const GAMES = [
  'All Games', 'Valorant', 'Apex Legends', 'Fortnite',
  'Minecraft', 'Roblox', 'Call of Duty', 'Warzone',
];

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

const PLATFORMS: { id: TrendPlatform; label: string; color: string }[] = [
  { id: 'all',            label: 'All',           color: 'bg-clip-cyan text-black' },
  { id: 'youtube',        label: 'YouTube',        color: 'bg-red-500/15 text-red-400' },
  { id: 'reddit',         label: 'Reddit',         color: 'bg-orange-500/15 text-orange-400' },
  { id: 'google_trends',  label: 'Google',         color: 'bg-blue-500/15 text-blue-400' },
  { id: 'tiktok',         label: 'TikTok',         color: 'bg-pink-500/15 text-pink-400' },
  { id: 'twitter',        label: 'X',              color: 'bg-slate-500/15 text-slate-300' },
];

const PlatformBadge: Record<TrendPlatform, string> = {
  youtube:        'bg-red-500/15 text-red-400 border-red-500/20',
  reddit:         'bg-orange-500/15 text-orange-400 border-orange-500/20',
  google_trends:  'bg-blue-500/15 text-blue-400 border-blue-500/20',
  tiktok:         'bg-pink-500/15 text-pink-400 border-pink-500/20',
  twitter:        'bg-slate-500/15 text-slate-300 border-slate-400/20',
  all:            'bg-clip-cyan/15 text-clip-cyan border-clip-cyan/20',
};

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
  const [activePlatform, setActivePlatform] = useState<TrendPlatform>('all');
  const [trendData, setTrendData]         = useState<TrendData | null>(null);
  const [isLoading, setIsLoading]         = useState(false);
  const [lastRefresh, setLastRefresh]     = useState<Date | null>(null);
  const [selectedTrend, setSelectedTrend] = useState<TrendItem | null>(null);

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
    (activeTab === 'all' ? true : t.category === activeTab) &&
    (activePlatform === 'all' ? true : (t.platform ?? 'youtube') === activePlatform)
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
              What's blowing up across YouTube, Reddit, Google, TikTok & X — RIGHT NOW
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
              <button
                key={t.id}
                onClick={() => setSelectedTrend(t)}
                className="card-glass p-4 border-green-400/20 bg-green-400/5 relative overflow-hidden text-left hover:bg-green-400/10 transition-colors cursor-pointer focus:outline-none focus:bg-green-400/10 group"
              >
                <div className="absolute top-0 right-0 w-16 h-16 bg-green-400/5 rounded-full -translate-y-4 translate-x-4" />
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-green-400 font-bold text-lg">#{i + 1}</span>
                  <span className="text-green-400 text-xs px-2 py-0.5 rounded-full bg-green-400/10 font-medium">🔥 HOT</span>
                  <Sparkles className="w-3.5 h-3.5 text-clip-cyan ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="font-display font-semibold text-clip-text truncate">{t.name}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-clip-muted text-xs capitalize">{t.category}</span>
                  <span className="text-green-400 text-xs font-mono">+{t.change}%</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {/* Game filter */}
          <div className="flex gap-2 overflow-x-auto pb-1 flex-1 -mx-1 px-1">
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
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-shrink-0">
            {(['all', 'title', 'hashtag', 'sound', 'challenge'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium uppercase tracking-wide transition-all whitespace-nowrap flex-shrink-0 ${
                  activeTab === tab
                    ? 'bg-clip-surface border border-clip-cyan/50 text-clip-cyan'
                    : 'text-clip-muted hover:text-clip-text'
                }`}>
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Platform filter row */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          <span className="text-clip-muted text-xs uppercase tracking-wider self-center mr-1 flex-shrink-0">Source:</span>
          {PLATFORMS.map(p => (
            <button key={p.id} onClick={() => setActivePlatform(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 border ${
                activePlatform === p.id
                  ? p.color + ' border-transparent'
                  : 'bg-clip-surface text-clip-muted hover:text-clip-text border-white/[0.06]'
              }`}>
              {p.label}
            </button>
          ))}
          {trendData?.sources && (
            <span className="text-clip-muted text-xs self-center ml-auto flex-shrink-0 hidden sm:block">
              Live: {Object.entries(trendData.sources).filter(([, v]) => v > 0).length}/5 platforms
            </span>
          )}
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
              <button
                key={trend.id}
                onClick={() => setSelectedTrend(trend)}
                className="w-full text-left flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-4 hover:bg-white/[0.03] transition-colors group cursor-pointer focus:outline-none focus:bg-white/[0.03]"
              >
                {/* Rank */}
                <span className="text-clip-muted font-mono text-sm w-6 flex-shrink-0 hidden sm:block">
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
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-clip-muted text-xs capitalize">{trend.category}</span>
                    {trend.platform && (
                      <>
                        <span className="text-white/20">·</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PlatformBadge[trend.platform]} font-medium uppercase tracking-wide flex-shrink-0`}>
                          {trend.platform === 'google_trends' ? 'Google' : trend.platform === 'twitter' ? 'X' : trend.platform}
                        </span>
                      </>
                    )}
                    {trend.game && trend.game !== 'All' && (
                      <>
                        <span className="text-white/20">·</span>
                        <span className="text-clip-muted text-xs truncate">{trend.game}</span>
                      </>
                    )}
                    {trend.example && (
                      <>
                        <span className="text-white/20 hidden sm:inline">·</span>
                        <span className="text-clip-muted text-xs italic truncate max-w-[180px] hidden sm:inline">{trend.example}</span>
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
                <div className={`flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-lg text-xs font-medium flex-shrink-0 ${StatusColor[trend.status]}`}>
                  <StatusIcon status={trend.status} />
                  <span className="hidden sm:inline">{trend.status}</span>
                </div>

                {/* Change % */}
                <span className={`text-xs font-mono w-12 sm:w-14 text-right flex-shrink-0 ${
                  trend.change > 0 ? 'text-green-400' : trend.change < 0 ? 'text-red-400' : 'text-clip-muted'
                }`}>
                  {trend.change > 0 ? '+' : ''}{trend.change}%
                </span>

                {/* Get content pack icon — appears on hover */}
                <div className="hidden sm:flex items-center gap-1 text-clip-cyan opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
              </button>
            ))}
          </div>

          {/* Hint below table */}
          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-white/[0.04] flex items-center gap-2 text-clip-muted text-xs">
              <Sparkles className="w-3.5 h-3.5 text-clip-cyan flex-shrink-0" />
              <span>Tap any trend to get keywords, titles, captions & hashtags</span>
            </div>
          )}
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

      {/* Trend Content Pack Modal */}
      {selectedTrend && (
        <TrendCardModal
          trend={selectedTrend}
          onClose={() => setSelectedTrend(null)}
        />
      )}
    </div>
  );
}

// ── Fallback data (shown when API is offline) ─────────────────────────────────

function getFallbackData(game: string): TrendData {
  const g = game === 'All Games' ? 'All' : game;
  return {
    game: g,
    updatedAt: new Date().toISOString(),
    sources: { youtube: 6, reddit: 4, google_trends: 2, tiktok: 0, twitter: 0 },
    trends: [
      { id:'1',  name:'1v4 clutch no scope',          category:'title',     game:g, platform:'youtube',       score:97, change:+34, status:'rising',  views:'2.1M',  example:'"1v4 clutch no scope they thought I was done 😤"' },
      { id:'2',  name:'#valorantclips',                category:'hashtag',   game:g, platform:'tiktok',        score:91, change:+28, status:'rising',  views:'890K',  example:undefined },
      { id:'3',  name:'RAGE QUIT challenge',           category:'challenge', game:g, platform:'reddit',         score:88, change:+19, status:'rising',  views:'1.4M',  example:undefined },
      { id:'4',  name:'POV: you thought you won',      category:'title',     game:g, platform:'tiktok',        score:86, change:+22, status:'rising',  views:'3.3M',  example:undefined },
      { id:'5',  name:'Phonk drift sound',             category:'sound',     game:g, platform:'youtube',       score:84, change: +8, status:'peaked',  views:'5.1M',  example:undefined },
      { id:'6',  name:'#apexlegends',                  category:'hashtag',   game:g, platform:'twitter',        score:82, change:+15, status:'rising',  views:'340K',  example:undefined },
      { id:'7',  name:'Watch till the end',            category:'title',     game:g, platform:'tiktok',        score:79, change: -3, status:'peaked',  views:'1.9M',  example:undefined },
      { id:'8',  name:'valorant clutch meta',          category:'title',     game:g, platform:'google_trends',  score:78, change:+42, status:'rising',  views:'—',     example:undefined },
      { id:'9',  name:'They didn\'t see me coming',    category:'title',     game:g, platform:'youtube',       score:76, change:+11, status:'rising',  views:'780K',  example:undefined },
      { id:'10', name:'r/warzone clip of the week',    category:'title',     game:g, platform:'reddit',         score:74, change:+27, status:'rising',  views:'12K',   example:undefined },
      { id:'11', name:'Savage mode beat drop',         category:'sound',     game:g, platform:'tiktok',        score:70, change:+18, status:'rising',  views:'2.7M',  example:undefined },
      { id:'12', name:'gaming clips 2026',             category:'title',     game:g, platform:'google_trends',  score:68, change: +6, status:'rising',  views:'—',     example:undefined },
    ],
  };
}
