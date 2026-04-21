"""
ClipAI Worker — Flask API
==========================
Main application entry-point exposing REST endpoints for the ClipAI
video-processing pipeline.  Deployed on Railway.app behind Gunicorn.

Pipeline overview
-----------------
1.  Accept video (URL or upload)
2.  Store source in Cloudflare R2
3.  Analyse with Google Gemini (detect highlights)
4.  Render clips via FFmpeg (primary, free) or JSON2Video (premium)
5.  Upload results to R2
6.  Persist metadata in Supabase
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import requests
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
import google.generativeai as genai
from groq import Groq
import boto3
from botocore.exceptions import ClientError

from config import Config

# ── Logging ───────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("clipai.worker")

# ── App ───────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, origins=Config.CORS_ORIGINS, methods=["GET", "POST", "OPTIONS"], supports_credentials=True)

# Allow up to 500 MB file uploads (must be set before any request handling)
app.config["MAX_CONTENT_LENGTH"] = Config.MAX_FILE_SIZE_MB * 1024 * 1024


# ══════════════════════════════════════════════════════════════════════
#  IN-MEMORY JOB STORE (production would use Supabase/Redis)
# ══════════════════════════════════════════════════════════════════════

@dataclass
class Job:
    """Tracks the lifecycle of a single video-processing job."""

    job_id: str
    user_id: str
    status: str = "processing"  # processing | completed | failed
    progress: int = 0
    video_url: str | None = None
    r2_source_key: str | None = None
    game: str | None = None
    clip_count: int = 5
    clips: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    updated_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "user_id": self.user_id,
            "status": self.status,
            "progress": self.progress,
            "video_url": self.video_url,
            "game": self.game,
            "clip_count": self.clip_count,
            "clips": self.clips,
            "error": self.error,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


# Global job registry (thread-safe via lock)
_jobs_lock = threading.Lock()
_jobs: dict[str, Job] = {}


def _get_job(job_id: str) -> Job | None:
    with _jobs_lock:
        return _jobs.get(job_id)


def _save_job(job: Job) -> None:
    job.updated_at = datetime.now(timezone.utc).isoformat()
    with _jobs_lock:
        _jobs[job.job_id] = job


def _cleanup_old_jobs() -> None:
    """Remove jobs older than TTL (runs in background)."""
    cutoff = time.time() - Config.JOB_TTL_SECONDS
    with _jobs_lock:
        expired = [
            jid for jid, j in _jobs.items()
            if (j.created_at and datetime.fromisoformat(j.created_at).timestamp() < cutoff)
        ]
        for jid in expired:
            del _jobs[jid]
        if expired:
            logger.info("Cleaned up %d expired jobs", len(expired))


# ══════════════════════════════════════════════════════════════════════
#  R2 STORAGE CLIENT
# ══════════════════════════════════════════════════════════════════════

_r2_client: boto3.client | None = None


def _get_r2_client() -> boto3.client:
    """Lazy-initialise and return the Cloudflare R2 S3-compatible client."""
    global _r2_client
    if _r2_client is None:
        if not all([Config.R2_ENDPOINT, Config.R2_ACCESS_KEY, Config.R2_SECRET_KEY]):
            raise RuntimeError("R2 credentials not configured")
        _r2_client = boto3.client(
            service_name="s3",
            endpoint_url=Config.R2_ENDPOINT,
            aws_access_key_id=Config.R2_ACCESS_KEY,
            aws_secret_access_key=Config.R2_SECRET_KEY,
            region_name="auto",
        )
    return _r2_client


def upload_to_r2(file_path: str, key: str, content_type: str = "video/mp4") -> str:
    """Upload a local file to R2 and return the public URL (if configured) or key."""
    client = _get_r2_client()
    client.upload_file(
        file_path,
        Config.R2_BUCKET_NAME,
        key,
        ExtraArgs={"ContentType": content_type},
    )
    if Config.R2_PUBLIC_URL:
        return f"{Config.R2_PUBLIC_URL.rstrip('/')}/{key}"
    return f"s3://{Config.R2_BUCKET_NAME}/{key}"


def upload_bytes_to_r2(data: bytes, key: str, content_type: str = "video/mp4") -> str:
    """Upload raw bytes to R2."""
    client = _get_r2_client()
    client.put_object(
        Bucket=Config.R2_BUCKET_NAME,
        Key=key,
        Body=data,
        ContentType=content_type,
    )
    if Config.R2_PUBLIC_URL:
        return f"{Config.R2_PUBLIC_URL.rstrip('/')}/{key}"
    return f"s3://{Config.R2_BUCKET_NAME}/{key}"


def get_r2_presigned_url(key: str, expires: int = 3600) -> str:
    """Generate a presigned URL for an R2 object (valid for `expires` seconds)."""
    client = _get_r2_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": Config.R2_BUCKET_NAME, "Key": key},
        ExpiresIn=expires,
    )


def download_from_r2(key: str, dest_path: str) -> str:
    """Download a file from R2 to a local path."""
    client = _get_r2_client()
    client.download_file(Config.R2_BUCKET_NAME, key, dest_path)
    return dest_path


# ══════════════════════════════════════════════════════════════════════
#  SUPABASE HELPER
# ══════════════════════════════════════════════════════════════════════

def _supabase_request(method: str, path: str, body: dict | None = None) -> dict | None:
    """Make a request to the Supabase REST API (service-role auth)."""
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_KEY:
        logger.warning("Supabase not configured — skipping DB operation")
        return None
    url = f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/{path}"
    headers = {
        "apikey": Config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    try:
        resp = requests.request(method, url, json=body, headers=headers, timeout=15)
        resp.raise_for_status()
        if resp.content:
            return resp.json()
        return {}
    except requests.RequestException as exc:
        logger.error("Supabase %s %s failed: %s", method, path, exc)
        return None


# ══════════════════════════════════════════════════════════════════════
#  GEMINI — VIDEO ANALYSIS
# ══════════════════════════════════════════════════════════════════════

def _get_gemini_model():
    """Initialise and return the Gemini generative model."""
    if not Config.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not configured")
    genai.configure(api_key=Config.GEMINI_API_KEY)
    return genai.GenerativeModel(Config.GEMINI_MODEL)


def analyze_video(video_url: str, game: str, clip_count: int, video_duration: float = 0.0) -> list[dict[str, Any]]:
    """Ask Gemini to analyse a video and identify highlight timestamps.

    Uses the Gemini File API to upload the video for proper multimodal analysis.
    Falls back to URL-based analysis if File API fails.

    Returns a list of dicts with keys:
        start_time, end_time, label, intensity
    """
    model = _get_gemini_model()

    duration_hint = ""
    if video_duration > 0:
        duration_hint = f"\nIMPORTANT: This video is exactly {video_duration:.1f} seconds long. ALL timestamps must be between 0 and {video_duration:.1f}. Do NOT return any timestamp greater than {video_duration:.1f}."

    prompt = f"""You are a professional gaming highlight detector for {game or 'gaming content'}.

Analyze this video and identify the top {clip_count} most exciting, viral-worthy moments.
{duration_hint}

For each highlight, provide:
1. start_time - exact start time in seconds (e.g., 12.5)
2. end_time - exact end time in seconds (e.g., 18.2)
3. label - a short, punchy caption (2-4 words max, e.g., "INSANE 1v5 CLUTCH")
4. intensity - "high", "medium", or "low"

