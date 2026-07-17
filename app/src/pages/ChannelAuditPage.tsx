/**
 * ChannelAuditPage.tsx — Free channel audit flow shown after signup/onboarding.
 *
 * Flow:
 *   1. User enters a channel URL OR bare username (with platform selector)
 *   2. We run a live audit (POST /api/audit-channel) — shows a loading state
 *   3. Audit result appears as a square preview card inline
 *   4. User can audit more channels (up to 8)
 *   5. "Go to Dashboard" button → navigates to dashboard
 *
 * Input formats supported (server-side normalises everything):
 *   - Full URL:  https://youtube.com/@MrBeast
 *   - Bare @:    @MrBeast           (requires platform selector)
 *   - Plain:     MrBeast            (requires platform selector)
 *   - Prefixed:  yt:MrBeast, tt:khaby.lame, ig:keke, x:elonmusk, r:spez
 */
import { useState, useRef, useEffect } from 'react';
import type { Page } from '../App';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, ArrowLeft, Check, X, Loader2,
  AlertTriangle, Link2,
  Sparkles, Trash2, ExternalLink, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { auditChannel } from '@/services/api';
import { InfoIconPopup } from '@/components/InfoIconPopup';
import { PlatformIcon } from '@/components/BrandIcons';
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

const PLATFORM_OPTIONS: Array<{ value: AuditPlatform; label: string; color: string }> = [
  { value: 'youtube',   label: 'YouTube',   color: 'text-red-500' },
  { value: 'tiktok',    label: 'TikTok',    color: 'text-clip-cyan' },
  { value: 'instagram', label: 'Instagram', color: 'text-pink-400' },
  { value: 'twitter',   label: 'X',         color: 'text-slate-300' },
  { value: 'reddit',    label: 'Reddit',    color: 'text-orange-500' },
];

const MAX_AUDITS = 8;

/** Returns true if the input looks like a full URL (has a platform domain). */
function isFullUrl(s: string): boolean {
  const u = s.toLowerCase();
  return u.includes('youtube.com') || u.includes('youtu.be') ||
         u.includes('tiktok.com') ||
         u.includes('instagram.com') ||
         u.includes('x.com') || u.includes('twitter.com') ||
         u.includes('reddit.com') || u.includes('redd.it');
}

/** Returns true if the input has a recognised platform prefix (yt:, tt:, etc.). */
function hasPlatformPrefix(s: string): boolean {
  return /^(yt|tt|ig|tw|x|rdt|r|reddit):/i.test(s.trim());
}

