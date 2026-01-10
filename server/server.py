from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import uvicorn
import os
import sys
from pathlib import Path
import PIL.Image
import torch

# Suppress OpenMP warning
os.environ['OMP_NUM_THREADS'] = '1'

# Add TripoSR to path
sys.path.insert(0, str(Path(__file__).parent / "triposr_repo"))
from tsr.system import TSR

app = FastAPI(title="TripoSR Server")

# Initialize TripoSR model
device = "cuda" if torch.cuda.is_available() else "cpu"
model = None  # Lazy load on first request

# CORS middleware to allow requests from Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create directories for uploads and outputs
UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("outputs")
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)


def load_model():
    """Load TripoSR model (lazy loading)"""
    global model
    if model is None:
        print("Loading TripoSR model...")
        model = TSR.from_pretrained(
            "stabilityai/TripoSR",
            config_name="config.yaml",
            weight_name="model.ckpt",
        )
        model.to(device)
        print(f"Model loaded on {device}")
    return model


@app.get("/")
async def root():
    return {
        "message": "TripoSR API Server",
        "status": "running",
        "version": "1.0.0",
        "device": device
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Upload an image file for processing
    """
    try:
        # Validate file type
        if not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")

        # Save uploaded file
        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        return {
            "filename": file.filename,
            "path": str(file_path),
            "size": len(content),
            "content_type": file.content_type
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-mesh")
async def generate_mesh(file: UploadFile = File(...)):
    """
    Generate 3D mesh from uploaded image using TripoSR
    """
    try:
        # Validate file type
        if not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")

        # Save uploaded file
        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # Load model (lazy loading)
        tsr_model = load_model()

        # Load and process image
        image = PIL.Image.open(file_path)

        # Remove background if image doesn't have alpha channel
        if image.mode != "RGBA":
            from rembg import remove
            image = remove(image)

        # Convert RGBA to RGB (TripoSR expects RGB)
        # Composite onto white background to preserve transparency
        if image.mode == "RGBA":
            # Create white background
            background = PIL.Image.new("RGB", image.size, (255, 255, 255))
            # Paste image with alpha as mask
            background.paste(image, mask=image.split()[3])
            image = background
        elif image.mode != "RGB":
            image = image.convert("RGB")

        # Generate 3D mesh
        print(f"Processing image: {file.filename}")
        with torch.no_grad():
            scene_codes = tsr_model([image], device=device)

        # Extract mesh
        meshes = tsr_model.extract_mesh(scene_codes, has_vertex_color=False)
        mesh = meshes[0]

        # Save mesh as .obj file
        output_filename = f"{Path(file.filename).stem}.obj"
        output_path = OUTPUT_DIR / output_filename
        mesh.export(str(output_path))

        print(f"Mesh saved to: {output_path}")

        return {
            "status": "success",
            "message": "Mesh generation completed",
            "input_file": file.filename,
            "output_file": output_filename,
            "output_path": str(output_path),
            "download_url": f"/download/{output_filename}"
        }

    except Exception as e:
        print(f"Error generating mesh: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/download/{filename}")
async def download_mesh(filename: str):
    """
    Download generated mesh file
    """
    file_path = OUTPUT_DIR / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=str(file_path),
        media_type="application/octet-stream",
        filename=filename
    )


@app.delete("/cleanup")
async def cleanup_files():
    """
    Clean up uploaded files and generated outputs
    """
    try:
        # Remove files from uploads directory
        for file in UPLOAD_DIR.glob("*"):
            if file.is_file():
                file.unlink()

        # Remove files from outputs directory
        for file in OUTPUT_DIR.glob("*"):
            if file.is_file():
                file.unlink()

        return {"status": "success", "message": "Files cleaned up"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
