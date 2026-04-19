import { useState, useEffect } from 'react';
import type { Page } from '@/App';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Zap, Upload, Link2, Settings, Crown, 
  TrendingUp, Clock, Play, ExternalLink, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { getUserClips } from '@/api/clipai';
import { useAuth } from '@/contexts/AuthContext';

interface DashboardPageProps {
  user: { name: string; email: string; plan: 'free' | 'pro' | 'creator' } | null;
  onNavigate: (page: Page) => void;
  onLogout?: () => void;
}

interface Clip {
  id: string;
  thumbnail: string;
  title: string;
  game: string;
  hypeScore: number;
  duration: string;
  createdAt: string;
  status: 'ready' | 'processing';
}

const mockClips: Clip[] = [
  {
    id: '1',
    thumbnail: '/gameplay-thumb-1.jpg',
    title: 'Epic Multi-Kill',
    game: 'Call of Duty',
    hypeScore: 96,
    duration: '0:32',
    createdAt: '2 hours ago',
    status: 'ready',
  },
  {
    id: '2',
    thumbnail: '/gameplay-thumb-2.jpg',
    title: 'Clutch Victory',
    game: 'Bloodstrike',
    hypeScore: 88,
    duration: '0:45',
    createdAt: '5 hours ago',
    status: 'ready',
  },
  {
    id: '3',
    thumbnail: '/gameplay-thumb-3.jpg',
    title: 'Team Fight Domination',
    game: 'Mobile Legends',
    hypeScore: 92,
    duration: '0:28',
    createdAt: '1 day ago',
    status: 'ready',
  },
];

