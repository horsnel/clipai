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
 * Two brief shapes are supported:
 *   1. Morning brief (preferred) — multi-channel deep dive with improvement
 *      suggestions, best tricks, niche comparison, viral mirror recipe, and
 *      flop recovery recipe per channel.
 *   2. On-demand brief (fallback) — only the cross-channel insights[] list.
 */
import { useState, useEffect } from 'react';
import {
  X, Sparkles, ArrowRight, Sunrise, TrendingUp, Target, Zap,
  Trophy, Wand2, AlertTriangle, Lightbulb, ChevronRight,
} from 'lucide-react';
import { getDailyInsight, type DailyInsightResponse, type MorningChannelBrief } from '@/services/api';
import { PlatformIcon } from '@/components/BrandIcons';
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

const PLATFORM_ACCENT: Record<string, string> = {
  youtube: 'text-red-500',
  tiktok: 'text-clip-cyan',
  twitter: 'text-slate-300',
  instagram: 'text-pink-400',
  reddit: 'text-orange-500',
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
        if (res?.insights?.length || res?.channels?.length) setOpen(true);
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
  const hasMorningBrief = !!data.morningBrief && !!data.channels?.length;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Today's AI insight"
    >
      <div
        className="relative w-full max-w-2xl card-glass rounded-2xl overflow-hidden border-clip-cyan/30 shadow-[0_0_40px_rgba(0, 255, 255,0.15)] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-clip-cyan via-violet-500 to-clip-cyan flex-shrink-0" />

        {/* Close button */}
        <button
          onClick={handleClose}
          aria-label="Dismiss"
          className="absolute top-3 right-3 z-30 w-8 h-8 rounded-full border border-white/15 text-clip-muted hover:text-clip-text hover:border-white/40 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={2.5} />
        </button>

        {/* Header (fixed, not scrollable) */}
        <div className="p-6 sm:p-8 pb-4 flex-shrink-0">
          <div className="flex items-start gap-4 mb-1">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-clip-cyan/20 to-violet-500/20 flex items-center justify-center flex-shrink-0 border border-clip-cyan/30">
              <FocusIcon className="w-6 h-6 text-clip-cyan" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider text-clip-cyan font-bold">Today's brief</span>
                {data.morningBrief ? (
                  <span className="text-[9px] uppercase tracking-wider text-violet-300 px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/30 flex items-center gap-1">
                    <Sunrise className="w-2.5 h-2.5" /> Morning audit
                  </span>
                ) : data.fallback ? (
                  <span className="text-[9px] uppercase tracking-wider text-clip-muted px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">
                    lite
                  </span>
                ) : highCount > 0 ? (
                  <span className="text-[9px] uppercase tracking-wider text-clip-amber px-1.5 py-0.5 rounded bg-clip-amber/10 border border-clip-amber/30">
                    {highCount} priority
                  </span>
                ) : null}
              </div>
              <h2 className="font-display font-bold text-xl sm:text-2xl text-clip-text leading-tight pr-8">
                {data.headline}
              </h2>
              <p className="text-xs text-clip-muted mt-1">
                Focus: <span className="text-clip-text/80">{data.focusArea}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto overscroll-contain px-6 sm:px-8 pb-2">
          {hasMorningBrief ? (
            <MorningBriefBody
              channels={data.channels!}
              insights={data.insights}
              onAction={handleAction}
            />
          ) : (
            <OnDemandBriefBody
              insights={data.insights}
              onAction={handleAction}
            />
          )}
        </div>

        {/* Footer (fixed) */}
        <div className="mt-auto px-6 sm:px-8 py-4 border-t border-white/[0.06] flex items-center justify-between gap-3 flex-shrink-0">
          <p className="text-[10px] text-clip-muted">
            {hasMorningBrief
              ? 'Synthesised from your morning audit + niche comparison.'
              : 'Synthesised from your audits, analyses & today\'s trends.'}
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
  );
}

