# TripoSR API Server

FastAPI server for 3D mesh generation from single images using TripoSR.

## About TripoSR

TripoSR is a fast image-to-3D model that generates high-quality 3D meshes in ~0.5 seconds on GPU. It works well for:
- Single objects (furniture, products, toys, vehicles)
- Architecture (best with isolated buildings, clean backgrounds)
- Characters and organic shapes

## Requirements

- **Python 3.10 or 3.11** (3.14+ not supported due to package compatibility)
- **Conda** (recommended) or venv with Python 3.10
- 6GB+ GPU VRAM (recommended) or CPU fallback

## Setup

### 1. Install Miniconda

If you don't have conda installed:
```bash
# Download and install Miniconda
curl -O https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-arm64.sh
bash Miniconda3-latest-MacOSX-arm64.sh

# Restart terminal after installation
```

### 2. Create Environment

```bash
cd server

# Create conda environment with Python 3.10
conda create -n triposr python=3.10 -y
conda activate triposr

# Install PyTorch
conda install pytorch torchvision -c pytorch -y

# Install other dependencies
pip install -r requirements.txt
pip install git+https://github.com/tatsy/torchmcubes.git
pip install onnxruntime

# Clone TripoSR repository
git clone https://github.com/VAST-AI-Research/TripoSR.git triposr_repo
```

### 3. Run Server

```bash
conda activate triposr
python server.py
```

Server will start at `http://localhost:8000`

## API Endpoints

- `GET /` - Server info and health status
- `GET /health` - Health check
- `POST /upload` - Upload image file
- `POST /generate-mesh` - Generate 3D mesh from image (returns .obj file)
- `GET /download/{filename}` - Download generated mesh file
- `DELETE /cleanup` - Clean up uploaded/generated files

### Interactive Docs

Visit `http://localhost:8000/docs` for Swagger UI with interactive API testing.

## Usage

### Test with curl:

```bash
# Generate mesh from image
curl -X POST "http://localhost:8000/generate-mesh" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/your/image.jpg"

# Download generated mesh
curl -O "http://localhost:8000/download/yourimage.obj"
```

### DALL-E → TripoSR Pipeline:

1. Generate image with DALL-E (e.g., "modern building in Paris 1998 style")
2. Upload image to `/generate-mesh` endpoint
3. Download the 3D .obj file from the response URL
4. Import into Blender/Unity/etc.

## Deployment

This server is designed for Modal deployment. See `modal_deploy.py` (if exists) for deployment configuration.

For Modal:
- Python version is specified in Modal config
- Team members don't need matching Python versions locally
- Just deploy and use the API URL

## Notes

- First mesh generation downloads model weights (~1.5GB)
- Model runs on CUDA if available, otherwise CPU
- Background removal is automatic using rembg
- Best results with clean, well-lit images of isolated objects

## Troubleshooting

**Server won't start:**
- Make sure conda environment is activated: `conda activate triposr`
- Check all dependencies installed: `pip list`

**Low quality meshes:**
- Try images with better lighting
- Ensure object is isolated (clean background)
- Avoid complex scenes with multiple objects

**Out of memory:**
- Model requires ~6GB GPU VRAM
- Falls back to CPU if no GPU (slower but works)
