"""
ClipAI v2 Worker — Flask API
=============================
Major v2 upgrade:
  • Supabase auth (JWT validation + profile lookup)
  • Redis-backed render job store (falls back to in-memory)
  • Server-side plan gating (quality / beat_sync / competitor_spy)
  • Real Paystack integration with metadata + plan persistence
  • Referral system, XP tracking, leaderboards, caption voting
  • Hourly cleanup of /tmp/clipai (24h retention)
  • Trim values honoured in render pipeline

Pipeline (unchanged from v1):
  upload → R2/B2 storage
  analyse (Gemini 2.5 Flash)
  captions (Groq Llama 3.3 70B)
  render (JSON2Video primary, FFmpeg fallback)
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import shutil
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone, date, timedelta
from pathlib import Path
from typing import Any, Optional

import boto3
import requests
from botocore.config import Config as BotoConfig
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

from config import Config
from auth import (
    award_credits, award_xp, can_use_feature, can_use_quality,
    fetch_profile, require_auth, require_plan, update_profile,
    verify_supabase_jwt,
)
from jobs import get_job, save_job, start_cleanup_scheduler, update_job

load_dotenv()

# ─── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("clipai")

# ─── App + CORS ─────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = Config.MAX_FILE_SIZE_MB * 1024 * 1024


def _cors_origin_check(origin: str | None) -> bool:
    if not origin:
        return False
    if origin in Config.CORS_ORIGINS:
        return True
    return any(p in origin for p in (".pages.dev", ".vercel.app", "localhost"))


CORS(
    app,
    origins="*" if Config.DEBUG else _cors_origin_check,
    methods=["GET", "POST", "PATCH", "OPTIONS"],
    supports_credentials=False,
)

PORT = Config.PORT
WORK_DIR = Path(Config.TEMP_DIR)
WORK_DIR.mkdir(parents=True, exist_ok=True)

# Start background cleanup scheduler
start_cleanup_scheduler()

# ─── AI clients (lazy) ──────────────────────────────────────────────────────
def _gemini():
    import google.generativeai as genai
    genai.configure(api_key=Config.GEMINI_API_KEY)
    return genai.GenerativeModel(Config.GEMINI_MODEL)


def _groq():
    from groq import Groq
    return Groq(api_key=Config.GROQ_API_KEY)


# ─── Storage helpers (R2 primary, B2 fallback) ──────────────────────────────
def _r2_client():
    if not all([Config.R2_ACCESS_KEY, Config.R2_SECRET_KEY]):
        raise RuntimeError("R2 not configured")
    endpoint = Config.R2_ENDPOINT or f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
    if not endpoint.startswith("http"):
        endpoint = f"https://{endpoint}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=Config.R2_ACCESS_KEY,
        aws_secret_access_key=Config.R2_SECRET_KEY,
        config=BotoConfig(signature_version="s3v4"),
        region_name="auto",
    )


def _b2_client():
    return boto3.client(
        "s3",
        endpoint_url=Config.B2_ENDPOINT,
        aws_access_key_id=Config.B2_KEY_ID,
        aws_secret_access_key=Config.B2_APPLICATION_KEY,
        config=BotoConfig(signature_version="s3v4"),
    )


def upload_to_storage(local_path: Path, object_key: str) -> str:
    """Upload to R2 (fallback B2). Returns public URL."""
    try:
        _r2_client().upload_file(str(local_path), Config.R2_BUCKET_NAME, object_key)
        return f"{Config.R2_PUBLIC_URL}/{object_key}"
    except Exception as e:
        log.warning(f"R2 upload failed ({e}), trying B2…")
        _b2_client().upload_file(str(local_path), Config.B2_BUCKET_NAME, object_key)
        return f"{Config.B2_ENDPOINT}/{Config.B2_BUCKET_NAME}/{object_key}"


def download_from_storage(object_key: str, dest: Path):
    try:
        _r2_client().download_file(Config.R2_BUCKET_NAME, object_key, str(dest))
    except Exception:
        _b2_client().download_file(Config.B2_BUCKET_NAME, object_key, str(dest))


# ─── JSON2Video renderer (primary) ──────────────────────────────────────────
J2V_API = "https://api.json2video.com/v2/movies"

FORMAT_RESOLUTION = {
    "tiktok": {"width": 1080, "height": 1920},
    "reels":  {"width": 1080, "height": 1920},
    "shorts": {"width": 1080, "height": 1920},
}

QUALITY_RESOLUTION = {
    "480p":  {"width": 854,  "height": 480},
    "720p":  {"width": 1280, "height": 720},
    "1080p": {"width": 1920, "height": 1080},
    "4k":    {"width": 3840, "height": 2160},
}


def _j2v_render(
    video_url: str,
    start_seconds: float,
    end_seconds: float,
    format_: str,
    quality: str,
    caption: Optional[str],
    watermark_text: Optional[str],
    beat_sync: bool = False,
) -> Optional[str]:
    if not Config.JSON2VIDEO_API_KEY:
        log.warning("JSON2VIDEO_API_KEY not set, skipping JSON2Video")
        return None

    res = FORMAT_RESOLUTION.get(format_, {"width": 1080, "height": 1920})
    quality_res = QUALITY_RESOLUTION.get(quality, {"width": 1280, "height": 720})
    width = min(res["width"], quality_res["width"])
    height = min(res["height"], quality_res["height"])
    duration = max(0.5, end_seconds - start_seconds)

    elements = [{
        "type": "video", "src": video_url,
        "trim-start": start_seconds, "duration": duration,
        "width": width, "height": height, "x": 0, "y": 0,
    }]

    if caption:
        elements.append({
            "type": "text", "text": caption,
            "font-family": "Oswald", "font-size": 52, "font-weight": "bold",
            "color": "#FFFFFF", "stroke-color": "#000000", "stroke-width": 3,
            "x": "center", "y": height - 160, "width": width - 80, "height": 120,
            "start": 0, "duration": duration,
        })

    if watermark_text:
        elements.append({
            "type": "text", "text": watermark_text,
            "font-family": "Inter", "font-size": 28, "color": "#FFFFFF80",
            "x": 30, "y": 30, "start": 0, "duration": duration,
        })

    payload = {
        "resolution": "custom", "width": width, "height": height,
        "fps": 30, "quality": 80,
        "scenes": [{"comment": "ClipAI highlight", "elements": elements}],
    }
    headers = {"x-api-key": Config.JSON2VIDEO_API_KEY, "Content-Type": "application/json"}

    try:
        resp = requests.post(J2V_API, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        movie = resp.json().get("movie", {})
        movie_id = movie.get("id") or resp.json().get("id")
        if not movie_id:
            return None

        deadline = time.time() + 300
        while time.time() < deadline:
            time.sleep(5)
            sr = requests.get(f"{J2V_API}/{movie_id}", headers=headers, timeout=15)
            sr.raise_for_status()
            data = sr.json()
            status = data.get("movie", {}).get("status") or data.get("status")
            if status == "done":
                return data.get("movie", {}).get("url") or data.get("url")
            if status in ("error", "failed"):
                return None
        return None
    except Exception as e:
        log.error(f"JSON2Video exception: {e}")
        return None


# ─── FFmpeg renderer (fallback) ─────────────────────────────────────────────
def _ffmpeg_render(
    local_video: Path, output_path: Path,
    start_seconds: float, end_seconds: float,
    format_: str, quality: str,
    caption: Optional[str], watermark_text: Optional[str],
    beat_sync: bool = False,
) -> bool:
    quality_res = QUALITY_RESOLUTION.get(quality, {"width": 1280, "height": 720})
    width, height = quality_res["width"], quality_res["height"]
    duration = max(0.5, end_seconds - start_seconds)

    vf_parts = [
        f"scale={width}:{height}:force_original_aspect_ratio=decrease",
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",
    ]
    drawtext_opts = "fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    if caption:
        safe = caption.replace("'", "\\'").replace(":", "\\:")
        vf_parts.append(
            f"drawtext={drawtext_opts}:text='{safe}':fontcolor=white:fontsize=42"
            f":bordercolor=black:borderw=3:x=(w-text_w)/2:y=h-150"
        )
    if watermark_text:
        safe = watermark_text.replace("'", "\\'").replace(":", "\\:")
        vf_parts.append(
            f"drawtext={drawtext_opts}:text='{safe}':fontcolor=white@0.5:fontsize=22:x=20:y=20"
        )
    vf = ",".join(vf_parts)
    crf = {"480p": "28", "720p": "23", "1080p": "20", "4k": "18"}.get(quality, "23")

    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_seconds), "-i", str(local_video),
        "-t", str(duration), "-vf", vf,
        "-c:v", "libx264", "-crf", crf, "-preset", "fast",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
        str(output_path),
    ]
    log.info(f"FFmpeg: {' '.join(cmd[:6])}…")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        log.error(f"FFmpeg stderr: {result.stderr[-800:]}")
        return False
    return True


# ─── Background render worker ───────────────────────────────────────────────
def _do_render(job_id: str, payload: dict, user_id: str | None = None):
    work = WORK_DIR / job_id
    work.mkdir(parents=True, exist_ok=True)

    try:
        save_job(job_id, {
            "job_id": job_id, "user_id": user_id or "",
            "status": "rendering", "progress": 5, "engine": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        # ─── Extract + apply trim ───────────────────────────────────────────
        video_key = payload.get("videoKey", "")
        video_url = payload.get("videoUrl", "")
        start = float(payload.get("startSeconds", 0))
        end = float(payload.get("endSeconds", 30))

        # Apply trim slider values (v2: trimStart/trimEnd offset within clip)
        trim_start = payload.get("trimStart")
        trim_end = payload.get("trimEnd")
        if trim_start is not None and trim_end is not None:
            try:
                ts = float(trim_start)
                te = float(trim_end)
                # trim values are offsets within the detected clip
                start += ts
                end = start + (te - ts)
            except (TypeError, ValueError):
                pass

        format_ = payload.get("format", "tiktok")
        quality = payload.get("quality", "720p").lower()
        caption = payload.get("caption")
        watermark = payload.get("watermark")
        beat_sync = bool(payload.get("beatSync", False))

        download_url = None
        engine = None

        # ─── Try JSON2Video first ───────────────────────────────────────────
        if video_url:
            update_job(job_id, progress=15)
            j2v_url = _j2v_render(
                video_url, start, end, format_, quality, caption, watermark, beat_sync,
            )
            if j2v_url:
                download_url = j2v_url
                engine = "json2video"

        # ─── FFmpeg fallback ────────────────────────────────────────────────
        if not download_url:
            log.info(f"Job {job_id}: falling back to FFmpeg")
            update_job(job_id, progress=20)
            local_video = work / "source.mp4"

            if video_key:
                download_from_storage(video_key, local_video)
            elif video_url:
                r = requests.get(video_url, stream=True, timeout=120)
                r.raise_for_status()
                with open(local_video, "wb") as f:
                    for chunk in r.iter_content(65536):
                        f.write(chunk)
            else:
                raise ValueError("No video source provided for FFmpeg")

            update_job(job_id, progress=40)
            output_path = work / f"clip_{job_id}.mp4"
            ok = _ffmpeg_render(
                local_video, output_path, start, end, format_, quality,
                caption, watermark, beat_sync,
            )
            if not ok:
                raise RuntimeError("FFmpeg render failed")

            update_job(job_id, progress=80)
            obj_key = f"clips/{job_id}/clip.mp4"
            download_url = upload_to_storage(output_path, obj_key)
            engine = "ffmpeg"

        save_job(job_id, {
            "status": "done", "progress": 100,
            "downloadUrl": download_url, "engine": engine,
        })

        # ─── Persist clip record + award XP + debit credits ────────────────
        if user_id:
            try:
                credit_cost = Config.CREDIT_COSTS.get(f"render_{quality}", 20)
                award_credits(user_id, -credit_cost, f"render_{quality}", job_id)
                award_xp(user_id, "render", Config.XP_REWARDS["render"], job_id)

                # Insert clip row via Supabase REST
                if Config.SUPABASE_URL and Config.SUPABASE_SERVICE_KEY:
                    headers = {
                        "apikey": Config.SUPABASE_SERVICE_KEY,
                        "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
                        "Content-Type": "application/json",
                        "Prefer": "return=minimal",
                    }
                    requests.post(
                        f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/clips",
                        json={
                            "id": job_id, "user_id": user_id,
                            "title": caption or "Untitled clip",
                            "game": payload.get("game"),
                            "source_video_key": video_key,
                            "clip_url": download_url,
                            "start_seconds": start, "end_seconds": end,
                            "duration_seconds": int(end - start),
                            "format": format_, "quality": quality,
                            "caption": caption, "status": "ready",
                            "render_job_id": job_id,
                            "expires_at": (
                                datetime.now(timezone.utc).isoformat()
                            ),
                        }, headers=headers, timeout=10,
                    )
                    # Bump clips_used
                    p = fetch_profile(user_id) or {}
                    update_profile(user_id, {
                        "clips_used": p.get("clips_used", 0) + 1,
                        "last_active_date": datetime.now(timezone.utc).date().isoformat(),
                    })
            except Exception as exc:
                log.warning(f"Persist clip/credits failed: {exc}")

        log.info(f"Job {job_id} done via {engine}: {download_url}")

    except Exception as e:
        log.exception(f"Job {job_id} error")
        save_job(job_id, {"status": "error", "error": str(e), "progress": 100})
    finally:
        shutil.rmtree(work, ignore_errors=True)


# ════════════════════════════════════════════════════════════════════════════
# HEALTH
# ════════════════════════════════════════════════════════════════════════════
@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "service": "clipai-worker",
        "version": "2.0",
        "supabase": bool(Config.SUPABASE_URL),
        "redis": bool(Config.REDIS_URL),
    })


# ════════════════════════════════════════════════════════════════════════════
# AUTH
# ════════════════════════════════════════════════════════════════════════════
@app.route("/auth/me")
@require_auth
def auth_me():
    """Return the current user's profile. Frontend uses this after Supabase login.

    Also applies the daily streak: if `last_active_date` is yesterday or earlier,
    bump `streak_days`, award +5 credits (cap 50/day total streak credits) and +25 XP.
    """
    profile = request.profile
    user_id = profile["id"]

    # ─── Daily streak check ─────────────────────────────────────────────────
    today = date.today()
    last_active_str = profile.get("last_active_date")
    streak_bumped = False
    streak_credits = 0
    try:
        if last_active_str:
            # Postgres returns ISO date string
            last_active = date.fromisoformat(str(last_active_str)[:10])
        else:
            last_active = None
    except (ValueError, TypeError):
        last_active = None

    if last_active != today:
        new_streak = (profile.get("streak_days", 0) + 1) if last_active == (today - timedelta(days=1)) else 1
        # Award streak credits + XP only once per day
        update_profile(user_id, {
            "streak_days": new_streak,
            "last_active_date": today.isoformat(),
        })
        award_credits(user_id, 5, "daily_streak", reference_id=None)
        award_xp(user_id, "daily_streak", Config.XP_REWARDS["daily_streak"])
        streak_bumped = True
        streak_credits = 5
        # Refresh profile so returned values reflect the new state
        profile = fetch_profile(user_id) or profile
        profile["streak_days"] = new_streak

    return jsonify({
        "id": profile["id"],
        "email": profile.get("email", ""),
        "name": profile.get("full_name", "Gamer"),
        "plan": profile.get("plan", "free"),
        "credits": profile.get("credits", 0),
        "clipsUsed": profile.get("clips_used", 0),
        "referralCode": profile.get("referral_code", ""),
        "xp": profile.get("xp", 0),
        "streakDays": profile.get("streak_days", 0),
        "avatarUrl": profile.get("avatar_url"),
        "streakBumped": streak_bumped,
        "streakCreditsAwarded": streak_credits,
    })


# ════════════════════════════════════════════════════════════════════════════
# VIDEO EDITOR WAITLIST
# ════════════════════════════════════════════════════════════════════════════
@app.route("/waitlist/join", methods=["POST"])
def waitlist_join():
    """Join the v3 video editor waitlist.

    Body: { email, game_interest?, source? }
    - Idempotent (insert-or-noop on conflict).
    - If the email matches an existing profile, link user_id + award 25 credits once.
    - Returns { success, position, creditsAwarded }.
    """
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    if not email or "@" not in email:
        return jsonify({"error": "Valid email required"}), 400

    game_interest = (body.get("game_interest") or "").strip().lower() or None
    source = (body.get("source") or "upload_page").strip()

    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_KEY:
        # DB not configured — accept anyway so the UX doesn't break
        return jsonify({
            "success": True, "position": 1, "creditsAwarded": 0,
            "message": "You're on the list! We'll email you when the editor launches.",
        })

    headers = {
        "apikey": Config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    # Check if email already on waitlist
    check_url = (
        f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/waitlist?"
        f"email=eq.{email}&select=id,credits_awarded"
    )
    try:
        r = requests.get(check_url, headers=headers, timeout=10)
        existing = r.json() if r.ok else []
    except requests.RequestException:
        existing = []

    if existing:
        # Already on list — return their existing position
        count_url = (
            f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/waitlist?"
            f"created_at=lt.(select created_at from waitlist where email=eq.{email})"
        )
        try:
            cr = requests.head(count_url, headers={**headers, "Prefer": "count=exact"}, timeout=10)
            rng = cr.headers.get("content-range", "*/0")
            position = int(rng.split("/")[-1] or 1) + 1
        except (requests.RequestException, ValueError):
            position = 1
        return jsonify({
            "success": True, "position": position, "creditsAwarded": 0,
            "message": "You're already on the waitlist!",
        })

    # Try to link to existing profile by email
    profile_url = (
        f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/profiles?"
        f"email=eq.{email}&select=id,credits"
    )
    user_id = None
    credits_awarded = 0
    try:
        pr = requests.get(profile_url, headers=headers, timeout=10)
        if pr.ok:
            rows = pr.json()
            if rows:
                user_id = rows[0]["id"]
    except requests.RequestException:
        pass

    # Insert waitlist row
    payload = {
        "email": email,
        "user_id": user_id,
        "game_interest": game_interest,
        "source": source,
        "credits_awarded": False,
    }
    insert_url = f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/waitlist"
    try:
        ir = requests.post(insert_url, json=payload, headers={**headers, "Prefer": "return=minimal"}, timeout=10)
        if ir.status_code not in (200, 201):
            return jsonify({"error": "Could not join waitlist", "detail": ir.text}), 500
    except requests.RequestException as e:
        return jsonify({"error": "Network error", "detail": str(e)}), 500

    # Award 25 credits if linked to a real profile
    if user_id:
        if award_credits(user_id, 25, "waitlist_bonus"):
            # Mark as awarded
            upd_url = (
                f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/waitlist?"
                f"email=eq.{email}"
            )
            try:
                requests.patch(upd_url, json={"credits_awarded": True}, headers=headers, timeout=10)
            except requests.RequestException:
                pass
            credits_awarded = 25

    # Compute position (count rows created before this one)
    position = 1
    try:
        count_url = f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/waitlist?select=id"
        cr = requests.head(count_url, headers={**headers, "Prefer": "count=exact"}, timeout=10)
        rng = cr.headers.get("content-range", "*/0")
        position = int(rng.split("/")[-1] or 1)
    except (requests.RequestException, ValueError):
        pass

    return jsonify({
        "success": True,
        "position": position,
        "creditsAwarded": credits_awarded,
        "message": "Welcome to the v3 waitlist! We'll email you when the editor launches.",
    })


# ════════════════════════════════════════════════════════════════════════════
# VIDEO PIPELINE — upload / analyse / captions / render
# ════════════════════════════════════════════════════════════════════════════
@app.route("/upload", methods=["POST"])
@require_auth
def upload():
    if "video" not in request.files:
        return jsonify({"success": False, "error": "No video file"}), 400

    # ─── Server-side credit balance check ──────────────────────────────────
    profile = request.profile
    scan_cost = Config.CREDIT_COSTS["scan"]
    caption_cost = Config.CREDIT_COSTS["captions"]
    min_needed = scan_cost  # at least scan must be affordable
    if profile.get("credits", 0) < min_needed:
        return jsonify({
            "success": False,
            "error": "Insufficient credits",
            "required": min_needed,
            "balance": profile.get("credits", 0),
        }), 402

    file = request.files["video"]
    video_id = str(uuid.uuid4())
    work = WORK_DIR / video_id
    work.mkdir(parents=True, exist_ok=True)
    local_path = work / f"source{Path(file.filename or 'video.mp4').suffix}"
    file.save(str(local_path))
    log.info(f"Saved upload {video_id}: {local_path.stat().st_size} bytes")

    try:
        obj_key = f"uploads/{video_id}/source.mp4"
        pub_url = upload_to_storage(local_path, obj_key)
        return jsonify({
            "success": True, "videoId": video_id,
            "uploadUrl": pub_url, "videoKey": obj_key,
        })
    except Exception as e:
        log.error(f"Upload storage failed: {e}")
        return jsonify({
            "success": True, "videoId": video_id, "uploadUrl": "",
            "videoKey": f"uploads/{video_id}/source.mp4",
            "_local": str(local_path),
        })


def _parse_gemini_clips(text: str, clip_count: int) -> list:
    try:
        clean = text.strip()
        for fence in ["```json", "```"]:
            clean = clean.replace(fence, "")
        data = json.loads(clean.strip())
        clips = data if isinstance(data, list) else data.get("clips", [])
    except Exception:
        log.warning("Gemini returned non-JSON, using mock clips")
        clips = []

    result = []
    for i, c in enumerate(clips[:clip_count]):
        start_s = float(c.get("start_seconds", i * 60))
        end_s = float(c.get("end_seconds", start_s + 30))
        dur_s = end_s - start_s
        result.append({
            "id": str(uuid.uuid4()),
            "thumbnail": f"/gameplay-thumb-{(i % 3) + 1}.jpg",
            "startTime": f"{int(start_s // 60):02d}:{int(start_s % 60):02d}",
            "endTime": f"{int(end_s // 60):02d}:{int(end_s % 60):02d}",
            "startSeconds": start_s, "endSeconds": end_s,
            "hypeScore": int(c.get("hype_score", 80)),
            "duration": f"{int(dur_s // 60)}:{int(dur_s % 60):02d}",
            "caption": c.get("caption", ""),
            "selected": i == 0,
        })
    return result


GEMINI_PROMPT = """
You are an expert gaming highlight detector.
Analyse this video and find the TOP {n} most hype/exciting moments.
For each moment return ONLY a JSON array with objects:
{{
  "start_seconds": <number>,
  "end_seconds":   <number>,
  "hype_score":    <0-100 integer>,
  "caption":       "<short viral caption under 60 chars>"
}}
Game context: {game}
Return ONLY valid JSON. No explanation.
"""


@app.route("/analyse", methods=["POST"])
@require_auth
def analyse():
    body = request.get_json(force=True)
    video_id = body.get("videoId", "")
    game = body.get("game", "Gaming")
    clip_count = int(body.get("clipCount", 3))

    # Debit credits for scan
    scan_cost = Config.CREDIT_COSTS["scan"]
    profile = request.profile
    if profile.get("credits", 0) < scan_cost:
        return jsonify({"success": False, "error": "Insufficient credits for scan"}), 402
    award_credits(request.user_id, -scan_cost, "scan", video_id)
    award_xp(request.user_id, "analyse", Config.XP_REWARDS["analyse"], video_id)

    # Locate video
    video_path = None
    for ext in [".mp4", ".mov", ".webm"]:
        p = WORK_DIR / video_id / f"source{ext}"
        if p.exists():
            video_path = p
            break
    if not video_path:
        obj_key = f"uploads/{video_id}/source.mp4"
        video_path = WORK_DIR / video_id / "source.mp4"
        video_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            download_from_storage(obj_key, video_path)
        except Exception as e:
            return jsonify({"success": False, "error": f"Video not found: {e}"}), 404

    try:
        import google.generativeai as genai
        genai.configure(api_key=Config.GEMINI_API_KEY)
        model = genai.GenerativeModel(Config.GEMINI_MODEL)

        log.info(f"Uploading {video_path} to Gemini…")
        gfile = genai.upload_file(str(video_path))
        while gfile.state.name == "PROCESSING":
            time.sleep(3)
            gfile = genai.get_file(gfile.name)
        if gfile.state.name != "ACTIVE":
            raise RuntimeError(f"Gemini file processing failed: {gfile.state.name}")

        prompt = GEMINI_PROMPT.format(n=clip_count, game=game)
        response = model.generate_content([gfile, prompt])
        genai.delete_file(gfile.name)
        clips = _parse_gemini_clips(response.text, clip_count)

        upload_url = ""
        if Config.R2_PUBLIC_URL:
            upload_url = f"{Config.R2_PUBLIC_URL}/uploads/{video_id}/source.mp4"

        return jsonify({
            "success": True, "clips": clips,
            "videoId": video_id, "uploadUrl": upload_url,
        })
    except Exception as e:
        log.exception("Analyse error")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/analyse/youtube", methods=["POST"])
@require_auth
def analyse_youtube():
    body = request.get_json(force=True)
    yt_url = body.get("youtubeUrl", "")
    game = body.get("game", "Gaming")
    clip_count = int(body.get("clipCount", 3))
    if not yt_url:
        return jsonify({"success": False, "error": "No YouTube URL"}), 400

    # Debit scan credits
    scan_cost = Config.CREDIT_COSTS["scan"]
    if request.profile.get("credits", 0) < scan_cost:
        return jsonify({"success": False, "error": "Insufficient credits for scan"}), 402
    award_credits(request.user_id, -scan_cost, "scan_youtube", None)
    award_xp(request.user_id, "analyse", Config.XP_REWARDS["analyse"], None)

    video_id = str(uuid.uuid4())
    work = WORK_DIR / video_id
    work.mkdir(parents=True, exist_ok=True)
    local_path = work / "source.mp4"

    try:
        log.info(f"Downloading YouTube: {yt_url}")
        result = subprocess.run(
            ["yt-dlp", "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
             "--merge-output-format", "mp4", "-o", str(local_path), yt_url],
            capture_output=True, text=True, timeout=300,
        )
        if result.returncode != 0:
            raise RuntimeError(f"yt-dlp failed: {result.stderr[-300:]}")

        try:
            upload_url = upload_to_storage(local_path, f"uploads/{video_id}/source.mp4")
        except Exception:
            upload_url = ""

        import google.generativeai as genai
        genai.configure(api_key=Config.GEMINI_API_KEY)
        model = genai.GenerativeModel(Config.GEMINI_MODEL)
        gfile = genai.upload_file(str(local_path))
        while gfile.state.name == "PROCESSING":
            time.sleep(3)
            gfile = genai.get_file(gfile.name)
        prompt = GEMINI_PROMPT.format(n=clip_count, game=game)
        response = model.generate_content([gfile, prompt])
        genai.delete_file(gfile.name)
        clips = _parse_gemini_clips(response.text, clip_count)
        return jsonify({
            "success": True, "clips": clips,
            "videoId": video_id, "uploadUrl": upload_url,
        })
    except Exception as e:
        log.exception("YouTube analyse error")
        shutil.rmtree(work, ignore_errors=True)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/captions", methods=["POST"])
@require_auth
def captions():
    body = request.get_json(force=True)
    clips = body.get("clips", [])
    game = body.get("game", "Gaming")
    if not clips:
        return jsonify([])

    # Debit caption credits
    cap_cost = Config.CREDIT_COSTS["captions"]
    if request.profile.get("credits", 0) >= cap_cost:
        award_credits(request.user_id, -cap_cost, "captions", None)
        award_xp(request.user_id, "caption", Config.XP_REWARDS["caption"], None)

    try:
        client = _groq()
        clip_descs = "\n".join(
            f"{i+1}. Hype score {c['hypeScore']}, at {c['startTime']}–{c['endTime']}"
            for i, c in enumerate(clips)
        )
        prompt = f"""
