/**
 * ColorReportSection.tsx — Dominant-color analysis for a channel's recent videos.
 *
 * What it does:
 *   1. Loads each video thumbnail into an offscreen <canvas> (with crossOrigin='anonymous')
 *   2. Reads the pixel data and runs a simple color-quantization (bucketing by 32-step RGB)
 *   3. Picks the top 3 dominant colors per video
 *   4. Aggregates across all videos → channel palette
 *   5. Correlates each color bucket with average view count → "best performing colors"
 *
 * Output:
 *   - Channel palette (top 6 colors with usage %)
 *   - Best-performing color (highest avg views)
 *   - Per-video swatches (top 3 colors each)
 *   - A short recommendation: "Your videos with RED-dominant thumbnails get 3.2× more views"
 *
 * Notes:
 *   - YouTube thumbnails (i.ytimg.com) support CORS, so canvas pixel reads work.
 *   - TikTok/IG/X thumbnails are often empty or blocked — we skip those gracefully.
 *   - Analysis runs client-side (no server cost), cached in localStorage for 1h.
 */
import { useEffect, useState, useRef } from 'react';
import { Palette, TrendingUp, Loader2 } from 'lucide-react';
import type { ChannelAudit } from '../types';

interface ColorReportSectionProps {
  audit: ChannelAudit;
}

interface VideoColors {
  videoId: string;
  title: string;
  viewCount: number;
  thumbnail: string;
  colors: string[]; // top 3 hex colors, e.g. ["#ff0000", "#00ff00", "#0000ff"]
}

interface PaletteColor {
  hex: string;
  count: number;        // how many videos use this color
  avgViews: number;     // average views of videos using this color
  pct: number;          // % of videos using this color
}

interface ColorReport {
  palette: PaletteColor[];      // sorted by count desc, top 6
  bestColor: PaletteColor | null; // highest avgViews with count >= 2
  videos: VideoColors[];
  generatedAt: string;
}

const CACHE_PREFIX = 'clipai_color_report_';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

function loadCached(auditUrl: string): ColorReport | null {
  try {
    const key = CACHE_PREFIX + auditUrl.slice(-40);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - new Date(parsed.generatedAt).getTime() > CACHE_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

function saveCached(auditUrl: string, report: ColorReport): void {
  try {
    const key = CACHE_PREFIX + auditUrl.slice(-40);
    localStorage.setItem(key, JSON.stringify(report));
  } catch {}
}

// ─── Color extraction ─────────────────────────────────────────────────────────

/** Bucket RGB to a 32-step quantized value to group similar colors. */
function bucketChannel(v: number): number {
  return Math.floor(v / 32) * 32 + 16; // center of bucket
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  );
}

/** Extract top N dominant colors from an image URL via canvas pixel sampling. */
async function extractColors(imgUrl: string, topN = 3): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        // Downscale to 32×18 for fast sampling (aspect 16:9)
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 18;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve([]); return; }
        ctx.drawImage(img, 0, 0, 32, 18);
        const data = ctx.getImageData(0, 0, 32, 18).data;

        // Bucket pixels by 32-step RGB
        const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 128) continue; // skip transparent
          const r = data[i], g = data[i + 1], b = data[i + 2];
          // Skip near-black and near-white (background noise)
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          if (max < 25 || min > 230) continue;
          // Skip low-saturation (gray) pixels — we want actual colors
          if (max - min < 25) continue;

          const br = bucketChannel(r), bg = bucketChannel(g), bb = bucketChannel(b);
          const key = `${br},${bg},${bb}`;
          const existing = buckets.get(key);
          if (existing) {
            existing.count++;
            existing.r += r;
            existing.g += g;
            existing.b += b;
          } else {
            buckets.set(key, { count: 1, r, g, b });
          }
        }

        // Sort buckets by count, merge nearby ones, pick top N
        const sorted = [...buckets.values()]
          .map(b => ({
            count: b.count,
            rgb: [Math.round(b.r / b.count), Math.round(b.g / b.count), Math.round(b.b / b.count)] as [number, number, number],
          }))
          .sort((a, b) => b.count - a.count);

        // Deduplicate: skip colors too close to an already-picked one
        const picked: { count: number; rgb: [number, number, number] }[] = [];
        for (const s of sorted) {
          if (picked.every(p => colorDistance(p.rgb, s.rgb) > 60)) {
            picked.push(s);
          }
          if (picked.length >= topN) break;
        }

        resolve(picked.map(p => rgbToHex(p.rgb[0], p.rgb[1], p.rgb[2])));
      } catch {
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = imgUrl;
    // Timeout safety — if image takes >8s, give up
    setTimeout(() => resolve([]), 8000);
  });
}

