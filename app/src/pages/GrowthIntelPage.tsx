import { useState } from 'react';
import type { Page } from '../App';
import {
  Search, Clock, BarChart2, Zap, TrendingUp,
  Eye, Loader2, AlertCircle, CheckCircle, Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/services/api';
import { SkeletonList } from '../components/Loading';

interface GrowthIntelPageProps {
  user: { name: string; email: string; plan: 'free' | 'starter' | 'pro' | 'creator' } | null;
  onNavigate: (page: Page, data?: unknown[]) => void;
}

type ActiveTool = 'spy' | 'timing' | 'abtitle';

interface SpyResult {
  channelName: string;
  topFormulas: string[];
  postingFrequency: string;
  bestPerformingGame: string;
  avgViews: string;
  titlePattern: string;
  thumbnailStyle: string;
  recommendation: string;
}

interface TimingResult {
  platform: string;
  slots: { day: string; time: string; score: number; label: string }[];
  insight: string;
}

interface ABResult {
  titleA: string;
  titleB: string;
  winner: 'A' | 'B';
  scoreA: number;
  scoreB: number;
  reasoning: string;
  improvements: string[];
}

const PLATFORMS = ['TikTok', 'YouTube Shorts', 'Instagram Reels'];

export function GrowthIntelPage({ user, onNavigate }: GrowthIntelPageProps) {
  const [activeTool, setActiveTool] = useState<ActiveTool>('spy');

  // Spy
  const [channelUrl, setChannelUrl] = useState('');
  const [spyGame, setSpyGame]       = useState('');
  const [spyResult, setSpyResult]   = useState<SpyResult | null>(null);
  const [spyLoading, setSpyLoading] = useState(false);

  // Timing
  const [timingPlatform, setTimingPlatform] = useState('TikTok');
  const [timingGame, setTimingGame]         = useState('Call of Duty');
  const [timingResult, setTimingResult]     = useState<TimingResult | null>(null);
  const [timingLoading, setTimingLoading]   = useState(false);

  // A/B
  const [titleA, setTitleA] = useState('');
  const [titleB, setTitleB] = useState('');
  const [abGame, setAbGame] = useState('Call of Duty');
  const [abResult, setAbResult]   = useState<ABResult | null>(null);
  const [abLoading, setAbLoading] = useState(false);

  // ── Spy ────────────────────────────────────────────────────────────────────

  const runSpy = async () => {
    if (!channelUrl.trim()) return toast.error('Enter a YouTube channel URL');
    setSpyLoading(true); setSpyResult(null);
    try {
      const data = await apiClient.post<SpyResult>('/intel/spy', { channelUrl, game: spyGame });
      setSpyResult(data);
    } catch (e: any) {
      // 402 = insufficient credits / plan required - apiClient has already
      // fired the UPGRADE_REQUIRED event, so the modal will appear.
      if (e?.status === 402) { setSpyLoading(false); return; }
      setSpyResult(getFallbackSpy(channelUrl));
    } finally { setSpyLoading(false); }
  };

  // ── Timing ─────────────────────────────────────────────────────────────────

  const runTiming = async () => {
    setTimingLoading(true); setTimingResult(null);
    try {
      const data = await apiClient.post<TimingResult>('/intel/timing', {
        platform: timingPlatform, game: timingGame,
      });
      setTimingResult(data);
    } catch (e: any) {
      if (e?.status === 402) { setTimingLoading(false); return; }
      setTimingResult(getFallbackTiming(timingPlatform, timingGame));
    } finally { setTimingLoading(false); }
  };

  // ── A/B ────────────────────────────────────────────────────────────────────

  const runAB = async () => {
    if (!titleA.trim() || !titleB.trim()) return toast.error('Enter both titles');
    setAbLoading(true); setAbResult(null);
    try {
      const data = await apiClient.post<ABResult>('/intel/abtitle', {
        titleA, titleB, game: abGame,
      });
      setAbResult(data);
    } catch (e: any) {
      if (e?.status === 402) { setAbLoading(false); return; }
      setAbResult(getFallbackAB(titleA, titleB));
    } finally { setAbLoading(false); }
  };

  const isPro = user?.plan && ['pro', 'creator'].includes(user.plan);

  const TOOLS = [
    { key: 'spy' as ActiveTool,     label: 'Competitor Spy', icon: Eye,       locked: !isPro },
    { key: 'timing' as ActiveTool,  label: 'Best Post Time', icon: Clock,     locked: false  },
    { key: 'abtitle' as ActiveTool, label: 'A/B Title Test', icon: BarChart2, locked: false  },
  ];

  return (
    <div className="min-h-screen pt-28 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12">
      <div className="max-w-5xl mx-auto">

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-clip-text">
              Growth <span className="gradient-text">Intel</span>
            </h1>
          </div>
        </div>

        {/* Tool tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {TOOLS.map(t => (
            <button key={t.key} onClick={() => { if (!t.locked) setActiveTool(t.key); else onNavigate('pricing'); }}
              className={`p-4 rounded-xl border text-left transition-all relative ${
                activeTool === t.key
                  ? 'border-clip-cyan bg-clip-cyan/10 shadow-[0_0_16px_rgba(34, 240, 255,0.15)]'
                  : t.locked
                  ? 'border-white/[0.04] bg-clip-surface/50 opacity-60 cursor-pointer'
                  : 'border-white/[0.06] bg-clip-surface hover:border-clip-cyan/40'
              }`}>
              {t.locked && (
                <span className="absolute top-2 right-2 text-[10px] font-extrabold px-1.5 py-0.5 bg-clip-amber text-black rounded flex-shrink-0 shadow-[0_0_10px_rgba(255,149,0,0.4)]">PRO</span>
              )}
              <div className="flex items-center gap-2 mb-2 pr-10">
                <t.icon className={`w-5 h-5 flex-shrink-0 ${activeTool === t.key ? 'text-clip-cyan' : 'text-clip-icon'}`} />
                <p className={`text-sm font-bold ${activeTool === t.key ? 'text-clip-text' : 'text-clip-muted'}`}>{t.label}</p>
              </div>
            </button>
          ))}
        </div>

        {/* ── COMPETITOR SPY ── */}
        {activeTool === 'spy' && (
          <div className="space-y-6">
            <div className="card-glass p-5 space-y-4">
              <h3 className="font-display font-semibold text-clip-text flex items-center gap-2">
                <Eye className="w-4 h-4 text-clip-cyan" /> Competitor Spy
              </h3>
              <div>
                <label className="text-xs text-clip-muted uppercase tracking-wider block mb-2">YouTube Channel URL</label>
                <input type="url" value={channelUrl} onChange={e => setChannelUrl(e.target.value)}
                  placeholder="https://youtube.com/@channelname"
                  className="input-dark w-full text-sm" />
              </div>
              <div>
                <label className="text-xs text-clip-muted uppercase tracking-wider block mb-2">Their Main Game (optional)</label>
                <input type="text" value={spyGame} onChange={e => setSpyGame(e.target.value)}
                  placeholder="e.g. Free Fire"
                  className="input-dark w-full text-sm" />
              </div>
              <button onClick={runSpy} disabled={spyLoading || !channelUrl.trim()}
                className="btn-primary flex items-center gap-2 disabled:opacity-50">
                {spyLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</> : <><Search className="w-4 h-4" /> Spy on Channel</>}
              </button>
            </div>

            {spyLoading && (
              <div className="p-2">
                <SkeletonList count={4} avatar />
              </div>
            )}

            {spyResult && (
              <div className="space-y-4">
                <div className="card-glass p-5 border-clip-cyan/30 bg-clip-cyan/5 shadow-[0_0_24px_rgba(34, 240, 255,0.08)]">
                  <div className="flex items-center gap-2 mb-4">
                    <Trophy className="w-4 h-4 text-clip-cyan" />
                    <h4 className="font-display font-semibold text-clip-text">{spyResult.channelName}</h4>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {[
                      { label: 'Avg Views', value: spyResult.avgViews },
                      { label: 'Post Frequency', value: spyResult.postingFrequency },
                      { label: 'Top Game', value: spyResult.bestPerformingGame },
                    ].map(s => (
                      <div key={s.label} className="bg-clip-surface rounded-xl p-3">
                        <p className="text-clip-muted text-xs">{s.label}</p>
                        <p className="text-clip-text font-medium text-sm mt-1">{s.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card-glass p-5">
                  <h4 className="font-medium text-clip-text mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-clip-cyan" /> Their Winning Title Formula
                  </h4>
                  <p className="text-clip-muted text-sm italic bg-clip-surface px-3 py-2 rounded-lg">"{spyResult.titlePattern}"</p>
                </div>

                <div className="card-glass p-5">
                  <h4 className="font-medium text-clip-text mb-3">Top Performing Formulas</h4>
                  <div className="space-y-2">
                    {spyResult.topFormulas.map((f, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-clip-cyan font-mono text-xs mt-0.5">{i + 1}.</span>
                        <span className="text-clip-text">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card-glass p-5 border-clip-amber/30 bg-clip-amber/5 shadow-[0_0_24px_rgba(255,149,0,0.08)]">
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-clip-amber flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-clip-amber font-medium text-sm mb-1">AI Recommendation</p>
                      <p className="text-clip-text text-sm leading-relaxed">{spyResult.recommendation}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── BEST POST TIME ── */}
        {activeTool === 'timing' && (
          <div className="space-y-6">
            <div className="card-glass p-5 space-y-4">
              <h3 className="font-display font-semibold text-clip-text flex items-center gap-2">
                <Clock className="w-4 h-4 text-clip-cyan" /> Best Time to Post
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-clip-muted uppercase tracking-wider block mb-2">Platform</label>
                  <div className="space-y-2">
                    {PLATFORMS.map(p => (
                      <button key={p} onClick={() => setTimingPlatform(p)}
                        className={`w-full px-3 py-2 rounded-lg text-sm text-left transition-all ${
                          timingPlatform === p ? 'bg-clip-cyan text-black font-bold shadow-[0_0_10px_rgba(34, 240, 255,0.3)]' : 'bg-clip-surface text-clip-muted border border-white/[0.08] hover:text-clip-text'
                        }`}>{p}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-clip-muted uppercase tracking-wider block mb-2">Game</label>
                  <input type="text" value={timingGame} onChange={e => setTimingGame(e.target.value)}
                    placeholder="Your game" className="input-dark w-full text-sm" />
                </div>
              </div>
              <button onClick={runTiming} disabled={timingLoading}
                className="btn-primary flex items-center gap-2 disabled:opacity-50">
                {timingLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Calculating…</> : <><Clock className="w-4 h-4" /> Get Best Times</>}
              </button>
            </div>

            {timingLoading && (
              <div className="p-2">
                <SkeletonList count={4} avatar />
              </div>
            )}

            {timingResult && (
              <div className="space-y-4">
                <div className="card-glass overflow-hidden">
                  <div className="p-4 border-b border-white/[0.025]">
                    <p className="font-medium text-clip-text">{timingResult.platform} — Nigeria (WAT)</p>
                  </div>
                  <div className="divide-y divide white/[0.02]">
                    {timingResult.slots.map((slot, i) => (
                      <div key={i} className="flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3">
                        <span className="text-clip-muted text-xs sm:text-sm w-16 sm:w-20 font-medium flex-shrink-0">{slot.day}</span>
                        <span className="text-clip-text font-mono text-xs sm:text-sm flex-shrink-0 whitespace-nowrap">{slot.time} WAT</span>
                        <div className="flex-1 mx-2 sm:mx-4 h-2 bg-clip-surface rounded-full overflow-hidden min-w-0">
                          <div className={`h-full rounded-full ${
                            slot.score >= 85 ? 'bg-clip-cyan' : slot.score >= 70 ? 'bg-green-600' : 'bg-clip-amber'
                          }`} style={{ width: `${slot.score}%` }} />
                        </div>
                        <span className={`text-xs font-medium flex-shrink-0 px-2 py-0.5 rounded whitespace-nowrap ${
                          slot.label === 'PEAK' ? 'bg-clip-cyan/6 text-clip-cyan' :
                          slot.label === 'GREAT' ? 'bg-green-500/10 text-green-600' :
                          'bg-clip-amber/10 text-clip-amber'
                        }`}>{slot.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card-glass p-4 border-clip-cyan/20 bg-clip-cyan/3 flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-clip-cyan flex-shrink-0 mt-0.5" />
                  <p className="text-clip-text text-sm">{timingResult.insight}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── A/B TITLE TEST ── */}
        {activeTool === 'abtitle' && (
          <div className="space-y-6">
            <div className="card-glass p-5 space-y-4">
              <h3 className="font-display font-semibold text-clip-text flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-clip-cyan" /> A/B Title Predictor
              </h3>
              <div className="space-y-3">
                {[
                  { label: 'Title A', value: titleA, set: setTitleA, placeholder: 'e.g. I got a 1v4 clutch in Bloodstrike 😤' },
                  { label: 'Title B', value: titleB, set: setTitleB, placeholder: 'e.g. Nobody expected this Bloodstrike moment 💀' },
                ].map(t => (
                  <div key={t.label}>
                    <label className="text-xs text-clip-muted uppercase tracking-wider block mb-1">{t.label}</label>
                    <input type="text" value={t.value} onChange={e => t.set(e.target.value)}
                      placeholder={t.placeholder} className="input-dark w-full text-sm" />
                  </div>
                ))}
                <div>
                  <label className="text-xs text-clip-muted uppercase tracking-wider block mb-1">Game</label>
                  <input type="text" value={abGame} onChange={e => setAbGame(e.target.value)}
                    placeholder="e.g. Bloodstrike" className="input-dark w-full text-sm" />
                </div>
              </div>
              <button onClick={runAB} disabled={abLoading || !titleA.trim() || !titleB.trim()}
                className="btn-primary flex items-center gap-2 disabled:opacity-50">
                {abLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Predicting…</> : <><Zap className="w-4 h-4" /> Predict Winner</>}
              </button>
            </div>

            {abLoading && (
              <div className="p-2">
                <SkeletonList count={4} avatar />
              </div>
            )}

            {abResult && (
              <div className="space-y-4">
                {/* Winner banner */}
                <div className={`card-glass p-5 flex items-center gap-4 ${
                  abResult.winner === 'A' ? 'border-clip-cyan/30 bg-clip-cyan/3' : 'border-clip-amber/30 bg-clip-amber/3'
                }`}>
                  <CheckCircle className="w-6 h-6 text-clip-cyan flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-clip-cyan font-bold">Title {abResult.winner} wins! 🏆</p>
                    <p className="text-clip-text text-sm mt-1 break-words">"{abResult.winner === 'A' ? abResult.titleA : abResult.titleB}"</p>
                  </div>
                </div>

                {/* Scores */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { label: 'Title A', title: abResult.titleA, score: abResult.scoreA, winner: abResult.winner === 'A' },
                    { label: 'Title B', title: abResult.titleB, score: abResult.scoreB, winner: abResult.winner === 'B' },
                  ].map(s => (
                    <div key={s.label} className={`card-glass p-4 ${s.winner ? 'border-clip-cyan/30' : ''}`}>
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <span className={`text-sm font-bold flex-shrink-0 ${s.winner ? 'text-clip-cyan' : 'text-clip-muted'}`}>{s.label}</span>
                        <span className={`text-lg font-display font-bold flex-shrink-0 ${s.winner ? 'text-clip-cyan' : 'text-clip-muted'}`}>{s.score}</span>
                      </div>
                      <div className="h-2 bg-clip-surface rounded-full overflow-hidden mb-3">
                        <div className={`h-full rounded-full ${s.winner ? 'bg-clip-cyan' : 'bg-clip-muted/30'}`}
                          style={{ width: `${s.score}%` }} />
                      </div>
                      <p className="text-clip-muted text-xs leading-snug line-clamp-2 break-words">{s.title}</p>
                    </div>
                  ))}
                </div>

                {/* Reasoning */}
                <div className="card-glass p-5">
                  <p className="font-medium text-clip-text mb-2">Why Title {abResult.winner} wins</p>
                  <p className="text-clip-muted text-sm leading-relaxed">{abResult.reasoning}</p>
                </div>

                {/* Improvements */}
                <div className="card-glass p-5">
                  <p className="font-medium text-clip-text mb-3">How to make it even better</p>
                  <div className="space-y-2">
                    {abResult.improvements.map((imp, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <TrendingUp className="w-3 h-3 text-clip-cyan flex-shrink-0 mt-1" />
                        <span className="text-clip-text">{imp}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Fallbacks ─────────────────────────────────────────────────────────────────

function getFallbackSpy(url: string): SpyResult {
  const name = url.split('@')[1]?.split('/')[0] ?? 'Creator';
  return {
    channelName: name,
    avgViews: '45K,280K',
    postingFrequency: '5 to 7 videos/week',
    bestPerformingGame: 'Call of Duty / Bloodstrike',
    titlePattern: '[Action verb] + [game] + [number/outcome] + [emoji] , e.g. "I CLUTCHED a 1v5 in COD 😤"',
    thumbnailStyle: 'High contrast face reaction + big bold text + game UI in background',
    topFormulas: [
      'Emotional reaction title: "I can\'t believe this happened in [game]…"',
      'Challenge format: "Only using [weapon/item] in [game] for 24 hours"',
      'Result reveal: "[X] kills with [Y] weapon: new personal record 🔥"',
      'Controversy hook: "[game] devs don\'t want you to know this trick"',
      'POV format: "POV: you\'re the last player alive and it\'s all on you"',
    ],
    recommendation: `${name} posts daily and uses short emotional hooks consistently. Their biggest wins come from challenge videos and extreme clutch moments. Try posting challenge content 2x/week and clutch highlights 3x/week. Match their title length (6–12 words max).`,
  };
}

function getFallbackTiming(platform: string, game: string): TimingResult {
  return {
    platform,
    slots: [
      { day: 'Friday',   time: '7:00 PM , 9:00 PM',  score: 96, label: 'PEAK'  },
      { day: 'Saturday', time: '3:00 PM , 11:00 PM',  score: 94, label: 'PEAK'  },
      { day: 'Sunday',   time: '2:00 PM , 8:00 PM',   score: 91, label: 'PEAK'  },
      { day: 'Thursday', time: '7:00 PM , 9:00 PM',   score: 82, label: 'GREAT' },
      { day: 'Monday',   time: '8:00 PM , 10:00 PM',  score: 71, label: 'GREAT' },
      { day: 'Wednesday',time: '7:30 PM , 9:30 PM',   score: 68, label: 'GOOD'  },
      { day: 'Tuesday',  time: '7:00 PM , 9:00 PM',   score: 62, label: 'GOOD'  },
    ],
    insight: `For ${game} on ${platform} in Nigeria: Friday and weekend evenings (7–10 PM WAT) deliver 40–60% more impressions than weekday mornings. Nigerian teens are most active after school and before midnight. Avoid 6 AM–3 PM on weekdays.`,
  };
}

function getFallbackAB(titleA: string, titleB: string): ABResult {
  const scoreA = Math.floor(Math.random() * 25) + 65;
  const scoreB = Math.floor(Math.random() * 25) + 65;
  const winner = scoreA >= scoreB ? 'A' : 'B';
  return {
    titleA, titleB, winner,
    scoreA: Math.max(scoreA, winner === 'A' ? scoreB + 5 : scoreA),
    scoreB: Math.max(scoreB, winner === 'B' ? scoreA + 5 : scoreB),
    reasoning: `Title ${winner} wins because it uses a stronger emotional hook in the opening words, which increases the chance of a stop-scroll reaction. It also contains more specific detail that sets expectations — viewers who click are more likely to watch till the end, boosting retention metrics.`,
    improvements: [
      'Add an emoji in the first 4 words: increases CTR by ~15% on mobile',
      'Include a specific number (kills, seconds, HP) to make it more concrete',
      'End with a question or cliffhanger to drive comment engagement',
    ],
  };
}
