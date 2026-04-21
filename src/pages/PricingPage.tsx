import { useState } from 'react';
import type { Page } from '@/App';
import { Button } from '@/components/ui/button';
import { 
  Check, X, Zap, Crown, Sparkles, Gift,
  ArrowRight, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { initPaystackPayment } from '@/api/clipai';
import { useAuth } from '@/contexts/AuthContext';

interface PricingPageProps {
  user: { name: string; email: string; plan: 'free' | 'pro' | 'creator' } | null;
  onNavigate: (page: Page) => void;
  isLoggedIn: boolean;
}

interface Plan {
  id: 'free' | 'pro' | 'creator';
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
    clips: '3 clips',
    icon: Zap,
    color: 'text-clip-muted',
    features: [
      { text: '3 clips per month', included: true },
      { text: 'Basic AI detection', included: true },
      { text: '720p export', included: true },
      { text: 'Beat sync', included: false },
      { text: 'Watermark removal', included: false },
      { text: 'Priority processing', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 2500,
    priceAnnual: 2000,
    clips: '30 clips',
    icon: Sparkles,
    color: 'text-clip-cyan',
    popular: true,
    features: [
      { text: '30 clips per month', included: true },
      { text: 'Advanced AI detection', included: true },
      { text: '1080p export', included: true },
      { text: 'Beat sync', included: true },
      { text: 'Watermark removal', included: true },
      { text: 'Priority processing', included: false },
    ],
  },
  {
    id: 'creator',
    name: 'Creator',
    price: 6000,
    priceAnnual: 4800,
    clips: 'Unlimited',
    icon: Crown,
    color: 'text-clip-amber',
    features: [
      { text: 'Unlimited clips', included: true },
      { text: 'Advanced AI detection', included: true },
      { text: '4K export', included: true },
      { text: 'Beat sync', included: true },
      { text: 'Watermark removal', included: true },
      { text: 'Priority processing', included: true },
    ],
  },
];

export function PricingPage({ user, onNavigate, isLoggedIn }: PricingPageProps) {
  const [isAnnual, setIsAnnual] = useState(false);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState('');

  const { user: authUser } = useAuth();

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
      const plan = plans.find(p => p.id === planId);
      const amount = plan ? (isAnnual ? plan.priceAnnual : plan.price) : 0;
      const email = authUser?.email || user?.email || '';

      if (!email) {
        toast.error('No email found. Please ensure you are logged in.');
        setIsProcessing(null);
        return;
      }

      const result = await initPaystackPayment(email, planId, amount);
      toast.success('Redirecting to secure payment...');
      window.location.href = result.authorization_url;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Payment initialization failed. Please try again.';
      toast.error(message);
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

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-clip-text mb-4">
            Simple, <span className="gradient-text">transparent</span> pricing
          </h1>
          <p className="text-clip-muted text-lg max-w-2xl mx-auto">
            Choose the plan that fits your content creation needs. Upgrade or downgrade anytime.
          </p>
        </div>

        {/* Annual Toggle */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <span className={`text-sm ${!isAnnual ? 'text-clip-text' : 'text-clip-muted'}`}>
            Monthly
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className={`w-14 h-7 rounded-full transition-colors relative ${
              isAnnual ? 'bg-clip-cyan' : 'bg-clip-surface'
            }`}
          >
            <div
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-black transition-transform ${
                isAnnual ? 'left-7' : 'left-0.5'
              }`}
            />
          </button>
          <span className={`text-sm ${isAnnual ? 'text-clip-text' : 'text-clip-muted'}`}>
            Annual
          </span>
          <span className="bg-clip-amber text-black text-xs font-bold px-2 py-1 rounded">
            SAVE 20%
          </span>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-16">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative card-glass p-6 lg:p-8 flex flex-col ${
                plan.popular 
                  ? 'border-clip-cyan/50 ring-1 ring-clip-cyan/30 scale-105 z-10' 
                  : 'hover:border-white/[0.12]'
              } transition-all duration-300`}
            >
              {/* Popular badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-clip-cyan text-black text-xs font-bold px-4 py-1.5 rounded-full">
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
                <div className="flex items-baseline justify-center gap-1">
                  <span className="font-display font-bold text-4xl text-clip-text">
                    {plan.price === 0 ? 'Free' : formatPrice(isAnnual ? plan.priceAnnual : plan.price)}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-clip-muted text-sm">/mo</span>
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
                Get 5 free clips for every friend who signs up!
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
              onClick={() => {
                if (referralCode) {
                  toast.success('Referral code applied! You got 5 free clips.');
                  setReferralCode('');
                } else {
                  toast.error('Please enter a referral code');
                }
              }}
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
                q: 'Can I upgrade or downgrade anytime?',
                a: 'Yes! You can change your plan at any time. Upgrades take effect immediately, and downgrades take effect at the end of your billing cycle.',
              },
              {
                q: 'What payment methods do you accept?',
                a: 'We accept all major credit/debit cards and bank transfers via Paystack. All payments are processed securely.',
              },
              {
                q: 'What happens if I exceed my clip limit?',
                a: 'You\'ll need to wait until the next month or upgrade your plan. We\'ll notify you when you\'re approaching your limit.',
              },
              {
                q: 'Is there a refund policy?',
                a: 'Yes, we offer a 7-day money-back guarantee if you\'re not satisfied with your subscription.',
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
