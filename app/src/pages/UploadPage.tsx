import { useState, useRef } from 'react';
import type { Page } from '../App';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Upload, Link2, X, FileVideo,
  Gamepad2, Settings, Sparkles, Zap, Check, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  uploadVideo,
  analyseVideo,
  analyseYouTube,
  generateCaptions,
} from '../services/api';
import type { DetectedClip, AnalysisOptions } from '../types';

interface UploadPageProps {
  user: { name: string; email: string; plan: 'free' | 'starter' | 'pro' | 'creator'; credits?: number } | null;
  onNavigate: (page: Page, clips?: DetectedClip[]) => void;
}

const GAMES = ['Call of Duty', 'Bloodstrike', 'PUBG', 'Mobile Legends', 'Free Fire', 'Other'];

const STEPS = [
  { key: 'upload',  label: '📤 Uploading video…'            },
  { key: 'scan',    label: '🔍 AI scanning highlights…' },
  { key: 'caption', label: '✍️  AI generating captions…'  },
  { key: 'prepare', label: '✂️  Preparing your clips…'       },
];

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;  // 500 MB
const MIN_CREDITS_NEEDED  = 15;                   // 10 scan + 5 captions

export function UploadPage({ user, onNavigate }: UploadPageProps) {
  const [activeTab, setActiveTab]             = useState<'upload' | 'youtube'>('upload');
  const [isDragging, setIsDragging]           = useState(false);
  const [selectedFile, setSelectedFile]       = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl]           = useState('');
  const [selectedGame, setSelectedGame]       = useState('Call of Duty');
  const [clipCount, setClipCount]             = useState(3);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [beatSyncEnabled, setBeatSyncEnabled] = useState(true);

  const [isAnalyzing, setIsAnalyzing]         = useState(false);
  const [currentStepIdx, setCurrentStepIdx]   = useState(0);
  const [uploadProgress, setUploadProgress]   = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [error, setError]                     = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { toast.error('Please upload a video file'); return; }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(`File too large. Max 500 MB (yours is ${formatFileSize(file.size)})`);
      return;
    }
    setSelectedFile(file); toast.success(`"${file.name}" selected`);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { toast.error('Please upload a video file'); return; }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(`File too large. Max 500 MB (yours is ${formatFileSize(file.size)})`);
      return;
    }
    setSelectedFile(file); toast.success(`"${file.name}" selected`);
  };

  const handleAnalyze = async () => {
    if (activeTab === 'upload' && !selectedFile) return toast.error('Please select a video file') as unknown as void;
    if (activeTab === 'youtube' && !youtubeUrl)  return toast.error('Please enter a YouTube URL') as unknown as void;
    // ─── Client-side credit balance check ──────────────────────────────────
    const balance = user?.credits ?? 0;
    if (balance < MIN_CREDITS_NEEDED) {
      toast.error(`Insufficient credits. Need ${MIN_CREDITS_NEEDED}, have ${balance}.`);
      onNavigate('pricing');
      return;
    }

    setIsAnalyzing(true); setError(null);
    setCurrentStepIdx(0); setOverallProgress(0);

    const opts: AnalysisOptions = { game: selectedGame, clipCount, captionsEnabled, beatSyncEnabled };

    try {
      let videoId = '';

      // Step 0: Upload
      setCurrentStepIdx(0);
      if (activeTab === 'upload' && selectedFile) {
        const result = await uploadVideo(selectedFile, (pct) => {
          setUploadProgress(pct);
          setOverallProgress(Math.round(pct * 0.3));
        });
        if (!result.success) throw new Error(result.error ?? 'Upload failed');
        videoId = result.videoId;
      }
      setOverallProgress(30);

      // Step 1: AI scan
      setCurrentStepIdx(1);
      const analysisResult = activeTab === 'youtube'
        ? await analyseYouTube(youtubeUrl, opts)
        : await analyseVideo(videoId, opts);
      if (!analysisResult.success) throw new Error(analysisResult.error ?? 'Analysis failed');
      setOverallProgress(65);

      // Step 2: AI captions
      setCurrentStepIdx(2);
      let clips = analysisResult.clips;
      if (captionsEnabled && clips.length > 0) {
        clips = await generateCaptions(clips, selectedGame);
      }
      setOverallProgress(85);

      // Step 3: Done
      setCurrentStepIdx(3);
      setOverallProgress(100);
      await new Promise((r) => setTimeout(r, 600));

      toast.success(`Found ${clips.length} highlight clip${clips.length !== 1 ? 's' : ''}!`);
      onNavigate('results', clips);

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg); toast.error(msg);
      setIsAnalyzing(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // ── Analyzing screen ──────────────────────────────────────────────────────

  if (isAnalyzing) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-clip-cyan/5 rounded-full blur-[150px]" />
        </div>

        <div className="w-full max-w-md text-center relative z-10">
          <div className="relative w-32 h-32 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full border-2 border-clip-cyan/20" />
            <div className="absolute inset-2 rounded-full border-2 border-clip-cyan/30" />
            <div className="absolute inset-4 rounded-full border-2 border-clip-cyan/40 animate-spin border-t-clip-cyan" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Zap className="w-12 h-12 text-clip-cyan animate-pulse" />
            </div>
          </div>

          <h2 className="font-display font-bold text-2xl text-clip-text mb-2">Analyzing Your Gameplay</h2>
          <p className="text-clip-muted mb-6">{STEPS[currentStepIdx]?.label}</p>

          <div className="card-glass p-6 mb-6">
            {currentStepIdx === 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-clip-muted mb-1">
                  <span>Upload</span>
                  <span className="font-mono text-clip-cyan">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-1 bg-clip-surface mb-3" />
              </div>
            )}
            <Progress value={overallProgress} className="h-2 mb-3 bg-clip-surface" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-clip-muted">Overall</span>
              <span className="text-clip-cyan font-mono">{overallProgress}%</span>
            </div>
          </div>

          <div className="space-y-2">
            {STEPS.map((step, i) => (
              <div key={step.key} className={`flex items-center justify-center gap-2 text-sm transition-colors ${
                i < currentStepIdx ? 'text-clip-cyan' : i === currentStepIdx ? 'text-clip-text' : 'text-clip-muted'
              }`}>
                {i < currentStepIdx ? (
                  <Check className="w-4 h-4 text-clip-cyan" />
                ) : i === currentStepIdx ? (
                  <div className="w-4 h-4 rounded-full border-2 border-clip-cyan border-t-transparent animate-spin" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-current opacity-40" />
                )}
                {step.label}
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3 text-left">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 text-sm font-medium">Error</p>
                <p className="text-red-300 text-xs mt-1">{error}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main UI ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-clip-text mb-3">
            Upload Your <span className="gradient-text">Gameplay</span>
          </h1>
          <p className="text-clip-muted max-w-lg mx-auto">
            AI scans for hype moments. AI writes viral captions.
          </p>
        </div>

        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-clip-surface rounded-xl p-1 border border-white/[0.06]">
            {(['upload', 'youtube'] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm transition-all ${
                  activeTab === tab ? 'bg-clip-cyan text-black' : 'text-clip-muted hover:text-clip-text'
                }`}>
                {tab === 'upload' ? <Upload className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                {tab === 'upload' ? 'Upload Video' : 'YouTube Link'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {activeTab === 'upload' ? (
              <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`card-glass p-8 text-center cursor-pointer transition-all duration-300 ${
                  isDragging ? 'border-clip-cyan bg-clip-cyan/5' : 'hover:border-white/[0.12]'
                }`}>
                <input ref={fileInputRef} type="file" accept="video/mp4,video/*" onChange={handleFileSelect} className="hidden" />
                {selectedFile ? (
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-clip-cyan/10 flex items-center justify-center flex-shrink-0">
                      <FileVideo className="w-7 h-7 text-clip-cyan" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-clip-text truncate">{selectedFile.name}</p>
                      <p className="text-clip-muted text-sm">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                      className="p-2 text-clip-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-2xl bg-clip-cyan/10 flex items-center justify-center mx-auto mb-4">
                      <Upload className="w-8 h-8 text-clip-cyan" />
                    </div>
                    <p className="font-medium text-clip-text mb-2">Drop your video here, or click to browse</p>
                    <p className="text-clip-muted text-sm">MP4, MOV up to 500 MB</p>
                  </>
                )}
              </div>
            ) : (
              <div className="card-glass p-6">
                <label className="block text-sm font-medium text-clip-text mb-3">YouTube URL</label>
                <div className="relative">
                  <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-clip-muted" />
                  <input type="url" placeholder="https://youtube.com/watch?v=…" value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)} className="input-dark pl-12 w-full" />
                </div>
                <p className="text-clip-muted text-xs mt-2">
                  The worker downloads and analyses it via yt-dlp + AI.
                </p>
              </div>
            )}

            <div className="card-glass p-6">
              <label className="flex items-center gap-2 text-sm font-medium text-clip-text mb-4">
                <Gamepad2 className="w-4 h-4 text-clip-cyan" /> Select Game
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {GAMES.map((game) => (
                  <button key={game} onClick={() => setSelectedGame(game)}
                    className={`px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      selectedGame === game
                        ? 'bg-clip-cyan text-black'
                        : 'bg-clip-surface text-clip-muted hover:text-clip-text border border-white/[0.06] hover:border-white/[0.12]'
                    }`}>
                    {game}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card-glass p-6">
              <label className="flex items-center gap-2 text-sm font-medium text-clip-text mb-4">
                <Settings className="w-4 h-4 text-clip-cyan" /> Options
              </label>
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-clip-muted">Number of Clips</span>
                    <span className="text-sm font-medium text-clip-cyan">{clipCount}</span>
                  </div>
                  <input type="range" min="1" max="5" value={clipCount}
                    onChange={(e) => setClipCount(Number(e.target.value))}
                    className="w-full h-2 bg-clip-surface rounded-lg appearance-none cursor-pointer accent-clip-cyan" />
                  <div className="flex justify-between text-xs text-clip-muted mt-1"><span>1</span><span>5</span></div>
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Auto Captions', value: captionsEnabled, set: setCaptionsEnabled },
                    { label: 'Beat Sync',             value: beatSyncEnabled, set: setBeatSyncEnabled },
                  ].map(({ label, value, set }) => (
                    <label key={label} className="flex items-center justify-between cursor-pointer group">
                      <span className="text-sm text-clip-text group-hover:text-clip-cyan transition-colors">{label}</span>
                      <button onClick={() => set(!value)}
                        className={`w-12 h-6 rounded-full transition-colors relative ${value ? 'bg-clip-cyan' : 'bg-clip-surface'}`}>
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-transform ${value ? 'left-7' : 'left-1'}`} />
                      </button>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="card-glass p-4 bg-clip-cyan/5 border-clip-cyan/20">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-clip-cyan" />
                <span className="text-sm font-medium text-clip-text capitalize">{user?.plan ?? 'Free'} Plan</span>
              </div>
              <p className="text-clip-muted text-xs">
                {!user?.plan || user.plan === 'free'
                  ? 'Upgrade to Pro for beat sync and watermark removal.'
                  : 'You have access to all AI features!'}
              </p>
            </div>

            <div className="card-glass p-4">
              <p className="text-xs text-clip-muted mb-2 font-medium uppercase tracking-wider">Credit Cost</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-clip-muted">AI scan</span><span className="text-clip-text">10 cr</span></div>
                <div className="flex justify-between"><span className="text-clip-muted">AI captions</span><span className="text-clip-text">{captionsEnabled ? '5 cr' : '—'}</span></div>
                <div className="border-t border-white/[0.06] mt-2 pt-2 flex justify-between font-medium">
                  <span className="text-clip-muted">Total</span>
                  <span className="text-clip-cyan">{captionsEnabled ? 15 : 10} cr</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Button onClick={handleAnalyze}
            disabled={(activeTab === 'upload' && !selectedFile) || (activeTab === 'youtube' && !youtubeUrl)}
            className="btn-primary text-lg px-12 py-5 disabled:opacity-50 disabled:cursor-not-allowed">
            <Zap className="w-6 h-6 mr-2" /> ANALYZE WITH AI
          </Button>
          <p className="text-clip-muted text-sm mt-3">Powered by ClipAI</p>
        </div>
      </div>
    </div>
  );
}
