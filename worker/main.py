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
4.  Render clips via JSON2Video (primary) or FFmpeg (fallback)
5.  Upload results to R2
6.  Persist metadata in Supabase
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
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


def analyze_video(video_url: str, game: str, clip_count: int) -> list[dict[str, Any]]:
    """Ask Gemini to analyse a video and identify highlight timestamps.

    Returns a list of dicts with keys:
        start_time, end_time, label, intensity
    """
    model = _get_gemini_model()

    prompt = f"""You are a professional gaming highlight detector for {game or 'gaming content'}.

Analyze this video and identify the top {clip_count} most exciting, viral-worthy moments.

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

Respond ONLY with a JSON array. No explanations. Example:
[
  {{"start_time": 10.0, "end_time": 18.5, "label": "INSANE SNIPER SHOT", "intensity": "high"}},
  {{"start_time": 45.2, "end_time": 52.0, "label": "1v3 CLUTCH", "intensity": "high"}}
]"""

    try:
        logger.info("Sending video to Gemini for analysis: %s", video_url)
        # Gemini supports video URLs in some configurations
        response = model.generate_content([prompt, video_url])

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
                validated.append({
                    "start_time": round(start, 2),
                    "end_time": round(end, 2),
                    "label": str(hl.get("label", "Highlight"))[:50],
                    "intensity": str(hl.get("intensity", "medium")).lower(),
                })
            except (ValueError, TypeError) as exc:
                logger.warning("Skipping invalid highlight: %s", exc)

        logger.info("Gemini identified %d highlights", len(validated))
        return validated[:clip_count]

    except json.JSONDecodeError as exc:
        logger.error("Failed to parse Gemini response as JSON: %s", exc)
        raise RuntimeError("Video analysis returned invalid data") from exc
    except Exception as exc:
        logger.error("Gemini analysis failed: %s", exc)
        raise RuntimeError(f"Video analysis failed: {exc}") from exc


# ══════════════════════════════════════════════════════════════════════
#  CLIP PROCESSING PIPELINE
# ══════════════════════════════════════════════════════════════════════

