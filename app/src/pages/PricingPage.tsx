import { useState } from 'react';
import type { Page } from '../App';
import { Button } from '@/components/ui/button';
import { 
  Check, X, Zap, Crown, Sparkles, Gift,
  ArrowRight, Loader2, Flame, TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';
import { initPayment, applyReferralCode } from '@/services/api';

interface PricingPageProps {
  user: { name: string; email: string; plan: 'free' | 'starter' | 'pro' | 'creator'; referralCode?: string } | null;
  onNavigate: (page: Page, clips?: unknown[]) => void;
  isLoggedIn: boolean;
}

interface Plan {
  id: 'free' | 'starter' | 'pro' | 'creator';
  name: string;
  price: number;
  priceAnnual: number;
  clips: string;
  features: { text: string; included: boolean }[];
  popular?: boolean;
  icon: React.ElementType;
  color: string;
}

const plans: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    priceAnnual: 0,
    clips: '50 credits',
    icon: Zap,
    color: 'text-clip-muted',
    features: [
      { text: '50 credits / month (= 10 Deep Analyses)', included: true },
      { text: 'Viral Forge: 14 outputs per YouTube URL', included: true },
      { text: 'Topic Steal dashboard (read-only)', included: true },
      { text: '10 ClipBot messages / day', included: true },
      { text: 'Trend Radar (24h delayed)', included: true },
      { text: 'CreatorRank + daily streak credits', included: true },
      { text: 'Competitor Lab + Playlist Architect', included: false },
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 1000,
    priceAnnual: 800,
    clips: '200 credits',
    icon: Sparkles,
    color: 'text-blue-600',
    features: [
      { text: '200 credits / month (= 40 Deep Analyses)', included: true },
      { text: 'Viral Forge: 14 outputs per URL', included: true },
      { text: 'Topic Steal dashboard (live)', included: true },
      { text: 'Unlimited ClipBot coach', included: true },
      { text: 'Real-time Trend Radar', included: true },
      { text: 'Caption Battle voting', included: true },
      { text: 'Competitor Lab + Playlist Architect', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 2500,
    priceAnnual: 2000,
    clips: '1,000 credits',
    icon: Sparkles,
    color: 'text-clip-cyan',
    popular: true,
    features: [
      { text: '1,000 credits / month (= 200 Deep Analyses)', included: true },
      { text: 'Competitor Lab — head-to-head video comparison', included: true },
      { text: 'Playlist Architect — sequence + distribute', included: true },
      { text: 'Topic Steal dashboard (live + 30-day history)', included: true },
      { text: 'GrowthIntel competitor spy + priority AI', included: true },
      { text: 'Caption Battle × 3 vote weight', included: true },
      { text: 'Early Access: Video Editor (Dec 2026)', included: true },
    ],
  },
  {
    id: 'creator',
    name: 'Creator',
    price: 6000,
    priceAnnual: 4800,
    clips: '3,000 credits',
    icon: Crown,
    color: 'text-clip-amber',
    features: [
      { text: '3,000 credits / month (= 600 Deep Analyses)', included: true },
      { text: 'Competitor Lab + Playlist Architect (unlimited)', included: true },
      { text: 'Topic Steal: full 90-day history + alerts', included: true },
      { text: 'GrowthIntel + monthly 1:1 strategy call', included: true },
      { text: 'Exclusive Creator-tier trends', included: true },
      { text: 'Caption Battle × 5 vote weight + verified badge', included: true },
      { text: 'Early Access: Video Editor (Dec 2026)', included: true },
    ],
  },
];

export function PricingPage({ user, onNavigate, isLoggedIn }: PricingPageProps) {
  const [isAnnual, setIsAnnual] = useState(false);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState('');
  const [appliedReferral, setAppliedReferral] = useState<string | null>(null);

  const handleApplyReferral = async () => {
    if (!referralCode) {
      toast.error('Please enter a referral code');
      return;
    }
    try {
      const result = await applyReferralCode(referralCode);
      if (result.valid) {
        toast.success(`Referral code valid! ${result.discountPercent}% off your first payment.`);
        setAppliedReferral(referralCode.toUpperCase());
      } else {
        toast.error(result.error || 'Invalid referral code');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not validate code');
    }
  };

  const handleSubscribe = async (planId: string) => {
    if (!isLoggedIn) {
      toast.info('Please sign in to subscribe');
      onNavigate('auth');
      return;
    }
    if (planId === 'free') {
      toast.success('You are already on the Free plan!');
      return;
    }
    setIsProcessing(planId);
    try {
      const data = await initPayment(planId, isAnnual ? 'annual' : 'monthly', appliedReferral || undefined);
      toast.success('Redirecting to secure payment…');
      // Redirect to Paystack
      window.location.href = data.authorization_url;
    } catch (err: any) {
      toast.error(err?.message || 'Could not start payment');
    } finally {
      setIsProcessing(null);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(price);
  };

  // Phase 1 highlight cards (defined here so JSX parser handles them cleanly)
  const HIGHLIGHTS = [
    { Icon: Flame,      label: 'Viral Forge',        sub: '14 outputs / URL', color: 'text-clip-amber', bg: 'bg-clip-amber/10' },
    { Icon: TrendingUp, label: 'Topic Steal',        sub: 'Network trends',   color: 'text-green-600',  bg: 'bg-green-500/10' },
    { Icon: Sparkles,   label: 'Competitor Lab',     sub: 'Head-to-head',     color: 'text-clip-cyan',  bg: 'bg-clip-cyan/10' },
    { Icon: Crown,      label: 'Playlist Architect', sub: 'Sequence + ship',  color: 'text-purple-600', bg: 'bg-purple-500/10' },
  ];

  return (
    <div className="min-h-screen pt-28 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-clip-text mb-4">
            Paste a URL. Get <span className="gradient-text">14 viral strategies</span>.
          </h1>
          <p className="text-clip-muted text-lg max-w-2xl mx-auto">
            No uploads. No rendering. No storage. ClipAI streams any YouTube video to Gemini and returns
            titles, hooks, captions, distribution packs, thumbnail concepts, and more — in seconds.
          </p>
        </div>

        {/* Phase 1 highlight strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12">
          {HIGHLIGHTS.map(h => (
            <div key={h.label} className="card-glass p-3 flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg ${h.bg} flex items-center justify-center flex-shrink-0`}>
                <h.Icon className={`w-4 h-4 ${h.color}`} />
              </div>
              <div className="min-w-0">
                <p className="font-display font-medium text-clip-text text-xs truncate">{h.label}</p>
                <p className="text-clip-muted text-[10px] truncate">{h.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Annual Toggle */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mb-12">
          <span className={`text-sm whitespace-nowrap ${!isAnnual ? 'text-clip-text' : 'text-clip-muted'}`}>
            Monthly
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className={`w-14 h-7 rounded-full transition-colors relative flex-shrink-0 ${
              isAnnual ? 'bg-clip-cyan' : 'bg-clip-surface'
            }`}
            aria-label="Toggle annual billing"
          >
            <div
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-black transition-transform ${
                isAnnual ? 'left-7' : 'left-0.5'
              }`}
            />
          </button>
          <span className={`text-sm whitespace-nowrap ${isAnnual ? 'text-clip-text' : 'text-clip-muted'}`}>
            Annual
          </span>
          <span className="bg-clip-amber text-black text-xs font-bold px-2 py-1 rounded whitespace-nowrap">
            SAVE 20%
          </span>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-6 mb-16">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative card-glass p-6 lg:p-8 flex flex-col ${
                plan.popular 
                  ? 'border-clip-cyan/50 ring-1 ring-clip-cyan/30 md:scale-105 z-10 pt-8 sm:pt-6 lg:pt-8' 
                  : 'hover:border-white/[0.07]'
              } transition-all duration-300`}
            >
              {/* Popular badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
                  <span className="bg-clip-cyan text-black text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap shadow-glow-cyan">
                    MOST POPULAR
                  </span>
                </div>
              )}

              {/* Plan header */}
              <div className="text-center mb-6">
                <div className={`w-14 h-14 rounded-2xl bg-clip-surface flex items-center justify-center mx-auto mb-4 ${plan.color}`}>
                  <plan.icon className="w-7 h-7" />
                </div>
                <h3 className="font-display font-bold text-xl text-clip-text mb-1">
                  {plan.name}
                </h3>
                <p className="text-clip-muted text-sm">{plan.clips}/month</p>
              </div>

              {/* Price */}
              <div className="text-center mb-6">
                <div className="flex items-baseline justify-center gap-1 flex-wrap">
                  <span className="font-display font-bold text-3xl sm:text-4xl text-clip-text break-words">
                    {plan.price === 0 ? 'Free' : formatPrice(isAnnual ? plan.priceAnnual : plan.price)}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-clip-muted text-sm whitespace-nowrap">/mo</span>
                  )}
                </div>
                {isAnnual && plan.price > 0 && (
                  <p className="text-clip-muted text-xs mt-1">
                    Billed annually ({formatPrice(plan.priceAnnual * 12)}/year)
                  </p>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3">
                    {feature.included ? (
                      <div className="w-5 h-5 rounded-full bg-clip-cyan/20 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-clip-cyan" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-clip-surface flex items-center justify-center flex-shrink-0">
                        <X className="w-3 h-3 text-clip-muted" />
                      </div>
                    )}
                    <span className={feature.included ? 'text-clip-text text-sm' : 'text-clip-muted text-sm'}>
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <Button
                onClick={() => handleSubscribe(plan.id)}
                disabled={isProcessing === plan.id || user?.plan === plan.id}
                className={`w-full py-4 flex items-center justify-center gap-2 ${
                  plan.popular
                    ? 'btn-primary'
                    : 'btn-secondary'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isProcessing === plan.id ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : user?.plan === plan.id ? (
                  <>
                    <Check className="w-5 h-5" />
                    Current Plan
                  </>
                ) : plan.price === 0 ? (
                  'Get Started'
                ) : (
                  <>
                    Subscribe
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>

        {/* Referral Section */}
        <div className="card-glass p-8 max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-clip-amber/10 flex items-center justify-center">
              <Gift className="w-5 h-5 text-clip-amber" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-clip-text">
                Referral Program
              </h3>
              <p className="text-clip-muted text-sm">
                Invite a friend — they get 50 credits, you get 50 credits + 200 XP when they upgrade.
              </p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              placeholder="Enter referral code"
              className="input-dark flex-1"
            />
            <Button
              onClick={handleApplyReferral}
              className="btn-secondary"
            >
              Apply Code
            </Button>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-16 max-w-3xl mx-auto">
          <h2 className="font-display font-bold text-2xl text-clip-text text-center mb-8">
            Frequently Asked Questions
          </h2>
          
          <div className="space-y-4">
            {[
              {
                q: 'What can I do with my credits?',
                a: 'Spend them on ViralForge (5 cr / generation), ClipBot coaching sessions, and the upcoming video editor. You never lose credits — they roll over month to month.',
              },
              {
                q: 'Is the AI video editor included?',
                a: 'The video editor launches in December 2026. Pro and Creator subscribers get Early Access the moment it ships. Until then, you can use ViralForge, ClipBot, TrendRadar, and Caption Battle.',
              },
              {
                q: 'What payment methods do you accept?',
                a: 'We accept all major debit cards and bank transfers via Paystack (Naira). All payments are processed securely.',
              },
              {
                q: 'Can I cancel anytime?',
                a: 'Yes. Cancel from Settings → Subscription. Your plan stays active until the end of the billing cycle, then you drop back to Free.',
              },
              {
                q: 'Do credits roll over?',
                a: 'Yes — unused credits carry over as long as your subscription is active. Free tier credits refresh monthly.',
              },
            ].map((faq, i) => (
              <div key={i} className="card-glass p-5">
                <h4 className="font-display font-medium text-clip-text mb-2">
                  {faq.q}
                </h4>
                <p className="text-clip-muted text-sm">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
