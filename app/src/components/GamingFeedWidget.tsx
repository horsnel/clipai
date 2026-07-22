/**
 * GamingFeedWidget.tsx — Dashboard widget showing what's happening in the
 * user's game RIGHT NOW: official gaming news, dev tweets, and top Reddit
 * posts. Aggregated by GET /api/gaming-feed (2h backend cache + 1h client cache).
 *
 * Layout: 3-column grid on desktop, stacked on mobile.
 *   - Left:   Gaming News (IGN, Polygon, Eurogamer, etc.) — 8 items
 *   - Middle: Dev Tweets (official @-handles per game)   — 6 items
 *   - Right:  Reddit Top Posts (r/<game>)               — 5 items
 *
 * Falls back gracefully: if a source returns empty (no dev Twitter for an
 * obscure game), that column is hidden and the other two expand.
 *
 * No auth required. Uses the user's onboarding game preference if available.
 */
import { useState, useEffect } from 'react';
import {
  Newspaper, Twitter, MessageSquare,
  AlertTriangle, TrendingUp,
} from 'lucide-react';
import { getGamingFeed } from '@/services/api';
import type { GamingFeedResponse, GamingNewsItem, DevTweetItem, RedditPostItem } from '@/services/api';
import { SkeletonShimmer } from './Loading';

interface GamingFeedWidgetProps {
  /** Game to fetch feed for. If omitted, uses generic "gaming". */
  game?: string;
}

function timeAgo(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function NewsColumn({ items, loading }: { items: GamingNewsItem[]; loading: boolean }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
          <Newspaper className="w-4 h-4 text-blue-400" />
        </div>
        <h3 className="font-display font-semibold text-sm text-clip-text">Gaming News</h3>
        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
          OFFICIAL
        </span>
      </div>
      {loading ? (
        <SkeletonShimmer lines={5} className="!p-3" />
      ) : items.length === 0 ? (
        <p className="text-xs text-clip-muted py-4 text-center">No news found.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((n, i) => (
            <li key={i}>
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group rounded-lg p-2 hover:bg-clip-surface/60 border border-transparent hover:border-white/[0.06] transition-all"
              >
                <p className="text-xs font-medium text-clip-text leading-snug line-clamp-2 group-hover:text-clip-cyan transition-colors">
                  {n.title}
                </p>
                {n.snippet && (
                  <p className="text-[11px] text-clip-muted mt-1 line-clamp-2 leading-relaxed">
                    {n.snippet}
                  </p>
                )}
                <div className="flex items-center justify-between gap-2 mt-1.5">
                  <span className="text-[10px] text-clip-cyan/80 font-medium truncate">
                    {n.source}
                  </span>
                  {n.date && (
                    <span className="text-[10px] text-clip-muted/70 flex-shrink-0">
                      {timeAgo(n.date)}
                    </span>
                  )}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TweetsColumn({ items, loading }: { items: DevTweetItem[]; loading: boolean }) {
  if (!loading && items.length === 0) return null;
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-sky-500/15 flex items-center justify-center">
          <Twitter className="w-4 h-4 text-sky-400" />
        </div>
        <h3 className="font-display font-semibold text-sm text-clip-text">Dev Tweets</h3>
        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
          VERIFIED
        </span>
      </div>
      {loading ? (
        <SkeletonShimmer lines={5} className="!p-3" />
      ) : (
        <ul className="space-y-2">
          {items.map((t, i) => (
            <li key={i}>
              <a
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group rounded-lg p-2 hover:bg-clip-surface/60 border border-transparent hover:border-white/[0.06] transition-all"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[11px] font-semibold text-sky-400 truncate">
                    {t.author}
                  </span>
                  {t.date && (
                    <span className="text-[10px] text-clip-muted/70 flex-shrink-0">
                      · {timeAgo(t.date)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-clip-text leading-snug line-clamp-3 group-hover:text-clip-cyan transition-colors">
                  {t.snippet || t.title}
                </p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RedditColumn({ items, loading }: { items: RedditPostItem[]; loading: boolean }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-orange-400" />
        </div>
        <h3 className="font-display font-semibold text-sm text-clip-text">Reddit Top</h3>
        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">
          COMMUNITY
        </span>
      </div>
      {loading ? (
        <SkeletonShimmer lines={5} className="!p-3" />
      ) : items.length === 0 ? (
        <p className="text-xs text-clip-muted py-4 text-center">No posts found.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((r, i) => (
            <li key={i}>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group rounded-lg p-2 hover:bg-clip-surface/60 border border-transparent hover:border-white/[0.06] transition-all"
              >
                <p className="text-xs font-medium text-clip-text leading-snug line-clamp-2 group-hover:text-clip-cyan transition-colors">
                  {r.title}
                </p>
                <div className="flex items-center justify-between gap-2 mt-1.5">
                  <span className="text-[10px] text-orange-400/80 font-medium truncate">
                    {r.subreddit.replace(/^r\//, '')}
                  </span>
                  {r.publishedAt && (
                    <span className="text-[10px] text-clip-muted/70 flex-shrink-0">
                      {timeAgo(r.publishedAt)}
                    </span>
                  )}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main widget ─────────────────────────────────────────────────────────────

export function GamingFeedWidget({ game }: GamingFeedWidgetProps) {
  const [feed, setFeed] = useState<GamingFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    getGamingFeed(game)
      .then((data) => {
        if (!mounted) return;
        setFeed(data);
      })
      .catch((e) => {
        if (!mounted) return;
        setError(e?.message || 'Failed to load gaming feed');
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [game]);

  const gameLabel = (game || 'gaming').toLowerCase();
  const hasTweets = !loading && (feed?.devTweets?.length ?? 0) > 0;
  // If no tweets column, expand news + reddit to 2 equal columns on desktop
  const gridClass = hasTweets
    ? 'grid grid-cols-1 lg:grid-cols-3 gap-4'
    : 'grid grid-cols-1 lg:grid-cols-2 gap-4';

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-clip-cyan/15 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-5 h-5 text-clip-cyan" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-clip-text leading-tight">
              What's happening in <span className="capitalize text-clip-cyan">{gameLabel}</span>
            </h3>
            <p className="text-clip-muted text-xs mt-0.5 truncate">
              Official news · Dev tweets · Reddit top posts
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      {error ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
          <AlertTriangle className="w-8 h-8 text-clip-amber/70" />
          <p className="text-clip-muted text-sm">{error}</p>
        </div>
      ) : (
        <div className={gridClass}>
          <NewsColumn items={feed?.news ?? []} loading={loading} />
          <TweetsColumn items={feed?.devTweets ?? []} loading={loading} />
          <RedditColumn items={feed?.redditPosts ?? []} loading={loading} />
        </div>
      )}
    </section>
  );
}
