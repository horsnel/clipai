import { useState, useEffect, useCallback } from 'react';
import type { Page } from '../App';
import { Zap, Copy, ThumbsUp, Loader2,
  Hash, Type, Sparkles, ChevronRight, CheckCheck,
  TrendingUp, Flame, Trophy, Crown, ListOrdered,
  Music, MessageSquare, Ghost,
} from 'lucide-react';
import { toast } from 'sonner';
import { voteOnCaption, getTopCaptions, apiClient, analyseYouTube, getAnalysis } from '@/services/api';
import { SkeletonList, SkeletonShimmer } from '../components/Loading';
import { AnalysisCards } from '../components/AnalysisCards';
import { ComparePanel } from '../components/ComparePanel';
import { PlaylistPanel } from '../components/PlaylistPanel';
import { AudioTrendPanel } from '../components/AudioTrendPanel';
import { CommentsPanel } from '../components/CommentsPanel';
import { ShadowPanel } from '../components/ShadowPanel';
import { consumePendingAnalysisId } from '@/lib/navState';
import type { UnifiedAnalysis } from '../types';
import { InfoIconPopup } from '@/components/InfoIconPopup';
import { PlatformIcon } from '@/components/BrandIcons';

interface ViralForgePageProps {
  user: { name: string; email: string; plan: 'free' | 'starter' | 'pro' | 'creator' } | null;
  onNavigate: (page: Page, data?: unknown[]) => void;
}

type ActiveTool = 'titles' | 'captions' | 'hashtags' | 'hooks' | 'analysis' | 'compare' | 'playlist' | 'audio' | 'comments' | 'shadow';

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