/** Main: build the full color report for an audit's recent videos. */
async function buildColorReport(audit: ChannelAudit): Promise<ColorReport> {
  const videos = (audit.recentVideos || [])
    .filter(v => v.thumbnail && v.viewCount !== undefined)
    .slice(0, 12); // cap at 12 for performance

  const videoColors: VideoColors[] = [];
  // Process in parallel batches of 4 to avoid hammering
  for (let i = 0; i < videos.length; i += 4) {
    const batch = videos.slice(i, i + 4);
    const results = await Promise.all(
      batch.map(async v => {
        const colors = await extractColors(v.thumbnail, 3);
        return {
          videoId: v.id,
          title: v.title,
          viewCount: v.viewCount || 0,
          thumbnail: v.thumbnail,
          colors,
        } as VideoColors;
      }),
    );
    videoColors.push(...results.filter(vc => vc.colors.length > 0));
  }

  // Aggregate: for each unique color bucket (by hue family), count videos + avg views
  const colorMap = new Map<string, { hex: string; count: number; totalViews: number }>();
  for (const vc of videoColors) {
    for (const hex of vc.colors) {
      // Normalize to a hue family by quantizing to 48-step
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const nr = Math.round(r / 48) * 48;
      const ng = Math.round(g / 48) * 48;
      const nb = Math.round(b / 48) * 48;
      const normHex = rgbToHex(nr, ng, nb);
      const existing = colorMap.get(normHex);
      if (existing) {
        existing.count++;
        existing.totalViews += vc.viewCount;
      } else {
        colorMap.set(normHex, { hex: normHex, count: 1, totalViews: vc.viewCount });
      }
    }
  }

  const totalVideos = videoColors.length || 1;
  const palette: PaletteColor[] = [...colorMap.values()]
    .map(c => ({
      hex: c.hex,
      count: c.count,
      avgViews: Math.round(c.totalViews / c.count),
      pct: Math.round((c.count / totalVideos) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Best performing color: highest avgViews, must appear in >=2 videos
  const bestColor = [...palette]
    .filter(p => p.count >= 2)
    .sort((a, b) => b.avgViews - a.avgViews)[0] || null;

  return {
    palette,
    bestColor,
    videos: videoColors,
    generatedAt: new Date().toISOString(),
  };
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

/** Rough color family name from hex (red/orange/yellow/green/cyan/blue/purple/pink). */
function colorFamily(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 30) return 'neutral';
  if (r >= 200 && g < 150 && b < 150) return 'red';
  if (r >= 200 && g >= 150 && b < 100) return 'orange';
  if (r >= 200 && g >= 180 && b < 100) return 'yellow';
  if (g >= 180 && r < 180 && b < 150) return 'green';
  if (g >= 150 && b >= 150 && r < 150) return 'cyan';
  if (b >= 180 && r < 150) return 'blue';
  if (r >= 150 && b >= 150 && g < 150) return 'purple';
  if (r >= 200 && b >= 150 && g < 150) return 'pink';
  return 'mixed';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ColorReportSection({ audit }: ColorReportSectionProps) {
  const [report, setReport] = useState<ColorReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const videosWithThumbs = (audit.recentVideos || []).filter(v => v.thumbnail);
    if (videosWithThumbs.length === 0) {
      setLoading(false);
      setError('No thumbnails available for color analysis.');
      return;
    }

    // Check cache first
    const cached = loadCached(audit.url);
    if (cached) {
      setReport(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    buildColorReport(audit)
      .then(r => {
        if (!mountedRef.current) return;
        if (r.videos.length === 0) {
          setError('Could not extract colors from thumbnails (CORS or load failure).');
        } else {
          setReport(r);
          saveCached(audit.url, r);
        }
      })
      .catch(e => {
        if (!mountedRef.current) return;
        setError(e?.message || 'Color analysis failed.');
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });

    return () => { mountedRef.current = false; };
  }, [audit.url]);

  if (loading) {
    return (
      <div className="mt-8 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] flex items-center gap-3">
        <Loader2 className="w-4 h-4 text-clip-cyan animate-spin flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-clip-text">Analyzing thumbnail colors…</p>
          <p className="text-[10px] text-clip-muted">Sampling dominant colors from your recent {audit.recentVideos?.length || 0} videos.</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="mt-8 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-2 mb-1">
          <Palette className="w-4 h-4 text-clip-muted" />
          <p className="text-sm font-medium text-clip-text">Color report</p>
        </div>
        <p className="text-xs text-clip-muted">{error || 'No color data available.'}</p>
      </div>
    );
  }

  const overallAvg = report.videos.length > 0
    ? Math.round(report.videos.reduce((s, v) => s + v.viewCount, 0) / report.videos.length)
    : 0;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-clip-cyan" />
          <h3 className="font-display font-semibold text-sm text-clip-text">
            Thumbnail Color Report
          </h3>
        </div>
        <span className="text-[10px] text-clip-muted uppercase tracking-wider">
          {report.videos.length} videos analyzed
        </span>
      </div>

      {/* Best-performing color callout */}
      {report.bestColor && overallAvg > 0 && (
        <div className="mb-4 p-4 rounded-xl border border-clip-cyan/30 bg-clip-cyan/[0.04] flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex-shrink-0 border border-white/20"
            style={{ backgroundColor: report.bestColor.hex }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <TrendingUp className="w-3.5 h-3.5 text-clip-cyan" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-clip-cyan">
                Best performing color
              </span>
            </div>
            <p className="text-sm text-clip-text leading-snug">
              Videos with <span className="font-bold" style={{ color: report.bestColor.hex }}>
                {colorFamily(report.bestColor.hex)}
              </span>-dominant thumbnails average{' '}
              <span className="font-bold text-clip-text">
                {formatCount(report.bestColor.avgViews)}
              </span>{' '}
              views —{' '}
              <span className="font-bold text-green-400">
                {((report.bestColor.avgViews / overallAvg - 1) * 100).toFixed(0)}%
              </span>{' '}
              above your channel average.
            </p>
          </div>
        </div>
      )}

      {/* Channel palette */}
      <div className="mb-4 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <p className="text-[10px] uppercase tracking-wider text-clip-muted font-bold mb-3">
          Your channel palette
        </p>
        <div className="flex items-end gap-2 h-20">
          {report.palette.map((c, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div
                className="w-full rounded-md border border-white/10"
                style={{
                  backgroundColor: c.hex,
                  height: `${Math.max(20, c.pct * 0.6)}px`,
                }}
                title={`${c.hex} · ${c.pct}% of videos · avg ${formatCount(c.avgViews)} views`}
              />
              <span className="text-[8px] text-clip-muted tabular-nums truncate w-full text-center">
                {c.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-video swatches */}
      <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <p className="text-[10px] uppercase tracking-wider text-clip-muted font-bold mb-3">
          Per-video dominant colors
        </p>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {report.videos
            .slice()
            .sort((a, b) => b.viewCount - a.viewCount)
            .map(vc => (
              <div key={vc.videoId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.025] transition-colors">
                <img
                  src={vc.thumbnail}
                  alt=""
                  loading="lazy"
                  className="w-16 h-9 rounded object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-clip-text truncate leading-snug">{vc.title}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {vc.colors.map((hex, i) => (
                      <div
                        key={i}
                        className="w-4 h-4 rounded border border-white/15"
                        style={{ backgroundColor: hex }}
                        title={hex}
                      />
                    ))}
                    <span className="text-[9px] text-clip-muted ml-1 tabular-nums">
                      {formatCount(vc.viewCount)} views
                    </span>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}
