# ---
# cmd: ["modal", "serve", "15_3d_modeling_service/3d_rendering_service.py"]
# ---

# # 3D Modeling Rendering Service on Modal
#
# This example demonstrates how to host a fast, scalable 3D rendering service
# using Blender on Modal. It combines GPU-accelerated rendering with web endpoints
# to create a production-ready 3D modeling service.
#
# Features:
# - Single frame rendering via HTTP endpoint
# - Multi-frame/video rendering with parallel processing
# - GPU acceleration (L40S) for 10x+ faster rendering
# - Auto-scaling web endpoints
# - Lifecycle management for efficient resource usage
#
# ## Usage
#
# To serve this as a web endpoint:
# ```bash
# modal serve 15_3d_modeling_service/3d_rendering_service.py
# ```
#
# To deploy permanently:
# ```bash
# modal deploy 15_3d_modeling_service/3d_rendering_service.py
# ```
#
# Then visit the endpoint URL (shown in terminal) and add `/docs` to see the interactive API documentation.

import base64
from pathlib import Path
from typing import Optional

import modal

# Define the Modal app
app = modal.App("3d-modeling-service")

# ## Container Image Configuration
#
# Create a custom image with Blender and all necessary dependencies.
# Blender's Python API (`bpy`) requires X11 (GUI) dependencies even for headless rendering.

rendering_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("xorg", "libxkbcommon0")  # X11 dependencies for Blender
    .uv_pip_install("bpy==4.5.0", "pillow", "pydantic", "fastapi")  # Blender + web dependencies
)

# Image for video combination (lighter weight, no GPU needed)
combination_image = modal.Image.debian_slim(python_version="3.11").apt_install("ffmpeg")

# ## Configuration
#
# Toggle GPU acceleration. GPUs render >10x faster but have lower parallelism limits.

USE_GPU = True  # Set to False to scale to 100+ CPUs instead of 10 GPUs
GPU_TYPE = "L40S"  # Options: "L40S", "A10G", "H100", etc.

# ## Request/Response Models

# Import pydantic with fallback for local parsing
try:
    from pydantic import BaseModel
except ImportError:
    # If pydantic not installed locally, create a simple stub for type checking
    # The actual models will work in the container where pydantic is installed
    class BaseModel:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)


class RenderFrameRequest(BaseModel):
    """Request model for single frame rendering."""
    blend_file_base64: str  # Base64-encoded .blend file
    frame_number: int = 1  # Frame to render
    resolution_x: Optional[int] = 1920  # Output width
    resolution_y: Optional[int] = 1080  # Output height
    samples: Optional[int] = 128  # Cycles samples (higher = better quality, slower)
    use_gpu: Optional[bool] = None  # Override global GPU setting


class RenderVideoRequest(BaseModel):
    """Request model for video rendering."""
    blend_file_base64: str  # Base64-encoded .blend file
    start_frame: int = 1
    end_frame: int = 250
    frame_skip: int = 1  # Render every Nth frame
    fps: int = 24
    resolution_x: Optional[int] = 1920
    resolution_y: Optional[int] = 1080
    samples: Optional[int] = 128
    use_gpu: Optional[bool] = None


class RenderResponse(BaseModel):
    """Response model for render operations."""
    success: bool
    message: str
    output_base64: Optional[str] = None  # Base64-encoded PNG (frame) or MP4 (video)
    content_type: Optional[str] = None  # "image/png" or "video/mp4"
    frame_count: Optional[int] = None


# ## Rendering Configuration Helper

def configure_rendering(ctx, with_gpu: bool, resolution_x: int, resolution_y: int, samples: int):
    """Configure Blender's rendering settings for Cycles engine."""
    import bpy
    
    # Set rendering engine to Cycles (GPU-accelerated)
    ctx.scene.render.engine = "CYCLES"
    ctx.scene.render.resolution_x = resolution_x
    ctx.scene.render.resolution_y = resolution_y
    ctx.scene.render.resolution_percentage = 100  # Full resolution
    ctx.scene.cycles.samples = samples

    cycles = ctx.preferences.addons["cycles"]

    # Configure GPU acceleration if available
    if with_gpu:
        cycles.preferences.compute_device_type = "CUDA"
        ctx.scene.cycles.device = "GPU"
        
        # Reload devices and enable all available GPUs
        cycles.preferences.get_devices()
        for device in cycles.preferences.devices:
            device.use = True
            print(f"✅ Enabled GPU device: {device['name']} (Type: {device['type']})")
    else:
        ctx.scene.cycles.device = "CPU"
        print("⚠️ Using CPU rendering (slower but can scale to 100+ containers)")


# ## Single Frame Rendering Helper Function (Non-Modal)

