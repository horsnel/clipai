import { useState } from 'react';
import {
  Copy, Check, Ghost, AlertTriangle,
  Mic, Sparkles, FileText, Film,
} from 'lucide-react';
import { toast } from 'sonner';
import { analyseShadow } from '@/services/api';
import type { ShadowResponse, ShadowEditorResult } from '../types';
import { SkeletonList } from './Loading';
import { PlatformIcon } from './BrandIcons';

interface ShadowPanelProps {
  user: { plan: string } | null;
  onNavigate?: (page: 'pricing') => void;
}

/**
 * ShadowPanel — Phase 4 Shadow Editor (faceless creator script).
 *
 * One URL input → 4 credits → returns a faceless-creator voiceover script:
 *   - full_script (act1 hook / act2 setup / act3 payoff / cta)
 *   - b_roll_cues (6-10 visual descriptions to overlay)
 *   - tts_settings (voice / pace / pitch recommendations)
 *   - legal_disclaimer (fair use / transformative note)
 */
export function ShadowPanel({ user: _user, onNavigate: _onNavigate }: ShadowPanelProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ShadowResponse | null>(null);
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
      const data = await analyseShadow(url.trim());
      setResult(data);
      toast.success(`Done in ${Math.round((data.processing_ms || 0) / 1000)}s · ${data.credits_remaining} credits left`);
    } catch (e: any) {
      const msg = e?.message || 'Shadow script generation failed';
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
          Reading transcript + writing faceless-creator script.<br />
          <span className="text-xs">Takes 12–25 seconds if cached, longer if new.</span>
        </p>
      </div>
    );
  }

  if (error && !result) {
    return (
      <div className="card-glass p-8 text-center">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-clip-amber" />
        <p className="font-display font-medium text-clip-text mb-1">Couldn't generate shadow script</p>
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
            <Ghost className="w-5 h-5 text-clip-cyan" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-clip-text">Shadow Editor</h3>
            <p className="text-clip-muted text-xs">Turn any YouTube video into a faceless-creator script</p>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-clip-text block mb-2 flex items-center gap-2">
            <PlatformIcon platform="youtube" className="w-4 h-4 text-clip-cyan" />
            Source YouTube URL
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
            We'll write a transformative voiceover script with b-roll cues, TTS settings, and a fair-use disclaimer.
            Costs <span className="text-clip-amber font-medium">4 credits</span>.
          </p>
        </div>

        <button onClick={run} disabled={loading || !url.trim()}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
          <Sparkles className="w-4 h-4" /> Generate Faceless Script
        </button>
      </div>
    );
  }

  const r: ShadowEditorResult = result.shadow;
  const fullScript = r.full_script;
  const scriptText = `${fullScript.act1_hook}\n\n${fullScript.act2_setup}\n\n${fullScript.act3_payoff}\n\n${fullScript.cta}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card-glass p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-clip-cyan/6 flex items-center justify-center flex-shrink-0">
            <Ghost className="w-5 h-5 text-clip-cyan" />
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

      {/* Full Script */}
      <div className="card-glass p-5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-display font-semibold text-clip-text flex items-center gap-2">
            <FileText className="w-4 h-4 text-clip-cyan" /> Voiceover Script
          </h4>
          <button onClick={() => copy(scriptText, 'full')}
            className="text-clip-muted hover:text-clip-cyan text-xs flex items-center gap-1 transition-colors">
            {copiedKey === 'full' ? <><Check className="w-3 h-3 text-clip-cyan" /> Copied</> : <><Copy className="w-3 h-3" /> Copy all</>}
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-clip-amber font-bold mb-1.5">Act 1 · Hook</p>
            <p className="text-sm text-clip-text leading-relaxed">{fullScript.act1_hook}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-clip-cyan font-bold mb-1.5">Act 2 · Setup</p>
            <p className="text-sm text-clip-text leading-relaxed">{fullScript.act2_setup}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-clip-amber font-bold mb-1.5">Act 3 · Payoff</p>
            <p className="text-sm text-clip-text leading-relaxed">{fullScript.act3_payoff}</p>
          </div>
          <div className="pt-2 border-t border-white/[0.025]">
            <p className="text-[10px] uppercase tracking-wider text-clip-muted font-bold mb-1.5">Call to Action</p>
            <p className="text-sm text-clip-text/90 italic">{fullScript.cta}</p>
          </div>
        </div>
      </div>

      {/* B-Roll Cues */}
      <div className="card-glass p-5">
        <h4 className="font-display font-semibold text-clip-text mb-4 flex items-center gap-2">
          <Film className="w-4 h-4 text-clip-cyan" /> B-Roll Cues
        </h4>
        <ul className="space-y-2">
          {(r.b_roll_cues || []).map((c, i) => (
            <li key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-clip-surface border border-white/[0.02]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-clip-muted bg-clip-dark px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">
                {c.t}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-clip-text">{c.visual}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[10px] text-clip-muted">{c.duration_seconds}s</span>
                  {c.text_overlay && (
                    <span className="text-[10px] text-clip-cyan bg-clip-cyan/6 border border-clip-cyan/20 px-1.5 py-0.5 rounded">
                      "{c.text_overlay}"
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* TTS Settings */}
      <div className="card-glass p-5">
        <h4 className="font-display font-semibold text-clip-text mb-4 flex items-center gap-2">
          <Mic className="w-4 h-4 text-clip-cyan" /> TTS / Voiceover Settings
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-clip-surface border border-white/[0.02]">
            <p className="text-[10px] uppercase tracking-wider text-clip-muted mb-1">Voice</p>
            <p className="text-sm text-clip-text">{r.tts_settings.voice_recommendation}</p>
          </div>
          <div className="p-3 rounded-lg bg-clip-surface border border-white/[0.02]">
            <p className="text-[10px] uppercase tracking-wider text-clip-muted mb-1">Pace</p>
            <p className="text-sm text-clip-text font-mono">{r.tts_settings.pace_wpm} <span className="text-clip-muted text-xs">wpm</span></p>
          </div>
          <div className="p-3 rounded-lg bg-clip-surface border border-white/[0.02]">
            <p className="text-[10px] uppercase tracking-wider text-clip-muted mb-1">Pitch</p>
            <p className="text-sm text-clip-text capitalize">{r.tts_settings.pitch}</p>
          </div>
          <div className="p-3 rounded-lg bg-clip-surface border border-white/[0.02]">
            <p className="text-[10px] uppercase tracking-wider text-clip-muted mb-1">Pause</p>
            <p className="text-sm text-clip-text">{r.tts_settings.pause_strategy}</p>
          </div>
        </div>
      </div>

      {/* Legal Disclaimer */}
      <div className="card-glass p-5 border-clip-amber/20 bg-clip-amber/[0.02]">
        <h4 className="font-display font-semibold text-clip-amber mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Fair Use Disclaimer
        </h4>
        <p className="text-xs text-clip-text/80 leading-relaxed">{r.legal_disclaimer}</p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => { setResult(null); setUrl(''); }}
          className="text-clip-muted hover:text-clip-cyan text-xs flex items-center gap-1.5 transition-colors">
          Shadow another video
        </button>
        <span className="text-clip-muted text-xs">{result.credits_remaining} credits left</span>
      </div>
    </div>
  );
}
