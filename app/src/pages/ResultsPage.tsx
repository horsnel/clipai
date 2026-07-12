import { useState } from 'react';
import type { Page } from '../App';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Play, Pause, Download, Share2, Scissors,
  Type, Music, Image, Check, ChevronLeft, Smartphone,
  Loader2, AlertCircle, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { startRender, waitForRender } from '../services/api';
import type { DetectedClip, VideoFormat, RenderQuality } from '../types';

interface ResultsPageProps {
  user: { name: string; email: string; plan: 'free' | 'starter' | 'pro' | 'creator' } | null;
  onNavigate: (page: Page) => void;
  clips?: DetectedClip[];
}

// Fallback demo clips used when no real data is passed
const DEMO_CLIPS: DetectedClip[] = [
  { id: '1', thumbnail: '/gameplay-thumb-1.jpg', startTime: '02:34', endTime: '03:06', startSeconds: 154, endSeconds: 186, hypeScore: 96, duration: '0:32', caption: 'INSANE multi-kill 🔥', selected: true  },
  { id: '2', thumbnail: '/gameplay-thumb-2.jpg', startTime: '08:12', endTime: '08:57', startSeconds: 492, endSeconds: 537, hypeScore: 88, duration: '0:45', caption: 'Clutch 1v4 🎯',       selected: false },
  { id: '3', thumbnail: '/gameplay-thumb-3.jpg', startTime: '15:45', endTime: '16:13', startSeconds: 945, endSeconds: 973, hypeScore: 92, duration: '0:28', caption: 'Team wipe 💀',        selected: false },
];

// Quality gating by plan
const QUALITY_BY_PLAN: Record<string, RenderQuality[]> = {
  free:    ['480p'],
  starter: ['480p', '720p'],
  pro:     ['480p', '720p', '1080p'],
  creator: ['480p', '720p', '1080p', '4k'],
};

const QUALITY_CREDITS: Record<RenderQuality, number> = {
  '480p': 10, '720p': 20, '1080p': 50, '4k': 100,
};

