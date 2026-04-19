import { useState } from 'react';
import type { Page } from '@/App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Zap, Mail, Lock, User, ArrowRight, 
  Chrome, Eye, EyeOff, Gift 
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface AuthPageProps {
  onNavigate: (page: Page) => void;
  onLogin: (email: string, name: string) => void;
}

export function AuthPage({ onNavigate }: AuthPageProps) {
  const [isLogin, setIsLogin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { signIn, signUp } = useAuth();
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    referralCode: localStorage.getItem('clipai_pending_referral') || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (!isLogin) {
        await signUp(formData.email, formData.password, formData.name || undefined);
        toast.success('Account created! Please check your email to verify.');
      } else {
        await signIn(formData.email, formData.password);
        toast.success('Welcome back!');
      }
      // AuthContext handles session state automatically via Supabase listeners;
      // no need to call onLogin since the parent reads from AuthContext.
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Authentication failed. Please try again.';
      toast.error(message);
    }

    setIsLoading(false);
  };

  const handleGoogleAuth = () => {
    // TODO: Implement Supabase OAuth — requires Google provider to be configured
    // in the Supabase dashboard under Authentication > Providers > Google.
    // Example: await supabase.auth.signInWithOAuth({ provider: 'google' });
    toast.info('Google sign-in coming soon!');
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-20 px-4 relative">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-clip-cyan/5 rounded-full blur-[60px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/5 rounded-full blur-[60px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <button
            onClick={() => onNavigate('landing')}
            className="inline-flex items-center gap-2 group mb-6"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-clip-cyan to-blue-500 flex items-center justify-center group-hover:shadow-glow-cyan transition-shadow">
              <Zap className="w-6 h-6 text-black" />
            </div>
            <span className="font-display font-bold text-2xl text-clip-text">
              ClipAI
            </span>
          </button>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-clip-text mb-2">
            {isLogin ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-clip-muted text-sm">
            {isLogin 
              ? 'Sign in to access your clips' 
              : 'Start creating viral gaming highlights'}
          </p>
        </div>

        {/* Auth Card */}
        <div className="card-glass p-6 sm:p-8">
          {/* Google Auth */}
          <button
            onClick={handleGoogleAuth}
            className="w-full flex items-center justify-center gap-3 bg-clip-surface hover:bg-white/[0.05] border border-white/[0.08] hover:border-white/[0.12] text-clip-text font-medium py-3 px-4 rounded-xl transition-all duration-200 mb-6"
          >
            <Chrome className="w-5 h-5" />
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-white/[0.08]" />
            <span className="text-clip-muted text-xs uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-white/[0.08]" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-clip-text text-sm font-medium">
                  Full Name
                </Label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-clip-muted" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input-dark pl-12"
                    required={!isLogin}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-clip-text text-sm font-medium">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-clip-muted" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input-dark pl-12"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-clip-text text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-clip-muted" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="input-dark pl-12 pr-12"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-clip-muted hover:text-clip-text transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="referral" className="text-clip-text text-sm font-medium flex items-center gap-2">
                  <Gift className="w-4 h-4 text-clip-amber" />
                  Referral Code (Optional)
                </Label>
                <div className="relative">
                  <Input
                    id="referral"
                    type="text"
                    placeholder="Enter code for free clips"
                    value={formData.referralCode}
                    onChange={(e) => setFormData({ ...formData, referralCode: e.target.value })}
                    className="input-dark"
                  />
                </div>
                <p className="text-clip-muted text-xs">
                  Have a referral code? Get 5 free clips when you sign up!
                </p>
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full btn-primary py-4 flex items-center justify-center gap-2 mt-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  {isLogin ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </Button>
          </form>

          {/* Toggle */}
          <div className="mt-6 text-center">
            <p className="text-clip-muted text-sm">
              {isLogin ? "Don't have an account?" : 'Already have an account?'}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="ml-2 text-clip-cyan hover:underline font-medium"
              >
                {isLogin ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>

        {/* Terms */}
        <p className="text-center text-clip-muted text-xs mt-6">
          By continuing, you agree to our{' '}
          <a href="#" className="text-clip-cyan hover:underline">Terms of Service</a>
          {' '}and{' '}
          <a href="#" className="text-clip-cyan hover:underline">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
