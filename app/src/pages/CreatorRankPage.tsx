import { useState, useEffect, useRef } from 'react';
import type { Page } from '../App';
import {
  Flame, Star, Trophy, Zap,
  Crown, ChevronUp, Award, TrendingUp, Lock, Share2, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getMyRank } from '@/services/api';

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
  { id:'rookie',  name:'Rookie',        icon:'🎮', minXP:0,     maxXP:499,   color:'text-clip-muted',  bgColor:'bg-clip-surface',      borderColor:'border-white/[0.05]', perks:['Access to ClipBot (10 msgs/day)', 'Basic trend radar'] },
  { id:'clipper', name:'Clipper',       icon:'✂️', minXP:500,   maxXP:1499,  color:'text-green-600',   bgColor:'bg-green-500/10',      borderColor:'border-green-500/30', perks:['20 ClipBot msgs/day', 'Caption Battle access', 'Clipper badge on profile'] },
  { id:'reel',    name:'Highlight Reel',icon:'🎬', minXP:1500,  maxXP:3999,  color:'text-blue-600',    bgColor:'bg-blue-500/10',       borderColor:'border-blue-500/30',  perks:['Unlimited ClipBot', 'Priority trend data', 'Highlight Reel badge', 'Weekly challenge entry'] },
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

function rankFor(xp: number): Rank {
  return RANKS.find(r => xp >= r.minXP && xp <= r.maxXP) ?? RANKS[0];
}

