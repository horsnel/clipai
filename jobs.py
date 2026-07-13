"""
ClipAI v2 Worker — Redis job store + cleanup scheduler
- _jobs dict is the fallback when Redis isn't configured (dev only)
- In production, set REDIS_URL on Railway and jobs survive restarts
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import threading
import time
from datetime import datetime, timezone
from typing import Any

from config import Config

logger = logging.getLogger(__name__)

# ─── Redis (optional) ───────────────────────────────────────────────────────

_redis_client = None
_redis_lock = threading.Lock()


def _get_redis():
    """Lazy-init Redis client. Returns None if REDIS_URL is not set."""
    global _redis_client
    if not Config.REDIS_URL:
        return None
    if _redis_client is None:
        with _redis_lock:
            if _redis_client is None:
                try:
                    import redis
                    _redis_client = redis.from_url(
                        Config.REDIS_URL, decode_responses=True
                    )
                    _redis_client.ping()
                    logger.info("Redis connected at %s", Config.REDIS_URL.split("@")[-1])
                except Exception as exc:
                    logger.warning("Redis connection failed, falling back to memory: %s", exc)
                    _redis_client = None
    return _redis_client


# ─── Job store (Redis or in-memory) ─────────────────────────────────────────

JOB_TTL = 86400  # 24h


def save_job(job_id: str, job: dict) -> None:
    """Persist a render job. Redis if available, else in-memory."""
    job["updated_at"] = datetime.now(timezone.utc).isoformat()
    r = _get_redis()
    if r:
        r.setex(f"clipai:job:{job_id}", JOB_TTL, json.dumps(job))
    else:
        with _redis_lock:
            _mem_jobs[job_id] = job


def get_job(job_id: str) -> dict | None:
    r = _get_redis()
    if r:
        raw = r.get(f"clipai:job:{job_id}")
        return json.loads(raw) if raw else None
    with _redis_lock:
        return _mem_jobs.get(job_id)


def update_job(job_id: str, **fields) -> None:
    """Merge fields into an existing job."""
    job = get_job(job_id)
    if not job:
        return
    job.update(fields)
    save_job(job_id, job)


_mem_jobs: dict[str, dict] = {}


# ─── Cleanup scheduler ──────────────────────────────────────────────────────

def _cleanup_temp_dir():
    """Delete files in TEMP_DIR older than 24 hours."""
    if not os.path.isdir(Config.TEMP_DIR):
        return
    cutoff = time.time() - JOB_TTL
    count = 0
    for entry in os.scandir(Config.TEMP_DIR):
        try:
            if entry.is_dir():
                # Check mtime of dir or any file inside
                mtime = entry.stat().st_mtime
                if mtime < cutoff:
                    shutil.rmtree(entry.path, ignore_errors=True)
                    count += 1
            elif entry.is_file() and entry.stat().st_mtime < cutoff:
                os.remove(entry.path)
                count += 1
        except OSError:
            pass
    if count:
        logger.info("Cleanup: removed %d expired temp entries", count)


def start_cleanup_scheduler():
    """Start a background thread that purges old temp files every hour."""
    def runner():
        while True:
            try:
                _cleanup_temp_dir()
            except Exception as exc:
                logger.error("Cleanup scheduler error: %s", exc)
            time.sleep(3600)  # 1 hour

    t = threading.Thread(target=runner, daemon=True, name="cleanup-scheduler")
    t.start()
    logger.info("Cleanup scheduler started (runs hourly)")
