"""
ClipAI Worker — Centralized Configuration
==========================================
All settings are loaded from environment variables.
Use a .env file locally; Railway injects them automatically.
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Application configuration loaded from environment variables."""

    # ── Flask ────────────────────────────────────────────────────────
    FLASK_ENV: str = os.getenv("FLASK_ENV", "production")
    PORT: int = int(os.getenv("PORT", "5000"))
    DEBUG: bool = FLASK_ENV == "development"
    CORS_ORIGINS: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://localhost:3000,https://clipai-ebo.pages.dev",
        ).split(",")
        if origin.strip()
    ]

    # ── JSON2Video API (optional — premium processor) ────────────────
    # Only used when API key is provided. FFmpeg is the default processor.
    JSON2VIDEO_API_KEY: str | None = os.getenv("JSON2VIDEO_API_KEY")
    JSON2VIDEO_API_URL: str = "https://api.json2video.com/v2"
    USE_JSON2VIDEO: bool = os.getenv("USE_JSON2VIDEO", "false").lower() in ("true", "1", "yes")

    # ── Google Gemini ────────────────────────────────────────────────
    GEMINI_API_KEY: str | None = os.getenv("GEMINI_API_KEY")
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # ── Groq ─────────────────────────────────────────────────────────
    GROQ_API_KEY: str | None = os.getenv("GROQ_API_KEY")
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # ── Paystack ─────────────────────────────────────────────────────
    PAYSTACK_SECRET_KEY: str | None = os.getenv("PAYSTACK_SECRET_KEY")
    PAYSTACK_PUBLIC_KEY: str | None = os.getenv("PAYSTACK_PUBLIC_KEY")
    PAYSTACK_API_URL: str = "https://api.paystack.co"

    # ── Supabase ─────────────────────────────────────────────────────
    SUPABASE_URL: str | None = os.getenv("SUPABASE_URL")
    SUPABASE_SERVICE_KEY: str | None = os.getenv("SUPABASE_SERVICE_KEY")

    # ── Cloudflare R2 (S3-compatible) ────────────────────────────────
    R2_ENDPOINT: str | None = os.getenv("R2_ENDPOINT")
    R2_ACCESS_KEY: str | None = os.getenv("R2_ACCESS_KEY")
    R2_SECRET_KEY: str | None = os.getenv("R2_SECRET_KEY")
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET_NAME", "clipai-videos")
    R2_PUBLIC_URL: str | None = os.getenv("R2_PUBLIC_URL")  # optional public access URL

    # ── Processing defaults ──────────────────────────────────────────
    MAX_FILE_SIZE_MB: int = 500
    MAX_CLIP_DURATION_S: int = 120  # max clip length in seconds
    DEFAULT_CLIP_COUNT: int = 5
    SUPPORTED_VIDEO_FORMATS: tuple[str, ...] = (
        ".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv"
    )
    TEMP_DIR: str = "/tmp/clipai"
    JOB_TTL_SECONDS: int = 86400  # 24 hours

    # ── Payment plan mapping ─────────────────────────────────────────
    PLANS: dict[str, dict] = {
        "free": {
            "name": "Free",
            "price": 0,
            "clips_per_month": 5,
            "max_duration": 60,
        },
        "pro": {
            "name": "Pro",
            "price": 9.99,
            "clips_per_month": 50,
            "max_duration": 120,
        },
        "enterprise": {
            "name": "Enterprise",
            "price": 29.99,
            "clips_per_month": 500,
            "max_duration": 300,
        },
    }

    @classmethod
    def validate(cls) -> list[str]:
        """Return a list of missing critical config values."""
        warnings: list[str] = []
        if not cls.JSON2VIDEO_API_KEY or not cls.USE_JSON2VIDEO:
            pass  # FFmpeg is the primary processor — JSON2Video is optional/premium
        else:
            warnings.append("JSON2VIDEO_API_KEY set — will use JSON2Video as primary (premium)")
        if not cls.GEMINI_API_KEY:
            warnings.append("GEMINI_API_KEY not set — video analysis will be unavailable")
        if not cls.GROQ_API_KEY:
            warnings.append("GROQ_API_KEY not set — caption generation will be unavailable")
        if not cls.PAYSTACK_SECRET_KEY:
            warnings.append("PAYSTACK_SECRET_KEY not set — payments will be unavailable")
        if not cls.SUPABASE_URL:
            warnings.append("SUPABASE_URL not set — database features will be unavailable")
        if not cls.R2_ENDPOINT:
            warnings.append("R2_ENDPOINT not set — file storage will be unavailable")
        return warnings


# ── Ensure temp directory exists ─────────────────────────────────────
os.makedirs(Config.TEMP_DIR, exist_ok=True)