def _render_frame_internal(
    blend_file_bytes: bytes,
    frame_number: int,
    resolution_x: int,
    resolution_y: int,
    samples: int,
    with_gpu: bool,
    output_path: str = "/tmp/output.png",
) -> bytes:
    """Internal helper function to render a frame. Called by both endpoints and standalone functions."""
    import bpy
    from pathlib import Path
    
    input_path = "/tmp/input.blend"

    # Write blend file to disk (Blender requires file paths)
    Path(input_path).write_bytes(blend_file_bytes)
    
    # Load the blend file
    bpy.ops.wm.open_mainfile(filepath=input_path)
    bpy.context.scene.frame_set(frame_number)
    bpy.context.scene.render.filepath = output_path
    
    # Configure rendering settings
    configure_rendering(bpy.context, with_gpu, resolution_x, resolution_y, samples)
    
    # Render the frame
    print(f"🎬 Rendering frame {frame_number} at {resolution_x}x{resolution_y} ({samples} samples)...")
    bpy.ops.render.render(write_still=True)
    
    # Read and return the rendered image
    return Path(output_path).read_bytes()


# ## Standalone Frame Rendering Function (for local_entrypoint or direct calls)

@app.function(
    gpu=GPU_TYPE if USE_GPU else None,
    max_containers=10 if USE_GPU else 100,
    image=rendering_image,
    timeout=600,  # 10 minute timeout for complex renders
)
def render_single_frame(
    blend_file_bytes: bytes,
    frame_number: int,
    resolution_x: int,
    resolution_y: int,
    samples: int,
    with_gpu: bool,
) -> bytes:
    """Render a single frame from a Blender file. Returns PNG bytes. Can be called remotely or used with .map()"""
    return _render_frame_internal(
        blend_file_bytes, frame_number, resolution_x, resolution_y, samples, with_gpu
    )


# ## Video Combination Function

@app.function(
    image=combination_image,
    timeout=300,  # 5 minute timeout
)
def combine_frames_to_video(frames_bytes: list[bytes], fps: int) -> bytes:
    """Combine multiple frame images into an MP4 video. Returns MP4 bytes."""
    import subprocess
    import tempfile
    from pathlib import Path
    
    with tempfile.TemporaryDirectory() as tmpdir:
        # Write all frames to disk
        for i, frame_bytes in enumerate(frames_bytes):
            frame_path = Path(tmpdir) / f"frame_{i:05d}.png"
            frame_path.write_bytes(frame_bytes)
        
        # Combine frames into video using ffmpeg
        out_path = Path(tmpdir) / "output.mp4"
        cmd = [
            "ffmpeg",
            "-framerate", str(fps),
            "-pattern_type", "glob",
            "-i", f"{tmpdir}/frame_*.png",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-y",  # Overwrite output file
            str(out_path)
        ]
        
        print(f"🎞️ Combining {len(frames_bytes)} frames into video at {fps} FPS...")
        subprocess.run(cmd, check=True, capture_output=True)
        
        return out_path.read_bytes()


# ## Web Endpoint: Render Single Frame

@app.function(
    gpu=GPU_TYPE if USE_GPU else None,
    image=rendering_image,
    timeout=600,
)
@modal.fastapi_endpoint(method="POST", docs=True)
def render_frame(request: RenderFrameRequest) -> RenderResponse:
    """
    Render a single frame from a Blender file.
    
    Accepts:
    - Base64-encoded .blend file
    - Frame number to render
    - Optional resolution and quality settings
    
    Returns:
    - Base64-encoded PNG image
    """
    try:
        # Decode the blend file
        blend_file_bytes = base64.b64decode(request.blend_file_base64)
        
        # Determine GPU usage (request override or global setting)
        with_gpu = request.use_gpu if request.use_gpu is not None else USE_GPU
        
        # Render the frame directly (we're already in a Modal function)
        png_bytes = _render_frame_internal(
            blend_file_bytes=blend_file_bytes,
            frame_number=request.frame_number,
            resolution_x=request.resolution_x or 1920,
            resolution_y=request.resolution_y or 1080,
            samples=request.samples or 128,
            with_gpu=with_gpu,
        )
        
        # Encode result as base64
        output_base64 = base64.b64encode(png_bytes).decode("utf-8")
        
        return RenderResponse(
            success=True,
            message=f"Successfully rendered frame {request.frame_number}",
            output_base64=output_base64,
            content_type="image/png",
        )
    
    except Exception as e:
        return RenderResponse(
            success=False,
            message=f"Error rendering frame: {str(e)}",
        )


# ## Web Endpoint: Render Video (Multiple Frames)

