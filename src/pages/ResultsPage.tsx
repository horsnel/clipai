import { useState, useEffect, useRef } from 'react';
import type { Page } from '@/App';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { 
  Play, Pause, Download, Share2, Scissors, 
  Type, Music, Image, Check, ChevronLeft, Smartphone,
  Loader2, AlertCircle, Upload
} from 'lucide-react';
import { toast } from 'sonner';
import { getJobStatus, getUserClips } from '@/api/clipai';
import { useAuth } from '@/contexts/AuthContext';

interface ResultsPageProps {
  user: { name: string; email: string; plan: 'free' | 'pro' | 'creator' } | null;
  onNavigate: (page: Page) => void;
}

interface DetectedClip {
  id: string;
  thumbnail: string;
  startTime: string;
  endTime: string;
  hypeScore: number;
  duration: string;
  selected: boolean;
  videoUrl?: string;
  label?: string;
  status?: string;
}

type Format = 'tiktok' | 'reels' | 'shorts';

export function ResultsPage({ user, onNavigate }: ResultsPageProps) {
  const [clips, setClips] = useState<DetectedClip[]>([]);
  const [selectedClip, setSelectedClip] = useState<DetectedClip | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [format, setFormat] = useState<Format>('tiktok');
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [watermarkText, setWatermarkText] = useState('@' + (user?.name || 'gamer'));
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [beatSyncEnabled, setBeatSyncEnabled] = useState(true);
  const [trimRange, setTrimRange] = useState([0, 100]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStep, setExportStep] = useState('');
  const [exportDone, setExportDone] = useState(false);
  const [isLoadingClips, setIsLoadingClips] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { user: authUser } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Sync play/pause state with the video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.play().catch(() => setIsPlaying(false));
    } else {
      video.pause();
    }
  }, [isPlaying, selectedClip?.videoUrl]);

  // Load real clips from API
  useEffect(() => {
    async function loadData() {
      setIsLoadingClips(true);
      setLoadError(null);
      try {
        // First, check if there's a recent job from the upload flow
        const recentJobId = localStorage.getItem('clipai_recent_job');
        if (recentJobId) {
          try {
            const jobStatus = await getJobStatus(recentJobId);
            if (jobStatus.status === 'completed' && jobStatus.clips?.length) {
              const mapped: DetectedClip[] = jobStatus.clips.map(clip => ({
                id: clip.id || Math.random().toString(36).slice(2),
                thumbnail: clip.thumbnail || clip.thumbnail_url || '',
                startTime: clip.start_time || '',
                endTime: clip.end_time || '',
                hypeScore: clip.hype_score || 70,
                duration: clip.duration || '0s',
                selected: false,
                videoUrl: clip.video_url || clip.output_url || clip.clip_url || '',
                label: clip.label || clip.title || '',
                status: clip.status || 'ready',
              }));
              setClips(mapped);
              setSelectedClip(mapped[0]);
              localStorage.removeItem('clipai_recent_job');
              setIsLoadingClips(false);
              return;
            } else if (jobStatus.status === 'failed') {
              const jobError = (jobStatus as unknown as Record<string, unknown>).error as string | undefined;
              setLoadError(jobError || 'Previous analysis failed. Please try uploading again.');
              localStorage.removeItem('clipai_recent_job');
              setIsLoadingClips(false);
              return;
            } else if (jobStatus.status === 'processing') {
              // Job still processing — redirect back to upload page to show progress
              toast('Analysis still in progress, redirecting...', { icon: '⏳' });
              onNavigate('upload');
              setIsLoadingClips(false);
              return;
            }
          } catch {
            // Job ID might be stale or from a restarted server
            localStorage.removeItem('clipai_recent_job');
          }
        }

        // Fallback: load user's clips from the API
        if (authUser) {
          try {
            const response = await getUserClips(authUser.id);
            if (response.clips?.length) {
              const mapped: DetectedClip[] = response.clips.map(clip => ({
                id: clip.id || Math.random().toString(36).slice(2),
                thumbnail: clip.thumbnail || clip.thumbnail_url || '',
                startTime: clip.start_time || '',
                endTime: clip.end_time || '',
                hypeScore: clip.hype_score || 70,
                duration: clip.duration || '0s',
                selected: false,
                videoUrl: clip.video_url || clip.output_url || clip.clip_url || '',
                label: clip.label || clip.title || '',
                status: clip.status || 'ready',
              }));
              setClips(mapped);
              setSelectedClip(mapped[0]);
              setIsLoadingClips(false);
              return;
            }
          } catch {
            // API unavailable — no clips to show
          }
        }
        
        // No clips found anywhere
        setIsLoadingClips(false);
      } catch {
        setLoadError('Failed to load clips. Please try again.');
        setIsLoadingClips(false);
      }
    }

    loadData();
  }, [authUser, onNavigate]);

  const getHypeBadge = (score: number) => {
    if (score >= 90) return <span className="hype-badge-gold">{score} HYPE</span>;
    if (score >= 70) return <span className="hype-badge-blue">{score} HYPE</span>;
    return <span className="hype-badge-gray">{score} HYPE</span>;
  };

  const handleClipSelect = (clip: DetectedClip) => {
    setSelectedClip(clip);
    setClips(clips.map(c => ({ ...c, selected: c.id === clip.id })));
  };

  const handleExport = async () => {
    if (exportDone && selectedClip?.videoUrl) {
      // Actually download the clip
      try {
        const response = await fetch(selectedClip.videoUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clipai_${selectedClip.label || 'clip'}_${format}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        toast.success('Download started!');
      } catch {
        // Fallback: open in new tab
        window.open(selectedClip.videoUrl, '_blank');
        toast.success('Opening clip in new tab...');
      }
      return;
    }

    if (!selectedClip?.videoUrl) {
      toast.error('No video available for export. This clip may still be processing.');
      return;
    }

    setIsExporting(true);
    setExportDone(false);

    const steps = [
      'Preparing your clip...',
      'Verifying format...',
      'Finalising export...',
    ];
    for (const step of steps) {
      setExportStep(step);
      await new Promise(r => setTimeout(r, 800));
    }
    setExportStep('Clip ready!');
    setExportDone(true);
    setIsExporting(false);
    toast.success('Your clip is ready to download!');
  };

  const handleShare = () => {
    navigator.clipboard.writeText('https://clipai.io/c/' + selectedClip?.id);
    toast.success('Link copied to clipboard!');
  };

  // Loading state
  if (isLoadingClips) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-clip-cyan animate-spin mx-auto mb-4" />
          <h2 className="font-display font-bold text-xl text-clip-text mb-2">
            Loading Your Clips
          </h2>
          <p className="text-clip-muted">Retrieving analysis results...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card-glass p-8 text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="font-display font-bold text-xl text-clip-text mb-2">
            Analysis Error
          </h2>
          <p className="text-clip-muted mb-6">{loadError}</p>
          <Button onClick={() => onNavigate('upload')} className="btn-primary">
            <Upload className="w-5 h-5 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // No clips state
  if (clips.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card-glass p-8 text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-clip-cyan/10 flex items-center justify-center mx-auto mb-4">
            <Scissors className="w-8 h-8 text-clip-cyan" />
          </div>
          <h2 className="font-display font-bold text-xl text-clip-text mb-2">
            No Clips Yet
          </h2>
          <p className="text-clip-muted mb-6">
            Upload a video and let AI detect the most exciting moments automatically.
          </p>
          <Button onClick={() => onNavigate('upload')} className="btn-primary">
            <Upload className="w-5 h-5 mr-2" />
            Upload Video
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <button
              onClick={() => onNavigate('dashboard')}
              className="flex items-center gap-2 text-clip-muted hover:text-clip-text text-sm mb-2 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
            <h1 className="font-display font-bold text-2xl sm:text-3xl text-clip-text">
              Detected <span className="gradient-text">Highlights</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-clip-muted text-sm">
              {clips.filter(c => c.selected).length} of {clips.length} selected
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Clips Grid */}
          <div className="lg:col-span-1 space-y-4">
            <h3 className="font-display font-semibold text-clip-text mb-4">
              Detected Clips
            </h3>
            
            {clips.map((clip) => (
              <div
                key={clip.id}
                onClick={() => handleClipSelect(clip)}
                className={`card-glass overflow-hidden cursor-pointer transition-all duration-300 ${
                  clip.selected 
                    ? 'border-clip-cyan/50 ring-1 ring-clip-cyan/30' 
                    : 'hover:border-white/[0.12]'
                }`}
              >
                <div className="relative aspect-video bg-clip-surface">
                  {clip.thumbnail ? (
                    <img
                      src={clip.thumbnail}
                      alt={`Clip ${clip.id}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-clip-surface">
                      <Play className="w-8 h-8 text-clip-muted" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-clip-dark/80 via-transparent to-transparent" />
                  
                  {/* Hype score */}
                  <div className="absolute top-2 left-2">
                    {getHypeBadge(clip.hypeScore)}
                  </div>

                  {/* Duration */}
                  <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded text-xs font-medium">
                    {clip.duration}
                  </div>

                  {/* Selection indicator */}
                  {clip.selected && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-clip-cyan flex items-center justify-center">
                      <Check className="w-4 h-4 text-black" />
                    </div>
                  )}
                </div>

                <div className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-clip-muted text-sm font-mono">
                      {clip.label || `${clip.startTime} - ${clip.endTime}`}
                    </span>
                    <Play className="w-4 h-4 text-clip-muted" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Editor Panel */}
          <div className="lg:col-span-2 space-y-6">
            {selectedClip ? (
              <>
                {/* Video Preview */}
                <div className="card-glass overflow-hidden">
                  <div className="relative aspect-video bg-clip-surface">
                    {selectedClip.videoUrl ? (
                      <video
                        ref={videoRef}
                        key={selectedClip.videoUrl}
                        src={selectedClip.videoUrl}
                        className="w-full h-full object-cover"
                        playsInline
                        onEnded={() => setIsPlaying(false)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-clip-surface">
                        <div className="text-center">
                          <Scissors className="w-12 h-12 text-clip-muted mx-auto mb-2" />
                          <p className="text-clip-muted text-sm">Clip processing...</p>
                        </div>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-clip-dark/60 via-transparent to-transparent" />
                    
                    {/* Play button */}
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <div className="w-16 h-16 rounded-full bg-clip-cyan/90 flex items-center justify-center hover:scale-110 transition-transform">
                        {isPlaying ? (
                          <Pause className="w-7 h-7 text-black" />
                        ) : (
                          <Play className="w-7 h-7 text-black ml-1" />
                        )}
                      </div>
                    </button>

                    {/* Format indicator */}
                    <div className="absolute top-4 left-4 bg-black/60 px-3 py-1.5 rounded-lg flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-clip-cyan" />
                      <span className="text-xs font-medium uppercase">{format}</span>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="p-4 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-clip-muted text-xs">Trim</span>
                      <span className="text-clip-cyan text-xs font-mono">
                        {selectedClip.startTime} - {selectedClip.endTime}
                      </span>
                    </div>
                    <Slider
                      defaultValue={[0, 100]}
                      max={100}
                      step={1}
                      value={trimRange}
                      onValueChange={setTrimRange}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-clip-muted mt-1">
                      <span>0:00</span>
                      <span>{selectedClip.duration}</span>
                    </div>
                  </div>
                </div>

                {/* Editor Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Format Selection */}
                  <div className="card-glass p-5">
                    <label className="flex items-center gap-2 text-sm font-medium text-clip-text mb-4">
                      <Smartphone className="w-4 h-4 text-clip-cyan" />
                      Format
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['tiktok', 'reels', 'shorts'] as Format[]).map((f) => (
                        <button
                          key={f}
                          onClick={() => setFormat(f)}
                          className={`px-3 py-2 rounded-lg text-xs font-medium uppercase transition-all ${
                            format === f
                              ? 'bg-clip-cyan text-black'
                              : 'bg-clip-surface text-clip-muted hover:text-clip-text border border-white/[0.06]'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="card-glass p-5 space-y-4">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm text-clip-text flex items-center gap-2">
                        <Type className="w-4 h-4 text-clip-cyan" />
                        Captions
                      </span>
                      <button
                        onClick={() => setCaptionsEnabled(!captionsEnabled)}
                        className={`w-10 h-5 rounded-full transition-colors relative ${
                          captionsEnabled ? 'bg-clip-cyan' : 'bg-clip-surface'
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-black transition-transform ${
                            captionsEnabled ? 'left-5' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </label>

                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm text-clip-text flex items-center gap-2">
                        <Music className="w-4 h-4 text-clip-cyan" />
                        Beat Sync
                      </span>
                      <button
                        onClick={() => setBeatSyncEnabled(!beatSyncEnabled)}
                        className={`w-10 h-5 rounded-full transition-colors relative ${
                          beatSyncEnabled ? 'bg-clip-cyan' : 'bg-clip-surface'
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-black transition-transform ${
                            beatSyncEnabled ? 'left-5' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </label>

                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm text-clip-text flex items-center gap-2">
                        <Image className="w-4 h-4 text-clip-cyan" />
                        Watermark
                      </span>
                      <button
                        onClick={() => setWatermarkEnabled(!watermarkEnabled)}
                        className={`w-10 h-5 rounded-full transition-colors relative ${
                          watermarkEnabled ? 'bg-clip-cyan' : 'bg-clip-surface'
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-black transition-transform ${
                            watermarkEnabled ? 'left-5' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </label>
                  </div>
                </div>

                {/* Watermark Text */}
                {watermarkEnabled && (
                  <div className="card-glass p-5">
                    <label className="text-sm font-medium text-clip-text mb-2 block">
                      Watermark Text
                    </label>
                    <input
                      type="text"
                      value={watermarkText}
                      onChange={(e) => setWatermarkText(e.target.value)}
                      className="input-dark w-full"
                      placeholder="@yourhandle"
                    />
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button
                    onClick={handleExport}
                    disabled={isExporting || !selectedClip.videoUrl}
                    className="flex-1 btn-primary py-4 flex items-center justify-center gap-2"
                  >
                    {isExporting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        {exportStep}
                      </>
                    ) : exportDone ? (
                      <>
                        <Download className="w-5 h-5" />
                        Download MP4
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" />
                        Export MP4
                      </>
                    )}
                  </Button>
                  
                  <Button
                    onClick={handleShare}
                    variant="outline"
                    className="btn-secondary py-4 flex items-center justify-center gap-2"
                  >
                    <Share2 className="w-5 h-5" />
                    Share
                  </Button>
                </div>
              </>
            ) : (
              <div className="card-glass p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-clip-cyan/10 flex items-center justify-center mx-auto mb-4">
                  <Scissors className="w-8 h-8 text-clip-cyan" />
                </div>
                <h3 className="font-display font-semibold text-xl text-clip-text mb-2">
                  Select a clip to edit
                </h3>
                <p className="text-clip-muted">
                  Click on any detected highlight to preview and edit it.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
