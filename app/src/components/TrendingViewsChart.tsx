/**
 * TrendingViewsChart.tsx — Dashboard widget showing a graphic table of
 * accumulated YouTube views across all trending gaming videos currently
 * shown on the homepage.
 *
 * Powered by GET /api/trending-videos — same call the TrendingVideosSection
 * makes. Only YouTube videos are charted (they're the only platform with
 * reliable public view counts). TikTok, X, and Instagram don't expose
 * public play counts, so they're filtered out.
 *
 * The chart is a "graphic table" rather than a card: the user asked for
 * "a graphic tables of the accumulated views of the views of the trending
 * videos been shown in the home not a card".
 */
import { useState, useEffect } from 'react';
import {
  TrendingUp, Loader2, AlertTriangle, Eye, BarChart3,
} from 'lucide-react';
import { getTrendingVideos } from '@/services/api';
import { PlatformIcon } from '@/components/BrandIcons';
import type { TrendingVideo } from '../types';

interface TrendingViewsChartProps {
  /** Optional game filter. Should match the TrendingVideosSection prop. */
  game?: string;
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

export function TrendingViewsChart({ game }: TrendingViewsChartProps) {
  const [videos, setVideos] = useState<TrendingVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    getTrendingVideos(game)
      .then((data) => {
        if (!mounted) return;
        // Only YouTube videos have real view counts — filter to YouTube only.
        const yt = (data.videos || []).filter(v => v.platform === 'youtube');
        setVideos(yt);
      })
      .catch((e) => { if (mounted) setError(e?.message || 'Failed to load'); })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [game]);

  // Total = sum of YouTube view counts
  const totalViews = videos.reduce((sum, v) => sum + (v.viewCount || 0), 0);
  const maxViews = Math.max(1, ...videos.map(v => v.viewCount || 0));

  // Sort by views desc
  const sortedVideos = [...videos].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));

  return (
    <div className="card-glass p-5 sm:p-6 relative overflow-hidden group hover:border-white/[0.10] transition-all">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-clip-cyan/15 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-5 h-5 text-clip-cyan" />
          </div>
          <div className="min-w-0">
            <p className="text-clip-muted text-xs uppercase tracking-wider font-medium">Trending Views</p>
            <p className="font-display font-bold text-2xl sm:text-3xl text-clip-text tabular-nums leading-tight mt-0.5">
              {formatViews(totalViews)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-green-600 text-xs flex-shrink-0">
          <TrendingUp className="w-3 h-3" />
          <span className="font-medium">live</span>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-8 gap-2 text-clip-muted text-xs">
          <Loader2 className="w-4 h-4 animate-spin text-clip-cyan" />
          Loading view counts…
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-6 gap-2 text-clip-muted text-xs">
          <AlertTriangle className="w-4 h-4 text-clip-amber/70" />
          {error}
        </div>
      ) : videos.length === 0 ? (
        <div className="flex items-center justify-center py-6 gap-2 text-clip-muted text-xs">
          <Eye className="w-4 h-4 opacity-50" />
          No trending videos loaded yet.
        </div>
      ) : (
        <div className="space-y-2.5">
          {sortedVideos.slice(0, 8).map((v) => {
            const views = v.viewCount || 0;
            const hasViews = views > 0;
            const widthPct = hasViews ? Math.max(2, (views / maxViews) * 100) : 6;

            // Title truncation for chart label
            const title = v.copyPack?.title || v.title || '';
            const truncatedTitle = title.length > 38 ? title.slice(0, 37) + '…' : title;

            return (
              <div key={v.id} className="flex items-center gap-2.5">
                {/* YouTube icon */}
                <PlatformIcon platform="youtube" className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />

                {/* Title */}
                <div className="text-xs text-clip-text truncate flex-1 min-w-0" title={title}>
                  {truncatedTitle || <span className="text-clip-muted italic">Untitled</span>}
                </div>

                {/* Bar */}
                <div className="w-20 sm:w-28 h-5 rounded-md bg-clip-surface/80 border border-white/[0.02] overflow-hidden flex-shrink-0 relative">
                  <div
                    className={`h-full rounded-md transition-all duration-500 bg-gradient-to-r from-clip-cyan to-violet-600 ${
                      !hasViews ? 'opacity-25' : ''
                    }`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>

                {/* View count */}
                <div className={`text-xs font-mono tabular-nums w-12 sm:w-14 text-right flex-shrink-0 ${
                  hasViews ? 'text-clip-text' : 'text-clip-muted/60'
                }`}>
                  {hasViews ? formatViews(views) : '—'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
