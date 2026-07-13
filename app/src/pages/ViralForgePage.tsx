import { useState, useEffect, useCallback } from 'react';
import type { Page } from '../App';
import { Zap, Copy, ThumbsUp, RefreshCw,
  Hash, Type, Sparkles, ChevronRight, CheckCheck,
  TrendingUp, Flame, Trophy, Crown,
} from 'lucide-react';
import { toast } from 'sonner';
import { voteOnCaption, getTopCaptions } from '@/services/api';

interface ViralForgePageProps {
  user: { name: string; email: string; plan: 'free' | 'starter' | 'pro' | 'creator' } | null;
  onNavigate: (page: Page, data?: unknown[]) => void;
}

type ActiveTool = 'titles' | 'captions' | 'hashtags' | 'hooks';

interface GeneratedTitle {
  id: string;
  text: string;
  viralScore: number;
  searchVolume: string;
  trend: 'rising' | 'stable' | 'declining';
  votes: number;
}

interface GeneratedCaption {
  id: string;
  text: string;
  vibe: string;
  viralScore: number;
  votes: number;
}

const GAMES = ['Call of Duty', 'Bloodstrike', 'PUBG', 'Mobile Legends', 'Free Fire'];
const VIBES = ['Hype 🔥', 'Funny 😂', 'Savage 💀', 'Mysterious 👀', 'Wholesome 🥹'];
const PLATFORMS = ['TikTok', 'YouTube Shorts', 'Instagram Reels'];

const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function callForge(endpoint: string, body: object) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Request failed');
  return res.json();
}

