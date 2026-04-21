#!/usr/bin/env python3
"""
ClipAI "Anvil" - Video Processing Worker
Railway.app Deployment

Handles:
- FFmpeg video processing with timestamp-based cutting
- Resolution scaling (480p/720p/1080p/4K)
- Watermark overlay with glow effects
- Dual storage upload (R2 primary, B2 fallback)
- Automatic cleanup of temp files
- Webhook notifications to Supabase
"""

import os
import sys
import json
import uuid
import shutil
import logging
import subprocess
import tempfile
from pathlib import Path
from typing import Optional, Dict, List, Tuple
from dataclasses import dataclass
from datetime import datetime

import boto3
import requests
from botocore.exceptions import ClientError, NoCredentialsError
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# ============================================================
# CONFIGURATION
# ============================================================

@dataclass
class Config:
    """Environment configuration"""
    # Supabase
    SUPABASE_URL: str = os.getenv('SUPABASE_URL', '')
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
    
    # Cloudflare R2 (Primary Storage)
    R2_ACCESS_KEY_ID: str = os.getenv('R2_ACCESS_KEY_ID', '')
    R2_SECRET_ACCESS_KEY: str = os.getenv('R2_SECRET_ACCESS_KEY', '')
    R2_ENDPOINT_URL: str = os.getenv('R2_ENDPOINT_URL', '')
    R2_BUCKET_NAME: str = os.getenv('R2_BUCKET_NAME', 'clipai-videos')
    
    # Backblaze B2 (Fallback Storage)
    B2_APPLICATION_KEY_ID: str = os.getenv('B2_APPLICATION_KEY_ID', '')
    B2_APPLICATION_KEY: str = os.getenv('B2_APPLICATION_KEY', '')
    B2_ENDPOINT_URL: str = os.getenv('B2_ENDPOINT_URL', '')
    B2_BUCKET_NAME: str = os.getenv('B2_BUCKET_NAME', 'clipai-fallback')
    
    # Worker Settings
    MAX_FILE_SIZE_MB: int = 500
    TEMP_DIR: str = os.getenv('TEMP_DIR', '/tmp/clipai')
    REQUEST_TIMEOUT: int = 300  # 5 minutes
    
    # Credit Costs
    CREDIT_COSTS = {
        '480p': 10,
        '720p': 20,
        '1080p': 50,
        '4k': 100
    }

config = Config()

# ============================================================
# STORAGE CLIENTS
# ============================================================

