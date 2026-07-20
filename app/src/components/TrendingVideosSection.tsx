/**
 * TrendingVideosSection.tsx — Dashboard widget showing trending gaming
 * YouTube videos with a one-click copy button (title + caption + hashtags).
 *
 * No auth required. Powered by GET /api/trending-videos (6h global cache,
 * one LLM call for all videos).
 */
import { useState, useEffect } from 'react';
import {
  Copy, Check, Flame,
  Play, AlertTriangle, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { getTrendingVideos } from '@/services/api';
import { SkeletonVideoGrid } from './Loading';
import { PlatformIcon } from './BrandIcons';
import { VideoPlayerModal } from './VideoPlayerModal';
import type { TrendingVideo } from '../types';
import type { PlatformId } from './BrandIcons';

interface TrendingVideosSectionProps {
  /** Optional game filter. If omitted, "gaming" is used (top gaming highlights). */
  game?: string;
}

type Platform = 'youtube';

interface PlatformStyle {
  label: string;
  badgeClass: string;
  iconClass: string;
  platformId: PlatformId;
  fallbackBg: string;
}

const PLATFORM_STYLES: Record<Platform, PlatformStyle> = {
  youtube: {
    label: 'YouTube',
    badgeClass: 'bg-red-500/90 text-white',
    iconClass: 'text-red-500',
    platformId: 'youtube',
    fallbackBg: 'bg-gradient-to-br from-red-500/20 to-red-900/20',
  },
};

function timeAgo(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours >= 1) return `${hours}h ago`;
  const mins = Math.floor(diff / 60000);
  if (mins >= 1) return `${mins}m ago`;
  return 'just now';
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function buildCopyPack(v: TrendingVideo): string {
  const parts: string[] = [];
  if (v.copyPack?.title) parts.push(v.copyPack.title);
  else if (v.title) parts.push(v.title);
  if (v.copyPack?.caption) parts.push('\n' + v.copyPack.caption);
  if (v.copyPack?.hashtags?.length) parts.push('\n' + v.copyPack.hashtags.join(' '));
  return parts.join('').trim();
}

export function TrendingVideosSection({ game }: TrendingVideosSectionProps) {
  const [videos, setVideos]       = useState<TrendingVideo[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [copiedId, setCopiedId]   = useState<string | null>(null);
  const [activeVideo, setActiveVideo] = useState<TrendingVideo | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    getTrendingVideos(game)
      .then((data) => {
        if (!mounted) return;
        // Only show YouTube videos (per product decision: other platforms
        // don't expose public view counts reliably, so we limit to YouTube)
        const yt = (data.videos || []).filter(v => v.platform === 'youtube');
        setVideos(yt);
      })
      .catch((e) => {
        if (!mounted) return;
        setError(e?.message || 'Failed to load trending videos');
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [game]);

  const handleCopy = async (v: TrendingVideo) => {
    const text = buildCopyPack(v);
    if (!text) {
      toast.error('No copy content available for this video');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(v.id);
      toast.success('Title + caption + hashtags copied');
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      toast.error('Copy failed');
    }
  };

  const filteredVideos = videos;

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
            <Flame className="w-5 h-5 text-red-500" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-clip-text leading-tight">
              Trending Gaming Videos
            </h3>
            <p className="text-clip-muted text-xs mt-0.5 truncate">
              Click to play · One-click copy: title · caption · hashtags
            </p>
          </div>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-red-500/10 text-red-500 border border-red-500/20 flex-shrink-0">
          Live
        </span>
      </div>

      {/* Body */}
      <div>
        {loading ? (
          <SkeletonVideoGrid count={6} />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <AlertTriangle className="w-8 h-8 text-clip-amber/70" />
            <p className="text-clip-muted text-sm">{error}</p>
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <PlatformIcon platform="youtube" className="w-8 h-8 text-clip-muted opacity-50" />
            <p className="text-clip-muted text-sm">
              No trending videos right now. Check back soon.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredVideos.map((v) => {
              const hasPack = !!(v.copyPack?.title || v.copyPack?.caption || v.copyPack?.hashtags?.length);
              const style = PLATFORM_STYLES[v.platform as Platform] || PLATFORM_STYLES.youtube;
              const hasThumbnail = !!v.thumbnail;
              return (
                <div
                  key={v.id}
                  className="group relative rounded-xl overflow-hidden border border-white/[0.02] bg-clip-surface/40 hover:border-white/[0.10] transition-all"
                >
                  {/* Thumbnail or platform fallback — opens in-app player */}
                  <button
                    type="button"
                    onClick={() => setActiveVideo(v)}
                    className="block relative aspect-video overflow-hidden bg-clip-surface w-full text-left cursor-pointer"
                    aria-label={`Play ${v.title} in ClipAI`}
                  >
                    {hasThumbnail ? (
                      <img
                        src={v.thumbnail}
                        alt={v.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      // Platform-colored fallback for TikTok / X (no thumbnail available)
                      <div className={`absolute inset-0 ${style.fallbackBg} flex items-center justify-center`}>
                        <PlatformIcon platform={style.platformId} className={`w-12 h-12 ${style.iconClass} opacity-80`} />
                      </div>
                    )}
                    {/* Dark gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-clip-dark/80 via-transparent to-transparent pointer-events-none" />
                    {/* Play icon — always visible on hover, signals click-to-play (not link-to-YouTube) */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-12 h-12 rounded-full bg-clip-cyan/90 flex items-center justify-center backdrop-blur-sm shadow-glow-cyan">
                        <Play className="w-5 h-5 text-black ml-0.5" fill="currentColor" />
                      </div>
                    </div>
                    {/* Platform badge */}
                    <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${style.badgeClass}`}>
                      <PlatformIcon platform={style.platformId} className="w-3 h-3" /> {style.label}
                    </span>
                    {/* Copy button — top right (doesn't open the player) */}
                    {hasPack && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleCopy(v);
                        }}
                        title="Copy title + caption + hashtags"
                        className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-black/70 backdrop-blur-sm hover:bg-clip-cyan hover:text-black text-white flex items-center justify-center transition-all"
                      >
                        {copiedId === v.id ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    {/* Time ago */}
                    {v.publishedAt && (
                      <span className="absolute bottom-2 right-2 text-[10px] text-white/90 bg-black/70 px-1.5 py-0.5 rounded">
                        {timeAgo(v.publishedAt)}
                      </span>
                    )}
                  </button>

                  {/* Title + channel — clicking title also opens the in-app player */}
                  <div className="p-3">
                    <button
                      type="button"
                      onClick={() => setActiveVideo(v)}
                      className="text-left w-full"
                      aria-label={`Play ${v.title}`}
                    >
                      <p className="text-sm font-medium text-clip-text leading-snug line-clamp-2 mb-1.5 hover:text-clip-cyan transition-colors">
                        {v.copyPack?.title || v.title}
                      </p>
                    </button>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="text-xs text-clip-muted truncate">{v.channel}</span>
                        {v.viewCount && v.viewCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-clip-muted/80 tabular-nums flex-shrink-0">
                            <Eye className="w-2.5 h-2.5" />
                            {formatViews(v.viewCount)}
                          </span>
                        )}
                      </div>
                      {/* Play button — explicit affordance to open in-app player */}
                      <button
                        type="button"
                        onClick={() => setActiveVideo(v)}
                        className="text-[10px] font-bold uppercase tracking-wider text-clip-cyan hover:text-clip-text transition-colors flex-shrink-0 inline-flex items-center gap-1"
                        title="Play in ClipAI"
                      >
                        <Play className="w-3 h-3" fill="currentColor" />
                        Play
                      </button>
                    </div>

                    {/* Hashtags preview */}
                    {v.copyPack?.hashtags?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {v.copyPack.hashtags.slice(0, 4).map((tag, i) => (
                          <span
                            key={i}
                            className="text-[10px] text-clip-cyan/80 bg-clip-cyan/3 px-1.5 py-0.5 rounded border border-clip-cyan/10"
                          >
                            {tag}
                          </span>
                        ))}
                        {v.copyPack.hashtags.length > 4 && (
                          <span className="text-[10px] text-clip-muted px-1 py-0.5">
                            +{v.copyPack.hashtags.length - 4}
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* In-app YouTube player modal — replaces the old "open in new tab" behaviour */}
      <VideoPlayerModal
        open={!!activeVideo}
        video={activeVideo}
        onClose={() => setActiveVideo(null)}
        onCopy={handleCopy}
        copied={!!activeVideo && copiedId === activeVideo.id}
      />
    </section>
  );
}