export function ChannelAuditPage({ user: _user, onNavigate: _onNavigate, onComplete }: ChannelAuditPageProps) {
  const [input, setInput] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<AuditPlatform | null>(null);
  const [audits, setAudits] = useState<AuditState[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const completedAudits = audits.filter(a => a.status === 'done' && a.audit);

  const runAudit = async (rawInput: string, platform: AuditPlatform | null) => {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      toast.error('Enter a channel URL or username first');
      return;
    }
    // If input is a full URL OR has a platform prefix, we don't need a selected platform.
    // Otherwise we require the user to pick a platform.
    const needsPlatform = !isFullUrl(trimmed) && !hasPlatformPrefix(trimmed);
    if (needsPlatform && !platform) {
      toast.error('Pick a platform (YouTube, TikTok, etc.) for bare usernames, or paste a full URL.');
      return;
    }
    if (completedAudits.length >= MAX_AUDITS) {
      toast.error(`You've reached the ${MAX_AUDITS}-channel limit. Remove one to add another.`);
      return;
    }

    // Build the request body. Send the raw input + the selected platform as a hint.
    // The backend normalises everything — full URL, prefixed username, or bare
    // username + platformHint — into a canonical URL.
    const requestBody: { url: string; platform?: string } = { url: trimmed };
    if (needsPlatform && platform) requestBody.platform = platform;

    // Use the canonical URL for dedup (so user can't double-add the same channel)
    // We optimistically hash the input + platform for the dedup key.
    const dedupKey = `${trimmed.toLowerCase()}::${platform || 'auto'}`;
    if (audits.some(a => a.url === dedupKey && a.status === 'done')) {
      toast('You already audited this channel', { icon: 'ℹ️' });
      return;
    }

    setSubmitting(true);
    const entry: AuditState = { url: dedupKey, status: 'loading' };
    setAudits(prev => [entry, ...prev.filter(a => a.url !== dedupKey)]);
    setInput('');

    try {
      const data = await auditChannel(requestBody.url, requestBody.platform);
      setAudits(prev => prev.map(a =>
        a.url === dedupKey ? { ...a, status: 'done', audit: data.audit } : a
      ));
      // Surface credit charge to the user — free audits get a normal toast,
      // charged audits get an info toast showing the deduction + new balance.
      const charge = data.charge;
      if (charge && !charge.free && charge.charged > 0) {
        toast.success(`Audit complete · −${charge.charged} credit · ${charge.balance} left`);
      } else if (charge && charge.free && charge.charged === 0) {
        // Distinguish "first free audit used" from "cache hit (always free)"
        // by checking balance — first-free users will have a non-zero balance
        // typically, but we don't need to differentiate for the toast.
        toast.success(`Audit complete for ${data.audit.channelName} · Free`);
      } else {
        toast.success(`Audit complete for ${data.audit.channelName}`);
      }
    } catch (e: any) {
      const msg = e?.message || 'Audit failed';
      setAudits(prev => prev.map(a =>
        a.url === dedupKey ? { ...a, status: 'error', error: msg } : a
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
    runAudit(input, selectedPlatform);
  };

  const removeAudit = (key: string) => {
    setAudits(prev => prev.filter(a => a.url !== key));
  };

  const retryAudit = (key: string) => {
    // Find the original input + platform from the audit entry
    const entry = audits.find(a => a.url === key);
    if (!entry) return;
    // We can't perfectly reconstruct the original input, so retry with the canonical URL from the audit
    const canonicalUrl = entry.audit?.url || entry.url;
    runAudit(canonicalUrl, null);
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
            1st free · then 1 credit each
          </span>
        </div>

        {/* Card */}
        <div className="card-glass p-6 sm:p-8">
          {/* Header — title + info icon (no inline explanation paragraph) */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-clip-cyan/15 to-purple-500/15 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-clip-cyan" />
            </div>
            <div className="flex items-center gap-1.5">
              <h2 className="font-display font-bold text-xl text-clip-text">
                Free Channel Audit
              </h2>
              <InfoIconPopup label="What is a Channel Audit?" size="md">
                Paste a link to your YouTube, TikTok, X, Instagram, or Reddit
                channel — or just type the username and pick a platform — and
                we'll pull a free analytics report: subscribers, total views,
                recent posts, and engagement rate. You can audit up to {MAX_AUDITS} channels.
                <br /><br />
                YouTube and Reddit audits return real follower counts and engagement data.
                TikTok, X, and Instagram audits use third-party scrapers (Sociavault, ScrapeCreators,
                SocialData) — without API keys they fall back to a lite mode showing recent posts only.
              </InfoIconPopup>
            </div>
          </div>

          {/* Platform selector — required only when input is a bare username */}
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-wider text-clip-muted/70 mb-2">
              Pick a platform <span className="text-clip-muted/40">(only needed for bare usernames)</span>
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {PLATFORM_OPTIONS.map(p => {
                const selected = selectedPlatform === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setSelectedPlatform(selected ? null : p.value)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      selected
                        ? 'bg-clip-cyan/15 border-clip-cyan/50 text-clip-cyan'
                        : 'bg-clip-surface border-white/[0.025] text-clip-muted hover:border-white/[0.06] hover:text-clip-text'
                    }`}
                  >
                    <PlatformIcon platform={p.value} className={`w-3.5 h-3.5 ${selected ? 'text-clip-cyan' : p.color}`} />
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* URL / username input form */}
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 mb-5">
            <div className="relative flex-1">
              <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-clip-muted pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste URL or @username — e.g. youtube.com/@MrBeast  or  @khaby.lame"
                disabled={submitting}
                className="input-dark pl-10 w-full disabled:opacity-50"
              />
            </div>
            <Button
              type="submit"
              disabled={submitting || !input.trim()}
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
          <PlatformIcon platform={platform} className={`w-5 h-5 ${platformColor}`} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-clip-text truncate">{audit.channelName}</p>
          <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
        </div>
        <p className="text-xs text-clip-muted truncate">
          {audit.channelHandle || audit.url}
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
        href={audit.url}
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
