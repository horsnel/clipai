"""
ClipAI Railway Worker
─────────────────────
Primary renderer : JSON2Video API
Fallback renderer: FFmpeg (local)

Services integrated
  • Gemini 2.5 Flash  – video highlight scanning
  • Groq Llama 3.3 70B – viral caption generation
  • JSON2Video API     – cloud video rendering (primary)
  • FFmpeg             – local rendering (fallback)
  • Cloudflare R2      – primary storage
  • Backblaze B2       – fallback storage
  • Paystack           – subscription / topup webhooks
  • yt-dlp             – YouTube download

Install
  pip install flask flask-cors boto3 google-generativeai \
              groq yt-dlp requests python-dotenv

Environment variables (.env)
  GEMINI_API_KEY
  GROQ_API_KEY
  JSON2VIDEO_API_KEY
  R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET, R2_PUBLIC_URL
  B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT
  PAYSTACK_SECRET_KEY
  WORKER_SECRET          (shared secret for auth, optional)
  PORT                   (default 8000)
"""

import os
import uuid
import json
import shutil
import logging
import subprocess
import threading
import time
from pathlib import Path
from typing import Optional

import boto3
import requests
from botocore.config import Config
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
log = logging.getLogger("clipai")

# ── App ───────────────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app, origins="*")

PORT = int(os.getenv("PORT", 8000))
WORK_DIR = Path("/tmp/clipai")
WORK_DIR.mkdir(exist_ok=True)

# ── AI clients (lazy init) ────────────────────────────────────────────────────

def _gemini():
    import google.generativeai as genai
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    return genai.GenerativeModel("gemini-2.5-flash")

def _groq():
    from groq import Groq
    return Groq(api_key=os.environ["GROQ_API_KEY"])

# ── Storage helpers ───────────────────────────────────────────────────────────

def _r2_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY"],
        aws_secret_access_key=os.environ["R2_SECRET_KEY"],
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )

def _b2_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["B2_ENDPOINT"],
        aws_access_key_id=os.environ["B2_KEY_ID"],
        aws_secret_access_key=os.environ["B2_APPLICATION_KEY"],
        config=Config(signature_version="s3v4"),
    )

def upload_to_storage(local_path: Path, object_key: str) -> str:
    """Try R2 first, fall back to B2. Returns public URL."""
    bucket_r2 = os.getenv("R2_BUCKET", "clipai")
    bucket_b2 = os.getenv("B2_BUCKET_NAME", "clipai")
    try:
        _r2_client().upload_file(str(local_path), bucket_r2, object_key)
        return f"{os.environ['R2_PUBLIC_URL']}/{object_key}"
    except Exception as e:
        log.warning(f"R2 upload failed ({e}), trying B2…")
        _b2_client().upload_file(str(local_path), bucket_b2, object_key)
        return f"{os.environ['B2_ENDPOINT']}/{bucket_b2}/{object_key}"

def download_from_storage(object_key: str, dest: Path):
    bucket_r2 = os.getenv("R2_BUCKET", "clipai")
    try:
        _r2_client().download_file(bucket_r2, object_key, str(dest))
    except Exception:
        bucket_b2 = os.getenv("B2_BUCKET_NAME", "clipai")
        _b2_client().download_file(bucket_b2, object_key, str(dest))

# ── In-memory job store (swap for Redis in production) ────────────────────────

_JOBS: dict = {}
_JOBS_LOCK = threading.Lock()

def get_job(job_id: str) -> Optional[dict]:
    with _JOBS_LOCK:
        return _JOBS.get(job_id)

def set_job(job_id: str, data: dict):
    with _JOBS_LOCK:
        _JOBS[job_id] = data

# ── JSON2Video renderer ───────────────────────────────────────────────────────

J2V_API = "https://api.json2video.com/v2/movies"
J2V_KEY = os.getenv("JSON2VIDEO_API_KEY", "")