Guidelines:
- Each clip should be 5-30 seconds long
- Prioritize kills, clutches, trick shots, funny moments, or high-skill plays
- Ensure clips don't overlap
- Labels should be hype-worthy and social-media friendly
- Space clips at least 3 seconds apart
- start_time must be >= 0 and end_time must be <= the video duration
- If the video is very short, make clips shorter (3-10 seconds)

Respond ONLY with a JSON array. No explanations. Example:
[
  {{"start_time": 10.0, "end_time": 18.5, "label": "INSANE SNIPER SHOT", "intensity": "high"}},
  {{"start_time": 45.2, "end_time": 52.0, "label": "1v3 CLUTCH", "intensity": "high"}}
]"""

    try:
        # ── Strategy 1: Use Gemini File API (download + upload) ────────
        # This is the most reliable way to get Gemini to actually watch the video.
        gemini_file = None
        local_video_path: str | None = None

        # Download the video to a temp file if it's a URL
        if video_url.startswith("http"):
            try:
                local_video_path = _download_to_temp(video_url)
                logger.info("Uploading video to Gemini File API: %s", local_video_path)
                gemini_file = genai.upload_file(
                    path=local_video_path,
                    mime_type="video/mp4",
                )
                # Wait for the file to be processed by Gemini
                logger.info("Waiting for Gemini to process uploaded file...")
                while gemini_file.state.name == "PROCESSING":
                    time.sleep(2)
                    gemini_file = genai.get_file(gemini_file.name)
                if gemini_file.state.name == "FAILED":
                    logger.warning("Gemini File API processing failed, falling back to URL mode")
                    gemini_file = None
                else:
                    logger.info("Gemini File API ready: %s", gemini_file.state.name)
            except Exception as file_exc:
                logger.warning("Gemini File API upload failed: %s — trying URL mode", file_exc)
                gemini_file = None

        # ── Generate content ──────────────────────────────────────────
        if gemini_file:
            logger.info("Sending video to Gemini via File API")
            response = model.generate_content([prompt, gemini_file])
        else:
            # Strategy 2: Pass URL directly (works for publicly accessible URLs)
            logger.info("Sending video URL to Gemini for analysis: %s", video_url[:100])
            response = model.generate_content([prompt, video_url])

        # Clean up Gemini file and temp file
        if gemini_file:
            try:
                genai.delete_file(gemini_file.name)
            except Exception:
                pass
        if local_video_path and os.path.isfile(local_video_path):
            try:
                os.unlink(local_video_path)
            except OSError:
                pass

        # Extract JSON from response
        text = response.text.strip()
        # Strip markdown code fences if present
        json_match = re.search(r"\[.*\]", text, re.DOTALL)
        if json_match:
            text = json_match.group(0)

        highlights = json.loads(text)

        if not isinstance(highlights, list):
            highlights = [highlights]

        # Validate and normalise
        validated = []
        for hl in highlights:
            try:
                start = float(hl.get("start_time", 0))
                end = float(hl.get("end_time", start + 10))
                if end <= start:
                    end = start + 10
                # Clamp to video duration if known
                if video_duration > 0:
                    if start >= video_duration:
                        logger.warning("Skipping highlight with start_time %.1f >= video duration %.1f", start, video_duration)
                        continue
                    if end > video_duration:
                        end = video_duration
                    if start < 0:
                        start = 0
                validated.append({
                    "start_time": round(start, 2),
                    "end_time": round(end, 2),
                    "label": str(hl.get("label", "Highlight"))[:50],
                    "intensity": str(hl.get("intensity", "medium")).lower(),
                })
            except (ValueError, TypeError) as exc:
                logger.warning("Skipping invalid highlight: %s", exc)

        logger.info("Gemini identified %d highlights (video_duration=%.1f)", len(validated), video_duration)
        return validated[:clip_count]

    except json.JSONDecodeError as exc:
        logger.error("Failed to parse Gemini response as JSON: %s", exc)
        raise RuntimeError("Video analysis returned invalid data") from exc
    except Exception as exc:
        logger.error("Gemini analysis failed: %s", exc)
        raise RuntimeError(f"Video analysis failed: {exc}") from exc


def _download_to_temp(video_url: str) -> str:
    """Download a video URL to a temporary local file for processing."""
    os.makedirs(Config.TEMP_DIR, exist_ok=True)
    ext = ".mp4"
    # Try to extract extension from URL
    url_path = video_url.split("?")[0].split("#")[0]
    url_ext = os.path.splitext(url_path)[1].lower()
    if url_ext in Config.SUPPORTED_VIDEO_FORMATS:
        ext = url_ext
    local_path = os.path.join(Config.TEMP_DIR, f"source_{uuid.uuid4().hex[:8]}{ext}")
    logger.info("Downloading video to temp: %s", local_path)
    resp = requests.get(video_url, stream=True, timeout=120)
    resp.raise_for_status()
    downloaded = 0
    with open(local_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
            downloaded += len(chunk)
            if downloaded > Config.MAX_FILE_SIZE_MB * 1024 * 1024:
                os.unlink(local_path)
                raise ValueError(f"Video exceeds max size of {Config.MAX_FILE_SIZE_MB}MB")
    logger.info("Downloaded %.1f MB to %s", downloaded / (1024 * 1024), local_path)
    return local_path


def _get_video_duration(video_path: str) -> float:
    """Get the duration of a video file using ffprobe. Returns 0.0 on failure."""
    try:
        cmd = [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            video_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if result.returncode == 0:
            data = json.loads(result.stdout)
            return float(data.get("format", {}).get("duration", 0))
    except Exception as exc:
        logger.warning("Could not get video duration: %s", exc)
    return 0.0


# ══════════════════════════════════════════════════════════════════════
#  CLIP PROCESSING PIPELINE
# ══════════════════════════════════════════════════════════════════════

def _generate_thumbnail(video_path: str, timestamp: float, clip_id: str) -> str | None:
    """Generate a thumbnail image from a video at the given timestamp.

    Returns the local path to the thumbnail, or None on failure.
    """
    try:
        os.makedirs(Config.TEMP_DIR, exist_ok=True)
        thumb_path = os.path.join(Config.TEMP_DIR, f"thumb_{clip_id}.jpg")
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(timestamp),
            "-i", video_path,
            "-vframes", "1",
            "-q:v", "2",
            "-vf", "scale=640:-1",
            thumb_path,
        ]
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0 and os.path.isfile(thumb_path):
            return thumb_path
        logger.warning("Thumbnail generation failed: %s", result.stderr[-500:] if result.stderr else "unknown")
        return None
    except Exception as exc:
        logger.warning("Thumbnail generation error: %s", exc)
        return None


def _process_video(job: Job) -> None:
    """Background pipeline executed in a worker thread.

    Steps:
        1. Download source video locally (also store in R2)
        2. Analyse with Gemini (using File API via local file)
        3. Render clips with FFmpeg (reusing local file)
        4. Generate thumbnails for each clip
        5. Upload results to R2
        6. Save metadata to Supabase
    """
    local_source_path: str | None = None
    try:
        job.progress = 5
        _save_job(job)

        # ── Step 1: Download source video locally & store in R2 ───
        logger.info("[%s] Downloading source video", job.job_id)

        if job.video_url and job.video_url.startswith("http"):
            local_source_path = _download_to_temp(job.video_url)
            # Also store in R2 for persistence
            r2_key = f"sources/{job.user_id}/{job.job_id}.mp4"
            try:
                upload_to_r2(local_source_path, r2_key)
                job.r2_source_key = r2_key
                logger.info("[%s] Source stored in R2: %s", job.job_id, r2_key)
            except Exception as r2_exc:
                logger.warning("[%s] R2 upload failed (non-fatal): %s", job.job_id, r2_exc)
        elif job.video_url and job.video_url.startswith("s3://"):
            # Download from R2 via presigned URL
            if job.r2_source_key:
                try:
                    presigned = get_r2_presigned_url(job.r2_source_key, expires=3600)
                    local_source_path = _download_to_temp(presigned)
                except Exception as exc:
                    logger.warning("[%s] Could not download from R2: %s", job.job_id, exc)
            if not local_source_path:
                logger.warning("[%s] No local source available", job.job_id)
        else:
            logger.warning("[%s] No downloadable video_url provided", job.job_id)

        job.progress = 15
        _save_job(job)

        # Get video duration for better Gemini analysis
        video_duration = 0.0
        if local_source_path:
            video_duration = _get_video_duration(local_source_path)
            logger.info("[%s] Video duration: %.1f seconds", job.job_id, video_duration)

        # ── Step 2: Analyse with Gemini ───────────────────────────
        # Use local file for Gemini File API if available, otherwise fall back to URL
        analysis_url = job.video_url or ""
        if local_source_path:
            # Generate a presigned URL or use the local file
            # The analyze_video function will download + upload via File API
            # If we already have a local file, we can upload directly
            try:
                highlights = _analyze_local_video(
                    local_source_path, job.game or "", job.clip_count,
                    video_duration=video_duration,
                )
            except Exception as exc:
                logger.warning("[%s] Gemini File API analysis failed, trying URL: %s", job.job_id, exc)
                try:
                    highlights = analyze_video(
                        video_url=analysis_url,
                        game=job.game or "",
                        clip_count=job.clip_count,
                        video_duration=video_duration,
                    )
                except Exception as exc2:
                    logger.warning("[%s] Gemini URL analysis also failed: %s", job.job_id, exc2)
                    highlights = _generate_fallback_clips(job.clip_count, local_source_path)
        else:
            # No local file — try URL-based analysis
            if analysis_url.startswith("s3://") and job.r2_source_key:
                try:
                    analysis_url = get_r2_presigned_url(job.r2_source_key, expires=3600)
                except Exception:
                    pass
            try:
                highlights = analyze_video(
                    video_url=analysis_url,
                    game=job.game or "",
                    clip_count=job.clip_count,
                    video_duration=video_duration,
                )
            except Exception as exc:
                logger.warning("[%s] Gemini analysis failed, generating fallback: %s", job.job_id, exc)
                highlights = _generate_fallback_clips(job.clip_count)

        job.progress = 35
        _save_job(job)

        # ── Step 3: Render clips ──────────────────────────────────
        logger.info("[%s] Rendering %d clips", job.job_id, len(highlights))
        clips: list[dict[str, Any]] = []

        use_json2video = (Config.JSON2VIDEO_API_KEY is not None and Config.USE_JSON2VIDEO)
        if use_json2video:
            try:
                logger.info("[%s] Using JSON2Video (premium processor)", job.job_id)
                clips = _render_with_json2video(job, highlights)
            except Exception as exc:
                logger.warning(
                    "[%s] JSON2Video failed, falling back to FFmpeg: %s",
                    job.job_id, exc,
                )
                clips = _render_with_ffmpeg(job, highlights, local_source_path)
        else:
            logger.info("[%s] Using FFmpeg (primary processor)", job.job_id)
            clips = _render_with_ffmpeg(job, highlights, local_source_path)

        # ── Step 4: Generate thumbnails & finalize clip data ──────
        for clip in clips:
            if clip.get("status") == "failed":
                continue
            # Generate thumbnail from the source video
            start_secs = clip.get("start_time_seconds", 0)
            thumb_local = None
            if local_source_path and start_secs is not None:
                thumb_local = _generate_thumbnail(
                    local_source_path, float(start_secs), clip.get("id", "x"),
                )
            if thumb_local:
                try:
                    thumb_key = f"thumbnails/{job.user_id}/{job.job_id}/thumb_{clip.get('id', 'x')}.jpg"
                    thumb_url = upload_to_r2(thumb_local, thumb_key, content_type="image/jpeg")
                    clip["thumbnail_url"] = thumb_url
                    clip["thumbnail"] = thumb_url
                except Exception as exc:
                    logger.warning("Failed to upload thumbnail: %s", exc)
                finally:
                    try:
                        os.unlink(thumb_local)
                    except OSError:
                        pass

            # Ensure presigned URL for video_url if it's an s3:// path
            video_url = clip.get("video_url", clip.get("output_url", ""))
            if video_url.startswith("s3://"):
                # Extract key from s3://bucket/key
                s3_key = video_url.replace(f"s3://{Config.R2_BUCKET_NAME}/", "")
                try:
                    video_url = get_r2_presigned_url(s3_key, expires=86400)  # 24h
                    clip["video_url"] = video_url
                    clip["output_url"] = video_url
                except Exception:
                    pass

        job.clips = clips
        job.progress = 90
        _save_job(job)

        # ── Step 5: Persist metadata to Supabase ──────────────────
        for clip in clips:
            _supabase_request("POST", "clips", {
                "job_id": job.job_id,
                "user_id": job.user_id,
                "clip_url": clip.get("output_url", ""),
                "video_url": clip.get("video_url", clip.get("output_url", "")),
                "duration": clip.get("duration", "0s"),
                "label": clip.get("label", ""),
                "title": clip.get("title", clip.get("label", "")),
                "game": clip.get("game", job.game or ""),
                "hype_score": clip.get("hype_score", 70),
                "thumbnail_url": clip.get("thumbnail_url", clip.get("thumbnail", "")),
                "format": clip.get("format", "mp4"),
                "resolution": clip.get("resolution", []),
                "created_at": clip.get("created_at", datetime.now(timezone.utc).isoformat()),
            })

        # ── Done ──────────────────────────────────────────────────
        successful_clips = [c for c in clips if c.get("output_url") or c.get("video_url")]
        if clips and not successful_clips:
            job.status = "failed"
            job.error = "All clips failed to render. This may be due to an invalid video file or a processing error."
            job.progress = 100
            _save_job(job)
            logger.warning("[%s] All %d clips failed to render", job.job_id, len(clips))
        else:
            job.status = "completed"
            job.progress = 100
            _save_job(job)
            logger.info("[%s] Processing complete — %d/%d clips generated", job.job_id, len(successful_clips), len(clips))

    except Exception as exc:
        logger.error("[%s] Pipeline failed: %s", job.job_id, exc)
        job.status = "failed"
        job.error = str(exc)[:500]
        _save_job(job)
    finally:
        # Clean up local source file (only if we downloaded it ourselves)
        if local_source_path and os.path.isfile(local_source_path):
            try:
                os.unlink(local_source_path)
            except OSError:
                pass


def _process_video_with_local(job: Job, local_upload_path: str | None = None) -> None:
    """Wrapper around _process_video that uses a pre-saved local upload file.

    When a file is uploaded via the /api/process endpoint, we already have it
    on disk — this avoids downloading it again from R2.
    """
    try:
        job.progress = 5
        _save_job(job)

        # If we have a local upload, use it directly instead of downloading from URL
        if local_upload_path and os.path.isfile(local_upload_path):
            logger.info("[%s] Using pre-saved local upload: %s", job.job_id, local_upload_path)
            # The file is already in R2 from the upload handler
            # Just run the pipeline with the local path
            _process_video_core(job, local_upload_path)
        else:
            # No local file — use the normal download flow
            _process_video(job)
    except Exception as exc:
        logger.error("[%s] Pipeline failed: %s", job.job_id, exc)
        job.status = "failed"
        job.error = str(exc)[:500]
        _save_job(job)
    finally:
        # Clean up the uploaded temp file
        if local_upload_path and os.path.isfile(local_upload_path):
            try:
                os.unlink(local_upload_path)
            except OSError:
                pass


def _process_video_core(job: Job, local_source_path: str) -> None:
    """Core processing pipeline when we already have the video locally.

    This is the optimized path that skips the download step.
    """
    try:
        job.progress = 10
        _save_job(job)

        # Get video duration for better Gemini analysis
        video_duration = _get_video_duration(local_source_path)
        logger.info("[%s] Video duration: %.1f seconds", job.job_id, video_duration)

        # ── Step 1: Analyse with Gemini (using File API with local file) ──
        logger.info("[%s] Analysing local video with Gemini", job.job_id)
        try:
            highlights = _analyze_local_video(
                local_source_path, job.game or "", job.clip_count,
                video_duration=video_duration,
            )
        except Exception as exc:
            logger.warning("[%s] Gemini File API failed, trying URL: %s", job.job_id, exc)
            analysis_url = job.video_url or ""
            if analysis_url.startswith("s3://") and job.r2_source_key:
                try:
                    analysis_url = get_r2_presigned_url(job.r2_source_key, expires=3600)
                except Exception:
                    pass
            try:
                highlights = analyze_video(
                    video_url=analysis_url,
                    game=job.game or "",
                    clip_count=job.clip_count,
                    video_duration=video_duration,
                )
            except Exception as exc2:
                logger.warning("[%s] All Gemini attempts failed: %s", job.job_id, exc2)
                highlights = _generate_fallback_clips(job.clip_count, local_source_path)

        job.progress = 35
        _save_job(job)

        # ── Step 2: Render clips with FFmpeg ──────────────────────────
        logger.info("[%s] Rendering %d clips", job.job_id, len(highlights))
        use_json2video = (Config.JSON2VIDEO_API_KEY is not None and Config.USE_JSON2VIDEO)
        if use_json2video:
            try:
                clips = _render_with_json2video(job, highlights)
            except Exception as exc:
                logger.warning("[%s] JSON2Video failed, falling back to FFmpeg: %s", job.job_id, exc)
                clips = _render_with_ffmpeg(job, highlights, local_source_path)
        else:
            clips = _render_with_ffmpeg(job, highlights, local_source_path)

        # ── Step 3: Generate thumbnails & finalize ───────────────────
        for clip in clips:
            if clip.get("status") == "failed":
                continue
            start_secs = clip.get("start_time_seconds", 0)
            thumb_local = None
            if start_secs is not None:
                thumb_local = _generate_thumbnail(
                    local_source_path, float(start_secs), clip.get("id", "x"),
                )
            if thumb_local:
                try:
                    thumb_key = f"thumbnails/{job.user_id}/{job.job_id}/thumb_{clip.get('id', 'x')}.jpg"
                    thumb_url = upload_to_r2(thumb_local, thumb_key, content_type="image/jpeg")
                    clip["thumbnail_url"] = thumb_url
                    clip["thumbnail"] = thumb_url
                except Exception as exc:
                    logger.warning("Failed to upload thumbnail: %s", exc)
                finally:
                    try:
                        os.unlink(thumb_local)
                    except OSError:
                        pass

            # Ensure presigned URL for video_url if it's an s3:// path
            video_url = clip.get("video_url", clip.get("output_url", ""))
            if video_url.startswith("s3://"):
                s3_key = video_url.replace(f"s3://{Config.R2_BUCKET_NAME}/", "")
                try:
                    video_url = get_r2_presigned_url(s3_key, expires=86400)
                    clip["video_url"] = video_url
                    clip["output_url"] = video_url
                except Exception:
                    pass

        job.clips = clips
        job.progress = 90
        _save_job(job)

        # ── Step 4: Persist to Supabase ──────────────────────────────
        for clip in clips:
            _supabase_request("POST", "clips", {
                "job_id": job.job_id,
                "user_id": job.user_id,
                "clip_url": clip.get("output_url", ""),
                "video_url": clip.get("video_url", clip.get("output_url", "")),
                "duration": clip.get("duration", "0s"),
                "label": clip.get("label", ""),
                "title": clip.get("title", clip.get("label", "")),
                "game": clip.get("game", job.game or ""),
                "hype_score": clip.get("hype_score", 70),
                "thumbnail_url": clip.get("thumbnail_url", clip.get("thumbnail", "")),
                "format": clip.get("format", "mp4"),
                "resolution": clip.get("resolution", []),
                "created_at": clip.get("created_at", datetime.now(timezone.utc).isoformat()),
            })

        # ── Done ──────────────────────────────────────────────────────
        successful_clips = [c for c in clips if c.get("output_url") or c.get("video_url")]
        if clips and not successful_clips:
            job.status = "failed"
            job.error = "All clips failed to render. This may be due to an invalid video file or a processing error."
        else:
            job.status = "completed"
        job.progress = 100
        _save_job(job)
        logger.info("[%s] Processing complete — %d/%d clips", job.job_id, len(successful_clips), len(clips))

    except Exception as exc:
        logger.error("[%s] Core pipeline failed: %s", job.job_id, exc)
        job.status = "failed"
        job.error = str(exc)[:500]
        _save_job(job)


def _analyze_local_video(local_path: str, game: str, clip_count: int, video_duration: float = 0.0) -> list[dict[str, Any]]:
    """Analyse a local video file using Gemini's File API.

    This is the most reliable way to get Gemini to actually watch the video,
    as opposed to just receiving a URL string it may not be able to access.
    """
    if not Config.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not configured")

    model = _get_gemini_model()

    duration_hint = ""
    if video_duration > 0:
        duration_hint = f"\nIMPORTANT: This video is exactly {video_duration:.1f} seconds long. ALL timestamps must be between 0 and {video_duration:.1f}. Do NOT return any timestamp greater than {video_duration:.1f}."

    prompt = f"""You are a professional gaming highlight detector for {game or 'gaming content'}.

