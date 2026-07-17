import { useState, useEffect } from 'react';
import type { Page } from '../App';
import {
  Clock, Play, ChevronRight, Flame, ExternalLink, Sparkles, X,
} from 'lucide-react';
import { listAnalyses } from '@/services/api';
import { PlatformIcon } from './BrandIcons';
import type { AnalysisSummary } from '../types';

interface RecentAnalysesWidgetProps {
  /** How many rows to show. Default 5. */
  limit?: number;
  /** Navigation callback. */
  onNavigate?: (page: Page) => void;
  /** Optional: callback to re-open a saved analysis (future use). */
  onReopen?: (analysis: AnalysisSummary) => void;
  /** Optional className. */
  className?: string;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

/**
 * RecentAnalysesWidget — lists the user's past Deep Analyses.
 *
 * Each row shows the video thumbnail, title, author, hook score, time-ago,
 * and a button to re-open it. Powered by GET /api/analyses.
 *
 * Because analyses are cached server-side (one row per URL per 24h),
 * re-opening is free — no credit charge.
 */
export function RecentAnalysesWidget({
  limit = 5,
  onNavigate,
  onReopen,
  className = '',
}: RecentAnalysesWidgetProps) {
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [state, setState] = useState<LoadState>('idle');
  const [playingId, setPlayingId] = useState<string | null>(null);

  const load = async () => {
    setState(s => (s === 'idle' ? 'loading' : 'ready'));
    try {
      const data = await listAnalyses(limit, 0);
      setAnalyses(data.analyses || []);
      setState(data.analyses && data.analyses.length > 0 ? 'ready' : 'empty');
    } catch (err) {
      console.error('[RecentAnalysesWidget]', err);
      setState('error');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  // Lock body scroll while the player modal is open
  useEffect(() => {
    if (playingId) {
      document.body.style.overflow = 'hidden';
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlayingId(null); };
      window.addEventListener('keydown', onKey);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', onKey);
      };
    }
  }, [playingId]);

  // The currently playing analysis row (so we can pull its title + id)
  const playingAnalysis = playingId ? analyses.find(a => a.id === playingId) : null;

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const timeAgo = (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  };

  const HookScoreBadge = ({ score }: { score: number | null }) => {
    if (score === null || score === undefined) {
      return (
        <span className="text-[10px] font-medium text-clip-muted px-1.5 py-0.5 rounded bg-clip-surface border border-white/[0.02]">
          —
        </span>
      );
    }
    const s = Math.round(score);
    if (s >= 8) {
      return (
        <span className="text-[10px] font-bold text-clip-amber px-1.5 py-0.5 rounded bg-clip-amber/10 border border-clip-amber/20">
          {s.toFixed(1)}/10
        </span>
      );
    }
    if (s >= 6) {
      return (
        <span className="text-[10px] font-bold text-clip-cyan px-1.5 py-0.5 rounded bg-clip-cyan/6 border border-clip-cyan/20">
          {s.toFixed(1)}/10
        </span>
      );
    }
    return (
      <span className="text-[10px] font-semibold text-clip-muted px-1.5 py-0.5 rounded bg-clip-surface border border-white/[0.02]">
        {s.toFixed(1)}/10
      </span>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`card-glass overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-5 sm:p-6 pb-3 border-b border-white/[0.025]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-clip-cyan/6 flex items-center justify-center flex-shrink-0">
            <Flame className="w-5 h-5 text-clip-cyan" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-clip-text">
              Recent Deep Analyses
            </h3>
            <p className="text-clip-muted text-xs mt-0.5">
              Re-open any past URL — instant, no credit charge
            </p>
          </div>
        </div>

      </div>

      {/* Body */}
      <div className="p-3 sm:p-4">
        {state === 'loading' && (
          <div className="animate-pulse space-y-2 p-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-clip-surface rounded-lg" />
            ))}
          </div>
        )}

        {state === 'error' && (
          <div className="p-6 text-center">
            <p className="text-clip-muted text-sm">
              Couldn't load your analyses. Will retry shortly.
            </p>
          </div>
        )}

        {state === 'empty' && (
          <div className="p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-clip-cyan/6 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-clip-cyan" />
            </div>
            <p className="font-display font-medium text-clip-text mb-1">
              No analyses yet
            </p>
            <p className="text-clip-muted text-sm mb-4 max-w-md mx-auto">
              Paste a YouTube URL into Viral Forge to run your first Deep Analysis.
              You'll get 14 viral strategy outputs in seconds.
            </p>
            {onNavigate && (
              <button
                onClick={() => onNavigate('forge')}
                className="btn-primary text-sm px-4 py-2 inline-flex items-center gap-2"
              >
                <Flame className="w-4 h-4" />
                Open Viral Forge
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {state === 'ready' && (
          <ul className="divide-y divide-white/[0.02]">
            {analyses.map(a => {
              const ytId = a.source_video_id || '';
              const thumb = a.thumbnail_url || (ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : '');
              return (
                <li
                  key={a.id}
                  className="relative group flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-white/[0.02] transition-colors cursor-pointer"
                  onClick={() => onReopen?.(a)}
                >
                  {/* Thumbnail — click to play inline, doesn't trigger row click */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (ytId) setPlayingId(a.id);
                    }}
                    className="relative w-16 h-10 rounded-md overflow-hidden flex-shrink-0 bg-clip-surface group/thumb"
                    title={ytId ? 'Play video' : 'No video ID'}
                    aria-label={ytId ? `Play ${a.video_title}` : 'No video'}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-clip-dark/40 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                      <Play className="w-4 h-4 text-clip-cyan ml-0.5" fill="currentColor" />
                    </div>
                    {ytId && (
                      <span className="absolute top-0.5 left-0.5 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-bold bg-red-500/90 text-white">
                        <PlatformIcon platform="youtube" className="w-2 h-2" /> YT
                      </span>
                    )}
                  </button>

                  {/* Title + author */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-clip-text truncate group-hover:text-clip-cyan transition-colors">
                      {a.video_title || 'Untitled video'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-clip-muted">
                      <span className="truncate max-w-[120px]">{a.video_author || 'Unknown'}</span>
                      <span className="text-clip-muted/50">·</span>
                      <span className="inline-flex items-center gap-1 flex-shrink-0">
                        <Clock className="w-3 h-3" />
                        {timeAgo(a.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Hook score */}
                  <div className="flex-shrink-0">
                    <HookScoreBadge score={a.hook_score} />
                  </div>

                  {/* External link */}
                  <a
                    href={a.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-clip-muted hover:text-clip-cyan transition-colors p-1 flex-shrink-0"
                    aria-label="Open on YouTube"
                    title="Open on YouTube"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </li>
              );
            })}
          </ul>
        )}

        {/* Footer CTA */}
        {state === 'ready' && onNavigate && (
          <div className="pt-3 mt-2 border-t border-white/[0.025] flex items-center justify-between">
            <span className="text-clip-muted text-xs">
              {analyses.length} {analyses.length === 1 ? 'analysis' : 'analyses'} this month
            </span>
            <button
              onClick={() => onNavigate('forge')}
              className="text-clip-cyan text-xs hover:underline flex items-center gap-1 font-medium"
            >
              New analysis <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* ── Inline YouTube player modal ───────────────────────────────────────
          Click thumbnail → opens this modal with a YouTube iframe embed.
          Escape or click-outside closes it. */}
      {playingAnalysis && playingAnalysis.source_video_id && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
          onClick={() => setPlayingId(null)}
        >
          <div
            className="relative w-full max-w-3xl bg-clip-dark rounded-2xl overflow-hidden border border-white/[0.035] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header bar */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.025]">
              <div className="flex items-center gap-2 min-w-0">
                <PlatformIcon platform="youtube" className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-sm font-medium text-clip-text truncate">
                  {playingAnalysis.video_title || 'Untitled video'}
                </p>
              </div>
              <button
                onClick={() => setPlayingId(null)}
                className="p-1.5 text-clip-muted hover:text-clip-text hover:bg-white/[0.025] rounded-lg transition-colors flex-shrink-0"
                aria-label="Close player"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 16:9 iframe */}
            <div className="relative aspect-video bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${playingAnalysis.source_video_id}?autoplay=1&rel=0`}
                title={playingAnalysis.video_title || 'YouTube video'}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs text-clip-muted border-t border-white/[0.025]">
              <span className="truncate">by {playingAnalysis.video_author || 'Unknown'}</span>
              <a
                href={playingAnalysis.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-clip-cyan hover:underline flex items-center gap-1 flex-shrink-0"
              >
                Open on YouTube <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