@app.function(
    gpu=GPU_TYPE if USE_GPU else None,
    image=rendering_image,
    timeout=1800,  # 30 minute timeout for video rendering
)
@modal.fastapi_endpoint(method="POST", docs=True)
def render_video(request: RenderVideoRequest) -> RenderResponse:
    """
    Render multiple frames and combine them into a video.
    
    Accepts:
    - Base64-encoded .blend file
    - Start/end frame numbers
    - FPS and frame skip settings
    - Optional resolution and quality settings
    
    Returns:
    - Base64-encoded MP4 video
    
    Note: This will render frames in parallel for speed.
    """
    try:
        # Decode the blend file
        blend_file_bytes = base64.b64decode(request.blend_file_base64)
        
        # Determine GPU usage
        with_gpu = request.use_gpu if request.use_gpu is not None else USE_GPU
        
        # Calculate frame range
        frames = list(range(request.start_frame, request.end_frame + 1, request.frame_skip))
        frame_count = len(frames)
        
        print(f"🎬 Starting video render: {frame_count} frames ({request.start_frame} to {request.end_frame})")
        
        # Render all frames in parallel using map (this calls the Modal function)
        render_args = [
            (
                blend_file_bytes,
                frame_num,
                request.resolution_x or 1920,
                request.resolution_y or 1080,
                request.samples or 128,
                with_gpu,
            )
            for frame_num in frames
        ]
        
        # Use the standalone Modal function for parallel rendering
        frame_images = list(render_single_frame.starmap(render_args))
        
        print(f"✅ All {frame_count} frames rendered, combining into video...")
        
        # Combine frames into video
        video_bytes = combine_frames_to_video.remote(frame_images, request.fps)
        
        # Encode result as base64
        output_base64 = base64.b64encode(video_bytes).decode("utf-8")
        
        return RenderResponse(
            success=True,
            message=f"Successfully rendered video with {frame_count} frames",
            output_base64=output_base64,
            content_type="video/mp4",
            frame_count=frame_count,
        )
    
    except Exception as e:
        return RenderResponse(
            success=False,
            message=f"Error rendering video: {str(e)}",
        )


# ## Lifecycle-Managed Service Class (Optional)
#
# For production use, you can use @app.cls() to maintain state between requests
# and avoid reloading expensive resources. This is useful if you're rendering
# the same scene repeatedly.

@app.cls(
    gpu=GPU_TYPE if USE_GPU else None,
    image=rendering_image,
    scaledown_window=300,  # Scale down after 5 minutes of inactivity
    timeout=600,
)
class CachedRenderingService:
    """Service class that can cache blend files for faster repeated renders."""
    
    @modal.enter()
    def startup(self):
        """Initialize service on container startup."""
        print("🚀 3D Rendering Service starting up...")
        self.cached_blend_file = None
        self.cached_blend_path = None
    
    @modal.fastapi_endpoint(method="POST", docs=True)
    def render_cached_frame(self, request: RenderFrameRequest) -> RenderResponse:
        """
        Render a frame with optional caching of the blend file.
        This is faster for repeated renders of the same scene.
        """
        import bpy
        from pathlib import Path
        
        try:
            # Decode blend file
            blend_file_bytes = base64.b64decode(request.blend_file_base64)
            
            # Cache the blend file if not already cached or if it's different
            if self.cached_blend_file != blend_file_bytes:
                input_path = "/tmp/cached_input.blend"
                Path(input_path).write_bytes(blend_file_bytes)
                bpy.ops.wm.open_mainfile(filepath=input_path)
                self.cached_blend_file = blend_file_bytes
                self.cached_blend_path = input_path
                print("💾 Cached blend file loaded")
            else:
                # Reopen cached file (faster than loading from scratch)
                bpy.ops.wm.open_mainfile(filepath=self.cached_blend_path)
                print("⚡ Using cached blend file")
            
            # Set frame and render (file is already loaded, so we don't reload)
            import bpy
            from pathlib import Path
            
            bpy.context.scene.frame_set(request.frame_number)
            output_path = "/tmp/cached_output.png"
            bpy.context.scene.render.filepath = output_path
            
            with_gpu = request.use_gpu if request.use_gpu is not None else USE_GPU
            configure_rendering(
                bpy.context,
                with_gpu,
                request.resolution_x or 1920,
                request.resolution_y or 1080,
                request.samples or 128,
            )
            
            bpy.ops.render.render(write_still=True)
            png_bytes = Path(output_path).read_bytes()
            output_base64 = base64.b64encode(png_bytes).decode("utf-8")
            
            return RenderResponse(
                success=True,
                message=f"Successfully rendered cached frame {request.frame_number}",
                output_base64=output_base64,
                content_type="image/png",
            )
        
        except Exception as e:
            return RenderResponse(
                success=False,
                message=f"Error rendering cached frame: {str(e)}",
            )


# ## Local Entrypoint for Testing
#
# You can also run this locally for testing without web endpoints.

@app.local_entrypoint()
def test_render_local(blend_file_path: str = "IceModal.blend", frame: int = 1):
    """Test rendering locally without web endpoints."""
    from pathlib import Path
    
    blend_path = Path(blend_file_path)
    if not blend_path.exists():
        # Try relative to this file
        blend_path = Path(__file__).parent.parent / "06_gpu_and_ml" / "blender" / "IceModal.blend"
    
    if not blend_path.exists():
        print(f"❌ Blend file not found: {blend_file_path}")
        return
    
    print(f"🧪 Testing local render of {blend_path.name} at frame {frame}")
    
    blend_bytes = blend_path.read_bytes()
    png_bytes = render_single_frame.remote(
        blend_file_bytes=blend_bytes,
        frame_number=frame,
        resolution_x=1920,
        resolution_y=1080,
        samples=128,
        with_gpu=USE_GPU,
    )
    
    output_path = Path("/tmp") / f"test_render_frame_{frame}.png"
    output_path.write_bytes(png_bytes)
    print(f"✅ Rendered frame saved to {output_path}")
