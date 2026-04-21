import { apiClient } from '@/api/client';

// --- Types ---

export interface Clip {
  id: string;
  title: string;
  game: string;
  hype_score: number;
  duration: string;
  thumbnail: string;
  video_url: string;
  start_time: string;
  end_time: string;
  created_at: string;
  status: 'ready' | 'processing' | 'failed';
  // Worker may also send these extra fields
  index?: number;
  label?: string;
  output_url?: string;
  thumbnail_url?: string;
  clip_url?: string;
  job_id?: string;
  processor?: string;
}

export interface ProcessVideoParams {
  video_url?: string;
  file?: File;
  game: string;
  clip_count: number;
  captions: boolean;
  beat_sync: boolean;
  format: 'tiktok' | 'reels' | 'shorts';
  user_id?: string;
}

export interface ProcessVideoResponse {
  job_id: string;
  status: string;
}

export interface JobStatus {
  job_id: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  clips?: Clip[];
}

export interface UserClipsResponse {
  clips: Clip[];
}

export interface GenerateCaptionsResponse {
  captions: string[];
}

export interface InitPaystackPaymentParams {
  email: string;
  plan: string;
  amount: number;
}

export interface InitPaystackPaymentResponse {
  authorization_url: string;
  reference: string;
}

export interface VerifyPaystackPaymentResponse {
  verified: boolean;
  plan: string;
}

// --- API Functions ---

export async function processVideo(params: ProcessVideoParams): Promise<ProcessVideoResponse> {
  // If a file is provided, use FormData instead of JSON
  if (params.file) {
    const formData = new FormData();
    formData.append('file', params.file);
    formData.append('game', params.game);
    formData.append('clip_count', String(params.clip_count));
    formData.append('captions', String(params.captions));
    formData.append('beat_sync', String(params.beat_sync));
    formData.append('format', params.format);
    if (params.video_url) {
      formData.append('video_url', params.video_url);
    }
    if (params.user_id) {
      formData.append('user_id', params.user_id);
    }

    return apiClient.post<ProcessVideoResponse>('/api/process', formData);
  }

  return apiClient.post<ProcessVideoResponse>('/api/process', {
    video_url: params.video_url,
    game: params.game,
    clip_count: params.clip_count,
    captions: params.captions,
    beat_sync: params.beat_sync,
    format: params.format,
    user_id: params.user_id,
  });
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  return apiClient.get<JobStatus>(`/api/status/${jobId}`);
}

export async function getUserClips(userId: string): Promise<UserClipsResponse> {
  return apiClient.get<UserClipsResponse>(`/api/clips/${userId}`);
}

export async function generateCaptions(text: string, style?: string): Promise<GenerateCaptionsResponse> {
  const params = new URLSearchParams({ text });
  if (style) {
    params.set('style', style);
  }
  return apiClient.post<GenerateCaptionsResponse>(`/api/captions?${params.toString()}`);
}

export async function initPaystackPayment(
  email: string,
  plan: string,
  amount: number,
): Promise<InitPaystackPaymentResponse> {
  return apiClient.post<InitPaystackPaymentResponse>('/api/paystack/init', {
    email,
    plan,
    amount,
  });
}

export async function verifyPaystackPayment(reference: string): Promise<VerifyPaystackPaymentResponse> {
  return apiClient.post<VerifyPaystackPaymentResponse>('/api/paystack/verify', { reference });
}