class StorageManager:
    """Manages dual storage with R2 primary and B2 fallback"""
    
    def __init__(self):
        self.r2_client = None
        self.b2_client = None
        self._init_clients()
    
    def _init_clients(self):
        """Initialize S3-compatible clients"""
        try:
            # R2 Client
            if config.R2_ENDPOINT_URL:
                self.r2_client = boto3.client(
                    's3',
                    endpoint_url=config.R2_ENDPOINT_URL,
                    aws_access_key_id=config.R2_ACCESS_KEY_ID,
                    aws_secret_access_key=config.R2_SECRET_ACCESS_KEY,
                    region_name='auto'
                )
                logger.info("R2 client initialized")
        except Exception as e:
            logger.error(f"Failed to initialize R2 client: {e}")
        
        try:
            # B2 Client
            if config.B2_ENDPOINT_URL:
                self.b2_client = boto3.client(
                    's3',
                    endpoint_url=config.B2_ENDPOINT_URL,
                    aws_access_key_id=config.B2_APPLICATION_KEY_ID,
                    aws_secret_access_key=config.B2_APPLICATION_KEY,
                    region_name='us-west-002'
                )
                logger.info("B2 client initialized")
        except Exception as e:
            logger.error(f"Failed to initialize B2 client: {e}")
    
    def download_video(self, url: str, local_path: str) -> bool:
        """Download video from URL to local path"""
        try:
            logger.info(f"Downloading video from {url}")
            response = requests.get(url, stream=True, timeout=config.REQUEST_TIMEOUT)
            response.raise_for_status()
            
            with open(local_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            file_size = os.path.getsize(local_path) / (1024 * 1024)  # MB
            logger.info(f"Downloaded {file_size:.2f} MB to {local_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to download video: {e}")
            return False
    
    def upload_file(self, local_path: str, key: str, content_type: str = 'video/mp4') -> Tuple[bool, str, str]:
        """
        Upload file to storage with fallback
        Returns: (success, url, storage_provider)
        """
        # Try R2 first
        if self.r2_client:
            try:
                self.r2_client.upload_file(
                    local_path, 
                    config.R2_BUCKET_NAME, 
                    key,
                    ExtraArgs={'ContentType': content_type}
                )
                url = f"{config.R2_ENDPOINT_URL}/{config.R2_BUCKET_NAME}/{key}"
                logger.info(f"Uploaded to R2: {url}")
                return True, url, 'r2'
            except Exception as e:
                logger.warning(f"R2 upload failed, trying B2: {e}")
        
        # Fallback to B2
        if self.b2_client:
            try:
                self.b2_client.upload_file(
                    local_path,
                    config.B2_BUCKET_NAME,
                    key,
                    ExtraArgs={'ContentType': content_type}
                )
                url = f"{config.B2_ENDPOINT_URL}/{config.B2_BUCKET_NAME}/{key}"
                logger.info(f"Uploaded to B2: {url}")
                return True, url, 'b2'
            except Exception as e:
                logger.error(f"B2 upload also failed: {e}")
        
        return False, '', ''
    
    def delete_file(self, key: str, storage: str) -> bool:
        """Delete file from storage (for cleanup)"""
        try:
            if storage == 'r2' and self.r2_client:
                self.r2_client.delete_object(Bucket=config.R2_BUCKET_NAME, Key=key)
            elif storage == 'b2' and self.b2_client:
                self.b2_client.delete_object(Bucket=config.B2_BUCKET_NAME, Key=key)
            return True
        except Exception as e:
            logger.warning(f"Failed to delete file {key}: {e}")
            return False

storage = StorageManager()

# ============================================================
# SUPABASE HELPERS
# ============================================================

class SupabaseClient:
    """Supabase API client"""
    
    def __init__(self):
        self.base_url = config.SUPABASE_URL
        self.headers = {
            'apikey': config.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': f'Bearer {config.SUPABASE_SERVICE_ROLE_KEY}',
            'Content-Type': 'application/json'
        }
    
    def update_clip_status(self, clip_id: str, status: str, data: dict = None) -> bool:
        """Update clip status in Supabase"""
        try:
            url = f"{self.base_url}/rest/v1/clips?id=eq.{clip_id}"
            payload = {'status': status, 'updated_at': datetime.utcnow().isoformat()}
            if data:
                payload.update(data)
            
            response = requests.patch(url, headers=self.headers, json=payload, timeout=30)
            response.raise_for_status()
            logger.info(f"Updated clip {clip_id} status to {status}")
            return True
        except Exception as e:
            logger.error(f"Failed to update clip status: {e}")
            return False
    
    def deduct_credits(self, user_id: str, amount: int, clip_id: str, description: str) -> bool:
        """Deduct credits from user account"""
        try:
            # Call the Supabase function to deduct credits
            url = f"{self.base_url}/rest/v1/rpc/deduct_credits"
            payload = {
                'p_user_id': user_id,
                'p_amount': amount,
                'p_type': f'render_{description}',
                'p_description': f'Render clip at {description}',
                'p_clip_id': clip_id
            }
            
            response = requests.post(url, headers=self.headers, json=payload, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                if result:
                    logger.info(f"Deducted {amount} credits from user {user_id}")
                    return True
                else:
                    logger.warning(f"Insufficient credits for user {user_id}")
                    return False
            else:
                logger.error(f"Credit deduction failed: {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to deduct credits: {e}")
            return False
    
    def notify_user(self, user_id: str, clip_id: str, status: str, message: str) -> bool:
        """Send notification to user (for webhook/push)"""
        try:
            # This would integrate with your notification system
            # For now, just log it
            logger.info(f"Notification for user {user_id}: {message}")
            return True
        except Exception as e:
            logger.error(f"Failed to send notification: {e}")
            return False

supabase = SupabaseClient()

# ============================================================
# VIDEO PROCESSING (FFMPEG)
# ============================================================

class VideoProcessor:
    """FFmpeg-based video processor"""
    
    RESOLUTIONS = {
        '480p': {'width': 854, 'height': 480, 'vf': 'scale=854:480'},
        '720p': {'width': 1280, 'height': 720, 'vf': 'scale=1280:720'},
        '1080p': {'width': 1920, 'height': 1080, 'vf': 'scale=1920:1080'},
        '4k': {'width': 3840, 'height': 2160, 'vf': 'scale=3840:2160'}
    }
    
    def __init__(self, temp_dir: str):
        self.temp_dir = temp_dir
        os.makedirs(temp_dir, exist_ok=True)
    
    def _run_ffmpeg(self, cmd: List[str]) -> Tuple[bool, str]:
        """Execute FFmpeg command"""
        try:
            logger.info(f"Running FFmpeg: {' '.join(cmd)}")
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=config.REQUEST_TIMEOUT
            )
            
            if result.returncode == 0:
                return True, result.stdout
            else:
                logger.error(f"FFmpeg error: {result.stderr}")
                return False, result.stderr
                
        except subprocess.TimeoutExpired:
            logger.error("FFmpeg timed out")
            return False, "Processing timeout"
        except Exception as e:
            logger.error(f"FFmpeg execution failed: {e}")
            return False, str(e)
    
    def cut_clip(self, input_path: str, output_path: str, start: float, end: float, 
                 resolution: str = '720p', add_watermark: bool = True) -> bool:
        """
        Cut a clip from video using FFmpeg
        
        Args:
            input_path: Path to input video
            output_path: Path for output clip
            start: Start time in seconds
            end: End time in seconds
            resolution: Target resolution (480p/720p/1080p/4k)
            add_watermark: Whether to add ClipAI watermark
        """
        duration = end - start
        res_config = self.RESOLUTIONS.get(resolution, self.RESOLUTIONS['720p'])
        
        # Build FFmpeg command
        cmd = [
            'ffmpeg',
            '-y',  # Overwrite output
            '-ss', str(start),  # Start time
            '-t', str(duration),  # Duration
            '-i', input_path,  # Input file
            '-c:v', 'libx264',  # Video codec
            '-preset', 'fast',  # Encoding speed
            '-crf', '23',  # Quality (lower = better)
            '-c:a', 'aac',  # Audio codec
            '-b:a', '128k',  # Audio bitrate
        ]
        
        # Add video filter for scaling
        vf = res_config['vf']
        
        # Add watermark if enabled
        if add_watermark:
            # Create a simple text watermark with glow effect
            watermark_filter = (
                f"drawtext=text='ClipAI':fontsize=24:fontcolor=white@0.8:"
                f"x=w-tw-20:y=h-th-20:box=1:boxcolor=black@0.5:boxborderw=5"
            )
            vf = f"{vf},{watermark_filter}"
        
        cmd.extend(['-vf', vf])
        
        # Add output file
        cmd.append(output_path)
        
        success, error = self._run_ffmpeg(cmd)
        return success
    
    def get_video_info(self, video_path: str) -> Optional[Dict]:
        """Get video metadata using ffprobe"""
        try:
            cmd = [
                'ffprobe',
                '-v', 'error',
                '-show_entries', 'format=duration,size,bit_rate',
                '-show_entries', 'stream=width,height,codec_name',
                '-of', 'json',
                video_path
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                data = json.loads(result.stdout)
                return {
                    'duration': float(data['format'].get('duration', 0)),
                    'width': data['streams'][0].get('width', 0),
                    'height': data['streams'][0].get('height', 0),
                    'size_mb': int(data['format'].get('size', 0)) / (1024 * 1024)
                }
            else:
                logger.error(f"ffprobe error: {result.stderr}")
                return None
                
        except Exception as e:
            logger.error(f"Failed to get video info: {e}")
            return None
    
    def cleanup(self, *paths: str):
        """Clean up temporary files and directories"""
        for path in paths:
            try:
                if os.path.isfile(path):
                    os.remove(path)
                    logger.info(f"Deleted file: {path}")
                elif os.path.isdir(path):
                    shutil.rmtree(path)
                    logger.info(f"Deleted directory: {path}")
            except Exception as e:
                logger.warning(f"Failed to delete {path}: {e}")

# ============================================================
# MAIN PROCESSING PIPELINE
# ============================================================

def process_clip_job(job_data: dict) -> dict:
    """
    Main clip processing pipeline
    
    Expected job_data:
    {
        "clip_id": "uuid",
        "user_id": "uuid",
        "video_url": "https://...",
        "timestamps": [{"start": 10.5, "end": 25.0, "hype_score": 95}],
        "resolution": "720p",
        "add_watermark": true
    }
    """
    clip_id = job_data.get('clip_id')
    user_id = job_data.get('user_id')
    video_url = job_data.get('video_url')
    timestamps = job_data.get('timestamps', [])
    resolution = job_data.get('resolution', '720p')
    add_watermark = job_data.get('add_watermark', True)
    
    # Create unique temp directory for this job
    job_temp_dir = os.path.join(config.TEMP_DIR, str(clip_id))
    os.makedirs(job_temp_dir, exist_ok=True)
    
    processor = VideoProcessor(job_temp_dir)
    
    try:
        # Update status to processing
        supabase.update_clip_status(clip_id, 'rendering')
        
        # Download source video
        source_path = os.path.join(job_temp_dir, 'source.mp4')
        if not storage.download_video(video_url, source_path):
            raise Exception("Failed to download source video")
        
        # Get video info
        video_info = processor.get_video_info(source_path)
        if not video_info:
            raise Exception("Failed to analyze video")
        
        logger.info(f"Video info: {video_info}")
        
        # Process each timestamp (for now, just take the best one)
        if not timestamps:
            raise Exception("No timestamps provided")
        
        # Sort by hype score and take the best
        best_timestamp = max(timestamps, key=lambda x: x.get('hype_score', 0))
        start = best_timestamp.get('start', 0)
        end = best_timestamp.get('end', start + 30)
        hype_score = best_timestamp.get('hype_score', 0)
        
        # Ensure clip isn't too long (max 60 seconds)
        if end - start > 60:
            end = start + 60
        
        # Cut the clip
        output_filename = f"clip_{clip_id}.mp4"
        output_path = os.path.join(job_temp_dir, output_filename)
        
        logger.info(f"Cutting clip from {start}s to {end}s at {resolution}")
        
        if not processor.cut_clip(source_path, output_path, start, end, resolution, add_watermark):
            raise Exception("FFmpeg processing failed")
        
        # Get output file info
        output_info = processor.get_video_info(output_path)
        
        # Upload to storage
        storage_key = f"renders/{user_id}/{clip_id}/{output_filename}"
        success, final_url, storage_provider = storage.upload_file(
            output_path, storage_key, 'video/mp4'
        )
        
        if not success:
            raise Exception("Failed to upload to storage")
        
        # Deduct credits
        credit_cost = config.CREDIT_COSTS.get(resolution, 20)
        credits_deducted = supabase.deduct_credits(
            user_id, credit_cost, clip_id, resolution
        )
        
        if not credits_deducted:
            logger.warning(f"Failed to deduct credits for clip {clip_id}")
            # Don't fail the job, but log it
        
        # Update Supabase with success
        supabase.update_clip_status(clip_id, 'completed', {
            'final_url': final_url,
            'final_storage': storage_provider,
            'resolution': resolution,
            'duration_seconds': int(end - start),
            'file_size_mb': round(output_info.get('size_mb', 0), 2) if output_info else 0,
            'hype_score': hype_score,
            'credits_deducted': credits_deducted,
            'processing_completed_at': datetime.utcnow().isoformat()
        })
        
        # Notify user
        supabase.notify_user(user_id, clip_id, 'completed', 
                           f'Your clip is ready! Download it within 30 minutes.')
        
        logger.info(f"Clip {clip_id} processed successfully")
        
        return {
            'success': True,
            'clip_id': clip_id,
            'url': final_url,
            'resolution': resolution,
            'duration': end - start
        }
        
    except Exception as e:
        logger.error(f"Processing failed for clip {clip_id}: {e}")
        
        # Update Supabase with failure
        supabase.update_clip_status(clip_id, 'failed', {
            'error_message': str(e)
        })
        
        supabase.notify_user(user_id, clip_id, 'failed',
                           'Clip processing failed. Please try again.')
        
        return {
            'success': False,
            'clip_id': clip_id,
            'error': str(e)
        }
        
    finally:
        # CRITICAL: Always cleanup temp files
        logger.info(f"Cleaning up temp directory: {job_temp_dir}")
        processor.cleanup(job_temp_dir)

# ============================================================
# FLASK ROUTES
# ============================================================

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'version': '1.0.0'
    })

