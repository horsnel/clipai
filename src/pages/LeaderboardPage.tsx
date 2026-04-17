import { useState } from 'react';
import type { Page } from '@/App';
import { 
  Trophy, Medal, Crown, Flame, 
  ChevronRight, Sparkles 
} from 'lucide-react';

interface LeaderboardPageProps {
  user: { name: string; email: string; plan: 'free' | 'pro' | 'creator' } | null;
  onNavigate: (page: Page) => void;
}

type Tab = 'alltime' | 'weekly';

interface Player {
  rank: number;
  name: string;
  avatar: string;
  plan: 'free' | 'pro' | 'creator';
  game: string;
  hypeScore: number;
  clipCount: number;
  isYou?: boolean;
}

const mockAllTimePlayers: Player[] = [
  { rank: 1, name: 'Tobi', avatar: 'T', plan: 'creator', game: 'COD Mobile', hypeScore: 15420, clipCount: 87 },
  { rank: 2, name: 'ViperX', avatar: 'V', plan: 'creator', game: 'Bloodstrike', hypeScore: 12850, clipCount: 64 },
  { rank: 3, name: 'NinjaPro', avatar: 'N', plan: 'pro', game: 'PUBG', hypeScore: 11200, clipCount: 52 },
  { rank: 4, name: 'AceGamer', avatar: 'A', plan: 'pro', game: 'Free Fire', hypeScore: 9850, clipCount: 48 },
  { rank: 5, name: 'Storm', avatar: 'S', plan: 'creator', game: 'Mobile Legends', hypeScore: 9200, clipCount: 71 },
  { rank: 6, name: 'Phoenix', avatar: 'P', plan: 'pro', game: 'COD Mobile', hypeScore: 8450, clipCount: 39 },
  { rank: 7, name: 'Shadow', avatar: 'S', plan: 'free', game: 'Bloodstrike', hypeScore: 7800, clipCount: 28 },
  { rank: 8, name: 'Blaze', avatar: 'B', plan: 'pro', game: 'PUBG', hypeScore: 7200, clipCount: 35 },
  { rank: 9, name: 'Ghost', avatar: 'G', plan: 'free', game: 'Free Fire', hypeScore: 6500, clipCount: 22 },
  { rank: 10, name: 'Reaper', avatar: 'R', plan: 'pro', game: 'Mobile Legends', hypeScore: 5800, clipCount: 31 },
];

const mockWeeklyPlayers: Player[] = [
  { rank: 1, name: 'ViperX', avatar: 'V', plan: 'creator', game: 'Bloodstrike', hypeScore: 2840, clipCount: 18 },
  { rank: 2, name: 'Tobi', avatar: 'T', plan: 'creator', game: 'COD Mobile', hypeScore: 2650, clipCount: 15 },
  { rank: 3, name: 'Storm', avatar: 'S', plan: 'creator', game: 'Mobile Legends', hypeScore: 2100, clipCount: 12 },
  { rank: 4, name: 'AceGamer', avatar: 'A', plan: 'pro', game: 'Free Fire', hypeScore: 1850, clipCount: 10 },
  { rank: 5, name: 'Phoenix', avatar: 'P', plan: 'pro', game: 'COD Mobile', hypeScore: 1620, clipCount: 8 },
  { rank: 6, name: 'Blaze', avatar: 'B', plan: 'pro', game: 'PUBG', hypeScore: 1400, clipCount: 7 },
  { rank: 7, name: 'Shadow', avatar: 'S', plan: 'free', game: 'Bloodstrike', hypeScore: 1200, clipCount: 5 },
  { rank: 8, name: 'Ghost', avatar: 'G', plan: 'free', game: 'Free Fire', hypeScore: 980, clipCount: 4 },
  { rank: 9, name: 'Reaper', avatar: 'R', plan: 'pro', game: 'Mobile Legends', hypeScore: 850, clipCount: 4 },
  { rank: 10, name: 'NinjaPro', avatar: 'N', plan: 'pro', game: 'PUBG', hypeScore: 720, clipCount: 3 },
];

