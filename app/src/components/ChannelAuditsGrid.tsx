/**
 * ChannelAuditsGrid.tsx — Dashboard section showing the user's audited channels
 * as a grid of square cards. Clicking a card opens the ChannelAuditModal with
 * the full audit data.
 *
 * Empty state: a CTA card prompting the user to add a channel (navigates to
 * the audit page).
 *
 * Used on the DashboardPage, replacing the old "Trending Now" + "Recent Clips"
 * section.
 */
import { useState, useEffect, useCallback } from 'react';
import type { Page } from '../App';
import {
  Plus, AlertTriangle, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { getChannelAudits, deleteChannelAudit } from '@/services/api';
import { ChannelAuditCard } from './ChannelAuditCard';
import { ChannelAuditModal } from './ChannelAuditModal';
import { ChannelAuditFullView } from './ChannelAuditFullView';
import { SkeletonGrid } from './Loading';
import type { ChannelAudit } from '../types';

interface ChannelAuditsGridProps {
  onNavigate: (page: Page) => void;
  /** Optional refresh signal — when this number changes, we refetch. */
  refreshNonce?: number;
}

export function ChannelAuditsGrid({ onNavigate, refreshNonce }: ChannelAuditsGridProps) {
  const [audits, setAudits]   = useState<ChannelAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [selected, setSelected] = useState<ChannelAudit | null>(null);
  const [fullViewAudit, setFullViewAudit] = useState<ChannelAudit | null>(null);
  // Phase 5 — quota + count from the GET response (for the header chip)
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [dailyUsed, setDailyUsed] = useState<number | null>(null);
  const dailyQuotaLimit = 50;

  const fetchAudits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getChannelAudits();
      setAudits(data.audits || []);
      if (typeof data.count === 'number') setSavedCount(data.count);
      else setSavedCount(data.audits?.length ?? 0);
      if (data.dailyQuota && typeof data.dailyQuota.used === 'number') {
        setDailyUsed(data.dailyQuota.used);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load audits');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAudits();
  }, [fetchAudits, refreshNonce]);

  const handleDelete = async (url: string) => {
    try {
      await deleteChannelAudit(url);
      setAudits(prev => prev.filter(a => a.url !== url));
      toast.success('Audit removed');
    } catch (e: any) {
      toast.error(e?.message || 'Could not remove audit');
    }
  };

  return (
    <div className="mb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <h2 className="font-display font-semibold text-xl text-clip-text leading-tight">
              Your Channel Audits
            </h2>
            <p className="text-clip-muted text-xs mt-0.5">
              Free analytics snapshot of your linked channels
              {savedCount !== null && (
                <span className="ml-2 text-clip-muted/80">
                  · {savedCount}/8 saved
                  {dailyUsed !== null && (
                    <span className={`ml-1 ${dailyUsed >= dailyQuotaLimit * 0.8 ? 'text-clip-amber' : ''}`}>
                      · {dailyUsed}/{dailyQuotaLimit} audits today
                    </span>
                  )}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('audit')}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-clip-cyan/10 text-clip-cyan border border-clip-cyan/30 hover:bg-clip-cyan/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add channel
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <SkeletonGrid count={4} />
      ) : error ? (
        <div className="card-glass p-8 flex flex-col items-center justify-center gap-2 text-center">
          <AlertTriangle className="w-7 h-7 text-clip-amber/70" />
          <p className="text-clip-muted text-sm">{error}</p>
          <button
            onClick={fetchAudits}
            className="mt-2 text-xs text-clip-cyan hover:underline"
          >
            Try again
          </button>
        </div>
      ) : audits.length === 0 ? (
        // Empty state — prompt to add a channel
        <button
          onClick={() => onNavigate('audit')}
          className="card-glass p-8 w-full text-left hover:border-clip-cyan/30 transition-colors group"
        >
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-clip-cyan/15 to-purple-500/15 flex items-center justify-center flex-shrink-0">
              <Plus className="w-7 h-7 text-clip-cyan" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-semibold text-clip-text mb-1 group-hover:text-clip-cyan transition-colors">
                Audit your first channel — free
              </h3>
              <p className="text-clip-muted text-sm leading-relaxed">
                Paste a YouTube, TikTok, X, Instagram, or Reddit link and we'll pull a free
                analytics snapshot: subscribers or followers, total views, recent posts, engagement rate.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-clip-cyan text-xs flex-shrink-0">
              Get started <Plus className="w-3 h-3" />
            </div>
          </div>
        </button>
      ) : (
        // Grid of square cards
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {audits.map((audit) => (
            <ChannelAuditCard
              key={audit.url}
              audit={audit}
              onClick={() => setSelected(audit)}
            />
          ))}

          {/* "Add another" tile — only if user has < 8 audits */}
          {audits.length < 8 && (
            <button
              onClick={() => onNavigate('audit')}
              className="card-glass p-5 min-h-[180px] flex flex-col items-center justify-center gap-2 text-center hover:border-clip-cyan/30 hover:-translate-y-1 transition-all group"
            >
              <div className="w-12 h-12 rounded-full bg-clip-cyan/10 flex items-center justify-center group-hover:bg-clip-cyan/20 transition-colors">
                <Plus className="w-6 h-6 text-clip-cyan" />
              </div>
              <p className="text-sm font-medium text-clip-text group-hover:text-clip-cyan transition-colors">
                Add another
              </p>
              <p className="text-[10px] text-clip-muted">
                {(savedCount ?? audits.length)} / 8 audited
              </p>
            </button>
          )}
        </div>
      )}

      {/* Modal — quick preview */}
      {selected && (
        <ChannelAuditModal
          audit={selected}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
          onViewFull={() => {
            setFullViewAudit(selected);
            setSelected(null);
          }}
        />
      )}

      {/* Full-page view — extensive AI insights */}
      {fullViewAudit && (
        <ChannelAuditFullView
          audit={fullViewAudit}
          onExit={() => setFullViewAudit(null)}
        />
      )}
    </div>
  );
}

