import { useState } from 'react';
import type { Page } from '../App';
import {
  Flame, Star, Trophy, Zap,
  Crown, ChevronUp, Award, TrendingUp, Lock,
} from 'lucide-react';

interface CreatorRankPageProps {
  user: { name: string; email: string; plan: 'free' | 'starter' | 'pro' | 'creator' } | null;
  onNavigate: (page: Page, data?: unknown[]) => void;
}

interface Rank {
  id: string;
  name: string;
  icon: string;
  minXP: number;
  maxXP: number;
  color: string;
  bgColor: string;
  borderColor: string;
  perks: string[];
}

const RANKS: Rank[] = [
  { id:'rookie',  name:'Rookie',        icon:'🎮', minXP:0,     maxXP:499,   color:'text-clip-muted',  bgColor:'bg-clip-surface',      borderColor:'border-white/[0.08]', perks:['Access to ClipBot (10 msgs/day)', 'Basic trend radar'] },
  { id:'clipper', name:'Clipper',       icon:'✂️', minXP:500,   maxXP:1499,  color:'text-green-400',   bgColor:'bg-green-400/10',      borderColor:'border-green-400/30', perks:['20 ClipBot msgs/day', 'Caption Battle access', 'Clipper badge on profile'] },
  { id:'reel',    name:'Highlight Reel',icon:'🎬', minXP:1500,  maxXP:3999,  color:'text-blue-400',    bgColor:'bg-blue-400/10',       borderColor:'border-blue-400/30',  perks:['Unlimited ClipBot', 'Priority trend data', 'Highlight Reel badge', 'Weekly challenge entry'] },
  { id:'legend',  name:'Legend',        icon:'⚡', minXP:4000,  maxXP:9999,  color:'text-clip-cyan',   bgColor:'bg-clip-cyan/10',      borderColor:'border-clip-cyan/30', perks:['Everything above', 'Legend badge', 'Monthly creator spotlight', 'Early feature access'] },
  { id:'godtier', name:'GOD TIER',      icon:'👑', minXP:10000, maxXP:Infinity, color:'text-clip-amber', bgColor:'bg-clip-amber/10',  borderColor:'border-clip-amber/40',perks:['All perks', 'GOD TIER crown', 'Free Pro plan for 1 month', 'Featured on leaderboard'] },
];

const XP_ACTIONS = [
  { label: 'Analyse a clip',         xp: 50,  icon: '🔍' },
  { label: 'Generate captions',      xp: 20,  icon: '✍️' },
  { label: 'Generate titles',        xp: 20,  icon: '📝' },
  { label: 'Use ClipBot',            xp: 10,  icon: '🤖' },
  { label: 'Daily login streak',     xp: 30,  icon: '🔥' },
  { label: 'Share a viral score',    xp: 40,  icon: '📤' },
  { label: 'Complete daily challenge',xp:100, icon: '🎯' },
  { label: 'Refer a friend',         xp: 200, icon: '👥' },
];

const MOCK_TOP: { name: string; rank: string; icon: string; xp: number; streak: number }[] = [
  { name: 'SkullKing_NG',    rank: 'GOD TIER',       icon: '👑', xp: 14200, streak: 47 },
  { name: 'BloodstrikePro',  rank: 'Legend',         icon: '⚡', xp: 8900,  streak: 31 },
  { name: 'ClipGodLagos',    rank: 'Legend',         icon: '⚡', xp: 7300,  streak: 22 },
  { name: 'NaijaFragger',    rank: 'Highlight Reel', icon: '🎬', xp: 3800,  streak: 14 },
  { name: 'AbujaGamer99',    rank: 'Highlight Reel', icon: '🎬', xp: 2900,  streak: 9  },
];

function getUserXP(plan: string): number {
  const base = { free: 120, starter: 680, pro: 2200, creator: 5800 };
  return base[plan as keyof typeof base] ?? 120;
}

function getStreakCount(plan: string): number {
  const s = { free: 3, starter: 8, pro: 21, creator: 35 };
  return s[plan as keyof typeof s] ?? 3;
}

