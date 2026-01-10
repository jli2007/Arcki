# TripoSR API Server

Lightweight FastAPI server that proxies 3D mesh generation requests to Modal's GPU-powered TripoSR service.

## Architecture

```
User → Next.js Frontend → FastAPI Server (this) → Modal TripoSR Service (GPU) → Returns .obj file
```

This server:
- Receives image uploads from frontend
- Forwards to Modal API for GPU processing
- Returns downloadable 3D mesh files
- **No local GPU or heavy ML dependencies needed!**

## Setup

### 1. Install Dependencies

```bash
cd server

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies (lightweight!)
pip install -r requirements.txt
```

### 2. Deploy Modal Service

First, set up the Modal backend (see `../modal/TRIPOSR_README.md`):

```bash
# Install Modal
pip install modal

# Authenticate
modal token new

# Deploy the GPU service
cd ../modal
modal serve triposr_service.py
```

Copy the Modal endpoint URL you receive.

### 3. Configure Endpoint

Set the Modal endpoint URL as an environment variable:

```bash
export MODAL_ENDPOINT="https://yourname--triposr-service-triposrservice-generate-mesh.modal.run"
```

Or edit `server.py` directly and update the `MODAL_ENDPOINT` variable.

### 4. Run Server

```bash
python server.py
```

Server runs at `http://localhost:8000`

## API Endpoints

- `GET /` - Server info and health status
- `GET /health` - Health check
- `POST /upload` - Upload image file
- `POST /generate-mesh` - Generate 3D mesh from image (calls Modal)
- `GET /download/{filename}` - Download generated mesh file
- `DELETE /cleanup` - Clean up uploaded/generated files

### Interactive Docs

Visit `http://localhost:8000/docs` for Swagger UI

## Usage

```bash
# Generate mesh from image
curl -X POST "http://localhost:8000/generate-mesh" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/image.jpg"

# Response includes download URL
# Download the mesh
curl -O "http://localhost:8000/download/yourimage.obj"
```

## Requirements

- Python 3.10+ (tested on 3.14.2)
- No GPU needed (Modal handles GPU compute)
- Minimal dependencies (FastAPI + requests)

## Modal Backend

The actual 3D generation happens on Modal's infrastructure:
- **GPU**: A10G (configurable)
- **Auto-scaling**: Scales to 0 when idle
- **Pay-per-use**: Only pay for compute time
- **Fast**: 5-10 seconds per mesh on GPU

See `../modal/TRIPOSR_README.md` for Modal setup details.

## Cost

Local server: **Free** (no GPU needed)
Modal backend: **~$0.001-0.003 per mesh generation**

## Troubleshooting

**Connection errors to Modal:**
- Verify Modal service is running: `modal app list`
- Check `MODAL_ENDPOINT` is set correctly
- Check Modal logs: `modal app logs triposr-service`

**Server won't start:**
- Activate virtual environment: `source venv/bin/activate`
- Install dependencies: `pip install -r requirements.txt`