// ─── Morning brief body (deep multi-channel analysis) ────────────────────────
function MorningBriefBody({
  channels,
  insights,
  onAction,
}: {
  channels: MorningChannelBrief[];
  insights: DailyInsightResponse['insights'];
  onAction: (action: string) => void;
}) {
  return (
    <div className="space-y-4">
      {channels.map((ch, i) => (
        <ChannelDeepCard key={`${ch.channelName}-${i}`} channel={ch} onAction={onAction} />
      ))}

      {/* Cross-channel insights (highlights at the bottom) */}
      {insights.length > 0 && (
        <div className="pt-2">
          <h3 className="text-[10px] uppercase tracking-wider text-clip-cyan font-bold mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" /> Cross-channel highlights
          </h3>
          <div className="space-y-2">
            {insights.map((insight, i) => (
              <InsightPill key={i} insight={insight} onAction={onAction} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Per-channel deep dive card (the new core of the morning brief) ──────────
function ChannelDeepCard({ channel, onAction }: {
  channel: MorningChannelBrief;
  onAction: (action: string) => void;
}) {
  const accent = PLATFORM_ACCENT[channel.platform] || 'text-clip-cyan';
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Channel header (always visible) */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 p-3 hover:bg-white/[0.02] transition-colors text-left"
      >
        <PlatformIcon platform={channel.platform as any} className={`w-4 h-4 ${accent} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className="font-display font-semibold text-sm text-clip-text truncate leading-tight">
            {channel.channelName}
          </p>
          {channel.healthNote && (
            <p className="text-[11px] text-clip-muted truncate mt-0.5">{channel.healthNote}</p>
          )}
        </div>
        <ChevronRight className={`w-4 h-4 text-clip-muted flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {/* Expanded body — improvement suggestions + best tricks + niche + viral + flop */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Improvement suggestions */}
          {channel.improvementSuggestions?.length > 0 && (
            <SubSection icon={Target} title="Improvement suggestions" accent="text-clip-cyan">
              <div className="space-y-2">
                {channel.improvementSuggestions.map((s, i) => (
                  <SuggestionItem key={i} insight={s} onAction={onAction} />
                ))}
              </div>
            </SubSection>
          )}

          {/* Best tricks */}
          {channel.bestTricks?.length > 0 && (
            <SubSection icon={Wand2} title="Best tricks to level up" accent="text-violet-300">
              <ul className="space-y-1.5">
                {channel.bestTricks.map((trick, i) => (
                  <li key={i} className="text-[11px] text-clip-text/85 leading-relaxed flex gap-1.5">
                    <span className="text-violet-400 flex-shrink-0 mt-0.5">▸</span>
                    <span>{trick}</span>
                  </li>
                ))}
              </ul>
            </SubSection>
          )}

          {/* Niche comparison */}
          {channel.nicheComparison && (
            <SubSection icon={Trophy} title="Niche best-channel comparison" accent="text-amber-400">
              <p className="text-[11px] text-clip-text/80 leading-relaxed">{channel.nicheComparison}</p>
            </SubSection>
          )}

          {/* Viral mirror recipe */}
          {channel.viralMirrorRecipe && (
            <RecipeBlock
              icon={TrendingUp}
              accent="text-clip-cyan"
              accentBg="bg-clip-cyan/[0.05] border-clip-cyan/15"
              title="Viral mirror recipe"
              basedOn={channel.viralMirrorRecipe.basedOn}
              rows={[
                { label: 'Next title', value: channel.viralMirrorRecipe.nextVideoTitle },
                { label: 'First 3s hook', value: channel.viralMirrorRecipe.nextVideoHook },
                { label: 'Format', value: channel.viralMirrorRecipe.format },
                { label: 'Best trick', value: channel.viralMirrorRecipe.bestTrick },
              ]}
            />
          )}

          {/* Flop recovery recipe */}
          {channel.flopRecoveryRecipe && (
            <RecipeBlock
              icon={AlertTriangle}
              accent="text-clip-amber"
              accentBg="bg-clip-amber/[0.05] border-clip-amber/15"
              title="Flop recovery recipe"
              basedOn={channel.flopRecoveryRecipe.basedOn}
              rows={[
                { label: 'What went wrong', value: channel.flopRecoveryRecipe.whatWentWrong },
                { label: 'Next-video plan', value: channel.flopRecoveryRecipe.nextVideoPlan },
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Recipe block (viral mirror / flop recovery) ─────────────────────────────
function RecipeBlock({
  icon: Icon,
  accent,
  accentBg,
  title,
  basedOn,
  rows,
}: {
  icon: React.ElementType;
  accent: string;
  accentBg: string;
  title: string;
  basedOn: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <div className={`rounded-lg border p-2.5 ${accentBg}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`w-3 h-3 ${accent}`} />
        <span className={`text-[10px] uppercase tracking-wider font-bold ${accent}`}>{title}</span>
      </div>
      {basedOn && (
        <p className="text-[10px] text-clip-muted mb-2 italic">Based on: {basedOn}</p>
      )}
      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-clip-muted font-bold">{row.label}</span>
            <span className="text-[11px] text-clip-text/85 leading-relaxed">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sub-section wrapper ─────────────────────────────────────────────────────
function SubSection({
  icon: Icon,
  title,
  accent,
  children,
}: {
  icon: React.ElementType;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`w-3 h-3 ${accent}`} />
        <span className={`text-[10px] uppercase tracking-wider font-bold ${accent}`}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Suggestion item (improvement suggestion w/ priority + action) ───────────
function SuggestionItem({
  insight,
  onAction,
}: {
  insight: DailyInsightResponse['insights'][number];
  onAction: (action: string) => void;
}) {
  const priorityText: Record<string, string> = {
    high: 'text-clip-amber',
    medium: 'text-clip-cyan',
    low: 'text-clip-muted',
  };
  return (
    <div className="rounded-md bg-white/[0.02] border border-white/[0.04] p-2">
      <div className="flex items-start gap-2">
        <span className={`text-[9px] uppercase tracking-wider font-bold mt-0.5 flex-shrink-0 ${priorityText[insight.priority] || priorityText.low}`}>
          {insight.priority}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-clip-text leading-snug">{insight.title}</p>
          <p className="text-[11px] text-clip-text/80 leading-relaxed mt-0.5">{insight.body}</p>
          {insight.action && (
            <button
              onClick={() => onAction(insight.action)}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-clip-cyan hover:underline mt-1"
            >
              {insight.action}
              <ArrowRight className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── On-demand brief body (legacy single-list view) ──────────────────────────
function OnDemandBriefBody({
  insights,
  onAction,
}: {
  insights: DailyInsightResponse['insights'];
  onAction: (action: string) => void;
}) {
  return (
    <div className="space-y-3">
      {insights.map((insight, i) => {
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
            className={`p-3 rounded-xl border ${priorityColor[insight.priority] || priorityColor.low}`}
          >
            <div className="flex items-start gap-3">
              <span className={`text-[10px] uppercase tracking-wider font-bold mt-0.5 flex-shrink-0 ${priorityText[insight.priority] || priorityText.low}`}>
                {i + 1}. {insight.priority}
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
                    onClick={() => onAction(insight.action)}
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
  );
}

// ─── Insight pill (compact cross-channel insight shown under channel cards) ──
function InsightPill({
  insight,
  onAction,
}: {
  insight: DailyInsightResponse['insights'][number];
  onAction: (action: string) => void;
}) {
  const priorityText: Record<string, string> = {
    high: 'text-clip-amber',
    medium: 'text-clip-cyan',
    low: 'text-clip-muted',
  };
  return (
    <div className="rounded-md bg-white/[0.02] border border-white/[0.04] p-2">
      <div className="flex items-start gap-2">
        <span className={`text-[9px] uppercase tracking-wider font-bold mt-0.5 flex-shrink-0 ${priorityText[insight.priority] || priorityText.low}`}>
          {insight.priority}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-clip-text leading-snug">{insight.title}</p>
          <p className="text-[11px] text-clip-text/80 leading-relaxed mt-0.5">{insight.body}</p>
          {insight.action && (
            <button
              onClick={() => onAction(insight.action)}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-clip-cyan hover:underline mt-1"
            >
              {insight.action}
              <ArrowRight className="w-2.5 h-2.5" />
            </button>
          )}
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

// Re-export Lightbulb for the morning brief icon usage (avoids unused import)
void Lightbulb;
