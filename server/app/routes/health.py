from fastapi import APIRouter
from fastapi.responses import Response

from ..services import OpenAIService, FalService

router = APIRouter(tags=["Health"])


# Silence browser auto-requests for icons
@router.get("/favicon.ico", include_in_schema=False)
@router.get("/apple-touch-icon.png", include_in_schema=False)
@router.get("/apple-touch-icon-precomposed.png", include_in_schema=False)
async def no_favicon():
    return Response(status_code=204)


@router.get("/")
async def root():
    openai_svc = OpenAIService()
    fal_svc = FalService()

    return {
        "name": "Arcki API",
        "version": "1.0.0",
        "pipeline": "Text → OpenAI Clean → DALL-E 2D → fal.ai Trellis 3D",
        "output_format": "GLB",
        "services": {
            "openai": "connected" if openai_svc.is_configured else "not configured",
            "fal_ai": "connected" if fal_svc.is_configured else "not configured"
        }
    }


@router.get("/health")
async def health_check():
    openai_svc = OpenAIService()
    fal_svc = FalService()

    return {
        "status": "healthy",
        "openai_configured": openai_svc.is_configured,
        "fal_configured": fal_svc.is_configured
    }