export function DashboardPage({ user, onNavigate, onLogout: _onLogout }: DashboardPageProps) {
  const [clips, setClips] = useState<Clip[]>(mockClips);

  const { user: authUser } = useAuth();

  // Try to fetch real clips from API, fall back to mock data
  useEffect(() => {
    if (!authUser) return;

    getUserClips(authUser.id)
      .then(response => {
        if (response.clips?.length) {
          const mapped: Clip[] = response.clips.map(clip => ({
            id: clip.id,
            thumbnail: clip.thumbnail || '/gameplay-thumb-1.jpg',
            title: clip.title,
            game: clip.game,
            hypeScore: clip.hype_score,
            duration: clip.duration,
            createdAt: clip.created_at || 'Recently',
            status: clip.status,
          }));
          setClips(mapped);
        }
      })
      .catch(() => {
        // Keep mock data from useState initializer
      });
  }, [authUser]);
  
  const planLimits = {
    free: { clips: 3, label: 'Free' },
    pro: { clips: 30, label: 'Pro' },
    creator: { clips: Infinity, label: 'Creator' },
  };

  const currentPlan = planLimits[user?.plan || 'free'];
  const clipsUsed = clips.length;
  const clipsRemaining = currentPlan.clips === Infinity ? 'Unlimited' : currentPlan.clips - clipsUsed;
  const usagePercent = currentPlan.clips === Infinity ? 0 : (clipsUsed / currentPlan.clips) * 100;

  const getHypeBadge = (score: number) => {
    if (score >= 90) return <span className="hype-badge-gold">{score} HYPE</span>;
    if (score >= 70) return <span className="hype-badge-blue">{score} HYPE</span>;
    return <span className="hype-badge-gray">{score} HYPE</span>;
  };

  const handleUpload = () => {
    onNavigate('upload');
  };

  const handleClipClick = (_clipId: string) => {
    onNavigate('results');
  };

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12">
      <div className="max-w-7xl mx-auto">
        {/* Welcome Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-10">
          <div>
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-clip-text mb-2">
              Welcome back, <span className="gradient-text">{user?.name}</span>
            </h1>
            <p className="text-clip-muted">
              Ready to create your next viral highlight?
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              onClick={handleUpload}
              className="btn-primary flex items-center gap-2"
            >
              <Upload className="w-5 h-5" />
              Upload New
            </Button>
            <Button
              onClick={() => onNavigate('upload')}
              variant="outline"
              className="btn-secondary flex items-center gap-2"
            >
              <Link2 className="w-5 h-5" />
              Paste Link
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {/* Usage Meter */}
          <div className="card-glass p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-clip-cyan/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-clip-cyan" />
                </div>
                <div>
                  <p className="text-clip-muted text-sm">Clips This Month</p>
                  <p className="font-display font-semibold text-clip-text">
                    {clipsUsed} / {currentPlan.clips === Infinity ? '∞' : currentPlan.clips}
                  </p>
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded font-medium ${
                user?.plan === 'creator' 
                  ? 'bg-clip-amber text-black' 
                  : user?.plan === 'pro'
                  ? 'bg-clip-cyan text-black'
                  : 'bg-clip-surface text-clip-muted border border-white/[0.08]'
              }`}>
                {currentPlan.label.toUpperCase()}
              </span>
            </div>
            <Progress 
              value={usagePercent} 
              className="h-2 bg-clip-surface"
            />
            <p className="text-clip-muted text-xs mt-2">
              {typeof clipsRemaining === 'number' && clipsRemaining <= 3 
                ? `${clipsRemaining} clips remaining. Upgrade for more!`
                : currentPlan.clips === Infinity 
                ? 'Unlimited clips with your Creator plan!'
                : `${clipsRemaining} clips remaining this month`
              }
            </p>
          </div>

          {/* Total Views */}
          <div className="card-glass p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-clip-muted text-sm">Total Views</p>
                <p className="font-display font-semibold text-2xl text-clip-text">
                  24.5K
                </p>
              </div>
            </div>
            <p className="text-green-400 text-xs flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +12% from last week
            </p>
          </div>

          {/* Plan Badge */}
          <div className="card-glass p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-clip-amber/10 flex items-center justify-center">
                <Crown className="w-5 h-5 text-clip-amber" />
              </div>
              <div>
                <p className="text-clip-muted text-sm">Current Plan</p>
                <p className="font-display font-semibold text-xl text-clip-text capitalize">
                  {user?.plan}
                </p>
              </div>
            </div>
            {user?.plan === 'free' && (
              <button
                onClick={() => onNavigate('pricing')}
                className="text-clip-cyan text-xs hover:underline flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                Upgrade to Pro
              </button>
            )}
          </div>
        </div>

        {/* Recent Clips */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display font-semibold text-xl text-clip-text">
              Recent Clips
            </h2>
            <button
              onClick={() => onNavigate('results')}
              className="text-clip-cyan text-sm hover:underline flex items-center gap-1"
            >
              View All
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {clips.map((clip) => (
              <div
                key={clip.id}
                onClick={() => handleClipClick(clip.id)}
                className="card-glass overflow-hidden cursor-pointer group hover:-translate-y-1 hover:border-white/[0.12] transition-all duration-300"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video overflow-hidden">
                  <img
                    src={clip.thumbnail}
                    alt={clip.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-clip-dark/80 via-transparent to-transparent" />
                  
                  {/* Play button overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-14 h-14 rounded-full bg-clip-cyan/90 flex items-center justify-center">
                      <Play className="w-6 h-6 text-black ml-1" />
                    </div>
                  </div>

                  {/* Duration badge */}
                  <div className="absolute bottom-3 right-3 bg-black/80 px-2 py-1 rounded text-xs font-medium">
                    {clip.duration}
                  </div>

                  {/* Hype score */}
                  <div className="absolute top-3 left-3">
                    {getHypeBadge(clip.hypeScore)}
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-display font-medium text-clip-text mb-1 truncate">
                    {clip.title}
                  </h3>
                  <div className="flex items-center justify-between">
                    <span className="text-clip-muted text-sm">{clip.game}</span>
                    <span className="text-clip-muted text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {clip.createdAt}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Empty state if no clips */}
          {clips.length === 0 && (
            <div className="card-glass p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-clip-cyan/10 flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-clip-cyan" />
              </div>
              <h3 className="font-display font-semibold text-xl text-clip-text mb-2">
                No clips yet
              </h3>
              <p className="text-clip-muted mb-6">
                Upload your first gameplay and let AI create viral highlights!
              </p>
              <Button onClick={handleUpload} className="btn-primary">
                <Upload className="w-5 h-5 mr-2" />
                Upload Video
              </Button>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Upload, label: 'Upload Video', action: handleUpload },
            { icon: Link2, label: 'YouTube Import', action: () => toast.info('Coming soon!') },
            { icon: Settings, label: 'Settings', action: () => toast.info('Settings coming soon!') },
            { icon: Crown, label: 'Upgrade Plan', action: () => onNavigate('pricing') },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className="card-glass p-4 flex items-center gap-3 hover:-translate-y-0.5 hover:border-white/[0.12] transition-all duration-200 text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-clip-surface flex items-center justify-center">
                <item.icon className="w-5 h-5 text-clip-muted" />
              </div>
              <span className="font-medium text-clip-text text-sm">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