export function CreatorRankPage({ user, onNavigate }: CreatorRankPageProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'ranks' | 'leaderboard' | 'earn'>('profile');
  const [rankData, setRankData] = useState<any>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    getMyRank().then(setRankData).catch(() => {});
  }, []);

  const plan       = user?.plan ?? 'free';
  const userXP     = rankData?.xp ?? 0;
  const streak     = rankData?.streakDays ?? 0;
  const globalRank = rankData?.globalRank ?? 0;
  const weeklyXP   = rankData?.weeklyXp ?? 0;
  const clipsDone  = rankData?.clipsAnalysed ?? 0;
  const currentRank = rankFor(userXP);
  const nextRank    = RANKS[RANKS.indexOf(currentRank) + 1];
  const xpToNext    = nextRank ? nextRank.minXP - userXP : 0;
  const progress    = nextRank
    ? ((userXP - currentRank.minXP) / (nextRank.minXP - currentRank.minXP)) * 100
    : 100;

  // ── Share card generator ─────────────────────────────────────────────────
  const generateShareCard = async () => {
    setShareLoading(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas not ready');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');

      const W = 1080, H = 1080;
      canvas.width = W; canvas.height = H;

      // Background — dark gradient
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#08080d');
      bg.addColorStop(1, '#101018');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Glow blobs
      ctx.fillStyle = 'rgba(0, 200, 255, 0.08)';
      ctx.beginPath();
      ctx.arc(W * 0.2, H * 0.2, 320, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 184, 0, 0.05)';
      ctx.beginPath();
      ctx.arc(W * 0.85, H * 0.85, 280, 0, Math.PI * 2);
      ctx.fill();

      // Header pill
      ctx.fillStyle = 'rgba(0, 200, 255, 0.15)';
      roundRect(ctx, W/2 - 130, 80, 260, 50, 25);
      ctx.fill();
      ctx.fillStyle = '#00C8FF';
      ctx.font = 'bold 22px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CLIPAI CREATOR RANK', W/2, 112);

      // Rank icon (emoji) — big
      ctx.font = '180px serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(currentRank.icon, W/2, 280);

      // Rank name
      const rankColors: Record<string, string> = {
        rookie: '#9CA3AF', clipper: '#4ADE80', reel: '#60A5FA',
        legend: '#00C8FF', godtier: '#FFB800',
      };
      ctx.fillStyle = rankColors[currentRank.id] ?? '#00C8FF';
      ctx.font = 'bold 88px Inter, system-ui, sans-serif';
      ctx.fillText(currentRank.name.toUpperCase(), W/2, 430);

      // User name
      ctx.fillStyle = '#A8AEB8';
      ctx.font = 'bold 48px Inter, system-ui, sans-serif';
      ctx.fillText(user?.name ?? 'Gamer', W/2, 520);

      // Divider
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(180, 580); ctx.lineTo(W - 180, 580);
      ctx.stroke();

      // Stats row — 3 boxes
      const statY = 660;
      const statW = 240;
      const stats = [
        { label: 'TOTAL XP',    value: userXP.toLocaleString() },
        { label: 'GLOBAL RANK', value: globalRank ? `#${globalRank}` : '—' },
        { label: 'DAY STREAK',  value: `${streak} 🔥` },
      ];
      stats.forEach((s, i) => {
        const x = (W - statW * 3) / 2 + i * statW + statW / 2;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        roundRect(ctx, x - statW/2 + 10, statY - 60, statW - 20, 140, 16);
        ctx.fill();
        ctx.fillStyle = '#9CA3AF';
        ctx.font = 'bold 18px Inter, system-ui, sans-serif';
        ctx.fillText(s.label, x, statY - 20);
        ctx.fillStyle = '#00C8FF';
        ctx.font = 'bold 48px Inter, system-ui, sans-serif';
        ctx.fillText(s.value, x, statY + 30);
      });

      // Footer
      ctx.fillStyle = '#6B7280';
      ctx.font = '24px Inter, system-ui, sans-serif';
      ctx.fillText('clipai.app · @clipai', W/2, H - 80);
      ctx.fillStyle = '#4ADE80';
      ctx.font = 'bold 22px Inter, system-ui, sans-serif';
      ctx.fillText('Climb the leaderboard →', W/2, H - 50);

      // Download
      const link = document.createElement('a');
      link.download = `clipai-rank-${currentRank.id}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Rank card downloaded — share it on socials!');
    } catch (err: any) {
      toast.error(err?.message || 'Could not generate card');
    } finally {
      setShareLoading(false);
    }
  };

  // Helper: rounded rect path
  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return (
    <div className="min-h-screen pt-28 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-clip-text">
              Creator <span className="gradient-text">Rank</span>
            </h1>
            <p className="text-clip-muted mt-1">Level up. Earn XP. Become a GOD TIER creator.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={generateShareCard}
              disabled={shareLoading}
              className="btn-secondary flex items-center gap-2 text-sm px-4 py-3 disabled:opacity-50"
              title="Download a shareable PNG of your rank"
            >
              {shareLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              Share Rank
            </button>
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${currentRank.borderColor} ${currentRank.bgColor}`}>
              <span className="text-2xl">{currentRank.icon}</span>
              <div className="min-w-0">
                <p className={`font-display font-bold truncate ${currentRank.color}`}>{currentRank.name}</p>
                <p className="text-clip-muted text-xs whitespace-nowrap">{userXP.toLocaleString()} XP</p>
              </div>
            </div>
          </div>
        </div>

        {/* Hidden canvas for PNG generation */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-1">
          {(['profile', 'ranks', 'leaderboard', 'earn'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-sm font-medium capitalize whitespace-nowrap transition-all ${
                activeTab === tab
                  ? 'bg-clip-cyan text-black'
                  : 'bg-clip-surface text-clip-muted hover:text-clip-text border border-white/[0.04]'
              }`}>
              {tab === 'earn' ? 'Earn XP' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* ── PROFILE TAB ── */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            {/* XP card */}
            <div className="card-glass p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 mb-6">
                <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-3xl sm:text-4xl ${currentRank.bgColor} border ${currentRank.borderColor} flex-shrink-0 mx-auto sm:mx-0`}>
                  {currentRank.icon}
                </div>
                <div className="flex-1 text-center sm:text-left min-w-0">
                  <div className="flex items-center gap-3 mb-1 justify-center sm:justify-start flex-wrap">
                    <h2 className={`font-display font-bold text-xl sm:text-2xl ${currentRank.color}`}>{currentRank.name}</h2>
                    {plan !== 'free' && <span className="text-xs px-2 py-0.5 bg-clip-cyan/10 text-clip-cyan rounded-full border border-clip-cyan/20 flex-shrink-0">VERIFIED</span>}
                  </div>
                  <p className="text-clip-text font-medium">{user?.name ?? 'Creator'}</p>
                  <p className="text-clip-muted text-sm">{userXP.toLocaleString()} XP total</p>
                </div>
                <div className="text-center sm:text-right flex-shrink-0">
                  <div className="flex items-center gap-2 justify-center sm:justify-end">
                    <Flame className="w-5 h-5 text-clip-amber" />
                    <span className="font-display font-bold text-2xl sm:text-3xl text-clip-amber">{streak}</span>
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
                { label: 'Clips Analysed', value: String(clipsDone), icon: Star },
                { label: 'Weekly XP',     value: weeklyXP.toLocaleString(), icon: Zap },
                { label: 'Streak Record', value: `${Math.max(streak, 7)} days`, icon: Flame },
                { label: 'Global Rank',   value: globalRank ? `#${globalRank.toLocaleString()}` : '—', icon: Trophy },
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
                <div className="mt-4 pt-4 border-t border-white/[0.04]">
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
                <div key={rank.id} className={`card-glass p-4 sm:p-5 border transition-all ${
                  isCurrent ? `${rank.borderColor} ${rank.bgColor}` : isUnlocked ? 'border-white/[0.05]' : 'border-white/[0.03] opacity-60'
                }`}>
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center text-xl sm:text-2xl flex-shrink-0 ${
                      isUnlocked ? rank.bgColor : 'bg-clip-surface'
                    } border ${isUnlocked ? rank.borderColor : 'border-white/[0.03]'}`}>
                      {isUnlocked ? rank.icon : <Lock className="w-5 h-5 text-clip-muted" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className={`font-display font-bold text-base sm:text-lg ${isUnlocked ? rank.color : 'text-clip-muted'}`}>
                          {rank.name}
                        </h3>
                        {isCurrent && <span className="text-xs px-2 py-0.5 bg-clip-cyan/10 text-clip-cyan rounded-full border border-clip-cyan/20 flex-shrink-0">CURRENT</span>}
                      </div>
                      <p className="text-clip-muted text-xs mb-2 font-mono">
                        {rank.minXP.toLocaleString()} – {rank.maxXP === Infinity ? '∞' : rank.maxXP.toLocaleString()} XP
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {rank.perks.map((perk, i) => (
                          <span key={i} className={`text-xs px-2 py-0.5 rounded-full border ${
                            isUnlocked ? 'border-white/[0.05] text-clip-muted bg-clip-surface' : 'border-white/[0.03] text-white/20'
                          }`}>{perk}</span>
                        ))}
                      </div>
                    </div>
                    {!isUnlocked && (
                      <div className="text-right flex-shrink-0 hidden sm:block">
                        <ChevronUp className="w-4 h-4 text-clip-muted mx-auto" />
                        <p className="text-clip-muted text-xs mt-1 whitespace-nowrap">{(rank.minXP - userXP).toLocaleString()} XP needed</p>
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
            <div className="p-4 border-b border-white/[0.04] flex items-center gap-2">
              <Crown className="w-4 h-4 text-clip-amber" />
              <span className="font-medium text-clip-text">Top Creators This Week</span>
            </div>
            <div className="divide-y divide-white/[0.03]">
              {MOCK_TOP.map((creator, i) => (
                <div key={i} className={`flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4 ${
                  creator.name === 'You' ? 'bg-clip-cyan/5' : 'hover:bg-white/[0.02]'
                }`}>
                  <span className={`font-display font-bold text-base sm:text-lg w-6 sm:w-8 flex-shrink-0 text-center ${
                    i === 0 ? 'text-clip-amber' : i === 1 ? 'text-clip-muted' : i === 2 ? 'text-amber-700' : 'text-clip-muted'
                  }`}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                  </span>
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-clip-surface border border-white/[0.05] flex items-center justify-center text-base sm:text-lg flex-shrink-0">
                    {creator.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-clip-text truncate">{creator.name}</p>
                    <p className="text-clip-muted text-xs truncate">{creator.rank}</p>
                  </div>
                  <div className="flex items-center gap-1 text-clip-amber text-xs flex-shrink-0 whitespace-nowrap">
                    <Flame className="w-3 h-3" />{creator.streak}d
                  </div>
                  <span className="text-clip-cyan font-mono text-xs sm:text-sm flex-shrink-0 whitespace-nowrap">{creator.xp.toLocaleString()} XP</span>
                </div>
              ))}
              {/* User position */}
              <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4 bg-clip-cyan/5 border-t border-clip-cyan/10">
                <span className="text-clip-muted font-bold w-6 sm:w-8 text-center text-sm">#{globalRank || '—'}</span>
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-clip-cyan/10 border border-clip-cyan/20 flex items-center justify-center text-sm flex-shrink-0">
                  {currentRank.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-clip-cyan truncate">{user?.name ?? 'You'} (You)</p>
                  <p className="text-clip-muted text-xs truncate">{currentRank.name}</p>
                </div>
                <div className="flex items-center gap-1 text-clip-amber text-xs flex-shrink-0 whitespace-nowrap">
                  <Flame className="w-3 h-3" />{streak}d
                </div>
                <span className="text-clip-cyan font-mono text-xs sm:text-sm flex-shrink-0 whitespace-nowrap">{userXP.toLocaleString()} XP</span>
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
              <div key={i} className="card-glass p-4 flex items-center gap-4 hover:border-white/[0.07] transition-all group">
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
