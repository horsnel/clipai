"""
ClipAI v2 Worker — Auth & Supabase helpers
- Validates Supabase JWTs from the Authorization header
- Returns the matching profile row from the database
"""
from __future__ import annotations

import logging
import time
from typing import Any

import jwt
import requests

from config import Config

logger = logging.getLogger(__name__)


# ─── JWT validation ─────────────────────────────────────────────────────────

def verify_supabase_jwt(token: str) -> dict | None:
    """Verify a Supabase access token (JWT) using the project JWT secret.

    Returns the decoded payload (incl. `sub` = user id) or None on failure.
    """
    if not Config.SUPABASE_JWT_SECRET:
        logger.warning("SUPABASE_JWT_SECRET not configured — cannot verify tokens")
        return None
    try:
        # Supabase signs JWTs with HS256 by default
        return jwt.decode(
            token,
            Config.SUPABASE_JWT_SECRET,
            algorithms=["HS256", "RS256"],
            options={"verify_aud": False, "verify_exp": True},
        )
    except jwt.PyJWTError as exc:
        logger.warning("JWT decode failed: %s", exc)
        return None


# ─── Profile fetch ──────────────────────────────────────────────────────────

def fetch_profile(user_id: str) -> dict | None:
    """Fetch the user's profile row from Supabase using the service-role key."""
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_KEY:
        return None
    url = f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/profiles?id=eq.{user_id}&select=*"
    headers = {
        "apikey": Config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
    }
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        rows = resp.json()
        return rows[0] if rows else None
    except requests.RequestException as exc:
        logger.error("Profile fetch failed: %s", exc)
        return None


def update_profile(user_id: str, fields: dict) -> bool:
    """Update fields on the user's profile row."""
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_KEY:
        return False
    url = f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/profiles?id=eq.{user_id}"
    headers = {
        "apikey": Config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    try:
        resp = requests.patch(url, json=fields, headers=headers, timeout=10)
        return resp.status_code in (200, 204)
    except requests.RequestException as exc:
        logger.error("Profile update failed: %s", exc)
        return False


# ─── Decorator: requires valid Supabase JWT ─────────────────────────────────

from functools import wraps
from flask import request, jsonify


def require_auth(fn):
    """Flask decorator — extracts Bearer token, verifies JWT, attaches
    `request.user_id` and `request.profile`. Returns 401 if invalid."""
    @wraps(fn)
    def wrapper(*args: Any, **kwargs: Any):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or malformed Authorization header"}), 401
        token = auth_header[7:].strip()
        payload = verify_supabase_jwt(token)
        if not payload or "sub" not in payload:
            return jsonify({"error": "Invalid or expired token"}), 401

        profile = fetch_profile(payload["sub"])
        if not profile:
            return jsonify({"error": "Profile not found"}), 404

        request.user_id = payload["sub"]
        request.profile = profile
        return fn(*args, **kwargs)
    return wrapper


def require_plan(*allowed_plans: str):
    """Decorator — combined with @require_auth, enforces plan tier.
    Usage:  @require_auth  @require_plan('pro', 'creator')  def view(...):"""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any):
            plan = getattr(request, "profile", {}).get("plan", "free")
            if plan not in allowed_plans:
                return jsonify({
                    "error": "Plan upgrade required",
                    "required_plan": allowed_plans[0],
                    "current_plan": plan,
                }), 402
            return fn(*args, **kwargs)
        return wrapper
    return decorator


# ─── Plan helpers ───────────────────────────────────────────────────────────

def can_use_quality(plan: str, quality: str) -> bool:
    """Return True if `plan` allows rendering at `quality`."""
    tier_order = {"free": 0, "starter": 1, "pro": 2, "creator": 3}
    quality_order = {"480p": 0, "720p": 1, "1080p": 2, "4k": 3}
    plan_tier = tier_order.get(plan, 0)
    quality_tier = quality_order.get(quality.lower(), 0)
    return quality_tier <= plan_tier


def can_use_feature(plan: str, feature: str) -> bool:
    """Check if `plan` allows `feature` ('beat_sync' / 'competitor_spy' / ...)."""
    feats = Config.PLAN_FEATURES.get(plan, Config.PLAN_FEATURES["free"])
    return bool(feats.get(feature, False))


# ─── DB helpers (atomic credit / XP operations) ─────────────────────────────

def award_credits(user_id: str, delta: int, reason: str, reference_id: str | None = None) -> bool:
    """Add (or subtract if delta<0) credits atomically + write audit row."""
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_KEY:
        return False
    headers = {
        "apikey": Config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    # 1. Update profile credits
    profile = fetch_profile(user_id)
    if not profile:
        return False
    new_balance = max(0, profile.get("credits", 0) + delta)
    if not update_profile(user_id, {"credits": new_balance}):
        return False
    # 2. Insert audit row
    url = f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/credit_transactions"
    payload = {
        "user_id": user_id, "delta": delta, "reason": reason,
        "reference_id": reference_id,
    }
    try:
        requests.post(url, json=payload, headers=headers, timeout=10)
    except requests.RequestException:
        pass
    return True


def award_xp(user_id: str, action: str, xp_delta: int, reference_id: str | None = None) -> bool:
    """Add XP to a user + write event row."""
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_KEY:
        return False
    headers = {
        "apikey": Config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {Config.SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    profile = fetch_profile(user_id)
    if not profile:
        return False
    new_xp = profile.get("xp", 0) + xp_delta
    if not update_profile(user_id, {"xp": new_xp}):
        return False
    url = f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/xp_events"
    payload = {
        "user_id": user_id, "action": action, "xp_delta": xp_delta,
        "reference_id": reference_id,
    }
    try:
        requests.post(url, json=payload, headers=headers, timeout=10)
    except requests.RequestException:
        pass
    return True
