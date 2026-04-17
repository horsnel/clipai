"""
ClipAI Worker — JSON2Video Processor (PRIMARY)
================================================
Communicates with the json2video.com API to render video clips
programmatically from scene definitions.  Falls back to FFmpeg when
the API key is missing or on unrecoverable errors.

API docs reference: https://json2video.com/developers/
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

import requests

from config import Config

logger = logging.getLogger(__name__)


@dataclass
class SceneDefinition:
    """Represents a single scene in a JSON2Video project."""

    duration: float
    start_time: float  # offset into source video
    end_time: float
    transition: str = "fade"  # fade, dissolve, slide_left, slide_right, zoom
    zoom_effect: bool = False
    zoom_start: float = 1.0
    zoom_end: float = 1.3
    caption_text: str | None = None
    caption_style: str = "bold"  # bold, subtitle, neon, minimal
    pan_direction: str | None = None  # left, right, up, down

    def to_api_dict(self, source_url: str) -> dict[str, Any]:
        """Convert to JSON2Video API scene object."""
        scene: dict[str, Any] = {
            "duration": self.duration,
            "transition": self.transition,
            "elements": [],
        }

        # Main video element
        video_element: dict[str, Any] = {
            "type": "video",
            "src": source_url,
            "settings": {
                "start": self.start_time,
                "duration": self.end_time - self.start_time,
            },
        }

        # Zoom / pan effects via Ken Burns parameters
        if self.zoom_effect:
            video_element["settings"]["zoom_start"] = self.zoom_start
            video_element["settings"]["zoom_end"] = self.zoom_end

        if self.pan_direction:
            video_element["settings"]["pan"] = self.pan_direction

        scene["elements"].append(video_element)

        # Caption overlay
        if self.caption_text:
            caption_styles = {
                "bold": {
                    "font_family": "Arial Black",
                    "font_size": 42,
                    "color": "#FFFFFF",
                    "background_color": "#00000099",
                    "position": "bottom",
                    "y": 80,
                    "bold": True,
                },
                "subtitle": {
                    "font_family": "Arial",
                    "font_size": 32,
                    "color": "#FFFFFF",
                    "background_color": "#00000066",
                    "position": "bottom",
                    "y": 60,
                    "bold": False,
                },
                "neon": {
                    "font_family": "Arial Black",
                    "font_size": 44,
                    "color": "#00FFFF",
                    "background_color": "transparent",
                    "position": "center",
                    "y": 0,
                    "bold": True,
                    "shadow": {"color": "#00FFFF", "blur": 10},
                },
                "minimal": {
                    "font_family": "Arial",
                    "font_size": 28,
                    "color": "#FFFFFF",
                    "background_color": "transparent",
                    "position": "bottom",
                    "y": 40,
                    "bold": False,
                },
            }
            style = caption_styles.get(self.caption_style, caption_styles["bold"])
            caption_element = {
                "type": "text",
                "content": self.caption_text,
                "settings": {
                    "position": style["position"],
                    "y": style["y"],
                    "font_family": style["font_family"],
                    "font_size": style["font_size"],
                    "color": style["color"],
                    "bold": style.get("bold", False),
                },
            }
            if style.get("background_color") and style["background_color"] != "transparent":
                caption_element["settings"]["background_color"] = style["background_color"]
            if "shadow" in style:
                caption_element["settings"]["shadow"] = style["shadow"]

            scene["elements"].append(caption_element)

        return scene


@dataclass
class ClipOptions:
    """Options controlling clip generation."""

    output_format: str = "mp4"
    resolution: tuple[int, int] = (1080, 1920)  # 9:16 vertical by default
    fps: int = 30
    quality: int = 85  # 0-100
    aspect_ratio: str = "9:16"
    add_watermark: bool = True
    watermark_text: str = "ClipAI"
    captions: bool = True
    caption_style: str = "bold"
    beat_sync: bool = False


class JSON2VideoProcessor:
    """Primary video processor using the JSON2Video.com rendering API.

    Usage::

        proc = JSON2VideoProcessor()
        result = proc.create_clip(
            video_url="https://r2.example.com/video.mp4",
            scenes=[SceneDefinition(...)],
            options=ClipOptions(),
        )
        # result = {"output_url": "...", "duration": 12.5}
    """

    MAX_RETRIES = 3
    POLL_INTERVAL_S = 5
    POLL_TIMEOUT_S = 300  # 5 minutes max wait for render

    def __init__(self) -> None:
        self.api_key = Config.JSON2VIDEO_API_KEY
        self.api_url = Config.JSON2VIDEO_API_URL
        self.available: bool = bool(self.api_key)

        if not self.available:
            logger.warning("JSON2VIDEO_API_KEY not set — processor unavailable")

        # Session with retry-friendly defaults
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"apikey {self.api_key}" if self.api_key else "",
            "Content-Type": "application/json",
        })

    # ── Public API ───────────────────────────────────────────────────

    def create_clip(
        self,
        video_url: str,
        scenes: list[SceneDefinition],
        options: ClipOptions | None = None,
    ) -> dict[str, Any]:
        """Create a short-form clip from a list of scene definitions.

        Parameters
        ----------
        video_url:
            Public URL of the source video (R2 or similar).
        scenes:
            Ordered list of scene definitions describing the edit.
        options:
            Output quality / format options.

        Returns
        -------
        dict with ``output_url`` (str) and ``duration`` (float in seconds).

        Raises
        ------
        RuntimeError
            If the API call or render fails after retries.
        """
        if not self.available:
            raise RuntimeError("JSON2Video API key not configured")

        if not scenes:
            raise ValueError("At least one scene is required")

        opts = options or ClipOptions()

        try:
            project = self._build_project(video_url, scenes, opts)
            job_id = self._submit_project(project)
            output_url = self._poll_until_complete(job_id)
            duration = sum(s.duration for s in scenes)

            return {
                "output_url": output_url,
                "duration": duration,
                "resolution": opts.resolution,
                "format": opts.output_format,
            }
        except Exception as exc:
            logger.error("JSON2Video clip creation failed: %s", exc)
            raise RuntimeError(f"JSON2Video processing failed: {exc}") from exc

    def health_check(self) -> bool:
        """Return True if the API is reachable and key is valid."""
        if not self.available:
            return False
        try:
            resp = self.session.get(
                f"{self.api_url}/account",
                timeout=10,
            )
            return resp.status_code == 200
        except Exception:
            return False

    # ── Project Builder ──────────────────────────────────────────────

    def _build_project(
        self,
        video_url: str,
        scenes: list[SceneDefinition],
        opts: ClipOptions,
    ) -> dict[str, Any]:
        """Assemble a complete JSON2Video project payload."""
        api_scenes = []
        for scene in scenes:
            api_scenes.append(scene.to_api_dict(video_url))

        width, height = opts.resolution

        project: dict[str, Any] = {
            "project": {
                "name": f"clipai-{self._hash_scenes(scenes)}",
                "resolution": f"{width}x{height}",
                "fps": opts.fps,
                "quality": opts.quality,
                "scenes": api_scenes,
            }
        }

        # Global watermark
        if opts.add_watermark:
            project["project"]["watermark"] = {
                "type": "text",
                "content": opts.watermark_text,
                "position": "top-right",
                "x": 16,
                "y": 16,
                "font_size": 18,
                "color": "#FFFFFF80",
            }

        return project

    # ── API Interaction ──────────────────────────────────────────────

    def _submit_project(self, project: dict[str, Any]) -> str:
        """POST the project to JSON2Video and return the job ID."""
        url = f"{self.api_url}/projects/create"
        last_exc: Exception | None = None

        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                resp = self.session.post(url, json=project, timeout=30)
                resp.raise_for_status()
                data = resp.json()
                job_id = data.get("id") or data.get("jobId") or data.get("project", {}).get("id")
                if not job_id:
                    raise RuntimeError(f"No job ID in response: {data}")
                logger.info("JSON2Video project submitted: %s (attempt %d)", job_id, attempt)
                return job_id
            except requests.HTTPError as exc:
                last_exc = exc
                status = exc.response.status_code if exc.response is not None else "unknown"
                logger.warning(
                    "JSON2Video submit failed (attempt %d/%d): HTTP %s — %s",
                    attempt, self.MAX_RETRIES, status, exc,
                )
                if attempt < self.MAX_RETRIES:
                    time.sleep(2 ** attempt)
            except requests.RequestException as exc:
                last_exc = exc
                logger.warning(
                    "JSON2Video network error (attempt %d/%d): %s",
                    attempt, self.MAX_RETRIES, exc,
                )
                if attempt < self.MAX_RETRIES:
                    time.sleep(2 ** attempt)

        raise RuntimeError(f"Failed to submit project after {self.MAX_RETRIES} retries: {last_exc}")

    def _poll_until_complete(self, job_id: str) -> str:
        """Poll the render status until complete or timeout.  Returns output URL."""
        url = f"{self.api_url}/projects/{job_id}"
        start = time.monotonic()

        while time.monotonic() - start < self.POLL_TIMEOUT_S:
            try:
                resp = self.session.get(url, timeout=15)
                resp.raise_for_status()
                data = resp.json()

                status = (data.get("status")
                          or data.get("project", {}).get("status")
                          or "").lower()

                if status in ("completed", "done", "finished"):
                    output_url = (
                        data.get("output")
                        or data.get("outputUrl")
                        or data.get("project", {}).get("output")
                        or data.get("project", {}).get("outputUrl")
                    )
                    if not output_url:
                        raise RuntimeError(f"Job {job_id} completed but no output URL returned")
                    logger.info("JSON2Video render complete: %s", output_url)
                    return output_url

                if status in ("failed", "error"):
                    error_msg = data.get("error") or data.get("message") or "unknown error"
                    raise RuntimeError(f"Render failed for job {job_id}: {error_msg}")

                # Still processing / queued
                progress = data.get("progress", 0)
                logger.debug("JSON2Video job %s status=%s progress=%d%%", job_id, status, progress)

            except requests.RequestException as exc:
                logger.warning("Poll error for job %s: %s", job_id, exc)

            time.sleep(self.POLL_INTERVAL_S)

        raise RuntimeError(f"Render timeout after {self.POLL_TIMEOUT_S}s for job {job_id}")

    # ── Helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _hash_scenes(scenes: list[SceneDefinition]) -> str:
        """Create a short deterministic hash from scene data for naming."""
        raw = json.dumps(
            [{"s": s.start_time, "e": s.end_time, "c": s.caption_text} for s in scenes],
            sort_keys=True,
        )
        return hashlib.sha256(raw.encode()).hexdigest()[:12]


# ── Convenience builder ──────────────────────────────────────────────

def build_highlight_scenes(
    highlights: list[dict[str, Any]],
    captions: bool = True,
    beat_sync: bool = False,
) -> list[SceneDefinition]:
    """Convert a list of highlight dicts into SceneDefinition objects.

    Each highlight dict should have:
        - start_time (float)
        - end_time (float)
        - label (str, optional) — used as caption text
        - intensity (str, optional: "high"|"medium"|"low") — affects effects
    """
    intensity_zoom = {
        "high": (1.0, 1.4),
        "medium": (1.0, 1.2),
        "low": (1.0, 1.1),
    }

    transitions = ["fade", "dissolve", "slide_left", "slide_right", "zoom"]
    pan_directions = [None, None, "left", "right", "up", "down"]

    scenes: list[SceneDefinition] = []
    for i, hl in enumerate(highlights):
        intensity = hl.get("intensity", "medium")
        zoom_start, zoom_end = intensity_zoom.get(intensity, intensity_zoom["medium"])

        scene = SceneDefinition(
            duration=hl["end_time"] - hl["start_time"],
            start_time=hl["start_time"],
            end_time=hl["end_time"],
            transition=transitions[i % len(transitions)],
            zoom_effect=True,
            zoom_start=zoom_start,
            zoom_end=zoom_end,
            caption_text=hl.get("label") if captions else None,
            caption_style="bold" if intensity == "high" else "subtitle",
            pan_direction=pan_directions[i % len(pan_directions)] if beat_sync else None,
        )
        scenes.append(scene)

    return scenes