@app.route('/process', methods=['POST'])
def process_video():
    """Main processing endpoint"""
    try:
        job_data = request.get_json()
        
        # Validate required fields
        required = ['clip_id', 'user_id', 'video_url', 'timestamps']
        for field in required:
            if field not in job_data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Process the clip
        result = process_clip_job(job_data)
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        logger.error(f"Request processing failed: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/webhook/supabase', methods=['POST'])
def supabase_webhook():
    """Webhook for Supabase events"""
    try:
        data = request.get_json()
        logger.info(f"Received Supabase webhook: {data}")
        
        # Handle different event types
        event_type = data.get('type')
        
        if event_type == 'clip.created':
            # Auto-start processing for new clips
            clip_data = data.get('record', {})
            job_data = {
                'clip_id': clip_data.get('id'),
                'user_id': clip_data.get('user_id'),
                'video_url': clip_data.get('original_url'),
                'timestamps': clip_data.get('gemini_timestamps', []),
                'resolution': clip_data.get('resolution', '720p'),
                'add_watermark': clip_data.get('user_tier') != 'pro'
            }
            
            # Process asynchronously (in production, use a queue)
            result = process_clip_job(job_data)
            return jsonify(result), 200
        
        return jsonify({'status': 'received'}), 200
        
    except Exception as e:
        logger.error(f"Webhook processing failed: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/status/<clip_id>', methods=['GET'])
def get_clip_status(clip_id: str):
    """Get processing status of a clip"""
    # This would query Supabase for the clip status
    return jsonify({
        'clip_id': clip_id,
        'status': 'processing',
        'message': 'Use Supabase realtime for status updates'
    })

# ============================================================
# MAIN
# ============================================================

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8080))
    
    logger.info(f"Starting ClipAI Anvil Worker on port {port}")
    logger.info(f"Temp directory: {config.TEMP_DIR}")
    
    # Ensure temp directory exists
    os.makedirs(config.TEMP_DIR, exist_ok=True)
    
    # Run Flask app
    app.run(host='0.0.0.0', port=port, debug=False)
