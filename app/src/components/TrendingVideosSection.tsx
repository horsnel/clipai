/**
 * TrendingVideosSection.tsx — Dashboard widget showing 6 trending YouTube
 * gaming videos with a one-click "Copy Pack" button (title + caption + hashtags).
 *
 * Designed to replace the old "Clips This Month" card on the dashboard.
 * No auth required — it's a free inspiration widget powered by
 * GET /api/trending-videos (6h global cache, one LLM call for all 6 videos).
 */
import { useState, useEffect } from 'react';
import {
  Youtube, Copy, Check, ExternalLink, Loader2, Flame,
  Play, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { getTrendingVideos } from '@/services/api';
import type { TrendingVideo } from '../types';

interface TrendingVideosSectionProps {
  /** Optional game filter. If omitted, "gaming" is used (top gaming highlights). */
  game?: string;
}

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

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    getTrendingVideos(game)
      .then((data) => {
        if (!mounted) return;
        setVideos(data.videos || []);
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
      toast.error('No copy pack available for this video');
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

  return (
    <div className="card-glass overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.04]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
            <Flame className="w-5 h-5 text-red-500" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-clip-text leading-tight">
              Trending Gaming Videos
            </h3>
            <p className="text-clip-muted text-xs mt-0.5 truncate">
              One-click copy: title · caption · hashtags
            </p>
          </div>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-red-500/10 text-red-500 border border-red-500/20 flex-shrink-0">
          Live
        </span>
      </div>

      {/* Body */}
      <div className="p-3 sm:p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-6 h-6 text-clip-cyan animate-spin" />
            <p className="text-clip-muted text-xs">Fetching trending videos…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <AlertTriangle className="w-8 h-8 text-clip-amber/70" />
            <p className="text-clip-muted text-sm">{error}</p>
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <Youtube className="w-8 h-8 text-clip-muted opacity-50" />
            <p className="text-clip-muted text-sm">No trending videos right now. Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {videos.map((v) => {
              const hasPack = !!(v.copyPack?.title || v.copyPack?.caption || v.copyPack?.hashtags?.length);
              return (
                <div
                  key={v.id}
                  className="group relative rounded-xl overflow-hidden border border-white/[0.05] bg-clip-surface/40 hover:border-white/[0.10] transition-all"
                >
                  {/* Thumbnail with platform badge */}
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block relative aspect-video overflow-hidden bg-clip-surface"
                  >
                    {v.thumbnail && (
                      <img
                        src={v.thumbnail}
                        alt={v.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    {/* Dark gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-clip-dark/80 via-transparent to-transparent pointer-events-none" />
                    {/* Play icon on hover */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-10 h-10 rounded-full bg-clip-cyan/90 flex items-center justify-center backdrop-blur-sm">
                        <Play className="w-4 h-4 text-black ml-0.5" fill="currentColor" />
                      </div>
                    </div>
                    {/* YouTube platform badge */}
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/90 text-white">
                      <Youtube className="w-3 h-3" /> YouTube
                    </span>
                    {/* Copy button — top right */}
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
                  </a>

                  {/* Title + channel */}
                  <div className="p-3">
                    <p className="text-sm font-medium text-clip-text leading-snug line-clamp-2 mb-1.5">
                      {v.copyPack?.title || v.title}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-clip-muted truncate">{v.channel}</span>
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-clip-muted hover:text-clip-cyan transition-colors flex-shrink-0"
                        aria-label="Open on YouTube"
                        title="Open on YouTube"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    {/* Hashtags preview */}
                    {v.copyPack?.hashtags?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {v.copyPack.hashtags.slice(0, 4).map((tag, i) => (
                          <span
                            key={i}
                            className="text-[10px] text-clip-cyan/80 bg-clip-cyan/5 px-1.5 py-0.5 rounded border border-clip-cyan/10"
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

                  {/* Copy button — mobile fallback (full-width bar) */}
                  {hasPack && (
                    <button
                      onClick={() => handleCopy(v)}
                      className="sm:hidden w-full py-2 text-xs font-medium text-clip-cyan border-t border-white/[0.05] hover:bg-clip-cyan/5 transition-colors flex items-center justify-center gap-1.5"
                    >
                      {copiedId === v.id ? (
                        <><Check className="w-3.5 h-3.5" /> Copied</>
                      ) : (
                        <><Copy className="w-3.5 h-3.5" /> Copy pack</>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
