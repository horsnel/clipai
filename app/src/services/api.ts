/**
 * api.ts  -  ClipAI frontend <-> worker bridge
 *
 * v2 changes:
 *  - Class-based client with settable Authorization token (Supabase JWT)
 *  - FormData upload now sends auth header (was missing)
 *  - New endpoints: /auth/me, /leaderboard, /rank/me, /referrals/*,
 *                   /payment/init, /forge/vote, /forge/top-captions,
 *                   /clipbot/history, /settings/profile, /settings/notifications,
 *                   /clips
 *  - Credit gating: every tool response may include `credits_remaining`.
 *    On 402 with `insufficient_credits` or `plan_required`, a custom event is
 *    dispatched so the UpgradeModal can pop up automatically. The AuthContext
 *    listens to the same event to update its local credit balance.
 */

import type {
  AnalysisOptions,
  AnalysisResult,
  AnalyseYouTubeResponse,
  AnalysisSummary,
  DetectedClip,
  ExportOptions,
  RenderJob,
  TopicStealEntry,
  UploadResult,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// ─── Credit / upgrade events ─────────────────────────────────────────────────
// These are window-level CustomEvents so the apiClient (which is framework-
// agnostic) can communicate with the React side without circular imports.

export interface CreditUpdateDetail {
  credits: number;
  source?: string; // e.g. 'forge_titles' - for analytics
}

export interface UpgradeRequiredDetail {
  reason: 'no_credits' | 'plan_required';
  required?: number;
  current?: number;
  requiredPlan?: string;
  tool?: string;
}

/** Dispatched whenever a successful API response includes `credits_remaining`. */
export const CREDIT_UPDATE_EVENT = 'clipai:credit-update';
/** Dispatched whenever the API returns 402 with insufficient_credits or plan_required. */
export const UPGRADE_REQUIRED_EVENT = 'clipai:upgrade-required';

function dispatchCreditUpdate(credits: number, source?: string) {
  window.dispatchEvent(new CustomEvent<CreditUpdateDetail>(CREDIT_UPDATE_EVENT, {
    detail: { credits, source },
  }));
}

function dispatchUpgradeRequired(detail: UpgradeRequiredDetail) {
  window.dispatchEvent(new CustomEvent<UpgradeRequiredDetail>(UPGRADE_REQUIRED_EVENT, {
    detail,
  }));
}

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
      // ─── Credit / plan gate ─────────────────────────────────────────────
      // 402 means the user can't use this tool right now. We dispatch an event
      // so the global UpgradeModal pops up. The thrown error still carries
      // `.status` and `.body` for callers that want to handle it themselves.
      if (res.status === 402) {
        if (err.insufficient_credits) {
          dispatchUpgradeRequired({
            reason: 'no_credits',
            required: err.required,
            current: err.current,
            tool: err.tool,
          });
        } else if (err.plan_required || err.required_plan) {
          dispatchUpgradeRequired({
            reason: 'plan_required',
            requiredPlan: err.required_plan,
            tool: err.tool,
          });
        } else if (err.upgrade_required) {
          // Legacy ClipBot daily-limit response
          dispatchUpgradeRequired({
            reason: 'plan_required',
            requiredPlan: 'pro',
            tool: 'ClipBot',
          });
        }
      }
      const e = new Error(err.error ?? err.message ?? `HTTP ${res.status}`) as Error & {
        status?: number; body?: any;
      };
      e.status = res.status; e.body = err;
      throw e;
    }

    const data = await res.json();
    // ─── Auto-sync credits ──────────────────────────────────────────────────
    // If the response includes `credits_remaining`, dispatch an event so the
    // AuthContext can update its local user state (Navbar chip + Dashboard card).
    if (data && typeof data.credits_remaining === 'number') {
      dispatchCreditUpdate(data.credits_remaining, path);
    }
    return data as T;
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
          try {
            const data = JSON.parse(xhr.responseText);
            if (data && typeof data.credits_remaining === 'number') {
              dispatchCreditUpdate(data.credits_remaining, path);
            }
            resolve(data);
          } catch {
            resolve(undefined);
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            if (xhr.status === 402) {
              if (err.insufficient_credits) {
                dispatchUpgradeRequired({
                  reason: 'no_credits',
                  required: err.required,
                  current: err.current,
                });
              } else if (err.plan_required || err.required_plan) {
                dispatchUpgradeRequired({
                  reason: 'plan_required',
                  requiredPlan: err.required_plan,
                });
              }
            }
            reject(err);
          } catch {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
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

// NOTE: analyseYouTube() is defined further below (Phase 1 unified analysis pipeline).
// The old stub that posted to /analyse/youtube has been removed.

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

// ─── Phase 1: Unified Viral Analysis (YouTube URL → 14 outputs) ──────────────
// POST /api/analyse/youtube — 5 credits, returns full analysis JSON
// GET  /api/analyses        — list user's past analyses
// GET  /api/analyses/:id    — fetch one saved analysis
// GET  /api/topic-steal     — anonymized trending topics dashboard

export async function analyseYouTube(
  youtubeUrl: string,
  game?: string,
): Promise<AnalyseYouTubeResponse> {
  return apiClient.post<AnalyseYouTubeResponse>('/analyse/youtube', { youtubeUrl, game });
}

export async function listAnalyses(limit = 20, offset = 0): Promise<{ analyses: AnalysisSummary[]; count: number }> {
  return apiClient.get<{ analyses: AnalysisSummary[]; count: number }>(
    `/analyses?limit=${limit}&offset=${offset}`,
  );
}

export async function getAnalysis(id: string): Promise<{ analysis: AnalysisSummary & Record<string, unknown> }> {
  return apiClient.get<{ analysis: AnalysisSummary & Record<string, unknown> }>(`/analyses/${id}`);
}

export async function getTopicSteal(game?: string, limit = 20): Promise<{ topics: TopicStealEntry[]; generated_at: string }> {
  const qs = game ? `?game=${encodeURIComponent(game)}&limit=${limit}` : `?limit=${limit}`;
  return apiClient.get<{ topics: TopicStealEntry[]; generated_at: string }>(`/topic-steal${qs}`);
}