export function ResultsPage({ user, onNavigate, clips: propClips }: ResultsPageProps) {
  const [clips, setClips]               = useState<DetectedClip[]>(propClips?.length ? propClips : DEMO_CLIPS);
  const [selectedClip, setSelectedClip] = useState<DetectedClip | null>((propClips?.length ? propClips : DEMO_CLIPS)[0]);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [format, setFormat]             = useState<VideoFormat>('tiktok');
  const [quality, setQuality]           = useState<RenderQuality>('720p');
  const [watermarkEnabled, setWatermarkEnabled]   = useState(true);
  const [watermarkText, setWatermarkText]         = useState('@' + (user?.name ?? 'gamer'));
  const [captionsEnabled, setCaptionsEnabled]     = useState(true);
  const [beatSyncEnabled, setBeatSyncEnabled]     = useState(user?.plan !== 'free');
  const [trimRange, setTrimRange]       = useState([0, 100]);
  const [isExporting, setIsExporting]   = useState(false);
  const [exportStep, setExportStep]     = useState('');
  const [exportEngine, setExportEngine] = useState<'json2video' | 'ffmpeg' | null>(null);
  const [exportDone, setExportDone]     = useState(false);
  const [downloadUrl, setDownloadUrl]   = useState<string | null>(null);
  const [exportError, setExportError]   = useState<string | null>(null);

  const plan = user?.plan ?? 'free';
  const allowedQualities = QUALITY_BY_PLAN[plan] ?? ['480p'];

  const getHypeBadge = (score: number) => {
    if (score >= 90) return <span className="hype-badge-gold">{score} HYPE</span>;
    if (score >= 70) return <span className="hype-badge-blue">{score} HYPE</span>;
    return <span className="hype-badge-gray">{score} HYPE</span>;
  };

  const handleClipSelect = (clip: DetectedClip) => {
    setSelectedClip(clip);
    setClips(clips.map((c) => ({ ...c, selected: c.id === clip.id })));
    setExportDone(false);
    setDownloadUrl(null);
    setExportError(null);
  };

  const handleExport = async () => {
    if (!selectedClip) return;

    // If already done, trigger download
    if (exportDone && downloadUrl) {
      window.open(downloadUrl, '_blank');
      return;
    }

    if (!allowedQualities.includes(quality)) {
      toast.error(`${quality} export requires a higher plan`);
      return;
    }

    setIsExporting(true);
    setExportDone(false);
    setExportError(null);
    setExportEngine(null);

    try {
      setExportStep('Queuing render job…');
      const { jobId } = await startRender({
        clipId:          selectedClip.id,
        startSeconds:    selectedClip.startSeconds,
        endSeconds:      selectedClip.endSeconds,
        format,
        quality,
        watermark:       watermarkEnabled ? watermarkText : null,
        captionsEnabled,
        beatSyncEnabled,
        watermarkText:   watermarkEnabled ? watermarkText : undefined,
      });

      const job = await waitForRender(jobId, (j) => {
        setExportStep(
          j.status === 'queued'    ? 'In queue…'                          :
          j.status === 'rendering' ? `Rendering… ${j.progress}%`          :
                                     j.status
        );
        if (j.engine) setExportEngine(j.engine);
      });

      if (job.status === 'error') throw new Error(job.error ?? 'Render failed');

      setDownloadUrl(job.downloadUrl ?? null);
      setExportDone(true);
      setExportStep('✅ Ready!');
      toast.success('Your clip is ready to download!');

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      setExportError(msg);
      toast.error(msg);
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = () => {
    const url = downloadUrl ?? `https://clipsai.pages.dev/c/${selectedClip?.id}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard!');
  };

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8 xl:px-12">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <button onClick={() => onNavigate('dashboard')}
              className="flex items-center gap-2 text-clip-muted hover:text-clip-text text-sm mb-2 transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back to Dashboard
            </button>
            <h1 className="font-display font-bold text-2xl sm:text-3xl text-clip-text">
              Detected <span className="gradient-text">Highlights</span>
            </h1>
          </div>
          <span className="text-clip-muted text-sm">{clips.length} clip{clips.length !== 1 ? 's' : ''} found</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Clip list */}
          <div className="lg:col-span-1 space-y-4">
            <h3 className="font-display font-semibold text-clip-text mb-4">Detected Clips</h3>
            {clips.map((clip) => (
              <div key={clip.id} onClick={() => handleClipSelect(clip)}
                className={`card-glass overflow-hidden cursor-pointer transition-all duration-300 ${
                  clip.selected ? 'border-clip-cyan/50 ring-1 ring-clip-cyan/30' : 'hover:border-white/[0.12]'
                }`}>
                <div className="relative aspect-video">
                  <img src={clip.thumbnail} alt={`Clip ${clip.id}`} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-clip-dark/80 via-transparent to-transparent" />
                  <div className="absolute top-2 left-2">{getHypeBadge(clip.hypeScore)}</div>
                  <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium">{clip.duration}</div>
                  {clip.selected && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-clip-cyan flex items-center justify-center">
                      <Check className="w-4 h-4 text-black" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-clip-muted text-sm font-mono">{clip.startTime} – {clip.endTime}</span>
                    <Play className="w-4 h-4 text-clip-muted" />
                  </div>
                  {clip.caption && (
                    <p className="text-clip-text text-xs mt-1 truncate">{clip.caption}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Editor */}
          <div className="lg:col-span-2 space-y-6">
            {selectedClip ? (
              <>
                {/* Preview */}
                <div className="card-glass overflow-hidden">
                  <div className="relative aspect-video bg-clip-surface">
                    <img src={selectedClip.thumbnail} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-clip-dark/60 via-transparent to-transparent" />
                    <button onClick={() => setIsPlaying(!isPlaying)}
                      className="absolute inset-0 flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-clip-cyan/90 flex items-center justify-center hover:scale-110 transition-transform">
                        {isPlaying ? <Pause className="w-7 h-7 text-black" /> : <Play className="w-7 h-7 text-black ml-1" />}
                      </div>
                    </button>
                    <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-clip-cyan" />
                      <span className="text-xs font-medium uppercase">{format}</span>
                    </div>
                    {selectedClip.caption && (
                      <div className="absolute bottom-12 left-0 right-0 text-center px-4">
                        <span className="bg-black/70 text-white text-sm px-3 py-1 rounded font-bold">{selectedClip.caption}</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-clip-muted text-xs">Trim</span>
                      <span className="text-clip-cyan text-xs font-mono">{selectedClip.startTime} – {selectedClip.endTime}</span>
                    </div>
                    <Slider defaultValue={[0, 100]} max={100} step={1} value={trimRange} onValueChange={setTrimRange} className="w-full" />
                    <div className="flex justify-between text-xs text-clip-muted mt-1">
                      <span>0:00</span><span>{selectedClip.duration}</span>
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Format */}
                  <div className="card-glass p-5">
                    <label className="flex items-center gap-2 text-sm font-medium text-clip-text mb-4">
                      <Smartphone className="w-4 h-4 text-clip-cyan" /> Format
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['tiktok', 'reels', 'shorts'] as VideoFormat[]).map((f) => (
                        <button key={f} onClick={() => setFormat(f)}
                          className={`px-3 py-2 rounded-lg text-xs font-medium uppercase transition-all ${
                            format === f ? 'bg-clip-cyan text-black' : 'bg-clip-surface text-clip-muted hover:text-clip-text border border-white/[0.06]'
                          }`}>
                          {f}
                        </button>
                      ))}
                    </div>

                    {/* Quality */}
                    <label className="flex items-center gap-2 text-sm font-medium text-clip-text mb-3 mt-5">
                      <Zap className="w-4 h-4 text-clip-cyan" /> Quality
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['480p', '720p', '1080p', '4k'] as RenderQuality[]).map((q) => {
                        const locked = !allowedQualities.includes(q);
                        return (
                          <button key={q} onClick={() => !locked && setQuality(q)}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                              quality === q && !locked ? 'bg-clip-cyan text-black' :
                              locked ? 'bg-clip-surface text-clip-muted opacity-40 cursor-not-allowed border border-white/[0.04]' :
                              'bg-clip-surface text-clip-muted hover:text-clip-text border border-white/[0.06]'
                            }`}>
                            {q.toUpperCase()}{locked ? ' 🔒' : ` (${QUALITY_CREDITS[q]}cr)`}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="card-glass p-5 space-y-4">
                    {[
                      { icon: Type,  label: 'Captions',  value: captionsEnabled,  set: setCaptionsEnabled  },
                      { icon: Music, label: 'Beat Sync',  value: beatSyncEnabled,  set: setBeatSyncEnabled,  locked: plan === 'free' },
                      { icon: Image, label: 'Watermark',  value: watermarkEnabled, set: setWatermarkEnabled },
                    ].map(({ icon: Icon, label, value, set, locked }) => (
                      <label key={label} className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm text-clip-text flex items-center gap-2">
                          <Icon className="w-4 h-4 text-clip-cyan" /> {label}{locked ? ' 🔒' : ''}
                        </span>
                        <button onClick={() => !locked && set(!value)}
                          className={`w-10 h-5 rounded-full transition-colors relative ${value && !locked ? 'bg-clip-cyan' : 'bg-clip-surface'} ${locked ? 'opacity-40 cursor-not-allowed' : ''}`}>
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-black transition-transform ${value && !locked ? 'left-5' : 'left-0.5'}`} />
                        </button>
                      </label>
                    ))}
                  </div>
                </div>

                {watermarkEnabled && (
                  <div className="card-glass p-5">
                    <label className="text-sm font-medium text-clip-text mb-2 block">Watermark Text</label>
                    <input type="text" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)}
                      className="input-dark w-full" placeholder="@yourhandle" />
                  </div>
                )}

                {/* Engine badge */}
                {exportEngine && (
                  <div className={`text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-2 ${
                    exportEngine === 'json2video' ? 'bg-clip-cyan/10 text-clip-cyan' : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    <Zap className="w-3 h-3" />
                    Rendered via {exportEngine === 'json2video' ? 'JSON2Video API' : 'FFmpeg (fallback)'}
                  </div>
                )}

                {exportError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-red-400 text-sm font-medium">Export Error</p>
                      <p className="text-red-300 text-xs mt-1">{exportError}</p>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-4">
                  <Button onClick={handleExport} disabled={isExporting}
                    className="flex-1 btn-primary py-4 flex items-center justify-center gap-2">
                    {isExporting ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> {exportStep}</>
                    ) : exportDone ? (
                      <><Download className="w-5 h-5" /> Download MP4</>
                    ) : (
                      <><Download className="w-5 h-5" /> Export {quality.toUpperCase()}</>
                    )}
                  </Button>
                  <Button onClick={handleShare} variant="outline"
                    className="btn-secondary py-4 flex items-center justify-center gap-2">
                    <Share2 className="w-5 h-5" /> Share
                  </Button>
                </div>
              </>
            ) : (
              <div className="card-glass p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-clip-cyan/10 flex items-center justify-center mx-auto mb-4">
                  <Scissors className="w-8 h-8 text-clip-cyan" />
                </div>
                <h3 className="font-display font-semibold text-xl text-clip-text mb-2">Select a clip to edit</h3>
                <p className="text-clip-muted">Click any detected highlight to preview and export it.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
