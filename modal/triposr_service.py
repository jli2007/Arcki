# ---
# cmd: ["modal", "serve", "modal/triposr_service.py"]
# deploy_cmd: ["modal", "deploy", "modal/triposr_service.py"]
# ---

# # TripoSR 3D Generation Service on Modal
#
# This example demonstrates how to host a fast, scalable image-to-3D generation service
# using TripoSR on Modal. It provides GPU-accelerated 3D mesh generation from single images.
#
# Features:
# - Image-to-3D mesh generation via HTTP endpoint
# - GPU acceleration (A10G/A100) for fast inference
# - Auto-scaling web endpoints
# - Returns downloadable .obj files
#
# ## Usage
#
# To serve this as a web endpoint:
# ```bash
# modal serve modal/triposr_service.py
# ```
#
# To deploy permanently:
# ```bash
# modal deploy modal/triposr_service.py
# ```
#
# Then visit the endpoint URL (shown in terminal) and add `/docs` to see the interactive API documentation.

import base64
import io
from pathlib import Path
from typing import Optional

import modal

# Define the Modal app
app = modal.App("triposr-service")

# ## Container Image Configuration
#
# Create a custom image with TripoSR and all necessary dependencies.

triposr_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git")
    .pip_install(
        "torch>=2.0.0",
        "torchvision>=0.15.0",
        "Pillow>=10.1.0",
        "omegaconf==2.3.0",
        "einops==0.7.0",
        "transformers==4.35.0",
        "trimesh[easy]==4.0.5",
        "rembg",
        "huggingface-hub",
        "imageio[ffmpeg]",
        "xatlas==0.0.9",
        "moderngl==5.10.0",
        "fastapi",
        "pydantic",
    )
    .pip_install("git+https://github.com/tatsy/torchmcubes.git")
    .pip_install("git+https://github.com/VAST-AI-Research/TripoSR.git")
)

# ## Configuration

USE_GPU = True  # TripoSR requires GPU for reasonable performance
GPU_TYPE = "A10G"  # Options: "A10G", "A100", "L4", etc.

# ## Request/Response Models

try:
    from pydantic import BaseModel
except ImportError:
    class BaseModel:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)


class GenerateMeshRequest(BaseModel):
    """Request model for mesh generation."""
    image_base64: str  # Base64-encoded image file
    remove_background: Optional[bool] = True  # Auto-remove background
    foreground_ratio: Optional[float] = 0.85  # Foreground size ratio


class GenerateMeshResponse(BaseModel):
    """Response model for mesh generation."""
    success: bool
    message: str
    obj_base64: Optional[str] = None  # Base64-encoded .obj file
    glb_base64: Optional[str] = None  # Base64-encoded .glb file (optional)


# ## Model Loading and Initialization

