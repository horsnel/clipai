/**
 * ChannelAuditFullView.tsx — Full-page channel statistics view with extensive
 * AI insights. Replaces the modal when the user wants the deep dive.
 *
 * Layout:
 *   - Sticky top bar: back button + channel name + platform badge + refresh
 *   - Banner with avatar + name + handle + external link
 *   - Big stats row: subscribers / total views / video count / avg engagement
 *   - Health score ring + executive summary
 *   - Tabbed insights: Overview / Best Videos / Worst Videos / Recommendations
 *                       / SWOT / Growth / Content Gaps
 *   - Recent videos table (full list, not truncated)
 *
 * Skeleton loading while insights generate (no ParticleLoader).
 */
import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, ExternalLink, Users, Eye, Video, TrendingUp, Heart,
  AlertCircle, RefreshCw, MessageCircle, Sparkles, Target, Lightbulb,
  TrendingDown, Minus, ArrowUpRight, ArrowDownRight, CheckCircle2,
  AlertTriangle, Rocket, CircleDot, ListChecks,
} from 'lucide-react';
import { PlatformIcon } from '@/components/BrandIcons';
import { SkeletonShimmer, SkeletonList } from './Loading';
import { getAuditInsights } from '@/services/api';
import { platformTerms } from '@/lib/platformTerminology';
import { toast } from 'sonner';
import type { ChannelAudit, AuditPlatform, AuditInsights } from '../types';

interface ChannelAuditFullViewProps {
  audit: ChannelAudit;
  onExit: () => void;
}

