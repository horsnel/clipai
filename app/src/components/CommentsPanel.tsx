import { useState } from 'react';
import {
  Copy, Check, MessageSquare, AlertTriangle,
  ThumbsUp, ThumbsDown, HelpCircle, Flame, Ban, Pin,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { analyseComments } from '@/services/api';
import type { CommentsResponse, PredictedCommentsResult } from '../types';
import { SkeletonList } from './Loading';
import { PlatformIcon } from './BrandIcons';

interface CommentsPanelProps {
  user: { plan: string } | null;
  onNavigate?: (page: 'pricing') => void;
}

/**
 * CommentsPanel — Phase 4 Predictive Comments Lite.
 *
 * One URL input → 2 credits → returns predicted viewer comments:
 *   - praise / criticism / questions / debate / spam
 *   - pinned_suggestion (the one comment to pin to seed engagement)
 */
export function CommentsPanel({ user: _user, onNavigate: _onNavigate }: CommentsPanelProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CommentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const run = async () => {
    if (!url.trim()) {
      toast.error('Paste a YouTube URL first');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await analyseComments(url.trim());
      setResult(data);
      toast.success(`Done in ${Math.round((data.processing_ms || 0) / 1000)}s · ${data.credits_remaining} credits left`);
    } catch (e: any) {
      const msg = e?.message || 'Comment prediction failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Copied!');
    setTimeout(() => setCopiedKey(null), 1500);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <SkeletonList count={3} avatar />
        <p className="text-clip-muted text-sm mt-4 text-center max-w-md">
          Reading transcript + predicting viewer reactions.<br />
          <span className="text-xs">Takes 6–12 seconds if cached.</span>
        </p>
      </div>
    );
  }

  if (error && !result) {
    return (
      <div className="card-glass p-8 text-center">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-clip-amber" />
        <p className="font-display font-medium text-clip-text mb-1">Couldn't predict comments</p>
        <p className="text-clip-muted text-sm mb-4 max-w-md mx-auto">{error}</p>
        <button onClick={() => { setError(null); }} className="btn-primary text-sm px-4 py-2 inline-flex items-center gap-2">
          Try again
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="card-glass p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-clip-cyan/6 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-5 h-5 text-clip-cyan" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-clip-text">Predictive Comments</h3>
            <p className="text-clip-muted text-xs">See what viewers will say before you upload</p>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-clip-text block mb-2 flex items-center gap-2">
            <PlatformIcon platform="youtube" className="w-4 h-4 text-clip-cyan" />
            YouTube URL
          </label>
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !loading) run(); }}
            placeholder="https://youtube.com/watch?v=…"
            className="input-dark w-full text-sm"
          />
          <p className="text-xs text-clip-muted mt-2">
            We'll predict praise, criticism, questions, debate threads, spam, and the one comment you should pin.
            Costs <span className="text-clip-amber font-medium">2 credits</span>.
          </p>
        </div>

        <button onClick={run} disabled={loading || !url.trim()}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
          <Sparkles className="w-4 h-4" /> Predict Comments
        </button>
      </div>
    );
  }

  const r: PredictedCommentsResult = result.comments;

  const Section = ({
    icon, title, accent, items, render,
  }: {
    icon: React.ReactNode;
    title: string;
    accent: string;
    items: any[];
    render: (item: any, idx: number) => React.ReactNode;
  }) => (
    <div className="card-glass p-5">
      <h4 className={`font-display font-semibold mb-3 flex items-center gap-2 ${accent}`}>
        {icon} {title} <span className="text-clip-muted text-xs font-normal">({items.length})</span>
      </h4>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="p-2.5 rounded-lg bg-clip-surface border border-white/[0.02]">
            {render(it, i)}
          </li>
        ))}
      </ul>
    </div>
  );

  const tag = (label: string, color: string) => (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${color}`}>
      {label}
    </span>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card-glass p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-clip-cyan/6 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-5 h-5 text-clip-cyan" />
          </div>
          <div className="min-w-0">
            <p className="font-display font-semibold text-clip-text truncate">
              {result.video.title}
            </p>
            <p className="text-clip-muted text-xs">{result.video.author}</p>
          </div>
        </div>
        {result.cached_analysis && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-clip-cyan bg-clip-cyan/6 px-1.5 py-0.5 rounded border border-clip-cyan/20 flex-shrink-0">
            Cached
          </span>
        )}
      </div>

      {/* Pinned Suggestion (highlighted) */}
      {r.pinned_suggestion && (
        <div className="card-glass p-5 border-clip-amber/30 bg-clip-amber/[0.03]">
          <h4 className="font-display font-semibold text-clip-amber mb-3 flex items-center gap-2">
            <Pin className="w-4 h-4" /> Pinned Comment Suggestion
          </h4>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm text-clip-text italic leading-relaxed">"{r.pinned_suggestion.comment}"</p>
              <p className="text-xs text-clip-muted mt-2">{r.pinned_suggestion.why}</p>
            </div>
            <button onClick={() => copy(r.pinned_suggestion.comment, 'pinned')}
              className="text-clip-muted hover:text-clip-amber p-1 transition-colors flex-shrink-0">
              {copiedKey === 'pinned' ? <Check className="w-4 h-4 text-clip-amber" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Praise */}
      <Section
        icon={<ThumbsUp className="w-4 h-4" />}
        title="Praise"
        accent="text-green-400"
        items={r.praise || []}
        render={(it, i) => (
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-clip-text italic">"{it.comment}"</p>
              <p className="text-xs text-clip-muted mt-1">{it.why_likely}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {tag(it.intensity, 'text-green-400 bg-green-500/10 border-green-500/20')}
              <button onClick={() => copy(it.comment, `p${i}`)} className="text-clip-muted hover:text-green-400 p-1 transition-colors">
                {copiedKey === `p${i}` ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>
        )}
      />

      {/* Criticism */}
      <Section
        icon={<ThumbsDown className="w-4 h-4" />}
        title="Criticism"
        accent="text-red-400"
        items={r.criticism || []}
        render={(it, i) => (
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-clip-text italic">"{it.comment}"</p>
              <p className="text-xs text-clip-muted mt-1">{it.why_likely}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {tag(it.tone, 'text-red-400 bg-red-500/10 border-red-500/20')}
              <button onClick={() => copy(it.comment, `c${i}`)} className="text-clip-muted hover:text-red-400 p-1 transition-colors">
                {copiedKey === `c${i}` ? <Check className="w-3 h-3 text-red-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>
        )}
      />

      {/* Questions */}
      <Section
        icon={<HelpCircle className="w-4 h-4" />}
        title="Questions"
        accent="text-clip-cyan"
        items={r.questions || []}
        render={(it, i) => (
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-clip-text italic">"{it.comment}"</p>
              <p className="text-xs text-clip-muted mt-1">{it.why_likely}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {tag(it.intent, 'text-clip-cyan bg-clip-cyan/6 border-clip-cyan/20')}
              <button onClick={() => copy(it.comment, `q${i}`)} className="text-clip-muted hover:text-clip-cyan p-1 transition-colors">
                {copiedKey === `q${i}` ? <Check className="w-3 h-3 text-clip-cyan" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>
        )}
      />

      {/* Debate */}
      <Section
        icon={<Flame className="w-4 h-4" />}
        title="Debate Starters"
        accent="text-clip-amber"
        items={r.debate || []}
        render={(it, i) => (
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-clip-text italic">"{it.comment}"</p>
              <p className="text-xs text-clip-muted mt-1">{it.why_likely}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {tag(it.side, it.side === 'pro' ? 'text-green-400 bg-green-500/10 border-green-500/20' : 'text-red-400 bg-red-500/10 border-red-500/20')}
              <button onClick={() => copy(it.comment, `d${i}`)} className="text-clip-muted hover:text-clip-amber p-1 transition-colors">
                {copiedKey === `d${i}` ? <Check className="w-3 h-3 text-clip-amber" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>
        )}
      />

      {/* Spam */}
      <Section
        icon={<Ban className="w-4 h-4" />}
        title="Likely Spam"
        accent="text-clip-muted"
        items={r.spam || []}
        render={(it) => (
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-clip-muted italic">"{it.comment}"</p>
              <p className="text-xs text-clip-muted/70 mt-1">{it.why_likely}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {tag(it.pattern, 'text-clip-muted bg-clip-surface border-white/[0.02]')}
            </div>
          </div>
        )}
      />

      {/* Footer */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => { setResult(null); setUrl(''); }}
          className="text-clip-muted hover:text-clip-cyan text-xs flex items-center gap-1.5 transition-colors">
          Predict for another video
        </button>
        <span className="text-clip-muted text-xs">{result.credits_remaining} credits left</span>
      </div>
    </div>
  );
}