FORMAT_RESOLUTION = {
    "tiktok":  {"width": 1080, "height": 1920},
    "reels":   {"width": 1080, "height": 1920},
    "shorts":  {"width": 1080, "height": 1920},
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
) -> Optional[str]:
    """
    Call JSON2Video to render a clip.
    Returns the output video URL or None on failure.
    """
    if not J2V_KEY:
        log.warning("JSON2VIDEO_API_KEY not set, skipping JSON2Video")
        return None

    res = FORMAT_RESOLUTION.get(format_, {"width": 1080, "height": 1920})
    quality_res = QUALITY_RESOLUTION.get(quality, {"width": 1280, "height": 720})

    # Use the smaller of format vs quality so we don't upscale
    width  = min(res["width"],  quality_res["width"])
    height = min(res["height"], quality_res["height"])

    duration = end_seconds - start_seconds

    elements = [
        {
            "type": "video",
            "src": video_url,
            "trim-start": start_seconds,
            "duration": duration,
            "width": width,
            "height": height,
            "x": 0,
            "y": 0,
        }
    ]

    if caption:
        elements.append({
            "type": "text",
            "text": caption,
            "font-family": "Oswald",
            "font-size": 52,
            "font-weight": "bold",
            "color": "#FFFFFF",
            "stroke-color": "#000000",
            "stroke-width": 3,
            "x": "center",
            "y": height - 160,
            "width": width - 80,
            "height": 120,
            "start": 0,
            "duration": duration,
        })

    if watermark_text:
        elements.append({
            "type": "text",
            "text": watermark_text,
            "font-family": "Inter",
            "font-size": 28,
            "color": "#FFFFFF80",
            "x": 30,
            "y": 30,
            "start": 0,
            "duration": duration,
        })

    payload = {
        "resolution": "custom",
        "width": width,
        "height": height,
        "fps": 30,
        "quality": 80,
        "scenes": [{"comment": "ClipAI highlight", "elements": elements}],
    }

    headers = {"x-api-key": J2V_KEY, "Content-Type": "application/json"}

    try:
        # POST to create job
        resp = requests.post(J2V_API, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        movie = resp.json().get("movie", {})
        movie_id = movie.get("id") or resp.json().get("id")

        if not movie_id:
            log.error(f"JSON2Video: no movie id in response: {resp.text[:300]}")
            return None

        # Poll for completion (max 5 min)
        deadline = time.time() + 300
        while time.time() < deadline:
            time.sleep(5)
            status_resp = requests.get(f"{J2V_API}/{movie_id}", headers=headers, timeout=15)
            status_resp.raise_for_status()
            data = status_resp.json()
            status = data.get("movie", {}).get("status") or data.get("status")
            log.info(f"JSON2Video job {movie_id}: {status}")

            if status == "done":
                url = data.get("movie", {}).get("url") or data.get("url")
                return url
            if status in ("error", "failed"):
                log.error(f"JSON2Video failed: {data}")
                return None

        log.error("JSON2Video polling timed out")
        return None

    except Exception as e:
        log.error(f"JSON2Video exception: {e}")
        return None

# ── FFmpeg renderer (fallback) ────────────────────────────────────────────────

def _ffmpeg_render(
    local_video: Path,
    output_path: Path,
    start_seconds: float,
    end_seconds: float,
    format_: str,
    quality: str,
    caption: Optional[str],
    watermark_text: Optional[str],
) -> bool:
    quality_res = QUALITY_RESOLUTION.get(quality, {"width": 1280, "height": 720})
    width, height = quality_res["width"], quality_res["height"]
    duration = end_seconds - start_seconds

    # Base filter: scale + crop to 9:16 for mobile formats
    vf_parts = [f"scale={width}:{height}:force_original_aspect_ratio=decrease",
                f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2"]

    drawtext_opts = "fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

    if caption:
        safe_cap = caption.replace("'", "\\'").replace(":", "\\:")
        vf_parts.append(
            f"drawtext={drawtext_opts}:text='{safe_cap}'"
            f":fontcolor=white:fontsize=42:bordercolor=black:borderw=3"
            f":x=(w-text_w)/2:y=h-150"
        )

    if watermark_text:
        safe_wm = watermark_text.replace("'", "\\'").replace(":", "\\:")
        vf_parts.append(
            f"drawtext={drawtext_opts}:text='{safe_wm}'"
            f":fontcolor=white@0.5:fontsize=22"
            f":x=20:y=20"
        )

    vf = ",".join(vf_parts)

    crf = {"480p": "28", "720p": "23", "1080p": "20", "4k": "18"}.get(quality, "23")

    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_seconds),
        "-i", str(local_video),
        "-t",  str(duration),
        "-vf", vf,
        "-c:v", "libx264",
        "-crf", crf,
        "-preset", "fast",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        str(output_path),
    ]

    log.info(f"FFmpeg: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

    if result.returncode != 0:
        log.error(f"FFmpeg stderr: {result.stderr[-800:]}")
        return False
    return True

# ── Background render worker ──────────────────────────────────────────────────

def _do_render(job_id: str, payload: dict):
    """Runs in a thread. Updates job store on progress."""
    job = get_job(job_id)
    work = WORK_DIR / job_id
    work.mkdir(exist_ok=True)

    try:
        set_job(job_id, {**job, "status": "rendering", "progress": 5})

        video_key    = payload.get("videoKey", "")
        video_url    = payload.get("videoUrl", "")
        start        = float(payload.get("startSeconds", 0))
        end          = float(payload.get("endSeconds", 30))
        format_      = payload.get("format", "tiktok")
        quality      = payload.get("quality", "720p")
        caption      = payload.get("caption")
        watermark    = payload.get("watermark")

        download_url = None
        engine       = None

        # ── Try JSON2Video first ──────────────────────────────────────────────
        if video_url:
            set_job(job_id, {**get_job(job_id), "progress": 15, "status": "rendering"})
            j2v_url = _j2v_render(video_url, start, end, format_, quality, caption, watermark)
            if j2v_url:
                download_url = j2v_url
                engine = "json2video"

        # ── FFmpeg fallback ───────────────────────────────────────────────────
        if not download_url:
            log.info(f"Job {job_id}: falling back to FFmpeg")
            set_job(job_id, {**get_job(job_id), "progress": 20})

            local_video = work / "source.mp4"

            if video_key:
                # Download from R2/B2
                download_from_storage(video_key, local_video)
            elif video_url:
                # Download via requests
                r = requests.get(video_url, stream=True, timeout=120)
                r.raise_for_status()
                with open(local_video, "wb") as f:
                    for chunk in r.iter_content(65536):
                        f.write(chunk)
            else:
                raise ValueError("No video source provided for FFmpeg")

            set_job(job_id, {**get_job(job_id), "progress": 40})

            output_path = work / f"clip_{job_id}.mp4"
            ok = _ffmpeg_render(local_video, output_path, start, end, format_, quality, caption, watermark)

            if not ok:
                raise RuntimeError("FFmpeg render failed")

            set_job(job_id, {**get_job(job_id), "progress": 80})

            obj_key = f"clips/{job_id}/clip.mp4"
            download_url = upload_to_storage(output_path, obj_key)
            engine = "ffmpeg"

        set_job(job_id, {
            "status": "done",
            "progress": 100,
            "downloadUrl": download_url,
            "engine": engine,
        })
        log.info(f"Job {job_id} done via {engine}: {download_url}")

    except Exception as e:
        log.exception(f"Job {job_id} error")
        set_job(job_id, {**get_job(job_id), "status": "error", "error": str(e)})
    finally:
        shutil.rmtree(work, ignore_errors=True)

# ═══════════════════════════════════════════════════════════════════════════════
# Routes
# ═══════════════════════════════════════════════════════════════════════════════

@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "clipai-worker"})

# ── Upload ─────────────────────────────────────────────────────────────────────

@app.route("/upload", methods=["POST"])
def upload():
    if "video" not in request.files:
        return jsonify({"success": False, "error": "No video file"}), 400

    file = request.files["video"]
    video_id = str(uuid.uuid4())
    work = WORK_DIR / video_id
    work.mkdir(exist_ok=True)

    local_path = work / f"source{Path(file.filename or 'video.mp4').suffix}"
    file.save(str(local_path))
    log.info(f"Saved upload {video_id}: {local_path.stat().st_size} bytes")

    try:
        obj_key  = f"uploads/{video_id}/source.mp4"
        pub_url  = upload_to_storage(local_path, obj_key)
        return jsonify({
            "success":   True,
            "videoId":   video_id,
            "uploadUrl": pub_url,
            "videoKey":  obj_key,
        })
    except Exception as e:
        log.error(f"Upload storage failed: {e}")
        # Still return success with local reference so analysis can proceed
        return jsonify({
            "success":  True,
            "videoId":  video_id,
            "uploadUrl": "",
            "videoKey": f"uploads/{video_id}/source.mp4",
            "_local":   str(local_path),
        })
    # Don't clean up — analysis needs the file

# ── Analyse (Gemini) ───────────────────────────────────────────────────────────

def _parse_gemini_clips(text: str, clip_count: int) -> list:
    """Parse Gemini JSON output → clip list."""
    try:
        # Strip markdown fences
        clean = text.strip()
        for fence in ["```json", "```"]:
            clean = clean.replace(fence, "")
        clean = clean.strip()
        data = json.loads(clean)
        clips = data if isinstance(data, list) else data.get("clips", [])
    except Exception:
        log.warning("Gemini returned non-JSON, using mock clips")
        clips = []

    result = []
    for i, c in enumerate(clips[:clip_count]):
        start_s = float(c.get("start_seconds", i * 60))
        end_s   = float(c.get("end_seconds",   start_s + 30))
        dur_s   = end_s - start_s
        result.append({
            "id":           str(uuid.uuid4()),
            "thumbnail":    f"/gameplay-thumb-{(i % 3) + 1}.jpg",
            "startTime":    f"{int(start_s // 60):02d}:{int(start_s % 60):02d}",
            "endTime":      f"{int(end_s   // 60):02d}:{int(end_s   % 60):02d}",
            "startSeconds": start_s,
            "endSeconds":   end_s,
            "hypeScore":    int(c.get("hype_score", 80)),
            "duration":     f"{int(dur_s // 60)}:{int(dur_s % 60):02d}",
            "caption":      c.get("caption", ""),
            "selected":     i == 0,
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
def analyse():
    body      = request.get_json(force=True)
    video_id  = body.get("videoId", "")
    game      = body.get("game", "Gaming")
    clip_count = int(body.get("clipCount", 3))

    # Locate video
    video_path = None
    for ext in [".mp4", ".mov", ".webm"]:
        p = WORK_DIR / video_id / f"source{ext}"
        if p.exists():
            video_path = p
            break

    if not video_path:
        # Try downloading from storage
        obj_key = f"uploads/{video_id}/source.mp4"
        video_path = WORK_DIR / video_id / "source.mp4"
        video_path.parent.mkdir(exist_ok=True)
        try:
            download_from_storage(obj_key, video_path)
        except Exception as e:
            return jsonify({"success": False, "error": f"Video not found: {e}"}), 404

    try:
        import google.generativeai as genai
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        model = genai.GenerativeModel("gemini-2.5-flash")

        log.info(f"Uploading {video_path} to Gemini…")
        gfile = genai.upload_file(str(video_path))

        # Wait for processing
        while gfile.state.name == "PROCESSING":
            time.sleep(3)
            gfile = genai.get_file(gfile.name)

        if gfile.state.name != "ACTIVE":
            raise RuntimeError(f"Gemini file processing failed: {gfile.state.name}")

        prompt = GEMINI_PROMPT.format(n=clip_count, game=game)
        response = model.generate_content([gfile, prompt])
        raw_text = response.text

        genai.delete_file(gfile.name)  # cleanup

        clips = _parse_gemini_clips(raw_text, clip_count)

        # Get upload URL for reference
        upload_url = ""
        try:
            upload_url = f"{os.environ['R2_PUBLIC_URL']}/uploads/{video_id}/source.mp4"
        except Exception:
            pass

        return jsonify({
            "success":   True,
            "clips":     clips,
            "videoId":   video_id,
            "uploadUrl": upload_url,
        })

    except Exception as e:
        log.exception("Analyse error")
        return jsonify({"success": False, "error": str(e)}), 500

# ── Analyse YouTube ────────────────────────────────────────────────────────────

@app.route("/analyse/youtube", methods=["POST"])
def analyse_youtube():
    body       = request.get_json(force=True)
    yt_url     = body.get("youtubeUrl", "")
    game       = body.get("game", "Gaming")
    clip_count = int(body.get("clipCount", 3))

    if not yt_url:
        return jsonify({"success": False, "error": "No YouTube URL"}), 400

    video_id = str(uuid.uuid4())
    work = WORK_DIR / video_id
    work.mkdir(exist_ok=True)
    local_path = work / "source.mp4"

    try:
        log.info(f"Downloading YouTube video: {yt_url}")
        result = subprocess.run(
            ["yt-dlp", "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
             "--merge-output-format", "mp4",
             "-o", str(local_path), yt_url],
            capture_output=True, text=True, timeout=300,
        )
        if result.returncode != 0:
            raise RuntimeError(f"yt-dlp failed: {result.stderr[-300:]}")

        # Upload to storage
        obj_key = f"uploads/{video_id}/source.mp4"
        try:
            upload_url = upload_to_storage(local_path, obj_key)
        except Exception:
            upload_url = ""

        # Reuse /analyse logic via internal call
        body["videoId"] = video_id
        request.environ["_analysed_video_path"] = str(local_path)

        # Call analyse inline
        import google.generativeai as genai
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        model = genai.GenerativeModel("gemini-2.5-flash")

        gfile = genai.upload_file(str(local_path))
        while gfile.state.name == "PROCESSING":
            time.sleep(3)
            gfile = genai.get_file(gfile.name)

        prompt = GEMINI_PROMPT.format(n=clip_count, game=game)
        response = model.generate_content([gfile, prompt])
        genai.delete_file(gfile.name)

        clips = _parse_gemini_clips(response.text, clip_count)
        return jsonify({"success": True, "clips": clips, "videoId": video_id, "uploadUrl": upload_url})

    except Exception as e:
        log.exception("YouTube analyse error")
        shutil.rmtree(work, ignore_errors=True)
        return jsonify({"success": False, "error": str(e)}), 500

# ── Captions (Groq) ────────────────────────────────────────────────────────────

@app.route("/captions", methods=["POST"])
def captions():
    body  = request.get_json(force=True)
    clips = body.get("clips", [])
    game  = body.get("game", "Gaming")

    if not clips:
        return jsonify([])

    try:
        groq_client = _groq()
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
        resp = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            temperature=0.9,
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

    except Exception as e:
        log.exception("Captions error")
        # Return original clips unchanged on error
        return jsonify(clips)

# ── Render (JSON2Video + FFmpeg fallback) ──────────────────────────────────────

@app.route("/render", methods=["POST"])
def render():
    body   = request.get_json(force=True)
    job_id = str(uuid.uuid4())

    # Resolve video URL
    video_id  = body.get("clipId", body.get("videoId", ""))
    video_key = f"uploads/{video_id}/source.mp4"
    try:
        video_url = f"{os.environ['R2_PUBLIC_URL']}/{video_key}"
    except Exception:
        video_url = body.get("videoUrl", "")

    payload = {
        **body,
        "videoKey": video_key,
        "videoUrl": video_url,
    }

    set_job(job_id, {"status": "queued", "progress": 0, "engine": None})
    t = threading.Thread(target=_do_render, args=(job_id, payload), daemon=True)
    t.start()

    return jsonify({"jobId": job_id})

@app.route("/render/status/<job_id>")
def render_status(job_id):
    job = get_job(job_id)
    if not job:
        return jsonify({"status": "error", "error": "Job not found"}), 404
    return jsonify({"jobId": job_id, **job})

# ── Paystack webhook ───────────────────────────────────────────────────────────

PLAN_MAP = {
    "clipai-starter": "starter",
    "clipai-pro":     "pro",
    "clipai-creator": "creator",
}

@app.route("/payment/webhook", methods=["POST"])
def paystack_webhook():
    import hmac, hashlib
    secret = os.getenv("PAYSTACK_SECRET_KEY", "")
    sig    = request.headers.get("X-Paystack-Signature", "")
    body   = request.get_data()

    expected = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()
    if sig != expected:
        return jsonify({"error": "Invalid signature"}), 401

    event = request.get_json(force=True)
    log.info(f"Paystack event: {event.get('event')}")

    if event.get("event") == "charge.success":
        data      = event.get("data", {})
        reference = data.get("reference", "")
        metadata  = data.get("metadata", {})
        plan_code = metadata.get("plan_code", "")
        plan_name = PLAN_MAP.get(plan_code, "pro")
        user_id   = metadata.get("user_id", "")
        log.info(f"Payment success: user={user_id} plan={plan_name} ref={reference}")
        # TODO: update Supabase user plan here

    return jsonify({"status": "ok"})

@app.route("/payment/verify")
def verify_payment():
    reference = request.args.get("reference", "")
    if not reference:
        return jsonify({"success": False, "error": "No reference"}), 400

    secret = os.getenv("PAYSTACK_SECRET_KEY", "")
    headers = {"Authorization": f"Bearer {secret}"}
    resp = requests.get(
        f"https://api.paystack.co/transaction/verify/{reference}",
        headers=headers, timeout=15,
    )
    data = resp.json()

    if not data.get("status") or data["data"].get("status") != "success":
        return jsonify({"success": False, "error": "Payment not verified"})

    metadata  = data["data"].get("metadata", {})
    plan_code = metadata.get("plan_code", "")
    plan_name = PLAN_MAP.get(plan_code, "pro")

    return jsonify({"success": True, "plan": plan_name, "reference": reference})

# ── Entrypoint ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    log.info(f"ClipAI worker starting on port {PORT}")
    app.run(host="0.0.0.0", port=PORT, threaded=True)


# ═══════════════════════════════════════════════════════════════════════════════
# NEW FEATURE ROUTES  (zero video processing — pure AI + live search)
# ═══════════════════════════════════════════════════════════════════════════════

SERP_KEY = os.getenv("SERPAPI_KEY", "")
YT_KEY   = os.getenv("YOUTUBE_API_KEY", "")

def _serp_search(query: str, num: int = 10) -> list:
    """SerpAPI Google search. Returns list of result dicts."""
    if not SERP_KEY:
        return []
    try:
        resp = requests.get("https://serpapi.com/search", params={
            "q": query, "num": num, "api_key": SERP_KEY,
            "engine": "google", "gl": "ng", "hl": "en",
        }, timeout=10)
        resp.raise_for_status()
        return resp.json().get("organic_results", [])
    except Exception as e:
        log.warning(f"SerpAPI error: {e}")
        return []

def _yt_trending(game: str, max_results: int = 15) -> list:
    """YouTube Data API trending gaming videos."""
    if not YT_KEY:
        return []
    try:
        resp = requests.get("https://www.googleapis.com/youtube/v3/search", params={
            "part": "snippet", "q": f"{game} gaming highlights",
            "type": "video", "videoDuration": "short",
            "order": "viewCount", "maxResults": max_results,
            "key": YT_KEY, "regionCode": "NG",
        }, timeout=10)
        resp.raise_for_status()
        return resp.json().get("items", [])
    except Exception as e:
        log.warning(f"YouTube API error: {e}")
        return []

def _groq_text(prompt: str, system: str = "", max_tokens: int = 800) -> str:
    """Call Groq Llama 3.3 70B for text generation."""
    client = _groq()
    msgs = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})
    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=msgs,
        max_tokens=max_tokens,
        temperature=0.85,
    )
    return resp.choices[0].message.content.strip()

