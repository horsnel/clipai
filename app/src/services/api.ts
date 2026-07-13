/**
 * api.ts  –  ClipAI frontend ↔ Railway worker bridge
 *
 * v2 changes:
 *  - Class-based client with settable Authorization token (Supabase JWT)
 *  - FormData upload now sends auth header (was missing)
 *  - New endpoints: /auth/me, /leaderboard, /rank/me, /referrals/*,
 *                   /payment/init, /forge/vote, /forge/top-captions,
 *                   /clipbot/history, /settings/profile, /settings/notifications,
 *                   /clips
 */

import type {
  AnalysisOptions,
  AnalysisResult,
  DetectedClip,
  ExportOptions,
  RenderJob,
  UploadResult,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

// ─── Client ─────────────────────────────────────────────────────────────────
class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) { this.baseUrl = baseUrl; }

  setToken(token: string | null) { this.token = token; }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const isFormData = init.body instanceof FormData;
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> || {}),
    };
    if (!isFormData) headers['Content-Type'] = 'application/json';
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Could not reach server: ${msg}`);
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      const e = new Error(err.error ?? err.message ?? `HTTP ${res.status}`) as Error & { status?: number; body?: any };
      e.status = res.status; e.body = err;
      throw e;
    }
    return res.json();
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }
  post<T>(path: string, body?: unknown): Promise<T> {
    const init: RequestInit = body instanceof FormData
      ? { method: 'POST', body }
      : { method: 'POST', body: body ? JSON.stringify(body) : undefined };
    return this.request<T>(path, init);
  }
  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH', body: body ? JSON.stringify(body) : undefined,
    });
  }
  // Helper to upload with progress + auth header
  uploadWithProgress(
    path: string, formData: FormData,
    onProgress?: (pct: number) => void,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.baseUrl}${path}`);
      if (this.token) xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try { reject(JSON.parse(xhr.responseText)); }
          catch { reject(new Error(`Upload failed: ${xhr.statusText}`)); }
        }
      };
      xhr.onerror = () => reject(new Error('Upload network error'));
      xhr.send(formData);
    });
  }
}

export const apiClient = new ApiClient(API_BASE);

// ─── Upload ─────────────────────────────────────────────────────────────────
export async function uploadVideo(file: File, onProgress?: (pct: number) => void): Promise<UploadResult> {
  const fd = new FormData();
  fd.append('video', file);
  return apiClient.uploadWithProgress('/upload', fd, onProgress);
}

// ─── Analyse ────────────────────────────────────────────────────────────────
export async function analyseVideo(videoId: string, opts: AnalysisOptions): Promise<AnalysisResult> {
  return apiClient.post<AnalysisResult>('/analyse', { videoId, ...opts });
}

export async function analyseYouTube(youtubeUrl: string, opts: AnalysisOptions): Promise<AnalysisResult> {
  return apiClient.post<AnalysisResult>('/analyse/youtube', { youtubeUrl, ...opts });
}

// ─── Captions ───────────────────────────────────────────────────────────────
export async function generateCaptions(clips: DetectedClip[], game: string): Promise<DetectedClip[]> {
  return apiClient.post<DetectedClip[]>('/captions', { clips, game });
}

// ─── Render ─────────────────────────────────────────────────────────────────
export async function startRender(opts: ExportOptions): Promise<{ jobId: string }> {
  return apiClient.post<{ jobId: string }>('/render', opts);
}

export async function getRenderStatus(jobId: string): Promise<RenderJob> {
  return apiClient.get<RenderJob>(`/render/status/${jobId}`);
}

export async function waitForRender(
  jobId: string, onProgress?: (job: RenderJob) => void,
  intervalMs = 2000, timeoutMs = 300_000,
): Promise<RenderJob> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await getRenderStatus(jobId);
    onProgress?.(job);
    if (job.status === 'done' || job.status === 'error') return job;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('Render timed out after 5 minutes');
}

// ─── Clips (list own) ───────────────────────────────────────────────────────
export async function listClips(): Promise<{ clips: any[] }> {
  return apiClient.get<{ clips: any[] }>('/clips');
}

// ─── Leaderboard ────────────────────────────────────────────────────────────
export async function getLeaderboard(type: 'alltime' | 'weekly' = 'alltime') {
  return apiClient.get<{ players: any[]; currentUser: any | null }>(`/leaderboard?type=${type}`);
}

// ─── Rank ───────────────────────────────────────────────────────────────────
export async function getMyRank() {
  return apiClient.get<{
    xp: number; weeklyXp: number;
    tier: { name: string; min_xp: number; color: string };
    nextTier: { name: string; min_xp: number; color: string } | null;
    globalRank: number; streakDays: number; clipsAnalysed: number;
  }>('/rank/me');
}

// ─── Referrals ──────────────────────────────────────────────────────────────
export async function getReferralStats() {
  return apiClient.get<{ total: number; creditsEarned: number; referred: any[] }>('/referrals/stats');
}

export async function applyReferralCode(code: string) {
  return apiClient.post<{ valid: boolean; ownerName?: string; discountPercent?: number; error?: string }>(
    '/referrals/apply', { code },
  );
}

// ─── Paystack ───────────────────────────────────────────────────────────────
export async function initPayment(plan: string, interval: 'monthly' | 'annual' = 'monthly', referralCode?: string) {
  return apiClient.post<{ authorization_url: string; reference: string; amount_kobo: number; plan: string }>(
    '/payment/init', { plan, interval, referralCode },
  );
}

export async function verifyPayment(reference: string) {
  return apiClient.get<{ success: boolean; plan: string; reference: string }>(
    `/payment/verify?reference=${reference}`,
  );
}

// ─── Forge voting ───────────────────────────────────────────────────────────
export async function voteOnCaption(caption: string, vote: 1 | -1, game?: string, vibe?: string) {
  return apiClient.post<{ success: boolean }>('/forge/vote', { caption, vote, game, vibe });
}

export async function getTopCaptions() {
  return apiClient.get<{ captions: any[] }>('/forge/top-captions');
}

// ─── ClipBot history ────────────────────────────────────────────────────────
export async function getClipBotHistory() {
  return apiClient.get<{ history: Array<{ role: string; content: string; created_at: string }> }>(
    '/clipbot/history',
  );
}

// ─── Settings ───────────────────────────────────────────────────────────────
export async function updateProfile(fields: { full_name?: string; avatar_url?: string }) {
  return apiClient.patch<{ success: boolean }>('/settings/profile', fields);
}

export async function updateNotifications(prefs: {
  email_updates?: boolean; product_news?: boolean;
  clip_ready?: boolean; weekly_digest?: boolean;
}) {
  return apiClient.patch<{ success: boolean; prefs: any }>('/settings/notifications', prefs);
}

// ─── Video Editor Waitlist ─────────────────────────────────────────────────
export async function joinWaitlist(email: string, gameInterest?: string, source = 'upload_page') {
  return apiClient.post<{
    success: boolean;
    position: number;
    creditsAwarded: number;
    message: string;
  }>('/waitlist/join', { email, game_interest: gameInterest, source });
}
