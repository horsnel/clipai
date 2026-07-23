/**
 * ChannelAuditCard.tsx — Square dashboard card showing a single audited channel.
 *
 * Layout (per user spec):
 *   - Square aspect ratio
 *   - Avatar centered at the top edge (half-overlapping the card top)
 *   - Platform-colored gradient banner behind the avatar
 *   - Channel name + handle below the avatar
 *   - Quick analytics inside the square (subscribers, total views, avg recent views)
 *   - Click anywhere → opens ChannelAuditModal with the full audit
 *
 * Used inside <ChannelAuditsGrid /> on the dashboard.
 */
import {
  Users, Eye, TrendingUp, Video, AlertCircle,
} from 'lucide-react';
import { PlatformIcon } from '@/components/BrandIcons';
import { platformTerms } from '@/lib/platformTerminology';
import type { ChannelAudit, AuditPlatform } from '../types';

interface ChannelAuditCardProps {
  audit: ChannelAudit;
  onClick: () => void;
}

const PLATFORM_CONFIG: Record<AuditPlatform, {
  label: string;
  iconColor: string;
  banner: string;       // gradient behind the avatar
  ring: string;         // ring color around the avatar
  accent: string;       // accent text color
  statBg: string;       // mini-stat tile bg (platform-tinted)
}> = {
  youtube: {
    label: 'YouTube',
    iconColor: 'text-red-500',
    banner: 'from-red-500/30 via-red-700/15 to-clip-surface',
    ring: 'ring-red-500/40',
    accent: 'text-red-500',
    statBg: 'bg-red-500/[0.06] border-red-500/10',
  },
  tiktok: {
    label: 'TikTok',
    iconColor: 'text-clip-cyan',
    banner: 'from-cyan-500/25 via-pink-500/15 to-clip-surface',
    ring: 'ring-cyan-400/40',
    accent: 'text-clip-cyan',
    statBg: 'bg-cyan-500/[0.06] border-cyan-500/10',
  },
  twitter: {
    label: 'X',
    iconColor: 'text-slate-300',
    banner: 'from-slate-500/25 via-slate-700/15 to-clip-surface',
    ring: 'ring-slate-400/40',
    accent: 'text-slate-300',
    statBg: 'bg-slate-400/[0.06] border-slate-400/10',
  },
  instagram: {
    label: 'Instagram',
    iconColor: 'text-pink-400',
    banner: 'from-purple-500/25 via-pink-500/15 to-amber-500/10',
    ring: 'ring-pink-400/40',
    accent: 'text-pink-400',
    statBg: 'bg-pink-500/[0.06] border-pink-500/10',
  },
  reddit: {
    label: 'Reddit',
    iconColor: 'text-orange-500',
    banner: 'from-orange-500/25 via-red-500/15 to-clip-surface',
    ring: 'ring-orange-400/40',
    accent: 'text-orange-500',
    statBg: 'bg-orange-500/[0.06] border-orange-500/10',
  },
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

export function ChannelAuditCard({ audit, onClick }: ChannelAuditCardProps) {
  const config = PLATFORM_CONFIG[audit.platform] || PLATFORM_CONFIG.youtube;
  const terms = platformTerms(audit.platform);
  const hasRealStats = (audit.platform === 'youtube' || audit.platform === 'reddit' || audit.platform === 'tiktok' || audit.platform === 'instagram' || audit.platform === 'twitter') && !audit.statistics.hiddenSubscriberCount;
  const avatarFallback = audit.channelHandle || audit.channelName || '?';

  return (
    <button
      onClick={onClick}
      className="group relative w-full text-left transition-all duration-300 hover:-translate-y-1 focus:outline-none h-full"
    >
      {/* Square container — min-h keeps every card in a row the same height */}
      <div className="card-glass overflow-hidden hover:border-white/[0.12] transition-colors h-full min-h-[248px] flex flex-col">

        {/* Top banner (gradient), avatar overlaps this edge */}
        <div className={`relative h-20 bg-gradient-to-br ${config.banner} overflow-hidden flex-shrink-0`}>
          {/* Faint platform icon watermark in the banner */}
          <PlatformIcon platform={audit.platform} className={`absolute -right-3 -top-3 w-20 h-20 ${config.iconColor} opacity-10`} />
          {/* "Audited" pill */}
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-black/50 backdrop-blur-sm text-white/90 border border-white/10">
            <span className="w-1 h-1 rounded-full bg-green-400" />
            Audited
          </span>
        </div>

        {/* Avatar — centered, overlapping the banner bottom edge */}
        <div className="relative px-4 pb-4 pt-1 flex-1 flex flex-col">
          <div className="flex justify-center -mt-8 mb-2.5">
            {audit.avatar ? (
              <img
                src={audit.avatar}
                alt={audit.channelName}
                className={`w-16 h-16 rounded-full object-cover ring-2 ${config.ring} ring-offset-2 ring-offset-clip-surface bg-clip-surface`}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ring-2 ${config.ring} ring-offset-2 ring-offset-clip-surface bg-clip-surface text-lg font-bold ${config.iconColor}`}>
                {avatarFallback.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Channel name + platform icon */}
          <div className="text-center mb-3.5">
            <p className="font-display font-semibold text-clip-text text-sm truncate leading-tight">
              {audit.channelName}
            </p>
            <div className="flex items-center justify-center gap-1 mt-1">
              <PlatformIcon platform={audit.platform} className={`w-3 h-3 ${config.iconColor}`} />
              <span className="text-[11px] text-clip-muted truncate">{audit.channelHandle || config.label}</span>
            </div>
          </div>

          {/* Analytics inside the square — 2-col grid (was 3-col, too cramped) */}
          <div className="flex-1 flex flex-col justify-end">
            {hasRealStats ? (
              <div className="grid grid-cols-2 gap-2">
                <Stat icon={Users}      value={formatCount(audit.statistics.subscribers)} label={terms.followersShort}  color={config.accent} bg={config.statBg} />
                <Stat icon={Eye}        value={formatCount(audit.statistics.totalViews)}  label={terms.viewsLabel}      color={config.accent} bg={config.statBg} />
                <Stat icon={TrendingUp} value={formatCount(audit.metrics.avgRecentViews)} label="Avg/post"              color={config.accent} bg={config.statBg} />
                <Stat icon={Video}      value={String(audit.statistics.videoCount || audit.metrics.recentVideoCount)} label={terms.postsLabel} color={config.accent} bg={config.statBg} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Stat icon={Video}       value={String(audit.statistics.videoCount || audit.metrics.recentVideoCount)} label={terms.postsLabel} color={config.accent} bg={config.statBg} />
                <Stat icon={AlertCircle} value="N/A" label="Stats" color="text-clip-muted" bg="bg-white/[0.02] border-white/[0.04]" />
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="mt-3 pt-2.5 border-t border-white/[0.04] flex items-center justify-center gap-1 text-[10px] text-clip-muted group-hover:text-clip-cyan transition-colors">
            <span>Click for full audit</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function Stat({ icon: Icon, value, label, color, bg }: {
  icon: React.ElementType; value: string; label: string; color: string; bg: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center ${bg} rounded-lg py-2 border`}>
      <Icon className={`w-3.5 h-3.5 ${color} mb-1`} />
      <span className="text-sm font-bold text-clip-text tabular-nums leading-tight">{value}</span>
      <span className="text-[10px] text-clip-muted uppercase tracking-wide leading-tight mt-0.5">{label}</span>
    </div>
  );
}
