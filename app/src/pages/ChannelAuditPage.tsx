/**
 * ChannelAuditPage.tsx — Free channel audit flow shown after signup/onboarding.
 *
 * Flow:
 *   1. User pastes a channel URL (YouTube/TikTok/X/Instagram)
 *   2. We run a live audit (POST /api/audit-channel) — shows a loading state
 *   3. Audit result appears as a square preview card inline
 *   4. User can paste another URL to audit more channels (up to 8)
 *   5. "Go to Dashboard" button → navigates to dashboard, where all audited
 *      channels show as squares in the ChannelAuditsGrid
 *
 * Skippable: "Skip for now" link in the top-right navigates straight to the
 * dashboard without auditing.
 *
 * Also accessible from the dashboard's "Add channel" button — in that case the
 * user has already done onboarding, so we don't show the "first time" framing.
 */
import { useState, useRef, useEffect } from 'react';
import type { Page } from '../App';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, ArrowLeft, Check, X, Loader2,
  Youtube, Music2, Twitter, Instagram, AlertTriangle, Link2,
  Sparkles, Trash2, ExternalLink, Search, MessageCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { auditChannel } from '@/services/api';
import type { ChannelAudit, AuditPlatform } from '../types';

interface ChannelAuditPageProps {
  user: { name: string; email: string } | null;
  onNavigate: (page: Page) => void;
  onComplete: () => void;
}

interface AuditState {
  url: string;
  status: 'loading' | 'done' | 'error';
  audit?: ChannelAudit;
  error?: string;
}

const PLATFORM_HINTS: Array<{ platform: AuditPlatform; label: string; icon: React.ElementType; color: string; example: string }> = [
  { platform: 'youtube',   label: 'YouTube',   icon: Youtube,       color: 'text-red-500',     example: 'youtube.com/@MrBeast' },
  { platform: 'tiktok',    label: 'TikTok',    icon: Music2,        color: 'text-clip-cyan',   example: 'tiktok.com/@username' },
  { platform: 'instagram', label: 'Instagram', icon: Instagram,     color: 'text-pink-400',    example: 'instagram.com/username' },
  { platform: 'twitter',   label: 'X',         icon: Twitter,       color: 'text-slate-300',   example: 'x.com/username' },
  { platform: 'reddit',    label: 'Reddit',    icon: MessageCircle, color: 'text-orange-500',  example: 'reddit.com/u/username' },
];

const MAX_AUDITS = 8;

function detectPlatformFromUrl(url: string): AuditPlatform | null {
  const u = (url || '').toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('x.com') || u.includes('twitter.com')) return 'twitter';
  if (u.includes('reddit.com') || u.includes('redd.it')) return 'reddit';
  return null;
}