@app.cls(
    gpu=GPU_TYPE if USE_GPU else None,
    image=triposr_image,
    container_idle_timeout=300,  # 5 minutes idle timeout
    timeout=600,  # 10 minute max timeout
)
class TripoSRService:
    """TripoSR service class that loads the model once and reuses it."""

    @modal.enter()
    def load_model(self):
        """Load TripoSR model on container startup."""
        import torch
        from tsr.system import TSR

        print("🚀 Loading TripoSR model...")

        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        # Load the model
        self.model = TSR.from_pretrained(
            "stabilityai/TripoSR",
            config_name="config.yaml",
            weight_name="model.ckpt",
        )
        self.model.to(self.device)

        print(f"✅ TripoSR model loaded on {self.device}")

    @modal.method()
    def generate_mesh_bytes(
        self,
        image_bytes: bytes,
        remove_background: bool = True,
        foreground_ratio: float = 0.85,
    ) -> tuple[bytes, bytes]:
        """
        Generate 3D mesh from image bytes.
        Returns tuple of (obj_bytes, glb_bytes).
        """
        import torch
        import PIL.Image
        from rembg import remove
        from pathlib import Path
        import tempfile

        # Load image
        image = PIL.Image.open(io.BytesIO(image_bytes))

        # Remove background if requested
        if remove_background and image.mode != "RGBA":
            print("🔍 Removing background...")
            image = remove(image)

        # Convert RGBA to RGB (TripoSR expects RGB)
        if image.mode == "RGBA":
            background = PIL.Image.new("RGB", image.size, (255, 255, 255))
            background.paste(image, mask=image.split()[3])
            image = background
        elif image.mode != "RGB":
            image = image.convert("RGB")

        print(f"🎨 Generating 3D mesh on {self.device}...")

        # Generate mesh
        with torch.no_grad():
            scene_codes = self.model([image], device=self.device)

        # Extract mesh
        meshes = self.model.extract_mesh(scene_codes, has_vertex_color=False)
        mesh = meshes[0]

        print("💾 Exporting mesh...")

        # Export to temporary files
        with tempfile.TemporaryDirectory() as tmpdir:
            obj_path = Path(tmpdir) / "output.obj"
            glb_path = Path(tmpdir) / "output.glb"

            # Export as OBJ
            mesh.export(str(obj_path))
            obj_bytes = obj_path.read_bytes()

            # Export as GLB (optional, for web viewing)
            try:
                mesh.export(str(glb_path))
                glb_bytes = glb_path.read_bytes()
            except Exception as e:
                print(f"⚠️ GLB export failed: {e}")
                glb_bytes = b""

        print("✅ Mesh generation complete!")
        return obj_bytes, glb_bytes

    @modal.fastapi_endpoint(method="POST", docs=True)
    def generate_mesh(self, request: GenerateMeshRequest) -> GenerateMeshResponse:
        """
        Generate 3D mesh from an uploaded image.

        Accepts:
        - Base64-encoded image file (PNG, JPG, etc.)
        - Optional background removal settings

        Returns:
        - Base64-encoded .obj file
        - Base64-encoded .glb file (for web viewing)
        """
        try:
            # Decode image
            image_bytes = base64.b64decode(request.image_base64)

            # Generate mesh
            obj_bytes, glb_bytes = self.generate_mesh_bytes(
                image_bytes=image_bytes,
                remove_background=request.remove_background,
                foreground_ratio=request.foreground_ratio,
            )

            # Encode results
            obj_base64 = base64.b64encode(obj_bytes).decode("utf-8")
            glb_base64 = base64.b64encode(glb_bytes).decode("utf-8") if glb_bytes else None

            return GenerateMeshResponse(
                success=True,
                message="Mesh generated successfully",
                obj_base64=obj_base64,
                glb_base64=glb_base64,
            )

        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            print(f"❌ Error: {error_details}")

            return GenerateMeshResponse(
                success=False,
                message=f"Error generating mesh: {str(e)}",
            )


# ## Web Endpoint: Health Check

@app.function(image=triposr_image)
@modal.fastapi_endpoint(method="GET", docs=True)
def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "TripoSR 3D Generation",
        "version": "1.0.0",
    }


# ## Local Entrypoint for Testing

@app.local_entrypoint()
def test_local(image_path: str = "test.png"):
    """Test the service locally."""
    from pathlib import Path

    image_file = Path(image_path)
    if not image_file.exists():
        print(f"❌ Image file not found: {image_path}")
        return

    print(f"🧪 Testing local generation with {image_file.name}")

    image_bytes = image_file.read_bytes()

    # Create service instance and call the method
    service = TripoSRService()
    obj_bytes, glb_bytes = service.generate_mesh_bytes.remote(
        image_bytes=image_bytes,
        remove_background=True,
    )

    # Save outputs
    output_obj = Path("/tmp") / f"test_output.obj"
    output_obj.write_bytes(obj_bytes)
    print(f"✅ OBJ file saved to {output_obj}")

    if glb_bytes:
        output_glb = Path("/tmp") / f"test_output.glb"
        output_glb.write_bytes(glb_bytes)
        print(f"✅ GLB file saved to {output_glb}")