// Use the shared apiClient so auth header is sent + 402s auto-trigger UpgradeModal.
async function callForge(endpoint: string, body: object): Promise<any> {
  return apiClient.post(endpoint, body);
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

  // Deep analysis (Phase 1)
  const [ytUrl, setYtUrl]             = useState('');
  const [analysis, setAnalysis]       = useState<UnifiedAnalysis | null>(null);
  const [analysisMeta, setAnalysisMeta] = useState<{ title?: string; author?: string; ms?: number; cached?: boolean; videoId?: string; url?: string } | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // Top voted captions (community battle board)
  const [topCaptions, setTopCaptions] = useState<Array<{
    caption: string; net_votes: number; game?: string; vibe?: string;
  }>>([]);
  const [votedSet, setVotedSet]       = useState<Set<string>>(new Set());

  const fetchTopCaptions = useCallback(async () => {
    try {
      const data = await getTopCaptions();
      setTopCaptions(data.captions ?? []);
    } catch {
      // Silent fail — battle board is supplementary
      setTopCaptions([]);
    }
  }, []);

  useEffect(() => { fetchTopCaptions(); }, [fetchTopCaptions]);

  // ── Re-open a saved analysis from Dashboard (no credit charge) ────────────
  // When the user clicks a row in RecentAnalysesWidget on the Dashboard, we
  // stash the analysis_id in navState and navigate here. On mount, consume
  // the id, fetch the saved JSON, switch to the Deep Analysis tab, and render
  // the cards instantly — no LLM call, no credit spend.
  useEffect(() => {
    const pendingId = consumePendingAnalysisId();
    if (!pendingId) return;
    setActiveTool('analysis');
    setAnalysisLoading(true);
    setAnalysis(null);
    setAnalysisMeta(null);
    getAnalysis(pendingId)
      .then((res) => {
        const row = res.analysis as any;
        if (!row || !row.analysis_raw) {
          toast.error('Could not load that analysis');
          return;
        }
        let parsed: UnifiedAnalysis;
        try {
          parsed = typeof row.analysis_raw === 'string'
            ? JSON.parse(row.analysis_raw)
            : row.analysis_raw;
        } catch {
          toast.error('Saved analysis was corrupt');
          return;
        }
        setAnalysis(parsed);
        setAnalysisMeta({
          title: row.video_title,
          author: row.video_author,
          ms: row.processing_ms,
          cached: true,
          videoId: row.source_video_id,
          url: row.source_url,
        });
        // Pre-fill the URL box with the source so a re-run is one click away
        if (row.source_url) setYtUrl(row.source_url);
        toast.success('Re-opened saved analysis — no credit charged');
      })
      .catch((e: any) => {
        toast.error(e?.message || 'Could not load that analysis');
      })
      .finally(() => setAnalysisLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    (activeTool === 'titles'    && titles.length > 0)   ||
    (activeTool === 'captions'  && captions.length > 0) ||
    (activeTool === 'hashtags'  && hashtags.length > 0) ||
    (activeTool === 'hooks'     && hooks.length > 0)    ||
    (activeTool === 'analysis'  && analysis !== null);

  const TOOLS: { key: ActiveTool; label: string; icon: typeof Type; desc: string }[] = [
    { key: 'analysis', label: 'Deep Analysis', icon: Sparkles, desc: 'Paste a YouTube URL → 14 outputs' },
    { key: 'compare',  label: 'Compare',       icon: Trophy,    desc: 'Head-to-head competitor analysis' },
    { key: 'playlist', label: 'Playlist',      icon: ListOrdered, desc: 'Sequence + distribute 2–10 videos' },
    { key: 'audio',    label: 'Audio Sync',    icon: Music,     desc: 'Match clip to trending sounds + beat drops' },
    { key: 'comments', label: 'Comments',      icon: MessageSquare, desc: 'Predict viewer reactions + pinned comment' },
    { key: 'shadow',   label: 'Shadow Editor', icon: Ghost,     desc: 'Faceless-creator voiceover script from any URL' },
    { key: 'titles',   label: 'Title Forge',   icon: TrendingUp, desc: 'SEO-optimised viral titles ranked by score' },
    { key: 'captions', label: 'Caption Battle',icon: Flame,      desc: 'Generate & vote your best caption' },
    { key: 'hashtags', label: 'Hashtag Pack',  icon: Hash,       desc: 'Perfectly sized hashtag combos' },
    { key: 'hooks',    label: 'Hook Library',  icon: Type,       desc: 'Addictive opening lines for your video' },
  ];

  // Tools that manage their own input panel (no left-column input UI)
  const SELF_MANAGED_TOOLS: ActiveTool[] = ['compare', 'playlist', 'audio', 'comments', 'shadow'];
  const isSelfManaged = SELF_MANAGED_TOOLS.includes(activeTool);

  // ── Deep analysis: paste URL → /api/analyse/youtube → 14 cards ───────────
  const runAnalysis = async () => {
    if (!ytUrl.trim()) {
      toast.error('Paste a YouTube URL first');
      return;
    }
    setAnalysisLoading(true);
    setAnalysis(null);
    setAnalysisMeta(null);
    try {
      const res = await analyseYouTube(ytUrl.trim(), selectedGame);
      if (res.error) {
        toast.error(res.error);
      } else if (res.analysis) {
        setAnalysis(res.analysis);
        setAnalysisMeta({
          title: res.video?.title,
          author: res.video?.author,
          ms: res.processing_ms,
          cached: res.cached,
          videoId: res.video?.video_id,
          url: ytUrl.trim(),
        });
        toast.success(res.cached ? 'Loaded cached analysis' : `Analysis done in ${((res.processing_ms ?? 0) / 1000).toFixed(1)}s`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Analysis failed');
    } finally {
      setAnalysisLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-28 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-clip-text">
              Viral <span className="gradient-text">Forge</span>
            </h1>
            <InfoIconPopup label="What is Viral Forge?" size="md" className="ml-1">
              AI-powered titles, captions, hooks &amp; hashtags — built to go viral
            </InfoIconPopup>
          </div>
        </div>

        {/* Tool tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
          {TOOLS.map(t => (
            <button key={t.key} onClick={() => { setActiveTool(t.key); setTitles([]); setCaptions([]); setHashtags([]); setHooks([]); }}
              className={`p-4 rounded-xl border text-left transition-all ${
                activeTool === t.key
                  ? 'border-clip-cyan/50 bg-clip-cyan/3'
                  : 'border-white/[0.025] bg-clip-surface hover:border-white/[0.025]'
              }`}>
              <t.icon className={`w-5 h-5 mb-2 ${activeTool === t.key ? 'text-clip-cyan' : 'text-clip-muted'}`} />
              <div className="flex items-center gap-1">
                <p className={`text-sm font-medium ${activeTool === t.key ? 'text-clip-text' : 'text-clip-muted'}`}>{t.label}</p>
                <InfoIconPopup label={`What is ${t.label}?`} size="sm">
                  {t.desc}
                </InfoIconPopup>
              </div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Input panel — hidden for self-managed tools (Compare/Playlist/Audio/Comments/Shadow) which have their own inputs */}
          {!isSelfManaged && (
          <div className="lg:col-span-2 space-y-4">
            <div className="card-glass p-5 space-y-4">
              {activeTool === 'analysis' ? (
                <>
                  <div>
                    <label className="text-sm font-medium text-clip-text block mb-2 flex items-center gap-2">
                      <PlatformIcon platform="youtube" className="w-4 h-4 text-clip-cyan" />
                      YouTube URL
                      <InfoIconPopup label="How it works" size="sm" className="ml-1">
                        Paste any YouTube video URL with English captions. We analyze the transcript and return 14 viral strategy outputs in one shot — costs 5 credits.
                      </InfoIconPopup>
                    </label>
                    <input
                      type="url"
                      value={ytUrl}
                      onChange={e => setYtUrl(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !analysisLoading) runAnalysis(); }}
                      placeholder="https://youtube.com/watch?v=…  or  https://youtu.be/…"
                      className="input-dark w-full text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-clip-muted uppercase tracking-wider block mb-2">Game (optional)</label>
                    <div className="grid grid-cols-2 gap-2">
                      {GAMES.map(g => (
                        <button key={g} onClick={() => setSelectedGame(g)}
                          className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                            selectedGame === g ? 'bg-clip-cyan text-black' : 'bg-clip-surface text-clip-muted border border-white/[0.025] hover:text-clip-text'
                          }`}>{g}</button>
                      ))}
                    </div>
                  </div>

                  <button onClick={runAnalysis} disabled={analysisLoading || !ytUrl.trim()}
                    className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                    {analysisLoading
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing transcript…</>
                      : <><Sparkles className="w-4 h-4" /> Run Deep Analysis (5 credits)</>
                    }
                  </button>
                </>
              ) : (
                <>
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
                            selectedGame === g ? 'bg-clip-cyan text-black' : 'bg-clip-surface text-clip-muted border border-white/[0.025] hover:text-clip-text'
                          }`}>{g}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {activeTool === 'captions' && (
                <div>
                  <label className="text-xs text-clip-muted uppercase tracking-wider block mb-2">Vibe</label>
                  <div className="grid grid-cols-2 gap-2">
                    {VIBES.map(v => (
                      <button key={v} onClick={() => setSelectedVibe(v)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          selectedVibe === v ? 'bg-clip-cyan text-black' : 'bg-clip-surface text-clip-muted border border-white/[0.025] hover:text-clip-text'
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
                          selectedPlatform === p ? 'bg-clip-cyan text-black' : 'bg-clip-surface text-clip-muted border border-white/[0.025] hover:text-clip-text'
                        }`}>{p}</button>
                    ))}
                  </div>
                </div>
              )}

              {activeTool !== 'analysis' && (
                <button onClick={handleGenerate} disabled={isLoading || !clipDesc.trim()}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                  {isLoading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                    : <><Zap className="w-4 h-4" /> Generate</>
                  }
                </button>
              )}
            </div>

            {/* Viral score legend */}
            <div className="card-glass p-4">
              <p className="text-xs text-clip-muted uppercase tracking-wider mb-3">Viral Score Guide</p>
              <div className="space-y-2">
                {[
                  { range: '90–100', label: 'GOD TIER 🏆', color: 'text-clip-amber' },
                  { range: '75–89',  label: 'Banger 🔥',   color: 'text-clip-cyan' },
                  { range: '60–74',  label: 'Solid 👍',    color: 'text-green-600' },
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
          )}

          {/* Results panel — spans full width when self-managed (no input column) */}
          <div className={isSelfManaged ? 'lg:col-span-5' : 'lg:col-span-3'}>
            {/* ── COMPARE (Phase 2) ── */}
            {activeTool === 'compare' && (
              <ComparePanel user={user} onNavigate={onNavigate} />
            )}

            {/* ── PLAYLIST (Phase 3) ── */}
            {activeTool === 'playlist' && (
              <PlaylistPanel user={user} onNavigate={onNavigate} />
            )}

            {/* ── AUDIO TREND SYNC (Phase 4) ── */}
            {activeTool === 'audio' && (
              <AudioTrendPanel user={user} onNavigate={onNavigate} />
            )}

            {/* ── PREDICTIVE COMMENTS (Phase 4) ── */}
            {activeTool === 'comments' && (
              <CommentsPanel user={user} onNavigate={onNavigate} />
            )}

            {/* ── SHADOW EDITOR (Phase 4) ── */}
            {activeTool === 'shadow' && (
              <ShadowPanel user={user} onNavigate={onNavigate} />
            )}

            {/* ── DEEP ANALYSIS ── */}
            {activeTool === 'analysis' && (
              <div className="space-y-3">
                {analysisLoading ? (
                  <div className="card-glass p-5">
                    <div className="flex items-center gap-2 mb-4 text-clip-muted text-xs">
                      <div className="w-3 h-3 border border-clip-cyan border-t-transparent rounded-full animate-spin" />
                      Fetching transcript → running unified analysis → 14 outputs…
                    </div>
                    <SkeletonList count={5} avatar />
                  </div>
                ) : analysis ? (
                  <AnalysisCards
                    analysis={analysis}
                    videoTitle={analysisMeta?.title}
                    videoAuthor={analysisMeta?.author}
                    videoId={analysisMeta?.videoId}
                    videoUrl={analysisMeta?.url}
                    processingMs={analysisMeta?.ms}
                    cached={analysisMeta?.cached}
                  />
                ) : (
                  <div className="card-glass p-8 text-center">
                    <Sparkles className="w-10 h-10 mx-auto mb-3 text-clip-muted opacity-30" />
                    <p className="text-clip-text text-sm font-medium mb-1">Paste a YouTube URL to start</p>
                    <p className="text-clip-muted text-xs leading-relaxed max-w-sm mx-auto">
                      We'll fetch the transcript, run a single unified AI pass, and return 14 viral strategy outputs: Hook Score, title variants, sentiment arc, hidden gem angles, distribution pack, thumbnail concepts, pinned comment tree, and more.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── TITLES ── */}
            {activeTool === 'titles' && (
              <div className="space-y-3">
                {!hasResults ? (
                  <EmptyState label="titles" loading={isLoading} />
                ) : titles.map((title, i) => (
                  <div key={title.id} className="card-glass p-4 hover:border-white/[0.025] transition-all group">
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
                            title.trend === 'rising' ? 'text-green-600' : title.trend === 'declining' ? 'text-red-600' : 'text-clip-muted'
                          }`}>{title.trend === 'rising' ? '↑' : title.trend === 'declining' ? '↓' : '→'} {title.trend}</span>
                        </div>
                      </div>
                      <button onClick={() => copy(title.text, title.id)}
                        className="p-2 rounded-lg text-clip-muted hover:text-clip-cyan hover:bg-clip-cyan/6 transition-all flex-shrink-0">
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
                  <EmptyState label="captions" loading={isLoading} />
                ) : (
                  <>
                    {battlePair && !battleWinner && (
                      <div className="card-glass p-5 border-clip-amber/20 bg-clip-amber/3">
                        <p className="text-clip-amber text-sm font-medium mb-4 flex items-center gap-2">
                          <Flame className="w-4 h-4" /> Caption Battle — pick the better one!
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {battlePair.map(cap => (
                            <button key={cap.id} onClick={() => handleBattleVote(cap)}
                              className="card-glass p-4 text-left hover:border-clip-amber/40 hover:bg-clip-amber/3 transition-all group">
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
                      <div className="card-glass p-4 border-green-500/30 bg-green-500/5 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">🏆</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-green-600 text-xs font-medium mb-1">Winner!</p>
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
                        <div key={cap.id} className="card-glass p-4 group hover:border-white/[0.025] transition-all">
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
                              className="p-2 rounded-lg text-clip-muted hover:text-clip-cyan hover:bg-clip-cyan/6 transition-all flex-shrink-0">
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
                  <EmptyState label="hashtags" loading={isLoading} />
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
                            i < 3 ? 'border-clip-cyan/30 bg-clip-cyan/6 text-clip-cyan' :
                            i < 8 ? 'border-white/[0.02] bg-clip-surface text-clip-text hover:border-clip-cyan/30' :
                            'border-white/[0.02] bg-clip-surface/50 text-clip-muted hover:text-clip-text'
                          }`}>
                          {tag}
                          {copiedId === `tag-${i}` && <CheckCheck className="w-3 h-3 inline ml-1 text-clip-cyan" />}
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/[0.025] flex items-center gap-4 text-xs text-clip-muted">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-clip-cyan/30 inline-block" /> Mega (high reach)</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-clip-surface border border-white/[0.02] inline-block" /> Mid-tier</span>
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
                  <EmptyState label="hooks" loading={isLoading} />
                ) : hooks.map((hook, i) => (
                  <div key={i} className="card-glass p-4 group hover:border-white/[0.025] transition-all">
                    <div className="flex items-start gap-3">
                      <span className="text-clip-cyan font-mono text-xs mt-1 flex-shrink-0">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <p className="flex-1 text-clip-text text-sm leading-relaxed">{hook}</p>
                      <button onClick={() => copy(hook, `hook-${i}`)}
                        className="p-2 rounded-lg text-clip-muted hover:text-clip-cyan hover:bg-clip-cyan/6 transition-all flex-shrink-0">
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
                    i === 0 ? 'border-clip-amber/30 bg-clip-amber/3' : ''
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
                            : 'text-clip-muted hover:text-green-600 hover:bg-green-500/10'
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
              <div className="flex items-center gap-2">
                <p className="text-clip-text font-medium text-sm">Unlimited generations + priority AI</p>
                <InfoIconPopup label="Why upgrade?" size="sm" className="ml-1">
                  Free plan: 5 generations/day. Pro: unlimited ViralForge + ClipBot access.
                </InfoIconPopup>
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
                score >= 75 ? 'text-clip-cyan bg-clip-cyan/6' :
                score >= 60 ? 'text-green-600 bg-green-500/10' :
                              'text-clip-muted bg-clip-surface';
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>
      ⚡ {score}
    </span>
  );
}

function EmptyState({ label, loading }: { label: string; loading?: boolean }) {
  if (loading) {
    return (
      <div className="card-glass p-5">
        <div className="flex items-center gap-2 mb-4 text-clip-muted text-xs">
          <div className="w-3 h-3 border border-clip-cyan border-t-transparent rounded-full animate-spin" />
          Crafting {label}…
        </div>
        <div className="space-y-3">
          {[0, 1, 2, 3].map(i => (
            <SkeletonShimmer key={i} lines={2} avatar />
          ))}
        </div>
      </div>
    );
  }
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
