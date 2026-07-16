import { useState, useEffect } from 'react';
import type { Page } from '../App';
import {
  Clock, Play, ChevronRight, Flame, ExternalLink, Sparkles,
} from 'lucide-react';
import { listAnalyses } from '@/services/api';
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
        <span className="text-[10px] font-medium text-clip-muted px-1.5 py-0.5 rounded bg-clip-surface border border-white/[0.05]">
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
        <span className="text-[10px] font-bold text-clip-cyan px-1.5 py-0.5 rounded bg-clip-cyan/10 border border-clip-cyan/20">
          {s.toFixed(1)}/10
        </span>
      );
    }
    return (
      <span className="text-[10px] font-semibold text-clip-muted px-1.5 py-0.5 rounded bg-clip-surface border border-white/[0.05]">
        {s.toFixed(1)}/10
      </span>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`card-glass overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-5 sm:p-6 pb-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-clip-cyan/10 flex items-center justify-center flex-shrink-0">
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
            <div className="w-12 h-12 rounded-xl bg-clip-cyan/10 flex items-center justify-center mx-auto mb-3">
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
          <ul className="divide-y divide-white/[0.03]">
            {analyses.map(a => {
              const ytId = a.source_video_id || '';
              const thumb = a.thumbnail_url || (ytId ? `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg` : '');
              return (
                <li
                  key={a.id}
                  className="relative group flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-white/[0.02] transition-colors cursor-pointer"
                  onClick={() => onReopen?.(a)}
                >
                  {/* Thumbnail */}
                  <div className="relative w-16 h-10 rounded-md overflow-hidden flex-shrink-0 bg-clip-surface">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-clip-dark/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="w-4 h-4 text-clip-cyan ml-0.5" />
                    </div>
                  </div>

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
          <div className="pt-3 mt-2 border-t border-white/[0.04] flex items-center justify-between">
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
    </div>
  );
}
