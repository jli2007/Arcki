# TripoSR 3D Generation Service on Modal

This service provides GPU-powered image-to-3D mesh generation using TripoSR, deployed on Modal for scalability and cost-efficiency.

## Quick Start

### 1. Install Modal

```bash
pip install modal
```

### 2. Authenticate with Modal

```bash
modal token new
```

This will open a browser window for you to authenticate.

### 3. Serve the Service (Development)

```bash
cd /Users/jamesli/Documents/Code4/mapbox-delta
modal serve modal/triposr_service.py
```

This starts a development server with auto-reload. You'll see output like:

```
✓ Created web function generate_mesh => https://yourname--triposr-service-triposrservice-generate-mesh.modal.run
✓ Created web function health => https://yourname--triposr-service-health.modal.run
```

### 4. Deploy Permanently

Once you're happy with testing:

```bash
modal deploy modal/triposr_service.py
```

The service will stay running even after you close your terminal.

## Connecting to Your FastAPI Server

### Update Environment Variable

Copy the Modal endpoint URL and set it as an environment variable:

```bash
# In your terminal or .env file
export MODAL_ENDPOINT="https://yourname--triposr-service-triposrservice-generate-mesh.modal.run"
```

Or update it in the server code at `server/server.py`:

```python
MODAL_ENDPOINT = os.getenv(
    "MODAL_ENDPOINT",
    "https://yourname--triposr-service-triposrservice-generate-mesh.modal.run"
)
```

### Restart Your FastAPI Server

```bash
cd /Users/jamesli/Documents/Code4/mapbox-delta/server
python server.py
```

Now your local FastAPI server will proxy requests to the Modal GPU backend!

## Architecture

```
User
  ↓
Next.js Frontend (localhost:3000)
  ↓
FastAPI Server (localhost:8000)
  ↓
Modal TripoSR Service (GPU-powered, cloud)
  ↓
Returns .obj file
  ↓
Downloaded by user
```

## Features

- ✅ **GPU Acceleration**: Uses A10G GPU for fast inference
- ✅ **Auto-scaling**: Scales to 0 when idle, scales up on demand
- ✅ **Background Removal**: Automatic background removal with rembg
- ✅ **Multiple Formats**: Returns both .obj and .glb files
- ✅ **Pay-per-use**: Only pay for compute time used

## Testing

### Test via Modal's Interactive Docs

Visit the `/docs` endpoint on your Modal URL:

```
https://yourname--triposr-service-triposrservice-generate-mesh.modal.run/docs
```

### Test with cURL

```bash
# Encode an image
IMAGE_B64=$(base64 -i test.png | tr -d '\n')

# Call the API
curl -X POST "https://your-modal-url/generate_mesh" \
  -H "Content-Type: application/json" \
  -d "{
    \"image_base64\": \"$IMAGE_B64\",
    \"remove_background\": true
  }" | jq -r '.obj_base64' | base64 -d > output.obj
```

### Test with Python

```python
import requests
import base64

with open("test.png", "rb") as f:
    image_b64 = base64.b64encode(f.read()).decode()

response = requests.post(
    "https://your-modal-url/generate_mesh",
    json={
        "image_base64": image_b64,
        "remove_background": True
    }
)

result = response.json()
if result["success"]:
    obj_bytes = base64.b64decode(result["obj_base64"])
    with open("output.obj", "wb") as f:
        f.write(obj_bytes)
```

## Configuration

### GPU Type

Edit `modal/triposr_service.py`:

```python
GPU_TYPE = "A10G"  # Options: "A10G", "A100", "L4", "H100"
```

- **A10G**: Best price/performance ratio (recommended)
- **A100**: Fastest, but more expensive
- **L4**: Cheaper, slower
- **H100**: Overkill for this use case

### Idle Timeout

Control how long containers stay warm:

```python
container_idle_timeout=300  # 5 minutes (default)
```

Lower values = lower cost, but cold starts on new requests
Higher values = faster response, but higher idle cost

## Cost Estimates

Modal pricing (approximate):
- **A10G GPU**: ~$1.10/hour
- **Idle time**: Free (containers scale to 0)
- **Typical mesh generation**: 5-10 seconds on A10G

Example monthly costs:
- 100 meshes/month: ~$0.15-0.30
- 1000 meshes/month: ~$1.50-3.00
- 10000 meshes/month: ~$15-30

Compare to running locally:
- **No local GPU needed**
- **No model downloads** (1.5GB+ model stays in Modal)
- **Scales to handle traffic spikes**

## Monitoring

View logs in real-time:

```bash
modal app logs triposr-service
```

View all deployments:

```bash
modal app list
```

Stop a deployment:

```bash
modal app stop triposr-service
```

## Troubleshooting

### "Module not found" errors

Make sure you deployed with:
```bash
modal deploy modal/triposr_service.py
```

### Slow first request (cold start)

First request after idle period will be slower (5-10 seconds to start container).
Subsequent requests are fast.

### Out of memory errors

Try a larger GPU:
```python
GPU_TYPE = "A100"  # More VRAM
```

### Connection errors from FastAPI server

1. Check Modal endpoint URL is correct
2. Verify Modal service is running: `modal app list`
3. Check logs: `modal app logs triposr-service`

## Next Steps

1. **Deploy to production**: Use `modal deploy` instead of `modal serve`
2. **Add authentication**: Use Modal's built-in auth tokens
3. **Monitor usage**: Check Modal dashboard for costs and performance
4. **Optimize**: Adjust GPU type and timeout settings based on usage

## Support

- Modal docs: https://modal.com/docs
- TripoSR: https://github.com/VAST-AI-Research/TripoSR
