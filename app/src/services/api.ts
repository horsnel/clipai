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
  AudioTrendResponse,
  AuditChannelResponse,
  AuditInsightsResponse,
  ChannelAuditsResponse,
  CommentsResponse,
  CompareResponse,
  DetectedClip,
  ExportOptions,
  PlaylistResponse,
  RenderJob,
  SaveOnboardingResponse,
  ShadowResponse,
  TopicStealEntry,
  TrendingVideosResponse,
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

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
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

// ─── Trending Videos (Dashboard widget, public, 6h backend cache + 1h client cache) ───
// Backend caches the rendered video list for 6h globally (KV). We ALSO cache
// on the client (localStorage) for 1h so the dashboard renders instantly on
// repeat visits without showing a loading state every time. The cache is
// keyed by `game` so different games don't collide.
const TRENDING_VIDEOS_CLIENT_TTL_MS = 60 * 60 * 1000; // 1 hour
const TRENDING_VIDEOS_CACHE_PREFIX = 'clipai:tv:';

export async function getTrendingVideos(game?: string): Promise<TrendingVideosResponse> {
  const params = new URLSearchParams();
  if (game) params.set('game', game);
  const cacheKey = `${TRENDING_VIDEOS_CACHE_PREFIX}${(game || 'gaming').toLowerCase()}`;

  // 1. Try client cache first — instant render on repeat visits.
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw) as { data: TrendingVideosResponse; expiresAt: number };
      if (Date.now() < parsed.expiresAt) {
        return parsed.data;
      }
      // Expired — clear so we don't keep stale data if the network fails.
      localStorage.removeItem(cacheKey);
    }
  } catch {
    // localStorage may be unavailable (private mode, quota) — fall through to network.
  }

  // 2. Network fetch — hits the 6h backend KV cache.
  const data = await apiClient.get<TrendingVideosResponse>(`/trending-videos?${params.toString()}`);

  // 3. Persist to client cache (best-effort).
  try {
    localStorage.setItem(cacheKey, JSON.stringify({
      data,
      expiresAt: Date.now() + TRENDING_VIDEOS_CLIENT_TTL_MS,
    }));
  } catch {
    // Quota exceeded — clear any other cached trending entries and try once more.
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(TRENDING_VIDEOS_CACHE_PREFIX))
        .forEach(k => localStorage.removeItem(k));
      localStorage.setItem(cacheKey, JSON.stringify({
        data,
        expiresAt: Date.now() + TRENDING_VIDEOS_CLIENT_TTL_MS,
      }));
    } catch {}
  }

  return data;
}

// ─── Gaming Feed (Dashboard enrichment: news + dev tweets + reddit) ──────────
// Backend caches the aggregate feed for 2h globally (KV). We also cache on the
// client (localStorage) for 1h so the dashboard renders instantly on repeat
// visits. The cache is keyed by `game` so different games don't collide.
export interface GamingNewsItem {
  title: string;
  snippet: string;
  url: string;
  source: string;       // e.g. "ign.com"
  date: string;         // ISO date if available
}
export interface DevTweetItem {
  title: string;
  snippet: string;
  url: string;
  author: string;       // e.g. "@valorant"
  date: string;
}
export interface RedditPostItem {
  title: string;
  url: string;
  subreddit: string;    // e.g. "r/valorant"
  author: string;
  publishedAt: string;
}
export interface GamingFeedResponse {
  news: GamingNewsItem[];
  devTweets: DevTweetItem[];
  redditPosts: RedditPostItem[];
  game: string;
  generatedAt: string;
}

const GAMING_FEED_CLIENT_TTL_MS = 60 * 60 * 1000; // 1 hour
const GAMING_FEED_CACHE_PREFIX = 'clipai:gf:';

export async function getGamingFeed(game?: string): Promise<GamingFeedResponse> {
  const params = new URLSearchParams();
  if (game) params.set('game', game);
  const cacheKey = `${GAMING_FEED_CACHE_PREFIX}${(game || 'gaming').toLowerCase()}`;

  // 1. Try client cache first — instant render on repeat visits.
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw) as { data: GamingFeedResponse; expiresAt: number };
      if (Date.now() < parsed.expiresAt) {
        return parsed.data;
      }
      localStorage.removeItem(cacheKey);
    }
  } catch {
    // localStorage may be unavailable — fall through to network.
  }

  // 2. Network fetch — hits the 2h backend KV cache.
  const data = await apiClient.get<GamingFeedResponse>(`/gaming-feed?${params.toString()}`);

  // 3. Persist to client cache (best-effort).
  try {
    localStorage.setItem(cacheKey, JSON.stringify({
      data,
      expiresAt: Date.now() + GAMING_FEED_CLIENT_TTL_MS,
    }));
  } catch {
    // Quota exceeded — clear any other cached gaming-feed entries and try once more.
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(GAMING_FEED_CACHE_PREFIX))
        .forEach(k => localStorage.removeItem(k));
      localStorage.setItem(cacheKey, JSON.stringify({
        data,
        expiresAt: Date.now() + GAMING_FEED_CLIENT_TTL_MS,
      }));
    } catch {}
  }

  return data;
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

