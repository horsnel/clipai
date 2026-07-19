/**
 * DailyInsightCard.tsx — dismissible pop-up card that surfaces today's
 * AI-generated brief on the dashboard.
 *
 * Behaviour:
 *   - On mount, check localStorage `clipai_daily_insight_read_${YYYY-MM-DD}`.
 *     If set, don't show the card (user already dismissed it today).
 *   - Otherwise, fetch /api/daily-insight (cached 20h server-side).
 *   - If fetch succeeds and returns insights, show the pop-up.
 *   - On dismiss ("Got it" / X button), set the localStorage flag.
 *   - The flag auto-rolls over each day (different key per date).
 *
 * The card is rendered as a fixed-position overlay on small screens and
 * an inline card on larger screens — but for simplicity we always use
 * a centered modal-style card so it actually gets noticed.
 */
import { useState, useEffect } from 'react';
import {
  X, Sparkles, ArrowRight, Sunrise, TrendingUp, Target, Zap,
} from 'lucide-react';
import { getDailyInsight, type DailyInsightResponse } from '@/services/api';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import type { Page } from '../App';

interface DailyInsightCardProps {
  onNavigate: (page: Page) => void;
}

const STORAGE_KEY_PREFIX = 'clipai_daily_insight_read_';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function hasReadToday(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_PREFIX + todayKey()) === '1';
  } catch {
    return false;
  }
}

function markReadToday(): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + todayKey(), '1');
  } catch {}
}

// Map focusArea → icon for visual variety
const FOCUS_ICONS: Record<string, React.ElementType> = {
  'Content Strategy': Target,
  'Posting Cadence': Sunrise,
  'Audience Growth': TrendingUp,
  'Engagement': Sparkles,
  'Monetization': Zap,
  'Trend Capitalization': TrendingUp,
};

export function DailyInsightCard({ onNavigate }: DailyInsightCardProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DailyInsightResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Lock parent body scroll while the pop-up is open
  useBodyScrollLock(open);

  useEffect(() => {
    // Don't fetch if the user already dismissed today's brief
    if (hasReadToday()) return;
    setLoading(true);
    getDailyInsight()
      .then((res) => {
        setData(res);
        // Only auto-open if there are insights to show
        if (res?.insights?.length) setOpen(true);
      })
      .catch(() => {
        // Silent fail — don't bother the user if the endpoint is down
      })
      .finally(() => setLoading(false));
  }, []);

  const handleClose = () => {
    setOpen(false);
    markReadToday();
  };

  const handleAction = (action: string) => {
    // Heuristic: navigate based on keywords in the action text
    const a = action.toLowerCase();
    let target: Page = 'dashboard';
    if (a.includes('audit')) target = 'audit';
    else if (a.includes('forge') || a.includes('analy') || a.includes('viral')) target = 'forge';
    else if (a.includes('trend') || a.includes('radar')) target = 'trends';
    else if (a.includes('growth') || a.includes('spy') || a.includes('competitor')) target = 'growth';
    else if (a.includes('setting') || a.includes('referral') || a.includes('upgrade')) target = 'settings';
    else if (a.includes('leaderboard') || a.includes('rank')) target = 'rank';
    else if (a.includes('clipbot') || a.includes('coach')) target = 'clipbot';
    handleClose();
    onNavigate(target);
  };

  if (loading && !open) {
    // Subtle loading indicator in the corner while fetching — don't block the dashboard
    return null;
  }

  if (!open || !data) return null;

  const FocusIcon = FOCUS_ICONS[data.focusArea] || Sparkles;
  const highCount = data.insights.filter(i => i.priority === 'high').length;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Today's AI insight"
    >
      <div
        className="relative w-full max-w-lg card-glass rounded-2xl overflow-hidden border-clip-cyan/30 shadow-[0_0_40px_rgba(0,229,255,0.15)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-clip-cyan via-violet-500 to-clip-cyan" />

        {/* Close button */}
        <button
          onClick={handleClose}
          aria-label="Dismiss"
          className="absolute top-3 right-3 z-30 w-8 h-8 rounded-full border border-white/15 text-clip-muted hover:text-clip-text hover:border-white/40 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={2.5} />
        </button>

        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-clip-cyan/20 to-violet-500/20 flex items-center justify-center flex-shrink-0 border border-clip-cyan/30">
              <FocusIcon className="w-6 h-6 text-clip-cyan" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase tracking-wider text-clip-cyan font-bold">Today's brief</span>
                {data.fallback ? (
                  <span className="text-[9px] uppercase tracking-wider text-clip-muted px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">
                    lite
                  </span>
                ) : highCount > 0 ? (
                  <span className="text-[9px] uppercase tracking-wider text-clip-amber px-1.5 py-0.5 rounded bg-clip-amber/10 border border-clip-amber/30">
                    {highCount} priority
                  </span>
                ) : null}
              </div>
              <h2 className="font-display font-bold text-xl sm:text-2xl text-clip-text leading-tight">
                {data.headline}
              </h2>
              <p className="text-xs text-clip-muted mt-1">
                Focus: <span className="text-clip-text/80">{data.focusArea}</span>
              </p>
            </div>
          </div>

          {/* Insights list */}
          <div className="space-y-3 max-h-[50vh] overflow-y-auto overscroll-contain pr-1">
            {data.insights.map((insight, i) => {
              const priorityColor: Record<string, string> = {
                high: 'border-clip-amber/40 bg-clip-amber/5',
                medium: 'border-clip-cyan/30 bg-clip-cyan/5',
                low: 'border-white/[0.10] bg-white/[0.02]',
              };
              const priorityText: Record<string, string> = {
                high: 'text-clip-amber',
                medium: 'text-clip-cyan',
                low: 'text-clip-muted',
              };
              return (
                <div
                  key={i}
                  className={`p-4 rounded-xl border ${priorityColor[insight.priority] || priorityColor.low}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`text-[10px] uppercase tracking-wider font-bold mt-0.5 flex-shrink-0 ${priorityText[insight.priority] || priorityText.low}`}>
                      #{i + 1} · {insight.priority}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-bold text-sm text-clip-text mb-1">
                        {insight.title}
                      </h3>
                      <p className="text-xs text-clip-text/80 leading-relaxed mb-2">
                        {insight.body}
                      </p>
                      {insight.action && (
                        <button
                          onClick={() => handleAction(insight.action)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-clip-cyan hover:underline"
                        >
                          {insight.action}
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
            <p className="text-[10px] text-clip-muted">
              Synthesised from your audits, analyses & today's trends.
            </p>
            <button
              onClick={handleClose}
              className="btn-primary px-4 py-2 text-xs flex items-center gap-1.5"
            >
              Got it
              <CheckIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