def _process_video(job: Job) -> None:
    """Background pipeline executed in a worker thread.

    Steps:
        1. Store source video in R2
        2. Analyse with Gemini
        3. Render clips (JSON2Video primary, FFmpeg fallback)
        4. Upload results to R2
        5. Save metadata
    """
    try:
        job.progress = 5
        _save_job(job)

        # ── Step 1: Ensure source is in R2 ────────────────────────
        logger.info("[%s] Storing source in R2", job.job_id)
        r2_key = f"sources/{job.user_id}/{job.job_id}.mp4"

        if job.video_url and job.video_url.startswith("http"):
            # Download then upload to R2
            resp = requests.get(job.video_url, stream=True, timeout=120)
            resp.raise_for_status()
            upload_bytes_to_r2(resp.content, r2_key)
        else:
            logger.warning("[%s] No downloadable video_url provided", job.job_id)

        job.r2_source_key = r2_key
        job.progress = 15
        _save_job(job)

        # ── Step 2: Analyse with Gemini ───────────────────────────
        logger.info("[%s] Analysing video with Gemini", job.job_id)
        try:
            highlights = analyze_video(
                video_url=job.video_url or "",
                game=job.game or "",
                clip_count=job.clip_count,
            )
        except Exception as exc:
            logger.warning("[%s] Gemini analysis failed, generating fallback: %s", job.job_id, exc)
            # Fallback: evenly spaced clips
            highlights = _generate_fallback_clips(job.clip_count)

        job.progress = 35
        _save_job(job)

        # ── Step 3: Render clips ──────────────────────────────────
        logger.info("[%s] Rendering %d clips", job.job_id, len(highlights))
        clips: list[dict[str, Any]] = []

        # Try JSON2Video first
        use_json2video = Config.JSON2VIDEO_API_KEY is not None
        if use_json2video:
            try:
                clips = _render_with_json2video(job, highlights)
            except Exception as exc:
                logger.warning(
                    "[%s] JSON2Video failed, falling back to FFmpeg: %s",
                    job.job_id, exc,
                )
                clips = _render_with_ffmpeg(job, highlights)
        else:
            clips = _render_with_ffmpeg(job, highlights)

        job.clips = clips
        job.progress = 90
        _save_job(job)

        # ── Step 4: Persist metadata to Supabase ──────────────────
        for clip in clips:
            _supabase_request("POST", "clips", {
                "job_id": job.job_id,
                "user_id": job.user_id,
                "clip_url": clip.get("output_url", ""),
                "duration": clip.get("duration", 0),
                "label": clip.get("label", ""),
                "thumbnail_url": clip.get("thumbnail_url", ""),
                "format": clip.get("format", "mp4"),
                "resolution": clip.get("resolution", []),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

        # ── Done ──────────────────────────────────────────────────
        job.status = "completed"
        job.progress = 100
        _save_job(job)
        logger.info("[%s] Processing complete — %d clips generated", job.job_id, len(clips))

    except Exception as exc:
        logger.error("[%s] Pipeline failed: %s", job.job_id, exc)
        job.status = "failed"
        job.error = str(exc)[:500]
        _save_job(job)


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
    offset = 0
    for i, hl in enumerate(highlights):
        clips.append({
            "index": i,
            "label": hl.get("label", "Highlight"),
            "output_url": output_url,  # single compilation
            "duration": hl["end_time"] - hl["start_time"],
            "format": result.get("format", "mp4"),
            "resolution": list(result.get("resolution", (1080, 1920))),
            "start_time": hl["start_time"],
            "end_time": hl["end_time"],
            "processor": "json2video",
        })

    return clips


def _render_with_ffmpeg(job: Job, highlights: list[dict]) -> list[dict[str, Any]]:
    """Render clips using FFmpeg (one per highlight, then optionally concatenated)."""
    from processors.ffmpeg_processor import FFmpegProcessor, FFmpegOptions

    processor = FFmpegProcessor()
    if not processor.available:
        raise RuntimeError("FFmpeg is not available")

    opts = FFmpegOptions()
    clips: list[dict[str, Any]] = []
    total = len(highlights)

    # Render each highlight as a separate clip
    for i, hl in enumerate(highlights):
        job.progress = 35 + int(50 * (i / total))
        _save_job(job)

        try:
            result = processor.create_clip(
                video_url=job.video_url or "",
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
                # Clean up local file
                os.unlink(output_path)

            clips.append({
                "index": i,
                "label": hl.get("label", "Highlight"),
                "output_url": output_url,
                "duration": result.get("duration", 0),
                "format": result.get("format", "mp4"),
                "size_bytes": result.get("size_bytes", 0),
                "resolution": list(result.get("resolution", (1080, 1920))),
                "start_time": hl["start_time"],
                "end_time": hl["end_time"],
                "processor": "ffmpeg",
            })
        except Exception as exc:
            logger.error(
                "[%s] FFmpeg clip %d failed: %s", job.job_id, i, exc
            )
            clips.append({
                "index": i,
                "label": hl.get("label", "Highlight"),
                "output_url": "",
                "duration": 0,
                "error": str(exc),
                "processor": "ffmpeg",
            })

    return clips


def _generate_fallback_clips(clip_count: int) -> list[dict[str, Any]]:
    """Generate evenly-spaced highlight markers when Gemini is unavailable.

    These are approximate; FFmpeg will handle the actual trimming.
    """
    clip_duration = 15  # seconds per clip
    gap = 3  # seconds between clips
    interval = clip_duration + gap
    start = 5  # skip first 5 seconds

    clips = []
    for i in range(clip_count):
        clips.append({
            "start_time": start + (i * interval),
            "end_time": start + (i * interval) + clip_duration,
            "label": f"Highlight #{i + 1}",
            "intensity": "medium",
        })
    return clips


# ══════════════════════════════════════════════════════════════════════
#  ROUTES
# ══════════════════════════════════════════════════════════════════════

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
        if uploaded_file and uploaded_file.filename:
            # Upload to R2 first
            file_ext = os.path.splitext(uploaded_file.filename)[1].lower()
            if file_ext not in Config.SUPPORTED_VIDEO_FORMATS:
                return jsonify({
                    "error": f"Unsupported file format: {file_ext}",
                    "supported": list(Config.SUPPORTED_VIDEO_FORMATS),
                }), 400

            file_data = uploaded_file.read()
            r2_key = f"uploads/{user_id}/{uuid.uuid4().hex}{file_ext}"
            video_url = upload_bytes_to_r2(file_data, r2_key, content_type="video/mp4")
            logger.info("Uploaded file to R2: %s", r2_key)

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
        _save_job(job)

        # Start processing in background thread
        thread = threading.Thread(target=_process_video, args=(job,), daemon=True)
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
                        "clip_url": clip.get("output_url", ""),
                        "duration": clip.get("duration", 0),
                        "label": clip.get("label", ""),
                        "job_id": job.job_id,
                        "created_at": job.created_at,
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
