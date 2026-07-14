import { useState, useEffect, useCallback } from 'react';
import {
  X, Search, Type, MessageCircle, Hash, Copy, Check,
  Loader2, TrendingUp, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/services/api';
import type { TrendItem } from '../pages/TrendRadarPage';

interface TrendCardModalProps {
  trend: TrendItem;
  onClose: () => void;
}

interface TrendAssets {
  keywords: string[];
  titles: { text: string; score: number }[];
  captions: { text: string; vibe: string }[];
  hashtags: string[];
  trend?: string;
  game?: string;
  platform?: string;
  generatedAt?: string;
  credits_remaining?: number;
}

// In-memory cache so re-clicking a trend is instant.
// Keyed by `${trend.name}|${trend.game}|${trend.platform}`.
const assetsCache = new Map<string, TrendAssets>();

export function TrendCardModal({ trend, onClose }: TrendCardModalProps) {
  const [assets, setAssets] = useState<TrendAssets | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Lock body scroll while modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const cacheKey = `${trend.name}|${trend.game}|${trend.platform ?? 'unknown'}`;

  const fetchAssets = useCallback(async () => {
    // Check cache first
    const cached = assetsCache.get(cacheKey);
    if (cached) {
      setAssets(cached);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      // Use apiClient so the auth header is sent + 402s auto-trigger the UpgradeModal.
      const data = await apiClient.post<TrendAssets>('/trends/assets', {
        trend: trend.name,
        game: trend.game || 'Gaming',
        platform: trend.platform ?? 'tiktok',
        category: trend.category,
      });
      assetsCache.set(cacheKey, data);
      setAssets(data);
    } catch (e: any) {
      // If the error is a 402 (insufficient credits / plan required), the
      // apiClient has already dispatched the UPGRADE_REQUIRED event and the
      // global modal will appear. We just close this modal silently.
      if (e?.status === 402) {
        onClose();
        return;
      }
      // 401 = not logged in. Show a friendly message pointing to login.
      if (e?.status === 401) {
        setError('Please sign in to generate content packs. It only takes 10 seconds and you get 50 free credits.');
        return;
      }
      setError(e.message || 'Failed to generate assets');
    } finally {
      setIsLoading(false);
    }
  }, [cacheKey, trend, onClose]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedKey(k => k === key ? null : k), 1500);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
      setCopiedKey(key);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedKey(k => k === key ? null : k), 1500);
    }
  }, []);

  const copyAll = useCallback((items: string[], sectionKey: string) => {
    if (items.length === 0) return;
    copyToClipboard(items.join('\n'), sectionKey);
  }, [copyToClipboard]);

  // Click on backdrop closes modal
  const onBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={onBackdropClick}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
    >
      <div
        className="bg-clip-dark border border-white/[0.08] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] sm:max-h-[85vh] flex flex-col shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={`Content assets for ${trend.name}`}
      >
        {/* Header */}
        <div className="p-5 border-b border-white/[0.06] flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-clip-cyan text-xs font-medium uppercase tracking-wider flex items-center gap-1 flex-shrink-0">
                <Sparkles className="w-3 h-3" />
                Content Pack
              </span>
              {trend.platform && (
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/[0.08] text-clip-muted uppercase tracking-wide flex-shrink-0">
                  {trend.platform === 'google_trends' ? 'Google' : trend.platform === 'twitter' ? 'X' : trend.platform}
                </span>
              )}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-400/10 text-green-400 uppercase tracking-wide flex-shrink-0">
                {trend.status}
              </span>
            </div>
            <h2 className="font-display font-bold text-xl text-clip-text break-words leading-tight">
              {trend.name}
            </h2>
            {trend.game && trend.game !== 'All' && (
              <p className="text-clip-muted text-xs mt-1">{trend.game}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-clip-muted hover:text-clip-text hover:bg-white/[0.05] rounded-lg transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 text-clip-cyan animate-spin" />
              <p className="text-clip-muted text-sm">Generating content pack...</p>
              <p className="text-clip-muted text-xs">Keywords, titles, captions & hashtags</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                <X className="w-6 h-6 text-red-400" />
              </div>
              <p className="text-clip-text font-medium">Couldn't generate assets</p>
              <p className="text-clip-muted text-xs text-center max-w-xs">{error}</p>
              <button onClick={fetchAssets} className="btn-secondary text-sm px-4 py-2 mt-2">
                Try again
              </button>
            </div>
          )}

          {assets && !isLoading && !error && (
            <>
              {/* KEYWORDS */}
              {assets.keywords.length > 0 && (
                <Section
                  icon={<Search className="w-4 h-4" />}
                  title="Search Keywords"
                  hint="Type these into YouTube/TikTok search"
                  onCopyAll={() => copyAll(assets.keywords, 'keywords')}
                  copiedKey={copiedKey}
                  copyId="keywords"
                >
                  <div className="space-y-2">
                    {assets.keywords.map((kw, i) => (
                      <CopyRow
                        key={`kw-${i}`}
                        text={kw}
                        onCopy={() => copyToClipboard(kw, `kw-${i}`)}
                        copied={copiedKey === `kw-${i}`}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {/* TITLES */}
              {assets.titles.length > 0 && (
                <Section
                  icon={<Type className="w-4 h-4" />}
                  title="Video Titles"
                  hint="Optimised for algorithm clicks"
                  onCopyAll={() => copyAll(assets.titles.map(t => t.text), 'titles')}
                  copiedKey={copiedKey}
                  copyId="titles"
                >
                  <div className="space-y-2">
                    {assets.titles.map((t, i) => (
                      <CopyRow
                        key={`title-${i}`}
                        text={t.text}
                        badge={t.score ? `${t.score}` : undefined}
                        badgeColor={t.score >= 90 ? 'green' : t.score >= 80 ? 'cyan' : 'amber'}
                        onCopy={() => copyToClipboard(t.text, `title-${i}`)}
                        copied={copiedKey === `title-${i}`}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {/* CAPTIONS */}
              {assets.captions.length > 0 && (
                <Section
                  icon={<MessageCircle className="w-4 h-4" />}
                  title="Captions"
                  hint="Ready to paste under your post"
                  onCopyAll={() => copyAll(assets.captions.map(c => c.text), 'captions')}
                  copiedKey={copiedKey}
                  copyId="captions"
                >
                  <div className="space-y-2">
                    {assets.captions.map((c, i) => (
                      <CopyRow
                        key={`cap-${i}`}
                        text={c.text}
                        badge={c.vibe}
                        badgeColor="purple"
                        onCopy={() => copyToClipboard(c.text, `cap-${i}`)}
                        copied={copiedKey === `cap-${i}`}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {/* HASHTAGS */}
              {assets.hashtags.length > 0 && (
                <Section
                  icon={<Hash className="w-4 h-4" />}
                  title="Hashtags"
                  hint="Copy all & paste into post"
                  onCopyAll={() => copyToClipboard(assets.hashtags.join(' '), 'hashtags')}
                  copiedKey={copiedKey}
                  copyId="hashtags"
                >
                  <div className="flex flex-wrap gap-1.5">
                    {assets.hashtags.map((tag, i) => (
                      <button
                        key={`tag-${i}`}
                        onClick={() => copyToClipboard(tag, `tag-${i}`)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all border ${
                          copiedKey === `tag-${i}`
                            ? 'bg-clip-cyan text-black border-clip-cyan'
                            : 'bg-clip-surface text-clip-cyan border-clip-cyan/20 hover:border-clip-cyan/40 hover:bg-clip-cyan/10'
                        }`}
                      >
                        {copiedKey === `tag-${i}` ? <Check className="w-3 h-3 inline mr-1" /> : null}
                        {tag}
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              {/* Empty state */}
              {assets.keywords.length === 0 && assets.titles.length === 0 &&
               assets.captions.length === 0 && assets.hashtags.length === 0 && (
                <div className="text-center py-8">
                  <TrendingUp className="w-10 h-10 mx-auto mb-3 text-clip-muted opacity-50" />
                  <p className="text-clip-muted text-sm">No assets generated. Try again.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {assets && !isLoading && !error && (
          <div className="p-4 border-t border-white/[0.06] flex-shrink-0">
            <p className="text-clip-muted text-xs text-center">
              Tap any item to copy · <span className="text-clip-cyan">{assets.hashtags.length}</span> hashtags ready
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  onCopyAll: () => void;
  copiedKey: string | null;
  copyId: string;
  children: React.ReactNode;
}

function Section({ icon, title, hint, onCopyAll, copiedKey, copyId, children }: SectionProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-clip-cyan/10 flex items-center justify-center flex-shrink-0 text-clip-cyan">
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-sm text-clip-text">{title}</h3>
            {hint && <p className="text-clip-muted text-xs truncate">{hint}</p>}
          </div>
        </div>
        <button
          onClick={onCopyAll}
          className={`text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all flex-shrink-0 ${
            copiedKey === copyId
              ? 'bg-green-500/15 text-green-400'
              : 'bg-clip-surface text-clip-muted hover:text-clip-text border border-white/[0.06]'
          }`}
        >
          {copiedKey === copyId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          <span className="hidden sm:inline">{copiedKey === copyId ? 'Copied' : 'Copy all'}</span>
        </button>
      </div>
      {children}
    </div>
  );
}

interface CopyRowProps {
  text: string;
  badge?: string;
  badgeColor?: 'green' | 'cyan' | 'amber' | 'purple';
  onCopy: () => void;
  copied: boolean;
}

const BadgeColors: Record<string, string> = {
  green: 'bg-green-400/10 text-green-400',
  cyan: 'bg-clip-cyan/10 text-clip-cyan',
  amber: 'bg-clip-amber/10 text-clip-amber',
  purple: 'bg-purple-400/10 text-purple-400',
};

function CopyRow({ text, badge, badgeColor = 'cyan', onCopy, copied }: CopyRowProps) {
  return (
    <div
      onClick={onCopy}
      className={`group flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
        copied
          ? 'bg-clip-cyan/10 border-clip-cyan/40'
          : 'bg-clip-surface border-white/[0.04] hover:border-white/[0.1] hover:bg-white/[0.03]'
      }`}
    >
      <p className="flex-1 text-sm text-clip-text min-w-0 break-words leading-snug">
        {text}
      </p>
      {badge && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide flex-shrink-0 ${BadgeColors[badgeColor]}`}>
          {badge}
        </span>
      )}
      <div className="flex-shrink-0">
        {copied ? (
          <Check className="w-4 h-4 text-green-400" />
        ) : (
          <Copy className="w-4 h-4 text-clip-muted group-hover:text-clip-cyan transition-colors" />
        )}
      </div>
    </div>
  );
}
