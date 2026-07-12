/**
 * api.ts  –  ClipAI frontend ↔ Railway worker bridge
 *
 * All calls go through VITE_API_URL (Railway worker base URL).
 * Falls back gracefully when the env var is absent (dev mode).
 */

import type {
  AnalysisOptions,
  AnalysisResult,
  DetectedClip,
  ExportOptions,
  RenderJob,
  UploadResult,
} from '../types';

// ─── Config ──────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

// ─── Helper ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `API error ${res.status}`);
  }
  return res.json();
}

// ─── Upload ───────────────────────────────────────────────────────────────────

/**
 * Upload a local video file to R2 via the Railway worker.
 * Returns a videoId used for all subsequent calls.
 */
export async function uploadVideo(
  file: File,
  onProgress?: (pct: number) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('video', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.send(formData);
  });
}

// ─── Analyse (Gemini) ─────────────────────────────────────────────────────────

/**
 * Ask Gemini 2.5 Flash to scan the uploaded video and return hype moments.
 */
export async function analyseVideo(
  videoId: string,
  opts: AnalysisOptions
): Promise<AnalysisResult> {
  return apiFetch<AnalysisResult>('/analyse', {
    method: 'POST',
    body: JSON.stringify({ videoId, ...opts }),
  });
}

/**
 * Analyse a YouTube URL directly (worker fetches via yt-dlp).
 */
export async function analyseYouTube(
  youtubeUrl: string,
  opts: AnalysisOptions
): Promise<AnalysisResult> {
  return apiFetch<AnalysisResult>('/analyse/youtube', {
    method: 'POST',
    body: JSON.stringify({ youtubeUrl, ...opts }),
  });
}

// ─── Captions (Groq) ──────────────────────────────────────────────────────────

/**
 * Generate viral captions for each detected clip via Groq Llama 3.3 70B.
 */
export async function generateCaptions(
  clips: DetectedClip[],
  game: string
): Promise<DetectedClip[]> {
  return apiFetch<DetectedClip[]>('/captions', {
    method: 'POST',
    body: JSON.stringify({ clips, game }),
  });
}

// ─── Render (JSON2Video primary, FFmpeg fallback) ─────────────────────────────

/**
 * Kick off a render job.  Worker tries JSON2Video first, falls back to FFmpeg.
 * Returns a jobId — poll /render/status/:jobId until done.
 */
export async function startRender(opts: ExportOptions): Promise<{ jobId: string }> {
  return apiFetch<{ jobId: string }>('/render', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

/**
 * Poll render job status.
 */
export async function getRenderStatus(jobId: string): Promise<RenderJob> {
  return apiFetch<RenderJob>(`/render/status/${jobId}`);
}

/**
 * Convenience helper: poll until done or error.
 */
export async function waitForRender(
  jobId: string,
  onProgress?: (job: RenderJob) => void,
  intervalMs = 2000,
  timeoutMs = 300_000
): Promise<RenderJob> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await getRenderStatus(jobId);
    onProgress?.(job);
    if (job.status === 'done' || job.status === 'error') return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Render timed out after 5 minutes');
}

// ─── Paystack webhook verify (optional client-side check) ────────────────────

export async function verifyPayment(reference: string): Promise<{ success: boolean; plan: string }> {
  return apiFetch(`/payment/verify?reference=${reference}`);
}