export function ChannelAuditPage({ user, onNavigate: _onNavigate, onComplete }: ChannelAuditPageProps) {
  const [url, setUrl] = useState('');
  const [audits, setAudits] = useState<AuditState[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const completedAudits = audits.filter(a => a.status === 'done' && a.audit);

  const runAudit = async (urlToAudit: string) => {
    const trimmed = urlToAudit.trim();
    if (!trimmed) {
      toast.error('Paste a channel URL first');
      return;
    }
    const platform = detectPlatformFromUrl(trimmed);
    if (!platform) {
      toast.error('Unsupported link. Use a YouTube, TikTok, X, Instagram, or Reddit URL.');
      return;
    }
    if (completedAudits.length >= MAX_AUDITS) {
      toast.error(`You've reached the ${MAX_AUDITS}-channel limit. Remove one to add another.`);
      return;
    }
    // Dedupe — if URL already audited, don't re-run
    if (audits.some(a => a.url === trimmed && a.status === 'done')) {
      toast('You already audited this channel', { icon: 'ℹ️' });
      return;
    }

    setSubmitting(true);
    // Optimistically add a loading entry
    const entry: AuditState = { url: trimmed, status: 'loading' };
    setAudits(prev => [entry, ...prev.filter(a => a.url !== trimmed)]);
    setUrl('');

    try {
      const data = await auditChannel(trimmed);
      setAudits(prev => prev.map(a =>
        a.url === trimmed ? { ...a, status: 'done', audit: data.audit } : a
      ));
      toast.success(`Audit complete for ${data.audit.channelName}`);
    } catch (e: any) {
      const msg = e?.message || 'Audit failed';
      setAudits(prev => prev.map(a =>
        a.url === trimmed ? { ...a, status: 'error', error: msg } : a
      ));
      toast.error(msg);
    } finally {
      setSubmitting(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    runAudit(url);
  };

  const removeAudit = (urlToRemove: string) => {
    setAudits(prev => prev.filter(a => a.url !== urlToRemove));
  };

  const retryAudit = (urlToRetry: string) => {
    runAudit(urlToRetry);
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-20 px-4 relative">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/3 rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-clip-cyan/3 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-2xl relative z-10">
        {/* Top bar — back + skip */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={onComplete}
            className="text-clip-muted hover:text-clip-text text-xs transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" /> Skip for now
          </button>
          <span className="text-[10px] text-clip-muted/70 uppercase tracking-wider">
            Free · No credits used
          </span>
        </div>

        {/* Card */}
        <div className="card-glass p-6 sm:p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-clip-cyan/15 to-purple-500/15 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-clip-cyan" />
            </div>
            <div>
              <h2 className="font-display font-bold text-xl text-clip-text">
                Free Channel Audit
              </h2>
              <p className="text-clip-muted text-xs mt-0.5">
                Get an instant analytics snapshot of your channel
              </p>
            </div>
          </div>

          <p className="text-clip-muted text-sm leading-relaxed mb-5">
            Hi {user?.name ?? 'Creator'}! Paste a link to your YouTube, TikTok, X, Instagram, or Reddit
            channel and we'll pull a free analytics report — subscribers, total views, recent
            posts, engagement rate. You can audit up to {MAX_AUDITS} channels.
          </p>

          {/* Platform hints */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {PLATFORM_HINTS.map(p => {
              const Icon = p.icon;
              return (
                <div key={p.platform} className="inline-flex items-center gap-1 text-[10px] text-clip-muted">
                  <Icon className={`w-3.5 h-3.5 ${p.color}`} />
                  {p.label}
                </div>
              );
            })}
          </div>

          {/* URL input form */}
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 mb-5">
            <div className="relative flex-1">
              <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-clip-muted pointer-events-none" />
              <input
                ref={inputRef}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste your channel URL (e.g. youtube.com/@yourchannel)"
                disabled={submitting}
                className="input-dark pl-10 w-full disabled:opacity-50"
              />
            </div>
            <Button
              type="submit"
              disabled={submitting || !url.trim()}
              className="btn-primary py-2.5 px-5 flex items-center gap-2 text-sm justify-center"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Auditing…</>
              ) : (
                <><Search className="w-4 h-4" /> Run free audit</>
              )}
            </Button>
          </form>

          {/* Audit results list */}
          {audits.length > 0 && (
            <div className="space-y-2.5 mb-5">
              {audits.map((entry) => (
                <AuditResultRow
                  key={entry.url}
                  entry={entry}
                  onRemove={() => removeAudit(entry.url)}
                  onRetry={() => retryAudit(entry.url)}
                />
              ))}
            </div>
          )}

          {/* Footer — go to dashboard */}
          <div className="flex items-center justify-between gap-3 mt-6 pt-5 border-t border-white/[0.025]">
            <p className="text-xs text-clip-muted">
              {completedAudits.length > 0
                ? `${completedAudits.length} channel${completedAudits.length === 1 ? '' : 's'} audited`
                : 'You can add channels later from the dashboard'}
            </p>
            <Button
              onClick={onComplete}
              className="btn-primary py-2.5 px-5 flex items-center gap-2 text-sm"
            >
              Go to Dashboard <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Helper text */}
        <p className="text-center text-clip-muted text-xs mt-5">
          YouTube & Reddit audits return real follower counts & engagement data.
          <br />
          TikTok, X & Instagram audits require API keys (LamaTok / KonbiniAPI / SocialData) for full stats — without keys they show recent posts only.
        </p>
      </div>
    </div>
  );
}

// ─── Audit result row (inline preview after each audit) ──────────────────────
function AuditResultRow({ entry, onRemove, onRetry }: {
  entry: AuditState;
  onRemove: () => void;
  onRetry: () => void;
}) {
  if (entry.status === 'loading') {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl bg-clip-surface/50 border border-white/[0.025]">
        <Loader2 className="w-5 h-5 text-clip-cyan animate-spin flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-clip-text truncate">Auditing…</p>
          <p className="text-xs text-clip-muted truncate">{entry.url}</p>
        </div>
      </div>
    );
  }

  if (entry.status === 'error') {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/3 border border-red-500/15">
        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-clip-text truncate">Audit failed</p>
          <p className="text-xs text-clip-muted truncate">{entry.error}</p>
        </div>
        <button onClick={onRetry} className="text-xs text-clip-cyan hover:underline flex-shrink-0">
          Retry
        </button>
        <button onClick={onRemove} className="text-clip-muted hover:text-red-500 transition-colors flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Done — show a compact preview row
  const audit = entry.audit!;
  const platform = audit.platform;
  const PlatformIcon = platform === 'youtube' ? Youtube : platform === 'tiktok' ? Music2 : platform === 'instagram' ? Instagram : platform === 'reddit' ? MessageCircle : Twitter;
  const platformColor = platform === 'youtube' ? 'text-red-500' : platform === 'tiktok' ? 'text-clip-cyan' : platform === 'instagram' ? 'text-pink-400' : platform === 'reddit' ? 'text-orange-500' : 'text-slate-300';

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-clip-surface/50 border border-white/[0.025] hover:border-white/[0.06] transition-colors">
      {/* Avatar or platform icon */}
      {audit.avatar ? (
        <img
          src={audit.avatar}
          alt={audit.channelName}
          className="w-10 h-10 rounded-full object-cover flex-shrink-0 bg-clip-surface"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-clip-surface flex items-center justify-center flex-shrink-0">
          <PlatformIcon className={`w-5 h-5 ${platformColor}`} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-clip-text truncate">{audit.channelName}</p>
          <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
        </div>
        <p className="text-xs text-clip-muted truncate">
          {audit.channelHandle || entry.url}
        </p>
      </div>

      {/* Quick stats (real-audit platforms) */}
      {!audit.statistics.hiddenSubscriberCount && (
        <div className="hidden sm:flex items-center gap-3 text-xs text-clip-muted flex-shrink-0">
          <span className="tabular-nums">{formatShort(audit.statistics.subscribers)} {platform === 'reddit' ? 'subs' : 'subs'}</span>
          <span className="tabular-nums">{formatShort(audit.statistics.totalViews)} {platform === 'reddit' ? 'karma' : 'views'}</span>
        </div>
      )}

      <a
        href={entry.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-clip-muted hover:text-clip-cyan transition-colors flex-shrink-0"
        aria-label="Open channel"
      >
        <ExternalLink className="w-4 h-4" />
      </a>
      <button
        onClick={onRemove}
        className="text-clip-muted hover:text-red-500 transition-colors flex-shrink-0"
        aria-label="Remove audit"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function formatShort(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}
