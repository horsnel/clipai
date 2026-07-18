/**
 * ChannelAuditModal.tsx — Quick-preview overlay showing the channel audit.
 *
 * Layout:
 *   - Backdrop blur + click-to-close
 *   - Centred max-w-3xl panel (max-h-[90vh], scrollable)
 *   - Header: banner gradient + avatar + name + handle + platform badge +
 *             external link + close button
 *   - Big stats row: subscribers / total views / video count / avg engagement
 *   - Recent videos table (thumbnail + title + views + likes + published date)
 *   - Note for non-YouTube platforms
 *   - "View Full Audit" button → opens ChannelAuditFullView with extensive AI insights
 *   - Delete audit button (bottom)
 *
 * Esc to close. Click outside to close.
 */
import { useEffect } from 'react';
import {
  X, ExternalLink, Users, Eye, Video, TrendingUp, Heart,
  AlertCircle, Trash2, MessageCircle, Maximize2,
} from 'lucide-react';
import { PlatformIcon } from '@/components/BrandIcons';
import type { ChannelAudit, AuditPlatform } from '../types';

interface ChannelAuditModalProps {
  audit: ChannelAudit;
  onClose: () => void;
  onDelete?: (url: string) => void;
  /** Open the full-page audit view with extensive AI insights. */
  onViewFull?: () => void;
}

