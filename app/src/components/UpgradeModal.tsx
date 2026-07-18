import { useEffect } from 'react';
import {
  X, Zap, Crown, Sparkles, Check, ArrowRight, Coins, AlertCircle,
} from 'lucide-react';
import type { Page } from '../App';

// ─── Types ─────────────────────────────────────────────────────────────────
export type UpgradeReason = 'no_credits' | 'plan_required';

export interface UpgradeModalState {
  open: boolean;
  reason: UpgradeReason;
  requiredCredits?: number;
  currentCredits?: number;
  requiredPlan?: string;
  tool?: string; // human-readable label, e.g. "Trend Radar"
}

interface UpgradeModalProps {
  state: UpgradeModalState;
  onClose: () => void;
  onNavigate: (page: Page) => void;
}

// ─── Pricing tiers (kept in sync with PricingPage.tsx) ──────────────────────
const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 1000,
    credits: '200 credits',
    color: 'text-blue-600',
    icon: Sparkles,
    perks: ['200 credits / month', 'Unlimited ClipBot', 'Real time Trend Radar'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 2500,
    credits: '1,000 credits',
    color: 'text-clip-cyan',
    icon: Zap,
    popular: true,
    perks: ['1,000 credits / month', 'GrowthIntel competitor spy', 'Priority AI'],
  },
  {
    id: 'creator',
    name: 'Creator',
    price: 6000,
    credits: '3,000 credits',
    color: 'text-clip-amber',
    icon: Crown,
    perks: ['3,000 credits / month', 'Verified badge', 'Monthly strategy call'],
  },
];

// ─── Component ──────────────────────────────────────────────────────────────
export function UpgradeModal({ state, onClose, onNavigate }: UpgradeModalProps) {
  const { open, reason, requiredCredits, currentCredits, requiredPlan, tool } = state;

  // ESC + body scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const isNoCredits = reason === 'no_credits';

  const headline = isNoCredits
    ? `Out of credits${tool ? ` for ${tool}` : ''}`
    : `${requiredPlan ? requiredPlan[0].toUpperCase() + requiredPlan.slice(1) : 'Pro'} plan required`;

  const subhead = isNoCredits
    ? `You need ${requiredCredits ?? 1} credit${(requiredCredits ?? 1) > 1 ? 's' : ''} to use this tool. You have ${currentCredits ?? 0}. Top up by upgrading your plan — credits also roll over month to month.`
    : `This tool is only available on the ${requiredPlan ?? 'Pro'} plan. Upgrade to unlock it instantly — plus all the credits and perks of your new tier.`;

  const onBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const formatNaira = (n: number) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n);

  return (
    <div
      onClick={onBackdropClick}
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
    >
      <div
        className="bg-clip-dark border border-white/[0.02] rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade your plan"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-white/[0.025] flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isNoCredits ? 'bg-clip-amber/15 text-clip-amber' : 'bg-clip-cyan/15 text-clip-cyan'
              }`}>
                {isNoCredits ? <Coins className="w-4 h-4" /> : <Crown className="w-4 h-4" />}
              </div>
              <span className={`text-xs font-medium uppercase tracking-wider flex-shrink-0 ${
                isNoCredits ? 'text-clip-amber' : 'text-clip-cyan'
              }`}>
                {isNoCredits ? 'Credits needed' : 'Plan upgrade'}
              </span>
            </div>
            <h2 className="font-display font-bold text-xl sm:text-2xl text-clip-text break-words leading-tight">
              {headline}
            </h2>
            <p className="text-clip-muted text-sm mt-2 leading-relaxed">
              {subhead}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full border border-white/15 hover:border-red-500/60 text-clip-muted hover:text-red-400 flex items-center justify-center transition-colors flex-shrink-0"
            aria-label="Close"
            title="Close"
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>

        {/* Plan cards */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3">
          {PLANS.map((plan) => (
            <button
              key={plan.id}
              onClick={() => {
                onClose();
                onNavigate('pricing');
              }}
              className={`w-full p-4 sm:p-5 rounded-2xl border text-left transition-all flex items-center gap-4 group ${
                plan.popular
                  ? 'border-clip-cyan/50 bg-clip-cyan/3 hover:bg-clip-cyan/6'
                  : 'border-white/[0.02] bg-clip-surface/50 hover:bg-clip-surface hover:border-white/[0.08]'
              }`}
            >
              {/* Icon */}
              <div className={`w-12 h-12 rounded-xl bg-clip-surface flex items-center justify-center flex-shrink-0 ${plan.color}`}>
                <plan.icon className="w-6 h-6" />
              </div>

              {/* Plan info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-display font-bold text-lg text-clip-text">{plan.name}</h3>
                  {plan.popular && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-clip-cyan text-black font-bold tracking-wide uppercase">
                      Most popular
                    </span>
                  )}
                </div>
                <p className="text-clip-muted text-sm">{plan.credits}/mo</p>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {plan.perks.map((p, i) => (
                    <span key={i} className="text-xs text-clip-muted flex items-center gap-1">
                      <Check className="w-3 h-3 text-clip-cyan flex-shrink-0" />
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              {/* Price + arrow */}
              <div className="text-right flex-shrink-0">
                <p className="font-display font-bold text-lg sm:text-xl text-clip-text">
                  {formatNaira(plan.price)}
                </p>
                <p className="text-clip-muted text-xs">/mo</p>
                <ArrowRight className="w-4 h-4 text-clip-muted ml-auto mt-2 group-hover:text-clip-cyan group-hover:translate-x-1 transition-all" />
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-white/[0.025] flex-shrink-0">
          <div className="flex items-start gap-2 text-xs text-clip-muted">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <p>
              Credits roll over month to month while your subscription is active. Cancel anytime.
              All payments are processed securely via Paystack.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