export function ViralForgePage({ user, onNavigate }: ViralForgePageProps) {
  const [activeTool, setActiveTool]   = useState<ActiveTool>('titles');
  const [clipDesc, setClipDesc]       = useState('');
  const [selectedGame, setSelectedGame] = useState('Call of Duty');
  const [selectedVibe, setSelectedVibe] = useState('Hype 🔥');
  const [selectedPlatform, setSelectedPlatform] = useState('TikTok');
  const [isLoading, setIsLoading]     = useState(false);

  // Results
  const [titles, setTitles]           = useState<GeneratedTitle[]>([]);
  const [captions, setCaptions]       = useState<GeneratedCaption[]>([]);
  const [hashtags, setHashtags]       = useState<string[]>([]);
  const [hooks, setHooks]             = useState<string[]>([]);
  const [copiedId, setCopiedId]       = useState<string | null>(null);

  // Caption battle
  const [battlePair, setBattlePair]   = useState<[GeneratedCaption, GeneratedCaption] | null>(null);
  const [battleWinner, setBattleWinner] = useState<GeneratedCaption | null>(null);

  // Top voted captions (community battle board)
  const [topCaptions, setTopCaptions] = useState<Array<{
    caption: string; net_votes: number; game?: string; vibe?: string;
  }>>([]);
  const [topLoading, setTopLoading]   = useState(false);
  const [votedSet, setVotedSet]       = useState<Set<string>>(new Set());

  const fetchTopCaptions = useCallback(async () => {
    setTopLoading(true);
    try {
      const data = await getTopCaptions();
      setTopCaptions(data.captions ?? []);
    } catch {
      // Silent fail — battle board is supplementary
      setTopCaptions([]);
    } finally {
      setTopLoading(false);
    }
  }, []);

  useEffect(() => { fetchTopCaptions(); }, [fetchTopCaptions]);

  const handleTopVote = async (caption: string, vote: 1 | -1) => {
    if (votedSet.has(caption)) {
      toast.info('You already voted on this one');
      return;
    }
    // Optimistic update
    setTopCaptions(prev =>
      prev.map(c => c.caption === caption
        ? { ...c, net_votes: c.net_votes + vote }
        : c,
      ).sort((a, b) => b.net_votes - a.net_votes),
    );
    setVotedSet(prev => new Set([...prev, caption]));
    try {
      await voteOnCaption(caption, vote, undefined, undefined);
    } catch {
      // Revert on failure
      setTopCaptions(prev =>
        prev.map(c => c.caption === caption
          ? { ...c, net_votes: c.net_votes - vote }
          : c,
        ).sort((a, b) => b.net_votes - a.net_votes),
      );
      setVotedSet(prev => { const n = new Set(prev); n.delete(caption); return n; });
      toast.error('Vote failed — try again');
    }
  };

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleGenerate = async () => {
    if (!clipDesc.trim()) return toast.error('Describe your clip first!');
    setIsLoading(true);
    setBattlePair(null); setBattleWinner(null);

    try {
      if (activeTool === 'titles') {
        const data = await callForge('/forge/titles', {
          description: clipDesc, game: selectedGame, platform: selectedPlatform,
        });
        setTitles(data.titles ?? getFallbackTitles(clipDesc, selectedGame));
      } else if (activeTool === 'captions') {
        const data = await callForge('/forge/captions', {
          description: clipDesc, game: selectedGame, vibe: selectedVibe, platform: selectedPlatform,
        });
        const caps = data.captions ?? getFallbackCaptions(clipDesc, selectedVibe);
        setCaptions(caps);
        if (caps.length >= 2) setBattlePair([caps[0], caps[1]]);
      } else if (activeTool === 'hashtags') {
        const data = await callForge('/forge/hashtags', {
          description: clipDesc, game: selectedGame, platform: selectedPlatform,
        });
        setHashtags(data.hashtags ?? getFallbackHashtags(selectedGame, selectedPlatform));
      } else if (activeTool === 'hooks') {
        const data = await callForge('/forge/hooks', {
          description: clipDesc, game: selectedGame,
        });
        setHooks(data.hooks ?? getFallbackHooks(selectedGame));
      }
    } catch {
      // Use fallback silently
      if (activeTool === 'titles')   setTitles(getFallbackTitles(clipDesc, selectedGame));
      if (activeTool === 'captions') {
        const caps = getFallbackCaptions(clipDesc, selectedVibe);
        setCaptions(caps);
        if (caps.length >= 2) setBattlePair([caps[0], caps[1]]);
      }
      if (activeTool === 'hashtags') setHashtags(getFallbackHashtags(selectedGame, selectedPlatform));
      if (activeTool === 'hooks')    setHooks(getFallbackHooks(selectedGame));
    } finally {
      setIsLoading(false);
    }
  };

  const handleBattleVote = (winner: GeneratedCaption) => {
    setBattleWinner(winner);
    toast.success('Vote recorded! 🏆');
    // Move to next pair after 1.5s
    setTimeout(() => {
      const remaining = captions.filter(c => c.id !== battlePair?.[0].id && c.id !== battlePair?.[1].id);
      if (remaining.length >= 2) setBattlePair([remaining[0], remaining[1]]);
      else setBattlePair(null);
    }, 1500);
  };

  const hasResults =
    (activeTool === 'titles'   && titles.length > 0)   ||
    (activeTool === 'captions' && captions.length > 0) ||
    (activeTool === 'hashtags' && hashtags.length > 0) ||
    (activeTool === 'hooks'    && hooks.length > 0);

  const TOOLS: { key: ActiveTool; label: string; icon: typeof Type; desc: string }[] = [
    { key: 'titles',   label: 'Title Forge',   icon: TrendingUp, desc: 'SEO-optimised viral titles ranked by score' },
    { key: 'captions', label: 'Caption Battle',icon: Flame,      desc: 'Generate & vote your best caption' },
    { key: 'hashtags', label: 'Hashtag Pack',  icon: Hash,       desc: 'Perfectly sized hashtag combos' },
    { key: 'hooks',    label: 'Hook Library',  icon: Type,       desc: 'Addictive opening lines for your video' },
  ];

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-clip-text mb-2">
            Viral <span className="gradient-text">Forge</span>
          </h1>
          <p className="text-clip-muted">AI-powered titles, captions, hooks & hashtags — built to go viral</p>
        </div>

        {/* Tool tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {TOOLS.map(t => (
            <button key={t.key} onClick={() => { setActiveTool(t.key); setTitles([]); setCaptions([]); setHashtags([]); setHooks([]); }}
              className={`p-4 rounded-xl border text-left transition-all ${
                activeTool === t.key
                  ? 'border-clip-cyan/50 bg-clip-cyan/5'
                  : 'border-white/[0.06] bg-clip-surface hover:border-white/[0.12]'
              }`}>
              <t.icon className={`w-5 h-5 mb-2 ${activeTool === t.key ? 'text-clip-cyan' : 'text-clip-muted'}`} />
              <p className={`text-sm font-medium ${activeTool === t.key ? 'text-clip-text' : 'text-clip-muted'}`}>{t.label}</p>
              <p className="text-xs text-clip-muted mt-0.5 hidden sm:block leading-tight">{t.desc}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Input panel */}
          <div className="lg:col-span-2 space-y-4">
            <div className="card-glass p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-clip-text block mb-2">Describe Your Clip</label>
                <textarea
                  value={clipDesc}
                  onChange={e => setClipDesc(e.target.value)}
                  placeholder="e.g. I got a 1v4 clutch with only a pistol, came back from 5 HP…"
                  rows={4}
                  className="input-dark w-full resize-none text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-clip-muted uppercase tracking-wider block mb-2">Game</label>
                <div className="grid grid-cols-2 gap-2">
                  {GAMES.map(g => (
                    <button key={g} onClick={() => setSelectedGame(g)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        selectedGame === g ? 'bg-clip-cyan text-black' : 'bg-clip-surface text-clip-muted border border-white/[0.06] hover:text-clip-text'
                      }`}>{g}</button>
                  ))}
                </div>
              </div>

              {activeTool === 'captions' && (
                <div>
                  <label className="text-xs text-clip-muted uppercase tracking-wider block mb-2">Vibe</label>
                  <div className="grid grid-cols-2 gap-2">
                    {VIBES.map(v => (
                      <button key={v} onClick={() => setSelectedVibe(v)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          selectedVibe === v ? 'bg-clip-cyan text-black' : 'bg-clip-surface text-clip-muted border border-white/[0.06] hover:text-clip-text'
                        }`}>{v}</button>
                    ))}
                  </div>
                </div>
              )}

              {(activeTool === 'titles' || activeTool === 'hashtags') && (
                <div>
                  <label className="text-xs text-clip-muted uppercase tracking-wider block mb-2">Platform</label>
                  <div className="flex flex-col gap-2">
                    {PLATFORMS.map(p => (
                      <button key={p} onClick={() => setSelectedPlatform(p)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-all text-left ${
                          selectedPlatform === p ? 'bg-clip-cyan text-black' : 'bg-clip-surface text-clip-muted border border-white/[0.06] hover:text-clip-text'
                        }`}>{p}</button>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={handleGenerate} disabled={isLoading || !clipDesc.trim()}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                {isLoading
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</>
                  : <><Zap className="w-4 h-4" /> Generate</>
                }
              </button>
            </div>

            {/* Viral score legend */}
            <div className="card-glass p-4">
              <p className="text-xs text-clip-muted uppercase tracking-wider mb-3">Viral Score Guide</p>
              <div className="space-y-2">
                {[
                  { range: '90–100', label: 'GOD TIER 🏆', color: 'text-clip-amber' },
                  { range: '75–89',  label: 'Banger 🔥',   color: 'text-clip-cyan' },
                  { range: '60–74',  label: 'Solid 👍',    color: 'text-green-400' },
                  { range: 'Below',  label: 'Rework it',   color: 'text-clip-muted' },
                ].map(r => (
                  <div key={r.range} className="flex items-center justify-between text-xs">
                    <span className="text-clip-muted font-mono">{r.range}</span>
                    <span className={r.color}>{r.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Results panel */}
          <div className="lg:col-span-3">
            {/* ── TITLES ── */}
            {activeTool === 'titles' && (
              <div className="space-y-3">
                {!hasResults ? (
                  <EmptyState label="titles" />
                ) : titles.map((title, i) => (
                  <div key={title.id} className="card-glass p-4 hover:border-white/[0.12] transition-all group">
                    <div className="flex items-start gap-3">
                      <span className="text-clip-muted font-mono text-sm mt-1 flex-shrink-0">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-clip-text font-medium leading-snug">{title.text}</p>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <ViralPill score={title.viralScore} />
                          <span className="text-clip-muted text-xs">{title.searchVolume} searches</span>
                          <span className={`text-xs capitalize ${
                            title.trend === 'rising' ? 'text-green-400' : title.trend === 'declining' ? 'text-red-400' : 'text-clip-muted'
                          }`}>{title.trend === 'rising' ? '↑' : title.trend === 'declining' ? '↓' : '→'} {title.trend}</span>
                        </div>
                      </div>
                      <button onClick={() => copy(title.text, title.id)}
                        className="p-2 rounded-lg text-clip-muted hover:text-clip-cyan hover:bg-clip-cyan/10 transition-all flex-shrink-0">
                        {copiedId === title.id ? <CheckCheck className="w-4 h-4 text-clip-cyan" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── CAPTION BATTLE ── */}
            {activeTool === 'captions' && (
              <div className="space-y-4">
                {!hasResults ? (
                  <EmptyState label="captions" />
                ) : (
                  <>
                    {battlePair && !battleWinner && (
                      <div className="card-glass p-5 border-clip-amber/20 bg-clip-amber/5">
                        <p className="text-clip-amber text-sm font-medium mb-4 flex items-center gap-2">
                          <Flame className="w-4 h-4" /> Caption Battle — pick the better one!
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {battlePair.map(cap => (
                            <button key={cap.id} onClick={() => handleBattleVote(cap)}
                              className="card-glass p-4 text-left hover:border-clip-amber/40 hover:bg-clip-amber/5 transition-all group">
                              <p className="text-clip-text text-sm leading-relaxed mb-3">{cap.text}</p>
                              <div className="flex items-center justify-between">
                                <ViralPill score={cap.viralScore} />
                                <span className="text-clip-muted text-xs group-hover:text-clip-amber transition-colors flex items-center gap-1">
                                  Vote <ChevronRight className="w-3 h-3" />
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {battleWinner && (
                      <div className="card-glass p-4 border-green-400/30 bg-green-400/5 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-400/20 flex items-center justify-center flex-shrink-0">🏆</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-green-400 text-xs font-medium mb-1">Winner!</p>
                          <p className="text-clip-text text-sm truncate">{battleWinner.text}</p>
                        </div>
                        <button onClick={() => copy(battleWinner.text, 'winner')}
                          className="p-2 text-clip-muted hover:text-clip-cyan transition-colors">
                          {copiedId === 'winner' ? <CheckCheck className="w-4 h-4 text-clip-cyan" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    )}

                    <div className="space-y-3">
                      {captions.map(cap => (
                        <div key={cap.id} className="card-glass p-4 group hover:border-white/[0.12] transition-all">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-clip-text text-sm leading-relaxed">{cap.text}</p>
                              <div className="flex items-center gap-3 mt-2">
                                <ViralPill score={cap.viralScore} />
                                <span className="text-clip-muted text-xs">{cap.vibe}</span>
                                <button onClick={async () => {
                                  setCaptions(prev => prev.map(c => c.id === cap.id ? {...c, votes: c.votes + 1} : c));
                                  toast.success('Liked!');
                                  try {
                                    await voteOnCaption(cap.text, 1, selectedGame, selectedVibe);
                                  } catch {/* silent */}
                                }}
                                  className="flex items-center gap-1 text-clip-muted hover:text-clip-cyan text-xs transition-colors">
                                  <ThumbsUp className="w-3 h-3" /> {cap.votes}
                                </button>
                              </div>
                            </div>
                            <button onClick={() => copy(cap.text, cap.id)}
                              className="p-2 rounded-lg text-clip-muted hover:text-clip-cyan hover:bg-clip-cyan/10 transition-all flex-shrink-0">
                              {copiedId === cap.id ? <CheckCheck className="w-4 h-4 text-clip-cyan" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── HASHTAGS ── */}
            {activeTool === 'hashtags' && (
              <div>
                {!hasResults ? (
                  <EmptyState label="hashtags" />
                ) : (
                  <div className="card-glass p-5">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-medium text-clip-text">{hashtags.length} hashtags generated</p>
                      <button onClick={() => copy(hashtags.join(' '), 'all-tags')}
                        className="flex items-center gap-2 text-xs text-clip-cyan hover:underline">
                        {copiedId === 'all-tags' ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        Copy all
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {hashtags.map((tag, i) => (
                        <button key={i} onClick={() => copy(tag, `tag-${i}`)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                            i < 3 ? 'border-clip-cyan/30 bg-clip-cyan/10 text-clip-cyan' :
                            i < 8 ? 'border-white/[0.08] bg-clip-surface text-clip-text hover:border-clip-cyan/30' :
                            'border-white/[0.04] bg-clip-surface/50 text-clip-muted hover:text-clip-text'
                          }`}>
                          {tag}
                          {copiedId === `tag-${i}` && <CheckCheck className="w-3 h-3 inline ml-1 text-clip-cyan" />}
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center gap-4 text-xs text-clip-muted">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-clip-cyan/30 inline-block" /> Mega (high reach)</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-clip-surface border border-white/[0.08] inline-block" /> Mid-tier</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-clip-surface/50 inline-block" /> Niche</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── HOOKS ── */}
            {activeTool === 'hooks' && (
              <div className="space-y-3">
                {!hasResults ? (
                  <EmptyState label="hooks" />
                ) : hooks.map((hook, i) => (
                  <div key={i} className="card-glass p-4 group hover:border-white/[0.12] transition-all">
                    <div className="flex items-start gap-3">
                      <span className="text-clip-cyan font-mono text-xs mt-1 flex-shrink-0">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <p className="flex-1 text-clip-text text-sm leading-relaxed">{hook}</p>
                      <button onClick={() => copy(hook, `hook-${i}`)}
                        className="p-2 rounded-lg text-clip-muted hover:text-clip-cyan hover:bg-clip-cyan/10 transition-all flex-shrink-0">
                        {copiedId === `hook-${i}` ? <CheckCheck className="w-4 h-4 text-clip-cyan" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Caption Battle — Top Voted This Week */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-clip-amber" />
              <h2 className="font-display font-bold text-xl text-clip-text">
                Top Voted This Week
              </h2>
            </div>
            <button
              onClick={fetchTopCaptions}
              disabled={topLoading}
              className="text-clip-muted hover:text-clip-cyan text-xs flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${topLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {topCaptions.length === 0 ? (
            <div className="card-glass p-8 text-center">
              <Trophy className="w-10 h-10 mx-auto mb-3 text-clip-muted opacity-30" />
              <p className="text-clip-muted text-sm">
                No community votes yet this week. Generate captions above and vote to claim the #1 spot.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {topCaptions.slice(0, 8).map((c, i) => {
                const alreadyVoted = votedSet.has(c.caption);
                return (
                  <div key={i} className={`card-glass p-4 flex items-start gap-3 ${
                    i === 0 ? 'border-clip-amber/30 bg-clip-amber/5' : ''
                  }`}>
                    <span className={`font-display font-bold text-lg w-8 flex-shrink-0 ${
                      i === 0 ? 'text-clip-amber' : i === 1 ? 'text-clip-muted' : i === 2 ? 'text-amber-700' : 'text-clip-muted/60'
                    }`}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-clip-text text-sm leading-relaxed mb-1">{c.caption}</p>
                      <div className="flex items-center gap-3 text-xs text-clip-muted">
                        {c.game && <span className="capitalize">{c.game}</span>}
                        {c.vibe && <><span className="text-white/20">·</span><span>{c.vibe}</span></>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleTopVote(c.caption, 1)}
                        disabled={alreadyVoted}
                        className={`p-1.5 rounded-lg transition-all ${
                          alreadyVoted
                            ? 'text-clip-muted/40 cursor-not-allowed'
                            : 'text-clip-muted hover:text-green-400 hover:bg-green-400/10'
                        }`}
                        title={alreadyVoted ? 'Voted' : 'Upvote'}
                      >
                        <ThumbsUp className="w-4 h-4" />
                      </button>
                      <span className="text-clip-cyan font-mono text-sm w-8 text-center">
                        {c.net_votes}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upgrade nudge */}
        {user?.plan === 'free' && (
          <div className="mt-8 card-glass p-5 border-clip-cyan/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-clip-cyan flex-shrink-0" />
              <div>
                <p className="text-clip-text font-medium text-sm">Unlimited generations + priority AI</p>
                <p className="text-clip-muted text-xs">Free plan: 5 generations/day. Pro: unlimited ViralForge + ClipBot access.</p>
              </div>
            </div>
            <button onClick={() => onNavigate('pricing')} className="btn-primary text-sm px-5 py-2 whitespace-nowrap">
              Upgrade
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ViralPill({ score }: { score: number }) {
  const color = score >= 90 ? 'text-clip-amber bg-clip-amber/10' :
                score >= 75 ? 'text-clip-cyan bg-clip-cyan/10' :
                score >= 60 ? 'text-green-400 bg-green-400/10' :
                              'text-clip-muted bg-clip-surface';
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>
      ⚡ {score}
    </span>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="card-glass p-12 text-center">
      <Sparkles className="w-10 h-10 mx-auto mb-3 text-clip-muted opacity-40" />
      <p className="text-clip-muted">Describe your clip and hit Generate to get viral {label}</p>
    </div>
  );
}

// ── Fallback generators ───────────────────────────────────────────────────────

function getFallbackTitles(desc: string, game: string): GeneratedTitle[] {
  const short = desc.slice(0, 20);
  return [
    { id:'t1', text:`This ${game} clip broke the internet 😤 ${short}`,           viralScore:96, searchVolume:'48K', trend:'rising',   votes:0 },
    { id:'t2', text:`POV: you just clutched the impossible in ${game}`,            viralScore:91, searchVolume:'32K', trend:'rising',   votes:0 },
    { id:'t3', text:`Nobody believed I could do this in ${game}… I proved them wrong`, viralScore:88, searchVolume:'24K', trend:'stable', votes:0 },
    { id:'t4', text:`${game} players are NOT ready for this level 💀`,             viralScore:85, searchVolume:'19K', trend:'rising',   votes:0 },
    { id:'t5', text:`The most INSANE ${game} moment of 2025 🔥 (not clickbait)`,  viralScore:82, searchVolume:'15K', trend:'stable',   votes:0 },
    { id:'t6', text:`I can't believe this actually happened in ${game}`,           viralScore:79, searchVolume:'11K', trend:'stable',   votes:0 },
    { id:'t7', text:`${game} pros hate this trick 👀`,                            viralScore:74, searchVolume:'8K',  trend:'declining',votes:0 },
  ];
}

function getFallbackCaptions(desc: string, vibe: string): GeneratedCaption[] {
  return [
    { id:'c1', text:`Bro really said "I'll do it myself" 💀🔥 #${vibe.split(' ')[0].toLowerCase()}`,     viralScore:94, vibe, votes:0 },
    { id:'c2', text:`They didn't see me coming 👀 drop a 💀 if you would've panicked`,                   viralScore:91, vibe, votes:0 },
    { id:'c3', text:`My hands were SHAKING but we don't talk about that 😭🔥`,                           viralScore:88, vibe, votes:0 },
    { id:'c4', text:`POV: you're the last one alive and it's all on you… 🎯`,                            viralScore:86, vibe, votes:0 },
    { id:'c5', text:`Nah they COOKED themselves letting me survive 💀 #gaming`,                           viralScore:83, vibe, votes:0 },
    { id:'c6', text:`Rating: 10/10 moment, 0/10 composure 😂 #${desc.split(' ')[0] ?? 'clip'}`,         viralScore:79, vibe, votes:0 },
  ];
}

function getFallbackHashtags(game: string, platform: string): string[] {
  const gameTag = '#' + game.replace(/\s/g, '').toLowerCase();
  const base = platform === 'TikTok' ? ['#fyp', '#foryoupage', '#gaming'] :
               platform === 'Instagram Reels' ? ['#reels', '#gaming', '#explore'] :
               ['#shorts', '#gaming', '#youtubeshorts'];
  return [
    ...base,
    gameTag,
    '#gamingafrica',
    '#naijagamer',
    '#gamingclips',
    '#gamingmoments',
    '#clutch',
    '#highlights',
    '#mobilegaming',
    '#gamerlife',
    '#contentupdator',
    '#gamingcommunity',
    '#viralclip',
    '#hype',
  ];
}

function getFallbackHooks(game: string): string[] {
  return [
    `POV: you're the last player alive in ${game} and your hands are sweating…`,
    `Nobody was ready for what happened next in this ${game} match 👀`,
    `I bet you can't watch this ${game} clip without your jaw dropping`,
    `This is the moment I knew ${game} wasn't ready for me 😤`,
    `Watch till the END — the final 3 seconds changed everything`,
    `The enemies actually laughed at me before this happened 💀`,
    `Stop scrolling. You need to see this ${game} clutch 🔥`,
    `My teammates said "it's over" — I said "hold on" 🎯`,
  ];
}
