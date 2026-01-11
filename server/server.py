import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings, init_directories
from app.routes import generation_router, files_router, health_router, search_router
from app.services import OpenAIService, FalService

# Initialize app
app = FastAPI(
    title="Arcki API",
    description="AI-powered 3D architecture visualization API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health_router)
app.include_router(generation_router)
app.include_router(files_router)
app.include_router(search_router, prefix="/api")

# Initialize directories on startup
@app.on_event("startup")
async def startup():
    init_directories()


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("Arcki API Server")
    print("=" * 60)

    openai_svc = OpenAIService()
    fal_svc = FalService()

    print(f"OpenAI: {'✓ Configured' if openai_svc.is_configured else '✗ Set OPENAI_API_KEY'}")
    print(f"fal.ai: {'✓ Configured' if fal_svc.is_configured else '✗ Set FAL_KEY'}")
    print("=" * 60 + "\n")

    uvicorn.run(
        "server:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )
