import { useState, useRef, useEffect } from 'react';
import type { Page } from '@/App';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Upload, Link2, X, FileVideo,
  Gamepad2, Settings, Sparkles, Zap, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { processVideo, getJobStatus } from '@/api/clipai';
import { useAuth } from '@/contexts/AuthContext';

interface UploadPageProps {
  user: { name: string; email: string; plan: 'free' | 'pro' | 'creator' } | null;
  onNavigate: (page: Page) => void;
}

const games = [
  'Call of Duty',
  'Bloodstrike',
  'PUBG',
  'Mobile Legends',
  'Free Fire',
  'Other',
];

export function UploadPage({ user, onNavigate }: UploadPageProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'youtube'>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedGame, setSelectedGame] = useState('Call of Duty');
  const [clipCount, setClipCount] = useState(3);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [beatSyncEnabled, setBeatSyncEnabled] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStep, setAnalysisStep] = useState('');
  
  const { session, user: authUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up polling interval and timeout on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('video/')) {
        setSelectedFile(file);
        toast.success(`File "${file.name}" selected`);
      } else {
        toast.error('Please upload a video file (MP4)');
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('video/')) {
        setSelectedFile(file);
        toast.success(`File "${file.name}" selected`);
      } else {
        toast.error('Please upload a video file (MP4)');
      }
    }
  };

  const handleAnalyze = async () => {
    if (!session) {
      toast.error('Please sign in to analyze videos');
      onNavigate('auth');
      return;
    }

    if (activeTab === 'upload' && !selectedFile) {
      toast.error('Please select a video file');
      return;
    }
    if (activeTab === 'youtube' && !youtubeUrl) {
      toast.error('Please enter a YouTube URL');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setAnalysisStep('📤 Uploading video...');

    try {
      const result = await processVideo({
        video_url: activeTab === 'youtube' ? youtubeUrl : undefined,
        file: activeTab === 'upload' ? selectedFile ?? undefined : undefined,
        game: selectedGame,
        clip_count: clipCount,
        captions: captionsEnabled,
        beat_sync: beatSyncEnabled,
        format: 'tiktok',
        user_id: authUser?.id,
      });

      // Store job_id so ResultsPage can pick up the clips
      localStorage.setItem('clipai_recent_job', result.job_id);

      const poll = async () => {
        try {
          const status = await getJobStatus(result.job_id);
          setAnalysisProgress(status.progress);

          if (status.progress >= 80) setAnalysisStep('✂️ Preparing your clips...');
          else if (status.progress >= 60) setAnalysisStep('🎯 Calculating hype scores...');
          else if (status.progress >= 40) setAnalysisStep('⚡ Detecting hype moments...');
          else if (status.progress >= 20) setAnalysisStep('🔍 AI scanning for highlights...');
          else setAnalysisStep('📤 Uploading video...');

          if (status.status === 'completed') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            if (pollTimeoutRef.current) {
              clearTimeout(pollTimeoutRef.current);
              pollTimeoutRef.current = null;
            }
            setAnalysisProgress(100);
            setAnalysisStep('✅ Analysis complete!');
            toast.success(`Analysis complete! Found ${status.clips?.length ?? 0} highlight clips.`);
            setTimeout(() => onNavigate('results'), 500);
            return;
          }

          if (status.status === 'failed') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            if (pollTimeoutRef.current) {
              clearTimeout(pollTimeoutRef.current);
              pollTimeoutRef.current = null;
            }
            setIsAnalyzing(false);
            setAnalysisProgress(0);
            // Try to extract a meaningful error message from the job
            const jobError = (status as unknown as Record<string, unknown>).error as string | undefined;
            const clipError = (status.clips?.[0] as Record<string, unknown> | undefined)?.error as string | undefined;
            const errorMsg = jobError || clipError || 'Video analysis failed. Please try again with a different video.';
            toast.error(errorMsg, { duration: 8000 });
          }
        } catch {
          // Continue polling on transient network errors
        }
      };

      // Poll every 3 seconds
      pollIntervalRef.current = setInterval(poll, 3000);
      // Fire first poll immediately
      await poll();

      // Safety timeout: stop polling after 5 minutes
      pollTimeoutRef.current = setTimeout(() => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setIsAnalyzing(false);
        setAnalysisProgress(0);
        toast.error('Analysis timed out. The video may be too long or the server is busy. Please try again.');
      }, 5 * 60 * 1000);
    } catch (error: unknown) {
      setIsAnalyzing(false);
      setAnalysisProgress(0);
      const message = error instanceof Error ? error.message : 'Failed to start video analysis. Please try again.';
      toast.error(message);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (isAnalyzing) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 relative">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-clip-cyan/5 rounded-full blur-[60px]" />
        </div>

        <div className="w-full max-w-md text-center relative z-10">
          {/* Animated scanner */}
          <div className="relative w-32 h-32 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full border-2 border-clip-cyan/20" />
            <div className="absolute inset-2 rounded-full border-2 border-clip-cyan/30" />
            <div className="absolute inset-4 rounded-full border-2 border-clip-cyan/40" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Zap className="w-12 h-12 text-clip-cyan animate-pulse" />
            </div>
            {/* Scanning line */}
            <div className="absolute inset-0 overflow-hidden rounded-full">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-clip-cyan to-transparent animate-scan" />
            </div>
          </div>

          <h2 className="font-display font-bold text-2xl text-clip-text mb-2">
            Analyzing Your Gameplay
          </h2>
          <p className="text-clip-muted mb-6">{analysisStep}</p>

          <div className="card-glass p-6">
            <Progress value={analysisProgress} className="h-2 mb-4 bg-clip-surface" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-clip-muted">Progress</span>
              <span className="text-clip-cyan font-mono">{Math.round(analysisProgress)}%</span>
            </div>
          </div>

          {/* Status indicators */}
          <div className="mt-6 space-y-2">
            {[
              '📤 Uploading video',
              '🔍 AI scanning for highlights',
              '⚡ Detecting hype moments',
              '🎯 Calculating hype scores',
              '✂️ Preparing your clips',
            ].map((step, i) => (
              <div 
                key={step}
                className={`flex items-center justify-center gap-2 text-sm ${
                  i < (analysisProgress / 20) ? 'text-clip-cyan' : 'text-clip-muted'
                }`}
              >
                {i < (analysisProgress / 20) ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-current" />
                )}
                {step}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-clip-text mb-3">
            Upload Your <span className="gradient-text">Gameplay</span>
          </h1>
          <p className="text-clip-muted max-w-lg mx-auto">
            Our AI will analyze your footage and detect the most hype moments automatically.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-clip-surface rounded-xl p-1 border border-white/[0.06]">
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm transition-all ${
                activeTab === 'upload'
                  ? 'bg-clip-cyan text-black'
                  : 'text-clip-muted hover:text-clip-text'
              }`}
            >
              <Upload className="w-4 h-4" />
              Upload Video
            </button>
            <button
              onClick={() => setActiveTab('youtube')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm transition-all ${
                activeTab === 'youtube'
                  ? 'bg-clip-cyan text-black'
                  : 'text-clip-muted hover:text-clip-text'
              }`}
            >
              <Link2 className="w-4 h-4" />
              YouTube Link
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Upload Area */}
          <div className="lg:col-span-2 space-y-6">
            {activeTab === 'upload' ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`card-glass p-8 text-center cursor-pointer transition-all duration-300 ${
                  isDragging 
                    ? 'border-clip-cyan bg-clip-cyan/5' 
                    : 'hover:border-white/[0.12]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                {selectedFile ? (
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-clip-cyan/10 flex items-center justify-center flex-shrink-0">
                      <FileVideo className="w-7 h-7 text-clip-cyan" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-clip-text truncate">{selectedFile.name}</p>
                      <p className="text-clip-muted text-sm">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                      className="p-2 text-clip-muted hover:text-clip-red hover:bg-clip-red/10 rounded-lg transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-2xl bg-clip-cyan/10 flex items-center justify-center mx-auto mb-4">
                      <Upload className="w-8 h-8 text-clip-cyan" />
                    </div>
                    <p className="font-medium text-clip-text mb-2">
                      Drop your video here, or click to browse
                    </p>
                    <p className="text-clip-muted text-sm">
                      MP4, MOV up to 500MB
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="card-glass p-6">
                <label className="block text-sm font-medium text-clip-text mb-3">
                  YouTube URL
                </label>
                <div className="relative">
                  <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-clip-muted" />
                  <input
                    type="url"
                    placeholder="https://youtube.com/watch?v=..."
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    className="input-dark pl-12 w-full"
                  />
                </div>
                <p className="text-clip-muted text-xs mt-2">
                  Paste a YouTube video link and we'll fetch it for analysis.
                </p>
              </div>
            )}

            {/* Game Selector */}
            <div className="card-glass p-6">
              <label className="flex items-center gap-2 text-sm font-medium text-clip-text mb-4">
                <Gamepad2 className="w-4 h-4 text-clip-cyan" />
                Select Game
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {games.map((game) => (
                  <button
                    key={game}
                    onClick={() => setSelectedGame(game)}
                    className={`px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      selectedGame === game
                        ? 'bg-clip-cyan text-black'
                        : 'bg-clip-surface text-clip-muted hover:text-clip-text border border-white/[0.06] hover:border-white/[0.12]'
                    }`}
                  >
                    {game}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Options Panel */}
          <div className="space-y-6">
            <div className="card-glass p-6">
              <label className="flex items-center gap-2 text-sm font-medium text-clip-text mb-4">
                <Settings className="w-4 h-4 text-clip-cyan" />
                Options
              </label>

              <div className="space-y-5">
                {/* Clip Count */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-clip-muted">Number of Clips</span>
                    <span className="text-sm font-medium text-clip-cyan">{clipCount}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={clipCount}
                    onChange={(e) => setClipCount(Number(e.target.value))}
                    className="w-full h-2 bg-clip-surface rounded-lg appearance-none cursor-pointer accent-clip-cyan"
                  />
                  <div className="flex justify-between text-xs text-clip-muted mt-1">
                    <span>1</span>
                    <span>5</span>
                  </div>
                </div>

                {/* Toggles */}
                <div className="space-y-3">
                  <label className="flex items-center justify-between cursor-pointer group">
                    <span className="text-sm text-clip-text group-hover:text-clip-cyan transition-colors">
                      Auto Captions
                    </span>
                    <button
                      onClick={() => setCaptionsEnabled(!captionsEnabled)}
                      className={`w-12 h-6 rounded-full transition-colors relative ${
                        captionsEnabled ? 'bg-clip-cyan' : 'bg-clip-surface'
                      }`}
                    >
                      <div
                        className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-transform ${
                          captionsEnabled ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                  </label>

                  <label className="flex items-center justify-between cursor-pointer group">
                    <span className="text-sm text-clip-text group-hover:text-clip-cyan transition-colors">
                      Beat Sync
                    </span>
                    <button
                      onClick={() => setBeatSyncEnabled(!beatSyncEnabled)}
                      className={`w-12 h-6 rounded-full transition-colors relative ${
                        beatSyncEnabled ? 'bg-clip-cyan' : 'bg-clip-surface'
                      }`}
                    >
                      <div
                        className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-transform ${
                          beatSyncEnabled ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                  </label>
                </div>
              </div>
            </div>

            {/* Plan Info */}
            <div className="card-glass p-4 bg-clip-cyan/5 border-clip-cyan/20">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-clip-cyan" />
                <span className="text-sm font-medium text-clip-text">
                  {user?.plan === 'creator' ? 'Creator Plan' : user?.plan === 'pro' ? 'Pro Plan' : 'Free Plan'}
                </span>
              </div>
              <p className="text-clip-muted text-xs">
                {user?.plan === 'free' 
                  ? 'Upgrade to Pro for beat sync and watermark removal.'
                  : 'You have access to all AI features!'
                }
              </p>
            </div>
          </div>
        </div>

        {/* Analyze Button */}
        <div className="mt-8 text-center">
          <Button
            onClick={handleAnalyze}
            disabled={
              (activeTab === 'upload' && !selectedFile) ||
              (activeTab === 'youtube' && !youtubeUrl)
            }
            className="btn-primary text-lg px-12 py-5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Zap className="w-6 h-6 mr-2" />
            ANALYZE
          </Button>
          <p className="text-clip-muted text-sm mt-3">
            Analysis typically takes 30-60 seconds
          </p>
        </div>
      </div>
    </div>
  );
}
