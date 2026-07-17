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

// ─── Trending Videos (Dashboard widget) ─────────────────────────────────────
export interface TrendingVideo {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  url: string;
  platform: 'youtube' | 'tiktok' | 'twitter' | 'instagram';
  publishedAt: string;
  /** YouTube view count (other platforms don't expose play counts). 0 if N/A. */
  viewCount?: number;
  copyPack?: {
    title: string;
    caption: string;
    hashtags: string[];
  };
}

export interface TrendingVideosResponse {
  videos: TrendingVideo[];
  generatedAt: string;
  game: string;
}

// ─── Channel Audit (free audit flow + dashboard squares) ─────────────────────
export type AuditPlatform = 'youtube' | 'tiktok' | 'twitter' | 'instagram' | 'reddit';

export interface ChannelAuditVideo {
  id: string;
  title: string;
  thumbnail: string;
  url: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration?: string;
}

export interface ChannelAudit {
  platform: AuditPlatform;
  channelId?: string;
  channelName: string;
  channelHandle: string;
  description: string;
  avatar: string;
  banner: string;
  country: string;
  publishedAt: string;
  statistics: {
    subscribers: number;
    totalViews: number;
    videoCount: number;
    hiddenSubscriberCount: boolean;
  };
  recentVideos: ChannelAuditVideo[];
  metrics: {
    avgRecentViews: number;
    totalRecentViews: number;
    avgEngagementRate: number;
    recentVideoCount: number;
  };
  auditedAt: string;
  url: string;
  note?: string;
  error?: string;
}

export interface AuditChannelResponse {
  audit: ChannelAudit;
  saved: {
    url: string;
    platform: AuditPlatform;
    channelName: string;
    channelHandle: string;
    avatar: string;
    auditedAt: string;
  };
  /** Number of saved audits the user now has (≤8). Phase 5. */
  count?: number;
  /** Daily audit quota state after this audit ran. Phase 5. */
  quota?: {
    allowed: boolean;
    used: number;
    quota: number;
    resetAt: string;
  };
}

export interface ChannelAuditsResponse {
  audits: ChannelAudit[];
  /** Total saved audits for the user (≤8). Phase 5. */
  count?: number;
  /** Daily audit quota state (used to render "X/50 audits today"). Phase 5. */
  dailyQuota?: {
    used: number;
    quota: number;
    resetAt: string | null;
  };
}

export interface SaveOnboardingResponse {
  success: boolean;
  onboarding: {
    primaryGame: string;
    platforms: string[];
    goal: string;
    experience: string;
    completedAt: string;
  };
}

// ─── Phase 2: Competitor Lab comparison types ─────────────────────────────────
export interface ComparisonResult {
  winner: 'A' | 'B' | 'tie';
  winner_reason: string;
  viral_gap: {
    a_missed: string[];
    b_missed: string[];
    a_exclusive_wins: string[];
    b_exclusive_wins: string[];
  };
  voice_gap: {
    a_voice: string;
    b_voice: string;
    differences: string[];
    recommendation: string;
  };
  predictive_comments: {
    a: Array<{ type: string; comment: string; likely_engagement: string }>;
    b: Array<{ type: string; comment: string; likely_engagement: string }>;
  };
  comparison_metrics: {
    hook:        { a: number; b: number; advantage: string };
    pacing:      { a: string; b: string; advantage: string };
    distribution:{ a: string; b: string; advantage: string };
    retention:   { a: string; b: string; advantage: string };
  };
  steal_playbook: string[];
}

export interface CompareResponse {
  comparison: ComparisonResult;
  videos: {
    a: { title: string; author: string; video_id: string; url: string; hook_score: number | null };
    b: { title: string; author: string; video_id: string; url: string; hook_score: number | null };
  };
  cached: { a: boolean; b: boolean };
  processing_ms: number;
  credits_remaining: number;
}

// ─── Phase 3: Playlist Architect types ────────────────────────────────────────
export interface PlaylistResult {
  recommended_order: Array<{ position: number; title: string; rationale: string }>;
  distribution_schedule: {
    youtube: Array<{ day: number; video: string; time: string; reason: string }>;
    tiktok:  Array<{ day: number; video: string; clip_segment: string; reason: string }>;
    x:       Array<{ day: number; video: string; format: string; reason: string }>;
    shorts:  Array<{ day: number; video: string; clip_segment: string; reason: string }>;
  };
  cross_promotion_hooks: Array<{ from_video: string; to_video: string; hook_script: string }>;
  retention_forecast: {
    expected_peak_video: string;
    expected_weak_video: string;
    total_projected_watch_hours: number;
    notes: string;
  };
  thematic_arc: string;
}

export interface PlaylistResponse {
  playlist: PlaylistResult;
  videos: Array<{ url: string; video_id: string; title: string; author: string; hook_score: number | null }>;
  processing_ms: number;
  credits_remaining: number;
}

// ─── Phase 4: Audio Trend Sync types ─────────────────────────────────────────
export interface AudioTrendResult {
  trending_sounds: Array<{
    name: string;
    vibe: string;
    why_it_fits: string;
    usage_tip: string;
    platform_fit: string[];
  }>;
  sync_points: Array<{
    t: number;
    label: string;
    beat_action: string;
    why: string;
  }>;
  alt_genres: Array<{ genre: string; best_for: string; risk: string }>;
  miss_warning: string;
}

export interface AudioTrendResponse {
  audio_trend: AudioTrendResult;
  video: { title: string; author: string; video_id: string; url: string };
  cached_analysis: boolean;
  processing_ms: number;
  credits_remaining: number;
}

// ─── Phase 4: Predictive Comments Lite types ────────────────────────────────
export interface PredictedCommentsResult {
  praise:      Array<{ comment: string; intensity: string; why_likely: string }>;
  criticism:   Array<{ comment: string; tone: string;       why_likely: string }>;
  questions:   Array<{ comment: string; intent: string;     why_likely: string }>;
  debate:      Array<{ comment: string; side: string;       why_likely: string }>;
  spam:        Array<{ comment: string; pattern: string;    why_likely: string }>;
  pinned_suggestion: { comment: string; why: string };
}

export interface CommentsResponse {
  comments: PredictedCommentsResult;
  video: { title: string; author: string; video_id: string; url: string };
  cached_analysis: boolean;
  processing_ms: number;
  credits_remaining: number;
}

// ─── Phase 4: Shadow Editor (faceless script) types ──────────────────────────
export interface ShadowEditorResult {
  full_script: {
    act1_hook: string;
    act2_setup: string;
    act3_payoff: string;
    cta: string;
  };
  b_roll_cues: Array<{
    t: string;
    visual: string;
    duration_seconds: number;
    text_overlay: string | null;
  }>;
  tts_settings: {
    voice_recommendation: string;
    pace_wpm: number;
    pitch: string;
    pause_strategy: string;
  };
  legal_disclaimer: string;
}

export interface ShadowResponse {
  shadow: ShadowEditorResult;
  video: { title: string; author: string; video_id: string; url: string };
  cached_analysis: boolean;
  processing_ms: number;
  credits_remaining: number;
}
