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

// ─── Phase 1: Unified Viral Analysis (YouTube URL → 14 outputs as one JSON) ──

export interface SentimentPoint {
  t: number;
  emotion: 'excitement' | 'confusion' | 'relief' | 'tension' | 'joy' | 'anger' | 'fear' | 'surprise' | string;
  intensity: number; // 0.0–1.0
}

export interface GoldilocksMap {
  trim: { start: number; end: number; reason: string }[];
  peak: { t: number; label: string }[];
}

export interface HiddenGem {
  angle: string;
  title: string;
  why_viral: string;
  clip_start: number;
  clip_end: number;
}

export interface UnpopularOpinion {
  quote: string;
  contradiction: string;
  controversy_hook: string;
}

export interface CaptionVariant {
  clip_start: number;
  clip_end: number;
  captions: string[];
}

export interface StyleProfile {
  slang: string[];
  emoji_freq: 'none' | 'low' | 'medium' | 'high' | string;
  caps_pref: 'lowercase' | 'mixed' | 'shouty' | string;
  punctuation: 'minimal' | 'heavy' | 'expressive' | string;
}

export interface DistributionPack {
  x_thread: string[];
  linkedin: string;
  newsletter: string;
}

export interface ThumbnailConcept {
  text: string;
  position: 'top-left' | 'center' | 'bottom-right' | string;
  color: 'yellow' | 'white' | 'red' | 'cyan' | string;
  font_weight: 'bold' | 'black' | string;
}

export interface CommunityPoll {
  question: string;
  options: string[];
}

export interface SponsorshipSpot {
  start: number;
  end: number;
  transition_script: string;
}

export interface PinnedCommentTree {
  pinned: string;
  replies: string[];
}

export interface ShadowEditorScript {
  act1: string;
  act2: string;
  act3: string;
}

export interface ViralAngles {
  game: string;
  topics: { topic: string; heat: number; category: string }[];
  strategic_notes: string;
}

export interface PacingAnalysis {
  wpm: number;
  silence_count: number;
  cut_recommendations: string[];
}

/** The full unified analysis JSON returned by /api/analyse/youtube. */
export interface UnifiedAnalysis {
  hook_score: number;
  hook_rewrites: string[];
  sentiment_arc: SentimentPoint[];
  goldilocks_map: GoldilocksMap;
  hidden_gems: HiddenGem[];
  unpopular_opinions: UnpopularOpinion[];
  title_variants: string[];
  caption_variants: CaptionVariant[];
  style_profile: StyleProfile;
  distribution_pack: DistributionPack;
  thumbnail_concepts: ThumbnailConcept[];
  community_polls: CommunityPoll[];
  sponsorship_spots: SponsorshipSpot[];
  pinned_comment_tree: PinnedCommentTree;
  shadow_editor_script: ShadowEditorScript;
  viral_angles: ViralAngles;
  pacing_analysis: PacingAnalysis;
}

/** Wrapper for the /api/analyse/youtube response. */
export interface AnalyseYouTubeResponse {
  analysis_id: string | null;
  cached: boolean;
  analysis: UnifiedAnalysis;
  video?: { title: string; author: string; thumbnail_url: string; video_id: string };
  transcript_segments?: number;
  processing_ms?: number;
  credits_remaining?: number;
  error?: string;
}

/** Summary row from GET /api/analyses (list). */
export interface AnalysisSummary {
  id: string;
  source_url: string;
  source_video_id: string;
  video_title: string;
  video_author: string;
  thumbnail_url: string;
  hook_score: number | null;
  created_at: string;
  processing_ms: number;
}

export interface TopicStealEntry {
  topic: string;
  game: string;
  mention_count: number;
  avg_heat: number;
  distinct_days: number;
  last_seen: string;
  growth_multiplier: number | null;
}
