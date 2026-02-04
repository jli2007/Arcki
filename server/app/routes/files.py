import uuid
from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import FileResponse

from ..config import get_settings
from ..services import FalService
from ..schemas import UploadResponse

router = APIRouter(tags=["Files"])


@router.post("/upload-and-generate", response_model=UploadResponse)
async def upload_and_generate(file: UploadFile = File(...)):
    """
    Upload an image and generate 3D model directly.
    Useful for existing architectural images.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    fal_svc = FalService()
    if not fal_svc.is_configured:
        raise HTTPException(status_code=503, detail="fal.ai not configured")

    try:
        content = await file.read()
        filename = f"{uuid.uuid4().hex}_{file.filename}"

        # Upload to fal storage
        image_url = await fal_svc.upload_image(content, filename)

        # Generate 3D
        result = await fal_svc.generate_3d(image_url=image_url)

        return UploadResponse(
            status="success",
            input_file=file.filename or "unknown",
            model_url=result.model_url,
            model_file=result.file_name,
            download_url=f"/download/{result.file_name}",
            format="glb",
            generation_time=result.generation_time
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/{filename}")
async def download_mesh(filename: str):
    """Download generated GLB file."""
    settings = get_settings()
    file_path = settings.output_dir / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=str(file_path),
        media_type="model/gltf-binary",
        filename=filename,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.delete("/cleanup")
async def cleanup_files():
    """Clean up all uploaded and generated files."""
    settings = get_settings()

    try:
        for directory in [settings.output_dir, settings.cache_dir]:
            for file in directory.glob("*"):
                if file.is_file():
                    file.unlink()

        return {"status": "success", "message": "All files cleaned up"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
