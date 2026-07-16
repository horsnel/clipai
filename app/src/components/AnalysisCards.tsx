/**
 * AnalysisCards.tsx — renders the unified analysis JSON as 14 collapsible cards.
 * Used inside Viral Forge's "Deep Analysis" tab. Minimal design — reuses the
 * existing card-glass + clip-* tokens, no new styling introduced.
 */
import { useState } from 'react';
import {
  Activity, BarChart3, Camera, CheckCircle2, Copy, Flame, Hash,
  Layers, Lightbulb, MessageSquare, Pencil, Pin,
  Sparkles, TrendingUp, Volume2, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import type { UnifiedAnalysis } from '../types';

interface Props {
  analysis: UnifiedAnalysis;
  videoTitle?: string;
  videoAuthor?: string;
  processingMs?: number;
  cached?: boolean;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function copyToClipboard(text: string, label = 'Copied') {
  navigator.clipboard?.writeText(text).then(
    () => toast.success(label),
    () => toast.error('Copy failed'),
  );
}

// ─── Reusable collapsible card ─────────────────────────────────────────────
function Card({
  icon: Icon, title, subtitle, count, defaultOpen = false, children, accent = 'cyan',
}: {
  icon: typeof Activity;
  title: string;
  subtitle?: string;
  count?: number | string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  accent?: 'cyan' | 'amber' | 'violet';
}) {
  const [open, setOpen] = useState(defaultOpen);
  const accentClass = accent === 'amber' ? 'text-clip-amber' : accent === 'violet' ? 'text-violet-500' : 'text-clip-cyan';
  return (
    <div className="card-glass overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-4 flex items-center gap-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        <Icon className={`w-5 h-5 flex-shrink-0 ${accentClass}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-clip-text">{title}</p>
          {subtitle && <p className="text-xs text-clip-muted mt-0.5 truncate">{subtitle}</p>}
        </div>
        {count !== undefined && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-md bg-clip-surface border border-white/[0.04] ${accentClass}`}>
            {count}
          </span>
        )}
        <span className={`text-clip-muted text-xs transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-white/[0.03]">{children}</div>}
    </div>
  );
}

// ─── Helper: copyable line item ─────────────────────────────────────────────
function CopyItem({ text, label }: { text: string; label?: string }) {
  return (
    <div className="flex items-start gap-2 group">
      <p className="flex-1 text-sm text-clip-text leading-relaxed">{text}</p>
      <button
        onClick={() => copyToClipboard(text, label ? `${label} copied` : 'Copied')}
        className="opacity-0 group-hover:opacity-100 p-1 text-clip-muted hover:text-clip-cyan transition-all flex-shrink-0"
        title="Copy"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export function AnalysisCards({ analysis, videoTitle, videoAuthor, processingMs, cached }: Props) {
  const a = analysis;

  return (
    <div className="space-y-3">
      {/* Header banner */}
      {videoTitle && (
        <div className="card-glass p-4 flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-clip-cyan flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-clip-text truncate">{videoTitle}</p>
            {videoAuthor && <p className="text-xs text-clip-muted">by {videoAuthor}</p>}
          </div>
          <div className="flex items-center gap-2 text-xs text-clip-muted">
            {cached && <span className="px-2 py-0.5 rounded-md bg-clip-cyan/10 text-clip-cyan">cached</span>}
            {processingMs && <span>{(processingMs / 1000).toFixed(1)}s</span>}
          </div>
        </div>
      )}

      {/* Hook Score — front and center */}
      <Card icon={Zap} title="Hook Score" subtitle="First-5-seconds retention probability" defaultOpen accent="amber"
        count={`${a.hook_score?.toFixed(1) ?? '—'}/10`}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-clip-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-clip-amber to-clip-cyan rounded-full"
                style={{ width: `${Math.min(100, (a.hook_score ?? 0) * 10)}%` }}
              />
            </div>
            <span className="text-sm font-bold text-clip-amber tabular-nums">{a.hook_score?.toFixed(1) ?? '—'}</span>
          </div>
          {a.hook_rewrites?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-clip-muted">Rewritten openers</p>
              {a.hook_rewrites.map((r, i) => (
                <div key={i} className="rounded-lg bg-clip-surface/50 p-3 border border-white/[0.03]">
                  <CopyItem text={r} label="Hook copied" />
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Title Variants */}
      <Card icon={TrendingUp} title="Title Variants" subtitle="10 viral title options" count={a.title_variants?.length ?? 0}>
        <div className="space-y-2">
          {a.title_variants?.map((t, i) => (
            <div key={i} className="rounded-lg bg-clip-surface/50 p-3 border border-white/[0.03] flex items-start gap-2">
              <span className="text-xs font-bold text-clip-cyan tabular-nums flex-shrink-0 mt-0.5">{i + 1}.</span>
              <CopyItem text={t} label="Title copied" />
            </div>
          ))}
        </div>
      </Card>

      {/* Hidden Gems */}
      {a.hidden_gems?.length > 0 && (
        <Card icon={Lightbulb} title="Hidden Gem Angles" subtitle="Secondary stories worth clipping" count={a.hidden_gems.length} accent="violet">
          <div className="space-y-3">
            {a.hidden_gems.map((g, i) => (
              <div key={i} className="rounded-lg bg-clip-surface/50 p-3 border border-white/[0.03]">
                <p className="text-sm font-semibold text-violet-500 mb-1">{g.angle}</p>
                <CopyItem text={g.title} label="Title copied" />
                <p className="text-xs text-clip-muted mt-2">{g.why_viral}</p>
                <p className="text-[10px] text-clip-muted mt-2 font-mono">
                  {formatTimestamp(g.clip_start)} → {formatTimestamp(g.clip_end)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Distribution Pack */}
      <Card icon={Layers} title="Distribution Pack" subtitle="X thread + LinkedIn + Newsletter">
        <div className="space-y-4">
          {a.distribution_pack?.x_thread?.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-clip-muted mb-2">X Thread ({a.distribution_pack.x_thread.length} tweets)</p>
              <div className="space-y-2">
                {a.distribution_pack.x_thread.map((t, i) => (
                  <div key={i} className="rounded-lg bg-clip-surface/50 p-3 border border-white/[0.03] flex items-start gap-2">
                    <span className="text-xs font-bold text-clip-cyan flex-shrink-0 mt-0.5">{i + 1}/</span>
                    <CopyItem text={t} label="Tweet copied" />
                  </div>
                ))}
              </div>
            </div>
          )}
          {a.distribution_pack?.linkedin && (
            <div>
              <p className="text-xs uppercase tracking-wider text-clip-muted mb-2">LinkedIn Article</p>
              <div className="rounded-lg bg-clip-surface/50 p-3 border border-white/[0.03]">
                <CopyItem text={a.distribution_pack.linkedin} label="Article copied" />
              </div>
            </div>
          )}
          {a.distribution_pack?.newsletter && (
            <div>
              <p className="text-xs uppercase tracking-wider text-clip-muted mb-2">Newsletter Draft</p>
              <div className="rounded-lg bg-clip-surface/50 p-3 border border-white/[0.03]">
                <CopyItem text={a.distribution_pack.newsletter} label="Newsletter copied" />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Caption Variants */}
      {a.caption_variants?.length > 0 && (
        <Card icon={MessageSquare} title="Caption Pack" subtitle="Style-matched captions per segment" count={a.caption_variants.length}>
          <div className="space-y-3">
            {a.caption_variants.map((seg, i) => (
              <div key={i} className="rounded-lg bg-clip-surface/50 p-3 border border-white/[0.03]">
                <p className="text-[10px] text-clip-muted font-mono mb-2">
                  {formatTimestamp(seg.clip_start)} → {formatTimestamp(seg.clip_end)}
                </p>
                <div className="space-y-1.5">
                  {seg.captions.map((c, j) => (
                    <CopyItem key={j} text={c} label="Caption copied" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Goldilocks Map */}
      {a.goldilocks_map && (a.goldilocks_map.trim?.length || a.goldilocks_map.peak?.length) ? (
        <Card icon={BarChart3} title="Goldilocks Zone Map" subtitle="Where to trim + peak punchy moments">
          <div className="space-y-3">
            {a.goldilocks_map.trim?.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wider text-clip-amber mb-2">Trim these</p>
                <div className="space-y-1.5">
                  {a.goldilocks_map.trim.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-xs text-clip-muted">
                        {formatTimestamp(t.start)} → {formatTimestamp(t.end)}
                      </span>
                      <span className="text-clip-text">{t.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {a.goldilocks_map.peak?.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wider text-clip-cyan mb-2">Peak moments</p>
                <div className="space-y-1.5">
                  {a.goldilocks_map.peak.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-xs text-clip-cyan">{formatTimestamp(p.t)}</span>
                      <span className="text-clip-text">{p.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {/* Pinned Comment Tree */}
      {a.pinned_comment_tree?.pinned && (
        <Card icon={Pin} title="Pinned Comment + Replies" subtitle="Bait replies + match your voice" accent="violet">
          <div className="space-y-3">
            <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-3">
              <p className="text-xs uppercase tracking-wider text-violet-500 mb-1">Pinned</p>
              <CopyItem text={a.pinned_comment_tree.pinned} label="Pinned comment copied" />
            </div>
            {a.pinned_comment_tree.replies?.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wider text-clip-muted mb-2">Drafted replies</p>
                <div className="space-y-1.5">
                  {a.pinned_comment_tree.replies.map((r, i) => (
                    <div key={i} className="rounded-lg bg-clip-surface/50 p-2.5 border border-white/[0.03]">
                      <CopyItem text={r} label="Reply copied" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Thumbnail Concepts */}
      {a.thumbnail_concepts?.length > 0 && (
        <Card icon={Camera} title="Thumbnail Overlay Concepts" subtitle="Text + position + color" count={a.thumbnail_concepts.length}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {a.thumbnail_concepts.map((t, i) => (
              <div key={i} className="rounded-lg bg-clip-surface/50 p-3 border border-white/[0.03]">
                <p className="text-sm font-bold text-clip-text mb-1"
                  style={{ color: t.color === 'yellow' ? '#FBBF24' : t.color === 'red' ? '#F87171' : t.color === 'cyan' ? '#00C2D6' : undefined }}>
                  {t.text}
                </p>
                <p className="text-[10px] text-clip-muted font-mono">{t.position} · {t.font_weight} · {t.color}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Community Polls */}
      {a.community_polls?.length > 0 && (
        <Card icon={CheckCircle2} title="Community Tab Polls" subtitle="Drive engagement from transcript" count={a.community_polls.length}>
          <div className="space-y-2">
            {a.community_polls.map((p, i) => (
              <div key={i} className="rounded-lg bg-clip-surface/50 p-3 border border-white/[0.03]">
                <CopyItem text={p.question} label="Poll copied" />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.options.map((o, j) => (
                    <span key={j} className="text-xs px-2 py-0.5 rounded-md bg-clip-surface border border-white/[0.03] text-clip-muted">
                      {o}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Sponsorship Spots */}
      {a.sponsorship_spots?.length > 0 && (
        <Card icon={Volume2} title="Sponsorship Sweet Spots" subtitle="Energy lulls for native mid-roll reads" count={a.sponsorship_spots.length} accent="amber">
          <div className="space-y-3">
            {a.sponsorship_spots.map((s, i) => (
              <div key={i} className="rounded-lg bg-clip-surface/50 p-3 border border-white/[0.03]">
                <p className="text-[10px] text-clip-muted font-mono mb-2">
                  {formatTimestamp(s.start)} → {formatTimestamp(s.end)}
                </p>
                <CopyItem text={s.transition_script} label="Transition copied" />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Unpopular Opinions */}
      {a.unpopular_opinions?.length > 0 && (
        <Card icon={Flame} title="Controversy Hooks" subtitle="Unpopular opinions = algorithm fuel" count={a.unpopular_opinions.length} accent="amber">
          <div className="space-y-3">
            {a.unpopular_opinions.map((o, i) => (
              <div key={i} className="rounded-lg bg-clip-surface/50 p-3 border border-white/[0.03]">
                <p className="text-xs text-clip-muted mb-1">Quoted:</p>
                <p className="text-sm italic text-clip-text mb-2">"{o.quote}"</p>
                <p className="text-xs text-clip-muted mb-1">Contradicts:</p>
                <p className="text-sm text-clip-text mb-2">{o.contradiction}</p>
                <p className="text-xs text-clip-amber">{o.controversy_hook}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Sentiment Arc */}
      {a.sentiment_arc?.length > 0 && (
        <Card icon={Activity} title="Sentiment Arc" subtitle="Emotional curve over time" count={`${a.sentiment_arc.length} pts`}>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {a.sentiment_arc.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-clip-muted w-12 flex-shrink-0">{formatTimestamp(p.t)}</span>
                <span className="text-clip-text w-24 flex-shrink-0 capitalize">{p.emotion}</span>
                <div className="flex-1 h-1 bg-clip-surface rounded-full overflow-hidden">
                  <div className="h-full bg-clip-cyan rounded-full" style={{ width: `${(p.intensity ?? 0) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Shadow Editor Script */}
      {a.shadow_editor_script?.act1 && (
        <Card icon={Pencil} title="Shadow Editor Script" subtitle="3-act faceless commentary (TTS-ready)" accent="violet">
          <div className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-clip-cyan mb-1">Act 1 — Hook</p>
              <CopyItem text={a.shadow_editor_script.act1} label="Act 1 copied" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-clip-amber mb-1">Act 2 — Tension</p>
              <CopyItem text={a.shadow_editor_script.act2} label="Act 2 copied" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-violet-500 mb-1">Act 3 — Payoff</p>
              <CopyItem text={a.shadow_editor_script.act3} label="Act 3 copied" />
            </div>
          </div>
        </Card>
      )}

      {/* Pacing Analysis */}
      {a.pacing_analysis && (
        <Card icon={Activity} title="Pacing Analysis" subtitle="Words/min, silence, edit recs">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-clip-surface/50 p-3 border border-white/[0.03] text-center">
                <p className="text-2xl font-bold text-clip-cyan tabular-nums">{a.pacing_analysis.wpm ?? '—'}</p>
                <p className="text-xs text-clip-muted">words/min</p>
              </div>
              <div className="rounded-lg bg-clip-surface/50 p-3 border border-white/[0.03] text-center">
                <p className="text-2xl font-bold text-clip-amber tabular-nums">{a.pacing_analysis.silence_count ?? '—'}</p>
                <p className="text-xs text-clip-muted">silence gaps</p>
              </div>
            </div>
            {a.pacing_analysis.cut_recommendations?.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wider text-clip-muted mb-2">Edit recommendations</p>
                <ul className="space-y-1.5 text-sm text-clip-text list-disc list-inside">
                  {a.pacing_analysis.cut_recommendations.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Style Profile */}
      {a.style_profile && (
        <Card icon={Hash} title="Style Profile" subtitle="Voice fingerprint cloned from transcript" accent="violet">
          <div className="space-y-3">
            {a.style_profile.slang?.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wider text-clip-muted mb-2">Signature slang</p>
                <div className="flex flex-wrap gap-1.5">
                  {a.style_profile.slang.map((s, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-500">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-clip-surface/50 p-2 border border-white/[0.03]">
                <p className="text-[10px] text-clip-muted uppercase">Emoji</p>
                <p className="text-sm text-clip-text capitalize">{a.style_profile.emoji_freq}</p>
              </div>
              <div className="rounded-lg bg-clip-surface/50 p-2 border border-white/[0.03]">
                <p className="text-[10px] text-clip-muted uppercase">Caps</p>
                <p className="text-sm text-clip-text capitalize">{a.style_profile.caps_pref}</p>
              </div>
              <div className="rounded-lg bg-clip-surface/50 p-2 border border-white/[0.03]">
                <p className="text-[10px] text-clip-muted uppercase">Punct</p>
                <p className="text-sm text-clip-text capitalize">{a.style_profile.punctuation}</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Strategic Notes */}
      {a.viral_angles?.strategic_notes && (
        <Card icon={Sparkles} title="Strategic Notes" subtitle="Why this will (or won't) go viral">
          <p className="text-sm text-clip-text leading-relaxed">{a.viral_angles.strategic_notes}</p>
          {a.viral_angles.topics?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs uppercase tracking-wider text-clip-muted mb-2">Detected topics</p>
              <div className="flex flex-wrap gap-1.5">
                {a.viral_angles.topics.map((t, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-clip-surface border border-white/[0.03] text-clip-muted">
                    {t.topic} <span className="text-clip-cyan">·{(t.heat * 100).toFixed(0)}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
