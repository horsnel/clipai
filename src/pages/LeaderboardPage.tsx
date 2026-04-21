import type { Page } from '@/App';
import { 
  Trophy, Crown, Flame, 
  ChevronRight, Sparkles, Construction
} from 'lucide-react';

interface LeaderboardPageProps {
  user: { name: string; email: string; plan: 'free' | 'pro' | 'creator' } | null;
  onNavigate: (page: Page) => void;
}

export function LeaderboardPage({ user, onNavigate }: LeaderboardPageProps) {
  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-clip-amber to-orange-500 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-black" />
            </div>
          </div>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-clip-text mb-2">
            Leaderboard
          </h1>
          <p className="text-clip-muted">
            Top creators ranked by total hype score
          </p>
        </div>

        {/* Coming Soon Card */}
        <div className="card-glass p-12 text-center">
          <div className="w-20 h-20 rounded-2xl bg-clip-amber/10 flex items-center justify-center mx-auto mb-6">
            <Construction className="w-10 h-10 text-clip-amber" />
          </div>
          <h2 className="font-display font-bold text-2xl text-clip-text mb-3">
            Coming Soon
          </h2>
          <p className="text-clip-muted max-w-md mx-auto mb-6">
            The leaderboard is being built. Start creating clips now to secure your spot 
            at the top when it launches! Your hype score will be tracked based on the 
            highlights you create and share.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => onNavigate('upload')}
              className="btn-primary flex items-center justify-center gap-2 px-8 py-3"
            >
              <Sparkles className="w-5 h-5" />
              Start Creating Clips
            </button>
            {user?.plan === 'free' && (
              <button
                onClick={() => onNavigate('pricing')}
                className="btn-secondary flex items-center justify-center gap-2 px-8 py-3"
              >
                <Crown className="w-5 h-5" />
                Upgrade Plan
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Feature Preview */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Trophy, title: 'Global Rankings', desc: 'Compete with creators worldwide' },
            { icon: Flame, title: 'Weekly Challenges', desc: 'New challenges every week' },
            { icon: Crown, title: 'Exclusive Rewards', desc: 'Top ranks earn special perks' },
          ].map((feature) => (
            <div key={feature.title} className="card-glass p-5 text-center">
              <div className="w-10 h-10 rounded-xl bg-clip-amber/10 flex items-center justify-center mx-auto mb-3">
                <feature.icon className="w-5 h-5 text-clip-amber" />
              </div>
              <h3 className="font-display font-semibold text-clip-text text-sm mb-1">
                {feature.title}
              </h3>
              <p className="text-clip-muted text-xs">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