const PLATFORM_CONFIG: Record<AuditPlatform, {
  label: string;
  iconColor: string;
  banner: string;
  accent: string;
}> = {
  youtube:   { label: 'YouTube',   iconColor: 'text-red-500',   banner: 'from-red-500/30 via-red-700/15 to-clip-surface',         accent: 'text-red-500' },
  tiktok:    { label: 'TikTok',    iconColor: 'text-clip-cyan', banner: 'from-cyan-500/25 via-pink-500/15 to-clip-surface',       accent: 'text-clip-cyan' },
  twitter:   { label: 'X',         iconColor: 'text-slate-300', banner: 'from-slate-500/25 via-slate-700/15 to-clip-surface',     accent: 'text-slate-300' },
  instagram: { label: 'Instagram', iconColor: 'text-pink-400',  banner: 'from-purple-500/25 via-pink-500/15 to-amber-500/10',    accent: 'text-pink-400' },
  reddit:    { label: 'Reddit',    iconColor: 'text-orange-500', banner: 'from-orange-500/25 via-red-500/15 to-clip-surface',     accent: 'text-orange-500' },
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

export function ChannelAuditModal({ audit, onClose, onDelete, onViewFull }: ChannelAuditModalProps) {
  const config = PLATFORM_CONFIG[audit.platform] || PLATFORM_CONFIG.youtube;
  const hasRealStats = !audit.statistics.hiddenSubscriberCount;

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // Lock body scroll
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto card-glass rounded-2xl border-white/[0.08] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Header: banner + avatar ─── */}
        <div className={`relative h-28 bg-gradient-to-br ${config.banner} overflow-hidden`}>
          {/* Watermark icon */}
          <PlatformIcon platform={audit.platform} className={`absolute -right-6 -top-6 w-40 h-40 ${config.iconColor} opacity-10`} />
          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm hover:bg-black/80 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          {/* Platform badge */}
          <span className={`absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-black/60 backdrop-blur-sm text-white border border-white/10`}>
            <PlatformIcon platform={audit.platform} className={`w-3 h-3 ${config.iconColor}`} />
            {config.label}
          </span>
        </div>

        {/* Avatar overlapping banner bottom */}
        <div className="px-6 sm:px-8 -mt-10 relative">
          <div className="flex items-end gap-4">
            {audit.avatar ? (
              <img
                src={audit.avatar}
                alt={audit.channelName}
                className="w-20 h-20 rounded-full object-cover ring-4 ring-clip-surface bg-clip-surface flex-shrink-0"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className={`w-20 h-20 rounded-full flex items-center justify-center ring-4 ring-clip-surface bg-clip-surface text-2xl font-bold ${config.iconColor} flex-shrink-0`}>
                {(audit.channelHandle || audit.channelName || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0 pb-1">
              <h2 className="font-display font-bold text-xl text-clip-text truncate leading-tight">
                {audit.channelName}
              </h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {audit.channelHandle && (
                  <span className="text-sm text-clip-muted truncate">{audit.channelHandle}</span>
                )}
                <a
                  href={audit.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-clip-cyan hover:underline"
                >
                  Open channel <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Description (YouTube only) */}
          {audit.description && (
            <p className="mt-4 text-sm text-clip-muted leading-relaxed line-clamp-3">
              {audit.description}
            </p>
          )}
        </div>

        {/* ─── Big stats row ─── */}
        <div className="px-6 sm:px-8 mt-5">
          {hasRealStats ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <BigStat icon={Users}      value={formatCount(audit.statistics.subscribers)} label={audit.platform === 'reddit' ? 'Subredditors' : 'Subscribers'} color={config.accent} />
              <BigStat icon={Eye}        value={formatCount(audit.statistics.totalViews)}  label={audit.platform === 'reddit' ? 'Total Karma' : 'Total Views'} color={config.accent} />
              <BigStat icon={Video}      value={formatCount(audit.statistics.videoCount)}  label={audit.platform === 'reddit' ? 'Posts' : audit.platform === 'youtube' ? 'Videos' : 'Posts'} color={config.accent} />
              <BigStat icon={TrendingUp} value={`${audit.metrics.avgEngagementRate.toFixed(1)}%`} label={audit.platform === 'reddit' ? 'Comments/Post' : 'Engagement'} color={config.accent} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <BigStat icon={Video} value={String(audit.statistics.videoCount || audit.metrics.recentVideoCount)} label="Posts Found" color={config.accent} />
              <BigStat icon={AlertCircle} value="N/A" label="Followers" color="text-clip-muted" />
            </div>
          )}

          {/* Avg recent views (real-audit platforms only) */}
          {hasRealStats && audit.metrics.recentVideoCount > 0 && (
            <div className="mt-2.5 flex items-center justify-center gap-2 text-xs text-clip-muted bg-clip-surface/50 rounded-lg py-2 border border-white/[0.02]">
              <TrendingUp className="w-3.5 h-3.5 text-clip-cyan" />
              Avg {audit.platform === 'reddit' ? 'score' : 'views'} on last {audit.metrics.recentVideoCount} {audit.platform === 'youtube' ? 'videos' : 'posts'}:{' '}
              <span className="font-bold text-clip-text tabular-nums">{formatCount(audit.metrics.avgRecentViews)}</span>
              <span className="text-clip-muted/60">·</span>
              <span>Total: {formatCount(audit.metrics.totalRecentViews)}</span>
            </div>
          )}
        </div>

        {/* Note for non-YouTube platforms */}
        {audit.note && (
          <div className="px-6 sm:px-8 mt-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-clip-amber/3 border border-clip-amber/15 text-xs text-clip-muted">
              <AlertCircle className="w-4 h-4 text-clip-amber flex-shrink-0 mt-0.5" />
              <span>{audit.note}</span>
            </div>
          </div>
        )}

        {/* ─── Recent videos table ─── */}
        {audit.recentVideos.length > 0 && (
          <div className="px-6 sm:px-8 mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-sm text-clip-text">
                Recent {audit.platform === 'youtube' ? 'Videos' : 'Posts'}
              </h3>
              <span className="text-[10px] text-clip-muted uppercase tracking-wider">
                {audit.recentVideos.length} shown
              </span>
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
                  {/* Thumbnail */}
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
                  {/* Title + meta */}
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
                      {v.publishedAt && (
                        <span>{timeAgo(v.publishedAt)}</span>
                      )}
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-clip-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ─── Footer: audited at + view full + delete ─── */}
        <div className="px-6 sm:px-8 mt-6 mb-6 pt-4 border-t border-white/[0.025] flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[10px] text-clip-muted/70 uppercase tracking-wider">
            Audited {timeAgo(audit.auditedAt)}
          </span>
          <div className="flex items-center gap-2">
            {onViewFull && (
              <button
                onClick={onViewFull}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-clip-cyan/10 text-clip-cyan border border-clip-cyan/30 hover:bg-clip-cyan/20 transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                View Full Audit
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => { onDelete(audit.url); onClose(); }}
                className="inline-flex items-center gap-1.5 text-xs text-clip-muted hover:text-red-500 transition-colors px-2 py-1 rounded"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BigStat({ icon: Icon, value, label, color }: {
  icon: React.ElementType; value: string; label: string; color: string;
}) {
  return (
    <div className="bg-clip-surface/60 rounded-xl p-3 border border-white/[0.025] text-center">
      <Icon className={`w-4 h-4 ${color} mx-auto mb-1.5`} />
      <p className="font-display font-bold text-lg text-clip-text tabular-nums leading-tight">
        {value}
      </p>
      <p className="text-[10px] text-clip-muted uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}