const PLATFORM_CONFIG: Record<AuditPlatform, {
  label: string;
  iconColor: string;
  banner: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
}> = {
  youtube:   { label: 'YouTube',   iconColor: 'text-red-500',    banner: 'from-red-500/30 via-red-700/15 to-clip-surface',          accent: 'text-red-500',    accentBg: 'bg-red-500/10',    accentBorder: 'border-red-500/30' },
  tiktok:    { label: 'TikTok',    iconColor: 'text-clip-cyan',  banner: 'from-cyan-500/25 via-pink-500/15 to-clip-surface',        accent: 'text-clip-cyan',  accentBg: 'bg-clip-cyan/10',  accentBorder: 'border-clip-cyan/30' },
  twitter:   { label: 'X',         iconColor: 'text-slate-300',  banner: 'from-slate-500/25 via-slate-700/15 to-clip-surface',      accent: 'text-slate-300',  accentBg: 'bg-slate-400/10',  accentBorder: 'border-slate-400/30' },
  instagram: { label: 'Instagram', iconColor: 'text-pink-400',   banner: 'from-purple-500/25 via-pink-500/15 to-amber-500/10',     accent: 'text-pink-400',   accentBg: 'bg-pink-400/10',   accentBorder: 'border-pink-400/30' },
  reddit:    { label: 'Reddit',    iconColor: 'text-orange-500', banner: 'from-orange-500/25 via-red-500/15 to-clip-surface',       accent: 'text-orange-500', accentBg: 'bg-orange-500/10', accentBorder: 'border-orange-500/30' },
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function timeAgo(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days >= 30) return `${Math.floor(days / 30)}mo ago`;
  if (days >= 1)  return `${days}d ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours >= 1) return `${hours}h ago`;
  const mins = Math.floor(diff / 60000);
  if (mins >= 1) return `${mins}m ago`;
  return 'just now';
}

type TabKey = 'overview' | 'best' | 'worst' | 'recommendations' | 'swot' | 'growth' | 'gaps';

const TABS: Array<{ key: TabKey; label: string; icon: React.ElementType }> = [
  { key: 'overview',       label: 'Overview',       icon: Sparkles },
  { key: 'best',           label: 'Best Videos',    icon: TrendingUp },
  { key: 'worst',          label: 'Worst Videos',   icon: TrendingDown },
  { key: 'recommendations',label: 'Recommendations',icon: Target },
  { key: 'swot',           label: 'SWOT',           icon: ListChecks },
  { key: 'growth',         label: 'Growth',         icon: Rocket },
  { key: 'gaps',           label: 'Content Gaps',   icon: CircleDot },
];

export function ChannelAuditFullView({ audit, onExit }: ChannelAuditFullViewProps) {
  const config = PLATFORM_CONFIG[audit.platform] || PLATFORM_CONFIG.youtube;
  const terms = platformTerms(audit.platform);
  const hasRealStats = !audit.statistics.hiddenSubscriberCount;

  const [insights, setInsights] = useState<AuditInsights | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [refreshing, setRefreshing] = useState(false);

  const fetchInsights = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAuditInsights(audit.url, audit.platform, force);
      setInsights(data.insights);
    } catch (e: any) {
      setError(e?.message || 'Failed to generate insights');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [audit.url, audit.platform]);

  useEffect(() => {
    fetchInsights(false);
  }, [fetchInsights]);

  // Esc to exit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onExit(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    // Scroll to top on mount
    window.scrollTo(0, 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onExit]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchInsights(true);
    toast.info('Regenerating insights with fresh AI analysis…');
  };

  return (
    <div className="fixed inset-0 z-[100] bg-clip-dark overflow-y-auto">
      {/* ─── Sticky top bar ─── */}
      <div className="sticky top-0 z-20 bg-clip-dark/95 backdrop-blur-md border-b border-white/[0.04]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          {/* Back button: icon-only (no text), like Claude's */}
          <button
            onClick={onExit}
            aria-label="Back to audits"
            title="Back to audits"
            className="w-9 h-9 rounded-full border border-white/10 text-clip-muted hover:text-clip-text hover:border-white/30 flex items-center justify-center transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
            <PlatformIcon platform={audit.platform} className={`w-4 h-4 ${config.iconColor} flex-shrink-0`} />
            <span className="text-sm font-medium text-clip-text truncate">{audit.channelName}</span>
            <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${config.accentBg} ${config.accent} hidden sm:inline`}>
              {config.label}
            </span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading || refreshing}
            aria-label="Refresh insights"
            title="Refresh"
            className="w-9 h-9 rounded-full border border-white/10 text-clip-muted hover:text-clip-cyan hover:border-clip-cyan/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ─── Banner + channel info ─── */}
      <div className="relative">
        <div className={`h-32 sm:h-40 bg-gradient-to-br ${config.banner} overflow-hidden`}>
          <PlatformIcon platform={audit.platform} className={`absolute -right-8 -top-8 w-48 h-48 ${config.iconColor} opacity-10`} />
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 -mt-12 sm:-mt-14 relative">
          <div className="flex items-end gap-4">
            {audit.avatar ? (
              <img
                src={audit.avatar}
                alt={audit.channelName}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover ring-4 ring-clip-dark bg-clip-surface flex-shrink-0"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center ring-4 ring-clip-dark bg-clip-surface text-2xl font-bold ${config.iconColor} flex-shrink-0`}>
                {(audit.channelHandle || audit.channelName || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0 pb-2">
              <h1 className="font-display font-bold text-2xl sm:text-3xl text-clip-text truncate leading-tight">
                {audit.channelName}
              </h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {audit.channelHandle && (
                  <span className="text-sm text-clip-muted truncate">{audit.channelHandle}</span>
                )}
                <a
                  href={audit.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1 text-xs ${config.accent} hover:underline`}
                >
                  {terms.openEntityLabel} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
          {audit.description && (
            <p className="mt-4 text-sm text-clip-muted leading-relaxed line-clamp-3">
              {audit.description}
            </p>
          )}
        </div>
      </div>

      {/* ─── Big stats row ─── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-5">
        {hasRealStats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <BigStat icon={Users}      value={formatCount(audit.statistics.subscribers)} label={terms.followersLabel} color={config.accent} />
            <BigStat icon={Eye}        value={formatCount(audit.statistics.totalViews)}  label={terms.totalViewsLabel} color={config.accent} />
            <BigStat icon={Video}      value={formatCount(audit.statistics.videoCount)}  label={terms.postsLabel} color={config.accent} />
            <BigStat icon={TrendingUp} value={`${audit.metrics.avgEngagementRate.toFixed(1)}%`} label={terms.engagementLabel} color={config.accent} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <BigStat icon={Video} value={String(audit.statistics.videoCount || audit.metrics.recentVideoCount)} label="Posts Found" color={config.accent} />
            <BigStat icon={AlertCircle} value="N/A" label={terms.followersLabel} color="text-clip-muted" />
          </div>
        )}
        {hasRealStats && audit.metrics.recentVideoCount > 0 && (
          <div className="mt-2.5 flex items-center justify-center gap-2 text-xs text-clip-muted bg-clip-surface/50 rounded-lg py-2 border border-white/[0.02]">
            <TrendingUp className="w-3.5 h-3.5 text-clip-cyan" />
            Avg {terms.viewsNoun} on last {audit.metrics.recentVideoCount} {terms.postsLabel.toLowerCase()}:{' '}
            <span className="font-bold text-clip-text tabular-nums">{formatCount(audit.metrics.avgRecentViews)}</span>
            <span className="text-clip-muted/60">·</span>
            <span>Total: {formatCount(audit.metrics.totalRecentViews)}</span>
          </div>
        )}
      </div>

      {/* ─── Health score + executive summary ─── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-6">
        {loading ? (
          <SkeletonShimmer lines={4} className="!p-6" />
        ) : error ? (
          <div className={`flex items-start gap-3 p-4 rounded-xl bg-red-500/3 border border-red-500/15`}>
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-clip-text font-medium">Couldn't generate insights</p>
              <p className="text-xs text-clip-muted mt-1">{error}</p>
              <button onClick={handleRefresh} className="mt-2 text-xs text-clip-cyan hover:underline">
                Try again
              </button>
            </div>
          </div>
        ) : insights && (
          <div className="card-glass p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start gap-5">
              {/* Health score ring */}
              <HealthScoreRing score={insights.healthScore} label={insights.healthLabel} accent={config.accent} />
              {/* Executive summary */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className={`w-4 h-4 ${config.accent}`} />
                  <h2 className="font-display font-semibold text-base text-clip-text">Executive Summary</h2>
                </div>
                <p className="text-sm text-clip-text/90 leading-relaxed">{insights.executiveSummary}</p>
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <TrendBadge direction={insights.engagementTrend.direction} label={insights.engagementTrend.direction} />
                  <span className="text-xs text-clip-muted">
                    Cadence: <span className="text-clip-text/80">{insights.postingCadence.currentPattern}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Tab navigation ─── */}
      {!loading && !error && insights && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-6 sticky top-[57px] z-10 bg-clip-dark/95 backdrop-blur-md py-3 -mx-0 border-b border-white/[0.04]">
          <div className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    active
                      ? `${config.accentBg} ${config.accent} border ${config.accentBorder}`
                      : 'text-clip-muted hover:text-clip-text hover:bg-white/[0.025] border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Tab content ─── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-6 pb-12">
        {loading ? (
          <SkeletonList count={4} />
        ) : error ? null : insights && (
          <div className="space-y-4">
            {activeTab === 'overview' && (
              <OverviewTab insights={insights} config={config} />
            )}
            {activeTab === 'best' && (
              <BestVideosTab insights={insights} />
            )}
            {activeTab === 'worst' && (
              <WorstVideosTab insights={insights} />
            )}
            {activeTab === 'recommendations' && (
              <RecommendationsTab insights={insights} />
            )}
            {activeTab === 'swot' && (
              <SwotTab insights={insights} />
            )}
            {activeTab === 'growth' && (
              <GrowthTab insights={insights} />
            )}
            {activeTab === 'gaps' && (
              <GapsTab insights={insights} />
            )}
          </div>
        )}

        {/* ─── Recent videos table ─── */}
        {audit.recentVideos.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-sm text-clip-text">
                All {terms.postsLabel} ({audit.recentVideos.length})
              </h3>
            </div>
            <div className="space-y-2">
              {audit.recentVideos.map((v) => (
                <a
                  key={v.id}
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.025] transition-colors group"
                >
                  <div className="w-20 h-12 rounded-md overflow-hidden bg-clip-surface flex-shrink-0 relative">
                    {v.thumbnail ? (
                      <img
                        src={v.thumbnail}
                        alt={v.title}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className={`absolute inset-0 bg-gradient-to-br ${config.banner} flex items-center justify-center`}>
                        <PlatformIcon platform={audit.platform} className={`w-5 h-5 ${config.iconColor} opacity-60`} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-clip-text truncate group-hover:text-clip-cyan transition-colors leading-snug">
                      {v.title}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-clip-muted">
                      {v.viewCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Eye className="w-2.5 h-2.5" /> {formatCount(v.viewCount)}
                        </span>
                      )}
                      {v.likeCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Heart className="w-2.5 h-2.5" /> {formatCount(v.likeCount)}
                        </span>
                      )}
                      {v.commentCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <MessageCircle className="w-2.5 h-2.5" /> {formatCount(v.commentCount)}
                        </span>
                      )}
                      {v.publishedAt && <span>{timeAgo(v.publishedAt)}</span>}
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-clip-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function BigStat({ icon: Icon, value, label, color }: {
  icon: React.ElementType; value: string; label: string; color: string;
}) {
  return (
    <div className="bg-clip-surface/60 rounded-xl p-3 border border-white/[0.025] text-center">
      <Icon className={`w-4 h-4 ${color} mx-auto mb-1.5`} />
      <p className="font-display font-bold text-lg text-clip-text tabular-nums leading-tight">{value}</p>
      <p className="text-[10px] text-clip-muted uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

function HealthScoreRing({ score, label, accent }: { score: number; label: string; accent: string }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#22c55e' : score >= 65 ? '#84cc16' : score >= 45 ? '#FF9500' : score >= 25 ? '#f97316' : '#ef4444';
  return (
    <div className="flex flex-col items-center gap-2 flex-shrink-0">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
          <circle
            cx="40" cy="40" r={radius} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-display font-bold text-clip-text tabular-nums leading-none">{score}</span>
          <span className="text-[9px] text-clip-muted uppercase tracking-wider">/100</span>
        </div>
      </div>
      <span className={`text-xs font-bold ${accent}`}>{label}</span>
    </div>
  );
}

function TrendBadge({ direction, label }: { direction: 'up' | 'down' | 'flat'; label: string }) {
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  const color = direction === 'up' ? 'text-green-500' : direction === 'down' ? 'text-red-500' : 'text-clip-muted';
  const bg = direction === 'up' ? 'bg-green-500/10 border-green-500/20' : direction === 'down' ? 'bg-red-500/10 border-red-500/20' : 'bg-white/[0.025] border-white/[0.04]';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${color} ${bg}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function SectionCard({ icon: Icon, title, accent = 'text-clip-cyan', children }: {
  icon: React.ElementType;
  title: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card-glass p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${accent}`} />
        <h3 className="font-display font-semibold text-sm text-clip-text">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function OverviewTab({ insights, config }: { insights: AuditInsights; config: any }) {
  return (
    <>
      {/* Engagement trend */}
      <SectionCard icon={TrendingUp} title="Engagement Trend" accent={config.accent}>
        <div className="flex items-start gap-3">
          <TrendBadge direction={insights.engagementTrend.direction} label={insights.engagementTrend.direction} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-clip-text/90 leading-relaxed">{insights.engagementTrend.analysis}</p>
            <p className="text-xs text-clip-muted mt-2">{insights.engagementTrend.benchmark}</p>
          </div>
        </div>
      </SectionCard>

      {/* Posting cadence */}
      <SectionCard icon={Video} title="Posting Cadence" accent={config.accent}>
        <div className="space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-clip-muted mb-1">Current Pattern</p>
            <p className="text-sm text-clip-text">{insights.postingCadence.currentPattern}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-clip-muted mb-1">Recommendation</p>
            <p className="text-sm text-clip-text/90">{insights.postingCadence.recommendation}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-clip-muted mb-1">Optimal Frequency</p>
            <p className="text-sm text-clip-cyan font-medium">{insights.postingCadence.optimalFrequency}</p>
          </div>
        </div>
      </SectionCard>

      {/* Content themes */}
      {insights.contentThemes.length > 0 && (
        <SectionCard icon={Sparkles} title="Content Themes Detected" accent={config.accent}>
          <div className="space-y-2">
            {insights.contentThemes.map((theme, i) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-clip-surface/40 border border-white/[0.02]">
                <div className={`w-1.5 h-1.5 rounded-full ${config.accent} bg-current mt-2 flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-clip-text font-medium">{theme.theme}</p>
                  <p className="text-xs text-clip-muted mt-0.5">
                    {theme.frequency} · <span className="text-clip-text/70">{theme.performance}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Next steps */}
      <SectionCard icon={ListChecks} title="Your Next Steps This Week" accent="text-clip-amber">
        <ol className="space-y-2">
          {insights.nextSteps.map((step, i) => (
            <li key={i} className="flex items-start gap-3 p-2 rounded-lg bg-clip-surface/40 border border-white/[0.02]">
              <span className="w-5 h-5 rounded-full bg-clip-amber/15 text-clip-amber text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className="text-sm text-clip-text/90">{step}</span>
            </li>
          ))}
        </ol>
      </SectionCard>
    </>
  );
}

function BestVideosTab({ insights }: { insights: AuditInsights }) {
  if (!insights.bestPerformingVideos.length) {
    return <EmptyTab text="No best performing video data available." />;
  }
  return (
    <SectionCard icon={TrendingUp} title="Best Performing Videos" accent="text-green-500">
      <div className="space-y-3">
        {insights.bestPerformingVideos.map((v, i) => (
          <div key={i} className="p-3 rounded-lg bg-green-500/3 border border-green-500/15">
            <div className="flex items-start gap-3 mb-2">
              <span className="w-6 h-6 rounded-full bg-green-500/15 text-green-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                #{i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-clip-text font-medium leading-snug">{v.title}</p>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-clip-muted">
                  <span className="flex items-center gap-0.5"><Eye className="w-2.5 h-2.5" /> {formatCount(v.views)}</span>
                  <span className="flex items-center gap-0.5"><Heart className="w-2.5 h-2.5" /> {formatCount(v.likes)}</span>
                  <span className="flex items-center gap-0.5"><MessageCircle className="w-2.5 h-2.5" /> {formatCount(v.comments)}</span>
                </div>
              </div>
            </div>
            <div className="ml-9 space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-clip-muted mb-0.5">Why It Worked</p>
                  <p className="text-xs text-clip-text/90 leading-relaxed">{v.whyItWorked}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Lightbulb className="w-3.5 h-3.5 text-clip-amber flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-clip-muted mb-0.5">Replication Tip</p>
                  <p className="text-xs text-clip-text/90 leading-relaxed">{v.replicationTip}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function WorstVideosTab({ insights }: { insights: AuditInsights }) {
  if (!insights.worstPerformingVideos.length) {
    return <EmptyTab text="No worst performing video data available." />;
  }
  return (
    <SectionCard icon={TrendingDown} title="Worst Performing Videos" accent="text-red-500">
      <div className="space-y-3">
        {insights.worstPerformingVideos.map((v, i) => (
          <div key={i} className="p-3 rounded-lg bg-red-500/3 border border-red-500/15">
            <div className="flex items-start gap-3 mb-2">
              <span className="w-6 h-6 rounded-full bg-red-500/15 text-red-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                #{i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-clip-text font-medium leading-snug">{v.title}</p>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-clip-muted">
                  <span className="flex items-center gap-0.5"><Eye className="w-2.5 h-2.5" /> {formatCount(v.views)}</span>
                  <span className="flex items-center gap-0.5"><Heart className="w-2.5 h-2.5" /> {formatCount(v.likes)}</span>
                  <span className="flex items-center gap-0.5"><MessageCircle className="w-2.5 h-2.5" /> {formatCount(v.comments)}</span>
                </div>
              </div>
            </div>
            <div className="ml-9 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-clip-muted mb-0.5">Why It Underperformed</p>
                  <p className="text-xs text-clip-text/90 leading-relaxed">{v.whyItUnderperformed}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Target className="w-3.5 h-3.5 text-clip-cyan flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-clip-muted mb-0.5">Fix Tip</p>
                  <p className="text-xs text-clip-text/90 leading-relaxed">{v.fixTip}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function RecommendationsTab({ insights }: { insights: AuditInsights }) {
  if (!insights.recommendations.length) {
    return <EmptyTab text="No recommendations available." />;
  }
  const priorityColor: Record<string, string> = {
    high: 'text-red-500 bg-red-500/10 border-red-500/20',
    medium: 'text-clip-amber bg-clip-amber/10 border-clip-amber/20',
    low: 'text-clip-muted bg-white/[0.025] border-white/[0.04]',
  };
  return (
    <div className="space-y-3">
      {insights.recommendations.map((rec, i) => (
        <div key={i} className="card-glass p-4">
          <div className="flex items-start gap-3">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border flex-shrink-0 ${priorityColor[rec.priority] || priorityColor.low}`}>
              {rec.priority}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="text-sm font-medium text-clip-text">{rec.title}</p>
                <span className="text-[10px] text-clip-muted px-1.5 py-0.5 rounded bg-white/[0.025]">{rec.category}</span>
              </div>
              <p className="text-xs text-clip-text/80 leading-relaxed">{rec.description}</p>
              {rec.expectedImpact && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-clip-cyan">
                  <Rocket className="w-3 h-3" />
                  <span>{rec.expectedImpact}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SwotTab({ insights }: { insights: AuditInsights }) {
  const quadrants = [
    { key: 'strengths',     label: 'Strengths',     icon: CheckCircle2, color: 'text-green-500',   border: 'border-green-500/20',   bg: 'bg-green-500/3' },
    { key: 'weaknesses',    label: 'Weaknesses',    icon: AlertTriangle, color: 'text-red-500',    border: 'border-red-500/20',     bg: 'bg-red-500/3' },
    { key: 'opportunities', label: 'Opportunities', icon: Lightbulb,     color: 'text-clip-amber',  border: 'border-clip-amber/20',  bg: 'bg-clip-amber/3' },
    { key: 'threats',       label: 'Threats',       icon: AlertCircle,   color: 'text-orange-500',  border: 'border-orange-500/20',  bg: 'bg-orange-500/3' },
  ] as const;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {quadrants.map((q) => {
        const items = (insights.swot as any)[q.key] as string[];
        const Icon = q.icon;
        return (
          <div key={q.key} className={`card-glass p-4 ${q.border} ${q.bg}`}>
            <div className={`flex items-center gap-2 mb-3`}>
              <Icon className={`w-4 h-4 ${q.color}`} />
              <h3 className="font-display font-semibold text-sm text-clip-text">{q.label}</h3>
              <span className="text-[10px] text-clip-muted ml-auto">{items.length}</span>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-clip-muted italic">No data</p>
            ) : (
              <ul className="space-y-2">
                {items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={`w-1 h-1 rounded-full ${q.color} bg-current mt-2 flex-shrink-0`} />
                    <span className="text-xs text-clip-text/90 leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GrowthTab({ insights }: { insights: AuditInsights }) {
  if (!insights.growthOpportunities.length) {
    return <EmptyTab text="No growth opportunities available." />;
  }
  const effortColor: Record<string, string> = {
    low: 'text-green-500', medium: 'text-clip-amber', high: 'text-red-500',
  };
  const impactColor: Record<string, string> = {
    low: 'text-clip-muted', medium: 'text-clip-amber', high: 'text-green-500',
  };
  return (
    <div className="space-y-3">
      {insights.growthOpportunities.map((g, i) => (
        <div key={i} className="card-glass p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-sm font-medium text-clip-text flex-1">{g.opportunity}</p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-[10px] uppercase tracking-wider ${effortColor[g.effort] || 'text-clip-muted'}`}>
                Effort: {g.effort}
              </span>
              <span className={`text-[10px] uppercase tracking-wider ${impactColor[g.impact] || 'text-clip-muted'}`}>
                Impact: {g.impact}
              </span>
            </div>
          </div>
          <p className="text-xs text-clip-muted leading-relaxed">{g.rationale}</p>
        </div>
      ))}
    </div>
  );
}

function GapsTab({ insights }: { insights: AuditInsights }) {
  if (!insights.contentGaps.length) {
    return <EmptyTab text="No content gaps detected." />;
  }
  return (
    <div className="space-y-3">
      {insights.contentGaps.map((gap, i) => (
        <div key={i} className="card-glass p-4">
          <div className="flex items-start gap-3 mb-2">
            <CircleDot className="w-4 h-4 text-clip-amber flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-clip-muted mb-0.5">Missing</p>
              <p className="text-sm text-clip-text">{gap.gap}</p>
            </div>
          </div>
          <div className="ml-7 flex items-start gap-2">
            <Target className="w-3.5 h-3.5 text-clip-cyan flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-clip-muted mb-0.5">Suggestion</p>
              <p className="text-xs text-clip-text/90 leading-relaxed">{gap.suggestion}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyTab({ text }: { text: string }) {
  return (
    <div className="card-glass p-8 flex flex-col items-center justify-center gap-2 text-center">
      <AlertCircle className="w-6 h-6 text-clip-muted opacity-50" />
      <p className="text-sm text-clip-muted">{text}</p>
    </div>
  );
}
