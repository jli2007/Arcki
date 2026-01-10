"""
Example client script for interacting with the 3D Rendering Service.

This demonstrates how to call the rendering API from Python.
"""

import base64
import json
import sys
from pathlib import Path
from typing import Optional

import requests


class RenderingServiceClient:
    """Client for the 3D Rendering Service API."""
    
    def __init__(self, base_url: str):
        """
        Initialize the client.
        
        Args:
            base_url: Base URL of the Modal endpoint (e.g., "https://workspace--render-frame.modal.run")
        """
        self.base_url = base_url.rstrip("/")
        self.frame_endpoint = f"{self.base_url}/render_frame"
        self.video_endpoint = f"{self.base_url}/render_video"
        self.cached_endpoint = f"{self.base_url}/render_cached_frame"
    
    def encode_blend_file(self, blend_file_path: str) -> str:
        """Read and base64-encode a Blender file."""
        with open(blend_file_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
    
    def render_frame(
        self,
        blend_file_path: str,
        frame_number: int = 1,
        resolution_x: int = 1920,
        resolution_y: int = 1080,
        samples: int = 128,
        output_path: Optional[str] = None,
        use_gpu: Optional[bool] = None,
    ) -> bytes:
        """
        Render a single frame from a Blender file.
        
        Returns:
            PNG image bytes
        """
        print(f"🎬 Rendering frame {frame_number} from {blend_file_path}...")
        
        blend_data = self.encode_blend_file(blend_file_path)
        
        payload = {
            "blend_file_base64": blend_data,
            "frame_number": frame_number,
            "resolution_x": resolution_x,
            "resolution_y": resolution_y,
            "samples": samples,
        }
        
        if use_gpu is not None:
            payload["use_gpu"] = use_gpu
        
        response = requests.post(self.frame_endpoint, json=payload)
        response.raise_for_status()
        
        result = response.json()
        
        if not result.get("success"):
            raise Exception(f"Rendering failed: {result.get('message', 'Unknown error')}")
        
        # Decode the PNG image
        png_bytes = base64.b64decode(result["output_base64"])
        
        # Save to file if output path provided
        if output_path:
            Path(output_path).write_bytes(png_bytes)
            print(f"✅ Frame saved to {output_path}")
        
        return png_bytes
    
    def render_video(
        self,
        blend_file_path: str,
        start_frame: int = 1,
        end_frame: int = 250,
        frame_skip: int = 1,
        fps: int = 24,
        resolution_x: int = 1920,
        resolution_y: int = 1080,
        samples: int = 128,
        output_path: Optional[str] = None,
        use_gpu: Optional[bool] = None,
    ) -> bytes:
        """
        Render multiple frames and combine into a video.
        
        Returns:
            MP4 video bytes
        """
        frame_count = len(range(start_frame, end_frame + 1, frame_skip))
        print(f"🎞️ Rendering video: {frame_count} frames ({start_frame} to {end_frame})...")
        
        blend_data = self.encode_blend_file(blend_file_path)
        
        payload = {
            "blend_file_base64": blend_data,
            "start_frame": start_frame,
            "end_frame": end_frame,
            "frame_skip": frame_skip,
            "fps": fps,
            "resolution_x": resolution_x,
            "resolution_y": resolution_y,
            "samples": samples,
        }
        
        if use_gpu is not None:
            payload["use_gpu"] = use_gpu
        
        response = requests.post(self.video_endpoint, json=payload)
        response.raise_for_status()
        
        result = response.json()
        
        if not result.get("success"):
            raise Exception(f"Video rendering failed: {result.get('message', 'Unknown error')}")
        
        # Decode the MP4 video
        video_bytes = base64.b64decode(result["output_base64"])
        
        # Save to file if output path provided
        if output_path:
            Path(output_path).write_bytes(video_bytes)
            print(f"✅ Video saved to {output_path} ({result.get('frame_count', '?')} frames)")
        
        return video_bytes


def main():
    """Example usage of the rendering service client."""
    
    if len(sys.argv) < 3:
        print("Usage: python example_client.py <base_url> <blend_file> [frame_number]")
        print("\nExample:")
        print("  python example_client.py https://workspace--render-frame.modal.run scene.blend 1")
        sys.exit(1)
    
    base_url = sys.argv[1]
    blend_file = sys.argv[2]
    frame_number = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    
    if not Path(blend_file).exists():
        print(f"❌ Error: Blend file not found: {blend_file}")
        sys.exit(1)
    
    # Create client
    client = RenderingServiceClient(base_url)
    
    try:
        # Render a single frame
        output_path = f"rendered_frame_{frame_number}.png"
        client.render_frame(
            blend_file_path=blend_file,
            frame_number=frame_number,
            resolution_x=1920,
            resolution_y=1080,
            samples=128,
            output_path=output_path,
        )
        
        print(f"\n✅ Success! Frame rendered to {output_path}")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
