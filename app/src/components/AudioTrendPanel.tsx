import { useState } from 'react';
import {
  Copy, Check, Music, Zap, AlertTriangle,
  Volume2, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { analyseAudioTrend } from '@/services/api';
import type { AudioTrendResponse, AudioTrendResult } from '../types';
import { SkeletonList } from './Loading';
import { PlatformIcon } from './BrandIcons';

interface AudioTrendPanelProps {
  user: { plan: string } | null;
  onNavigate?: (page: 'pricing') => void;
}

/**
 * AudioTrendPanel — Phase 4 Audio Trend Sync.
 *
 * One URL input → 3 credits → returns:
 *   - trending_sounds (5-8 plausible trending audio suggestions)
 *   - sync_points (3-5 beat-drop timestamps with cut/zoom/freeze actions)
 *   - alt_genres (3 alternative audio genres)
 *   - miss_warning (what happens if you upload without trending audio)
 */
export function AudioTrendPanel({ user: _user, onNavigate: _onNavigate }: AudioTrendPanelProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AudioTrendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const run = async () => {
    if (!url.trim()) {
      toast.error('Paste a YouTube URL first');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await analyseAudioTrend(url.trim());
      setResult(data);
      toast.success(`Done in ${Math.round((data.processing_ms || 0) / 1000)}s · ${data.credits_remaining} credits left`);
    } catch (e: any) {
      const msg = e?.message || 'Audio trend analysis failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Copied!');
    setTimeout(() => setCopiedKey(null), 1500);
  };

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <SkeletonList count={3} avatar />
        <p className="text-clip-muted text-sm mt-4 text-center max-w-md">
          Fetching transcript + matching audio trends.<br />
          <span className="text-xs">Takes 8 to 15 seconds if cached, longer if new.</span>
        </p>
      </div>
    );
  }

  // ─── Error ──────────────────────────────────────────────────────────────────
  if (error && !result) {
    return (
      <div className="card-glass p-8 text-center">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-clip-amber" />
        <p className="font-display font-medium text-clip-text mb-1">Couldn't run audio analysis</p>
        <p className="text-clip-muted text-sm mb-4 max-w-md mx-auto">{error}</p>
        <button onClick={() => { setError(null); }} className="btn-primary text-sm px-4 py-2 inline-flex items-center gap-2">
          Try again
        </button>
      </div>
    );
  }

  // ─── Empty ──────────────────────────────────────────────────────────────────
  if (!result) {
    return (
      <div className="card-glass p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-clip-cyan/6 flex items-center justify-center flex-shrink-0">
            <Music className="w-5 h-5 text-clip-cyan" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-clip-text">Audio Trend Sync</h3>
            <p className="text-clip-muted text-xs">Match your clip to what's trending on TikTok / Reels / Shorts</p>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-clip-text block mb-2 flex items-center gap-2">
            <PlatformIcon platform="youtube" className="w-4 h-4 text-clip-cyan" />
            YouTube URL
          </label>
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !loading) run(); }}
            placeholder="https://youtube.com/watch?v=…"
            className="input-dark w-full text-sm"
          />
          <p className="text-xs text-clip-muted mt-2">
            We'll analyze the transcript and suggest trending audio, beat-drop sync points, and alternative genres.
            Costs <span className="text-clip-amber font-medium">3 credits</span>.
          </p>
        </div>

        <button onClick={run} disabled={loading || !url.trim()}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
          <Sparkles className="w-4 h-4" /> Sync Audio Trends
        </button>
      </div>
    );
  }

  // ─── Result ──────────────────────────────────────────────────────────────────
  const r: AudioTrendResult = result.audio_trend;

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const VIBE_COLORS: Record<string, string> = {
    hype: 'text-clip-amber bg-clip-amber/10 border-clip-amber/20',
    emotional: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    comedic: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    cinematic: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    chill: 'text-green-400 bg-green-500/10 border-green-500/20',
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card-glass p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-clip-cyan/6 flex items-center justify-center flex-shrink-0">
            <Music className="w-5 h-5 text-clip-cyan" />
          </div>
          <div className="min-w-0">
            <p className="font-display font-semibold text-clip-text truncate">
              {result.video.title}
            </p>
            <p className="text-clip-muted text-xs">{result.video.author}</p>
          </div>
        </div>
        {result.cached_analysis && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-clip-cyan bg-clip-cyan/6 px-1.5 py-0.5 rounded border border-clip-cyan/20 flex-shrink-0">
            Cached
          </span>
        )}
      </div>

      {/* Trending Sounds */}
      <div className="card-glass p-5">
        <h4 className="font-display font-semibold text-clip-text mb-4 flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-clip-cyan" /> Trending Sounds
        </h4>
        <ul className="space-y-3">
          {(r.trending_sounds || []).map((s, i) => (
            <li key={i} className="p-3 rounded-lg bg-clip-surface border border-white/[0.02]">
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <p className="font-medium text-sm text-clip-text">{s.name}</p>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${VIBE_COLORS[s.vibe] || 'text-clip-muted bg-clip-surface border-white/[0.02]'} flex-shrink-0`}>
                  {s.vibe}
                </span>
              </div>
              <p className="text-xs text-clip-muted mb-1.5">{s.why_it_fits}</p>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-clip-text/80 italic flex-1 min-w-0">"{s.usage_tip}"</p>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {(s.platform_fit || []).map(p => (
                    <span key={p} className="text-[9px] uppercase tracking-wider text-clip-muted bg-clip-dark px-1 py-0.5 rounded">
                      {p}
                    </span>
                  ))}
                  <button onClick={() => copy(`${s.name} — ${s.usage_tip}`, `s${i}`)}
                    className="text-clip-muted hover:text-clip-cyan p-1 transition-colors">
                    {copiedKey === `s${i}` ? <Check className="w-3 h-3 text-clip-cyan" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Sync Points */}
      <div className="card-glass p-5">
        <h4 className="font-display font-semibold text-clip-text mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-clip-amber" /> Beat-Drop Sync Points
        </h4>
        <ul className="space-y-2">
          {(r.sync_points || []).map((sp, i) => (
            <li key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-clip-surface border border-white/[0.02]">
              <span className="font-mono text-clip-amber text-sm w-12 flex-shrink-0">{fmtTime(sp.t)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-clip-text">{sp.label}</p>
                <p className="text-xs text-clip-muted mt-0.5">{sp.why}</p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-clip-cyan bg-clip-cyan/6 px-1.5 py-0.5 rounded border border-clip-cyan/20 flex-shrink-0">
                {sp.beat_action}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Alt Genres */}
      <div className="card-glass p-5">
        <h4 className="font-display font-semibold text-clip-text mb-4 flex items-center gap-2">
          <Music className="w-4 h-4 text-clip-cyan" /> Alternative Genres
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(r.alt_genres || []).map((g, i) => (
            <div key={i} className="p-3 rounded-lg bg-clip-surface border border-white/[0.02]">
              <p className="font-medium text-sm text-clip-text mb-1">{g.genre}</p>
              <p className="text-xs text-clip-muted mb-1"><span className="text-clip-text/70">Best for:</span> {g.best_for}</p>
              <p className="text-xs text-clip-muted"><span className="text-clip-text/70">Risk:</span> {g.risk}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Miss Warning */}
      <div className="card-glass p-5 border-clip-amber/20">
        <h4 className="font-display font-semibold text-clip-amber mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> If You Skip Trending Audio
        </h4>
        <p className="text-sm text-clip-text/90 leading-relaxed">{r.miss_warning}</p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => { setResult(null); setUrl(''); }}
          className="text-clip-muted hover:text-clip-cyan text-xs flex items-center gap-1.5 transition-colors">
          Analyze another video
        </button>
        <span className="text-clip-muted text-xs">{result.credits_remaining} credits left</span>
      </div>
    </div>
  );
}
