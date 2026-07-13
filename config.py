"""
ClipAI v2 Worker — Configuration
Loads all settings from environment variables.
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # ── Flask ────────────────────────────────────────────────────────────────
    FLASK_ENV: str = os.getenv("FLASK_ENV", "production")
    PORT: int = int(os.getenv("PORT", "8000"))
    DEBUG: bool = FLASK_ENV == "development"

    CORS_ORIGINS: list[str] = [
        o.strip() for o in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://localhost:3000,https://clipai-bqo.pages.dev"
        ).split(",") if o.strip()
    ]

    # ── AI Services ──────────────────────────────────────────────────────────
    GEMINI_API_KEY: str | None = os.getenv("GEMINI_API_KEY")
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GROQ_API_KEY: str | None = os.getenv("GROQ_API_KEY")
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    JSON2VIDEO_API_KEY: str | None = os.getenv("JSON2VIDEO_API_KEY")
    SERPAPI_KEY: str | None = os.getenv("SERPAPI_KEY")
    YOUTUBE_API_KEY: str | None = os.getenv("YOUTUBE_API_KEY")

    # ── Reddit (NO API KEY — uses public .json endpoints) ────────────────────
    # Just needs a descriptive User-Agent per Reddit's bot policy.
    # Format: "<appname>/<version> by u_<reddit_username>"
    REDDIT_USER_AGENT: str = os.getenv("REDDIT_USER_AGENT", "clipai-trend-radar/2.0 by u_clipai")

    # ── Google Trends (NO KEY — uses pytrends library, no auth) ──────────────

    # ── Twitch (DROPPED — Helix API requires 2FA-locked dev console) ─────────
    # To re-enable later:
    #   TWITCH_CLIENT_ID  = os.getenv("TWITCH_CLIENT_ID")
    #   TWITCH_CLIENT_SECRET = os.getenv("TWITCH_CLIENT_SECRET")
    # Then restore the _twitch_* helpers from git history (commit 5b89523).

    # ── Cloudflare R2 ────────────────────────────────────────────────────────
    R2_ENDPOINT: str | None = os.getenv("R2_ENDPOINT") or os.getenv("R2_ACCOUNT_ID")
    R2_ACCESS_KEY: str | None = os.getenv("R2_ACCESS_KEY")
    R2_SECRET_KEY: str | None = os.getenv("R2_SECRET_KEY")
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET", "clipai")
    R2_PUBLIC_URL: str | None = os.getenv("R2_PUBLIC_URL")

    # ── Backblaze B2 ─────────────────────────────────────────────────────────
    B2_KEY_ID: str | None = os.getenv("B2_KEY_ID")
    B2_APPLICATION_KEY: str | None = os.getenv("B2_APPLICATION_KEY")
    B2_BUCKET_NAME: str | None = os.getenv("B2_BUCKET_NAME")
    B2_ENDPOINT: str | None = os.getenv("B2_ENDPOINT")

    # ── Supabase ─────────────────────────────────────────────────────────────
    SUPABASE_URL: str | None = os.getenv("SUPABASE_URL")
    SUPABASE_ANON_KEY: str | None = os.getenv("SUPABASE_ANON_KEY")
    SUPABASE_SERVICE_KEY: str | None = os.getenv("SUPABASE_SERVICE_KEY")
    SUPABASE_JWT_SECRET: str | None = os.getenv("SUPABASE_JWT_SECRET")

    # ── Redis ────────────────────────────────────────────────────────────────
    REDIS_URL: str | None = os.getenv("REDIS_URL")

    # ── Auth ─────────────────────────────────────────────────────────────────
    WORKER_SECRET: str | None = os.getenv("WORKER_SECRET")

    # ── Paystack ─────────────────────────────────────────────────────────────
    PAYSTACK_SECRET_KEY: str | None = os.getenv("PAYSTACK_SECRET_KEY")
    PAYSTACK_PUBLIC_KEY: str | None = os.getenv("PAYSTACK_PUBLIC_KEY")
    PAYSTACK_API_URL: str = "https://api.paystack.co"

    # ── Processing ───────────────────────────────────────────────────────────
    MAX_FILE_SIZE_MB: int = 500
    MAX_CLIP_DURATION_S: int = 120
    DEFAULT_CLIP_COUNT: int = 5
    SUPPORTED_VIDEO_FORMATS: tuple[str, ...] = (
        ".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv"
    )
    TEMP_DIR: str = "/tmp/clipai"
    JOB_TTL_SECONDS: int = 86400

    # ── Plan tier → feature matrix ───────────────────────────────────────────
    PLAN_FEATURES: dict[str, dict] = {
        "free": {
            "name": "Free",
            "price_ngn": 0,
            "credits_monthly": 50,
            "max_quality": "480p",
            "beat_sync": False,
            "watermark": True,
            "competitor_spy": False,
            "clipbot_daily_limit": 10,
            "trend_refresh_hours": 24,
        },
        "starter": {
            "name": "Starter",
            "price_ngn": 1000,
            "credits_monthly": 100,
            "max_quality": "720p",
            "beat_sync": False,
            "watermark": True,
            "competitor_spy": False,
            "clipbot_daily_limit": 25,
            "trend_refresh_hours": 12,
        },
        "pro": {
            "name": "Pro",
            "price_ngn": 2500,
            "credits_monthly": 750,
            "max_quality": "1080p",
            "beat_sync": True,
            "watermark": False,
            "competitor_spy": True,
            "clipbot_daily_limit": 100,
            "trend_refresh_hours": 1,
        },
        "creator": {
            "name": "Creator",
            "price_ngn": 6000,
            "credits_monthly": 2000,
            "max_quality": "4k",
            "beat_sync": True,
            "watermark": False,
            "competitor_spy": True,
            "clipbot_daily_limit": -1,        # unlimited
            "trend_refresh_hours": 1,
        },
    }

    # ── Paystack plan codes (set these in your Paystack dashboard) ────────────
    # Map plan_tier → Paystack plan_code. Used by /payment/init.
    PAYSTACK_PLAN_CODES: dict[str, str | None] = {
        "free": None,
        "starter": os.getenv("PAYSTACK_PLAN_STARTER"),
        "pro": os.getenv("PAYSTACK_PLAN_PRO"),
        "creator": os.getenv("PAYSTACK_PLAN_CREATOR"),
    }

    # ── Credit costs ─────────────────────────────────────────────────────────
    CREDIT_COSTS: dict[str, int] = {
        "scan": 10,
        "captions": 5,
        "render_480p": 10,
        "render_720p": 20,
        "render_1080p": 50,
        "render_4k": 100,
    }

    # ── XP rewards ───────────────────────────────────────────────────────────
    XP_REWARDS: dict[str, int] = {
        "signup": 100,
        "analyse": 50,
        "render": 20,
        "caption": 10,
        "referral_signup": 100,
        "referral_paid": 200,
        "daily_streak": 25,
        "clips_voted": 5,
        "chat_message": 1,
    }


# Ensure temp dir exists
os.makedirs(Config.TEMP_DIR, exist_ok=True)