export function CreatorRankPage({ user, onNavigate }: CreatorRankPageProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'ranks' | 'leaderboard' | 'earn'>('profile');

  const plan       = user?.plan ?? 'free';
  const userXP     = getUserXP(plan);
  const streak     = getStreakCount(plan);
  const currentRank = RANKS.find(r => userXP >= r.minXP && userXP <= r.maxXP) ?? RANKS[0];
  const nextRank    = RANKS[RANKS.indexOf(currentRank) + 1];
  const xpToNext    = nextRank ? nextRank.minXP - userXP : 0;
  const progress    = nextRank
    ? ((userXP - currentRank.minXP) / (nextRank.minXP - currentRank.minXP)) * 100
    : 100;

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-clip-text">
              Creator <span className="gradient-text">Rank</span>
            </h1>
            <p className="text-clip-muted mt-1">Level up. Earn XP. Become a GOD TIER creator.</p>
          </div>
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${currentRank.borderColor} ${currentRank.bgColor}`}>
            <span className="text-2xl">{currentRank.icon}</span>
            <div>
              <p className={`font-display font-bold ${currentRank.color}`}>{currentRank.name}</p>
              <p className="text-clip-muted text-xs">{userXP.toLocaleString()} XP</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-1">
          {(['profile', 'ranks', 'leaderboard', 'earn'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-sm font-medium capitalize whitespace-nowrap transition-all ${
                activeTab === tab
                  ? 'bg-clip-cyan text-black'
                  : 'bg-clip-surface text-clip-muted hover:text-clip-text border border-white/[0.06]'
              }`}>
              {tab === 'earn' ? 'Earn XP' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* ── PROFILE TAB ── */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            {/* XP card */}
            <div className="card-glass p-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-6">
                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl ${currentRank.bgColor} border ${currentRank.borderColor} flex-shrink-0`}>
                  {currentRank.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className={`font-display font-bold text-2xl ${currentRank.color}`}>{currentRank.name}</h2>
                    {plan !== 'free' && <span className="text-xs px-2 py-0.5 bg-clip-cyan/10 text-clip-cyan rounded-full border border-clip-cyan/20">VERIFIED</span>}
                  </div>
                  <p className="text-clip-text font-medium">{user?.name ?? 'Creator'}</p>
                  <p className="text-clip-muted text-sm">{userXP.toLocaleString()} XP total</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <Flame className="w-5 h-5 text-clip-amber" />
                    <span className="font-display font-bold text-3xl text-clip-amber">{streak}</span>
                  </div>
                  <p className="text-clip-muted text-xs">day streak 🔥</p>
                </div>
              </div>

              {/* XP Progress bar */}
              {nextRank && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-clip-muted text-sm">{currentRank.name}</span>
                    <span className="text-clip-muted text-sm">{nextRank.name}</span>
                  </div>
                  <div className="h-3 bg-clip-surface rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${
                        currentRank.id === 'godtier' ? 'bg-clip-amber' : 'bg-clip-cyan'
                      }`}
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-clip-muted text-xs font-mono">{userXP.toLocaleString()} XP</span>
                    <span className="text-clip-cyan text-xs">{xpToNext.toLocaleString()} XP to {nextRank.name}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Clips Analysed', value: plan === 'free' ? '3' : plan === 'starter' ? '12' : plan === 'pro' ? '48' : '200+', icon: Star },
                { label: 'Captions Made', value: plan === 'free' ? '5' : plan === 'starter' ? '28' : plan === 'pro' ? '110' : '500+', icon: Zap },
                { label: 'Streak Record', value: `${streak + 7} days`, icon: Flame },
                { label: 'Global Rank',   value: plan === 'free' ? '#4,821' : plan === 'starter' ? '#1,204' : '#312', icon: Trophy },
              ].map(stat => (
                <div key={stat.label} className="card-glass p-4 text-center">
                  <stat.icon className="w-5 h-5 text-clip-cyan mx-auto mb-2" />
                  <p className="font-display font-bold text-xl text-clip-text">{stat.value}</p>
                  <p className="text-clip-muted text-xs mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Current rank perks */}
            <div className="card-glass p-5">
              <h3 className="font-display font-semibold text-clip-text mb-4 flex items-center gap-2">
                <Award className="w-4 h-4 text-clip-cyan" /> Your Current Perks
              </h3>
              <div className="space-y-2">
                {currentRank.perks.map((perk, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-clip-cyan flex-shrink-0" />
                    <span className="text-clip-text">{perk}</span>
                  </div>
                ))}
              </div>
              {nextRank && (
                <div className="mt-4 pt-4 border-t border-white/[0.06]">
                  <p className="text-clip-muted text-xs mb-2">Unlock at {nextRank.name}:</p>
                  {nextRank.perks.slice(0, 2).map((perk, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-clip-muted">
                      <Lock className="w-3 h-3 flex-shrink-0" />
                      <span>{perk}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── RANKS TAB ── */}
        {activeTab === 'ranks' && (
          <div className="space-y-4">
            {RANKS.map(rank => {
              const isCurrent = rank.id === currentRank.id;
              const isUnlocked = userXP >= rank.minXP;
              return (
                <div key={rank.id} className={`card-glass p-5 border transition-all ${
                  isCurrent ? `${rank.borderColor} ${rank.bgColor}` : isUnlocked ? 'border-white/[0.08]' : 'border-white/[0.04] opacity-60'
                }`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${
                      isUnlocked ? rank.bgColor : 'bg-clip-surface'
                    } border ${isUnlocked ? rank.borderColor : 'border-white/[0.04]'}`}>
                      {isUnlocked ? rank.icon : <Lock className="w-5 h-5 text-clip-muted" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className={`font-display font-bold text-lg ${isUnlocked ? rank.color : 'text-clip-muted'}`}>
                          {rank.name}
                        </h3>
                        {isCurrent && <span className="text-xs px-2 py-0.5 bg-clip-cyan/10 text-clip-cyan rounded-full border border-clip-cyan/20">CURRENT</span>}
                      </div>
                      <p className="text-clip-muted text-xs mb-2 font-mono">
                        {rank.minXP.toLocaleString()} – {rank.maxXP === Infinity ? '∞' : rank.maxXP.toLocaleString()} XP
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {rank.perks.map((perk, i) => (
                          <span key={i} className={`text-xs px-2 py-0.5 rounded-full border ${
                            isUnlocked ? 'border-white/[0.08] text-clip-muted bg-clip-surface' : 'border-white/[0.04] text-white/20'
                          }`}>{perk}</span>
                        ))}
                      </div>
                    </div>
                    {!isUnlocked && (
                      <div className="text-right flex-shrink-0">
                        <ChevronUp className="w-4 h-4 text-clip-muted mx-auto" />
                        <p className="text-clip-muted text-xs mt-1">{(rank.minXP - userXP).toLocaleString()} XP needed</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── LEADERBOARD TAB ── */}
        {activeTab === 'leaderboard' && (
          <div className="card-glass overflow-hidden">
            <div className="p-4 border-b border-white/[0.06] flex items-center gap-2">
              <Crown className="w-4 h-4 text-clip-amber" />
              <span className="font-medium text-clip-text">Top Creators This Week</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {MOCK_TOP.map((creator, i) => (
                <div key={i} className={`flex items-center gap-4 px-5 py-4 ${
                  creator.name === 'You' ? 'bg-clip-cyan/5' : 'hover:bg-white/[0.02]'
                }`}>
                  <span className={`font-display font-bold text-lg w-8 flex-shrink-0 ${
                    i === 0 ? 'text-clip-amber' : i === 1 ? 'text-clip-muted' : i === 2 ? 'text-amber-700' : 'text-clip-muted'
                  }`}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-clip-surface border border-white/[0.08] flex items-center justify-center text-lg flex-shrink-0">
                    {creator.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-clip-text truncate">{creator.name}</p>
                    <p className="text-clip-muted text-xs">{creator.rank}</p>
                  </div>
                  <div className="flex items-center gap-1 text-clip-amber text-xs flex-shrink-0">
                    <Flame className="w-3 h-3" />{creator.streak}d
                  </div>
                  <span className="text-clip-cyan font-mono text-sm flex-shrink-0">{creator.xp.toLocaleString()} XP</span>
                </div>
              ))}
              {/* User position */}
              <div className="flex items-center gap-4 px-5 py-4 bg-clip-cyan/5 border-t border-clip-cyan/10">
                <span className="text-clip-muted font-bold w-8">#847</span>
                <div className="w-9 h-9 rounded-xl bg-clip-cyan/10 border border-clip-cyan/20 flex items-center justify-center text-sm flex-shrink-0">
                  {currentRank.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-clip-cyan truncate">{user?.name ?? 'You'} (You)</p>
                  <p className="text-clip-muted text-xs">{currentRank.name}</p>
                </div>
                <div className="flex items-center gap-1 text-clip-amber text-xs flex-shrink-0">
                  <Flame className="w-3 h-3" />{streak}d
                </div>
                <span className="text-clip-cyan font-mono text-sm flex-shrink-0">{userXP.toLocaleString()} XP</span>
              </div>
            </div>
          </div>
        )}

        {/* ── EARN XP TAB ── */}
        {activeTab === 'earn' && (
          <div className="space-y-4">
            <div className="card-glass p-4 border-clip-cyan/20 bg-clip-cyan/5 flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-clip-cyan flex-shrink-0" />
              <p className="text-clip-text text-sm">Every action on ClipAI earns you XP. The more you create, the higher you rank.</p>
            </div>
            {XP_ACTIONS.map((action, i) => (
              <div key={i} className="card-glass p-4 flex items-center gap-4 hover:border-white/[0.12] transition-all group">
                <span className="text-2xl flex-shrink-0">{action.icon}</span>
                <p className="flex-1 text-clip-text text-sm group-hover:text-clip-cyan transition-colors">{action.label}</p>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Zap className="w-3 h-3 text-clip-cyan" />
                  <span className="text-clip-cyan font-mono font-bold text-sm">+{action.xp} XP</span>
                </div>
              </div>
            ))}
            <div className="card-glass p-5 border-clip-amber/20 bg-clip-amber/5 text-center">
              <p className="text-clip-amber text-sm font-medium mb-1">🔥 Streak Bonus</p>
              <p className="text-clip-muted text-xs">Log in 7 days in a row and get a 2× XP multiplier for 24 hours</p>
            </div>
            {user?.plan === 'free' && (
              <div className="card-glass p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-clip-text font-medium text-sm">Earn 500 bonus XP instantly</p>
                  <p className="text-clip-muted text-xs">Upgrade to Starter or above and get an instant XP boost</p>
                </div>
                <button onClick={() => onNavigate('pricing')} className="btn-primary text-sm px-5 py-2 whitespace-nowrap">
                  Upgrade Now
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