Analyze this video and identify the top {clip_count} most exciting, viral-worthy moments.
{duration_hint}

For each highlight, provide:
1. start_time - exact start time in seconds (e.g., 12.5)
2. end_time - exact end time in seconds (e.g., 18.2)
3. label - a short, punchy caption (2-4 words max, e.g., "INSANE 1v5 CLUTCH")
4. intensity - "high", "medium", or "low"

Guidelines:
- Each clip should be 5-30 seconds long
- Prioritize kills, clutches, trick shots, funny moments, or high-skill plays
- Ensure clips don't overlap
- Labels should be hype-worthy and social-media friendly
- Space clips at least 3 seconds apart
- start_time must be >= 0 and end_time must be <= the video duration
- If the video is very short, make clips shorter (3-10 seconds)

Respond ONLY with a JSON array. No explanations. Example:
[
  {{"start_time": 10.0, "end_time": 18.5, "label": "INSANE SNIPER SHOT", "intensity": "high"}},
  {{"start_time": 45.2, "end_time": 52.0, "label": "1v3 CLUTCH", "intensity": "high"}}
]"""

    logger.info("Uploading local video to Gemini File API: %s", local_path)
    gemini_file = genai.upload_file(
        path=local_path,
        mime_type="video/mp4",
    )

    # Wait for Gemini to process the uploaded file
    logger.info("Waiting for Gemini to process uploaded file...")
    max_wait = 120  # seconds
    waited = 0
    while gemini_file.state.name == "PROCESSING":
        time.sleep(2)
        waited += 2
        if waited > max_wait:
            raise RuntimeError("Gemini file processing timed out")
        gemini_file = genai.get_file(gemini_file.name)

    if gemini_file.state.name == "FAILED":
        raise RuntimeError("Gemini file processing failed")

    logger.info("Gemini File API ready, generating analysis...")
    response = model.generate_content([prompt, gemini_file])

    # Clean up the uploaded file from Gemini
    try:
        genai.delete_file(gemini_file.name)
    except Exception:
        pass

    # Parse the response
    text = response.text.strip()
    json_match = re.search(r"\[.*\]", text, re.DOTALL)
    if json_match:
        text = json_match.group(0)

    highlights = json.loads(text)
    if not isinstance(highlights, list):
        highlights = [highlights]

    validated = []
    for hl in highlights:
        try:
            start = float(hl.get("start_time", 0))
            end = float(hl.get("end_time", start + 10))
            if end <= start:
                end = start + 10
            # Clamp to video duration if known
            if video_duration > 0:
                if start >= video_duration:
                    logger.warning("Skipping highlight with start_time %.1f >= video duration %.1f", start, video_duration)
                    continue
                if end > video_duration:
                    end = video_duration
                if start < 0:
                    start = 0
            validated.append({
                "start_time": round(start, 2),
                "end_time": round(end, 2),
                "label": str(hl.get("label", "Highlight"))[:50],
                "intensity": str(hl.get("intensity", "medium")).lower(),
            })
        except (ValueError, TypeError) as exc:
            logger.warning("Skipping invalid highlight: %s", exc)

    logger.info("Gemini identified %d highlights (video_duration=%.1f)", len(validated), video_duration)
    return validated[:clip_count]


def _render_with_json2video(job: Job, highlights: list[dict]) -> list[dict[str, Any]]:
    """Render clips using the JSON2Video API."""
    from processors.json2video_processor import (
        JSON2VideoProcessor,
        ClipOptions,
        build_highlight_scenes,
    )

    processor = JSON2VideoProcessor()
    if not processor.available:
        raise RuntimeError("JSON2Video processor not available")

    scenes = build_highlight_scenes(
        highlights=highlights,
        captions=True,
        beat_sync=True,
    )

    opts = ClipOptions()
    result = processor.create_clip(
        video_url=job.video_url or "",
        scenes=scenes,
        options=opts,
    )

    # Upload result to R2
    output_key = f"clips/{job.user_id}/{job.job_id}/highlight.mp4"
    # JSON2Video returns a URL — we'd need to download and re-upload
    # For now, store the URL directly
    output_url = result.get("output_url", "")

    clips = []
    for i, hl in enumerate(highlights):
        intensity = hl.get("intensity", "medium")
        hype_score = {"high": 90 + (i * 2) % 10, "medium": 70 + (i * 3) % 15}.get(intensity, 55 + (i * 5) % 10)
        clips.append({
            "id": uuid.uuid4().hex[:12],
            "index": i,
            "title": hl.get("label", "Highlight"),
            "label": hl.get("label", "Highlight"),
            "game": job.game or "",
            "hype_score": hype_score,
            "duration": str(round(hl["end_time"] - hl["start_time"])) + "s",
            "duration_seconds": hl["end_time"] - hl["start_time"],
            "thumbnail": "",
            "thumbnail_url": "",
            "video_url": output_url,
            "output_url": output_url,
            "start_time": str(round(hl["start_time"])) + "s",
            "end_time": str(round(hl["end_time"])) + "s",
            "start_time_seconds": hl["start_time"],
            "end_time_seconds": hl["end_time"],
            "status": "ready",
            "format": result.get("format", "mp4"),
            "resolution": list(result.get("resolution", (1080, 1920))),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "processor": "json2video",
        })

    return clips


def _render_with_ffmpeg(job: Job, highlights: list[dict], local_source_path: str | None = None) -> list[dict[str, Any]]:
    """Render clips using FFmpeg (one per highlight, then optionally concatenated)."""
    from processors.ffmpeg_processor import FFmpegProcessor, FFmpegOptions

    processor = FFmpegProcessor()
    if not processor.available:
        raise RuntimeError("FFmpeg is not available")

    # Prefer local file over URL to avoid re-downloading
    ffmpeg_source_url = local_source_path or ""
    if not ffmpeg_source_url:
        ffmpeg_source_url = job.video_url or ""
        if ffmpeg_source_url.startswith("s3://") and job.r2_source_key:
            try:
                ffmpeg_source_url = get_r2_presigned_url(job.r2_source_key, expires=3600)
                logger.info("[%s] Generated presigned URL for FFmpeg", job.job_id)
            except Exception as exc:
                logger.warning("[%s] Could not generate presigned URL for FFmpeg: %s", job.job_id, exc)

    # Detect source video resolution
    source_width, source_height = 1920, 1080  # default horizontal
    if local_source_path and os.path.isfile(local_source_path):
        try:
            info = processor.get_video_info(local_source_path)
            if info.get("width") and info.get("height"):
                source_width = info["width"]
                source_height = info["height"]
                logger.info("[%s] Source video: %dx%d", job.job_id, source_width, source_height)
        except Exception:
            pass

    # Use source resolution - keep the original aspect ratio
    opts = FFmpegOptions(
        resolution=(source_width, source_height),
        aspect_ratio="16:9" if source_width > source_height else "9:16",
    )
    clips: list[dict[str, Any]] = []
    total = len(highlights)

    # Render each highlight as a separate clip
    for i, hl in enumerate(highlights):
        job.progress = 35 + int(50 * (i / total))
        _save_job(job)

        try:
            result = processor.create_clip(
                video_url=ffmpeg_source_url,
                start_time=hl["start_time"],
                end_time=hl["end_time"],
                options=opts,
                caption_text=hl.get("label"),
            )

            # Upload to R2
            output_path = result.get("output_path", "")
            output_url = ""
            if output_path and os.path.isfile(output_path):
                output_key = f"clips/{job.user_id}/{job.job_id}/clip_{i}.mp4"
                output_url = upload_to_r2(output_path, output_key)
                # Check for corrupt/tiny clips (less than 10KB)
                actual_size = os.path.getsize(output_path)
                if actual_size < 10240:  # 10KB minimum
                    logger.warning("[%s] Clip %d is too small (%d bytes), likely corrupt", job.job_id, i, actual_size)
                    os.unlink(output_path)
                    output_url = ""
                    output_path = ""
                else:
                    # Clean up local file
                    os.unlink(output_path)

            # Compute a hype score from intensity
            intensity = hl.get("intensity", "medium")
            hype_score = {"high": 90 + (i * 2) % 10, "medium": 70 + (i * 3) % 15}.get(intensity, 55 + (i * 5) % 10)
            clip_id = uuid.uuid4().hex[:12]

            clips.append({
                "id": clip_id,
                "index": i,
                "title": hl.get("label", "Highlight"),
                "label": hl.get("label", "Highlight"),
                "game": job.game or "",
                "hype_score": hype_score,
                "duration": str(round(result.get("duration", 0))) + "s",
                "duration_seconds": result.get("duration", 0),
                "thumbnail": "",
                "thumbnail_url": "",
                "video_url": output_url,
                "output_url": output_url,
                "start_time": str(round(hl["start_time"])) + "s",
                "end_time": str(round(hl["end_time"])) + "s",
                "start_time_seconds": hl["start_time"],
                "end_time_seconds": hl["end_time"],
                "status": "ready",
                "format": result.get("format", "mp4"),
                "size_bytes": result.get("size_bytes", 0),
                "resolution": list(result.get("resolution", (1080, 1920))),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "processor": "ffmpeg",
            })
        except Exception as exc:
            logger.error(
                "[%s] FFmpeg clip %d failed: %s", job.job_id, i, exc
            )
            clips.append({
                "id": uuid.uuid4().hex[:12],
                "index": i,
                "title": hl.get("label", "Highlight"),
                "label": hl.get("label", "Highlight"),
                "game": job.game or "",
                "hype_score": 50,
                "duration": "0s",
                "duration_seconds": 0,
                "thumbnail": "",
                "video_url": "",
                "output_url": "",
                "start_time": str(round(hl["start_time"])) + "s",
                "end_time": str(round(hl["end_time"])) + "s",
                "start_time_seconds": hl["start_time"],
                "end_time_seconds": hl["end_time"],
                "status": "failed",
                "error": str(exc),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "processor": "ffmpeg",
            })

    return clips


def _generate_fallback_clips(clip_count: int, video_path: str | None = None) -> list[dict[str, Any]]:
    """Generate evenly-spaced highlight markers when Gemini is unavailable.

    If a local video path is provided, attempts to get the actual duration
    for better spacing.  Otherwise uses a default 60s assumption.
    """
    video_duration = 60  # default assumption in seconds
    if video_path and os.path.isfile(video_path):
        try:
            from processors.ffmpeg_processor import FFmpegProcessor
            proc = FFmpegProcessor()
            info = proc.get_video_info(video_path)
            if info.get("duration", 0) > 0:
                video_duration = info["duration"]
                logger.info("Video duration from ffprobe: %.1fs", video_duration)
        except Exception as exc:
            logger.warning("Could not get video duration: %s", exc)

    # Space clips evenly across the video duration
    clip_duration = min(15, max(5, video_duration / (clip_count * 2)))
    total_clip_time = clip_count * clip_duration
    gap = max(2, (video_duration - total_clip_time) / max(1, clip_count - 1)) if clip_count > 1 else 0
    start = min(5, video_duration * 0.05)  # skip first 5s or 5%

    clips = []
    for i in range(clip_count):
        clip_start = start + (i * (clip_duration + gap))
        clip_end = clip_start + clip_duration
        if clip_end > video_duration:
            clip_end = video_duration
            clip_start = max(0, clip_end - clip_duration)
        if clip_start >= video_duration:
            break
        clips.append({
            "start_time": round(clip_start, 2),
            "end_time": round(clip_end, 2),
            "label": f"Highlight #{i + 1}",
            "intensity": "medium",
        })
    return clips


# ══════════════════════════════════════════════════════════════════════
#  ROUTES
# ══════════════════════════════════════════════════════════════════════

# ── Error Handlers ────────────────────────────────────────────────────

@app.errorhandler(413)
def request_entity_too_large(error):
    """Handle file uploads that exceed MAX_CONTENT_LENGTH."""
    return jsonify({
        "error": f"File too large. Maximum size is {Config.MAX_FILE_SIZE_MB}MB.",
    }), 413


@app.errorhandler(500)
def internal_server_error(error):
    """Generic 500 handler."""
    return jsonify({"error": "Internal server error"}), 500


@app.route("/api/health", methods=["GET"])
def health_check():
    """Health-check endpoint — returns service status and config warnings."""
    warnings = Config.validate()

    # Check processor availability
    processors = {}
    try:
        from processors.json2video_processor import JSON2VideoProcessor
        proc = JSON2VideoProcessor()
        processors["json2video"] = {"available": proc.available}
    except Exception:
        processors["json2video"] = {"available": False}

    try:
        from processors.ffmpeg_processor import FFmpegProcessor
        proc = FFmpegProcessor()
        processors["ffmpeg"] = {"available": proc.available}
    except Exception:
        processors["ffmpeg"] = {"available": False}

    return jsonify({
        "status": "healthy",
        "version": "1.0.0",
        "env": Config.FLASK_ENV,
        "warnings": warnings,
        "processors": processors,
        "active_jobs": len(_jobs),
    }), 200


# ── Process Video ─────────────────────────────────────────────────────

@app.route("/api/process", methods=["POST"])
def process_video():
    """Accept a video URL or uploaded file and start the processing pipeline.

    Body (multipart/form-data or application/json):
        video_url (str, optional): Public URL of the source video
        file (file, optional): Uploaded video file
        game (str): Game title for context-aware analysis
        clip_count (int): Number of clips to generate (default 5)
        captions (bool): Add captions to clips (default true)
        beat_sync (bool): Sync effects to beats (default false)
        format (str): Output format (default "mp4")
        user_id (str): Authenticated user ID
    """
    try:
        # Parse input
        if request.is_json:
            data = request.get_json(silent=True) or {}
        else:
            data = request.form.to_dict()

        user_id = data.get("user_id") or request.headers.get("X-User-ID", "anonymous")
        video_url = data.get("video_url")
        game = data.get("game", "")
        clip_count = min(int(data.get("clip_count", Config.DEFAULT_CLIP_COUNT)), 20)
        format_type = data.get("format", "mp4")

        # Handle file upload
        uploaded_file = request.files.get("file")
        local_upload_path: str | None = None
        if uploaded_file and uploaded_file.filename:
            file_ext = os.path.splitext(uploaded_file.filename)[1].lower()
            if file_ext not in Config.SUPPORTED_VIDEO_FORMATS:
                return jsonify({
                    "error": f"Unsupported file format: {file_ext}",
                    "supported": list(Config.SUPPORTED_VIDEO_FORMATS),
                }), 400

            file_data = uploaded_file.read()

            # Save to a local temp file first (avoids re-downloading from R2 later)
            os.makedirs(Config.TEMP_DIR, exist_ok=True)
            local_upload_path = os.path.join(
                Config.TEMP_DIR, f"upload_{uuid.uuid4().hex[:8]}{file_ext}"
            )
            with open(local_upload_path, "wb") as f:
                f.write(file_data)
            logger.info("Saved uploaded file locally: %s (%.1f MB)", local_upload_path, len(file_data) / (1024 * 1024))

            # Upload to R2 for persistence
            r2_key = f"uploads/{user_id}/{uuid.uuid4().hex}{file_ext}"
            video_url = upload_bytes_to_r2(file_data, r2_key, content_type="video/mp4")
            logger.info("Uploaded file to R2: %s", r2_key)

            # If R2 doesn't have a public URL, generate a presigned URL
            if video_url.startswith("s3://"):
                try:
                    video_url = get_r2_presigned_url(r2_key, expires=3600)
                    logger.info("Generated presigned URL for uploaded file")
                except Exception as exc:
                    logger.warning("Could not generate presigned URL: %s", exc)

        if not video_url:
            return jsonify({
                "error": "Either video_url or file is required",
            }), 400

        # Validate URL
        if not video_url.startswith("http") and not video_url.startswith("s3://"):
            return jsonify({"error": "Invalid video_url format"}), 400

        # Create job
        job = Job(
            job_id=uuid.uuid4().hex,
            user_id=user_id,
            video_url=video_url,
            game=game,
            clip_count=clip_count,
        )
        # If we have a local upload file, pass it directly so _process_video
        # doesn't need to re-download from R2
        if local_upload_path and os.path.isfile(local_upload_path):
            job.r2_source_key = r2_key  # already uploaded to R2

        _save_job(job)

        # Start processing in background thread
        # Pass the local upload path to avoid re-downloading
        thread = threading.Thread(
            target=_process_video_with_local,
            args=(job, local_upload_path),
            daemon=True,
        )
        thread.start()

        return jsonify({
            "job_id": job.job_id,
            "status": job.status,
            "message": "Processing started",
        }), 202

    except Exception as exc:
        logger.error("POST /api/process error: %s", exc)
        return jsonify({"error": str(exc)}), 500


# ── Job Status ────────────────────────────────────────────────────────

@app.route("/api/status/<job_id>", methods=["GET"])
def get_status(job_id: str):
    """Get the current status of a processing job.

    Returns:
        job_id, status, progress (0-100), clips (when completed), error (if failed)
    """
    job = _get_job(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    return jsonify(job.to_dict()), 200


# ── User Clips ────────────────────────────────────────────────────────

@app.route("/api/clips/<user_id>", methods=["GET"])
def get_user_clips(user_id: str):
    """Retrieve all clips for a given user.

    Checks in-memory store first, then falls back to Supabase.
    """
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 20, type=int)

    # Check local jobs first
    local_clips: list[dict[str, Any]] = []
    with _jobs_lock:
        for job in _jobs.values():
            if job.user_id == user_id and job.status == "completed" and job.clips:
                for clip in job.clips:
                    clip_entry = {
                        "id": clip.get("id", uuid.uuid4().hex[:12]),
                        "title": clip.get("title", clip.get("label", "Highlight")),
                        "game": clip.get("game", job.game or ""),
                        "hype_score": clip.get("hype_score", 70),
                        "duration": clip.get("duration", "0s"),
                        "thumbnail": clip.get("thumbnail", clip.get("thumbnail_url", "")),
                        "video_url": clip.get("video_url", clip.get("output_url", "")),
                        "start_time": clip.get("start_time", ""),
                        "end_time": clip.get("end_time", ""),
                        "created_at": clip.get("created_at", job.created_at),
                        "status": clip.get("status", "ready"),
                        "job_id": job.job_id,
                        # Also keep legacy fields for backward compat
                        "clip_url": clip.get("output_url", ""),
                        "label": clip.get("label", ""),
                        "processor": clip.get("processor", "unknown"),
                    }
                    local_clips.append(clip_entry)

    # Also query Supabase if available
    db_clips: list[dict[str, Any]] = []
    db_result = _supabase_request(
        "GET",
        f"clips?user_id=eq.{user_id}&order=created_at.desc&limit={limit}&offset={(page - 1) * limit}",
    )
    if isinstance(db_result, list):
        db_clips = db_result
    elif isinstance(db_result, dict):
        db_clips = db_result.get("data", [])

    # Merge: local clips take priority (most recent), supplemented by DB
    seen_urls = {c.get("clip_url") for c in local_clips if c.get("clip_url")}
    for clip in db_clips:
        url = clip.get("clip_url", "")
        if url and url not in seen_urls:
            local_clips.append(clip)
            seen_urls.add(url)

    return jsonify({
        "clips": local_clips,
        "total": len(local_clips),
        "page": page,
        "limit": limit,
    }), 200


# ── Caption Generation ────────────────────────────────────────────────

@app.route("/api/captions", methods=["POST"])
def generate_captions():
    """Generate stylised captions using Groq Llama 3.3.

    Body:
        text (str): The source text to caption
        style (str): Caption style — "hype", "clean", "funny", "minimal"
    """
    try:
        data = request.get_json(silent=True) or {}
        text = data.get("text", "").strip()
        style = data.get("style", "hype")

        if not text:
            return jsonify({"error": "text is required"}), 400

        if not Config.GROQ_API_KEY:
            return jsonify({
                "error": "Caption generation unavailable (no GROQ_API_KEY)",
            }), 503

        client = Groq(api_key=Config.GROQ_API_KEY)

        style_prompts = {
            "hype": "Generate 3 short, hype-worthy caption variants (max 5 words each) for social media. Use ALL CAPS and emojis. Make them energetic and viral-worthy.",
            "clean": "Generate 3 clean, professional caption variants (max 6 words each) for social media. Simple and impactful.",
            "funny": "Generate 3 funny, witty caption variants (max 6 words each) for social media. Use humour and wordplay.",
            "minimal": "Generate 3 minimal, aesthetic caption variants (max 4 words each). Very short and clean.",
        }

        prompt = f"{style_prompts.get(style, style_prompts['hype'])}\n\nOriginal text: {text}"

        response = client.chat.completions.create(
            model=Config.GROQ_MODEL,
            messages=[
                {"role": "system", "content": "You are a social media caption expert for gaming content. Respond with ONLY a JSON array of caption strings, nothing else."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.8,
            max_tokens=200,
        )

        raw = response.choices[0].message.content.strip()
        # Parse JSON from response
        json_match = re.search(r"\[.*?\]", raw, re.DOTALL)
        if json_match:
            captions = json.loads(json_match.group(0))
        else:
            # Fallback: split by newlines
            captions = [line.strip().lstrip("0123456789.-) ") for line in raw.split("\n") if line.strip()]

        return jsonify({
            "captions": captions[:3],
            "style": style,
        }), 200

    except Exception as exc:
        logger.error("POST /api/captions error: %s", exc)
        return jsonify({"error": f"Caption generation failed: {exc}"}), 500


# ── Paystack Integration ──────────────────────────────────────────────

@app.route("/api/paystack/init", methods=["POST"])
def init_payment():
    """Initialize a Paystack transaction.

    Body:
        email (str): Customer email
        plan (str): Plan key — "free", "pro", "enterprise"
        amount (float, optional): Custom amount in USD (overrides plan price)
    """
    try:
        data = request.get_json(silent=True) or {}
        email = data.get("email", "").strip()
        plan_key = data.get("plan", "pro").lower()
        custom_amount = data.get("amount")

        if not email:
            return jsonify({"error": "email is required"}), 400

        if not Config.PAYSTACK_SECRET_KEY:
            return jsonify({"error": "Payments unavailable"}), 503

        if plan_key not in Config.PLANS:
            return jsonify({
                "error": f"Invalid plan: {plan_key}",
                "available_plans": list(Config.PLANS.keys()),
            }), 400

        plan = Config.PLANS[plan_key]
        # Paystack expects amount in kobo (cents), we work in USD so multiply by 100
        amount_kobo = int((custom_amount or plan["price"]) * 100)

        if amount_kobo <= 0:
            return jsonify({"error": "Amount must be greater than zero"}), 400

        # Reference — unique per transaction
        reference = f"clipai_{plan_key}_{uuid.uuid4().hex[:12]}"

        # Call Paystack API
        resp = requests.post(
            f"{Config.PAYSTACK_API_URL}/transaction/initialize",
            json={
                "email": email,
                "amount": amount_kobo,
                "reference": reference,
                "metadata": {
                    "plan": plan_key,
                    "cancel_action": "https://clipai.com/pricing",
                },
                "channels": ["card", "bank_transfer", "mobile_money"],
            },
            headers={
                "Authorization": f"Bearer {Config.PAYSTACK_SECRET_KEY}",
                "Content-Type": "application/json",
            },
            timeout=15,
        )
        resp.raise_for_status()
        paystack_data = resp.json()

        if paystack_data.get("status") is not True:
            return jsonify({"error": "Paystack initialization failed"}), 502

        return jsonify({
            "authorization_url": paystack_data["data"]["authorization_url"],
            "reference": reference,
            "access_code": paystack_data["data"].get("access_code"),
            "plan": plan_key,
            "amount": amount_kobo / 100,
        }), 200

    except requests.RequestException as exc:
        logger.error("Paystack init error: %s", exc)
        return jsonify({"error": f"Payment initialization failed: {exc}"}), 502
    except Exception as exc:
        logger.error("POST /api/paystack/init error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@app.route("/api/paystack/verify", methods=["POST"])
def verify_payment():
    """Verify a Paystack transaction.

    Body:
        reference (str): The transaction reference to verify
    """
    try:
        data = request.get_json(silent=True) or {}
        reference = data.get("reference", "").strip()

        if not reference:
            return jsonify({"error": "reference is required"}), 400

        if not Config.PAYSTACK_SECRET_KEY:
            return jsonify({"error": "Payments unavailable"}), 503

        resp = requests.get(
            f"{Config.PAYSTACK_API_URL}/transaction/verify/{reference}",
            headers={
                "Authorization": f"Bearer {Config.PAYSTACK_SECRET_KEY}",
            },
            timeout=15,
        )
        resp.raise_for_status()
        paystack_data = resp.json().get("data", {})

        verified = paystack_data.get("status") == "success"
        plan = (paystack_data.get("metadata", {}) or {}).get("plan", "free")
        email = paystack_data.get("customer", {}).get("email", "")

        if verified:
            # Update user plan in Supabase
            _supabase_request("PATCH", f"profiles?email=eq.{email}", {
                "plan": plan,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })

        return jsonify({
            "verified": verified,
            "plan": plan,
            "reference": reference,
            "email": email,
            "amount": paystack_data.get("amount", 0) / 100,
            "paid_at": paystack_data.get("paid_at"),
        }), 200

    except requests.RequestException as exc:
        logger.error("Paystack verify error: %s", exc)
        return jsonify({"error": f"Verification failed: {exc}"}), 502
    except Exception as exc:
        logger.error("POST /api/paystack/verify error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@app.route("/api/paystack/webhook", methods=["POST"])
def paystack_webhook():
    """Handle Paystack webhook events.

    Validates the signature using PAYSTACK_SECRET_KEY and processes
    charge.success events to update user plans.
    """
    try:
        # Raw payload
        payload = request.get_data(as_text=True)

        # Verify signature
        signature = request.headers.get("x-paystack-signature", "")
        if not signature:
            logger.warning("Paystack webhook received without signature")
            return jsonify({"error": "Missing signature"}), 401

        if not Config.PAYSTACK_SECRET_KEY:
            return jsonify({"error": "Paystack not configured"}), 500

        # HMAC-SHA512 verification
        import hmac as hmac_module
        expected = hmac_module.new(
            Config.PAYSTACK_SECRET_KEY.encode(),
            payload.encode(),
            hashlib.sha512,
        ).hexdigest()

        if not hmac_module.compare_digest(signature, expected):
            logger.warning("Paystack webhook signature mismatch")
            return jsonify({"error": "Invalid signature"}), 401

        event = json.loads(payload)
        event_type = event.get("event", "")

        logger.info("Paystack webhook: %s", event_type)

        if event_type == "charge.success":
            data = event.get("data", {})
            customer = data.get("customer", {})
            email = customer.get("email", "")
            metadata = data.get("metadata", {}) or {}
            plan = metadata.get("plan", "pro")

            if email:
                _supabase_request("PATCH", f"profiles?email=eq.{email}", {
                    "plan": plan,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })
                logger.info("Upgraded %s to plan %s via webhook", email, plan)

        # Always return 200 to acknowledge receipt
        return jsonify({"received": True}), 200

    except json.JSONDecodeError:
        return jsonify({"error": "Invalid JSON payload"}), 400
    except Exception as exc:
        logger.error("Paystack webhook error: %s", exc)
        return jsonify({"error": str(exc)}), 500


# ── One-time Auth Config Setup ────────────────────────────────────────

@app.route("/api/setup/auth-config", methods=["POST"])
def setup_auth_config():
    """One-time endpoint to update Supabase auth redirect URLs.

    Uses the service role key to call the Supabase Management API
    and configure the Site URL and Redirect URLs for OAuth.
    """
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_KEY:
        return jsonify({"error": "Supabase not configured on worker"}), 500

    try:
        # Use the GoTrue admin API to update auth config
        # The Supabase platform exposes config updates through the admin endpoint
        auth_url = f"{Config.SUPABASE_URL.rstrip('/')}/auth/v1/admin/config"

        headers = {
            "apikey": Config.SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
        }

        # First, try reading current config
        get_resp = requests.get(auth_url, headers=headers, timeout=10)
        current_config = {}
        if get_resp.status_code == 200:
            current_config = get_resp.json()
            logger.info("Current auth config: %s", json.dumps(current_config)[:500])

        # Update Site URL and Redirect URLs
        update_payload = {
            "site_url": "https://clipai-ebo.pages.dev",
            "uri_allow_list": "https://clipai-ebo.pages.dev/**,http://localhost:5173/**,http://localhost:3000/**",
        }

        resp = requests.patch(auth_url, json=update_payload, headers=headers, timeout=10)

        result = {
            "status_code": resp.status_code,
            "response": resp.text[:500] if resp.text else "",
            "attempted_update": update_payload,
            "current_config": current_config,
        }

        if resp.status_code == 200:
            result["success"] = True
            result["message"] = "Auth config updated successfully"
        else:
            # If the GoTrue admin API doesn't support config updates,
            # try the Supabase Management API
            result["success"] = False
            result["message"] = "GoTrue admin API didn't accept the update. Manual dashboard update needed."

        return jsonify(result), 200 if result["success"] else 207

    except Exception as exc:
        logger.error("Auth config setup error: %s", exc)
        return jsonify({"error": str(exc)}), 500


# ══════════════════════════════════════════════════════════════════════
#  ERROR HANDLERS
# ══════════════════════════════════════════════════════════════════════

@app.errorhandler(404)
def not_found(_exc):
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(405)
def method_not_allowed(_exc):
    return jsonify({"error": "Method not allowed"}), 405


@app.errorhandler(500)
def server_error(exc):
    logger.error("Unhandled error: %s", exc)
    return jsonify({"error": "Internal server error"}), 500


# ══════════════════════════════════════════════════════════════════════
#  STARTUP
# ══════════════════════════════════════════════════════════════════════

@app.before_request
def _log_request():
    logger.info("%s %s", request.method, request.path)


# ── Gunicorn entry-point ─────────────────────────────────────────────
# The app object is imported directly by gunicorn via ``main:app``.

if __name__ == "__main__":
    # Log config warnings at startup
    for w in Config.validate():
        logger.warning(w)

    logger.info(
        "ClipAI Worker starting — env=%s port=%d",
        Config.FLASK_ENV,
        Config.PORT,
    )

    # Start background cleanup thread
    cleanup_thread = threading.Thread(target=lambda: _cleanup_old_jobs(), daemon=True)
    cleanup_thread.start()

    app.run(
        host="0.0.0.0",
        port=Config.PORT,
        debug=Config.DEBUG,
    )
