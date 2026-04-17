"""
ClipAI Worker — FFmpeg Fallback Processor
===========================================
Used when JSON2Video is unavailable or fails.  Performs basic video
editing via ``ffmpeg`` subprocess calls: trim, resize, text overlay,
and fade transitions.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from config import Config

logger = logging.getLogger(__name__)


@dataclass
class FFmpegOptions:
    """Options controlling FFmpeg clip generation."""

    output_format: str = "mp4"
    resolution: tuple[int, int] = (1080, 1920)  # 9:16 vertical default
    fps: int = 30
    crf: int = 23  # quality (lower = better, 18-28 reasonable range)
    preset: str = "fast"
    add_watermark: bool = True
    watermark_text: str = "ClipAI"
    captions: bool = True
    caption_style: str = "bold"
    fade_duration: float = 0.5
    aspect_ratio: str = "9:16"


class FFmpegProcessor:
    """Fallback video processor using system FFmpeg.

    All methods write temporary files to ``Config.TEMP_DIR`` and return
    the local path of the generated clip.  The caller is responsible for
    uploading the result to R2 and cleaning up.
    """

    def __init__(self) -> None:
        self.temp_dir = Path(Config.TEMP_DIR)
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        self.available: bool = self._check_ffmpeg()

    # ── Public API ───────────────────────────────────────────────────

    def create_clip(
        self,
        video_url: str,
        start_time: float,
        end_time: float,
        options: FFmpegOptions | None = None,
        caption_text: str | None = None,
    ) -> dict[str, Any]:
        """Trim a video segment, optionally resize and add overlays.

        Parameters
        ----------
        video_url:
            Public URL or local path of the source video.
        start_time:
            Start time in seconds.
        end_time:
            End time in seconds.
        options:
            Output options.
        caption_text:
            Optional text overlay (e.g., "INSANE KILL").

        Returns
        -------
        dict with ``output_path`` (str), ``output_url`` (None — caller uploads),
        and ``duration`` (float).
        """
        if not self.available:
            raise RuntimeError("FFmpeg is not available on this system")

        opts = options or FFmpegOptions()
        duration = end_time - start_time

        if duration <= 0:
            raise ValueError(f"Invalid clip duration: {duration}s (start={start_time}, end={end_time})")
        if duration > Config.MAX_CLIP_DURATION_S:
            logger.warning("Clipping duration %0.1fs exceeds max %ds; trimming", duration, Config.MAX_CLIP_DURATION_S)
            end_time = start_time + Config.MAX_CLIP_DURATION_S
            duration = Config.MAX_CLIP_DURATION_S

        # 1. Download source if it's a URL
        local_source = self._ensure_local(video_url)

        # 2. Generate a unique output filename
        clip_id = uuid.uuid4().hex[:12]
        output_path = self.temp_dir / f"clip_{clip_id}.{opts.output_format}"

        try:
            # 3. Build and run FFmpeg command
            cmd = self._build_command(
                source_path=local_source,
                output_path=str(output_path),
                start_time=start_time,
                end_time=end_time,
                duration=duration,
                opts=opts,
                caption_text=caption_text if opts.captions else None,
            )
            self._run_ffmpeg(cmd)

            if not output_path.exists():
                raise RuntimeError("FFmpeg completed but output file was not created")

            actual_size = output_path.stat().st_size
            logger.info(
                "Clip created: %s (%.1f MB, %.1fs)",
                output_path.name,
                actual_size / (1024 * 1024),
                duration,
            )

            return {
                "output_path": str(output_path),
                "output_url": None,  # caller uploads to R2
                "duration": duration,
                "format": opts.output_format,
                "size_bytes": actual_size,
                "resolution": opts.resolution,
            }
        except Exception as exc:
            # Clean up partial output on failure
            if output_path.exists():
                output_path.unlink(missing_ok=True)
            raise RuntimeError(f"FFmpeg processing failed: {exc}") from exc
        finally:
            # Clean up downloaded source if it was a temp file
            if video_url.startswith("http") and local_source.startswith(str(self.temp_dir)):
                Path(local_source).unlink(missing_ok=True)

    def create_clip_from_segments(
        self,
        video_url: str,
        segments: list[dict[str, float]],
        options: FFmpegOptions | None = None,
    ) -> dict[str, Any]:
        """Concatenate multiple segments into a single clip with transitions.

        Parameters
        ----------
        video_url:
            Public URL or local path of the source video.
        segments:
            List of dicts with ``start_time`` and ``end_time`` keys.
        options:
            Output options.

        Returns
        -------
        Same as ``create_clip``.
        """
        if not segments:
            raise ValueError("At least one segment is required")

        opts = options or FFmpegOptions()
        clip_id = uuid.uuid4().hex[:12]
        local_source = self._ensure_local(video_url)

        try:
            # Step 1: Extract each segment as a separate file
            segment_paths: list[str] = []
            for i, seg in enumerate(segments):
                seg_path = self.temp_dir / f"seg_{clip_id}_{i}.{opts.output_format}"
                duration = seg["end_time"] - seg["start_time"]
                cmd = [
                    "ffmpeg", "-y",
                    "-ss", str(seg["start_time"]),
                    "-i", local_source,
                    "-t", str(duration),
                    "-vf", self._build_scale_filter(opts),
                    "-c:v", "libx264",
                    "-preset", opts.preset,
                    "-crf", str(opts.crf),
                    "-an",  # strip audio for concatenation simplicity
                    "-pix_fmt", "yuv420p",
                    str(seg_path),
                ]
                self._run_ffmpeg(cmd)
                segment_paths.append(str(seg_path))

            # Step 2: Add fade in/out to each segment
            faded_paths: list[str] = []
            for i, seg_path in enumerate(segment_paths):
                faded_path = self.temp_dir / f"fade_{clip_id}_{i}.{opts.output_format}"
                duration = segments[i]["end_time"] - segments[i]["start_time"]
                fade_filter = (
                    f"fade=t=in:st=0:d={opts.fade_duration},"
                    f"fade=t=out:st={duration - opts.fade_duration}:d={opts.fade_duration}"
                )
                cmd = [
                    "ffmpeg", "-y",
                    "-i", seg_path,
                    "-vf", fade_filter,
                    "-c:v", "libx264",
                    "-preset", opts.preset,
                    "-crf", str(opts.crf),
                    "-pix_fmt", "yuv420p",
                    str(faded_path),
                ]
                self._run_ffmpeg(cmd)
                faded_paths.append(str(faded_path))
                # Clean up un-faded segment
                Path(seg_path).unlink(missing_ok=True)

            # Step 3: Concatenate all faded segments
            output_path = self.temp_dir / f"clip_{clip_id}.{opts.output_format}"
            concat_file = self.temp_dir / f"concat_{clip_id}.txt"
            with open(concat_file, "w") as f:
                for fp in faded_paths:
                    f.write(f"file '{fp}'\n")

            cmd = [
                "ffmpeg", "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", str(concat_file),
                "-c:v", "libx264",
                "-preset", opts.preset,
                "-crf", str(opts.crf),
                "-pix_fmt", "yuv420p",
                str(output_path),
            ]
            self._run_ffmpeg(cmd)

            # Step 4: Add watermark if requested
            if opts.add_watermark:
                watermarked_path = self.temp_dir / f"wm_{clip_id}.{opts.output_format}"
                cmd = self._build_watermark_command(
                    str(output_path), str(watermarked_path), opts
                )
                self._run_ffmpeg(cmd)
                output_path.unlink(missing_ok=True)
                output_path = watermarked_path

            # Cleanup
            concat_file.unlink(missing_ok=True)
            for fp in faded_paths:
                Path(fp).unlink(missing_ok=True)

            total_duration = sum(s["end_time"] - s["start_time"] for s in segments)
            return {
                "output_path": str(output_path),
                "output_url": None,
                "duration": total_duration,
                "format": opts.output_format,
                "size_bytes": output_path.stat().st_size,
                "resolution": opts.resolution,
            }
        except Exception as exc:
            raise RuntimeError(f"FFmpeg multi-segment processing failed: {exc}") from exc
        finally:
            if video_url.startswith("http") and local_source.startswith(str(self.temp_dir)):
                Path(local_source).unlink(missing_ok=True)

    def get_video_info(self, video_path: str) -> dict[str, Any]:
        """Extract metadata from a video file using ffprobe."""
        cmd = [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            video_path,
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=True)
            data = json.loads(result.stdout)

            duration = float(data.get("format", {}).get("duration", 0))
            width = 0
            height = 0
            for stream in data.get("streams", []):
                if stream.get("codec_type") == "video":
                    width = stream.get("width", 0)
                    height = stream.get("height", 0)
                    break

            return {
                "duration": duration,
                "width": width,
                "height": height,
                "size": int(data.get("format", {}).get("size", 0)),
                "format_name": data.get("format", {}).get("format_name", ""),
            }
        except (subprocess.CalledProcessError, json.JSONDecodeError, KeyError) as exc:
            logger.error("ffprobe failed for %s: %s", video_path, exc)
            return {"duration": 0, "width": 0, "height": 0, "size": 0, "format_name": ""}

    def health_check(self) -> bool:
        """Return True if FFmpeg is available and working."""
        return self._check_ffmpeg()

    # ── Command Builder ──────────────────────────────────────────────

    def _build_command(
        self,
        source_path: str,
        output_path: str,
        start_time: float,
        end_time: float,
        duration: float,
        opts: FFmpegOptions,
        caption_text: str | None = None,
    ) -> list[str]:
        """Build the complete FFmpeg command for single-segment clip."""
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start_time),
            "-i", source_path,
            "-t", str(duration),
        ]

        # Video filters
        filters: list[str] = [self._build_scale_filter(opts)]

        # Fade in/out
        fade_dur = min(opts.fade_duration, duration / 3)
        filters.append(f"fade=t=in:st=0:d={fade_dur:.2f}")
        filters.append(f"fade=t=out:st={duration - fade_dur:.2f}:d={fade_dur:.2f}")

        # Caption / text overlay
        if caption_text:
            filters.append(self._build_text_filter(caption_text, duration, opts))

        # Watermark
        if opts.add_watermark:
            filters.append(self._build_watermark_filter(opts))

        cmd.extend(["-vf", ",".join(filters)])
        cmd.extend([
            "-c:v", "libx264",
            "-preset", opts.preset,
            "-crf", str(opts.crf),
            "-c:a", "aac",
            "-b:a", "128k",
            "-ar", "44100",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            output_path,
        ])
        return cmd

    @staticmethod
    def _build_scale_filter(opts: FFmpegOptions) -> str:
        """Build the scale/pad filter for aspect ratio conversion."""
        width, height = opts.resolution
        if opts.aspect_ratio == "9:16":
            # Scale to fit width, crop excess height; or pad with blur
            return (
                f"scale={width}:{height}:force_original_aspect_ratio=increase,"
                f"crop={width}:{height},"
                f"setsar=1"
            )
        elif opts.aspect_ratio == "16:9":
            return (
                f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,"
                f"setsar=1"
            )
        elif opts.aspect_ratio == "1:1":
            return (
                f"scale={min(width, height)}:{min(width, height)}:force_original_aspect_ratio=decrease,"
                f"pad={min(width, height)}:{min(width, height)}:(ow-iw)/2:(oh-ih)/2:black,"
                f"setsar=1"
            )
        else:
            return f"scale={width}:{height}:force_original_aspect_ratio=decrease,setsar=1"

    @staticmethod
    def _build_text_filter(
        text: str, duration: float, opts: FFmpegOptions
    ) -> str:
        """Build drawtext filter for caption overlay."""
        # Escape special FFmpeg characters
        safe_text = text.replace("'", "'\\''").replace(":", "\\:").replace("%", "%%")

        font_sizes = {
            "bold": 42,
            "subtitle": 32,
            "neon": 44,
            "minimal": 28,
        }
        font_size = font_sizes.get(opts.caption_style, 36)

        # Caption at bottom center with background box
        box_color = "#000000@0.6"
        border_color = "#000000@0.8"
        border_w = 3

        return (
            f"drawtext=text='{safe_text}'"
            f":fontsize={font_size}"
            f":fontcolor=white"
            f":borderw={border_w}"
            f":bordercolor={border_color}"
            f":box=1"
            f":boxcolor={box_color}"
            f":boxborderw=8"
            f":x=(w-text_w)/2"
            f":y=h-th-60"
            f":enable='between(t,0,{duration})'"
        )

    @staticmethod
    def _build_watermark_filter(opts: FFmpegOptions) -> str:
        """Build drawtext filter for watermark."""
        safe_text = opts.watermark_text.replace("'", "'\\''").replace(":", "\\:")
        return (
            f"drawtext=text='{safe_text}'"
            f":fontsize=16"
            f":fontcolor=white@0.5"
            f":x=w-tw-16"
            f":y=16"
        )

    def _build_watermark_command(
        self, input_path: str, output_path: str, opts: FFmpegOptions
    ) -> list[str]:
        """Build FFmpeg command to add watermark to existing video."""
        filter_str = self._build_watermark_filter(opts)
        return [
            "ffmpeg", "-y",
            "-i", input_path,
            "-vf", filter_str,
            "-c:v", "libx264",
            "-preset", opts.preset,
            "-crf", str(opts.crf),
            "-c:a", "copy",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            output_path,
        ]

    # ── Utilities ────────────────────────────────────────────────────

    def _run_ffmpeg(self, cmd: list[str], timeout: int = 120) -> subprocess.CompletedProcess:
        """Execute an FFmpeg command and return the result."""
        logger.debug("Running: %s", " ".join(cmd))
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=True,
            )
            return result
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr[-2000:] if exc.stderr else "no stderr"
            logger.error("FFmpeg failed (code %d): %s", exc.returncode, stderr)
            raise
        except subprocess.TimeoutExpired:
            logger.error("FFmpeg timed out after %ds", timeout)
            raise RuntimeError(f"FFmpeg timed out after {timeout}s")

    def _ensure_local(self, video_url: str) -> str:
        """Download a URL to a temp file, or return the path if already local."""
        if not video_url.startswith("http"):
            if os.path.isfile(video_url):
                return video_url
            raise FileNotFoundError(f"Source video not found: {video_url}")

        # Download
        import requests
        local_path = self.temp_dir / f"source_{uuid.uuid4().hex[:8]}{self._ext_from_url(video_url)}"
        logger.info("Downloading source video: %s -> %s", video_url, local_path)

        resp = requests.get(video_url, stream=True, timeout=60)
        resp.raise_for_status()

        downloaded = 0
        with open(local_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
                downloaded += len(chunk)
                # Enforce max file size
                if downloaded > Config.MAX_FILE_SIZE_MB * 1024 * 1024:
                    local_path.unlink(missing_ok=True)
                    raise ValueError(
                        f"Source video exceeds max size of {Config.MAX_FILE_SIZE_MB}MB"
                    )

        logger.info("Downloaded %.1f MB", downloaded / (1024 * 1024))
        return str(local_path)

    @staticmethod
    def _check_ffmpeg() -> bool:
        """Check if ffmpeg is available on the system."""
        try:
            result = subprocess.run(
                ["ffmpeg", "-version"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            return result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False

    @staticmethod
    def _ext_from_url(url: str) -> str:
        """Extract file extension from URL."""
        path = url.split("?")[0].split("#")[0]
        ext = os.path.splitext(path)[1].lower()
        if ext in Config.SUPPORTED_VIDEO_FORMATS:
            return ext
        return ".mp4"  # default
