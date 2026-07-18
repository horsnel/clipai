import { useState, useEffect } from 'react';
import type { Page } from '../App';
import {
  Flame, TrendingUp, TrendingDown, Minus,
  Sparkles, ArrowRight, Clock, Users,
} from 'lucide-react';
import { getTopicSteal } from '@/services/api';
import type { TopicStealEntry } from '../types';

interface TopicStealWidgetProps {
  /** Optional game filter — pass 'valorant' etc. to scope. */
  game?: string;
  /** How many rows to show. Default 6. */
  limit?: number;
  /** Compact mode for dashboard (no header). Default false. */
  compact?: boolean;
  /** Show the time-range toggle (7d / 14d / 30d / 90d). Default true. */
  showRangeToggle?: boolean;
  /** Initial time window. Default 14. */
  initialDays?: 7 | 14 | 30 | 90;
  /** Navigation callback — clicking a topic could open Viral Forge. */
  onNavigate?: (page: Page) => void;
  /** Optional className for the outer card. */
  className?: string;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';
type DaysWindow = 7 | 14 | 30 | 90;
const DAYS_OPTIONS: DaysWindow[] = [7, 14, 30, 90];

/**
 * Topic Steal widget — shows anonymized trending topics aggregated
 * from every ClipAI Deep Analysis run in the last 14 days.
 *
 * Data shape (per row):
 *   { topic, game, mention_count, avg_heat, distinct_days, last_seen, growth_multiplier }
 *
 * growth_multiplier > 1.0 = rising week-over-week
 * growth_multiplier < 1.0 = falling
 * growth_multiplier = 0   = new this week (no prior data)
 */
export function TopicStealWidget({
  game,
  limit = 6,
  compact = false,
  showRangeToggle = true,
  initialDays = 14,
  onNavigate,
  className = '',
}: TopicStealWidgetProps) {
  const [topics, setTopics] = useState<TopicStealEntry[]>([]);
  const [state, setState] = useState<LoadState>('idle');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [days, setDays] = useState<DaysWindow>(initialDays);

  const load = async () => {
    setState(s => (s === 'idle' ? 'loading' : 'ready'));
    try {
      const data = await getTopicSteal(game, limit, days);
      setTopics(data.topics || []);
      setUpdatedAt(new Date(data.generated_at || Date.now()));
      setState(data.topics && data.topics.length > 0 ? 'ready' : 'empty');
    } catch (err) {
      console.error('[TopicStealWidget]', err);
      setState('error');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, limit, days]);

  // ─── Derived render helpers ────────────────────────────────────────────────
  const maxMentions = topics.length > 0 ? Math.max(...topics.map(t => t.mention_count)) : 1;

  const TrendBadge = ({ mult }: { mult: number | null }) => {
    if (mult === null) {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-clip-muted px-1.5 py-0.5 rounded bg-clip-surface border border-white/[0.02]">
          <Minus className="w-2.5 h-2.5" /> new
        </span>
      );
    }
    if (mult === 0) {
      // 0 means "appeared this week, no prior data" (per SQL view definition)
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-green-600 px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20">
          <Sparkles className="w-2.5 h-2.5" /> new
        </span>
      );
    }
    if (mult >= 2.0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-green-600 px-1.5 py-0.5 rounded bg-green-500/15 border border-green-500/30">
          <TrendingUp className="w-2.5 h-2.5" /> {(mult * 100).toFixed(0)}%
        </span>
      );
    }
    if (mult >= 1.05) {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-green-600 px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20">
          <TrendingUp className="w-2.5 h-2.5" /> +{((mult - 1) * 100).toFixed(0)}%
        </span>
      );
    }
    if (mult <= 0.5) {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-600 px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/30">
          <TrendingDown className="w-2.5 h-2.5" /> -{((1 - mult) * 100).toFixed(0)}%
        </span>
      );
    }
    if (mult < 0.95) {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20">
          <TrendingDown className="w-2.5 h-2.5" /> -{((1 - mult) * 100).toFixed(0)}%
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-clip-muted px-1.5 py-0.5 rounded bg-clip-surface border border-white/[0.02]">
        <Minus className="w-2.5 h-2.5" /> flat
      </span>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  if (compact && state === 'loading') {
    return (
      <div className={`card-glass p-5 ${className}`}>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 bg-clip-surface rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`card-glass overflow-hidden ${className}`}>
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between gap-3 p-5 sm:p-6 pb-3 border-b border-white/[0.025]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-clip-amber/10 flex items-center justify-center flex-shrink-0">
              <Flame className="w-5 h-5 text-clip-amber" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-display font-semibold text-clip-text">
                  Trending in ClipAI Network
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-clip-amber bg-clip-amber/10 px-1.5 py-0.5 rounded border border-clip-amber/20">
                  Live
                </span>
              </div>
              <p className="text-clip-muted text-xs mt-0.5 flex items-center gap-1.5">
                <Users className="w-3 h-3 flex-shrink-0" />
                Anonymous aggregation across all Deep Analyses
                {updatedAt && (
                  <>
                    <span className="text-clip-muted/60">·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

        </div>
      )}

      {/* Time-range toggle */}
      {!compact && showRangeToggle && (
        <div className="px-5 sm:px-6 pt-3 pb-1 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-clip-muted font-semibold">
            Window
          </span>
          <div className="flex items-center gap-1 bg-clip-surface rounded-lg p-0.5 border border-white/[0.025]">
            {DAYS_OPTIONS.map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  days === d
                    ? 'bg-clip-amber/15 text-clip-amber border border-clip-amber/30'
                    : 'text-clip-muted hover:text-clip-text border border-transparent'
                }`}
                aria-pressed={days === d}
              >
                {d}d
              </button>
            ))}
          </div>
          <span className="text-[10px] text-clip-muted ml-auto">
            Growth vs prior {Math.floor(days / 2)}d
          </span>
        </div>
      )}

      {/* Body */}
      <div className="p-3 sm:p-4">
        {state === 'loading' && (
          <div className="animate-pulse space-y-2 p-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-10 bg-clip-surface rounded-lg" />
            ))}
          </div>
        )}

        {state === 'error' && (
          <div className="p-6 text-center">
            <p className="text-clip-muted text-sm">
              Couldn't load topics. Will retry shortly.
            </p>
          </div>
        )}

        {state === 'empty' && (
          <div className="p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-clip-cyan/6 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-clip-cyan" />
            </div>
            <p className="font-display font-medium text-clip-text mb-1">
              Be the first to seed the network
            </p>
            <p className="text-clip-muted text-sm mb-4 max-w-md mx-auto">
              Run a Deep Analysis on any YouTube video. Your topics will anonymously feed this
              dashboard for every other creator: and theirs will feed yours.
            </p>
            {onNavigate && (
              <button
                onClick={() => onNavigate('forge')}
                className="btn-primary text-sm px-4 py-2 inline-flex items-center gap-2"
              >
                <Flame className="w-4 h-4" />
                Open Viral Forge
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {state === 'ready' && (
          <ul className="divide-y divide white/[0.02]">
            {topics.map((t, i) => {
              const widthPct = Math.max(6, (t.mention_count / maxMentions) * 100);
              return (
                <li
                  key={`${t.topic}-${i}`}
                  className="relative group flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-white/[0.02] transition-colors"
                >
                  {/* Rank */}
                  <span className="font-mono text-clip-muted text-xs w-5 text-right flex-shrink-0">
                    {i + 1}
                  </span>

                  {/* Topic + bar */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-clip-text truncate group-hover:text-clip-cyan transition-colors">
                        {t.topic}
                      </span>
                      {t.game && t.game !== 'general' && (
                        <span className="text-[10px] text-clip-muted bg-clip-surface border border-white/[0.02] px-1.5 py-0.5 rounded flex-shrink-0">
                          {t.game}
                        </span>
                      )}
                    </div>
                    <div className="relative h-1.5 bg-clip-surface rounded-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-clip-amber/60 to-clip-amber rounded-full transition-all duration-500"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Mentions */}
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0 w-12">
                    <span className="text-xs font-mono text-clip-text tabular-nums">
                      {t.mention_count}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-clip-muted">
                      mentions
                    </span>
                  </div>

                  {/* Trend badge */}
                  <div className="flex-shrink-0 w-16 text-right">
                    <TrendBadge mult={t.growth_multiplier} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Footer CTA */}
        {!compact && state === 'ready' && onNavigate && (
          <div className="pt-3 mt-2 border-t border-white/[0.025] flex items-center justify-between">
            <span className="text-clip-muted text-xs flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-clip-amber" />
              Steal these angles → run a Deep Analysis
            </span>
            <button
              onClick={() => onNavigate('forge')}
              className="text-clip-cyan text-xs hover:underline flex items-center gap-1 font-medium"
            >
              Viral Forge <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