You are a viral gaming content creator for {game}.
Generate a short, punchy caption for each highlight clip below.
Captions must be under 60 characters, use 1-2 emojis, and feel hype.
Return ONLY a JSON array of strings in order. No extra text.

Clips:
{clip_descs}
"""
        resp = client.chat.completions.create(
            model=Config.GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300, temperature=0.9,
        )
        raw = resp.choices[0].message.content.strip()
        for fence in ["```json", "```"]:
            raw = raw.replace(fence, "")
        captions_list = json.loads(raw.strip())
        enriched = []
        for i, clip in enumerate(clips):
            cap = captions_list[i] if i < len(captions_list) else clip.get("caption", "")
            enriched.append({**clip, "caption": cap})
        return jsonify(enriched)
    except Exception:
        log.exception("Captions error")
        return jsonify(clips)


@app.route("/render", methods=["POST"])
@require_auth
def render():
    body = request.get_json(force=True)
    profile = request.profile
    plan = profile.get("plan", "free")

    # ─── Server-side plan gating ───────────────────────────────────────────
    quality = (body.get("quality") or "720p").lower()
    if not can_use_quality(plan, quality):
        return jsonify({
            "success": False,
            "error": f"Plan '{plan}' cannot render at {quality}. Upgrade required.",
            "required_plan": "starter" if quality == "720p" else (
                "pro" if quality == "1080p" else "creator"
            ),
        }), 402

    if body.get("beatSync") and not can_use_feature(plan, "beat_sync"):
        return jsonify({
            "success": False,
            "error": "Beat sync requires Pro plan or higher",
        }), 402

    credit_cost = Config.CREDIT_COSTS.get(f"render_{quality}", 20)
    if profile.get("credits", 0) < credit_cost:
        return jsonify({
            "success": False, "error": "Insufficient credits for render",
            "required": credit_cost, "balance": profile.get("credits", 0),
        }), 402

    job_id = str(uuid.uuid4())
    video_id = body.get("clipId", body.get("videoId", ""))
    video_key = f"uploads/{video_id}/source.mp4"
    try:
        video_url = f"{Config.R2_PUBLIC_URL}/{video_key}"
    except Exception:
        video_url = body.get("videoUrl", "")

    payload = {**body, "videoKey": video_key, "videoUrl": video_url, "game": body.get("game")}

    save_job(job_id, {
        "job_id": job_id, "user_id": request.user_id,
        "status": "queued", "progress": 0, "engine": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    t = threading.Thread(
        target=_do_render, args=(job_id, payload, request.user_id), daemon=True
    )
    t.start()
    return jsonify({"jobId": job_id, "status": "queued"})


@app.route("/render/status/<job_id>")
@require_auth
def render_status(job_id):
    job = get_job(job_id)
    if not job:
        return jsonify({"status": "error", "error": "Job not found"}), 404
    return jsonify({"jobId": job_id, **job})


# ════════════════════════════════════════════════════════════════════════════
# CLIPS — list user's own
# ════════════════════════════════════════════════════════════════════════════
@app.route("/clips")
@require_auth
def list_clips():
    """List the current user's clips (most recent first)."""
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_KEY:
        return jsonify({"clips": []})
    headers = {
        "apikey": Config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
    }
    url = (
        f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/clips?"
        f"user_id=eq.{request.user_id}&order=created_at.desc&limit=20"
    )
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        rows = resp.json()
        return jsonify({"clips": rows})
    except requests.RequestException as e:
        return jsonify({"error": str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# LEADERBOARD + XP / RANK
# ════════════════════════════════════════════════════════════════════════════
RANK_TIERS = [
    {"name": "Rookie",        "min_xp": 0,     "color": "#9CA3AF"},
    {"name": "Clipper",       "min_xp": 500,   "color": "#3B82F6"},
    {"name": "Highlight Reel","min_xp": 2000,  "color": "#8B5CF6"},
    {"name": "Legend",        "min_xp": 5000,  "color": "#F59E0B"},
    {"name": "GOD TIER",      "min_xp": 10000, "color": "#EF4444"},
]


def _tier_for_xp(xp: int) -> dict:
    tier = RANK_TIERS[0]
    for t in RANK_TIERS:
        if xp >= t["min_xp"]:
            tier = t
    return tier


@app.route("/leaderboard")
@require_auth
def leaderboard():
    """Top 100 + current user's rank. ?type=alltime|weekly"""
    lb_type = request.args.get("type", "alltime")
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_KEY:
        return jsonify({"players": [], "currentUser": None})

    headers = {
        "apikey": Config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
    }
    view = "leaderboard_alltime" if lb_type == "alltime" else "leaderboard_weekly"
    url = f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/{view}?order=rank.asc&limit=100"
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        rows = resp.json()
        # Find current user
        me = next((r for r in rows if r["id"] == request.user_id), None)
        if me is None:
            # User not in top 100 — fetch their row directly
            my_url = (
                f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/{view}?"
                f"id=eq.{request.user_id}"
            )
            r2 = requests.get(my_url, headers=headers, timeout=10)
            if r2.ok:
                arr = r2.json()
                me = arr[0] if arr else {"rank": 999, "id": request.user_id, "xp": 0}
        return jsonify({"players": rows, "currentUser": me})
    except requests.RequestException as e:
        return jsonify({"error": str(e)}), 500


@app.route("/rank/me")
@require_auth
def rank_me():
    """Return current user's XP, tier, streak, and global rank."""
    profile = request.profile
    xp = profile.get("xp", 0)
    tier = _tier_for_xp(xp)
    next_tier = next((t for t in RANK_TIERS if t["min_xp"] > xp), None)

    # Compute global rank by counting users with higher XP
    rank = 999
    if Config.SUPABASE_URL and Config.SUPABASE_SERVICE_KEY:
        headers = {
            "apikey": Config.SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
            "Prefer": "count=exact",
        }
        url = (
            f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/profiles?"
            f"xp=gt.{xp}&select=id"
        )
        try:
            r = requests.head(url, headers=headers, timeout=10)
            count_header = r.headers.get("content-range", "*/0")
            if "/" in count_header:
                rank = int(count_header.split("/")[-1] or 0) + 1
        except requests.RequestException:
            pass

    # Weekly XP
    weekly_xp = 0
    if Config.SUPABASE_URL and Config.SUPABASE_SERVICE_KEY:
        headers = {"apikey": Config.SUPABASE_SERVICE_KEY,
                   "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}"}
        url = (
            f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/xp_events?"
            f"user_id=eq.{request.user_id}&created_at=gt."
            f"{(datetime.now(timezone.utc).timestamp() - 7*86400)}&select=xp_delta"
        )
        try:
            r = requests.get(url, headers=headers, timeout=10)
            if r.ok:
                weekly_xp = sum(row.get("xp_delta", 0) for row in r.json())
        except requests.RequestException:
            pass

    return jsonify({
        "xp": xp, "weeklyXp": weekly_xp,
        "tier": tier,
        "nextTier": next_tier,
        "globalRank": rank,
        "streakDays": profile.get("streak_days", 0),
        "clipsAnalysed": profile.get("clips_used", 0),
    })


# ════════════════════════════════════════════════════════════════════════════
# REFERRALS
# ════════════════════════════════════════════════════════════════════════════
@app.route("/referrals/stats")
@require_auth
def referrals_stats():
    """Total referrals, credits earned, top 5 referred users."""
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_KEY:
        return jsonify({"total": 0, "creditsEarned": 0, "referred": []})
    headers = {
        "apikey": Config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
    }
    url = (
        f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/referrals?"
        f"referrer_id=eq.{request.user_id}&select=referred_id,credits_awarded_referrer,created_at"
    )
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        rows = resp.json()
        total = len(rows)
        credits_earned = sum(r.get("credits_awarded_referrer", 0) for r in rows)
        return jsonify({
            "total": total,
            "creditsEarned": credits_earned,
            "referred": rows[:5],
        })
    except requests.RequestException as e:
        return jsonify({"error": str(e)}), 500


@app.route("/referrals/apply", methods=["POST"])
@require_auth
def referrals_apply():
    """Validate a referral code (e.g. before checkout)."""
    body = request.get_json(force=True)
    code = (body.get("code") or "").upper().strip()
    if not code:
        return jsonify({"valid": False, "error": "No code provided"}), 400

    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_KEY:
        return jsonify({"valid": False, "error": "DB not configured"}), 500

    headers = {
        "apikey": Config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
    }
    url = (
        f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/profiles?"
        f"referral_code=eq.{code}&select=id,full_name"
    )
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        rows = resp.json()
        if not rows:
            return jsonify({"valid": False, "error": "Code not found"})
        owner = rows[0]
        if owner["id"] == request.user_id:
            return jsonify({"valid": False, "error": "Cannot use your own code"})
        return jsonify({
            "valid": True,
            "ownerName": owner.get("full_name", "Gamer"),
            "discountPercent": 10,  # 10% off first payment
        })
    except requests.RequestException as e:
        return jsonify({"valid": False, "error": str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# PAYSTACK — proper init + webhook persistence
# ════════════════════════════════════════════════════════════════════════════
PLAN_MAP = {
    "clipai-starter": "starter",
    "clipai-pro": "pro",
    "clipai-creator": "creator",
    "starter": "starter",
    "pro": "pro",
    "creator": "creator",
}

PLAN_AMOUNT_KOBO = {  # monthly
    "starter": 1000 * 100,
    "pro": 2500 * 100,
    "creator": 6000 * 100,
}


@app.route("/payment/init", methods=["POST"])
@require_auth
def payment_init():
    """Initialize a Paystack transaction with plan_code + user_id in metadata."""
    body = request.get_json(force=True)
    plan = (body.get("plan") or "pro").lower()
    if plan not in PLAN_AMOUNT_KOBO:
        return jsonify({"error": f"Invalid plan: {plan}"}), 400

    interval = body.get("interval", "monthly")  # monthly | annual
    amount = PLAN_AMOUNT_KOBO[plan]
    if interval == "annual":
        amount = int(amount * 12 * 0.8)  # 20% off

    callback_url = body.get("callbackUrl") or (
        "https://clipai-bqo.pages.dev/?payment=success"
    )

    payload = {
        "email": request.profile.get("email"),
        "amount": amount,
        "currency": "NGN",
        "callback_url": callback_url,
        "metadata": {
            "user_id": request.user_id,
            "plan_code": plan,
            "interval": interval,
            "referral_code": body.get("referralCode", ""),
        },
    }
    headers = {
        "Authorization": f"Bearer {Config.PAYSTACK_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    try:
        resp = requests.post(
            f"{Config.PAYSTACK_API_URL}/transaction/initialize",
            json=payload, headers=headers, timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return jsonify({
            "authorization_url": data["data"]["authorization_url"],
            "reference": data["data"]["reference"],
            "amount_kobo": amount,
            "plan": plan,
        })
    except requests.RequestException as e:
        log.error(f"Paystack init failed: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/payment/webhook", methods=["POST"])
def paystack_webhook():
    """Paystack → server callback. Verifies signature, persists plan upgrade."""
    secret = Config.PAYSTACK_SECRET_KEY or ""
    sig = request.headers.get("X-Paystack-Signature", "")
    body = request.get_data()
    expected = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()
    if sig != expected:
        return jsonify({"error": "Invalid signature"}), 401

    event = request.get_json(force=True)
    log.info(f"Paystack event: {event.get('event')}")

    if event.get("event") == "charge.success":
        data = event.get("data", {})
        reference = data.get("reference", "")
        metadata = data.get("metadata", {}) or {}
        plan_code = metadata.get("plan_code", "")
        plan_name = PLAN_MAP.get(plan_code, "pro")
        user_id = metadata.get("user_id", "")
        amount = data.get("amount", 0)

        if user_id and Config.SUPABASE_URL:
            # 1. Update user plan + grant monthly credits
            monthly_credits = Config.PLAN_FEATURES.get(plan_name, {}).get(
                "credits_monthly", 0
            )
            update_profile(user_id, {
                "plan": plan_name,
                "credits": monthly_credits,  # reset to monthly quota
            })
            # 2. Award bonus XP for paying
            award_xp(user_id, "referral_paid", Config.XP_REWARDS["referral_paid"], None)

            # 3. If referred, mark referral as paid + award referrer
            ref_code = metadata.get("referral_code", "")
            if ref_code:
                headers = {
                    "apikey": Config.SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=representation",
                }
                # Find referrer by code
                r = requests.get(
                    f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/profiles?"
                    f"referral_code=eq.{ref_code.upper()}&select=id",
                    headers=headers, timeout=10,
                )
                if r.ok and r.json():
                    referrer_id = r.json()[0]["id"]
                    # Mark referral as paid
                    requests.patch(
                        f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/referrals?"
                        f"referred_id=eq.{user_id}",
                        json={"paid": True}, headers=headers, timeout=10,
                    )
                    # Award 200 XP bonus to referrer
                    award_xp(referrer_id, "referral_paid",
                             Config.XP_REWARDS["referral_paid"], user_id)
                    award_credits(referrer_id, 50, "referral_paid_bonus", user_id)

            # 4. Insert subscription record
            headers = {
                "apikey": Config.SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            }
            requests.post(
                f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/subscriptions",
                json={
                    "user_id": user_id, "plan": plan_name,
                    "paystack_ref": reference, "status": "success",
                    "amount_kobo": amount,
                    "interval": metadata.get("interval", "monthly"),
                }, headers=headers, timeout=10,
            )
            log.info(f"Payment success persisted: user={user_id} plan={plan_name}")

    return jsonify({"status": "ok"})


@app.route("/payment/verify")
@require_auth
def verify_payment():
    reference = request.args.get("reference", "")
    if not reference:
        return jsonify({"success": False, "error": "No reference"}), 400

    headers = {"Authorization": f"Bearer {Config.PAYSTACK_SECRET_KEY}"}
    try:
        resp = requests.get(
            f"{Config.PAYSTACK_API_URL}/transaction/verify/{reference}",
            headers=headers, timeout=15,
        )
        data = resp.json()
        if not data.get("status") or data["data"].get("status") != "success":
            return jsonify({"success": False, "error": "Payment not verified"})

        metadata = data["data"].get("metadata", {}) or {}
        plan_code = metadata.get("plan_code", "")
        plan_name = PLAN_MAP.get(plan_code, "pro")
        return jsonify({"success": True, "plan": plan_name, "reference": reference})
    except requests.RequestException as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# SETTINGS — profile updates
# ════════════════════════════════════════════════════════════════════════════
@app.route("/settings/profile", methods=["PATCH"])
@require_auth
def settings_profile():
    body = request.get_json(force=True)
    fields: dict[str, Any] = {}
    if "full_name" in body:
        fields["full_name"] = str(body["full_name"])[:100]
    if "avatar_url" in body:
        fields["avatar_url"] = str(body["avatar_url"])[:500]
    if not fields:
        return jsonify({"error": "No updatable fields"}), 400
    if update_profile(request.user_id, fields):
        return jsonify({"success": True})
    return jsonify({"error": "Update failed"}), 500


@app.route("/settings/notifications", methods=["PATCH"])
@require_auth
def settings_notifications():
    body = request.get_json(force=True)
    prefs = request.profile.get("notification_prefs", {}) or {}
    for key in ("email_updates", "product_news", "clip_ready", "weekly_digest"):
        if key in body:
            prefs[key] = bool(body[key])
    if update_profile(request.user_id, {"notification_prefs": prefs}):
        return jsonify({"success": True, "prefs": prefs})
    return jsonify({"error": "Update failed"}), 500


# ════════════════════════════════════════════════════════════════════════════
# FORGE VOTING
# ════════════════════════════════════════════════════════════════════════════
@app.route("/forge/vote", methods=["POST"])
@require_auth
def forge_vote():
    body = request.get_json(force=True)
    caption = (body.get("caption") or "").strip()
    vote = int(body.get("vote", 0))  # +1 or -1
    if not caption or vote not in (-1, 1):
        return jsonify({"error": "Invalid vote"}), 400

    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_KEY:
        return jsonify({"success": False, "error": "DB not configured"}), 500

    headers = {
        "apikey": Config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    # Upsert: delete existing vote then insert new
    requests.delete(
        f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/caption_votes?"
        f"user_id=eq.{request.user_id}&caption_text=eq.{caption}",
        headers=headers, timeout=10,
    )
    payload = {
        "user_id": request.user_id, "caption_text": caption, "vote": vote,
        "game": body.get("game"), "vibe": body.get("vibe"),
    }
    try:
        requests.post(
            f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/caption_votes",
            json=payload, headers=headers, timeout=10,
        )
        award_xp(request.user_id, "clips_voted", Config.XP_REWARDS["clips_voted"], None)
        return jsonify({"success": True})
    except requests.RequestException as e:
        return jsonify({"error": str(e)}), 500


@app.route("/forge/top-captions")
def forge_top_captions():
    """Top voted captions this week. Public."""
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_KEY:
        return jsonify({"captions": []})
    headers = {
        "apikey": Config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
    }
    # Use RPC-free approach: just fetch recent votes
    url = (
        f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/caption_votes?"
        f"created_at=gt.{(datetime.now(timezone.utc).timestamp() - 7*86400)}"
        f"&select=caption_text,vote,game,vibe&order=created_at.desc&limit=50"
    )
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        rows = resp.json()
        # Aggregate
        agg: dict[str, dict] = {}
        for r in rows:
            t = r["caption_text"]
            if t not in agg:
                agg[t] = {"caption": t, "score": 0, "game": r.get("game"), "vibe": r.get("vibe")}
            agg[t]["score"] += r["vote"]
        top = sorted(agg.values(), key=lambda x: x["score"], reverse=True)[:10]
        return jsonify({"captions": top})
    except requests.RequestException as e:
        return jsonify({"error": str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# CLIPBOT — chat + history persistence
# ════════════════════════════════════════════════════════════════════════════
CLIPBOT_SYSTEM = """You are ClipBot, an expert AI gaming content coach built into ClipAI.
You help gaming content creators — especially Nigerian and African teenagers — grow their channels,
go viral, and create better content.

You know everything about:
- TikTok, YouTube Shorts, Instagram Reels algorithms
- What makes gaming clips go viral in Nigeria/Africa
- Titles, captions, hashtags, hooks that actually work
- Growth strategies for small channels
- Free Fire, Bloodstrike, PUBG, COD, Mobile Legends content trends
- Best posting times for Nigerian audiences (WAT timezone)

Tone: Friendly, hype, knowledgeable. Like a big brother who's a successful gaming creator.
Be direct. Use bullet points. Keep responses under 200 words unless a detailed plan is needed.
Don't be corporate. Say "bro" occasionally. Use gaming slang naturally."""


@app.route("/clipbot", methods=["POST"])
@require_auth
def clipbot():
    body = request.get_json(force=True)
    message = body.get("message", "")
    history = body.get("history", [])
    if not message:
        return jsonify({"error": "No message"}), 400

    # ─── Plan-gated message limit (server-side) ────────────────────────────
    plan = request.profile.get("plan", "free")
    daily_limit = Config.PLAN_FEATURES.get(plan, {}).get("clipbot_daily_limit", 10)
    if daily_limit > 0:
        # Count messages in last 24h from Supabase
        if Config.SUPABASE_URL and Config.SUPABASE_SERVICE_KEY:
            headers = {
                "apikey": Config.SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
                "Prefer": "count=exact",
            }
            cutoff = datetime.now(timezone.utc).isoformat()
            url = (
                f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/clipbot_history?"
                f"user_id=eq.{request.user_id}&created_at=lt.{cutoff}&select=id"
            )
            try:
                r = requests.head(url, headers=headers, timeout=10)
                count_h = r.headers.get("content-range", "*/0")
                if "/" in count_h:
                    used_today = int(count_h.split("/")[-1] or 0)
                    if used_today >= daily_limit:
                        return jsonify({
                            "error": "Daily message limit reached",
                            "limit": daily_limit, "used": used_today,
                            "upgrade_required": True,
                        }), 402
            except requests.RequestException:
                pass

    # Optional live-search context
    search_keywords = ["trending", "viral", "best time", "hashtag", "title", "grow", "algorithm"]
    extra_context = ""
    if any(kw in message.lower() for kw in search_keywords):
        results = _serp_search(f"gaming content creator tips {message[:60]} 2025 Nigeria", num=3)
        if results:
            extra_context = "\n\nLive context:\n" + "\n".join(r.get("snippet", "") for r in results[:2])

    try:
        client = _groq()
        msgs = [{"role": "system", "content": CLIPBOT_SYSTEM}]
        for h in history[-8:]:
            msgs.append({"role": h["role"], "content": h["content"]})
        msgs.append({"role": "user", "content": message + extra_context})

        resp = client.chat.completions.create(
            model=Config.GROQ_MODEL,
            messages=msgs, max_tokens=600, temperature=0.9,
        )
        reply = resp.choices[0].message.content.strip()

        # ─── Persist user msg + reply ──────────────────────────────────────
        if Config.SUPABASE_URL and Config.SUPABASE_SERVICE_KEY:
            headers = {
                "apikey": Config.SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            }
            for role, content in (("user", message), ("assistant", reply)):
                requests.post(
                    f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/clipbot_history",
                    json={"user_id": request.user_id, "role": role, "content": content},
                    headers=headers, timeout=10,
                )
            award_xp(request.user_id, "chat_message",
                     Config.XP_REWARDS["chat_message"], None)

        return jsonify({"reply": reply})
    except Exception as e:
        log.error(f"ClipBot error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/clipbot/history")
@require_auth
def clipbot_history():
    """Get last 50 chat messages for the current user."""
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_KEY:
        return jsonify({"history": []})
    headers = {
        "apikey": Config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
    }
    url = (
        f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/clipbot_history?"
        f"user_id=eq.{request.user_id}&order=created_at.desc&limit=50&select=role,content,created_at"
    )
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        rows = resp.json()
        # Reverse so oldest is first
        rows.reverse()
        return jsonify({"history": rows})
    except requests.RequestException as e:
        return jsonify({"error": str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# TREND RADAR + FORGE + GROWTH INTEL (v4.2 — hybrid multi-platform)
# ════════════════════════════════════════════════════════════════════════════
# Hybrid model — only TikTok + Twitter/X go through SerpAPI (no free API),
# everything else uses free native APIs:
#   • YouTube      → YouTube Data API v3
#   • Reddit       → PRAW (or public JSON fallback)
#   • Twitch       → Twitch Helix API
#   • Google Trends → pytrends
#   • TikTok       → SerpAPI (paid, ~$1.50/100 calls)
#   • Twitter/X    → SerpAPI (paid, shares quota)
# ════════════════════════════════════════════════════════════════════════════

# Per-game subreddit map (covers all 7 games in the selector + All)
GAME_SUBREDDITS = {
    "valorant": ["valorant", "valorantclips", "valorantcompetitive"],
    "apex": ["apexlegends", "apexclips"],
    "apex legends": ["apexlegends", "apexclips"],
    "fortnite": ["fortnitebr", "fortniteclips"],
    "minecraft": ["minecraft", "minecraftbuilds"],
    "roblox": ["roblox", "robloxgamedev"],
    "call of duty": ["modernwarfare", "callofduty", "warzone"],
    "warzone": ["warzone", "modernwarfare"],
    "all": ["gaming", "gamingsclips"],
}

# Twitch game_id cache (Helix requires numeric game_id for filtering)
_TWITCH_GAME_CACHE: dict[str, str] = {}

# Module-level Reddit client (lazy)
_reddit_client = None


def _get_reddit():
    """Lazily build a PRAW Reddit instance. Returns None if creds missing."""
    global _reddit_client
    if _reddit_client is not None:
        return _reddit_client
    if not all([Config.REDDIT_CLIENT_ID, Config.REDDIT_CLIENT_SECRET]):
        return None
    try:
        import praw
        _reddit_client = praw.Reddit(
            client_id=Config.REDDIT_CLIENT_ID,
            client_secret=Config.REDDIT_CLIENT_SECRET,
            user_agent=Config.REDDIT_USER_AGENT,
        )
        _reddit_client.read_only = True
        return _reddit_client
    except Exception as e:
        log.warning(f"PRAW init failed, will fall back to public JSON: {e}")
        return None


def _reddit_top(game: str, limit: int = 8) -> list[dict]:
    """Return rising/hot gaming posts from subreddits matching the game.

    Tries PRAW first, then falls back to public .json endpoints (no auth needed,
    but rate-limited harder). Returns list of {title, score, url, subreddit}.
    """
    key = (game or "all").lower().strip()
    subs = GAME_SUBREDDITS.get(key, GAME_SUBREDDITS["all"])
    out: list[dict] = []

    reddit = _get_reddit()
    if reddit:
        try:
            for sub_name in subs[:2]:  # limit to 2 subs to keep latency low
                sub = reddit.subreddit(sub_name)
                for post in sub.top(time_filter="day", limit=limit):
                    if post.score < 50:
                        continue
                    out.append({
                        "title": post.title,
                        "score": post.score,
                        "url": post.url,
                        "subreddit": sub_name,
                        "platform": "reddit",
                    })
                    if len(out) >= limit:
                        return out
        except Exception as e:
            log.warning(f"PRAW fetch failed: {e}")

    # Fallback: public JSON (no auth)
    if not out:
        for sub_name in subs[:2]:
            try:
                r = requests.get(
                    f"https://www.reddit.com/r/{sub_name}/top.json?t=day&limit={limit}",
                    headers={"User-Agent": Config.REDDIT_USER_AGENT},
                    timeout=8,
                )
                r.raise_for_status()
                for child in r.json().get("data", {}).get("children", []):
                    d = child.get("data", {})
                    if d.get("score", 0) < 50:
                        continue
                    out.append({
                        "title": d.get("title", ""),
                        "score": d.get("score", 0),
                        "url": f"https://reddit.com{d.get('permalink', '')}",
                        "subreddit": sub_name,
                        "platform": "reddit",
                    })
                    if len(out) >= limit:
                        return out
            except Exception as e:
                log.warning(f"Reddit JSON fallback for r/{sub_name} failed: {e}")
    return out


def _twitch_app_token() -> str | None:
    """Get a Twitch app access token via client_credentials."""
    if not all([Config.TWITCH_CLIENT_ID, Config.TWITCH_CLIENT_SECRET]):
        return None
    try:
        r = requests.post("https://id.twitch.tv/oauth2/token", data={
            "client_id": Config.TWITCH_CLIENT_ID,
            "client_secret": Config.TWITCH_CLIENT_SECRET,
            "grant_type": "client_credentials",
        }, timeout=8)
        r.raise_for_status()
        return r.json().get("access_token")
    except Exception as e:
        log.warning(f"Twitch token failed: {e}")
        return None


def _twitch_game_id(game: str, token: str) -> str | None:
    """Look up Twitch game_id (cached in memory)."""
    if not Config.TWITCH_CLIENT_ID:
        return None
    key = (game or "").lower().strip()
    if key in _TWITCH_GAME_CACHE:
        return _TWITCH_GAME_CACHE[key]
    if not key or key == "all":
        # Treat "all" as no game filter
        _TWITCH_GAME_CACHE[key] = ""
        return ""
    try:
        r = requests.get("https://api.twitch.tv/helix/games", params={"name": game}, headers={
            "Client-ID": Config.TWITCH_CLIENT_ID,
            "Authorization": f"Bearer {token}",
        }, timeout=8)
        r.raise_for_status()
        data = r.json().get("data", [])
        if data:
            gid = data[0]["id"]
            _TWITCH_GAME_CACHE[key] = gid
            return gid
    except Exception as e:
        log.warning(f"Twitch game lookup for '{game}' failed: {e}")
    _TWITCH_GAME_CACHE[key] = ""
    return ""


def _twitch_top(game: str, limit: int = 8) -> list[dict]:
    """Return top live streams for the game (or all top streams if no game)."""
    token = _twitch_app_token()
    if not token:
        return []
    gid = _twitch_game_id(game, token)
    params: dict[str, Any] = {"first": limit}
    if gid:
        params["game_id"] = gid
    try:
        r = requests.get("https://api.twitch.tv/helix/streams", params=params, headers={
            "Client-ID": Config.TWITCH_CLIENT_ID,
            "Authorization": f"Bearer {token}",
        }, timeout=8)
        r.raise_for_status()
        out = []
        for s in r.json().get("data", [])[:limit]:
            out.append({
                "title": s.get("title", ""),
                "viewers": s.get("viewer_count", 0),
                "streamer": s.get("user_name", ""),
                "game": s.get("game_name", game or "Unknown"),
                "url": f"https://twitch.tv/{s.get('user_name', '')}",
                "platform": "twitch",
            })
        return out
    except Exception as e:
        log.warning(f"Twitch streams failed: {e}")
        return []


def _google_trends(game: str, limit: int = 6) -> list[dict]:
    """Return rising Google search queries related to the game."""
    try:
        from pytrends.request import TrendReq
        pytrends = TrendReq(hl="en-US", tz=60, timeout=(5, 8), retries=1, backoff_factor=0.3)
        kw = f"{game} gaming" if game and game.lower() != "all" else "gaming"
        pytrends.build_payload([kw], timeframe="now 7-d", geo="")
        related = pytrends.related_queries().get(kw, {}).get("rising", [])
        out = []
        for r in (related or [])[:limit]:
            out.append({
                "title": r.get("query", ""),
                "value": r.get("value", 0),
                "platform": "google_trends",
            })
        return out
    except Exception as e:
        log.warning(f"Google Trends failed: {e}")
        return []


def _serp_search(query: str, num: int = 10, engine: str = "google") -> list:
    """Call SerpAPI.

    Default engine is 'google' for legacy compatibility (forge endpoints).
    For trend aggregation, call with engine='tiktok_search' or 'twitter_search'
    to pull cross-platform gaming hashtags that have no free API.
    """
    if not Config.SERPAPI_KEY:
        return []
    try:
        params = {
            "engine": engine,
            "q": query,
            "num": num,
            "api_key": Config.SERPAPI_KEY,
        }
        r = requests.get("https://serpapi.com/search", params=params, timeout=12)
        r.raise_for_status()
        data = r.json()
        # Different engines return different shapes
        if engine == "tiktok_search":
            return data.get("video_results", []) or data.get("organic_results", [])
        if engine == "twitter_search":
            return data.get("tweets", []) or data.get("organic_results", [])
        return data.get("organic_results", [])
    except Exception as e:
        log.warning(f"SerpAPI ({engine}) error: {e}")
        return []


def _serp_tiktok(game: str, limit: int = 6) -> list[dict]:
    """Pull trending TikTok videos for a game via SerpAPI."""
    q = f"{game} gaming viral" if game and game.lower() != "all" else "gaming viral 2026"
    raw = _serp_search(q, num=limit, engine="tiktok_search")
    out = []
    for v in raw[:limit]:
        out.append({
            "title": v.get("title") or v.get("desc", ""),
            "views": v.get("play_count") or v.get("views", 0),
            "author": v.get("author") or v.get("channel", ""),
            "url": v.get("link") or v.get("watch_url", ""),
            "platform": "tiktok",
        })
    return out


def _serp_twitter(game: str, limit: int = 6) -> list[dict]:
    """Pull trending tweets for a game via SerpAPI."""
    q = f"{game} gaming #clips" if game and game.lower() != "all" else "gaming clips viral 2026"
    raw = _serp_search(q, num=limit, engine="twitter_search")
    out = []
    for t in raw[:limit]:
        out.append({
            "title": t.get("text") or t.get("title", ""),
            "views": t.get("views") or t.get("retweet_count", 0),
            "author": t.get("user", {}).get("name", "") if isinstance(t.get("user"), dict) else str(t.get("user", "")),
            "url": t.get("link") or t.get("url", ""),
            "platform": "twitter",
        })
    return out


def _yt_trending(game: str, max_results: int = 15) -> list:
    if not Config.YOUTUBE_API_KEY:
        return []
    try:
        resp = requests.get("https://www.googleapis.com/youtube/v3/search", params={
            "part": "snippet", "q": f"{game} gaming highlights",
            "type": "video", "videoDuration": "short",
            "order": "viewCount", "maxResults": max_results,
            "key": Config.YOUTUBE_API_KEY, "regionCode": "NG",
        }, timeout=10)
        resp.raise_for_status()
        return resp.json().get("items", [])
    except Exception as e:
        log.warning(f"YouTube API error: {e}")
        return []


def _groq_text(prompt: str, system: str = "", max_tokens: int = 800) -> str:
    client = _groq()
    msgs = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})
    resp = client.chat.completions.create(
        model=Config.GROQ_MODEL,
        messages=msgs, max_tokens=max_tokens, temperature=0.85,
    )
    return resp.choices[0].message.content.strip()


def _groq_json(prompt: str, system: str = "") -> dict | list:
    raw = _groq_text(prompt, system, max_tokens=1200)
    for fence in ["```json", "```"]:
        raw = raw.replace(fence, "")
    return json.loads(raw.strip())


@app.route("/trends")
def trends():
    """Hybrid multi-platform trend radar.

    Pulls real data from 6 platforms:
      • YouTube (free Data API) — trending video titles
      • Reddit (PRAW or public JSON) — top posts of the day from gaming subreddits
      • Twitch (free Helix API) — top live streams for the game
      • Google Trends (pytrends) — rising search queries
      • TikTok (SerpAPI paid) — viral clips (premium)
      • Twitter/X (SerpAPI paid) — trending tweets (premium)

    Then asks Groq to synthesize everything into a single ranked trend list with
    a `platform` field per item so the frontend can show platform badges.
    """
    game = request.args.get("game", "").strip()
    game_label = game or "All"

    # Fetch from all sources in sequence (each helper handles its own failures)
    yt_results = _yt_trending(game or "gaming", max_results=10)
    reddit_results = _reddit_top(game, limit=8)
    twitch_results = _twitch_top(game, limit=8)
    trends_results = _google_trends(game, limit=6)
    tiktok_results = _serp_tiktok(game, limit=6)
    twitter_results = _serp_twitter(game, limit=6)

    # Compress raw data into a context block for Groq
    yt_titles = "\n".join(
        f"- {it.get('snippet', {}).get('title', '')} (channel: {it.get('snippet', {}).get('channelTitle', '')})"
        for it in yt_results[:8]
    ) or "No YouTube data available."
    reddit_block = "\n".join(
        f"- {r['title']} (r/{r['subreddit']}, score: {r['score']})"
        for r in reddit_results[:6]
    ) or "No Reddit data available."
    twitch_block = "\n".join(
        f"- {t['streamer']}: {t['title']} ({t['viewers']} viewers, {t['game']})"
        for t in twitch_results[:6]
    ) or "No Twitch data available."
    gtrends_block = "\n".join(
        f"- {t['title']} (+{t['value']}% growth)"
        for t in trends_results[:5]
    ) or "No Google Trends data available."
    tiktok_block = "\n".join(
        f"- {t['title']} (@{t['author']}, {t['views']} views)"
        for t in tiktok_results[:5]
    ) or "No TikTok data available (SerpAPI key missing or quota exhausted)."
    twitter_block = "\n".join(
        f"- {t['title']} (@{t['author']}, {t['views']} impressions)"
        for t in twitter_results[:5]
    ) or "No Twitter data available (SerpAPI key missing or quota exhausted)."

    system = "You are a viral gaming content trend analyst. Return ONLY valid JSON."
    prompt = f"""
Synthesize these live cross-platform signals into the TOP 12 trending items
for gaming content creators right now. Each trend MUST tag the platform where it
originated so the frontend can render a badge.

=== YOUTUBE (trending short videos) ===
{yt_titles}

=== REDDIT (top posts of the day from gaming subs) ===
{reddit_block}

=== TWITCH (top live streams right now) ===
{twitch_block}

=== GOOGLE TRENDS (rising search queries, last 7 days) ===
{gtrends_block}

=== TIKTOK (viral clips via SerpAPI) ===
{tiktok_block}

=== TWITTER/X (trending tweets via SerpAPI) ===
{twitter_block}

Game focus: {game_label}

Return a JSON object:
{{
  "game": "{game_label}",
  "updatedAt": "<ISO timestamp>",
  "sources": {{
    "youtube": <int count of items we received>,
    "reddit": <int>,
    "twitch": <int>,
    "google_trends": <int>,
    "tiktok": <int>,
    "twitter": <int>
  }},
  "trends": [
    {{
      "id": "<unique id>",
      "name": "<trend name/phrase>",
      "category": "<one of: title|hashtag|sound|challenge>",
      "game": "<game name or All>",
      "platform": "<one of: youtube|reddit|twitch|google_trends|tiktok|twitter>",
      "score": <0-100 integer>,
      "change": <percentage change integer, can be negative>,
      "status": "<rising|peaked|falling>",
      "views": "<e.g. 1.2M>",
      "example": "<optional short example usage>"
    }}
  ]
}}

Rules:
- Distribute trends across platforms; do not let YouTube dominate.
- If a platform returned no data, do not invent trends for it.
- Make trends specific, actionable, and relevant to Nigerian/African gaming creators.
- Prefer rising trends over peaked ones (≥60% should be 'rising').
"""
    try:
        data = _groq_json(prompt, system)
        data["updatedAt"] = datetime.now(timezone.utc).isoformat()
        # Attach real source counts so the frontend can show "Live from 6 platforms"
        data.setdefault("sources", {
            "youtube": len(yt_results),
            "reddit": len(reddit_results),
            "twitch": len(twitch_results),
            "google_trends": len(trends_results),
            "tiktok": len(tiktok_results),
            "twitter": len(twitter_results),
        })
        return jsonify(data)
    except Exception as e:
        log.error(f"Trends error: {e}")
        return jsonify({"error": str(e)}), 500


# ─── Viral Forge — Titles / Captions / Hashtags / Hooks ─────────────────────
@app.route("/forge/titles", methods=["POST"])
@require_auth
def forge_titles():
    body = request.get_json(force=True)
    desc, game, platform = body.get("description", ""), body.get("game", "Gaming"), body.get("platform", "TikTok")
    serp = _serp_search(f"viral {game} {platform} title 2025 most viewed", num=5)
    context = "\n".join(r.get("snippet", "") for r in serp[:3])
    system = "You are a viral gaming content strategist. Return ONLY valid JSON."
    prompt = f"""
Generate 7 viral title options for this gaming clip:
Description: "{desc}"
Game: {game}
Platform: {platform}

Live trend context: {context or 'N/A'}

Return JSON:
{{
  "titles": [
    {{
      "id": "t1",
      "text": "<full title with emoji>",
      "viralScore": <65-99 integer>,
      "searchVolume": "<e.g. 24K>",
      "trend": "<rising|stable|declining>",
      "votes": 0
    }}
  ]
}}

Rules:
- Titles must be 6-14 words
- Include 1-2 emojis per title
- Optimise for {platform} algorithm
- Rank by viralScore descending
- Make them feel authentic, not corporate
"""
    try:
        return jsonify(_groq_json(prompt, system))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/forge/captions", methods=["POST"])
@require_auth
def forge_captions():
    body = request.get_json(force=True)
    desc, game, vibe, platform = (
        body.get("description", ""),
        body.get("game", "Gaming"),
        body.get("vibe", "Hype"),
        body.get("platform", "TikTok"),
    )
    system = "You are a viral gaming caption writer who knows what Nigerian teens love. Return ONLY valid JSON."
    prompt = f"""
Write 6 viral captions for this gaming clip:
Description: "{desc}"
Game: {game}, Vibe: {vibe}, Platform: {platform}

Return JSON:
{{
  "captions": [
    {{
      "id": "c1",
      "text": "<caption with 1-2 emojis, under 120 chars>",
      "vibe": "{vibe}",
      "viralScore": <70-99>,
      "votes": 0
    }}
  ]
}}

Rules:
- Mix conversational tone with hype
- Include comment bait (ask viewers to react)
- Reference Nigerian gaming culture where natural
- No corporate language
"""
    try:
        return jsonify(_groq_json(prompt, system))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/forge/hashtags", methods=["POST"])
@require_auth
def forge_hashtags():
    body = request.get_json(force=True)
    desc, game, platform = body.get("description", ""), body.get("game", "Gaming"), body.get("platform", "TikTok")
    serp = _serp_search(f"best gaming hashtags {game} {platform} 2025 Nigeria", num=5)
    context = "\n".join(r.get("snippet", "") for r in serp[:3])
    system = "You are a hashtag strategist for gaming creators. Return ONLY valid JSON."
    prompt = f"""
Generate the perfect hashtag set for:
Description: "{desc}", Game: {game}, Platform: {platform}

Live trend data: {context or 'N/A'}

Return JSON: {{"hashtags": ["#tag1", "#tag2", ...]}}

Requirements:
- 14-18 total hashtags
- First 3: mega tags (100M+ posts) — platform general
- Next 5: mid-tier (1M-100M posts) — gaming specific
- Last 6-10: niche (under 1M) — game specific + Nigerian gaming
- Include #naijagamer and #gamingafrica
- All lowercase, no spaces
"""
    try:
        return jsonify(_groq_json(prompt, system))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/forge/hooks", methods=["POST"])
@require_auth
def forge_hooks():
    body = request.get_json(force=True)
    desc, game = body.get("description", ""), body.get("game", "Gaming")
    serp = _serp_search(f"viral gaming video opening lines hooks {game} 2025", num=4)
    context = "\n".join(r.get("snippet", "") for r in serp[:2])
    system = "You are a viral short-form video scriptwriter. Return ONLY valid JSON."
    prompt = f"""
Write 8 killer opening hook lines for this {game} gaming clip:
"{desc}"

Live trend data: {context or 'N/A'}

Return JSON: {{"hooks": ["hook1", "hook2", ...]}}

Rules:
- Each hook is 1-2 sentences max
- Must stop the scroll in under 2 seconds
- Mix formats: POV, question, statement, challenge
- Optimised for TikTok/Reels viewer psychology
- Reference {game} naturally
"""
    try:
        return jsonify(_groq_json(prompt, system))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Growth Intel — Spy / Timing / A-B ──────────────────────────────────────
@app.route("/intel/spy", methods=["POST"])
@require_auth
@require_plan("pro", "creator")
def intel_spy():
    body = request.get_json(force=True)
    channel_url = body.get("channelUrl", "")
    game = body.get("game", "")
    channel_name = channel_url.split("@")[-1].split("/")[0] if "@" in channel_url else "unknown"
    serp = _serp_search(f"site:youtube.com {channel_name} gaming {game} most popular videos", num=8)
    context = "\n".join(f"- {r.get('title','')}: {r.get('snippet','')}" for r in serp[:6])
    system = "You are a YouTube channel analyst. Return ONLY valid JSON."
    prompt = f"""
Analyse this gaming creator's channel strategy:
Channel: {channel_url}
Game: {game or 'unknown'}

Search data found:
{context or 'Limited data available — provide general analysis based on top gaming creators.'}

Return JSON:
{{
  "channelName": "<clean name>",
  "avgViews": "<range like 45K-280K>",
  "postingFrequency": "<e.g. 5-7 videos/week>",
  "bestPerformingGame": "<game name>",
  "titlePattern": "<their typical title formula>",
  "thumbnailStyle": "<brief description>",
  "topFormulas": ["<formula1>", "<formula2>", "<formula3>", "<formula4>", "<formula5>"],
  "recommendation": "<2-3 sentences on how to compete with or beat them>"
}}
"""
    try:
        return jsonify(_groq_json(prompt, system))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/intel/timing", methods=["POST"])
@require_auth
def intel_timing():
    body = request.get_json(force=True)
    platform = body.get("platform", "TikTok")
    game = body.get("game", "gaming")
    serp = _serp_search(f"best time to post {platform} gaming Nigeria WAT 2025", num=5)
    context = "\n".join(r.get("snippet", "") for r in serp[:3])
    system = "You are a social media timing expert. Return ONLY valid JSON."
    prompt = f"""
What are the best times to post {game} gaming content on {platform} for Nigerian creators?
Use WAT (West Africa Time = UTC+1) timezone.

Research context: {context or 'N/A'}

Return JSON:
{{
  "platform": "{platform}",
  "slots": [
    {{"day": "<day>", "time": "<time range WAT>", "score": <0-100>, "label": "<PEAK|GREAT|GOOD>"}},
    ... (7 slots, one per day, sorted by score desc)
  ],
  "insight": "<2-3 sentence actionable insight specific to Nigerian {game} creators>"
}}
"""
    try:
        return jsonify(_groq_json(prompt, system))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/intel/abtitle", methods=["POST"])
@require_auth
def intel_abtitle():
    body = request.get_json(force=True)
    titleA, titleB, game = body.get("titleA", ""), body.get("titleB", ""), body.get("game", "gaming")
    system = "You are a YouTube CTR and title optimisation expert. Return ONLY valid JSON."
    prompt = f"""
Predict which title will perform better for a {game} gaming video:

Title A: "{titleA}"
Title B: "{titleB}"

Analyse based on: hook strength, emotional trigger, specificity, emoji usage,
click-through-rate potential, search intent alignment, and mobile scroll-stop power.

Return JSON:
{{
  "titleA": "{titleA}",
  "titleB": "{titleB}",
  "winner": "<A or B>",
  "scoreA": <50-99>,
  "scoreB": <50-99>,
  "reasoning": "<2-3 sentences explaining why the winner is better>",
  "improvements": ["<specific improvement 1>", "<improvement 2>", "<improvement 3>"]
}}

The winner must have a higher score. Scores must differ by at least 5.
"""
    try:
        return jsonify(_groq_json(prompt, system))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# Entrypoint
# ════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    log.info(f"ClipAI v2 worker starting on port {PORT}")
    log.info(f"  Supabase: {'on' if Config.SUPABASE_URL else 'off'}")
    log.info(f"  Redis:    {'on' if Config.REDIS_URL else 'off (in-memory)'}")
    log.info(f"  R2:       {'on' if Config.R2_ACCESS_KEY else 'off'}")
    app.run(host="0.0.0.0", port=PORT, threaded=True)
