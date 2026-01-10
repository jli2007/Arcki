`modal run 15_3d_modeling_service/3d_rendering_service.py::test_render_local --frame 10`

# Testing the 3D Rendering Service

Quick reference guide for testing the service.

## Prerequisites

Make sure you have the required dependencies installed locally:

```bash
pip install modal pydantic
# Or if you need to use --break-system-packages:
pip install --break-system-packages modal pydantic
```

**Note:** `pydantic` is needed for Modal to parse the file locally (it's also installed in the container image automatically).

## Method 1: Quick Local Test (No Web Endpoint)

**Note:** First run will build container images (takes 2-5 minutes). Subsequent runs are much faster.

Test rendering without setting up web endpoints:

```bash
# Test rendering a single frame from the example Blender file
modal run 15_3d_modeling_service/3d_rendering_service.py::test_render_local \
  --blend-file-path 06_gpu_and_ml/blender/IceModal.blend \
  --frame 10

# Or use default path (will find IceModal.blend automatically)
modal run 15_3d_modeling_service/3d_rendering_service.py::test_render_local --frame 10
```

Output will be saved to `/tmp/test_render_frame_10.png`

## Method 2: Serve Web Endpoint (Development)

Start the service with auto-reload:

```bash
modal serve 15_3d_modeling_service/3d_rendering_service.py
```

This will output URLs like:
- `https://your-workspace--render-frame.modal.run` - Single frame endpoint
- `https://your-workspace--render-video.modal.run` - Video endpoint  
- `https://your-workspace--render-cached-frame.modal.run` - Cached service
- `https://your-workspace--render-frame.modal.run/docs` - API documentation

**Keep this terminal open** - the service will auto-reload on code changes.

## Method 3: Deploy Permanently

Deploy the service permanently (stays running after terminal closes):

```bash
modal deploy 15_3d_modeling_service/3d_rendering_service.py
```

## Method 4: Test with Python Client Script

First, get your endpoint URL from `modal serve` or `modal deploy`, then:

```bash
# Install requests if not already installed
pip install requests

# Test with the example client
python 15_3d_modeling_service/example_client.py \
  https://your-workspace--render-frame.modal.run \
  06_gpu_and_ml/blender/IceModal.blend \
  1
```

Or use the client programmatically:

```python
from example_client import RenderingServiceClient

client = RenderingServiceClient("https://your-workspace--render-frame.modal.run")

# Render a frame
client.render_frame(
    blend_file_path="06_gpu_and_ml/blender/IceModal.blend",
    frame_number=1,
    output_path="output.png"
)

# Render a video
client.render_video(
    blend_file_path="06_gpu_and_ml/blender/IceModal.blend",
    start_frame=1,
    end_frame=50,  # Short test video
    frame_skip=2,  # Every 2nd frame for faster testing
    output_path="output.mp4"
)
```

## Method 5: Test with cURL

### Render a Single Frame

```bash
# Encode the blend file to base64
BLEND_B64=$(base64 -i 06_gpu_and_ml/blender/IceModal.blend | tr -d '\n')

# Send request to render endpoint
curl -X POST "https://your-workspace--render-frame.modal.run" \
  -H "Content-Type: application/json" \
  -d "{
    \"blend_file_base64\": \"$BLEND_B64\",
    \"frame_number\": 10,
    \"resolution_x\": 1920,
    \"resolution_y\": 1080,
    \"samples\": 128
  }" > response.json

# Extract and decode the image (requires jq)
OUTPUT_B64=$(jq -r '.output_base64' response.json)
echo "$OUTPUT_B64" | base64 -d > rendered_frame.png

echo "✅ Frame saved to rendered_frame.png"
```

### Render a Video

```bash
# Encode the blend file
BLEND_B64=$(base64 -i 06_gpu_and_ml/blender/IceModal.blend | tr -d '\n')

# Render video (short test: 10 frames, skip every 2nd)
curl -X POST "https://your-workspace--render-video.modal.run" \
  -H "Content-Type: application/json" \
  -d "{
    \"blend_file_base64\": \"$BLEND_B64\",
    \"start_frame\": 1,
    \"end_frame\": 10,
    \"frame_skip\": 2,
    \"fps\": 24,
    \"resolution_x\": 1280,
    \"resolution_y\": 720,
    \"samples\": 64
  }" > video_response.json

# Extract and decode the video
OUTPUT_B64=$(jq -r '.output_base64' video_response.json)
echo "$OUTPUT_B64" | base64 -d > rendered_video.mp4

echo "✅ Video saved to rendered_video.mp4"
```

### Test with Python Requests (One-liner)

```bash
python3 -c "
import requests
import base64
import json

# Read and encode blend file
with open('06_gpu_and_ml/blender/IceModal.blend', 'rb') as f:
    blend_data = base64.b64encode(f.read()).decode('utf-8')

# Render frame
response = requests.post(
    'https://your-workspace--render-frame.modal.run',
    json={
        'blend_file_base64': blend_data,
        'frame_number': 1,
        'resolution_x': 1920,
        'resolution_y': 1080,
        'samples': 128
    }
)

result = response.json()
if result['success']:
    with open('test_output.png', 'wb') as f:
        f.write(base64.b64decode(result['output_base64']))
    print('✅ Frame saved to test_output.png')
else:
    print(f'❌ Error: {result[\"message\"]}')
"
```

## Method 6: Test via Interactive API Docs

The easiest way to test is using the built-in FastAPI docs:

1. Start the service: `modal serve 15_3d_modeling_service/3d_rendering_service.py`
2. Visit the `/docs` URL shown in the terminal output
3. Click on an endpoint (e.g., `/render_frame`)
4. Click "Try it out"
5. Upload your blend file (you'll need to encode it to base64 first, or use the example)

## Quick Test Checklist

- [ ] **Local test**: `modal run 15_3d_modeling_service/3d_rendering_service.py::test_render_local --frame 1`
- [ ] **Serve endpoint**: `modal serve 15_3d_modeling_service/3d_rendering_service.py`
- [ ] **Visit docs**: Open `/docs` URL in browser
- [ ] **Test single frame**: Use example_client.py or curl
- [ ] **Test video**: Render a short video (10-20 frames)
- [ ] **Check logs**: View rendering progress in terminal

## Troubleshooting

### "Blend file not found"
Make sure you're running from the repo root:
```bash
cd /Applications/vscode/modal-examples
```

### "Module 'bpy' not found"
This should be handled automatically by Modal. If you see this, the image build might have failed. Check Modal logs.

### Slow rendering
- First render: Image needs to be built (2-5 minutes)
- GPU allocation: First GPU container takes ~30 seconds to start
- Large files: Use lower resolution/samples for testing

### Authentication errors
If using protected endpoints, you'll need to set up proxy auth tokens. See Modal docs.

## Expected Output

Successful frame render:
- Terminal shows: `🎬 Rendering frame X at 1920x1080 (128 samples)...`
- GPU device messages if using GPU
- `✅ Successfully rendered frame X`
- PNG file created

Successful video render:
- `🎬 Starting video render: X frames...`
- Multiple frame rendering messages
- `✅ All X frames rendered, combining into video...`
- `🎞️ Combining X frames into video at 24 FPS...`
- MP4 file created
