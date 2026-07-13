// ─── User & Auth ─────────────────────────────────────────────────────────────

export type Plan = 'free' | 'starter' | 'pro' | 'creator';

export interface User {
  id: string;
  name: string;
  email: string;
  plan: Plan;
  credits: number;
  clipsUsed: number;
  referralCode: string;
}

// ─── Video Processing ─────────────────────────────────────────────────────────

export type ProcessingStatus =
  | 'idle'
  | 'uploading'
  | 'scanning'
  | 'captioning'
  | 'rendering'
  | 'done'
  | 'error';

export type VideoFormat = 'tiktok' | 'reels' | 'shorts';
export type RenderQuality = '480p' | '720p' | '1080p' | '4k';

export interface AnalysisOptions {
  game: string;
  clipCount: number;
  captionsEnabled: boolean;
  beatSyncEnabled: boolean;
  youtubeUrl?: string;
}

export interface DetectedClip {
  id: string;
  thumbnail: string;
  startTime: string;   // "MM:SS"
  endTime: string;     // "MM:SS"
  startSeconds: number;
  endSeconds: number;
  hypeScore: number;
  duration: string;    // "M:SS"
  caption?: string;
  selected: boolean;
}

export interface ExportOptions {
  clipId: string;
  startSeconds: number;
  endSeconds: number;
  format: VideoFormat;
  quality: RenderQuality;
  watermark: string | null;
  captionsEnabled: boolean;
  beatSyncEnabled: boolean;
  watermarkText?: string;
  // v2: trim slider offsets within the clip
  trimStart?: number;
  trimEnd?: number;
  game?: string;
}

export interface RenderJob {
  jobId: string;
  status: 'queued' | 'rendering' | 'done' | 'error';
  progress: number;
  downloadUrl?: string;
  engine: 'json2video' | 'ffmpeg';
  error?: string;
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface AnalysisResult {
  success: boolean;
  clips: DetectedClip[];
  videoId: string;
  uploadUrl: string;
  error?: string;
}

export interface UploadResult {
  success: boolean;
  videoId: string;
  uploadUrl: string;
  error?: string;
}

// ─── Paystack ────────────────────────────────────────────────────────────────

export interface PaystackPlan {
  id: 'starter' | 'pro' | 'creator';
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  credits: number;
  paystackMonthlyLink: string;
  paystackAnnualLink: string;
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  avatar: string;
  plan: Plan;
  game: string;
  hypeScore: number;
  clipCount: number;
  isCurrentUser?: boolean;
}