def _groq_json(prompt: str, system: str = "") -> dict | list:
    """Call Groq and parse JSON response."""
    raw = _groq_text(prompt, system, max_tokens=1200)
    for fence in ["```json", "```"]:
        raw = raw.replace(fence, "")
    return json.loads(raw.strip())

# ── Trend Radar ────────────────────────────────────────────────────────────────

@app.route("/trends")
def trends():
    game = request.args.get("game", "")
    query = f"viral gaming {game} TikTok YouTube trends 2025" if game else "viral gaming trends TikTok YouTube 2025"

    serp_results = _serp_search(query, num=8)
    yt_results   = _yt_trending(game or "gaming")

    # Build context for Groq
    snippets = "\n".join(r.get("snippet", "") for r in serp_results[:5])
    yt_titles = "\n".join(
        item.get("snippet", {}).get("title", "") for item in yt_results[:8]
    )

    system = "You are a viral gaming content trend analyst. Return ONLY valid JSON."
    prompt = f"""
Based on these live search results and YouTube data, identify the TOP 12 trending items
for gaming content creators right now.

Search snippets:
{snippets or 'No live data available.'}

Trending YouTube titles:
{yt_titles or 'No YouTube data available.'}

Game focus: {game or 'All games'}

Return a JSON object:
{{
  "game": "{game or 'All'}",
  "updatedAt": "<ISO timestamp>",
  "trends": [
    {{
      "id": "<unique id>",
      "name": "<trend name/phrase>",
      "category": "<one of: title|hashtag|sound|challenge>",
      "game": "<game name or All>",
      "score": <0-100 integer>,
      "change": <percentage change integer, can be negative>,
      "status": "<rising|peaked|falling>",
      "views": "<e.g. 1.2M>",
      "example": "<optional short example usage>"
    }}
  ]
}}

Make the trends specific, actionable, and relevant to Nigerian/African gaming creators.
"""
    try:
        data = _groq_json(prompt, system)
        # Ensure updatedAt is current
        data["updatedAt"] = __import__("datetime").datetime.utcnow().isoformat()
        return jsonify(data)
    except Exception as e:
        log.error(f"Trends error: {e}")
        return jsonify({"error": str(e)}), 500

