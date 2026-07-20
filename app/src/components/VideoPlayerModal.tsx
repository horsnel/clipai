/**
 * VideoPlayerModal.tsx — In-app YouTube video player modal.
 *
 * Replaces the old behaviour where clicking a trending video card opened
 * youtube.com in a new tab. Now the video plays inside the app via YouTube's
 * privacy-enhanced embed (youtube-nocookie.com), keeping users on ClipAI.
 *
 * Features:
 *   - 16:9 responsive iframe that fits any viewport
 *   - Click outside / X button / ESC key to close
 *   - Body scroll lock while open (uses useBodyScrollLock)
 *   - Copy-pack button (title + caption + hashtags) passed through from caller
 *   - Graceful fallback if video ID can't be parsed (falls back to external link)
 *
 * Usage:
 *   <VideoPlayerModal
 *     open={!!activeVideo}
 *     video={activeVideo}
 *     onClose={() => setActiveVideo(null)}
 *     onCopy={(v) => handleCopy(v)}
 *     copied={copiedId === activeVideo?.id}
 *   />
 */
import { useEffect, useState } from 'react';
import { X, Copy, Check, ExternalLink, AlertTriangle } from 'lucide-react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { PlatformIcon } from './BrandIcons';
import type { TrendingVideo } from '../types';

interface VideoPlayerModalProps {
  open: boolean;
  video: TrendingVideo | null;
  onClose: () => void;
  onCopy?: (video: TrendingVideo) => void;
  copied?: boolean;
}

/** Extract the 11-char YouTube video ID from any YouTube URL flavour. */
function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  // Patterns we support:
  //   https://www.youtube.com/watch?v=VIDEO_ID
  //   https://youtu.be/VIDEO_ID
  //   https://www.youtube.com/embed/VIDEO_ID
  //   https://www.youtube.com/shorts/VIDEO_ID
  //   https://www.youtube.com/live/VIDEO_ID
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
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

function formatViews(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

export function VideoPlayerModal({ open, video, onClose, onCopy, copied }: VideoPlayerModalProps) {
  useBodyScrollLock(open);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Reset internal state when modal closes
  const [iframeError, setIframeError] = useState(false);
  useEffect(() => {
    if (open) setIframeError(false);
  }, [open, video?.id]);

  if (!open || !video) return null;

  const videoId = extractYouTubeId(video.url);
  // Use youtube-nocookie.com for privacy-enhanced embed
  const embedSrc = videoId
    ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`
    : null;

  const hasPack = !!(video.copyPack?.title || video.copyPack?.caption || video.copyPack?.hashtags?.length);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Playing: ${video.title}`}
    >
      <div
        className="relative w-full max-w-4xl bg-clip-surface border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar: title + close */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.06] bg-clip-dark/60">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <PlatformIcon platform="youtube" className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-500 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded flex-shrink-0">
              YouTube
            </span>
            <p className="text-sm font-medium text-clip-text truncate">
              {video.copyPack?.title || video.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-white/[0.06] text-clip-muted hover:text-clip-text flex items-center justify-center transition-colors flex-shrink-0"
            aria-label="Close video player"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Video player area */}
        <div className="relative bg-black aspect-video">
          {embedSrc && !iframeError ? (
            <iframe
              key={video.id}
              src={embedSrc}
              title={video.title}
              className="absolute inset-0 w-full h-full"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : embedSrc && iframeError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6">
              <AlertTriangle className="w-10 h-10 text-clip-amber/70" />
              <p className="text-clip-muted text-sm max-w-sm">
                The embedded player couldn't load. You can still watch this video directly on YouTube.
              </p>
              <a
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 text-sm font-medium transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Open on YouTube
              </a>
            </div>
          ) : (
            // No video ID parsed — fallback to external link
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6">
              <AlertTriangle className="w-10 h-10 text-clip-amber/70" />
              <p className="text-clip-muted text-sm max-w-sm">
                This video URL isn't a standard YouTube link.
              </p>
              <a
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-clip-cyan/15 hover:bg-clip-cyan/25 border border-clip-cyan/30 text-clip-cyan text-sm font-medium transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Open original link
              </a>
            </div>
          )}
        </div>

        {/* Footer: channel + stats + copy button */}
        <div className="px-4 py-3 border-t border-white/[0.06] bg-clip-dark/60">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="min-w-0">
                <p className="text-sm font-medium text-clip-text truncate">{video.channel}</p>
                <div className="flex items-center gap-2 text-xs text-clip-muted">
                  {video.viewCount && video.viewCount > 0 && (
                    <span>{formatViews(video.viewCount)} views</span>
                  )}
                  {video.publishedAt && (
                    <>
                      <span>·</span>
                      <span>{timeAgo(video.publishedAt)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {hasPack && onCopy && (
              <button
                onClick={() => onCopy(video)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-clip-cyan/10 hover:bg-clip-cyan hover:text-black text-clip-cyan border border-clip-cyan/30 text-xs font-medium transition-colors flex-shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy pack
                  </>
                )}
              </button>
            )}

            {/* Always provide an "Open on YouTube" link as escape hatch */}
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.04] text-clip-muted hover:text-clip-text text-xs transition-colors flex-shrink-0"
              title="Open directly on YouTube"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              YouTube
            </a>
          </div>

          {/* Hashtags preview */}
          {video.copyPack?.hashtags?.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {video.copyPack.hashtags.slice(0, 8).map((tag, i) => (
                <span
                  key={i}
                  className="text-[10px] text-clip-cyan/80 bg-clip-cyan/5 px-1.5 py-0.5 rounded border border-clip-cyan/15"
                >
                  {tag}
                </span>
              ))}
              {video.copyPack.hashtags.length > 8 && (
                <span className="text-[10px] text-clip-muted px-1 py-0.5">
                  +{video.copyPack.hashtags.length - 8}
                </span>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export { extractYouTubeId };