// ─── Onboarding persistence ──────────────────────────────────────────────────
// POST /api/settings/onboarding — persists the 4-step onboarding selections
// (primaryGame, platforms, goal, experience) to settings.prefs.onboarding.
// Fire-and-forget from OnboardingPage.finish(); falls back to localStorage.
export async function saveOnboarding(data: {
  primaryGame: string;
  platforms: string[];
  goal: string;
  experience: string;
}): Promise<SaveOnboardingResponse> {
  return apiClient.post<SaveOnboardingResponse>('/settings/onboarding', data);
}

// ─── Channel Audit (free audit flow) ─────────────────────────────────────────
// POST   /api/audit-channel   — runs audit for one URL, saves to user's prefs
// GET    /api/channel-audits  — returns all saved audits with full data
// DELETE /api/channel-audits  — remove one audit by URL
export async function auditChannel(url: string, platform?: string): Promise<AuditChannelResponse> {
  return apiClient.post<AuditChannelResponse>('/audit-channel', platform ? { url, platform } : { url });
}

export async function getChannelAudits(): Promise<ChannelAuditsResponse> {
  return apiClient.get<ChannelAuditsResponse>('/channel-audits');
}

export async function deleteChannelAudit(url: string): Promise<{ success: boolean }> {
  return apiClient.delete<{ success: boolean }>(`/channel-audits?url=${encodeURIComponent(url)}`);
}

// ─── Audit Insights (extensive AI review) ────────────────────────────────────
// POST /api/audit-insights — generates an extensive AI review of an audited
// channel: best/worst performing videos, SWOT, recommendations, growth
// opportunities, content gaps, etc. Reuses the cached audit data so it's free
// (no credit charge). Insights are cached for 2h on the server.
export async function getAuditInsights(
  url: string,
  platform?: string,
  force = false,
): Promise<AuditInsightsResponse> {
  return apiClient.post<AuditInsightsResponse>('/audit-insights', {
    url,
    platform,
    force,
  });
}

// ─── Daily Insight (AI brief synthesised from all tools) ─────────────────────
// GET /api/daily-insight — returns today's AI-generated brief combining signals
// from the user's recent audits, analyses, trending topics, and profile.
// Cached for 20h server-side (per user per day). Free — no credit charge.
// Falls back to a deterministic brief if the LLM is unavailable.
export interface DailyInsightItem {
  title: string;
  body: string;
  priority: 'high' | 'medium' | 'low';
  action: string;
}
export interface DailyInsightResponse {
  date: string;            // YYYY-MM-DD
  headline: string;
  focusArea: string;
  insights: DailyInsightItem[];
  generatedAt: string;
  cached?: boolean;
  fallback?: boolean;
}
export async function getDailyInsight(): Promise<DailyInsightResponse> {
  return apiClient.get<DailyInsightResponse>('/daily-insight');
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

export async function getTopicSteal(
  game?: string,
  limit = 20,
  days: 7 | 14 | 30 | 90 = 14,
): Promise<{ topics: TopicStealEntry[]; days: number; generated_at: string }> {
  const params = new URLSearchParams();
  if (game) params.set('game', game);
  params.set('limit', String(limit));
  params.set('days', String(days));
  return apiClient.get<{ topics: TopicStealEntry[]; days: number; generated_at: string }>(`/topic-steal?${params.toString()}`);
}

// ─── Phase 2: Competitor Lab — POST /api/analyse/compare (10 credits, pro/creator)
export async function compareVideos(urlA: string, urlB: string): Promise<CompareResponse> {
  return apiClient.post<CompareResponse>('/analyse/compare', { urlA, urlB });
}

// ─── Phase 3: Playlist Architect — POST /api/playlist/sequence (5 credits, pro/creator)
export async function sequencePlaylist(urls: string[]): Promise<PlaylistResponse> {
  return apiClient.post<PlaylistResponse>('/playlist/sequence', { urls });
}

// ─── Phase 4: Audio Trend Sync — POST /api/analyse/audio-trend (3 credits)
export async function analyseAudioTrend(youtubeUrl: string): Promise<AudioTrendResponse> {
  return apiClient.post<AudioTrendResponse>('/analyse/audio-trend', { youtubeUrl });
}

// ─── Phase 4: Predictive Comments Lite — POST /api/analyse/comments (2 credits)
export async function analyseComments(youtubeUrl: string): Promise<CommentsResponse> {
  return apiClient.post<CommentsResponse>('/analyse/comments', { youtubeUrl });
}

// ─── Phase 4: Shadow Editor (faceless script) — POST /api/analyse/shadow (4 credits)
export async function analyseShadow(youtubeUrl: string): Promise<ShadowResponse> {
  return apiClient.post<ShadowResponse>('/analyse/shadow', { youtubeUrl });
}