# ── Viral Forge — Titles ───────────────────────────────────────────────────────

@app.route("/forge/titles", methods=["POST"])
def forge_titles():
    body     = request.get_json(force=True)
    desc     = body.get("description", "")
    game     = body.get("game", "Gaming")
    platform = body.get("platform", "TikTok")

    # Live search for what's trending
    serp = _serp_search(f"viral {game} {platform} title 2025 most viewed", num=5)
    context = "\n".join(r.get("snippet","") for r in serp[:3])

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

# ── Viral Forge — Captions ────────────────────────────────────────────────────

@app.route("/forge/captions", methods=["POST"])
def forge_captions():
    body     = request.get_json(force=True)
    desc     = body.get("description", "")
    game     = body.get("game", "Gaming")
    vibe     = body.get("vibe", "Hype")
    platform = body.get("platform", "TikTok")

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

# ── Viral Forge — Hashtags ────────────────────────────────────────────────────

@app.route("/forge/hashtags", methods=["POST"])
def forge_hashtags():
    body     = request.get_json(force=True)
    desc     = body.get("description", "")
    game     = body.get("game", "Gaming")
    platform = body.get("platform", "TikTok")

    # Live hashtag trend search
    serp = _serp_search(f"best gaming hashtags {game} {platform} 2025 Nigeria", num=5)
    context = "\n".join(r.get("snippet","") for r in serp[:3])

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

