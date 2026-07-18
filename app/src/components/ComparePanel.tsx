import { useState } from 'react';
import {
  Loader2, Crown, Copy, Check, Trophy,
  TrendingUp, Minus, ArrowRight, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { compareVideos } from '@/services/api';
import type { CompareResponse, ComparisonResult } from '../types';
import { SkeletonList } from './Loading';
import { PlatformIcon } from './BrandIcons';

interface ComparePanelProps {
  user: { plan: string } | null;
  onNavigate?: (page: 'pricing') => void;
}

/**
 * ComparePanel — Competitor Lab UI (Phase 2).
 *
 * Two URL inputs → one button → head-to-head comparison rendered as
 * collapsible cards: winner banner, viral gap, voice gap, predictive
 * comments, comparison metrics, steal playbook.
 */
export function ComparePanel({ user, onNavigate }: ComparePanelProps) {
  const [urlA, setUrlA] = useState('');
  const [urlB, setUrlB] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const isPro = user?.plan === 'pro' || user?.plan === 'creator';

  const run = async () => {
    if (!urlA.trim() || !urlB.trim()) {
      toast.error('Paste both YouTube URLs');
      return;
    }
    if (urlA === urlB) {
      toast.error('Cannot compare a video to itself');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await compareVideos(urlA.trim(), urlB.trim());
      setResult(data);
      toast.success(`Done in ${Math.round((data.processing_ms || 0) / 1000)}s · ${data.credits_remaining} credits left`);
    } catch (e: any) {
      const msg = e?.message || 'Comparison failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success('Copied!');
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  // ─── Loading state ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <SkeletonList count={3} avatar />
        <p className="text-clip-muted text-sm mt-4 text-center max-w-md">
          Fetching both transcripts + running comparison LLM call.<br />
          <span className="text-xs">Takes 15 to 30 seconds if either URL is new.</span>
        </p>
      </div>
    );
  }

  // ─── Result state ────────────────────────────────────────────────────────
  if (result) {
    const c: ComparisonResult = result.comparison;
    const MetricBadge = ({ adv }: { adv: string }) => {
      if (adv === 'A') return <span className="text-xs font-bold text-clip-cyan px-1.5 py-0.5 rounded bg-clip-cyan/6">A wins</span>;
      if (adv === 'B') return <span className="text-xs font-bold text-clip-amber px-1.5 py-0.5 rounded bg-clip-amber/10">B wins</span>;
      return <span className="text-xs text-clip-muted px-1.5 py-0.5 rounded bg-clip-surface border border-white/[0.02]">tie</span>;
    };

    return (
      <div className="space-y-4">
        {/* Header with both videos */}
        <div className="card-glass p-5">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-center">
            <VideoCard label="A" video={result.videos.a} isWinner={c.winner === 'A'} />
            <div className="text-center text-clip-muted text-xs uppercase tracking-wider">vs</div>
            <VideoCard label="B" video={result.videos.b} isWinner={c.winner === 'B'} />
          </div>
          <div className="mt-4 pt-4 border-t border-white/[0.025] text-center">
            <p className="text-clip-muted text-xs uppercase tracking-wider mb-1">Verdict</p>
            <p className="font-display font-semibold text-clip-text">{c.winner_reason}</p>
          </div>
        </div>

        {/* Comparison metrics */}
        <div className="card-glass p-5">
          <h4 className="font-display font-semibold text-clip-text mb-4">Metrics</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['hook', 'pacing', 'distribution', 'retention'] as const).map(k => (
              <div key={k} className="text-center p-3 rounded-lg bg-clip-surface">
                <p className="text-clip-muted text-[10px] uppercase tracking-wider mb-1.5">{k}</p>
                <p className="font-mono text-sm text-clip-text">{String(c.comparison_metrics[k].a)} <span className="text-clip-muted">vs</span> {String(c.comparison_metrics[k].b)}</p>
                <div className="mt-2"><MetricBadge adv={c.comparison_metrics[k].advantage} /></div>
              </div>
            ))}
          </div>
        </div>

        {/* Viral Gap */}
        <div className="card-glass p-5">
          <h4 className="font-display font-semibold text-clip-text mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-clip-cyan" /> Viral Gap
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-clip-muted mb-2">A missed these angles</p>
              <ul className="space-y-1.5">{c.viral_gap.a_missed.map((x, i) => <li key={i} className="text-sm text-clip-text flex gap-2"><span className="text-clip-muted">·</span> {x}</li>)}</ul>
            </div>
            <div>
              <p className="text-xs text-clip-muted mb-2">B missed these angles</p>
              <ul className="space-y-1.5">{c.viral_gap.b_missed.map((x, i) => <li key={i} className="text-sm text-clip-text flex gap-2"><span className="text-clip-muted">·</span> {x}</li>)}</ul>
            </div>
            <div>
              <p className="text-xs text-clip-cyan mb-2">A's exclusive wins</p>
              <ul className="space-y-1.5">{c.viral_gap.a_exclusive_wins.map((x, i) => <li key={i} className="text-sm text-clip-text flex gap-2"><span className="text-clip-cyan">+</span> {x}</li>)}</ul>
            </div>
            <div>
              <p className="text-xs text-clip-amber mb-2">B's exclusive wins</p>
              <ul className="space-y-1.5">{c.viral_gap.b_exclusive_wins.map((x, i) => <li key={i} className="text-sm text-clip-text flex gap-2"><span className="text-clip-amber">+</span> {x}</li>)}</ul>
            </div>
          </div>
        </div>

        {/* Voice Gap */}
        <div className="card-glass p-5">
          <h4 className="font-display font-semibold text-clip-text mb-4 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" /> Voice Gap
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div className="p-3 rounded-lg bg-clip-cyan/3 border border-clip-cyan/10">
              <p className="text-[10px] uppercase tracking-wider text-clip-cyan mb-1">A's voice</p>
              <p className="text-sm text-clip-text">{c.voice_gap.a_voice}</p>
            </div>
            <div className="p-3 rounded-lg bg-clip-amber/3 border border-clip-amber/10">
              <p className="text-[10px] uppercase tracking-wider text-clip-amber mb-1">B's voice</p>
              <p className="text-sm text-clip-text">{c.voice_gap.b_voice}</p>
            </div>
          </div>
          <ul className="space-y-1.5 mb-3">
            {c.voice_gap.differences.map((d, i) => (
              <li key={i} className="text-sm text-clip-text flex gap-2"><Minus className="w-3 h-3 text-clip-muted flex-shrink-0 mt-1" /> {d}</li>
            ))}
          </ul>
          <p className="text-xs text-clip-muted italic">{c.voice_gap.recommendation}</p>
        </div>

        {/* Predictive comments */}
        <div className="card-glass p-5">
          <h4 className="font-display font-semibold text-clip-text mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-clip-amber" /> Predicted Comments
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CommentList label="A" comments={c.predictive_comments.a} />
            <CommentList label="B" comments={c.predictive_comments.b} />
          </div>
        </div>

        {/* Steal Playbook */}
        <div className="card-glass p-5">
          <h4 className="font-display font-semibold text-clip-text mb-4 flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-clip-cyan" /> Steal Playbook
          </h4>
          <ol className="space-y-2">
            {c.steal_playbook.map((p, i) => (
              <li key={i} className="text-sm text-clip-text flex gap-3 group">
                <span className="font-mono text-xs text-clip-muted w-5 flex-shrink-0 pt-0.5">{i + 1}.</span>
                <span className="flex-1">{p}</span>
                <button
                  onClick={() => copy(p, i)}
                  className="text-clip-muted hover:text-clip-cyan transition-colors opacity-0 group-hover:opacity-100"
                  aria-label="Copy"
                >
                  {copiedIdx === i ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </li>
            ))}
          </ol>
        </div>

        {/* Reset CTA */}
        <div className="flex justify-center pt-4">
          <button
            onClick={() => { setResult(null); setUrlA(''); setUrlB(''); }}
            className="btn-secondary text-sm px-4 py-2"
          >
            Run another comparison
          </button>
        </div>
      </div>
    );
  }

  // ─── Input state (default) ───────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">
      <div className="card-glass p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-clip-cyan/6 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-5 h-5 text-clip-cyan" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-clip-text">Competitor Lab</h3>
            <p className="text-clip-muted text-xs">Head to head viral gap analysis · 10 credits</p>
          </div>
          {!isPro && (
            <span className="ml-auto text-[10px] font-bold uppercase text-clip-amber bg-clip-amber/10 border border-clip-amber/20 px-2 py-1 rounded">
              Pro
            </span>
          )}
        </div>

        <p className="text-clip-muted text-sm mb-6">
          Paste two YouTube URLs. We'll fetch both transcripts, run a Deep Analysis on each, then produce a viral gap + voice gap + predictive comments comparison. If either URL was analyzed in the last 24h, we reuse the cached result.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-clip-muted mb-1 block">Video A</label>
            <div className="relative">
              <PlatformIcon platform="youtube" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-clip-muted" />
              <input
                type="url"
                value={urlA}
                onChange={e => setUrlA(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="input-dark w-full pl-10"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-clip-muted mb-1 block">Video B</label>
            <div className="relative">
              <PlatformIcon platform="youtube" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-clip-muted" />
              <input
                type="url"
                value={urlB}
                onChange={e => setUrlB(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="input-dark w-full pl-10"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-red-600 text-xs">
            {error}
          </div>
        )}

        <button
          onClick={run}
          disabled={loading || !urlA || !urlB}
          className="btn-primary w-full mt-6 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
          {loading ? 'Comparing…' : 'Run Comparison (10 credits)'}
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

// ─── Helper sub-components ───────────────────────────────────────────────────

function VideoCard({ label, video, isWinner }: {
  label: string;
  video: { title: string; author: string; video_id: string; url: string; hook_score: number | null };
  isWinner: boolean;
}) {
  const thumb = `https://i.ytimg.com/vi/${video.video_id}/mqdefault.jpg`;
  return (
    <div className={`p-3 rounded-xl border transition-all ${isWinner ? 'bg-clip-cyan/3 border-clip-cyan/30' : 'bg-clip-surface border-white/[0.02]'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-bold w-5 h-5 rounded flex items-center justify-center ${isWinner ? 'bg-clip-cyan text-black' : 'bg-clip-surface text-clip-muted border border-white/[0.02]'}`}>
          {label}
        </span>
        {isWinner && <span className="text-[10px] font-bold text-clip-cyan uppercase tracking-wider">Winner</span>}
        {video.hook_score !== null && (
          <span className="ml-auto text-xs text-clip-muted font-mono">{video.hook_score.toFixed(1)}/10</span>
        )}
      </div>
      <div className="aspect-video rounded-md overflow-hidden bg-clip-dark mb-2">
        <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
      </div>
      <p className="text-sm text-clip-text truncate" title={video.title}>{video.title}</p>
      <p className="text-xs text-clip-muted truncate">{video.author}</p>
    </div>
  );
}

function CommentList({ label, comments }: {
  label: string;
  comments: Array<{ type: string; comment: string; likely_engagement: string }>;
}) {
  const typeColor: Record<string, string> = {
    praise: 'text-green-600 bg-green-500/10',
    criticism: 'text-red-600 bg-red-500/10',
    question: 'text-clip-cyan bg-clip-cyan/6',
    debate: 'text-clip-amber bg-clip-amber/10',
    spam: 'text-clip-muted bg-clip-surface',
  };
  return (
    <div>
      <p className="text-xs text-clip-muted mb-2">Video {label}</p>
      <ul className="space-y-2">
        {comments.map((c, i) => (
          <li key={i} className="p-2 rounded-lg bg-clip-surface">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${typeColor[c.type] || typeColor.spam}`}>
                {c.type}
              </span>
              <span className="text-[9px] text-clip-muted ml-auto">{c.likely_engagement}</span>
            </div>
            <p className="text-xs text-clip-text">{c.comment}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
