import { useState } from 'react';
import {
  Loader2, Crown, Copy, Check, ListOrdered,
  Calendar, Link2, TrendingUp, Sparkles, X, Plus, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { sequencePlaylist } from '@/services/api';
import type { PlaylistResponse, PlaylistResult } from '../types';
import { ParticleLoader } from './Loading';
import { PlatformIcon } from './BrandIcons';

interface PlaylistPanelProps {
  user: { plan: string } | null;
  onNavigate?: (page: 'pricing') => void;
}

/**
 * PlaylistPanel — Playlist Architect UI (Phase 3).
 *
 * Add 2-10 YouTube URLs → one button → returns:
 *   - recommended_order (with rationale)
 *   - distribution_schedule (youtube/tiktok/x/shorts)
 *   - cross_promotion_hooks
 *   - retention_forecast
 *   - thematic_arc
 */
export function PlaylistPanel({ user, onNavigate }: PlaylistPanelProps) {
  const [urls, setUrls] = useState<string[]>(['', '']);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlaylistResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<string | null>(null);

  const isPro = user?.plan === 'pro' || user?.plan === 'creator';

  const addUrl = () => {
    if (urls.length >= 10) return toast.error('Max 10 URLs per playlist');
    setUrls([...urls, '']);
  };
  const removeUrl = (i: number) => {
    if (urls.length <= 2) return;
    setUrls(urls.filter((_, idx) => idx !== i));
  };
  const updateUrl = (i: number, v: string) => {
    setUrls(urls.map((u, idx) => idx === i ? v : u));
  };

  const run = async () => {
    const filled = urls.map(u => u.trim()).filter(Boolean);
    if (filled.length < 2) return toast.error('Add at least 2 URLs');
    if (new Set(filled).size !== filled.length) return toast.error('Remove duplicate URLs');
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await sequencePlaylist(filled);
      setResult(data);
      toast.success(`Done in ${Math.round((data.processing_ms || 0) / 1000)}s · ${data.credits_remaining} credits left`);
    } catch (e: any) {
      const msg = e?.message || 'Playlist failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(id);
    toast.success('Copied!');
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  // ─── Loading state ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <ParticleLoader />
        <p className="text-clip-muted text-sm mt-4 text-center max-w-md">
          Analyzing all {urls.filter(u => u.trim()).length} videos + sequencing.<br />
          <span className="text-xs">Takes longer than Deep Analysis — 30–60 seconds for fresh URLs.</span>
        </p>
      </div>
    );
  }

  // ─── Result state ────────────────────────────────────────────────────────
  if (result) {
    const p: PlaylistResult = result.playlist;
    const videoMap = new Map(result.videos.map(v => [v.title.toLowerCase(), v]));

    return (
      <div className="space-y-4">
        {/* Thematic arc */}
        <div className="card-glass p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-clip-amber" />
            <h4 className="font-display font-semibold text-clip-text">Thematic Arc</h4>
          </div>
          <p className="text-sm text-clip-muted leading-relaxed">{p.thematic_arc}</p>
        </div>

        {/* Recommended order */}
        <div className="card-glass p-5">
          <h4 className="font-display font-semibold text-clip-text mb-4 flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-clip-cyan" /> Recommended Sequence
          </h4>
          <ol className="space-y-2">
            {p.recommended_order.map((item, i) => {
              const v = videoMap.get(item.title.toLowerCase());
              const thumb = v ? `https://i.ytimg.com/vi/${v.video_id}/mqdefault.jpg` : '';
              return (
                <li key={i} className="flex items-center gap-3 p-3 rounded-lg bg-clip-surface hover:bg-white/[0.02] transition-colors">
                  <span className="font-mono text-xs text-clip-muted w-5 text-right flex-shrink-0">{item.position}</span>
                  {thumb && (
                    <img src={thumb} alt="" className="w-14 h-9 rounded object-cover flex-shrink-0" loading="lazy" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-clip-text truncate">{item.title}</p>
                    <p className="text-xs text-clip-muted truncate">{item.rationale}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Distribution schedule */}
        <div className="card-glass p-5">
          <h4 className="font-display font-semibold text-clip-text mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-green-600" /> Distribution Schedule
          </h4>
          <div className="space-y-4">
            {(['youtube', 'tiktok', 'x', 'shorts'] as const).map(platform => {
              const rows = p.distribution_schedule[platform] || [];
              if (!rows.length) return null;
              const platformLabel: Record<string, string> = { youtube: 'YouTube', tiktok: 'TikTok', x: 'X', shorts: 'YouTube Shorts' };
              const platformColor: Record<string, string> = {
                youtube: 'text-red-600 bg-red-500/10',
                tiktok: 'text-pink-600 bg-pink-500/10',
                x: 'text-slate-300 bg-slate-500/10',
                shorts: 'text-clip-cyan bg-clip-cyan/6',
              };
              return (
                <div key={platform}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded inline-block mb-2 ${platformColor[platform]}`}>
                    {platformLabel[platform]}
                  </p>
                  <ul className="space-y-1.5 ml-1">
                    {rows.map((r, i) => (
                      <li key={i} className="text-xs text-clip-text flex items-start gap-2">
                        <span className="font-mono text-clip-muted w-12 flex-shrink-0">D{r.day}{'clip_segment' in r ? '' : 'time' in r ? '' : ''}</span>
                        <span className="flex-1">
                          <span className="text-clip-text">{r.video}</span>
                          {'time' in r && <span className="text-clip-muted"> · {r.time}</span>}
                          {'clip_segment' in r && <span className="text-clip-muted"> · clip {r.clip_segment}</span>}
                          {'format' in r && <span className="text-clip-muted"> · {r.format}</span>}
                          <span className="text-clip-muted"> — {r.reason}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cross-promotion hooks */}
        <div className="card-glass p-5">
          <h4 className="font-display font-semibold text-clip-text mb-4 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-clip-amber" /> Cross-Promotion Hooks
          </h4>
          <ul className="space-y-3">
            {p.cross_promotion_hooks.map((h, i) => (
              <li key={i} className="p-3 rounded-lg bg-clip-surface group">
                <p className="text-xs text-clip-muted mb-1">
                  <span className="text-clip-cyan">{h.from_video}</span>
                  <ArrowRight className="inline w-3 h-3 mx-1" />
                  <span className="text-clip-amber">{h.to_video}</span>
                </p>
                <p className="text-sm text-clip-text">{h.hook_script}</p>
                <button
                  onClick={() => copy(h.hook_script, `hook-${i}`)}
                  className="mt-2 text-clip-muted hover:text-clip-cyan text-xs flex items-center gap-1"
                >
                  {copiedIdx === `hook-${i}` ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                  {copiedIdx === `hook-${i}` ? 'Copied' : 'Copy script'}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Retention forecast */}
        <div className="card-glass p-5">
          <h4 className="font-display font-semibold text-clip-text mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-clip-cyan" /> Retention Forecast
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
              <p className="text-[10px] uppercase tracking-wider text-green-600 mb-1">Expected peak</p>
              <p className="text-sm text-clip-text truncate" title={p.retention_forecast.expected_peak_video}>{p.retention_forecast.expected_peak_video}</p>
            </div>
            <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
              <p className="text-[10px] uppercase tracking-wider text-red-600 mb-1">Expected weak</p>
              <p className="text-sm text-clip-text truncate" title={p.retention_forecast.expected_weak_video}>{p.retention_forecast.expected_weak_video}</p>
            </div>
            <div className="p-3 rounded-lg bg-clip-cyan/3 border border-clip-cyan/20">
              <p className="text-[10px] uppercase tracking-wider text-clip-cyan mb-1">Projected hours</p>
              <p className="text-sm text-clip-text font-mono">{p.retention_forecast.total_projected_watch_hours.toLocaleString()}</p>
            </div>
          </div>
          <p className="text-xs text-clip-muted italic">{p.retention_forecast.notes}</p>
        </div>

        {/* Reset CTA */}
        <div className="flex justify-center pt-4">
          <button
            onClick={() => { setResult(null); setUrls(['', '']); }}
            className="btn-secondary text-sm px-4 py-2"
          >
            Run another playlist
          </button>
        </div>
      </div>
    );
  }

  // ─── Input state ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">
      <div className="card-glass p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-clip-cyan/6 flex items-center justify-center flex-shrink-0">
            <ListOrdered className="w-5 h-5 text-clip-cyan" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-clip-text">Playlist Architect</h3>
            <p className="text-clip-muted text-xs">Sequence + distribute 2–10 videos · 5 credits</p>
          </div>
          {!isPro && (
            <span className="ml-auto text-[10px] font-bold uppercase text-clip-amber bg-clip-amber/10 border border-clip-amber/20 px-2 py-1 rounded">
              Pro
            </span>
          )}
        </div>

        <p className="text-clip-muted text-sm mb-6">
          Paste 2–10 YouTube URLs. We'll Deep-Analyze each one (reusing cached results where possible), then produce an optimal publishing order, per-platform distribution schedule, cross-promotion hooks, and a retention forecast.
        </p>

        <div className="space-y-2">
          {urls.map((u, i) => (
            <div key={i} className="flex gap-2">
              <div className="relative flex-1">
                <PlatformIcon platform="youtube" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-clip-muted" />
                <input
                  type="url"
                  value={u}
                  onChange={e => updateUrl(i, e.target.value)}
                  placeholder={`Video ${i + 1} — https://youtube.com/watch?v=...`}
                  className="input-dark w-full pl-10"
                />
              </div>
              {urls.length > 2 && (
                <button
                  onClick={() => removeUrl(i)}
                  className="text-clip-muted hover:text-red-600 transition-colors px-2"
                  aria-label="Remove"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={addUrl}
          disabled={urls.length >= 10}
          className="mt-3 text-xs text-clip-cyan hover:underline flex items-center gap-1 disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" /> Add another URL ({urls.length}/10)
        </button>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-red-600 text-xs">
            {error}
          </div>
        )}

        <button
          onClick={run}
          disabled={loading || urls.filter(u => u.trim()).length < 2}
          className="btn-primary w-full mt-6 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListOrdered className="w-4 h-4" />}
          {loading ? 'Sequencing…' : `Sequence Playlist (5 credits)`}
        </button>

        {!isPro && (
          <button
            onClick={() => onNavigate?.('pricing')}
            className="w-full mt-3 text-xs text-clip-amber hover:underline flex items-center justify-center gap-1"
          >
            <Crown className="w-3 h-3" /> Unlock on Pro plan — see Pricing
          </button>
        )}
      </div>
    </div>
  );
}
