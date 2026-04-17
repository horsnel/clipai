import { useState } from 'react';
import type { Page } from '@/App';
import { Button } from '@/components/ui/button';
import { 
  ChevronLeft, User, Crown, Gift, Bell, 
  Copy, Check, Sparkles, Zap, Crown as CrownIcon
} from 'lucide-react';
import { toast } from 'sonner';

interface SettingsPageProps {
  user: { name: string; email: string; plan: 'free' | 'pro' | 'creator' } | null;
  onNavigate: (page: Page) => void;
}

type Tab = 'profile' | 'plan' | 'referrals' | 'notifications';

export function SettingsPage({ user, onNavigate }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [notifications, setNotifications] = useState({
    email: true,
    marketing: false,
    newFeatures: true,
    clipReady: true,
  });

  const referralCode = 'CLIP' + (user?.name?.toUpperCase().slice(0, 4) || 'GAMER');

  const handleCopyReferral = () => {
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    toast.success('Referral code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveProfile = () => {
    toast.success('Profile updated successfully!');
  };

  const handleSavePassword = () => {
    if (!currentPassword || !newPassword) {
      toast.error('Please fill in all password fields');
      return;
    }
    toast.success('Password updated successfully!');
    setCurrentPassword('');
    setNewPassword('');
  };

  const tabs = [
    { id: 'profile' as Tab, label: 'Profile', icon: User },
    { id: 'plan' as Tab, label: 'Plan', icon: Crown },
    { id: 'referrals' as Tab, label: 'Referrals', icon: Gift },
    { id: 'notifications' as Tab, label: 'Notifications', icon: Bell },
  ];

  const planFeatures = {
    free: ['3 clips/month', 'Basic detection', '720p export'],
    pro: ['30 clips/month', 'Advanced AI', '1080p export', 'Beat sync', 'No watermark'],
    creator: ['Unlimited clips', 'Advanced AI', '4K export', 'Beat sync', 'No watermark', 'Priority processing'],
  };

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => onNavigate('dashboard')}
            className="p-2 text-clip-muted hover:text-clip-text hover:bg-white/[0.05] rounded-lg transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-display font-bold text-2xl sm:text-3xl text-clip-text">
              Settings
            </h1>
            <p className="text-clip-muted text-sm">
              Manage your account and preferences
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="card-glass p-2 space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-clip-cyan text-black'
                      : 'text-clip-muted hover:text-clip-text hover:bg-white/[0.05]'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* User Card */}
            <div className="card-glass p-4 mt-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-clip-cyan to-blue-500 flex items-center justify-center">
                  <User className="w-5 h-5 text-black" />
                </div>
                <div>
                  <p className="font-medium text-clip-text">{user?.name}</p>
                  <p className="text-clip-muted text-xs">{user?.email}</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded font-medium ${
                user?.plan === 'creator' 
                  ? 'bg-clip-amber text-black' 
                  : user?.plan === 'pro'
                  ? 'bg-clip-cyan text-black'
                  : 'bg-clip-surface text-clip-muted border border-white/[0.08]'
              }`}>
                {user?.plan === 'creator' && <CrownIcon className="w-3 h-3" />}
                {user?.plan === 'pro' && <Sparkles className="w-3 h-3" />}
                {user?.plan === 'free' && <Zap className="w-3 h-3" />}
                {user?.plan?.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div className="card-glass p-6">
                  <h3 className="font-display font-semibold text-lg text-clip-text mb-4">
                    Profile Information
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-clip-muted mb-2">Display Name</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input-dark w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-clip-muted mb-2">Email</label>
                      <input
                        type="email"
                        value={user?.email}
                        disabled
                        className="input-dark w-full opacity-50 cursor-not-allowed"
                      />
                      <p className="text-clip-muted text-xs mt-1">Email cannot be changed</p>
                    </div>
                    <Button onClick={handleSaveProfile} className="btn-primary">
                      Save Changes
                    </Button>
                  </div>
                </div>

                <div className="card-glass p-6">
                  <h3 className="font-display font-semibold text-lg text-clip-text mb-4">
                    Change Password
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-clip-muted mb-2">Current Password</label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="input-dark w-full"
                        placeholder="••••••••"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-clip-muted mb-2">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="input-dark w-full"
                        placeholder="••••••••"
                      />
                    </div>
                    <Button onClick={handleSavePassword} className="btn-primary">
                      Update Password
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Plan Tab */}
            {activeTab === 'plan' && (
              <div className="space-y-6">
                <div className="card-glass p-6">
                  <h3 className="font-display font-semibold text-lg text-clip-text mb-4">
                    Current Plan
                  </h3>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-display font-bold text-2xl text-clip-text capitalize">
                        {user?.plan}
                      </p>
                      <p className="text-clip-muted text-sm">
                        {user?.plan === 'free' && '3 clips per month'}
                        {user?.plan === 'pro' && '30 clips per month'}
                        {user?.plan === 'creator' && 'Unlimited clips'}
                      </p>
                    </div>
                    <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${
                      user?.plan === 'creator' 
                        ? 'bg-clip-amber text-black' 
                        : user?.plan === 'pro'
                        ? 'bg-clip-cyan text-black'
                        : 'bg-clip-surface text-clip-muted border border-white/[0.08]'
                    }`}>
                      {user?.plan?.toUpperCase()}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {planFeatures[user?.plan || 'free'].map((feature, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-clip-text">
                        <Check className="w-4 h-4 text-clip-cyan" />
                        {feature}
                      </div>
                    ))}
                  </div>
                </div>

                {user?.plan !== 'creator' && (
                  <div className="card-glass p-6 border-clip-cyan/30">
                    <h3 className="font-display font-semibold text-lg text-clip-text mb-2">
                      Upgrade Your Plan
                    </h3>
                    <p className="text-clip-muted text-sm mb-4">
                      Get more clips and advanced features
                    </p>
                    <Button onClick={() => onNavigate('pricing')} className="btn-primary">
                      <Sparkles className="w-4 h-4 mr-2" />
                      View Plans
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Referrals Tab */}
            {activeTab === 'referrals' && (
              <div className="space-y-6">
                <div className="card-glass p-6">
                  <h3 className="font-display font-semibold text-lg text-clip-text mb-2">
                    Your Referral Code
                  </h3>
                  <p className="text-clip-muted text-sm mb-4">
                    Share this code with friends and earn 5 free clips for each signup!
                  </p>
                  <div className="flex gap-3">
                    <div className="flex-1 bg-clip-surface border border-white/[0.08] rounded-xl px-4 py-3 font-mono text-clip-text">
                      {referralCode}
                    </div>
                    <button
                      onClick={handleCopyReferral}
                      className="px-4 py-3 bg-clip-cyan text-black rounded-xl font-medium hover:brightness-110 transition-all flex items-center gap-2"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="card-glass p-6">
                  <h3 className="font-display font-semibold text-lg text-clip-text mb-4">
                    Referral Stats
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-clip-surface rounded-xl p-4">
                      <p className="text-clip-muted text-sm">Total Referrals</p>
                      <p className="font-display font-bold text-2xl text-clip-text">0</p>
                    </div>
                    <div className="bg-clip-surface rounded-xl p-4">
                      <p className="text-clip-muted text-sm">Free Clips Earned</p>
                      <p className="font-display font-bold text-2xl text-clip-text">0</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <div className="card-glass p-6">
                <h3 className="font-display font-semibold text-lg text-clip-text mb-4">
                  Notification Preferences
                </h3>
                <div className="space-y-4">
                  {[
                    { key: 'email', label: 'Email notifications', desc: 'Receive updates about your account' },
                    { key: 'marketing', label: 'Marketing emails', desc: 'Get news about features and promotions' },
                    { key: 'newFeatures', label: 'New features', desc: 'Be the first to know about new features' },
                    { key: 'clipReady', label: 'Clip ready alerts', desc: 'Get notified when your clips are ready' },
                  ].map((item) => (
                    <label key={item.key} className="flex items-center justify-between p-3 bg-clip-surface rounded-xl cursor-pointer">
                      <div>
                        <p className="text-clip-text font-medium">{item.label}</p>
                        <p className="text-clip-muted text-xs">{item.desc}</p>
                      </div>
                      <button
                        onClick={() => setNotifications(prev => ({ ...prev, [item.key]: !prev[item.key as keyof typeof notifications] }))}
                        className={`w-12 h-6 rounded-full transition-colors relative ${
                          notifications[item.key as keyof typeof notifications] ? 'bg-clip-cyan' : 'bg-clip-surface border border-white/[0.08]'
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-5 h-5 rounded-full bg-black transition-transform ${
                            notifications[item.key as keyof typeof notifications] ? 'left-6' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