# ── Viral Forge — Hooks ───────────────────────────────────────────────────────

@app.route("/forge/hooks", methods=["POST"])
def forge_hooks():
    body = request.get_json(force=True)
    desc = body.get("description", "")
    game = body.get("game", "Gaming")

    serp = _serp_search(f"viral gaming video opening lines hooks {game} 2025", num=4)
    context = "\n".join(r.get("snippet","") for r in serp[:2])

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

# ── ClipBot ────────────────────────────────────────────────────────────────────

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
def clipbot():
    body    = request.get_json(force=True)
    message = body.get("message", "")
    history = body.get("history", [])
    user    = body.get("user", {})

    if not message:
        return jsonify({"error": "No message"}), 400

    # Optional: live search context for relevant queries
    search_keywords = ["trending", "viral", "best time", "hashtag", "title", "grow", "algorithm"]
    extra_context = ""
    if any(kw in message.lower() for kw in search_keywords):
        results = _serp_search(f"gaming content creator tips {message[:60]} 2025 Nigeria", num=3)
        if results:
            extra_context = "\n\nLive context:\n" + "\n".join(r.get("snippet","") for r in results[:2])

    try:
        client = _groq()
        msgs = [{"role": "system", "content": CLIPBOT_SYSTEM}]

        # Include conversation history (last 8 turns to stay within token limits)
        for h in history[-8:]:
            msgs.append({"role": h["role"], "content": h["content"]})

        msgs.append({"role": "user", "content": message + extra_context})

        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=msgs,
            max_tokens=600,
            temperature=0.9,
        )
        reply = resp.choices[0].message.content.strip()
        return jsonify({"reply": reply})

    except Exception as e:
        log.error(f"ClipBot error: {e}")
        return jsonify({"error": str(e)}), 500

# ── Growth Intel — Competitor Spy ─────────────────────────────────────────────

@app.route("/intel/spy", methods=["POST"])
def intel_spy():
    body        = request.get_json(force=True)
    channel_url = body.get("channelUrl", "")
    game        = body.get("game", "")

    # SerpAPI to get channel info
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

# ── Growth Intel — Post Timing ────────────────────────────────────────────────

@app.route("/intel/timing", methods=["POST"])
def intel_timing():
    body     = request.get_json(force=True)
    platform = body.get("platform", "TikTok")
    game     = body.get("game", "gaming")

    serp = _serp_search(f"best time to post {platform} gaming Nigeria WAT 2025", num=5)
    context = "\n".join(r.get("snippet","") for r in serp[:3])

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

# ── Growth Intel — A/B Title ──────────────────────────────────────────────────

@app.route("/intel/abtitle", methods=["POST"])
def intel_abtitle():
    body   = request.get_json(force=True)
    titleA = body.get("titleA", "")
    titleB = body.get("titleB", "")
    game   = body.get("game", "gaming")

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