const currentUserRank = 47;
const currentUserScore = 2450;
const nextRankScore = 2800;
const pointsNeeded = nextRankScore - currentUserScore;

export function LeaderboardPage({ user, onNavigate }: LeaderboardPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('alltime');
  
  const players = activeTab === 'alltime' ? mockAllTimePlayers : mockWeeklyPlayers;
  const top3 = players.slice(0, 3);
  const rest = players.slice(3);

  const getPlanBadge = (plan: string) => {
    if (plan === 'creator') return <span className="text-[10px] px-1.5 py-0.5 bg-clip-amber text-black rounded font-bold">CREATOR</span>;
    if (plan === 'pro') return <span className="text-[10px] px-1.5 py-0.5 bg-clip-cyan text-black rounded font-bold">PRO</span>;
    return <span className="text-[10px] px-1.5 py-0.5 bg-clip-surface text-clip-muted border border-white/[0.08] rounded font-bold">FREE</span>;
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-clip-amber" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-300" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-700" />;
    return <span className="w-5 h-5 flex items-center justify-center font-mono font-bold text-clip-muted">{rank}</span>;
  };

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-clip-amber to-orange-500 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-black" />
            </div>
          </div>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-clip-text mb-2">
            Leaderboard
          </h1>
          <p className="text-clip-muted">
            Top creators ranked by total hype score
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-clip-surface rounded-xl p-1 border border-white/[0.06]">
            <button
              onClick={() => setActiveTab('alltime')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${
                activeTab === 'alltime'
                  ? 'bg-clip-cyan text-black'
                  : 'text-clip-muted hover:text-clip-text'
              }`}
            >
              <Trophy className="w-4 h-4" />
              All Time
            </button>
            <button
              onClick={() => setActiveTab('weekly')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${
                activeTab === 'weekly'
                  ? 'bg-clip-cyan text-black'
                  : 'text-clip-muted hover:text-clip-text'
              }`}
            >
              <Flame className="w-4 h-4" />
              This Week
            </button>
          </div>
        </div>

        {/* Top 3 Podium */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {/* 2nd Place */}
          <div className="flex flex-col items-center justify-end order-1">
            <div className="relative mb-3">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-black font-display font-bold text-xl sm:text-2xl">
                {top3[1].avatar}
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center">
                <span className="text-black font-bold text-sm">2</span>
              </div>
            </div>
            <p className="font-display font-semibold text-clip-text text-sm sm:text-base">{top3[1].name}</p>
            <div className="mb-1">{getPlanBadge(top3[1].plan)}</div>
            <p className="text-clip-cyan font-mono font-bold text-sm">{top3[1].hypeScore.toLocaleString()} hype</p>
            <div className="w-full h-20 sm:h-24 bg-gradient-to-t from-gray-500/20 to-transparent rounded-t-lg mt-3" />
          </div>

          {/* 1st Place */}
          <div className="flex flex-col items-center justify-end order-2">
            <div className="relative mb-3">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-clip-amber to-orange-500 flex items-center justify-center text-black font-display font-bold text-2xl sm:text-3xl ring-4 ring-clip-amber/30">
                {top3[0].avatar}
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-clip-amber flex items-center justify-center">
                <Crown className="w-4 h-4 text-black" />
              </div>
            </div>
            <p className="font-display font-bold text-clip-text text-lg sm:text-xl">{top3[0].name}</p>
            <div className="mb-1">{getPlanBadge(top3[0].plan)}</div>
            <p className="text-clip-amber font-mono font-bold text-base">{top3[0].hypeScore.toLocaleString()} hype</p>
            <div className="w-full h-28 sm:h-32 bg-gradient-to-t from-clip-amber/20 to-transparent rounded-t-lg mt-3" />
          </div>

          {/* 3rd Place */}
          <div className="flex flex-col items-center justify-end order-3">
            <div className="relative mb-3">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-amber-700 to-amber-800 flex items-center justify-center text-white font-display font-bold text-xl sm:text-2xl">
                {top3[2].avatar}
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-amber-700 flex items-center justify-center">
                <span className="text-white font-bold text-sm">3</span>
              </div>
            </div>
            <p className="font-display font-semibold text-clip-text text-sm sm:text-base">{top3[2].name}</p>
            <div className="mb-1">{getPlanBadge(top3[2].plan)}</div>
            <p className="text-clip-cyan font-mono font-bold text-sm">{top3[2].hypeScore.toLocaleString()} hype</p>
            <div className="w-full h-16 sm:h-20 bg-gradient-to-t from-amber-700/20 to-transparent rounded-t-lg mt-3" />
          </div>
        </div>

        {/* Rankings List */}
        <div className="card-glass overflow-hidden mb-6">
          <div className="p-4 border-b border-white/[0.06]">
            <div className="flex items-center justify-between text-xs text-clip-muted uppercase tracking-wider">
              <span className="w-12">Rank</span>
              <span className="flex-1">Player</span>
              <span className="w-20 text-right hidden sm:block">Clips</span>
              <span className="w-24 text-right">Hype Score</span>
            </div>
          </div>
          
          <div className="divide-y divide-white/[0.04]">
            {rest.map((player) => (
              <div 
                key={player.rank} 
                className="flex items-center p-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="w-12 flex items-center">
                  {getRankIcon(player.rank)}
                </div>
                <div className="flex-1 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-clip-surface flex items-center justify-center text-clip-text font-bold text-sm">
                    {player.avatar}
                  </div>
                  <div>
                    <p className="font-medium text-clip-text text-sm">{player.name}</p>
                    <div className="flex items-center gap-2">
                      {getPlanBadge(player.plan)}
                      <span className="text-clip-muted text-xs">{player.game}</span>
                    </div>
                  </div>
                </div>
                <div className="w-20 text-right text-clip-muted text-sm hidden sm:block">
                  {player.clipCount}
                </div>
                <div className="w-24 text-right">
                  <span className="font-mono font-bold text-clip-cyan">{player.hypeScore.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Your Rank Card */}
        <div className="card-glass p-5 border-clip-cyan/30 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-clip-cyan to-blue-500 flex items-center justify-center">
              <span className="text-black font-bold">{user?.name?.[0] || 'Y'}</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-display font-semibold text-clip-text">Your Rank</p>
                <span className="text-xs px-2 py-0.5 bg-clip-cyan text-black rounded font-bold">#{currentUserRank}</span>
              </div>
              <p className="text-clip-muted text-sm">
                {pointsNeeded} more hype points to reach rank #{currentUserRank - 1}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono font-bold text-clip-cyan text-lg">{currentUserScore.toLocaleString()}</p>
              <p className="text-clip-muted text-xs">hype score</p>
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="mt-4">
            <div className="h-2 bg-clip-surface rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-clip-cyan to-blue-400 rounded-full"
                style={{ width: `${(currentUserScore / nextRankScore) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Upgrade CTA for Free Users */}
        {user?.plan === 'free' && (
          <div className="card-glass p-5 bg-gradient-to-r from-clip-amber/10 to-transparent border-clip-amber/30">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-clip-amber/20 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-clip-amber" />
              </div>
              <div className="flex-1">
                <p className="font-display font-semibold text-clip-text mb-1">
                  Unlock More Clips
                </p>
                <p className="text-clip-muted text-sm">
                  Upgrade to Pro or Creator to create unlimited highlights
                </p>
              </div>
              <button
                onClick={() => onNavigate('pricing')}
                className="btn-primary flex items-center gap-2"
              >
                Upgrade
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
